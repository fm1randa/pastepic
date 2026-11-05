#!/usr/bin/env node
// Drive two-editors: with two CodeMirror instances on the page, a paste in the
// SECOND one must land there. The pre-adapter code resolved the first
// `.CodeMirror` in the document and wrote into the wrong editor.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}
const PORT = arg('port', process.env.PASTEPIC_VERIFY_PORT ?? '8931');
const OUT = arg('out', 'artifacts/two-editors');
const RUN_ID = arg('run-id', 'manual');
fs.mkdirSync(OUT, { recursive: true });

const checks = [];
const check = (id, pass, detail) => { checks.push({ id, pass, detail }); if (!pass) console.error(`FAIL ${id}: ${detail}`); else console.log(`ok ${id}`); };

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/fixture-cm5.html?two=1&provider=litterbox`, { waitUntil: 'load' });

  const mounted = await page.evaluate(() => !!window.__cmOther && !!window.__cm);
  check('two-editors-mounted', mounted, 'both CodeMirror instances exist');

  const order = await page.evaluate(() => {
    const wraps = [...document.querySelectorAll('.CodeMirror')];
    return { count: wraps.length, firstIsOther: wraps[0] === window.__cmOther.getWrapperElement() };
  });
  check('other-editor-is-first', order.count === 2 && order.firstIsOther, JSON.stringify(order));

  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 8; canvas.height = 8;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#00ff00'; ctx.fillRect(0, 0, 8, 8);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'paste.png', { type: 'image/png' }));
    window.__cm.focus();
    window.__cm.getInputField().dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
  });

  await page.waitForFunction(
    () => { const t = document.getElementById('pastepic-toast'); return !!(t && /Imagem inserida via|Falha no upload/.test(t.textContent)); },
    null, { timeout: 360000 }
  ).then(() => check('upload-finished', true, 'result toast appeared'))
    .catch(() => check('upload-finished', false, 'no result toast within 6 min'));

  const state = await page.evaluate(() => ({
    target: window.__cm.getValue(),
    other: window.__cmOther.getValue(),
  }));
  fs.writeFileSync(path.join(OUT, 'editors.json'), JSON.stringify(state, null, 2));
  check('tag-in-target-editor', /<img src="https?:\/\/[^"]+">/.test(state.target), JSON.stringify(state.target.slice(0, 120)));
  check('other-editor-untouched', state.other === 'other editor text', JSON.stringify(state.other.slice(0, 80)));
  check('no-placeholder-left', !state.target.includes('⏳') && !state.other.includes('⏳'), 'no ⏳ in either editor');
  await page.screenshot({ path: path.join(OUT, 'screenshot.png') });
} finally {
  await browser.close();
}

const result = { feature: 'two-editors', runId: RUN_ID, checks, ok: checks.every((c) => c.pass) };
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2));
console.log(result.ok ? 'RESULT PASS' : 'RESULT FAIL');
process.exit(result.ok ? 0 : 1);
