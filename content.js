// PastePic — content script (ISOLATED world).
// Detects image pastes, opens an editor session, uploads through the
// background worker, and swaps the placeholder for the tag. Every piece of
// editor knowledge lives behind PastePicEditor (editor-session.js) and the
// page-world host (page-bridge.js); nothing here may touch an editor API.
(() => {
  'use strict';

  const LIMITS = globalThis.PastePicLimits || {
    autoOrder: ['catbox', 'pomf', 'uguu', 'litterbox', 'tmpfiles'],
    uploadTimeoutMs: 60000,
    guardSlackMs: 15000,
    // Empty means limits.js did not load: claim only real contenteditable
    // targets instead of guessing at editor shells.
    editorShells: '',
  };
  // Derived, never a literal: the guard must outlive the whole automatic chain
  // (plus the optional Imgur hop in front of it).
  const RESPONSE_GUARD_MS =
    LIMITS.uploadTimeoutMs * (LIMITS.autoOrder.length + 1) + LIMITS.guardSlackMs;
  const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

  function dbg(...args) {
    try {
      console.info('[PastePic]', ...args);
    } catch {
      /* noop */
    }
  }

  // Deliberately wider than detection: this only decides whether the paste is
  // ours to claim. Claiming a non-editor costs a toast; missing a real editor
  // would let the page insert raw image garbage.
  function isEditableGate(el) {
    if (!el) return false;
    if (el instanceof HTMLTextAreaElement) return true;
    if (el instanceof HTMLInputElement) {
      return ['text', 'search', 'url', null, ''].includes(el.type);
    }
    if (el.isContentEditable) return true;
    return !!(LIMITS.editorShells && el.closest && el.closest(LIMITS.editorShells));
  }

  function toast(text, isError) {
    let box = document.getElementById('pastepic-toast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'pastepic-toast';
      box.style.cssText =
        'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);' +
        'background:#111827;color:#f9fafb;font:14px/1.4 system-ui,sans-serif;' +
        'padding:10px 16px;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.35);' +
        'z-index:2147483647;max-width:80vw;text-align:center;transition:opacity .3s;' +
        'pointer-events:none;';
      document.body.appendChild(box);
    }
    box.style.background = isError ? '#991b1b' : '#111827';
    box.style.opacity = '1';
    box.textContent = text;
    clearTimeout(box.__pastepicTimer);
    box.__pastepicTimer = setTimeout(() => {
      box.style.opacity = '0';
    }, isError ? 6000 : 3500);
  }

  function buildTag(url, format) {
    if (format === 'markdown') return `![](${url})`;
    return `<img src="${url}">`;
  }

  function imagesFrom(clipboardData) {
    const images = [];
    if (!clipboardData) return images;
    if (clipboardData.files && clipboardData.files.length) {
      for (const file of clipboardData.files) {
        if (file && file.type && file.type.startsWith('image/')) images.push(file);
      }
    }
    if (!images.length && clipboardData.items && clipboardData.items.length) {
      for (const item of clipboardData.items) {
        if (item && item.type && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) images.push(file);
        }
      }
    }
    return images;
  }

  // Final guard: an MV3 service worker can be killed mid-message, and without
  // this the placeholder would stay in the editor forever.
  function sendToBackground(payload) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(value);
      };
      const timer = setTimeout(
        () => finish({ ok: false, error: 'tempo esgotado sem resposta — tente colar de novo' }),
        RESPONSE_GUARD_MS
      );
      try {
        const api = globalThis.chrome ?? globalThis.browser;
        api.runtime.sendMessage(payload, (resp) => {
          if (api.runtime.lastError) {
            finish({ ok: false, error: api.runtime.lastError.message });
            return;
          }
          finish(resp || { ok: false, error: 'sem resposta do background' });
        });
      } catch (err) {
        finish({ ok: false, error: String(err?.message || err) });
      }
    });
  }

  function openMessage(code, kind) {
    if (code === 'unsupported') {
      return `Este editor ainda nao tem suporte${kind ? ` (${kind})` : ''}. URL nao inserida.`;
    }
    if (code === 'busy') return 'Ja existe uma imagem sendo enviada. Aguarde.';
    if (code === 'bridge-down') return 'A ponte da extensao nao respondeu. Recarregue a pagina e a extensao.';
    return 'Nao consegui escrever no editor.';
  }

  async function uploadOne(session, image, index, total) {
    const token = Math.random().toString(36).slice(2, 8);
    const suffix = total > 1 ? ` ${index + 1}/${total}` : '';
    const placeholder = `⏳ Enviando imagem${suffix}… [${token}]`;

    const placed = await session.insert(placeholder);
    if (!placed.ok) {
      dbg('insert failed', { code: placed.code, kind: session.kind });
      toast('Nao consegui escrever no editor.', true);
      return;
    }
    toast(`Enviando imagem${suffix}...`, false);

    let buffer;
    try {
      buffer = await image.arrayBuffer();
    } catch {
      toast('Nao foi possivel ler a imagem do clipboard.', true);
      return;
    }
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      toast('Imagem maior que 20 MB — reduza antes de colar.', true);
      return;
    }

    const ext = (image.type.split('/')[1] || 'png').split('+')[0];
    const resp = await sendToBackground({
      type: 'PASTEPIC_UPLOAD',
      bytes: Array.from(new Uint8Array(buffer)),
      mime: image.type || 'image/png',
      name: `pastepic-${Date.now()}-${index}.${ext}`,
    });

    if (!resp.ok || !resp.url) {
      toast(`Falha no upload: ${resp.error || 'erro desconhecido'}`, true);
      return;
    }

    const tag = buildTag(resp.url, resp.format || 'html');
    const swapped = await session.swap(placeholder, tag);
    dbg('swap', { kind: session.kind, code: swapped.code, provider: resp.provider });
    if (swapped.ok) {
      toast(`Imagem inserida via ${resp.provider}.`, false);
    } else {
      // The upload succeeded even when the insertion did not: never report
      // success, hand the URL over instead.
      toast(`Upload ok via ${resp.provider}, mas nao inseri no editor. URL: ${resp.url}`, true);
    }
  }

  function onPaste(event) {
    const images = imagesFrom(event.clipboardData);
    if (!images.length) return; // text paste: leave the page alone
    if (!isEditableGate(event.target)) return;

    event.preventDefault();
    event.stopPropagation();

    (async () => {
      const opened = await PastePicEditor.open(event.target);
      if (!opened.ok) {
        dbg('open failed', { code: opened.code, kind: opened.kind });
        toast(openMessage(opened.code, opened.kind), true);
        return;
      }
      try {
        // Sequential on purpose: the cursor is shared, and each placeholder
        // must land after the previous one.
        for (let i = 0; i < images.length; i++) {
          await uploadOne(opened.session, images[i], i, images.length);
        }
      } finally {
        const released = await opened.session.release();
        if (!released.ok) {
          dbg('release failed', { code: released.code });
          toast('Nao consegui apagar o texto de envio. Apague o ⏳ manualmente.', true);
        }
      }
    })();
  }

  document.addEventListener('paste', onPaste, true);
})();
