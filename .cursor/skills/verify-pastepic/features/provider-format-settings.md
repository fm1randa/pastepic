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
- Fixture equivalent: `/popup-test.html` — the REAL `popup.html` DOM and REAL `popup.js` with only `chrome.storage` stubbed (in-memory).

## Driving it with the fixture harness

Preconditions:

- `node helpers/doctor.mjs` ends with `DOCTOR PASS`.
- No network needed.

- **Defaults then save.** Load, verify defaults, change, save. Run `node helpers/drive-popup-settings.mjs --run-id <id>`. Checks: provider select is `auto` with HTML radio checked; after selecting `pomf` + Markdown + Salvar, `#status` reads `Salvo!` and the stored object is exactly `{provider:'pomf',format:'markdown',imgurClientId:''}`.
- **Imgur help toggle.** Same run also checks `#imgurHelpText` starts hidden with `aria-expanded="false"`, opens on `#imgurHelp` click (text mentions "fechou novos registros"), and closes on a second click.

## Gotchas

- The stub starts empty every run, so defaults always assert against `auto`/HTML — a run cannot observe previously saved values. Cross-run persistence of `chrome.storage.sync` is a browser feature, not extension logic, and is out of scope.
- `/popup-test.html` injects the stub server-side; `popup.html` itself is unmodified. If the popup's element IDs change, the injection point (`<script src="popup.js">`) and the driver selectors must move together.
- The global `button` rule fills the width; the `i` button overrides it via `button.info`. A new plain `button` in the popup would inherit the full-width style.
