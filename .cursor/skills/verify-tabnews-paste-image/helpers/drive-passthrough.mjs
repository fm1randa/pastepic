#!/usr/bin/env node
// Drive paste-text-passthrough: text paste must be ignored by the extension.
// NOTE: synthetic (untrusted) paste events perform no default insertion, so
// there is no inserted text to observe. Proof = the extension did NOT prevent
// the event, showed no toast, sent no upload, and left the field untouched.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}
const PORT = arg('port', process.env.TNPI_VERIFY_PORT ?? '8931');
const OUT = arg('out', 'artifacts/paste-text-passthrough');
const RUN_ID = arg('run-id', 'manual');
fs.mkdirSync(OUT, { recursive: true });

const checks = [];
const check = (id, pass, detail) => { checks.push({ id, pass, detail }); if (!pass) console.error(`FAIL ${id}: ${detail}`); else console.log(`ok ${id}`); };

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/fixture-cm5.html`, { waitUntil: 'load' });
  const r = await page.evaluate(() => {
    const el = document.getElementById('plain');
    el.focus();
    el.value = 'draft ';
    el.setSelectionRange(6, 6);
    const dt = new DataTransfer();
    dt.setData('text/plain', 'hello');
    const ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt });
    el.dispatchEvent(ev);
    return {
      defaultPrevented: ev.defaultPrevented,
      value: el.value,
      uploads: window.__tnpiUploads.length,
      toast: !!document.getElementById('tnpi-toast'),
    };
  });
  check('not-prevented', r.defaultPrevented === false, 'text paste event not cancelled');
  check('field-untouched', r.value === 'draft ', `value still ${JSON.stringify(r.value)}`);
  check('no-upload', r.uploads === 0, 'background never called');
  check('no-toast', r.toast === false, 'no toast shown');
  await page.screenshot({ path: path.join(OUT, 'screenshot.png') });
} finally {
  await browser.close();
}

const result = { feature: 'paste-text-passthrough', runId: RUN_ID, checks, ok: checks.every((c) => c.pass) };
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2));
console.log(result.ok ? 'RESULT PASS' : 'RESULT FAIL');
process.exit(result.ok ? 0 : 1);
