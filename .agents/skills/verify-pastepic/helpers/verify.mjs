#!/usr/bin/env node
// One entry point for the verification ladder.
//   --level fast    T0 + T1 + T2            (seconds, no browser extension)
//   --level full    fast + T3 + T4 + T5     (minutes, real extension)
//   --level release full, and T5 must find >=2 healthy providers
// Prints a verdict and always lists what stays UNPROVEN.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..', '..', '..');
const levelIdx = process.argv.indexOf('--level');
const level = levelIdx === -1 ? 'fast' : process.argv[levelIdx + 1];

const UNPROVEN = [
  'the real TabNews/curso.dev DOM with a logged-in user (T6, human)',
  'ByteMD/React remount timing on the real sites',
  'real host availability and rate limits (T5 reports health, not correctness)',
  'clipboard producers across operating systems',
  'natural MV3 worker timers under automation',
  'Chrome Web Store review outcome',
];

const steps = [
  { id: 'T0', run: () => spawnSync('node', [path.join(here, 'check-static.mjs')], { stdio: 'inherit' }) },
  { id: 'T1', run: () => spawnSync('node', ['--test', path.join(here, 't1-background.test.mjs')], { stdio: 'inherit' }) },
  { id: 'T2', run: () => runWithServer('drive-contract.mjs') },
];
if (level !== 'fast') {
  steps.push({ id: 'T3', run: () => spawnSync('node', [path.join(here, 't3-extension.mjs')], { stdio: 'inherit' }) });
  steps.push({ id: 'T4', run: () => spawnSync('node', [path.join(here, 't4-mutants.mjs')], { stdio: 'inherit' }) });
  steps.push({
    id: 'T5',
    run: () =>
      spawnSync('node', [path.join(here, 't5-canary.mjs'), ...(level === 'release' ? ['--require', '2'] : [])], {
        stdio: 'inherit',
      }),
  });
}

function runWithServer(script) {
  const skill = path.join(ROOT, '.agents', 'skills', 'verify-pastepic');
  const up = spawnSync('sh', [path.join(skill, 'launch.sh')], { encoding: 'utf8' });
  if (up.status !== 0) return { status: 1, stdout: up.stdout, stderr: up.stderr };
  try {
    return spawnSync('node', [path.join(here, script), '--run-id', `verify-${Date.now()}`], { stdio: 'inherit' });
  } finally {
    spawnSync('sh', [path.join(skill, 'cleanup.sh')], { stdio: 'ignore' });
  }
}

const results = [];
for (const step of steps) {
  console.log(`\n=== ${step.id} ===`);
  const started = Date.now();
  const r = step.run();
  results.push({ id: step.id, ok: r.status === 0, ms: Date.now() - started });
}

const failed = results.filter((r) => !r.ok);
const verdict = {
  level,
  at: new Date().toISOString(),
  ok: failed.length === 0,
  steps: results,
  unproven: UNPROVEN,
};
fs.mkdirSync(path.join(here, '..', 'artifacts'), { recursive: true });
fs.writeFileSync(path.join(here, '..', 'artifacts', 'verdict.json'), JSON.stringify(verdict, null, 2));

console.log('\n=== verdict ===');
for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.id} (${(r.ms / 1000).toFixed(1)}s)`);
console.log('\nUNPROVEN (always):');
for (const item of UNPROVEN) console.log(`- ${item}`);
console.log(verdict.ok ? `\nVERDICT PASS (${level})` : `\nVERDICT FAIL (${level})`);
process.exit(verdict.ok ? 0 : 1);
