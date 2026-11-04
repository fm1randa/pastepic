// PastePic — page-world bridge.
// Roda no mundo da PAGINA (manifest: "world": "MAIN"). Necessario porque um
// content script comum roda num mundo isolado: ele ve os elementos do DOM,
// mas NAO ve propriedades JS que a pagina criou neles — em particular
// `elemento.CodeMirror`, que e onde o ByteMD guarda a instancia do editor.
// Por isso a manipulacao do editor acontece aqui, sob pedido do content.js,
// que fala com este script por eventos DOM com payload JSON (string).
(() => {
  if (window.__pastepicBridgeReady) return;
  window.__pastepicBridgeReady = true;

  const REQ = 'pastepic-cm-request';
  const RES = 'pastepic-cm-result';

  function findCM() {
    let wraps;
    try {
      wraps = document.querySelectorAll('.CodeMirror');
    } catch {
      return null;
    }
    for (const w of wraps) {
      const cm = w && w.CodeMirror;
      if (cm && typeof cm.replaceRange === 'function' && typeof cm.getValue === 'function') {
        return cm;
      }
    }
    return null;
  }

  function indexToPos(cm, idx) {
    const doc = cm.getDoc ? cm.getDoc() : cm;
    if (typeof cm.posFromIndex === 'function') return cm.posFromIndex(idx);
    if (doc && typeof doc.posFromIndex === 'function') return doc.posFromIndex(idx);
    throw new Error('posFromIndex indisponivel');
  }

  function onRequest(ev) {
    let req;
    try {
      req = JSON.parse(ev.detail);
    } catch {
      return;
    }
    if (!req || typeof req.id !== 'string') return;

    const reply = (payload) => {
      try {
        document.dispatchEvent(new CustomEvent(RES, { detail: JSON.stringify({ id: req.id, ...payload }) }));
      } catch {
        /* noop */
      }
    };

    try {
      const cm = findCM();
      if (!cm) {
        reply({ ok: false, error: 'no-cm' });
        return;
      }

      if (req.op === 'probe') {
        reply({ ok: true, value: cm.getValue() });
        return;
      }

      if (req.op === 'insert') {
        cm.focus();
        const cur = cm.getCursor();
        cm.replaceRange(req.text, cur);
        try {
          cm.markText(cur, { line: cur.line, ch: cur.ch + req.text.length }, { clearWhenEmpty: false });
        } catch {
          /* marcador e opcional: a troca usa busca textual */
        }
        reply({ ok: true, value: cm.getValue() });
        return;
      }

      if (req.op === 'replace' || req.op === 'delete') {
        const val = cm.getValue();
        const idx = val.indexOf(req.needle);
        if (idx === -1) {
          reply({ ok: false, error: 'needle-missing', value: val });
          return;
        }
        const from = indexToPos(cm, idx);
        const to = indexToPos(cm, idx + req.needle.length);
        cm.replaceRange(req.op === 'delete' ? '' : req.text, from, to);
        reply({ ok: true, value: cm.getValue() });
        return;
      }

      reply({ ok: false, error: 'op-desconhecida' });
    } catch (err) {
      reply({ ok: false, error: String((err && err.message) || err) });
    }
  }

  document.addEventListener(REQ, onRequest, true);
})();
