// PastePic — background service worker (Manifest V3).
// Uploads must originate here, not in the page: catbox.moe and friends send no
// CORS headers, while the extension reaches them under host_permissions.

// limits.js is the single source of truth for the chain and its timeouts; the
// guard in content.js is derived from the same numbers.
if (typeof importScripts === 'function') importScripts('limits.js');
const LIMITS = globalThis.PastePicLimits || {
  autoOrder: ['catbox', 'pomf', 'uguu', 'litterbox', 'tmpfiles'],
  uploadTimeoutMs: 60000,
  retentionMs: {
    catbox: null,
    pomf: null,
    imgur: null,
    litterbox: 72 * 60 * 60 * 1000,
    uguu: 3 * 60 * 60 * 1000,
    tmpfiles: 60 * 60 * 1000,
  },
  reuseMarginMs: 5 * 60 * 1000,
};
const AUTO_ORDER = LIMITS.autoOrder;

// No fetch may hang forever: without a timeout one slow host strands the
// "Enviando imagem..." placeholder. 60s per provider, then auto-mode moves on.
const UPLOAD_TIMEOUT_MS = LIMITS.uploadTimeoutMs;

async function fetchT(url, opts) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), UPLOAD_TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`tempo esgotado apos ${UPLOAD_TIMEOUT_MS / 1000}s sem resposta`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function extFromMime(mime) {
  const map = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif',
    'image/bmp': 'bmp',
    'image/svg+xml': 'svg',
  };
  return map[mime] || 'png';
}

function makeFile(bytes, mime, name) {
  const blob = new Blob([new Uint8Array(bytes)], { type: mime });
  const filename = name || `pastepic-${Date.now()}.${extFromMime(mime)}`;
  return new File([blob], filename, { type: mime });
}

async function readTextSafe(res) {
  try {
    return (await res.text()).trim();
  } catch {
    return '';
  }
}

async function uploadCatbox(file) {
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('fileToUpload', file);
  const res = await fetchT('https://catbox.moe/user/api.php', { method: 'POST', body: form });
  const text = await readTextSafe(res);
  if (res.ok && /^https?:\/\//.test(text)) return text;
  throw new Error(`catbox: ${text || `HTTP ${res.status}`}`);
}

async function uploadPomf(file) {
  const form = new FormData();
  form.append('files[]', file);
  const res = await fetchT('https://pomf.lain.la/upload.php', { method: 'POST', body: form });
  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(`pomf: resposta invalida (HTTP ${res.status})`);
  }
  const url = json?.files?.[0]?.url;
  if (json?.success && url) return url;
  throw new Error(`pomf: ${JSON.stringify(json).slice(0, 200)}`);
}

async function uploadUguu(file) {
  const form = new FormData();
  form.append('files[]', file);
  const res = await fetchT('https://uguu.se/upload.php?output=json', { method: 'POST', body: form });
  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(`uguu: resposta invalida (HTTP ${res.status})`);
  }
  const url = json?.files?.[0]?.url;
  if (url) return url;
  throw new Error(`uguu: ${JSON.stringify(json).slice(0, 200)}`);
}

async function uploadLitterbox(file) {
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('time', '72h');
  form.append('fileToUpload', file);
  const res = await fetchT('https://litterbox.catbox.moe/resources/internals/api.php', {
    method: 'POST',
    body: form,
  });
  const text = await readTextSafe(res);
  if (res.ok && /^https?:\/\//.test(text)) return text;
  throw new Error(`litterbox: ${text || `HTTP ${res.status}`}`);
}

async function uploadTmpfiles(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetchT('https://tmpfiles.org/api/v1/upload', { method: 'POST', body: form });
  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(`tmpfiles: resposta invalida (HTTP ${res.status})`);
  }
  let url = json?.data?.url;
  if (!url) throw new Error(`tmpfiles: ${JSON.stringify(json).slice(0, 200)}`);
  // The API returns the page URL; embedding needs the /dl/ direct link.
  url = url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
  return url;
}

async function uploadImgur(file, clientId) {
  if (!clientId) throw new Error('imgur: configure um Client-ID no popup da extensao.');
  const form = new FormData();
  form.append('image', file);
  const res = await fetchT('https://api.imgur.com/3/image', {
    method: 'POST',
    headers: { Authorization: `Client-ID ${clientId}` },
    body: form,
  });
  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(`imgur: resposta invalida (HTTP ${res.status})`);
  }
  if (json?.success && json?.data?.link) return json.data.link;
  throw new Error(`imgur: ${(json?.data?.error || JSON.stringify(json)).toString().slice(0, 200)}`);
}

