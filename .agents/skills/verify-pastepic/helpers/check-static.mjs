#!/usr/bin/env node
// T0 — static checks. No browser, no network, no dependencies.
// Proves structural coherence: manifest wiring, permission coverage, world
// fences, MV3 limits and package contents. Proves no runtime behavior.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.dirname(here);
const ROOT = path.resolve(SKILL_DIR, '..', '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(ROOT, f));

const checks = [];
const check = (id, pass, detail = '') => {
  checks.push({ id, pass, detail });
  console.log(`${pass ? 'ok' : 'FAIL'} ${id}${detail ? ` — ${detail}` : ''}`);
};

const manifest = JSON.parse(read('manifest.json'));
const isolated = manifest.content_scripts.find((c) => c.world !== 'MAIN');
const main = manifest.content_scripts.find((c) => c.world === 'MAIN');

// ── manifest wiring ──────────────────────────────────────────────────────
check('manifest-worlds', !!isolated && !!main, `isolated=${!!isolated} main=${!!main}`);
check('bridge-entry-main-world', main && main.js.length === 1 && main.js[0] === 'page-bridge.js', JSON.stringify(main && main.js));
check(
  'isolated-order',
  isolated && JSON.stringify(isolated.js) === JSON.stringify(['limits.js', 'editor-session.js', 'content.js']),
  JSON.stringify(isolated && isolated.js)
);
check(
  'matches-identical',
  isolated && main && JSON.stringify(isolated.matches) === JSON.stringify(main.matches),
  'the two matches lists must stay in sync'
);

const referenced = new Set([
  ...(manifest.content_scripts || []).flatMap((c) => c.js),
  ...Object.values(manifest.icons || {}),
  ...Object.values((manifest.action && manifest.action.default_icon) || {}),
  manifest.background.service_worker,
  manifest.action.default_popup,
]);
const popupEntry = manifest.action.default_popup;
const popupDir = path.posix.dirname(popupEntry);
for (const file of [...referenced].sort()) {
  check(`file-exists ${file}`, exists(file), file === popupEntry && !exists(file) ? 'popup not built; run npm run build' : '');
}

// ── built popup (MV3 CSP: no inline or remote scripts) ──────────────────
const listFiles = (dir) =>
  fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listFiles(`${dir}/${e.name}`) : [`${dir}/${e.name}`]
  );
