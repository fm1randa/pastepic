#!/usr/bin/env node
// T4 — mutants. A green suite only counts if it can go red.
// Each mutant reproduces a bug class that already reached production. The run
// passes only when EVERY mutant makes T3 fail. A mutant whose patch does not
// apply is a harness error, not a survivor.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..', '..', '..');
const FILES = ['manifest.json', 'content.js', 'editor-session.js', 'page-bridge.js', 'background.js', 'limits.js', 'popup.html', 'popup.js'];

const MUTANTS = [
  {
    id: 'M1-bridge-not-main-world',
    why: 'the bridge declared without world: MAIN cannot see page expandos',
    file: 'manifest.json',
    from: '"js": ["page-bridge.js"],\n      "run_at": "document_idle",\n      "world": "MAIN"',
    to: '"js": ["page-bridge.js"],\n      "run_at": "document_idle"',
  },
  {
    id: 'M2-no-bridge-at-all',
    why: 'the v1.1.x shape: isolated code trying to reach the editor alone',
    file: 'manifest.json',
    from: '      "js": ["page-bridge.js"],\n      "run_at": "document_idle",\n      "world": "MAIN"\n    },\n',
    to: '',
  },
  {
    id: 'M3-missing-host-permission',
    why: 'without the permission the worker cannot fetch the host',
    file: 'manifest.json',
    from: '    "https://catbox.moe/*",\n',
    to: '',
  },
  {
    id: 'M4-no-return-true',
    why: 'an async sendResponse needs the channel held open',
    file: 'background.js',
    from: '    return true; // keeps the MV3 message channel open for the async response',
    to: '    return false;',
  },
  {
    id: 'M5-wrong-event-target',
    why: 'the handshake only works because both sides use document',
    file: 'editor-session.js',
    from: "document.dispatchEvent(\n          new CustomEvent(REQ, { detail: JSON.stringify({ id, op, ...payload }) })\n        );",
    to: "window.dispatchEvent(\n          new CustomEvent(REQ, { detail: JSON.stringify({ id, op, ...payload }) })\n        );",
  },
];

const results = [];
for (const mutant of MUTANTS) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `pastepic-mut-${mutant.id}-`));
  for (const file of FILES) fs.copyFileSync(path.join(ROOT, file), path.join(dir, file));
  fs.cpSync(path.join(ROOT, 'icons'), path.join(dir, 'icons'), { recursive: true });

  const target = path.join(dir, mutant.file);
  const before = fs.readFileSync(target, 'utf8');
  if (!before.includes(mutant.from)) {
    console.log(`FAIL ${mutant.id} — patch did not apply (harness error)`);
    results.push({ id: mutant.id, killed: false, detail: 'patch did not apply' });
    continue;
  }
  fs.writeFileSync(target, before.replace(mutant.from, mutant.to));

  const run = spawnSync('node', [path.join(here, 't3-extension.mjs')], {
    env: { ...process.env, PASTEPIC_T3_EXT: dir, PASTEPIC_T3_PORT: String(8932 + results.length + 1) },
    encoding: 'utf8',
    timeout: 120000,
  });
  const killed = run.status !== 0;
  const failing = (run.stdout || '').split('\n').filter((l) => l.startsWith('FAIL')).slice(0, 2).join(' | ');
  console.log(`${killed ? 'ok' : 'FAIL'} ${mutant.id} — ${killed ? 'killed' : 'SURVIVED'} (${mutant.why})`);
  if (failing) console.log(`    ${failing}`);
  results.push({ id: mutant.id, killed, detail: failing || (killed ? 'non-zero exit' : 'suite stayed green') });
  fs.rmSync(dir, { recursive: true, force: true });
}

const survivors = results.filter((r) => !r.killed);
console.log(survivors.length ? `\nT4 FAIL (${survivors.length} survivors)` : `\nT4 PASS (${results.length} mutants killed)`);
fs.writeFileSync(path.join(ROOT, '.agents/skills/verify-pastepic/artifacts/t4-mutants.json'), JSON.stringify(results, null, 2));
process.exit(survivors.length ? 1 : 0);
