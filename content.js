// TabNews Paste Image — content script.
// Intercepta o paste (Cmd+V / Ctrl+V, menu, etc.) em campos de texto do
// TabNews. Se o clipboard contiver imagem, cancela o paste normal, faz o
// upload via o background e insere a tag <img> (ou Markdown) no cursor.
(() => {
  'use strict';

  const UPLOADING_LABEL = 'Enviando imagem...';

  function isEditable(el) {
    if (!el) return false;
    if (el instanceof HTMLTextAreaElement) return true;
    if (el instanceof HTMLInputElement) {
      return ['text', 'search', 'url', null, ''].includes(el.type);
    }
    if (el.isContentEditable) return true;
    return false;
  }

  function toast(text, isError) {
    let box = document.getElementById('tnpi-toast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'tnpi-toast';
      box.style.cssText =
        'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);' +
        'background:#111827;color:#f9fafb;font:14px/1.4 system-ui,sans-serif;' +
        'padding:10px 16px;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.35);' +
        'z-index:2147483647;max-width:80vw;text-align:center;transition:opacity .3s;';
      document.body.appendChild(box);
    }
    box.style.background = isError ? '#991b1b' : '#111827';
    box.style.opacity = '1';
    box.textContent = text;
    clearTimeout(box.__tnpiTimer);
    box.__tnpiTimer = setTimeout(() => {
      box.style.opacity = '0';
    }, isError ? 6000 : 3500);
  }

  // Insere texto na posicao do cursor funcionando com componentes
  // controlados do React (caso do editor do TabNews).
  function setTextareaValue(el, value) {
    const proto =
      el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function insertAtCursor(el, text) {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const next = el.value.slice(0, start) + text + el.value.slice(end);
    setTextareaValue(el, next);
    const pos = start + text.length;
    try {
      el.setSelectionRange(pos, pos);
    } catch {
      /* noop */
    }
    el.focus();
  }

  function replaceOnce(el, needle, replacement) {
    const idx = el.value.indexOf(needle);
    if (idx === -1) {
      insertAtCursor(el, replacement + '\n');
      return;
    }
    const next = el.value.slice(0, idx) + replacement + el.value.slice(idx + needle.length);
    setTextareaValue(el, next);
    const pos = idx + replacement.length;
    try {
      el.setSelectionRange(pos, pos);
    } catch {
      /* noop */
    }
    el.focus();
  }

  function insertIntoContentEditable(text) {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
      range.collapse(false);
    } else {
      document.execCommand('insertText', false, text);
    }
  }

  function replaceInContentEditable(root, needle, replacement) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const idx = node.nodeValue.indexOf(needle);
      if (idx !== -1) {
        node.nodeValue =
          node.nodeValue.slice(0, idx) + replacement + node.nodeValue.slice(idx + needle.length);
        return true;
      }
    }
    return false;
  }

  function buildTag(url, format) {
    if (format === 'markdown') return `![](${url})`;
    return `<img src="${url}">`;
  }

  function sendToBackground(payload) {
    return new Promise((resolve) => {
      try {
        const api = globalThis.chrome ?? globalThis.browser;
        api.runtime.sendMessage(payload, (resp) => {
          if (api.runtime.lastError) {
            resolve({ ok: false, error: api.runtime.lastError.message });
            return;
          }
          resolve(resp || { ok: false, error: 'sem resposta do background' });
        });
      } catch (err) {
        resolve({ ok: false, error: String(err?.message || err) });
      }
    });
  }

  async function uploadOne(el, image, index, total) {
    const suffix = total > 1 ? ` ${index + 1}/${total}` : '';
    const placeholder = `⏳ ${UPLOADING_LABEL}${suffix}`;
    const useTextarea =
      el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement;

    if (useTextarea) insertAtCursor(el, placeholder);
    else insertIntoContentEditable(placeholder);
    toast(`Enviando imagem${suffix}...`, false);

    let buffer;
    try {
      buffer = await image.arrayBuffer();
    } catch {
      if (useTextarea) replaceOnce(el, placeholder, '');
      toast('Nao foi possivel ler a imagem do clipboard.', true);
      return;
    }

    if (buffer.byteLength > 20 * 1024 * 1024) {
      if (useTextarea) replaceOnce(el, placeholder, '');
      toast('Imagem maior que 20 MB — reduza antes de colar.', true);
      return;
    }

    const ext = (image.type.split('/')[1] || 'png').split('+')[0];
    const resp = await sendToBackground({
      type: 'TNPI_UPLOAD',
      bytes: Array.from(new Uint8Array(buffer)),
      mime: image.type || 'image/png',
      name: `tabnews-${Date.now()}-${index}.${ext}`,
    });

    if (resp.ok && resp.url) {
      const tag = buildTag(resp.url, resp.format || 'html');
      if (useTextarea) replaceOnce(el, placeholder, tag);
      else if (!replaceInContentEditable(el, placeholder, tag)) insertIntoContentEditable(tag);
      toast(`Imagem inserida via ${resp.provider}.`, false);
    } else {
      if (useTextarea) replaceOnce(el, placeholder, '');
      else replaceInContentEditable(el, placeholder, '');
      toast(`Falha no upload: ${resp.error || 'erro desconhecido'}`, true);
    }
  }

  function onPaste(event) {
    const el = event.target;
    if (!isEditable(el)) return;
    const cd = event.clipboardData;
    if (!cd) return;

    const images = [];
    if (cd.files && cd.files.length) {
      for (const f of cd.files) {
        if (f && f.type && f.type.startsWith('image/')) images.push(f);
      }
    }
    if (!images.length && cd.items && cd.items.length) {
      for (const item of cd.items) {
        if (item && item.type && item.type.startsWith('image/')) {
          const f = item.getAsFile();
          if (f) images.push(f);
        }
      }
    }
    if (!images.length) return; // paste de texto: segue o fluxo normal

    event.preventDefault();
    event.stopPropagation();
    (async () => {
      for (let i = 0; i < images.length; i++) {
        // eslint-disable-next-line no-await-in-loop
        await uploadOne(el, images[i], i, images.length);
      }
    })();
  }

  document.addEventListener('paste', onPaste, true);
})();
