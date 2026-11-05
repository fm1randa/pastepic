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
const PORT = arg('port', process.env.PASTEPIC_VERIFY_PORT ?? '8931');
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

  // Botao "i": explicacao do Imgur comeca oculta e alterna por clique.
  const helpStart = await page.evaluate(() => ({
    hidden: document.getElementById('imgurHelpText').hidden,
    expanded: document.getElementById('imgurHelp').getAttribute('aria-expanded'),
  }));
  check('imgur-help-hidden', helpStart.hidden === true && helpStart.expanded === 'false', JSON.stringify(helpStart));
  await page.click('#imgurHelp');
  const helpOpen = await page.evaluate(() => ({
    hidden: document.getElementById('imgurHelpText').hidden,
    expanded: document.getElementById('imgurHelp').getAttribute('aria-expanded'),
    mentionsClosed: document.getElementById('imgurHelpText').textContent.includes('fechou novos registros'),
  }));
  check('imgur-help-opens', helpOpen.hidden === false && helpOpen.expanded === 'true' && helpOpen.mentionsClosed, JSON.stringify({ ...helpOpen, mentionsClosed: undefined }));
  await page.click('#imgurHelp');
  const helpClosed = await page.evaluate(() => document.getElementById('imgurHelpText').hidden);
  check('imgur-help-closes', helpClosed === true, `hidden=${helpClosed}`);

  const reuseStart = await page.evaluate(() => ({
    checked: document.getElementById('sameProviderOnly').checked,
    hidden: document.getElementById('reuseHelpText').hidden,
  }));
  check('reuse-option-off-by-default', reuseStart.checked === false && reuseStart.hidden === true, JSON.stringify(reuseStart));
  await page.click('#reuseHelp');
  const reuseHelp = await page.evaluate(() => ({
    hidden: document.getElementById('reuseHelpText').hidden,
    expanded: document.getElementById('reuseHelp').getAttribute('aria-expanded'),
    imgurStillHidden: document.getElementById('imgurHelpText').hidden,
  }));
  check('reuse-help-opens', reuseHelp.hidden === false && reuseHelp.expanded === 'true' && reuseHelp.imgurStillHidden, JSON.stringify(reuseHelp));

  await page.selectOption('#provider', 'pomf');
  await page.check('#sameProviderOnly');
  await page.check('input[name="format"][value="markdown"]');
  await page.click('#save');
  await page.waitForFunction(
    () => document.getElementById('status').textContent.includes('Salvo!'),
    null, { timeout: 5000 }
  ).then(() => check('saved-feedback', true, '"Salvo!" shown'))
    .catch(() => check('saved-feedback', false, 'no "Salvo!" within 5s'));
  const saved = await page.evaluate(() => window.__pastepicSaved);
  check('settings-persisted',
    saved && saved.provider === 'pomf' && saved.format === 'markdown' && saved.imgurClientId === '' && saved.sameProviderOnly === true,
    JSON.stringify(saved));
  await page.screenshot({ path: path.join(OUT, 'screenshot.png') });
} finally {
  await browser.close();
}

const result = { feature: 'provider-format-settings', runId: RUN_ID, checks, ok: checks.every((c) => c.pass) };
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2));
console.log(result.ok ? 'RESULT PASS' : 'RESULT FAIL');
process.exit(result.ok ? 0 : 1);
