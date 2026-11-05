#!/usr/bin/env node
// Drive oversize-guard: a >20MB image must be rejected locally with an error
// toast, no placeholder left behind, and no upload attempted. No network needed.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}
const PORT = arg('port', process.env.PASTEPIC_VERIFY_PORT ?? '8931');
const OUT = arg('out', 'artifacts/oversize-guard');
const RUN_ID = arg('run-id', 'manual');
fs.mkdirSync(OUT, { recursive: true });

const checks = [];
const check = (id, pass, detail) => { checks.push({ id, pass, detail }); if (!pass) console.error(`FAIL ${id}: ${detail}`); else console.log(`ok ${id}`); };

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/fixture-cm5.html`, { waitUntil: 'load' });
  await page.evaluate(() => {
    const bytes = new Uint8Array(21 * 1024 * 1024); // 21 MB > 20 MB limit
    const file = new File([bytes], 'big.png', { type: 'image/png' });
    const dt = new DataTransfer();
    dt.items.add(file);
    // The placeholder lives for milliseconds (insert, size check, withdraw), so
    // polling cannot see it. A change listener records that it existed.
    window.__sawPlaceholder = false;
    window.__cm.on('change', () => {
      if (window.__cm.getValue().includes('⏳')) window.__sawPlaceholder = true;
    });
    window.__cm.focus();
    window.__cm.getInputField().dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
  });
  await page.waitForFunction(
    () => document.getElementById('pastepic-toast') && document.getElementById('pastepic-toast').textContent.includes('maior que 20 MB'),
    null, { timeout: 10000 }
  ).then(() => check('error-toast', true, 'size error shown'))
    .catch(() => check('error-toast', false, 'no size-error toast within 10s'));
  const st = await page.evaluate(() => ({
    value: window.__cm.getValue(),
    uploads: window.__pastepicUploads.length,
    sawPlaceholder: window.__sawPlaceholder === true,
  }));
  // v2 inserts before the size check, so cleanup depends on session.release().
  // Without this, editor-clean would pass even if nothing had been inserted.
  check('placeholder-shown', st.sawPlaceholder, 'placeholder inserted before the size check');
  check('editor-clean', !st.value.includes('⏳') && !st.value.includes('<img'), `editor value ${JSON.stringify(st.value.slice(0, 80))}`);
  check('no-upload', st.uploads === 0, 'rejected before any upload');
  await page.screenshot({ path: path.join(OUT, 'screenshot.png') });
} finally {
  await browser.close();
}

const result = { feature: 'oversize-guard', runId: RUN_ID, checks, ok: checks.every((c) => c.pass) };
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2));
console.log(result.ok ? 'RESULT PASS' : 'RESULT FAIL');
process.exit(result.ok ? 0 : 1);
