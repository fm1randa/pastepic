#!/usr/bin/env node
// Doctor (read-only): answers "is this instance worth driving?" before any
// drive run. Checks the fixture server we started, the real extension files it
// serves, and the Playwright browser binary. Never launches a browser.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.dirname(here);
const EXT_ROOT = path.resolve(SKILL_DIR, '..', '..', '..');
const PORT = process.env.PASTEPIC_VERIFY_PORT ?? '8931';

const checks = [];
const check = (id, pass, detail) => { checks.push({ id, pass }); console.log(`doctor: ${id} ... ${pass ? 'ok' : 'FAIL'}${detail ? ` (${detail})` : ''}`); };

function get(pathname) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: Number(PORT), path: pathname, timeout: 5000 }, (res) => {
      let n = 0;
      res.on('data', (c) => { n += c.length; });
      res.on('end', () => resolve({ status: res.statusCode, bytes: n }));
    });
    req.on('error', (e) => resolve({ status: -1, bytes: 0, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: -1, bytes: 0, error: 'timeout' }); });
  });
}

const routes = ['/health', '/fixture-cm5.html', '/codemirror/lib/codemirror.js', '/codemirror/lib/codemirror.css', '/ext/content.js', '/ext/background.js', '/ext/page-bridge.js', '/ext/editor-session.js', '/ext/limits.js', '/popup-test.html'];
for (const r of routes) {
  const res = await get(r);
  check(`route ${r}`, res.status === 200 && res.bytes > 0, `HTTP ${res.status}${res.error ? ` ${res.error}` : ''}`);
}

for (const f of ['content.js', 'background.js', 'popup.js', 'page-bridge.js', 'editor-session.js', 'limits.js', 'manifest.json']) {
  const exists = fs.existsSync(path.join(EXT_ROOT, f));
  check(`ext-file ${f}`, exists, exists ? '' : 'missing from repo root');
}
for (const f of ['content.js', 'background.js', 'popup.js', 'page-bridge.js', 'editor-session.js', 'limits.js']) {
  const r = spawnSync('node', ['--check', path.join(EXT_ROOT, f)]);
  check(`syntax ${f}`, r.status === 0, r.status === 0 ? '' : 'node --check failed');
}

const browsers = [path.join(os.homedir(), 'Library/Caches/ms-playwright'), path.join(os.homedir(), '.cache/ms-playwright')];
check('chromium-binary', browsers.some((d) => fs.existsSync(d) && fs.readdirSync(d).some((e) => e.startsWith('chromium'))), browsers.join(' / '));

const ok = checks.every((c) => c.pass);
console.log(ok ? 'DOCTOR PASS' : 'DOCTOR FAIL');
process.exit(ok ? 0 : 1);
