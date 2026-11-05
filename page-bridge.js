// PastePic — page-world editor host (MAIN world).
// The only place that touches editor instances. A content script cannot see
// page-set expandos (`el.CodeMirror`, `el.cmView`, `window.monaco`), so every
// write happens here, requested over DOM events carrying JSON strings.
//
// Adapters are handles with one shape: contains / insertAtSelection /
// replaceNeedle / removeNeedle. Search lives in the adapter because a
// ProseMirror position is not a string offset; forcing one coordinate system
// on all editors would be a lossy lie.
(() => {
  if (window.__pastepicBridgeReady) return;
  window.__pastepicBridgeReady = true;

  const REQ = 'pastepic-request';
  const RES = 'pastepic-result';
  const ANCHOR = 'data-pastepic-anchor';

  // ── adapters ────────────────────────────────────────────────────────────

  function cm5Handle(root) {
    const cm = root.CodeMirror;
    if (!cm || typeof cm.replaceRange !== 'function' || typeof cm.getValue !== 'function') return null;
    const doc = () => (cm.getDoc ? cm.getDoc() : cm);
    return {
      kind: 'cm5',
      root,
      contains: (needle) => cm.getValue().includes(needle),
      insertAtSelection(text) {
        cm.focus();
        cm.replaceSelection(text);
      },
      replaceNeedle(needle, text) {
        const value = cm.getValue();
        const at = value.indexOf(needle);
        if (at === -1) return false;
        const d = doc();
        cm.focus();
        cm.replaceRange(text, d.posFromIndex(at), d.posFromIndex(at + needle.length));
        return true;
      },
    };
  }

  function plainHandle(root) {
    const isField = root instanceof HTMLTextAreaElement || root instanceof HTMLInputElement;
    if (!isField) return null;
    // CodeMirror and friends keep a hidden textarea; writing .value there
    // corrupts editor state, so a field inside an editor shell is not plain.
    if (root.closest('.CodeMirror, .bytemd, .cm-editor, .monaco-editor, .ProseMirror')) return null;
    const proto = root instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setValue = (value) => {
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(root, value);
      else root.value = value;
      root.dispatchEvent(new Event('input', { bubbles: true }));
      root.dispatchEvent(new Event('change', { bubbles: true }));
    };
    return {
      kind: 'plain',
      root,
      contains: (needle) => root.isConnected && root.value.includes(needle),
      insertAtSelection(text) {
        const start = root.selectionStart ?? root.value.length;
        const end = root.selectionEnd ?? start;
        setValue(root.value.slice(0, start) + text + root.value.slice(end));
        root.focus();
        const caret = start + text.length;
        try {
          root.setSelectionRange(caret, caret);
        } catch {
          /* some input types refuse selection */
        }
      },
      replaceNeedle(needle, text) {
        if (!root.isConnected) return false;
        const at = root.value.indexOf(needle);
        if (at === -1) return false;
        setValue(root.value.slice(0, at) + text + root.value.slice(at + needle.length));
        root.focus();
        const caret = at + text.length;
        try {
          root.setSelectionRange(caret, caret);
        } catch {
          /* noop */
        }
        return true;
      },
    };
  }

  function textNodeAt(root, needle) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const at = node.nodeValue.indexOf(needle);
      if (at !== -1) return { node, at };
    }
    return null;
  }

  function contentEditableHandle(root) {
    if (!root.isContentEditable) return null;
    if (root.closest('.CodeMirror, .cm-editor, .monaco-editor, .ProseMirror')) return null;
    const read = () => (root.isConnected ? root.innerText : '');
    return {
      kind: 'contenteditable',
      root,
      contains: (needle) => read().includes(needle),
      insertAtSelection(text) {
        root.focus();
        document.execCommand('insertText', false, text);
      },
      replaceNeedle(needle, text) {
        const hit = textNodeAt(root, needle);
        if (!hit) return false;
        try {
          const range = document.createRange();
          range.setStart(hit.node, hit.at);
          range.setEnd(hit.node, hit.at + needle.length);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          root.focus();
          if (text === '') return document.execCommand('delete', false, null);
          return document.execCommand('insertText', false, text);
        } catch {
          return false;
        }
      },
    };
  }

  // Detection order IS the fallback. A recognized shell whose instance cannot
  // be resolved reports `unsupported` instead of dropping to the adapter
  // below: writing into CodeMirror's hidden textarea or Monaco's .inputarea
  // desynchronizes the real model.
  const ADAPTERS = [
    { kind: 'monaco', selector: '.monaco-editor', handle: () => null },
    { kind: 'cm6', selector: '.cm-editor', handle: () => null },
    { kind: 'prosemirror', selector: '.ProseMirror', handle: () => null },
    { kind: 'cm5', selector: '.CodeMirror', handle: cm5Handle },
    { kind: 'plain', selector: 'textarea, input', handle: plainHandle },
    {
      kind: 'contenteditable',
      selector: '[contenteditable="true"], [contenteditable=""], [contenteditable]',
      handle: contentEditableHandle,
    },
  ];

  function detect(el) {
    if (!el || !el.closest) return null;
    for (const adapter of ADAPTERS) {
      const root = el.closest(adapter.selector);
      if (!root) continue;
      return { kind: adapter.kind, handle: adapter.handle(root) };
    }
    return null;
  }

  function byAnchor(anchor) {
    if (!anchor) return null;
    const el = document.querySelector(`[${ANCHOR}="${anchor}"]`);
    return el ? detect(el) : null;
  }

  function listOf(kind) {
    const adapter = ADAPTERS.find((a) => a.kind === kind);
    if (!adapter) return [];
    const out = [];
    for (const root of document.querySelectorAll(adapter.selector)) {
      const handle = adapter.handle(root);
      if (handle) out.push(handle);
    }
    return out;
  }

  // The anchor names the editor the user pasted into; the needle names the
  // session's own text. When a remount kills the anchor, the needle is the
  // only thing that survives, so relocation searches by content and refuses
  // to guess when more than one editor matches.
  function resolveFor(anchor, kind, needle, text) {
    const anchored = byAnchor(anchor);
    if (anchored && anchored.handle && anchored.handle.kind === kind) {
      if (anchored.handle.contains(needle)) return { handle: anchored.handle };
      if (text && anchored.handle.contains(text)) return { already: true };
    }
    const holders = listOf(kind).filter((h) => h.contains(needle));
    if (holders.length === 1) return { handle: holders[0] };
    if (holders.length > 1) return { ambiguous: true };
    if (text) {
      const swapped = listOf(kind).filter((h) => h.contains(text));
      if (swapped.length === 1) return { already: true };
    }
    return {};
  }

  // ── protocol ────────────────────────────────────────────────────────────

  function handleOp(req) {
    if (req.op === 'open') {
      const found = byAnchor(req.anchor);
      if (!found) return { ok: false, code: 'not-editable' };
      if (!found.handle) return { ok: false, code: 'unsupported', kind: found.kind };
      return { ok: true, kind: found.kind };
    }

    if (req.op === 'insert') {
      const anchored = byAnchor(req.anchor);
      const handle = anchored && anchored.handle && anchored.handle.kind === req.kind
        ? anchored.handle
        : null;
      if (!handle) return { ok: false, code: 'no-editor' };
      handle.insertAtSelection(req.text);
      return handle.contains(req.text)
        ? { ok: true, code: 'ok' }
        : { ok: false, code: 'write-failed' };
    }

    if (req.op === 'swap') {
      const found = resolveFor(req.anchor, req.kind, req.needle, req.text);
      if (found.already) return { ok: true, code: 'already-swapped' };
      if (!found.handle) return { ok: false, code: found.ambiguous ? 'ambiguous' : 'lost' };
      if (!found.handle.replaceNeedle(req.needle, req.text)) {
        return { ok: false, code: 'write-failed' };
      }
      const good = found.handle.contains(req.text) && !found.handle.contains(req.needle);
      return good ? { ok: true, code: 'ok' } : { ok: false, code: 'write-failed' };
    }

    if (req.op === 'withdraw') {
      const anchored = byAnchor(req.anchor);
      let handle = anchored && anchored.handle && anchored.handle.kind === req.kind
        ? anchored.handle
        : null;
      if (!handle || !handle.contains(req.needle)) {
        const holders = listOf(req.kind).filter((h) => h.contains(req.needle));
        if (holders.length === 0) return { ok: true, code: 'already-gone' };
        if (holders.length === 1) handle = holders[0];
        else return { ok: false, code: 'still-there' };
      }
      handle.replaceNeedle(req.needle, '');
      return handle.contains(req.needle)
        ? { ok: false, code: 'still-there' }
        : { ok: true, code: 'removed' };
    }

    return { ok: false, code: 'unknown-op' };
  }

  document.addEventListener(
    REQ,
    (ev) => {
      let req;
      try {
        req = JSON.parse(ev.detail);
      } catch {
        return;
      }
      if (!req || typeof req.id !== 'string') return;
      let payload;
      try {
        payload = handleOp(req);
      } catch (err) {
        payload = { ok: false, code: 'host-error', detail: String((err && err.message) || err) };
      }
      try {
        document.dispatchEvent(
          new CustomEvent(RES, { detail: JSON.stringify({ id: req.id, ...payload }) })
        );
      } catch {
        /* noop */
      }
    },
    true
  );
})();
