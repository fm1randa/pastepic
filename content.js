// TabNews Paste Image — content script.
// Intercepta o paste (Cmd+V / Ctrl+V, menu, etc.) em campos de texto do
// TabNews e do curso.dev. Se o clipboard contiver imagem, cancela o paste
// normal, faz o upload via o background e insere a tag <img> (ou Markdown)
// no cursor.
//
// Detalhe importante: o editor de comentarios das duas plataformas e o
// ByteMD, que usa CodeMirror 5 por baixo (um textarea escondido gerenciado
// pelo editor, com o texto visivel fragmentado em divs nao-editaveis).
// Manipular `.value` corromperia o estado e `execCommand` com selecao no DOM
// visivel nao tem efeito nele — por isso campos CodeMirror usam a API nativa
// (replaceRange + markText para rastrear o placeholder). `execCommand` segue
// como caminho para CodeMirror 6/contenteditable comum.
(() => {
  'use strict';

  function isEditable(el) {
    if (!el) return false;
    if (el instanceof HTMLTextAreaElement) return true;
    if (el instanceof HTMLInputElement) {
      return ['text', 'search', 'url', null, ''].includes(el.type);
    }
    if (el.isContentEditable) return true;
    if (el.closest && el.closest('.cm-content')) return true;
    return false;
  }

  // Campo de texto "de verdade" (manipular .value e disparar input funciona,
  // inclusive em componentes controlados do React). Textareas dentro de
  // CodeMirror/ByteMD NAO entram aqui.
  function isPlainField(el) {
    const isField = el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement;
    if (!isField) return false;
    if (el.closest && el.closest('.CodeMirror, .bytemd, .cm-editor')) return false;
    return true;
  }

  function richRoot(el) {
    if (el && el.closest) {
      const root = el.closest('.bytemd, .CodeMirror, .cm-editor');
      if (root) return root;
    }
    return el;
  }

  function focusEl(el) {
    try {
      el.focus();
    } catch {
      /* noop */
    }
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

  // --- Caminho para textarea/input comum (com suporte a React) ---

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

  // --- Caminho CodeMirror 5 (ByteMD do TabNews/curso.dev) ---
  // O CM5 renderiza o texto fragmentado em divs nao-editaveis e edita via
  // um textarea escondido: selecao no DOM visivel + execCommand NAO funciona.
  // O correto e usar a API do proprio editor. O marcador (markText) rastreia
  // o placeholder mesmo se o usuario continuar digitando durante o upload.
  // O alvo do paste pode estar fora do `.CodeMirror` (ex.: wrapper do React):
  // por isso a busca parte da raiz do editor (`.bytemd`, `.CodeMirror` ou
  // `.cm-editor`) e so depois desce ate o wrapper — nao depende de o alvo
  // estar dentro dele.
  function getCM5(el) {
    if (!el || !el.closest) return null;
    const root = el.closest('.CodeMirror, .bytemd, .cm-editor');
    if (!root) return null;
    const wrap =
      root.classList && root.classList.contains('CodeMirror')
        ? root
        : root.querySelector && root.querySelector('.CodeMirror');
    const cm = wrap && wrap.CodeMirror;
    if (cm && typeof cm.replaceRange === 'function' && typeof cm.markText === 'function') {
      return cm;
    }
    return null;
  }

  function cmInsert(cm, text) {
    cm.focus();
    const cursor = cm.getCursor();
    cm.replaceRange(text, cursor);
    const to = { line: cursor.line, ch: cursor.ch + text.length };
    try {
      return cm.markText(cursor, to, { clearWhenEmpty: false });
    } catch {
      return null;
    }
  }

  function cmReplace(cm, marker, replacement) {
    try {
      cm.focus();
      const pos = marker && typeof marker.find === 'function' ? marker.find() : null;
      if (pos) {
        cm.replaceRange(replacement, pos.from, pos.to);
        return true;
      }
    } catch {
      /* cai no fallback */
    }
    return false;
  }

  function cmClearMarker(marker) {
    try {
      if (marker && typeof marker.clear === 'function') marker.clear();
    } catch {
      /* noop */
    }
  }

  // --- Caminho rico generico: CodeMirror 6, contenteditable ---

  function findTextNode(root, needle) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const idx = node.nodeValue.indexOf(needle);
      if (idx !== -1) return { node, idx };
    }
    return null;
  }

  function richInsert(el, text) {
    focusEl(el);
    return document.execCommand('insertText', false, text);
  }

  function richReplace(el, needle, replacement) {
    try {
      const root = richRoot(el);
      focusEl(el);
      const hit = root ? findTextNode(root, needle) : null;
      if (!hit) return false; // placeholder sumiu (usuario apagou?) — nao mexe em nada
      const range = document.createRange();
      range.setStart(hit.node, hit.idx);
      range.setEnd(hit.node, hit.idx + needle.length);
      const sel = window.getSelection();
      sel.removeAllRanges();
      // O no pode estar destacado do documento (ex.: linha virtual do
      // CodeMirror quando a instancia nao foi encontrada): nesse caso o
      // addRange lanca — propaga como falha em vez de quebrar o upload.
      sel.addRange(range);
      if (replacement === '') {
        return document.execCommand('delete', false, null);
      }
      return document.execCommand('insertText', false, replacement);
    } catch {
      return false;
    }
  }

  function insertIntoContentEditable(text) {
    try {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(text));
        range.collapse(false);
      } else {
        document.execCommand('insertText', false, text);
      }
    } catch {
      try {
        document.execCommand('insertText', false, text);
      } catch {
        /* sem mais fallbacks — quem chamou registra a falha */
        throw new Error('uninsertable');
      }
    }
  }

  function buildTag(url, format) {
    if (format === 'markdown') return `![](${url})`;
    return `<img src="${url}">`;
  }

  // Guarda final: se o background nao responder (service worker
  // encerrado, resposta perdida), nao deixa o placeholder preso.
  const RESPONSE_GUARD_MS = 180000;

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

  function clearPlaceholder(el, plain, cm, marker, placeholder) {
    if (cm) {
      if (!cmReplace(cm, marker, '')) richReplace(el, placeholder, '');
      cmClearMarker(marker);
      return;
    }
    if (plain) replaceOnce(el, placeholder, '');
    else richReplace(el, placeholder, '');
  }

  async function uploadOne(el, image, index, total) {
    const token = Math.random().toString(36).slice(2, 8);
    const suffix = total > 1 ? ` ${index + 1}/${total}` : '';
    const placeholder = `⏳ Enviando imagem${suffix}… [${token}]`;
    const plain = isPlainField(el);
    const cm = plain ? null : getCM5(el);
    let marker = null;

    if (cm) {
      try {
        marker = cmInsert(cm, placeholder);
      } catch {
        marker = null; // instancia obsoleta? segue sem marcador
      }
    } else if (plain) insertAtCursor(el, placeholder);
    else richInsert(el, placeholder);
    toast(`Enviando imagem${suffix}...`, false);

    let buffer;
    try {
      buffer = await image.arrayBuffer();
    } catch {
      clearPlaceholder(el, plain, cm, marker, placeholder);
      toast('Nao foi possivel ler a imagem do clipboard.', true);
      return;
    }

    if (buffer.byteLength > 20 * 1024 * 1024) {
      clearPlaceholder(el, plain, cm, marker, placeholder);
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
      let inserted = false;
      try {
        if (cm) {
          if (cmReplace(cm, marker, tag)) {
            inserted = true;
          } else {
            // Marcador perdido (usuario apagou o placeholder?): insere no cursor.
            try {
              cm.replaceSelection(tag);
              inserted = true;
            } catch {
              inserted = richReplace(el, placeholder, tag);
            }
          }
          cmClearMarker(marker);
        } else if (plain) {
          replaceOnce(el, placeholder, tag);
          inserted = true;
        } else {
          inserted = richReplace(el, placeholder, tag);
        }
        if (!inserted) {
          insertIntoContentEditable(tag);
          inserted = true;
        }
      } catch {
        inserted = false;
      }
      if (inserted) {
        toast(`Imagem inserida via ${resp.provider}.`, false);
      } else {
        // Upload OK mas nenhuma tecnica de insercao funcionou neste editor:
        // nao mente "sucesso" — mostra a URL para colar manualmente.
        try {
          console.error('[TabNews Paste Image] upload OK, insercao falhou. Tag:', tag);
        } catch { /* noop */ }
        toast(`Upload ok via ${resp.provider}, mas nao inseri no editor. URL: ${resp.url}`, true);
      }
    } else {
      clearPlaceholder(el, plain, cm, marker, placeholder);
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
