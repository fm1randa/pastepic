# Two editors on one page

With more than one CodeMirror instance mounted, a paste must land in the editor
that received it. The pre-adapter host resolved the first `.CodeMirror` in the
document, so a paste in the second editor wrote into the first.

## Sub-features

- `two-editors-mounted` the fixture mounts a second editor before the target.
- `other-editor-is-first` the decoy is genuinely first in DOM order.
- `tag-in-target-editor` the paste lands in the editor that received the event.
- `other-editor-untouched` the decoy keeps its original text.
- `no-placeholder-left` neither editor keeps a `⏳`.

## How to get to it (user POV)

- Open a page with two editors, click the second one, paste an image.
- Fixture equivalent: `/fixture-cm5.html?two=1` — `#editor2` mounts first, the
  paste is dispatched on `#editor`'s input field.

## Driving it with the fixture harness

Preconditions:

- `node helpers/doctor.mjs` ends with `DOCTOR PASS`.
- Network access to the upload hosts (real upload; `provider=litterbox` pins a
  fast one).

- **Paste into the second editor.** Run `node helpers/drive-two-editors.mjs --run-id <id>`. Checks: both instances exist, the decoy is first, the upload finishes, the target holds the `<img>` tag, the decoy still reads `other editor text`, and neither contains `⏳`. Artifacts: `editors.json`, `screenshot.png`, `result.json`.

## Gotchas

- The decoy must be created BEFORE the target in DOM order, otherwise the old
  first-match bug would not be exercised and the test would pass vacuously.
- This is the regression that proves the adapter host resolves by anchor, not by
  document order. If someone reintroduces `document.querySelector('.CodeMirror')`,
  `other-editor-untouched` fails.
