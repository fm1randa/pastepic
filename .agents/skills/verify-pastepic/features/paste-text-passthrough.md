# Text paste passes through

Pasting text in any field behaves exactly as without the extension: no
interception, no toast, no upload, content untouched.

## Sub-features

- `not-prevented` a text paste in a plain field is not cancelled.
- `field-untouched` the plain field keeps its exact value.
- `cm-untouched` the CodeMirror editor keeps its exact value.
- `no-side-effects` no toast appears and the background is never called, in either field.

## How to get to it (user POV)

- Focus any comment box or text field on tabnews.com.br/curso.dev, paste plain text.
- Fixture equivalent: `#plain` textarea and the CodeMirror input field on `/fixture-cm5.html`, each with a `text/plain` paste.

## Driving it with the fixture harness

Preconditions:

- Fixture server running: `./launch.sh`.
- `node helpers/doctor.mjs` ends with `DOCTOR PASS`.
- No network needed.

- **Paste text in both fields.** Run `node helpers/drive-passthrough.mjs --run-id <id>`. Checks: `not-prevented`, `field-untouched`, `no-upload`, `no-toast` for the textarea; `cm-untouched`, `cm-no-upload`, `cm-no-toast` for the editor.

## Gotchas

- Synthetic (untrusted) paste events perform no default insertion in any browser, so there is no inserted text to assert. Proof is non-interference, not insertion — do not "fix" the driver to expect inserted text.
- Since v2 the image check runs before the editable gate, so a text paste returns at `if (!images.length) return` and never evaluates `isEditableGate`. This feature proves the early return, not target classification.
- Typing is not covered here; only pasting.
