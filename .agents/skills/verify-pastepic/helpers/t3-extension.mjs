#!/usr/bin/env node
// T3 — the REAL extension, loaded from disk, against a virtualised network.
// Chrome still believes it is talking to tabnews.com.br and catbox.moe; only
// DNS is redirected to this process. No chrome.* stub, no test manifest.
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..', '..', '..');
const PORT = Number(process.env.PASTEPIC_T3_PORT ?? 8932);

const SITE_HOSTS = ['www.tabnews.com.br', 'tabnews.com.br', 'curso.dev', 'www.curso.dev'];
const UPLOAD_HOSTS = ['catbox.moe', 'pomf.lain.la', 'uguu.se', 'litterbox.catbox.moe', 'tmpfiles.org', 'api.imgur.com'];

// ── the fake internet ────────────────────────────────────────────────────
const log = [];
const behaviour = { catbox: 'ok' };

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>tabnews</title>
<link rel="stylesheet" href="/cm/codemirror.css">
<script src="/cm/codemirror.js"></script></head>
<body><textarea id="editor"></textarea>
<script>
window.__fixtureNonce = 'NONCE-1234';
window.__cm = CodeMirror.fromTextArea(document.getElementById('editor'), {});
window.__cm.setValue('');
</script></body></html>`;

function handle(req, res) {
  const host = (req.headers.host || '').split(':')[0];
  log.push({ host, url: req.url, method: req.method });

  if (SITE_HOSTS.includes(host)) {
    if (req.url.startsWith('/cm/codemirror.js')) {
      return send(res, 200, fs.readFileSync(path.join(here, 'node_modules', 'codemirror', 'lib', 'codemirror.js')), 'text/javascript');
    }
    if (req.url.startsWith('/cm/codemirror.css')) {
      return send(res, 200, fs.readFileSync(path.join(here, 'node_modules', 'codemirror', 'lib', 'codemirror.css')), 'text/css');
    }
    return send(res, 200, PAGE, 'text/html');
  }

  if (UPLOAD_HOSTS.includes(host)) {
    if (behaviour.catbox === 'hold') return; // never answer: exercises the timeout
    if (behaviour.catbox === 'fail') return send(res, 503, 'down', 'text/plain');
    const body = host === 'api.imgur.com'
      ? JSON.stringify({ success: true, data: { link: `https://${host}/i/ok.png` } })
      : host === 'pomf.lain.la'
        ? JSON.stringify({ success: true, files: [{ url: `https://${host}/f/ok.png` }] })
        : host === 'uguu.se'
          ? JSON.stringify({ files: [{ url: `https://${host}/f/ok.png` }] })
          : host === 'tmpfiles.org'
            ? JSON.stringify({ data: { url: `https://${host}/123/ok.png` } })
            : `https://${host}/ok.png`;
    return send(res, 200, body, 'application/json');
  }

  send(res, 404, 'unknown host', 'text/plain');
}

function send(res, status, body, type) {
  // Deliberately NO access-control-allow-origin: the page must be blocked by
  // CORS, which is what proves the upload came from the worker's host_permissions.
  res.writeHead(status, { 'content-type': type });
  res.end(body);
}

// Self-signed cert for the virtualised hosts; generated on first run and never
// committed (it is a private key, even if it only guards localhost).
const certDir = path.join(here, 'certs');
if (!fs.existsSync(path.join(certDir, 'cert.pem'))) {
  fs.mkdirSync(certDir, { recursive: true });
  const hosts = [...SITE_HOSTS, ...UPLOAD_HOSTS].map((h) => `DNS:${h}`).join(',');
  spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', path.join(certDir, 'key.pem'), '-out', path.join(certDir, 'cert.pem'),
    '-days', '365', '-subj', '/CN=tabnews.com.br', '-addext', `subjectAltName=${hosts}`]);
}

const server = https.createServer(
  {
    key: fs.readFileSync(path.join(certDir, 'key.pem')),
    cert: fs.readFileSync(path.join(certDir, 'cert.pem')),
  },
  handle
);
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

// ── the real extension ───────────────────────────────────────────────────
const EXT = process.env.PASTEPIC_T3_EXT ? path.resolve(process.env.PASTEPIC_T3_EXT) : ROOT;
const rules = [...SITE_HOSTS, ...UPLOAD_HOSTS].map((h) => `MAP ${h} 127.0.0.1:${PORT}`).join(', ');

const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  args: [
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    `--host-resolver-rules=${rules}`,
    '--ignore-certificate-errors',
  ],
});