const UPLOADERS = {
  catbox: (file) => uploadCatbox(file),
  pomf: (file) => uploadPomf(file),
  uguu: (file) => uploadUguu(file),
  litterbox: (file) => uploadLitterbox(file),
  tmpfiles: (file) => uploadTmpfiles(file),
  imgur: (file, _bytes, _mime, clientId) => uploadImgur(file, clientId),
};

const SETTINGS_DEFAULTS = { provider: 'auto', format: 'html', imgurClientId: '', sameProviderOnly: false, autoOrder: AUTO_ORDER };

// The stored order is user data: unknown or repeated names are dropped, and
// chain providers it does not name (e.g. one added in an update) keep their
// default position at the end, so the chain never loses a host.
function resolveAutoOrder(stored) {
  const picked = Array.isArray(stored) ? [...new Set(stored)].filter((name) => AUTO_ORDER.includes(name)) : [];
  return [...picked, ...AUTO_ORDER.filter((name) => !picked.includes(name))];
}

function getSettings() {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get(
        SETTINGS_DEFAULTS,
        (items) => resolve(items || SETTINGS_DEFAULTS)
      );
    } catch {
      resolve(SETTINGS_DEFAULTS);
    }
  });
}

function bytesFromMessage(msg) {
  if (typeof msg.b64 === 'string') {
    const binary = atob(msg.b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  // Legacy number-array transport, kept so an in-flight message from an older
  // content script still uploads instead of failing.
  if (Array.isArray(msg.bytes)) return new Uint8Array(msg.bytes);
  throw new Error('payload sem bytes');
}

// One storage key per image, so concurrent uploads of different images never
// read-modify-write a shared object. Each key maps provider -> { url, expiresAt },
// so uploading the same image to a second provider keeps the first link. The
// cache is a convenience: any storage or hashing failure reads as a miss.
async function uploadCacheKey(bytes) {
  try {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return `upload:${Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')}`;
  } catch {
    return null;
  }
}

async function readCachedLinks(key) {
  try {
    const stored = (await chrome.storage.local.get(key))[key] || {};
    const live = Object.fromEntries(
      Object.entries(stored).filter(
        ([, e]) => e.expiresAt === null || e.expiresAt - Date.now() > LIMITS.reuseMarginMs
      )
    );
    if (Object.keys(live).length !== Object.keys(stored).length) {
      await chrome.storage.local.set({ [key]: live });
    }
    return live;
  } catch {
    return {};
  }
}

async function writeCachedLink(key, links, provider, url) {
  try {
    const ms = LIMITS.retentionMs[provider];
    const expiresAt = ms == null ? null : Date.now() + ms;
    await chrome.storage.local.set({ [key]: { ...links, [provider]: { url, expiresAt } } });
  } catch {
    /* the upload already succeeded */
  }
}

// Providers this upload would try come first; any other provider's link is a
// candidate only when the user allows cross-provider reuse.
function pickCachedLink(links, order, sameProviderOnly) {
  const candidates = sameProviderOnly ? order : [...order, ...Object.keys(links)];
  const provider = candidates.find((name) => links[name]);
  return provider ? { provider, url: links[provider].url } : null;
}

async function handleUpload(msg) {
  const settings = await getSettings();
  const wanted = msg.provider || settings.provider || 'auto';
  const format = settings.format || 'html';
  const bytes = bytesFromMessage(msg);

  let order;
  if (wanted === 'auto') {
    order = resolveAutoOrder(settings.autoOrder);
    if (settings.imgurClientId) order.unshift('imgur');
  } else {
    order = [wanted];
  }

  const key = await uploadCacheKey(bytes);
  const links = key ? await readCachedLinks(key) : {};
  const cached = pickCachedLink(links, order, settings.sameProviderOnly);
  if (cached) return { ok: true, url: cached.url, provider: cached.provider, format, reused: true };

  const file = makeFile(bytes, msg.mime, msg.name);

  const errors = [];
  for (const name of order) {
    try {
      const url = await UPLOADERS[name](file, bytes, msg.mime, settings.imgurClientId);
      if (key) await writeCachedLink(key, links, name, url);
      return { ok: true, url, provider: name, format };
    } catch (err) {
      errors.push(`${name}: ${err?.message || err}`);
    }
  }
  const message = errors.join(' | ') || 'falha desconhecida';
  try {
    console.error('[PastePic] upload falhou:', message);
  } catch {
    /* noop */
  }
  return { ok: false, error: message };
}

// Exported for Node tests; the chrome guard below keeps the listener inert there.
if (typeof globalThis !== 'undefined') {
  globalThis.__pastepic = { UPLOADERS, makeFile, AUTO_ORDER, resolveAutoOrder, handleUpload };
}

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.type !== 'PASTEPIC_UPLOAD') return false;
    handleUpload(msg)
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true; // keeps the MV3 message channel open for the async response
  });
}
