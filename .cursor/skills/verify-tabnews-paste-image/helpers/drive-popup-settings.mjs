#!/usr/bin/env node
// Drive provider-format-settings: the REAL popup.html DOM + REAL popup.js
// against an in-memory chrome.storage stub (injected by /popup-test.html).
// Proves provider/format choices persist and the "Salvo!" feedback appears.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}
const PORT = arg('port', process.env.TNPI_VERIFY_PORT ?? '8931');
const OUT = arg('out', 'artifacts/provider-format-settings');
const RUN_ID = arg('run-id', 'manual');
fs.mkdirSync(OUT, { recursive: true });

const checks = [];
const check = (id, pass, detail) => { checks.push({ id, pass, detail }); if (!pass) console.error(`FAIL ${id}: ${detail}`); else console.log(`ok ${id}`); };

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/popup-test.html`, { waitUntil: 'load' });
  const defaults = await page.evaluate(() => ({
    provider: document.getElementById('provider').value,
    htmlChecked: document.querySelector('input[name="format"][value="html"]').checked,
  }));
  check('defaults-loaded', defaults.provider === 'auto' && defaults.htmlChecked, JSON.stringify(defaults));

  await page.selectOption('#provider', 'pomf');
  await page.check('input[name="format"][value="markdown"]');
  await page.click('#save');
  await page.waitForFunction(
    () => document.getElementById('status').textContent.includes('Salvo!'),
    null, { timeout: 5000 }
  ).then(() => check('saved-feedback', true, '"Salvo!" shown'))
    .catch(() => check('saved-feedback', false, 'no "Salvo!" within 5s'));
  const saved = await page.evaluate(() => window.__tnpiSaved);
  check('settings-persisted',
    saved && saved.provider === 'pomf' && saved.format === 'markdown' && saved.imgurClientId === '',
    JSON.stringify(saved));
  await page.screenshot({ path: path.join(OUT, 'screenshot.png') });
} finally {
  await browser.close();
}

const result = { feature: 'provider-format-settings', runId: RUN_ID, checks, ok: checks.every((c) => c.pass) };
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2));
console.log(result.ok ? 'RESULT PASS' : 'RESULT FAIL');
process.exit(result.ok ? 0 : 1);
