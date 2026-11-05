// PastePic — editor session client (ISOLATED world).
// The only editor API the content script sees. Everything about worlds,
// detection, retry and readback lives behind this surface; callers never learn
// which editor they are writing to.

(() => {
  'use strict';

  const REQ = 'pastepic-request';
  const RES = 'pastepic-result';
  const ANCHOR = 'data-pastepic-anchor';
  const OP_TIMEOUT_MS = 5000;
  const OPEN_TIMEOUT_MS = 2000;
  const SWAP_BUDGET_MS = 15000;
  const SWAP_STEP_MS = 250;

  function bridgeCall(op, payload, timeoutMs) {
    return new Promise((resolve) => {
      const id = `pastepic-${Math.random().toString(36).slice(2)}`;
      let settled = false;
      const done = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        document.removeEventListener(RES, onResult, true);
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
      const timer = setTimeout(() => done({ ok: false, code: 'bridge-down' }), timeoutMs);
      document.addEventListener(RES, onResult, true);
      try {
        document.dispatchEvent(
          new CustomEvent(REQ, { detail: JSON.stringify({ id, op, ...payload }) })
        );
      } catch {
        done({ ok: false, code: 'bridge-down' });
      }
    });
  }

  // One paste session at a time per page: the cursor is a shared resource and
  // two concurrent sessions would interleave their placeholders.
  let busy = false;

  /**
   * @param {Element} target Element that received the paste.
   * @returns {Promise<{ok: true, session: Session} | {ok: false, code: string, kind?: string}>}
   */
  async function open(target) {
    if (busy) return { ok: false, code: 'busy' };
    if (!target || typeof target.setAttribute !== 'function') return { ok: false, code: 'not-editable' };

    busy = true;
    const anchor = `pp${Math.random().toString(36).slice(2, 10)}`;
    target.setAttribute(ANCHOR, anchor);

    const res = await bridgeCall('open', { anchor }, OPEN_TIMEOUT_MS);
    if (!res || !res.ok) {
      target.removeAttribute(ANCHOR);
      busy = false;
      return { ok: false, code: (res && res.code) || 'bridge-down', kind: res && res.kind };
    }

    const kind = res.kind;
    let pending = null; // placeholder currently sitting in the document

    const session = {
      kind,

      async insert(text) {
        // Never stack placeholders: drop a leftover one before writing.
        if (pending) {
          await bridgeCall('withdraw', { anchor, kind, needle: pending }, OP_TIMEOUT_MS);
          pending = null;
        }
        const r = await bridgeCall('insert', { anchor, kind, text }, OP_TIMEOUT_MS);
        const ok = !!(r && r.ok);
        if (ok) pending = text;
        return { ok, code: (r && r.code) || 'bridge-down' };
      },

      async swap(needle, text) {
        const deadline = Date.now() + SWAP_BUDGET_MS;
        let last = { ok: false, code: 'bridge-down' };
        for (;;) {
          last = await bridgeCall('swap', { anchor, kind, needle, text }, OP_TIMEOUT_MS);
          if (last && (last.ok || last.code !== 'lost')) break;
          if (Date.now() >= deadline) break;
          await new Promise((r) => setTimeout(r, SWAP_STEP_MS));
        }
        const ok = !!(last && last.ok);
        if (ok) pending = null;
        return { ok, code: (last && last.code) || 'bridge-down' };
      },

      async release() {
        busy = false;
        const needle = pending;
        pending = null;
        try {
          target.removeAttribute(ANCHOR);
        } catch {
          /* target may be gone; the anchor attribute died with it */
        }
        if (!needle) return { ok: true, code: 'idle' };
        const r = await bridgeCall('withdraw', { anchor, kind, needle }, OP_TIMEOUT_MS);
        if (r && r.ok) return { ok: true, code: 'removed' };
        return { ok: false, code: (r && r.code) || 'bridge-down' };
      },
    };

    return { ok: true, session };
  }

  globalThis.PastePicEditor = { open };
})();
