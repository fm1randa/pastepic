# Paste image into the comment editor

Pasting an image (Ctrl/Cmd+V) into the TabNews/curso.dev comment editor uploads
it to a free host and replaces the `⏳ Enviando imagem…` placeholder with an
`<img>` tag (or Markdown), trying the next host when one fails.

## Sub-features

- `paste-intercept` cancels the normal paste and shows the placeholder at the cursor.
- `upload-fallback` tries catbox → pomf → uguu → litterbox → tmpfiles until one serves.
- `tag-insert` replaces the placeholder with the tag even if the user kept typing.
- `tag-live` the inserted URL actually serves the image (HTTP 200, image/*).
- `toast-names-provider` the success toast names the host that served.

## How to get to it (user POV)

- Copy an image, focus the comment editor on tabnews.com.br or curso.dev, press Ctrl+V / Cmd+V. (Production path; never drive logged-in — use the fixture equivalent below.)
- Fixture equivalent: `/fixture-cm5.html` CodeMirror 5 instance with a real `ClipboardEvent` paste carrying a PNG file.

## Driving it with the fixture harness

Preconditions:

- `node helpers/doctor.mjs` ends with `DOCTOR PASS`.
- Network access to the upload hosts (real upload; no mocks in this path).

- **Full chain (default).** Paste and wait for insertion. Run `node helpers/drive-paste-image.mjs --run-id <id>`. The `success-toast` names the serving host, `editor.txt` holds `<img src="https://…">`, and `url-serves-image` confirms the bytes. Slow path (minutes when early hosts hang); the run that proved this skill fell through to litterbox.
- **Pinned provider (fast iteration).** Same flow against one host. Run `node helpers/drive-paste-image.mjs --provider litterbox --run-id <id> --out artifacts/paste-image-cm5-<id>`. All 9 checks pass in seconds when the host is healthy.
- **Markdown format.** Same flow asserting `![](url)`. Run `node helpers/drive-paste-image.mjs --provider litterbox --format markdown --run-id <id> --out artifacts/paste-image-md-<id>`. The `tag-inserted` check looks for the Markdown shape.
- **Proof.** Keep `artifacts/<out>/{screenshot.png,editor.txt,result.json}`. `result.json` records the requested provider AND `usedProvider`.

## Gotchas

- Failed providers log CORS errors in-page (uploads run in-page here, in the service worker in production). Filtered by the driver; only unexpected console errors fail.
- Only CORS-open hosts can complete in-page; a provider that fails here may still work in production. Failure of the PINNED host fails the run; failure of an early host in `auto` is the fallback working.
- Temporary-host URLs rot (litterbox ≤72h). Re-fetching an old `editor.txt` URL later proves nothing; the screenshot + `result.json` are the durable proof.
- `waitForFunction` returns a JSHandle — the driver reads toast text via a separate `evaluate`.
