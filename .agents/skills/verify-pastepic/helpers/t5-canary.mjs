#!/usr/bin/env node
// T5 — live canary. Proves the real uploaders still work today.
// Non-blocking by default: host availability is environment health, not code
// correctness. Use --require <n> in release mode to demand healthy providers.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..', '..', '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'background.js'), 'utf8');

const requireIdx = process.argv.indexOf('--require');
const REQUIRED = requireIdx === -1 ? 0 : Number(process.argv[requireIdx + 1]);

const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const limits = vm.runInNewContext(
  `${fs.readFileSync(path.join(ROOT, 'limits.js'), 'utf8')}; PastePicLimits`
);

const ctx = {
  // background.js logs the full provider error; keep the canary output readable.
  console: { log: console.log, warn: () => {}, error: () => {} },
  setTimeout,
  clearTimeout,
  Blob,
  File,
  FormData,
  URL,
  Uint8Array,
  AbortController,
  AbortSignal,
  atob,
  btoa,
  fetch,
  PastePicLimits: limits,
  chrome: { storage: { sync: { get: (defaults, cb) => cb(defaults) } } },
};
vm.createContext(ctx);
vm.runInContext(SOURCE, ctx);

const rows = [];
for (const provider of limits.autoOrder) {
  const started = Date.now();
  const result = await ctx.__pastepic.handleUpload({
    b64: PNG_B64,
    mime: 'image/png',
    name: 'pastepic-canary.png',
    provider,
  });
  const ms = Date.now() - started;
  const raw = String(result.error).replace(/\s+/g, ' ').trim();
  const head = raw.split('<')[0].trim() || raw;
  const clean = result.ok ? null : head.slice(0, 90);
  rows.push({ provider, ok: !!result.ok, url: result.url || null, ms, error: clean });
  console.log(`${result.ok ? 'ok' : 'FAIL'} ${provider.padEnd(10)} ${result.ok ? result.url : clean} (${ms}ms)`);
}

const healthy = rows.filter((r) => r.ok).length;
console.log(`\nT5 canary: ${healthy}/${rows.length} providers healthy`);
fs.writeFileSync(path.join(here, '..', 'artifacts', 't5-canary.json'), JSON.stringify({ at: new Date().toISOString(), healthy, rows }, null, 2));

if (REQUIRED && healthy < REQUIRED) {
  console.log(`T5 FAIL (requires ${REQUIRED} healthy, got ${healthy})`);
  process.exit(1);
}
console.log('T5 OK (non-blocking)');