const popupFiles = exists(popupEntry) ? listFiles(popupDir) : [];
if (exists(popupEntry)) {
  const html = read(popupEntry);
  const inline = [...html.matchAll(/<script\b([^>]*)>/g)].filter((m) => !/\bsrc=/.test(m[1]));
  check('popup-no-inline-script', inline.length === 0, inline.length ? `${inline.length} inline <script>` : '');
  const remote = [...html.matchAll(/(?:src|href)="(https?:)?\/\/[^"]+"/g)].map((m) => m[0]);
  check('popup-no-remote-urls', remote.length === 0, remote.join(', '));
  const missing = [...html.matchAll(/(?:src|href)="\.\/([^"]+)"/g)].map((m) => `${popupDir}/${m[1]}`).filter((f) => !exists(f));
  check('popup-assets-exist', missing.length === 0, missing.length ? `missing: ${missing.join(', ')}` : `${popupFiles.length} files`);
}
for (const file of [...referenced].filter((f) => f.endsWith('.js')).sort()) {
  const r = spawnSync('node', ['--check', path.join(ROOT, file)]);
  check(`syntax ${file}`, r.status === 0, r.status === 0 ? '' : String(r.stderr).slice(0, 160));
}

// ── permissions vs code ──────────────────────────────────────────────────
const bg = read('background.js');
const fetched = [...bg.matchAll(/fetchT\(\s*['"`](https:\/\/[^'"`/]+)/g)].map((m) => m[1]);
const hosts = (manifest.host_permissions || []).map((p) => p.replace(/\/\*$/, '').replace('https://', ''));
const unused = hosts.filter((h) => !fetched.some((u) => u.includes(h)));
const uncovered = fetched.filter((u) => !hosts.some((h) => u.includes(h)));
check('host-permissions-used', unused.length === 0, unused.length ? `unused: ${unused.join(', ')}` : '');
check('host-permissions-cover-fetches', uncovered.length === 0, uncovered.length ? `uncovered: ${uncovered.join(', ')}` : '');

// Permission drift has a store cost, so it needs an explicit snapshot update.
const snapshotPath = path.join(here, 'manifest.snapshot.json');
const snapshot = {
  permissions: manifest.permissions,
  host_permissions: manifest.host_permissions,
  matches: isolated ? isolated.matches : [],
};
const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
if (!fs.existsSync(snapshotPath)) {
  fs.writeFileSync(snapshotPath, serialized);
  check('permissions-snapshot', true, 'created (review the diff before committing)');
} else {
  check('permissions-snapshot', fs.readFileSync(snapshotPath, 'utf8') === serialized, 'permissions changed; update helpers/manifest.snapshot.json deliberately');
}

// ── world fences ─────────────────────────────────────────────────────────
const EDITOR_APIS = /CodeMirror|cmView|cmTile|pmViewDesc|monaco|execCommand|replaceRange/;
for (const file of ['content.js', 'editor-session.js']) {
  const hit = read(file).split('\n').findIndex((l) => EDITOR_APIS.test(l) && !l.trim().startsWith('//'));
  check(`fence isolated/${file}`, hit === -1, hit === -1 ? '' : `editor API at line ${hit + 1}`);
}
const bridge = read('page-bridge.js');
const bridgeHit = bridge.split('\n').findIndex((l) => /\bchrome\.|\bbrowser\.|PastePicLimits/.test(l) && !l.trim().startsWith('//'));
check('fence main/page-bridge.js', bridgeHit === -1, bridgeHit === -1 ? '' : `extension API at line ${bridgeHit + 1}`);

const session = read('editor-session.js');
const constants = (src) => ['REQ', 'RES', 'ANCHOR'].map((k) => (src.match(new RegExp(`const ${k} = '([^']+)'`)) || [])[1]);
check(
  'protocol-constants-match',
  JSON.stringify(constants(session)) === JSON.stringify(constants(bridge)),
  `${JSON.stringify(constants(session))} vs ${JSON.stringify(constants(bridge))}`
);

// ── MV3 limits (documented by Chrome) ────────────────────────────────────
const limitsSrc = read('limits.js');
const timeout = Number((limitsSrc.match(/uploadTimeoutMs:\s*(\d+)/) || [])[1]);
const order = (limitsSrc.match(/autoOrder:\s*\[([^\]]+)\]/) || [, ''])[1].split(',').filter(Boolean).length;
check('mv3-fetch-timeout', timeout > 0 && timeout < 30000, `uploadTimeoutMs=${timeout} must be < 30000 (Chrome kills the worker)`);
check(
  'mv3-event-budget',
  timeout * (order + 1) < 300000,
  `${timeout} × ${order + 1} = ${timeout * (order + 1)}ms must be < 300000`
);

const maxImageSrc = (read('content.js').match(/MAX_IMAGE_BYTES\s*=\s*([0-9*\s]+);/) || [])[1] || '0';
const maxImage = Number(Function(`"use strict";return (${maxImageSrc});`)());
const b64 = /b64/.test(read('content.js'));
const wireBytes = b64 ? Math.ceil(maxImage * 4 / 3) + 4096 : maxImage * 4 + 4096;
check(
  'mv3-message-size',
  wireBytes < 64 * 1024 * 1024,
  `${b64 ? 'base64' : 'number array'} wire ≈ ${(wireBytes / 1048576).toFixed(1)} MiB (limit 64 MiB)`
);

// ── popup ↔ uploaders ────────────────────────────────────────────────────
const settingsSrc = read('popup/src/settings.ts');
const providerTable = (settingsSrc.match(/PROVIDERS = \[([\s\S]*?)\] as const/) || [, ''])[1];
const options = [...providerTable.matchAll(/value: "([a-z0-9]+)"/g)]
  .map((m) => m[1])
  .filter((v) => v !== 'auto');
const uploaders = [...bg.matchAll(/^\s{2}([a-z0-9]+):\s*\(file/gm)].map((m) => m[1]);
check(
  'popup-matches-uploaders',
  JSON.stringify([...options].sort()) === JSON.stringify([...uploaders].sort()),
  `popup=${options.join(',')} uploaders=${uploaders.join(',')}`
);

// ── package == manifest closure ──────────────────────────────────────────
const zip = `store/pastepic-${manifest.version}.zip`;
if (exists(zip)) {
  const list = spawnSync('unzip', ['-Z1', path.join(ROOT, zip)], { encoding: 'utf8' }).stdout.trim().split('\n');
  const expected = [...new Set([...referenced, 'manifest.json', ...popupFiles])].sort();
  check('zip-matches-manifest', JSON.stringify(list.sort()) === JSON.stringify(expected), `${list.length} files in zip`);
  const stale = list.filter(
    (f) => !exists(f) || !spawnSync('unzip', ['-p', path.join(ROOT, zip), f], { maxBuffer: 1 << 26 }).stdout.equals(fs.readFileSync(path.join(ROOT, f)))
  );
  check('zip-matches-working-tree', stale.length === 0, stale.length ? `stale: ${stale.join(', ')}` : '');
} else {
  check('zip-matches-manifest', false, `${zip} missing`);
}

const failed = checks.filter((c) => !c.pass);
console.log(failed.length ? `\nT0 FAIL (${failed.length}/${checks.length})` : `\nT0 PASS (${checks.length} checks)`);
process.exit(failed.length ? 1 : 0);
