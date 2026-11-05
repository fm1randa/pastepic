# Paste image into the comment editor

Pasting an image (Ctrl/Cmd+V) into an editor uploads it to a free host and
replaces the `⏳ Enviando imagem… [token]` placeholder with an `<img>` tag (or
Markdown), trying the next host when one fails. If the swap cannot find the
placeholder, the upload is not lost: the toast carries the URL.

## Sub-features

- `paste-intercept` cancels the normal paste and inserts the placeholder at the cursor.
- `upload-fallback` tries catbox → pomf → uguu → litterbox → tmpfiles (Imgur first when a Client-ID is set) until one returns a URL.
- `tag-insert` replaces the placeholder with the tag by text search; a missing placeholder is reported, never guessed at the cursor.
- `tag-live` the inserted URL actually serves the image (2xx, `image/*`).
- `toast-names-provider` the success toast names the host that served.
- `multi-image` several images in one clipboard are uploaded sequentially as ` 1/N`.
- `honest-failure` upload-ok/insert-failed hands over the URL instead of claiming success.

## How to get to it (user POV)

- Copy an image, focus the comment editor on tabnews.com.br or curso.dev, press Ctrl+V / Cmd+V. (Production path; never drive logged-in — use the fixture equivalent below.)
- Fixture equivalent: `/fixture-cm5.html` served by the fixture server, with a real `ClipboardEvent` paste carrying a PNG file.

## Driving it with the fixture harness

Preconditions:

- Fixture server running: `./launch.sh` printed `fixture up at http://127.0.0.1:8931/fixture-cm5.html`.
- `node helpers/doctor.mjs` ends with `DOCTOR PASS`.
- Network access to the upload hosts (real upload; the `chrome.*` stub is the only mock).

- **Pinned provider (fast iteration).** Paste and wait for insertion. Run `node helpers/drive-paste-image.mjs --provider litterbox --run-id <id> --out artifacts/paste-image-cm5-<id>`. Checks: `cm5-present`, `paste-dispatched`, `paste-intercepted`, `placeholder-shown`, `success-toast` (names the serving host), `tag-inserted`, `placeholder-gone`, `url-serves-image` (2xx + `image/*`), `no-page-errors`. `editor.txt` holds `<img src="https://…">`.
- **Full chain.** Same command with `--provider auto`. Slow (minutes when early hosts hang); the fallback loop is the point. Use a fresh `--out` so it cannot be confused with a pinned run.
- **Markdown format.** `node helpers/drive-paste-image.mjs --provider litterbox --format markdown --run-id <id> --out artifacts/paste-image-md-<id>`. The `tag-inserted` check looks for the Markdown shape.
- **Proof.** Keep `artifacts/<out>/{screenshot.png,editor.txt,result.json}`. `result.json` records the requested provider AND `usedProvider`.

## Gotchas

- `--provider` is a fixture knob, not a product setting: it is injected through the `chrome.storage.sync` stub. In the product the popup controls it.
- Failed providers log CORS errors in-page (uploads run in-page here, in the service worker in production). Filtered by the driver; only unexpected console errors fail.
- Only CORS-open hosts can complete in-page; a provider that fails here may still work in production. Failure of the PINNED host fails the run; failure of an early host in `auto` is the fallback working.
- Temporary-host URLs rot (litterbox ≤72h). Re-fetching an old `editor.txt` URL later proves nothing; the screenshot + `result.json` are the durable proof.
- A 6-minute stall is not a slow host: the driver waits for any terminal toast, so a stall means no toast at all (bridge wedged). Check `[PastePic]` logs.
