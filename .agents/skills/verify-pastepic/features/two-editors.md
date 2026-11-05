# Two editors on one page

With more than one CodeMirror instance mounted, a paste must land in the editor
that received it. The pre-adapter host resolved the first `.CodeMirror` in the
document, so a paste in the second editor wrote into the first.

## Sub-features

- `two-editors-mounted` the fixture mounts a second editor before the target.
- `other-editor-is-first` the decoy is genuinely first in DOM order.
- `tag-in-target-editor` the paste lands in the editor that received the event.
- `other-editor-untouched` the decoy keeps its original text.

## How to get to it (user POV)

- Open a page with two editors, click the second one, paste an image.
- Fixture equivalent: `/fixture-cm5.html?two=1` — `#editor2` mounts first, the
  paste is dispatched on `#editor`'s input field.

## Driving it with the fixture harness

Preconditions:

- Fixture server running: `./launch.sh`.
- `node helpers/doctor.mjs` ends with `DOCTOR PASS`.
- Network access (the driver hardcodes `provider=litterbox`).

- **Paste into the second editor.** Run `node helpers/drive-two-editors.mjs --run-id <id> --out artifacts/two-editors-<id>`. Checks: both instances exist, the decoy is first in DOM order, the upload finishes, the target holds the `<img>` tag, the decoy still reads `other editor text`. Artifacts: `editors.json`, `screenshot.png`, `result.json` (records `provider` and `usedProvider`).

## Gotchas

- The decoy must be created BEFORE the target in DOM order, otherwise the old
  first-match bug would not be exercised and the test would pass vacuously.
  `other-editor-is-first` is what proves non-vacuity.
- A regression in the INSERT path is caught by `other-editor-untouched`. A
  regression in the SWAP path is not: `replaceNeedle` returns false on the decoy
  because the needle is not there, so the decoy stays clean. That one shows up
  as `tag-in-target-editor` failing with a leftover `⏳`.
- Always pass a fresh `--out`. A failed `page.goto` exits before writing
  `result.json`, so a reused directory would leave a stale PASS behind.
