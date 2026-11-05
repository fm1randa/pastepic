# Provider and format settings

The extension popup lets the user pick the image host (or automatic fallback),
the tag format (HTML `<img>` vs Markdown `![](...)`), and an optional legacy
Imgur Client-ID; saving persists the choices and confirms with "Salvo!".

## Sub-features

- `settings-defaults` fresh popup shows automatic provider + HTML format.
- `settings-save` choosing host + format persists all three fields and confirms.
- `settings-imgur-help` the "i" button reveals/hides the Imgur registration note, and the note is hidden on open.

## How to get to it (user POV)

- Click the extension icon (popup) on any page, change the fields, press Salvar.
- Press the round `i` next to "Imgur Client-ID (opcional)" to read why the field only serves legacy client IDs.
- Fixture equivalent: `/popup-test.html` — the REAL `popup.html` DOM and REAL `popup.js` with only `chrome.storage` stubbed.

## Driving it with the fixture harness

Preconditions:

- Fixture server running: `./launch.sh`.
- `node helpers/doctor.mjs` ends with `DOCTOR PASS`.
- No network needed.

- **Defaults, help toggle, save.** Run `node helpers/drive-popup-settings.mjs --run-id <id> --out artifacts/popup-<id>`. Checks: `defaults-loaded` (provider `auto`, HTML radio checked), `imgur-help-hidden`, `imgur-help-opens` (text mentions "fechou novos registros"), `imgur-help-closes`, `saved-feedback` ("Salvo!"), `settings-persisted` (`{provider:'pomf', format:'markdown', imgurClientId:''}`).

## Gotchas

- The stub returns the same defaults on every `get` and records the last `set`; it does not round-trip. Cross-run persistence of `chrome.storage.sync` is a browser feature and is out of scope.
- `settings-persisted` compares three values, not object identity: an extra key written by `popup.js` would still pass.
- `/popup-test.html` injects the stub server-side; `popup.html` itself is unmodified. If the popup's element IDs change, the injection point (`<script src="popup.js">`) and the driver selectors must move together.
- The popup hint hardcodes the auto chain (`popup.html`) instead of reading `limits.js`, and mentions a "catbox pausado" state that the code does not model — fallback happens on any provider error. Nothing asserts the hint text.
- The global `button` rule fills the width; the `i` button overrides it via `button.info`. A new plain `button` in the popup would inherit the full-width style.
