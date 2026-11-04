// PastePic — content script.
// Intercepts image pastes (Cmd+V / Ctrl+V, menu, etc.), uploads them through
// the background worker, and inserts the resulting tag at the cursor. Text
// pastes fall through untouched.
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

  // CodeMirror keeps a hidden textarea; writing .value corrupts its state, so
  // fields inside an editor wrapper are never treated as plain inputs.
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
    let box = document.getElementById('pastepic-toast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'pastepic-toast';
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
    clearTimeout(box.__pastepicTimer);
    box.__pastepicTimer = setTimeout(() => {
      box.style.opacity = '0';
    }, isError ? 6000 : 3500);
  }

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

  function dbg(...args) {
    try {
      console.info('[PastePic]', ...args);
    } catch {
      /* noop */
    }
  }

  // --- Bridge to the page world (page-bridge.js) ---
  // Content scripts run in an isolated world: they see the DOM but not JS
  // properties the page set on elements, and ByteMD stores the editor
  // instance as `element.CodeMirror`. Without the bridge the native editor
  // API is unreachable and only the lossy DOM fallbacks remain.
  const BRIDGE_REQ = 'pastepic-cm-request';
  const BRIDGE_RES = 'pastepic-cm-result';

  function bridgeCall(op, payload, timeoutMs) {
    return new Promise((resolve) => {
      const id = `pastepic-${Math.random().toString(36).slice(2)}`;
      let settled = false;
      const done = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        document.removeEventListener(BRIDGE_RES, onResult, true);
        resolve(value);
      };
      const onResult = (ev) => {
        let data;
        try {
          data = JSON.parse(ev.detail);
        } catch {
          return;
        }
        if (!data || data.id !== id) return;
        done(data);
      };
      const timer = setTimeout(() => done({ ok: false, error: 'bridge-timeout' }), timeoutMs || 3000);
      document.addEventListener(BRIDGE_RES, onResult, true);
      try {
        document.dispatchEvent(
          new CustomEvent(BRIDGE_REQ, { detail: JSON.stringify({ id, op, ...payload }) })
        );
      } catch (err) {
        done({ ok: false, error: String(err?.message || err) });
      }
    });
  }

  // The React editor remounts during the upload, so the instance can vanish
  // for seconds: poll instead of giving up on the first miss.
  async function bridgeReplace(needle, replacement, totalMs) {
    const deadline = Date.now() + (totalMs || 15000);
    let last = { ok: false, error: 'sem tentativa' };
    while (Date.now() < deadline) {
      // eslint-disable-next-line no-await-in-loop
      last = await bridgeCall('replace', { needle, text: replacement }, 3000);
      if (last.ok) return last;
      if (last.error === 'needle-missing') return last;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 250));
    }
    return last;
  }

  // The paste target can sit outside the `.CodeMirror` wrapper (React
  // ancestors), so lookup starts at the editor root and descends.
  function getCM5(el) {
    if (!el || !el.closest) return null;
    const root = el.closest('.CodeMirror, .bytemd, .cm-editor');
    if (!root) return null;
    return cmFromRoot(root);
  }

  function cmFromRoot(root) {
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

  // After a remount the captured wrapper is dead: fall back to any live
  // `.CodeMirror` in the document.
  function getLiveCM(el) {
    const fromTarget = getCM5(el);
    if (fromTarget) return { cm: fromTarget, same: true };
    const wraps = document.querySelectorAll('.CodeMirror');
    for (const w of wraps) {
      const cm = w && w.CodeMirror;
      if (cm && typeof cm.replaceRange === 'function' && typeof cm.getValue === 'function') {
        return { cm, same: false };
      }
    }
    return { cm: null, same: false };
  }

  function getLiveCMWait(el, timeoutMs) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const tick = () => {
        let live;
        try {
          live = getLiveCM(el);
        } catch {
          live = { cm: null, same: false };
        }
        if (live.cm || Date.now() - t0 > timeoutMs) {
          resolve(live.cm);
          return;
        }
        setTimeout(tick, 250);
      };
      tick();
    });
  }

  // Text search instead of the marker: the marker dies on remount and on
  // controlled-state rewrites, this does not.
  function cmFindAndReplace(cm, needle, replacement) {
    try {
      const val = cm.getValue();
      const idx = val.indexOf(needle);
      if (idx === -1) return false;
      const doc = cm.getDoc ? cm.getDoc() : cm;
      const from = doc.posFromIndex(idx);
      const to = doc.posFromIndex(idx + needle.length);
      cm.replaceRange(replacement, from, to);
      return true;
    } catch {
      return false;
    }
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
      /* falls through to the text-search path */
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
      if (!hit) return false;
      const range = document.createRange();
      range.setStart(hit.node, hit.idx);
      range.setEnd(hit.node, hit.idx + needle.length);
      const sel = window.getSelection();
      sel.removeAllRanges();
      // CodeMirror's virtual line can already be detached from the document,
      // and addRange throws then: surface it as failure, never crash the upload.
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
        throw new Error('uninsertable');
      }
    }
  }

  function buildTag(url, format) {
    if (format === 'markdown') return `![](${url})`;
    return `<img src="${url}">`;
  }

  // Final guard: an MV3 service worker can be killed mid-message, and without
  // this the placeholder would stay in the editor forever.
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

  function clearPlaceholder(el, plain, bridge, cm, marker, placeholder) {
    if (bridge) {
      bridgeCall('delete', { needle: placeholder }, 3000).catch(() => {});
      return;
    }
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

    let bridge = false;    if (!plain) {
      const probe = await bridgeCall('probe', {}, 3000);
      if (probe && probe.ok) {
        const ins = await bridgeCall('insert', { text: placeholder }, 5000);
        bridge = !!(ins && ins.ok);
      }
    }
    const cm = !plain && !bridge ? getCM5(el) : null;
    let marker = null;
    if (!bridge) {
      if (cm) {
        try {
          marker = cmInsert(cm, placeholder);
        } catch {
          marker = null;
        }
      } else if (plain) insertAtCursor(el, placeholder);
      else richInsert(el, placeholder);
    }
    try {
      const root = el && el.closest ? el.closest('.CodeMirror, .bytemd, .cm-editor') : null;
      dbg('paste', {
        target: el ? `${el.tagName}.${el.className}`.slice(0, 80) : String(el),
        root: root ? `${root.tagName}.${root.className}`.slice(0, 80) : null,
        plain,
        bridge,
        cmFound: !!cm,
        marker: !!marker,
      });
    } catch { /* noop */ }
    toast(`Enviando imagem${suffix}...`, false);

    let buffer;
    try {
      buffer = await image.arrayBuffer();
    } catch {
      clearPlaceholder(el, plain, bridge, cm, marker, placeholder);
      toast('Nao foi possivel ler a imagem do clipboard.', true);
      return;
    }

    if (buffer.byteLength > 20 * 1024 * 1024) {
      clearPlaceholder(el, plain, bridge, cm, marker, placeholder);
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

    if (resp.ok && resp.url) {
      const tag = buildTag(resp.url, resp.format || 'html');
      let inserted = false;
      let how = 'none';
      try {
        if (bridge) {
          const swapped = await bridgeReplace(placeholder, tag, 15000);
          if (swapped && swapped.ok) {
            inserted = true;
            how = 'bridge-textsearch';
          } else if (swapped && swapped.error === 'needle-missing') {
            // The placeholder is gone (remount lost it): insert the tag at the
            // cursor rather than leaving the upload orphaned.
            const ins = await bridgeCall('insert', { text: tag }, 5000);
            inserted = !!(ins && ins.ok);
            how = inserted ? 'bridge-insert' : 'bridge-insert-failed';
          } else {
            how = `bridge-${swapped ? swapped.error : 'no-result'}`;
          }
        }
        if (!inserted) {
          const target = (await getLiveCMWait(el, 3000)) || cm;
          if (target && cmFindAndReplace(target, placeholder, tag)) {
            inserted = true;
            how += '+cm-textsearch';
          } else if (plain) {
            replaceOnce(el, placeholder, tag);
            inserted = true;
            how += '+plain';
          } else if (richReplace(el, placeholder, tag)) {
            inserted = true;
            how += '+rich';
          }
        }
        if (!inserted && !plain && !bridge) {
          insertIntoContentEditable(tag);
          inserted = true;
          how = 'contenteditable-append';
        }
        // Never claim success from the pre-upload instance: re-read live text.
        if (inserted && how !== 'plain') {
          const check = await bridgeCall('probe', {}, 2000);
          if (check && check.ok && typeof check.value === 'string' && !check.value.includes(tag)) {
            inserted = false;
            how += '+unverified';
          }
        }
      } catch {
        inserted = false;
        how += '+threw';
      }
      dbg('replace', { how, inserted, bridge, cmAtPaste: !!cm, provider: resp.provider });
      if (inserted) {
        toast(`Imagem inserida via ${resp.provider}.`, false);
      } else {
        // Upload succeeded but no insertion technique worked: never report
        // success, hand the URL over instead.
        try {
          console.error('[PastePic] upload OK, insercao falhou. Tag:', tag);
        } catch { /* noop */ }
        toast(`Upload ok via ${resp.provider}, mas nao inseri no editor. URL: ${resp.url}`, true);
      }
    } else {
      clearPlaceholder(el, plain, bridge, cm, marker, placeholder);
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
    if (!images.length) return;

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
