#!/usr/bin/env node
// Drive paste-image-cm5: dispatches a REAL paste event carrying a PNG file on a
// REAL CodeMirror 5 instance through the REAL content.js + REAL background.js
// upload chain (real network). Proves the user-visible end state: an <img> tag
// with a URL that actually serves the image.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}
const PORT = arg('port', process.env.PASTEPIC_VERIFY_PORT ?? '8931');
const PROVIDER = arg('provider', 'auto');
const FORMAT = arg('format', 'html');
const OUT = arg('out', 'artifacts/paste-image-cm5');
const RUN_ID = arg('run-id', 'manual');
let usedProvider = 'unknown';
fs.mkdirSync(OUT, { recursive: true });

const checks = [];
const check = (id, pass, detail) => { checks.push({ id, pass, detail }); if (!pass) console.error(`FAIL ${id}: ${detail}`); else console.log(`ok ${id}`); };

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  await page.goto(`http://127.0.0.1:${PORT}/fixture-cm5.html?provider=${PROVIDER}&format=${FORMAT}`, { waitUntil: 'load' });
  const cmVersion = await page.evaluate(() => window.__cm ? CodeMirror.version : null);
  check('cm5-present', cmVersion && cmVersion.startsWith('5.'), `CodeMirror ${cmVersion}`);

  // Build a real PNG in-page and dispatch a real ClipboardEvent paste.
  const dispatched = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 8; canvas.height = 8;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 8, 8);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    const file = new File([blob], 'paste.png', { type: 'image/png' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt });
    const clipboardSurvived = !!(ev.clipboardData && ev.clipboardData.files && ev.clipboardData.files.length === 1);
    window.__cm.focus();
    window.__cm.getInputField().dispatchEvent(ev);
    return { clipboardSurvived, defaultPrevented: ev.defaultPrevented };
  });
  check('paste-dispatched', dispatched.clipboardSurvived, 'synthetic ClipboardEvent keeps clipboardData in this Chromium');
  check('paste-intercepted', dispatched.defaultPrevented === true, 'content.js preventDefault on image paste');

  await page.waitForFunction(() => window.__cm.getValue().includes('⏳'), null, { timeout: 5000 })
    .then(() => check('placeholder-shown', true, 'placeholder inserted via CM5 API'))
    .catch(() => check('placeholder-shown', false, 'no placeholder within 5s'));

  // Terminal toast for any path: success, upload failure, upload-ok/insert-failed,
  // and insert failure. Missing the last two turns a real bug into a 6-minute wait.
  const toastArrived = await page.waitForFunction(
    () => {
      const t = document.getElementById('pastepic-toast');
      return !!(t && /Imagem inserida via|Falha no upload|mas nao inseri no editor|Nao consegui escrever no editor/.test(t.textContent));
    },
    null, { timeout: 360000 }
  ).then(() => true).catch(() => false);
  const toastText = toastArrived
    ? await page.evaluate(() => document.getElementById('pastepic-toast').textContent)
    : null;
  check('success-toast', !!toastText && toastText.includes('Imagem inserida via'), toastText ?? 'no result toast within 6 min');
  usedProvider = (toastText && toastText.match(/via (\w+)/)?.[1]) || 'unknown';

  const value = await page.evaluate(() => window.__cm.getValue());
  fs.writeFileSync(path.join(OUT, 'editor.txt'), value);
  const m = FORMAT === 'markdown' ? value.match(/!\[\]\((https?:\/\/\S+?)\)/) : value.match(/<img src="(https?:\/\/[^"]+)">/);
  check('tag-inserted', !!m, FORMAT === 'markdown' ? 'Markdown image tag present' : '<img> tag present');
  check('placeholder-gone', !value.includes('⏳'), 'placeholder replaced, not left behind');

  if (m) {
    const url = m[1];
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
      const ct = res.headers.get('content-type') ?? '';
      check('url-serves-image', res.ok && ct.startsWith('image/'), `${url} -> HTTP ${res.status} ${ct}`);
    } catch (e) { check('url-serves-image', false, `${url} fetch failed: ${e.message}`); }
  }

  // Page-context fetches to the upload hosts fail with CORS errors for every
  // provider that answers without ACAO headers — expected scaffolding noise
  // (in production the upload runs in the background service worker under
  // host_permissions, with no CORS involved). Only unexpected errors fail.
  const UPLOAD_HOSTS = ['catbox.moe', 'pomf.lain.la', 'uguu.se', 'tmpfiles.org', 'api.imgur.com'];
  const unexpected = consoleErrors.filter(
    (e) => !UPLOAD_HOSTS.some((h) => e.includes(h)) && !/CORS policy|Failed to load resource|ERR_FAILED/.test(e));
  check('no-page-errors', unexpected.length === 0, unexpected.join(' | ').slice(0, 500) || 'clean console (upload-host CORS noise filtered)');
  await page.screenshot({ path: path.join(OUT, 'screenshot.png') });
} finally {
  await browser.close();
}

const result = { feature: 'paste-image-cm5', runId: RUN_ID, provider: PROVIDER, usedProvider, format: FORMAT, checks, ok: checks.every((c) => c.pass) };
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2));
console.log(result.ok ? 'RESULT PASS' : 'RESULT FAIL');
process.exit(result.ok ? 0 : 1);
