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
- Press the `i` next to "Imgur Client-ID (opcional)" to read why the field only serves legacy client IDs.
- Fixture equivalent: `/popup-test.html` — the REAL built popup (`dist/popup/index.html` and its bundle) with only `chrome.storage` stubbed. `?stored=<json>` seeds what storage already holds.

## Driving it with the fixture harness

Preconditions:

- Fixture server running: `./launch.sh`.
- `node helpers/doctor.mjs` ends with `DOCTOR PASS`.
- No network needed.

- Precondition: `npm run build` at the repo root.
- **Defaults, help toggle, save, round trip.** Run `node helpers/drive-popup-settings.mjs --run-id <id> --out artifacts/popup-<id>`. Controls are found by role and accessible name. Checks: `defaults-loaded` (provider `auto`, HTML radio checked), `imgur-help-hidden`, `imgur-help-opens` (text mentions "fechou novos registros"), `imgur-help-closes`, `reuse-option-off-by-default`, `reuse-help-opens` (independent of the Imgur help), `choices-shown` (pomf picked by clicking the Select), `color-scheme-follows-system`, `saved-feedback` ("Salvo!"), `settings-persisted` (exactly `{provider:'pomf', format:'markdown', imgurClientId:'', sameProviderOnly:true}`), `closes-after-save`, `no-page-errors`, `stored-values-load` (litterbox + markdown from storage), `round-trip-saves-trimmed`, `unknown-stored-values-fall-back`. Writes `screenshot-light.png` and `screenshot-dark.png`.

## Gotchas

- The stub records the last `set` and answers `get` from `?stored=`; it does not persist across page loads. Cross-run persistence of `chrome.storage.sync` is a browser feature and is out of scope.
- `/popup-test.html` injects the stub server-side before the first `<script` of the built html; `popup/index.html` itself is unmodified. The stub also replaces `window.close` so the drive can assert the close after save.
- The Select trigger's `textContent` includes Base UI's hidden `▼` glyph; the drive reads the accessible value from the ARIA snapshot instead.
- The popup hint hardcodes the auto chain (`popup/src/App.tsx`) instead of reading `limits.js`, and mentions a "catbox pausado" state that the code does not model — fallback happens on any provider error. Nothing asserts the hint text.
