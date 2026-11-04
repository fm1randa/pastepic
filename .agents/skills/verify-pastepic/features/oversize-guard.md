# Oversize image rejected

Pasting an image larger than 20MB is rejected locally: an error toast explains
the limit, the placeholder is removed, and no upload is attempted.

## Sub-features

- `size-toast` the toast names the 20MB limit.
- `editor-clean` no placeholder or tag remains in the editor.
- `no-upload-attempt` the background is never called.

## How to get to it (user POV)

- Paste a >20MB image into the comment editor on tabnews.com.br/curso.dev.
- Fixture equivalent: `/fixture-cm5.html` CodeMirror instance with a 21MB synthetic PNG paste.

## Driving it with the fixture harness

Preconditions:

- `node helpers/doctor.mjs` ends with `DOCTOR PASS`.
- No network needed (rejection happens before any fetch).

- **Paste oversize.** Dispatch and assert rejection. Run `node helpers/drive-oversize.mjs --run-id <id>`. Checks: toast contains `maior que 20 MB` within 10s, editor has neither `⏳` nor `<img`, zero uploads. Fastest proof in the map — use it as the harness smoke test.

## Gotchas

- The 21MB buffer is allocated in-page; on a memory-constrained machine prefer this single driver over parallel drives.
- The per-host size limits (each host enforces its own, smaller or larger) are NOT covered here — only the extension-side 20MB guard.
