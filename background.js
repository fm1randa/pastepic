// PastePic — background service worker (Manifest V3).
// Recebe os bytes da imagem do content script e faz o upload para um
// host gratuito sem necessidade de conta. O upload acontece aqui (e nao
// na pagina) porque hosts como o catbox.moe nao enviam headers CORS,
// mas a requisicao parte da extensao (coberta pelo host_permissions).

const AUTO_ORDER = ['catbox', 'pomf', 'uguu', 'litterbox', 'tmpfiles'];

// Nenhum fetch da extensao pode travar para sempre: sem timeout, um
// servidor lento deixaria o placeholder "Enviando imagem..." preso no
// editor. 60s por provedor; no modo automatico o proximo e tentado.
const UPLOAD_TIMEOUT_MS = 60000;

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
  // A API retorna a URL da pagina; o link direto usa /dl/.
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

function getSettings() {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get(
        { provider: 'auto', format: 'html', imgurClientId: '' },
        (items) => resolve(items || { provider: 'auto', format: 'html', imgurClientId: '' })
      );
    } catch {
      resolve({ provider: 'auto', format: 'html', imgurClientId: '' });
    }
  });
}

async function handleUpload(msg) {
  const settings = await getSettings();
  const wanted = msg.provider || settings.provider || 'auto';
  const file = makeFile(msg.bytes, msg.mime, msg.name);

  let order;
  if (wanted === 'auto') {
    order = [...AUTO_ORDER];
    // Com Client-ID configurado, o Imgur (permanente) entra primeiro.
    if (settings.imgurClientId) order.unshift('imgur');
  } else {
    order = [wanted];
  }

  const errors = [];
  for (const name of order) {
    try {
      const url = await UPLOADERS[name](file, msg.bytes, msg.mime, settings.imgurClientId);
      return { ok: true, url, provider: name, format: settings.format || 'html' };
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

// Exportado para teste em Node (sem chrome definido, o listener nao e registrado).
if (typeof globalThis !== 'undefined') {
  globalThis.__pastepic = { UPLOADERS, makeFile, AUTO_ORDER, handleUpload };
}

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.type !== 'PASTEPIC_UPLOAD') return false;
    handleUpload(msg)
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true; // resposta assincrona
  });
}