const checks = [];
const check = (id, pass, detail = '') => {
  checks.push({ id, pass, detail });
  console.log(`${pass ? 'ok' : 'FAIL'} ${id}${detail ? ` — ${detail}` : ''}`);
};

try {
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 10000 }).catch(() => null);
  check('extension-loaded', !!sw, sw ? sw.url() : 'no service worker');

  // Pin the provider so the run is deterministic and a permission mutant is
  // observable instead of being masked by the automatic fallback chain.
  if (sw) await sw.evaluate(() => chrome.storage.sync.set({ provider: 'catbox', format: 'html', imgurClientId: '' }));

  const page = await context.newPage();
  await page.goto('https://www.tabnews.com.br/', { waitUntil: 'load' });
  const nonce = await page.evaluate(() => window.__fixtureNonce);
  check('dns-virtualised', nonce === 'NONCE-1234', `fixture nonce ${nonce}`);

  // The content script must be present in the ISOLATED world, invisible here.
  const isolatedInvisible = await page.evaluate(() => typeof window.PastePicEditor);
  check('isolated-world-opaque', isolatedInvisible === 'undefined', `page sees PastePicEditor=${isolatedInvisible}`);

  const pasteImage = () => page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 8; canvas.height = 8;
    canvas.getContext('2d').fillRect(0, 0, 8, 8);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'p.png', { type: 'image/png' }));
    window.__cm.focus();
    window.__cm.getInputField().dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
  });
  await pasteImage();

  await page.waitForFunction(
    () => {
      const t = document.getElementById('pastepic-toast');
      return !!(t && /Imagem inserida via|mas nao inseri|Falha no upload|Nao consegui/.test(t.textContent));
    },
    null, { timeout: 30000 }
  ).then(() => check('result-toast', true, 'a terminal toast appeared'))
    .catch(() => check('result-toast', false, 'no terminal toast in 30s'));

  const value = await page.evaluate(() => window.__cm.getValue());
  check('tag-inserted', /<img src="https:\/\/[^"]+">/.test(value), JSON.stringify(value.slice(0, 120)));

  const uploads = log.filter((e) => UPLOAD_HOSTS.includes(e.host) && e.method === 'POST');
  check('upload-hit-fake-host', uploads.length > 0, `${uploads.length} POST(s) to ${uploads.map((u) => u.host).join(',')}`);

  // The same image pasted again must reuse the stored link: no new POST.
  await pasteImage();
  const reusedToast = await page.waitForFunction(
    () => /link reaproveitado/.test(document.getElementById('pastepic-toast')?.textContent || ''),
    null, { timeout: 30000 }
  ).then(() => true, () => false);
  const tags = (await page.evaluate(() => window.__cm.getValue())).match(/<img src="https:\/\/[^"]+">/g) || [];
  const postsAfter = log.filter((e) => UPLOAD_HOSTS.includes(e.host) && e.method === 'POST').length;
  check(
    'reuse-same-image',
    reusedToast && tags.length === 2 && tags[0] === tags[1] && postsAfter === uploads.length,
    `toast=${reusedToast} tags=${tags.length} posts ${uploads.length}->${postsAfter}`
  );

  // CORS canary: the page must NOT be able to reach the upload host, which is
  // what proves the worker used host_permissions rather than page privileges.
  const pageFetch = await page.evaluate(async () => {
    try {
      const r = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: 'x' });
      return `resolved ${r.status}`;
    } catch (e) {
      return `blocked ${e.name}`;
    }
  });
  check('cors-canary', pageFetch.startsWith('blocked'), pageFetch);

  // Chrome injects its own body font into extension pages; only a loaded extension shows it.
  if (sw) {
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${new URL(sw.url()).host}/dist/popup/index.html`);
    await popup.getByRole('button', { name: 'Salvar' }).waitFor({ timeout: 5000 });
    const fonts = await popup.evaluate(async () => {
      await document.fonts.ready;
      const loaded = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family);
      return { body: getComputedStyle(document.body).fontFamily, loaded };
    });
    check('popup-fonts-in-extension',
      fonts.body.startsWith('"Space Grotesk') && ['Silkscreen', 'Space Grotesk Variable'].every((f) => fonts.loaded.includes(f)),
      JSON.stringify(fonts));
  }
} finally {
  await context.close();
  server.close();
}

const failed = checks.filter((c) => !c.pass);
console.log(failed.length ? `\nT3 FAIL (${failed.length}/${checks.length})` : `\nT3 PASS (${checks.length} checks)`);
process.exit(failed.length ? 1 : 0);
