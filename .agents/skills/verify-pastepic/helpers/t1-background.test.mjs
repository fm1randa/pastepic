// T1 — unit tests for the upload layer. No network, no browser, no deps.
// Proves parsing, chain order, timeouts and the message transport.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..', '..', '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'background.js'), 'utf8');
const LIMITS = vm.runInNewContext(`${fs.readFileSync(path.join(ROOT, 'limits.js'), 'utf8')}; PastePicLimits`);

const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// A fake response is just enough of the Fetch API for the uploaders.
const textResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => body,
  json: async () => JSON.parse(body),
});

// chrome.storage.local backed by a Map, promise style like the MV3 API.
function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    get: async (key) => (map.has(key) ? { [key]: map.get(key) } : {}),
    set: async (items) => {
      for (const [k, v] of Object.entries(items)) map.set(k, v);
    },
    remove: async (key) => {
      map.delete(key);
    },
  };
}

function load({ routes = {}, settings = {}, timeoutMs = 250, local = memoryStorage() } = {}) {
  const calls = [];
  const ctx = {
    console,
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
    crypto,
    Date,
    PastePicLimits: { ...LIMITS, uploadTimeoutMs: timeoutMs },
    fetch: async (url, opts = {}) => {
      calls.push({ url, opts });
      const route = Object.keys(routes).find((host) => url.includes(host));
      if (!route) return textResponse('no route', 404);
      const handler = routes[route];
      if (typeof handler === 'function') return handler(url, opts, calls);
      return handler;
    },
    chrome: {
      storage: { sync: { get: (defaults, cb) => cb({ ...defaults, ...settings }) }, local },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(SOURCE, ctx);
  return { api: ctx.__pastepic, calls, local };
}

const upload = (api, extra = {}) =>
  api.handleUpload({ b64: PNG_B64, mime: 'image/png', name: 'pastepic.png', ...extra });

test('catbox: plain-text URL is accepted', async () => {
  const { api } = load({ routes: { 'catbox.moe': textResponse('https://files.catbox.moe/abc.png') } });
  const r = await upload(api, { provider: 'catbox' });
  assert.equal(r.ok, true);
  assert.equal(r.url, 'https://files.catbox.moe/abc.png');
  assert.equal(r.provider, 'catbox');
});

test('catbox: a non-URL body is a failure', async () => {
  const { api } = load({ routes: { 'catbox.moe': textResponse('Uploads paused', 503) } });
  const r = await upload(api, { provider: 'catbox' });
  assert.equal(r.ok, false);
  assert.match(r.error, /Uploads paused/);
});

test('pomf: requires success and files[0].url', async () => {
  const ok = load({ routes: { 'pomf.lain.la': textResponse(JSON.stringify({ success: true, files: [{ url: 'https://p/x.png' }] })) } });
  assert.equal((await upload(ok.api, { provider: 'pomf' })).url, 'https://p/x.png');

  const bad = load({ routes: { 'pomf.lain.la': textResponse(JSON.stringify({ success: false })) } });
  assert.equal((await upload(bad.api, { provider: 'pomf' })).ok, false);
});

test('uguu: reads files[0].url', async () => {
  const { api } = load({ routes: { 'uguu.se': textResponse(JSON.stringify({ files: [{ url: 'https://u/x.png' }] })) } });
  assert.equal((await upload(api, { provider: 'uguu' })).url, 'https://u/x.png');
});

test('litterbox: sends time=72h', async () => {
  const { api, calls } = load({ routes: { 'litterbox.catbox.moe': textResponse('https://l/x.png') } });
  const r = await upload(api, { provider: 'litterbox' });
  assert.equal(r.url, 'https://l/x.png');
  const body = calls[0].opts.body;
  assert.equal(body.get('time'), '72h');
  assert.equal(body.get('reqtype'), 'fileupload');
});

test('tmpfiles: page URL is rewritten to the direct /dl/ link', async () => {
  const { api } = load({
    routes: { 'tmpfiles.org': textResponse(JSON.stringify({ data: { url: 'https://tmpfiles.org/123/x.png' } })) },
  });
  const r = await upload(api, { provider: 'tmpfiles' });
  assert.equal(r.url, 'https://tmpfiles.org/dl/123/x.png');
});

test('imgur: sends the Client-ID header and needs one', async () => {
  const withId = load({
    settings: { imgurClientId: 'cid' },
    routes: { 'api.imgur.com': textResponse(JSON.stringify({ success: true, data: { link: 'https://i/x.png' } })) },
  });
  const r = await upload(withId.api, { provider: 'imgur' });
  assert.equal(r.url, 'https://i/x.png');
  assert.equal(withId.calls[0].opts.headers.Authorization, 'Client-ID cid');

  const without = load({ routes: {} });
  const failed = await upload(without.api, { provider: 'imgur' });
  assert.equal(failed.ok, false);
  assert.match(failed.error, /Client-ID/);
});

test('auto: falls through the chain and reports the provider that served', async () => {
  const { api, calls } = load({
    routes: {
      'catbox.moe': textResponse('nope', 500),
      'pomf.lain.la': textResponse(JSON.stringify({ success: true, files: [{ url: 'https://p/x.png' }] })),
    },
  });
  const r = await upload(api);
  assert.equal(r.ok, true);
  assert.equal(r.provider, 'pomf');
  assert.equal(calls.length, 2);
});

test('auto: a configured Imgur Client-ID puts Imgur first', async () => {
  const { api, calls } = load({
    settings: { imgurClientId: 'cid' },
    routes: { 'api.imgur.com': textResponse(JSON.stringify({ success: true, data: { link: 'https://i/x.png' } })) },
  });
  const r = await upload(api);
  assert.equal(r.provider, 'imgur');
  assert.equal(calls.length, 1);
});

test('pinned provider has no fallback', async () => {
  const { api, calls } = load({
    routes: { 'catbox.moe': textResponse('down', 500), 'pomf.lain.la': textResponse('{}') },
  });
  const r = await upload(api, { provider: 'catbox' });
  assert.equal(r.ok, false);
  assert.equal(calls.length, 1);
});

test('a hanging host is aborted and the chain moves on', async () => {
  const { api, calls } = load({
    timeoutMs: 80,
    routes: {
      'catbox.moe': (url, opts) =>
        new Promise((resolve, reject) => {
          opts.signal.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
      'pomf.lain.la': textResponse(JSON.stringify({ success: true, files: [{ url: 'https://p/x.png' }] })),
    },
  });
  const r = await upload(api);
  assert.equal(r.ok, true);
  assert.equal(r.provider, 'pomf');
  assert.equal(calls.length, 2);
});

test('base64 transport reaches the host with the exact bytes', async () => {
  let received = null;
  const { api } = load({
    routes: {
      'catbox.moe': (url, opts) => {
        const file = opts.body.get('fileToUpload');
        received = { size: file.size, type: file.type, name: file.name };
        return textResponse('https://c/x.png');
      },
    },
  });
  const r = await upload(api, { provider: 'catbox' });
  assert.equal(r.ok, true);
  assert.deepEqual(received, { size: 70, type: 'image/png', name: 'pastepic.png' });
});

test('legacy number-array transport still uploads', async () => {
  let size = null;
  const { api } = load({
    routes: {
      'catbox.moe': (url, opts) => {
        size = opts.body.get('fileToUpload').size;
        return textResponse('https://c/x.png');
      },
    },
  });
  const bytes = Array.from(Buffer.from(PNG_B64, 'base64'));
  const r = await api.handleUpload({ bytes, mime: 'image/png', name: 'p.png', provider: 'catbox' });
  assert.equal(r.ok, true);
  assert.equal(size, 70);
});

test('a payload with no bytes is rejected', async () => {
  const { api } = load({ routes: {} });
  await assert.rejects(() => api.handleUpload({ mime: 'image/png', provider: 'catbox' }), /payload sem bytes/);
});

test('settings defaults survive a storage read', async () => {
  const { api } = load({
    routes: { 'catbox.moe': textResponse('https://c/x.png') },
  });
  const r = await upload(api);
  assert.equal(r.ok, true);
  assert.equal(r.format, 'html');
});

const OTHER_PNG_B64 = Buffer.from('not the same image').toString('base64');
const HOUR = 60 * 60 * 1000;
const catboxOk = { 'catbox.moe': textResponse('https://files.catbox.moe/abc.png') };

test('reuse: the same bytes uploaded twice hit the network once', async () => {
  const { api, calls } = load({ routes: catboxOk });
  const first = await upload(api, { provider: 'catbox' });
  const second = await upload(api, { provider: 'catbox' });
  assert.equal(calls.length, 1);
  assert.equal(first.reused, undefined);
  assert.deepEqual(
    { ok: second.ok, url: second.url, provider: second.provider, reused: second.reused },
    { ok: true, url: 'https://files.catbox.moe/abc.png', provider: 'catbox', reused: true }
  );
});

test('reuse: a link from one provider is reused when another is asked for', async () => {
  const { api, calls } = load({
    routes: { ...catboxOk, 'uguu.se': textResponse(JSON.stringify({ files: [{ url: 'https://u/x.png' }] })) },
  });
  await upload(api, { provider: 'catbox' });
  const r = await upload(api, { provider: 'uguu' });
  assert.equal(calls.length, 1);
  assert.equal(r.provider, 'catbox');
  assert.equal(r.url, 'https://files.catbox.moe/abc.png');
  assert.equal(r.reused, true);
});

test('reuse: an expired or nearly expired link is replaced by a fresh upload', async () => {
  for (const expiresAt of [Date.now() - HOUR, Date.now() + LIMITS.reuseMarginMs / 2]) {
    const probe = load({ routes: catboxOk });
    await upload(probe.api, { provider: 'catbox' });
    const [key] = probe.local.map.keys();
    const local = memoryStorage({ [key]: { url: 'https://dead/x.png', provider: 'uguu', expiresAt } });

    const { api, calls } = load({ routes: catboxOk, local });
    const r = await upload(api, { provider: 'catbox' });
    assert.equal(calls.length, 1);
    assert.equal(r.url, 'https://files.catbox.moe/abc.png');
    assert.equal(r.reused, undefined);
    assert.equal(local.map.get(key).url, 'https://files.catbox.moe/abc.png');
  }
});

test('reuse: the stored expiry follows the provider retention', async () => {
  const { api, local } = load({
    routes: { ...catboxOk, 'uguu.se': textResponse(JSON.stringify({ files: [{ url: 'https://u/x.png' }] })) },
  });
  const before = Date.now();
  await upload(api, { provider: 'uguu' });
  await upload(api, { b64: OTHER_PNG_B64, provider: 'catbox' });
  const entries = [...local.map.values()];
  const uguu = entries.find((e) => e.provider === 'uguu');
  const catbox = entries.find((e) => e.provider === 'catbox');
  assert.ok(uguu.expiresAt >= before + 3 * HOUR && uguu.expiresAt <= Date.now() + 3 * HOUR);
  assert.equal(catbox.expiresAt, null);
});

test('reuse: different bytes upload separately', async () => {
  let n = 0;
  const { api, calls } = load({ routes: { 'catbox.moe': () => textResponse(`https://c/${++n}.png`) } });
  const a = await upload(api, { provider: 'catbox' });
  const b = await upload(api, { b64: OTHER_PNG_B64, provider: 'catbox' });
  assert.equal(calls.length, 2);
  assert.notEqual(a.url, b.url);
  assert.equal(b.reused, undefined);
});

test('reuse: a failed upload stores nothing', async () => {
  const { api, calls, local } = load({ routes: { 'catbox.moe': textResponse('down', 500) } });
  assert.equal((await upload(api, { provider: 'catbox' })).ok, false);
  assert.equal(local.map.size, 0);
  assert.equal((await upload(api, { provider: 'catbox' })).ok, false);
  assert.equal(calls.length, 2);
});

test('reuse: storage that throws, or is missing, still uploads', async () => {
  const boom = async () => {
    throw new Error('storage down');
  };
  const broken = load({ routes: catboxOk, local: { get: boom, set: boom, remove: boom } });
  const r = await upload(broken.api, { provider: 'catbox' });
  assert.equal(r.ok, true);
  assert.equal(r.url, 'https://files.catbox.moe/abc.png');

  const missing = load({ routes: catboxOk, local: null });
  assert.equal((await upload(missing.api, { provider: 'catbox' })).ok, true);
});
