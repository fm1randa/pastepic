#!/usr/bin/env node
// T2 — protocol contract, one side at a time.
// A) the host alone: every op and every code, against real editor kinds.
// B) the client alone: timeouts, busy, retry policy and cleanup ordering.
// Neither side runs in a fused world: the other side is an explicit double.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}
const PORT = arg('port', process.env.PASTEPIC_VERIFY_PORT ?? '8931');
const OUT = arg('out', 'artifacts/contract');
const RUN_ID = arg('run-id', 'manual');
fs.mkdirSync(OUT, { recursive: true });

const checks = [];
const check = (id, pass, detail = '') => {
  checks.push({ id, pass, detail });
  console.log(`${pass ? 'ok' : 'FAIL'} ${id}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
try {
  // ── A) host side ───────────────────────────────────────────────────────
  const host = await browser.newPage();
  await host.goto(`http://127.0.0.1:${PORT}/fixture-contract.html`, { waitUntil: 'load' });

  const open = (selector) =>
    host.evaluate((sel) => {
      const el = document.querySelector(sel);
      return window.__req('open', { anchor: window.__anchor(el) });
    }, selector);

  check('open-cm5', (await open('#wrap-a')).kind === 'cm5', 'CodeMirror 5 resolves by anchor');
  check('open-plain', (await open('#plain')).kind === 'plain', 'textarea resolves as plain');
  check('open-contenteditable', (await open('#ce')).kind === 'contenteditable', 'contenteditable resolves');
  check('open-cm6-shell-unsupported', (await open('#cm6-shell')).code === 'unsupported', 'a shell without an instance refuses instead of dropping to contenteditable');
  check('open-not-editable', (await open('#not-editable')).code === 'not-editable', 'a plain div is not editable');

  const insert = await host.evaluate(async () => {
    const el = document.querySelector('#wrap-a');
    const anchor = window.__anchor(el);
    await window.__req('open', { anchor });
    const r = await window.__req('insert', { anchor, kind: 'cm5', text: 'NEEDLE-1' });
    return { r, value: window.__cmA.getValue() };
  });
  check('insert-cm5', insert.r.ok && insert.value.includes('NEEDLE-1'), JSON.stringify(insert.r));

  const swap = await host.evaluate(async () => {
    const el = document.querySelector('#wrap-a');
    const anchor = window.__anchor(el);
    const r = await window.__req('swap', { anchor, kind: 'cm5', needle: 'NEEDLE-1', text: '<img src="x">' });
    return { r, value: window.__cmA.getValue() };
  });
  check('swap-cm5', swap.r.ok && swap.value.includes('<img src="x">') && !swap.value.includes('NEEDLE-1'), JSON.stringify(swap.r));

  const already = await host.evaluate(async () => {
    const el = document.querySelector('#wrap-a');
    const anchor = window.__anchor(el);
    return window.__req('swap', { anchor, kind: 'cm5', needle: 'NEEDLE-1', text: '<img src="x">' });
  });
  check('swap-already-swapped', already.ok && already.code === 'already-swapped', JSON.stringify(already));

  const ambiguous = await host.evaluate(async () => {
    window.__cmA.setValue('DUP');
    window.__cmB.setValue('DUP');
    return window.__req('swap', { anchor: 'missing-anchor', kind: 'cm5', needle: 'DUP', text: 'X' });
  });
  check('swap-ambiguous-refuses', ambiguous.ok === false && ambiguous.code === 'ambiguous', JSON.stringify(ambiguous));

  const lost = await host.evaluate(() =>
    window.__req('swap', { anchor: 'missing-anchor', kind: 'cm5', needle: 'NOT-THERE', text: 'X' })
  );
  check('swap-lost-refuses', lost.ok === false && lost.code === 'lost', JSON.stringify(lost));

  const withdraw = await host.evaluate(async () => {
    window.__cmA.setValue('REMOVE-ME');
    const el = document.querySelector('#wrap-a');
    const anchor = window.__anchor(el);
    const first = await window.__req('withdraw', { anchor, kind: 'cm5', needle: 'REMOVE-ME' });
    const second = await window.__req('withdraw', { anchor, kind: 'cm5', needle: 'REMOVE-ME' });
    return { first, second, value: window.__cmA.getValue() };
  });
  check('withdraw-removed', withdraw.first.ok && withdraw.first.code === 'removed' && !withdraw.value.includes('REMOVE-ME'), JSON.stringify(withdraw.first));
  check('withdraw-idempotent', withdraw.second.ok && withdraw.second.code === 'already-gone', JSON.stringify(withdraw.second));

  const unknown = await host.evaluate(() => window.__req('nope', {}));
  check('unknown-op', unknown.ok === false && unknown.code === 'unknown-op', JSON.stringify(unknown));

  const noEditor = await host.evaluate(() =>
    window.__req('insert', { anchor: 'gone', kind: 'cm5', text: 'x' })
  );
  check('insert-without-editor', noEditor.ok === false && noEditor.code === 'no-editor', JSON.stringify(noEditor));

  // ── B) client side ─────────────────────────────────────────────────────
  const client = await browser.newPage();
  await client.goto(`http://127.0.0.1:${PORT}/fixture-client.html`, { waitUntil: 'load' });

  const openOk = await client.evaluate(async () => {
    window.__script = [{ ok: true, kind: 'cm5' }];
    const r = await window.__open();
    const out = { ok: r.ok, kind: r.session && r.session.kind, calls: window.__calls.map((c) => c.op) };
    if (r.ok) await r.session.release();
    return out;
  });
  check('client-open', openOk.ok && openOk.kind === 'cm5' && openOk.calls[0] === 'open', JSON.stringify(openOk));

  const unsupported = await client.evaluate(async () => {
    window.__calls = [];
    window.__script = [{ ok: false, code: 'unsupported', kind: 'cm6' }];
    const r = await window.__open();
    const out = { ok: r.ok, code: r.code, kind: r.kind };
    if (r.ok) await r.session.release();
    return out;
  });
  check('client-open-unsupported', unsupported.ok === false && unsupported.code === 'unsupported', JSON.stringify(unsupported));

  const bridgeDown = await client.evaluate(async () => {
    window.__calls = [];
    window.__script = [null]; // no answer
    const t0 = Date.now();
    const r = await window.__open();
    return { ok: r.ok, code: r.code, ms: Date.now() - t0 };
  });
  check('client-bridge-down', bridgeDown.ok === false && bridgeDown.code === 'bridge-down', `${bridgeDown.code} after ${bridgeDown.ms}ms`);

  const busy = await client.evaluate(async () => {
    window.__calls = [];
    window.__script = [{ ok: true, kind: 'cm5' }];
    const first = await window.__open();
    window.__script = [{ ok: true, kind: 'cm5' }];
    const second = await window.__open();
    await first.session.release();
    return { first: first.ok, second: second.ok, code: second.code };
  });
  check('client-busy', busy.first === true && busy.second === false && busy.code === 'busy', JSON.stringify(busy));

  const replacePending = await client.evaluate(async () => {
    window.__calls = [];
    window.__script = [{ ok: true, kind: 'cm5' }, { ok: true, code: 'ok' }, { ok: true, code: 'ok' }];
    const { session } = await window.__open();
    await session.insert('A');
    await session.insert('B');
    await session.release();
    return window.__calls.map((c) => c.op);
  });
  check(
    'client-insert-withdraws-pending',
    JSON.stringify(replacePending) === JSON.stringify(['open', 'insert', 'withdraw', 'insert']),
    JSON.stringify(replacePending)
  );

  const retry = await client.evaluate(async () => {
    window.__calls = [];
    window.__script = [{ ok: true, kind: 'cm5' }, { ok: false, code: 'lost' }, { ok: false, code: 'lost' }, { ok: true, code: 'ok' }];
    const { session } = await window.__open();
    const r = await session.swap('N', 'T');
    const out = { ok: r.ok, swaps: window.__calls.filter((c) => c.op === 'swap').length };
    await session.release();
    return out;
  });
  check('client-swap-retries-lost', retry.ok && retry.swaps === 3, JSON.stringify(retry));

  const noRetry = await client.evaluate(async () => {
    window.__calls = [];
    window.__script = [{ ok: true, kind: 'cm5' }, { ok: false, code: 'write-failed' }];
    const { session } = await window.__open();
    const r = await session.swap('N', 'T');
    const out = { ok: r.ok, code: r.code, swaps: window.__calls.filter((c) => c.op === 'swap').length };
    await session.release();
    return out;
  });
  check('client-swap-stops-on-write-failed', noRetry.ok === false && noRetry.swaps === 1, JSON.stringify(noRetry));

  const releaseIdle = await client.evaluate(async () => {
    window.__calls = [];
    window.__script = [{ ok: true, kind: 'cm5' }];
    const { session } = await window.__open();
    const r = await session.release();
    return { ok: r.ok, code: r.code, calls: window.__calls.map((c) => c.op) };
  });
  check('client-release-idle', releaseIdle.ok && releaseIdle.code === 'idle' && !releaseIdle.calls.includes('withdraw'), JSON.stringify(releaseIdle));

  const releasePending = await client.evaluate(async () => {
    window.__calls = [];
    window.__script = [{ ok: true, kind: 'cm5' }, { ok: true, code: 'ok' }, { ok: true, code: 'removed' }];
    const { session } = await window.__open();
    await session.insert('P');
    const r = await session.release();
    return { ok: r.ok, code: r.code, ops: window.__calls.map((c) => c.op) };
  });
  check('client-release-withdraws', releasePending.ok && releasePending.code === 'removed' && releasePending.ops.includes('withdraw'), JSON.stringify(releasePending));

  const releaseFails = await client.evaluate(async () => {
    window.__calls = [];
    window.__script = [{ ok: true, kind: 'cm5' }, { ok: true, code: 'ok' }, { ok: false, code: 'still-there' }];
    const { session } = await window.__open();
    await session.insert('P');
    const r = await session.release();
    return { ok: r.ok, code: r.code };
  });
  check('client-release-reports-failure', releaseFails.ok === false && releaseFails.code === 'still-there', JSON.stringify(releaseFails));
} finally {
  await browser.close();
}

const result = { feature: 'contract', runId: RUN_ID, checks, ok: checks.every((c) => c.pass) };
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2));
console.log(result.ok ? 'RESULT PASS' : 'RESULT FAIL');
process.exit(result.ok ? 0 : 1);
