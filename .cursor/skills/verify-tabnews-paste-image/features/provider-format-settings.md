# Provider and format settings

The extension popup lets the user pick the image host (or automatic fallback),
the tag format (HTML `<img>` vs Markdown `![](...)`), and an optional legacy
Imgur Client-ID; saving persists the choices and confirms with "Salvo!".

## Sub-features

- `settings-defaults` fresh popup shows automatic provider + HTML format.
- `settings-save` choosing host + format persists all three fields and confirms.

## How to get to it (user POV)

- Click the extension icon (popup) on any page, change the fields, press Salvar.
- Fixture equivalent: `/popup-test.html` — the REAL `popup.html` DOM and REAL `popup.js` with only `chrome.storage` stubbed (in-memory).

## Driving it with the fixture harness

Preconditions:

- `node helpers/doctor.mjs` ends with `DOCTOR PASS`.
- No network needed.

- **Defaults then save.** Load, verify defaults, change, save. Run `node helpers/drive-popup-settings.mjs --run-id <id>`. Checks: provider select is `auto` with HTML radio checked; after selecting `pomf` + Markdown + Salvar, `#status` reads `Salvo!` and the stored object is exactly `{provider:'pomf',format:'markdown',imgurClientId:''}`.

## Gotchas

- The stub starts empty every run, so defaults always assert against `auto`/HTML — a run cannot observe previously saved values. Cross-run persistence of `chrome.storage.sync` is a browser feature, not extension logic, and is out of scope.
- `/popup-test.html` injects the stub server-side; `popup.html` itself is unmodified. If the popup's element IDs change, the injection point (`<script src="popup.js">`) and the driver selectors must move together.
