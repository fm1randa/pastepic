# Oversize image rejected

Pasting an image larger than 20MB is rejected: an error toast explains the
limit, the placeholder is withdrawn, and no upload is attempted.

## Sub-features

- `placeholder-shown` the placeholder is inserted before the size check (v2 order).
- `error-toast` the toast names the 20MB limit.
- `editor-clean` the placeholder is gone and no tag remains.
- `no-upload` the background is never called.

## How to get to it (user POV)

- Paste a >20MB image into the comment editor on tabnews.com.br/curso.dev.
- Fixture equivalent: `/fixture-cm5.html` CodeMirror instance with a 21MB synthetic PNG paste.

## Driving it with the fixture harness

Preconditions:

- Fixture server running: `./launch.sh`.
- `node helpers/doctor.mjs` ends with `DOCTOR PASS`.
- No network needed (rejection happens before any fetch).

- **Paste oversize.** Dispatch and assert rejection. Run `node helpers/drive-oversize.mjs --run-id <id> --out artifacts/oversize-<id>`. Checks: `placeholder-shown`, `error-toast` (within 10s), `editor-clean`, `no-upload`. Fastest proof in the map — use it as the harness smoke test.

## Gotchas

- The placeholder appears and is withdrawn; `placeholder-shown` is what makes `editor-clean` a retraction proof rather than an absence assertion.
- Cleanup depends on `session.release()`: if withdrawal fails, the user gets a second toast (`Nao consegui apagar o texto de envio`) and a stranded `⏳`. No driver covers that path.
- The 21MB buffer is allocated in-page; on a memory-constrained machine prefer this single driver over parallel drives.
- The per-host size limits are NOT covered here — only the extension-side 20MB guard.
