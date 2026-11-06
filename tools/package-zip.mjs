// Write store/pastepic-<version>.zip: the manifest closure plus the built
// popup, with manifest.json at the zip root. Run through `npm run package`,
// which builds first.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const popupDir = path.posix.dirname(manifest.action.default_popup);

const listFiles = (dir) =>
  fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listFiles(`${dir}/${e.name}`) : [`${dir}/${e.name}`]
  );

const files = [
  ...new Set([
    'manifest.json',
    manifest.background.service_worker,
    ...manifest.content_scripts.flatMap((c) => c.js),
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
    ...listFiles(popupDir),
  ]),
].sort();

const missing = files.filter((f) => !fs.existsSync(path.join(ROOT, f)));
if (missing.length) {
  console.error(`missing files: ${missing.join(', ')}`);
  process.exit(1);
}

// Staged copies with one fixed mtime, so rebuilding unchanged sources gives a
// byte-identical zip instead of a dirty working tree.
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'pastepic-package-'));
const epoch = new Date('2026-01-01T00:00:00Z');
for (const f of files) {
  fs.mkdirSync(path.dirname(path.join(stage, f)), { recursive: true });
  fs.copyFileSync(path.join(ROOT, f), path.join(stage, f));
  fs.utimesSync(path.join(stage, f), epoch, epoch);
}

const zip = `store/pastepic-${manifest.version}.zip`;
fs.rmSync(path.join(ROOT, zip), { force: true });
const r = spawnSync('zip', ['-X', '-D', '-q', path.join(ROOT, zip), ...files], { cwd: stage, stdio: 'inherit' });
fs.rmSync(stage, { recursive: true, force: true });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`${zip}: ${files.length} files, ${(fs.statSync(path.join(ROOT, zip)).size / 1024).toFixed(1)} KiB`);
