#!/usr/bin/env node
// Verification scaffolding (NOT part of the extension): serves a fixture page
// that reproduces the real editor stack (CodeMirror 5, same major version the
// ByteMD editor of TabNews/curso.dev uses) together with the REAL
// content.js and background.js from the repo root, plus a chrome.storage stub
// so the upload chain can run for real over the network.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.dirname(here);
const EXT_ROOT = path.resolve(SKILL_DIR, '..', '..', '..');
const CM_ROOT = path.join(here, 'node_modules', 'codemirror');

const args = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const PORT = Number(args[portIdx + 1] ?? process.env.PASTEPIC_VERIFY_PORT ?? 8931);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };

function send(res, status, body, type) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, { 'content-type': type, 'content-length': buf.length });
  res.end(buf);
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, 'not found', 'text/plain');
    send(res, 200, data, MIME[path.extname(filePath)] ?? 'application/octet-stream');
  });
}

// popup.html is served with a chrome.storage stub injected BEFORE popup.js
// (scaffolding only: the DOM and popup.js are the real files).
function servePopupTest(res) {
  fs.readFile(path.join(EXT_ROOT, 'popup.html'), 'utf8', (err, html) => {
    if (err) return send(res, 404, 'popup.html missing', 'text/plain');
    const stub = `<script>
window.__pastepicSaved = null;
window.chrome = { storage: { sync: {
  get(defaults, cb) { cb(Object.assign({}, defaults)); },
  set(items, cb) { window.__pastepicSaved = items; if (cb) cb(); }
} } };
</scr` + `ipt>`;
    html = html.replace('<script src="popup.js"></script>', `${stub}<script src="/ext/popup.js"></script>`);
    send(res, 200, html, MIME['.html']);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const p = url.pathname;
  if (p === '/health') return send(res, 200, '{"ok":true}', MIME['.json']);
  if (p === '/fixture-cm5.html') return serveFile(res, path.join(here, 'fixture-cm5.html'));
  if (p === '/fixture-contract.html') return serveFile(res, path.join(here, 'fixture-contract.html'));
  if (p === '/fixture-client.html') return serveFile(res, path.join(here, 'fixture-client.html'));
  if (p === '/popup-test.html') return servePopupTest(res);
  if (p.startsWith('/codemirror/')) return serveFile(res, path.join(CM_ROOT, p.slice('/codemirror/'.length)));
  if (p.startsWith('/ext/')) {
    const name = p.slice('/ext/'.length);
    if (!['content.js', 'background.js', 'popup.js', 'page-bridge.js', 'editor-session.js', 'limits.js'].includes(name)) return send(res, 403, 'forbidden', 'text/plain');
    return serveFile(res, path.join(EXT_ROOT, name));
  }
  send(res, 404, 'not found', 'text/plain');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`PASTEPIC-FIXTURE-READY port=${PORT}`);
});
