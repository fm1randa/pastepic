<!-- translated from README.md @ fcc993c (base: fcc993c; readme-blob: 12df25c2e58f1a153ba24029ff620e8c31cb91fe); when README.md changes, sync this file and update the SHA and readme-blob (git hash-object README.md) -->
[Português (Brasil)](README.md) · **English**

> The Portuguese [README.md](README.md) is the reference version; this English translation may lag behind it.

# PastePic

Chrome extension (Manifest V3) that pastes clipboard images straight into a text editor:

1. Copy an image (screenshot, `Cmd+Shift+Ctrl+4`, right click → Copy image, etc.).
2. Click the editor and press **Cmd+V** (macOS) or **Ctrl+V**.
3. The extension uploads the image to a free host **with no account required** and inserts `<img src="...">` (or Markdown) where the cursor was.

Text pastes keep working normally — the extension only acts when the clipboard holds an image.

Today it ships enabled for **TabNews** and **curso.dev**, where it was tested end to end. The logic is generic (any `textarea`, `input` or `contenteditable`; plus ByteMD/CodeMirror 5 editors through the bridge), so more sites can be added in `manifest.json` — see "Adding other sites".

## Editor compatibility (ByteMD/CodeMirror)

The comment box on TabNews and curso.dev is not a plain `<textarea>`: it is the ByteMD editor (CodeMirror 5 underneath). Chrome content scripts run in an isolated world and **cannot see** the `element.CodeMirror` property the page set — that is why `page-bridge.js` exists, declared with `"world": "MAIN"`, running as a page script and calling the editor's native API (`replaceRange`/`markText`). `content.js` talks to it through DOM events carrying JSON payloads. In plain text fields the insertion goes through `value` plus `input`/`change` events (React-compatible); in CodeMirror 6/`contenteditable` it uses `execCommand('insertText')` as a best effort.

## How it works

- `content.js` listens for the `paste` event on the document. Image found? It cancels the paste, shows `⏳ Enviando imagem...` at the cursor and sends the bytes to `background.js`.
- `page-bridge.js` (page world) swaps the placeholder for the tag on the real CodeMirror 5 instance.
- `background.js` (service worker) does the upload. The upload runs in the extension (not the page) because hosts such as catbox.moe send no CORS headers for sites — under `host_permissions` the extension can call the API directly.
- Order in **automatic** mode: `catbox.moe` → `pomf.lain.la` → `uguu.se` → `litterbox` (72h) → `tmpfiles.org`. If one is down (catbox and 0x0.st were paused in Nov 2026), it tries the next.
- Optional: if you own an **old Imgur Client-ID**, set it in the popup for permanent Imgur uploads. Note: Imgur **closed new application registrations** (the `api.imgur.com/oauth2/addclient` page redirects home, with no reopening in sight), so a new Client-ID can no longer be created.
- Insertion format configurable in the popup: HTML `<img src="...">` (default) or Markdown `![](...)`.

## Installation (developer mode)

1. Download/unzip this folder (or `pastepic.zip`).
2. Open `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the `pastepic` folder.
5. Open a TabNews post or a curso.dev lesson (logged in), click the comment box and paste the image with Cmd/Ctrl+V.

To update after editing files: click the ⟳ (reload) icon on the extension card in `chrome://extensions`.

## Adding other sites

The extension is already generic; what limits it is the list of domains in `manifest.json`, in both `content_scripts` entries (the `page-bridge.js` one and the `content.js` one). To enable a new site:

1. Add the URL pattern to **both** `matches` lists (e.g. `"https://example.com/*"`).
2. Reload the extension in `chrome://extensions` and reload the page (an already-injected content script is not updated).
3. Paste an image and watch the console: `[PastePic] swap {...}` tells which editor `kind` was used (`cm5`, `plain`, `contenteditable`) and the result code.

If insertion fails, the toast shows the URL so you can paste it manually. Editors supported today: ByteMD/CodeMirror 5 (through the bridge), `<textarea>`/`<input>` and `contenteditable`. CodeMirror 6, ProseMirror/TipTap and Monaco are recognized but answer `unsupported` — the toast says so and nothing is written in the wrong place.

Avoid enabling it on sites that already handle image pastes natively (GitHub, GitLab, Discourse, Notion): the extension would intercept the paste and send it to its own hosts instead of the site's native upload.

## Files

| File             | Role                                                            |
| ---------------- | --------------------------------------------------------------- |
| `manifest.json`  | MV3 manifest: permissions, content scripts, popup                |
| `content.js`     | Intercepts the paste, opens the session, uploads, shows toasts   |
| `editor-session.js` | Editing session: anchor, swap retry, verified `release`       |
| `page-bridge.js` | Page world: editor detection, adapters, single writer            |
| `limits.js`      | Provider chain and timeouts (the response guard is derived)      |
| `background.js`  | Upload to the free hosts + fallback                              |
| `popup.html/js`  | Provider, format and Imgur Client-ID settings                    |

## Limits and troubleshooting

- Images up to 20 MB (extension limit; each host has its own).
- Temporary hosts (uguu, litterbox, tmpfiles) delete the file after hours — for permanent comments prefer catbox/pomf/Imgur.
- Every upload attempt has a 60s timeout: if a server hangs, automatic mode moves on instead of leaving `⏳ Enviando imagem...` stuck. The overall response guard is derived from the chain (`60s × (providers + 1) + 15s`), 375s today.
- If the placeholder gets stuck or an error appears: open `chrome://extensions`, click **reload (⟳)** on the extension card and try again. To see the exact error, enable developer mode in `chrome://extensions` and click **service worker** on the extension card to open its console (errors are prefixed with `[PastePic]`).
