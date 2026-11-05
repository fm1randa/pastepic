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

const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// A fake response is just enough of the Fetch API for the uploaders.
const textResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => body,
  json: async () => JSON.parse(body),
});

function load({ routes = {}, settings = {}, timeoutMs = 250 } = {}) {
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
    PastePicLimits: {
      autoOrder: ['catbox', 'pomf', 'uguu', 'litterbox', 'tmpfiles'],
      uploadTimeoutMs: timeoutMs,
    },
    fetch: async (url, opts = {}) => {
      calls.push({ url, opts });
      const route = Object.keys(routes).find((host) => url.includes(host));
      if (!route) return textResponse('no route', 404);
      const handler = routes[route];
      if (typeof handler === 'function') return handler(url, opts, calls);
      return handler;
    },
    chrome: {
      storage: { sync: { get: (defaults, cb) => cb({ ...defaults, ...settings }) } },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(SOURCE, ctx);
  return { api: ctx.__pastepic, calls };
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
