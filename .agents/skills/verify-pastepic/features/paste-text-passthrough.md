# Text paste passes through

Pasting text (or typing) in any field behaves exactly as without the extension:
no interception, no toast, no upload, field content untouched.

## Sub-features

- `text-not-prevented` a text paste event is not cancelled.
- `no-side-effects` no toast appears and the background is never called.

## How to get to it (user POV)

- Focus any comment box or text field on tabnews.com.br/curso.dev, paste plain text.
- Fixture equivalent: `#plain` textarea on `/fixture-cm5.html` with a `text/plain` paste.

## Driving it with the fixture harness

Preconditions:

- `node helpers/doctor.mjs` ends with `DOCTOR PASS`.
- No network needed.

- **Paste text.** Dispatch the paste and assert non-interference. Run `node helpers/drive-passthrough.mjs --run-id <id>`. Checks: event not prevented, field value byte-identical, zero uploads, no toast element. `RESULT PASS` with 4/4 checks.

## Gotchas

- Synthetic (untrusted) paste events perform no default insertion in any browser, so there is no inserted text to assert. Proof is non-interference, not insertion — do not "fix" the driver to expect inserted text.
- This recipe covers the plain-field path; the CodeMirror path ignores text pastes by the same early return (`if (!images.length) return`).
