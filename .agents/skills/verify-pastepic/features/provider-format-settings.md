# Provider and format settings

The extension popup lets the user pick the image host (or automatic fallback),
the tag format (HTML `<img>` vs Markdown `![](...)`), and an optional legacy
Imgur Client-ID; saving persists the choices and confirms with "Salvo!".

## Sub-features

- `settings-defaults` fresh popup shows automatic provider + HTML format.
- `settings-save` choosing host + format persists all three fields and confirms.
- `settings-help-tooltips` the help buttons (automatic chain, Imgur, link reuse) show their notes in a tooltip on hover or keyboard focus; no note is visible on open.

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
- **Defaults, help tooltips, save, round trip.** Run `node helpers/drive-popup-settings.mjs --run-id <id> --out artifacts/popup-<id>`. Controls are found by role and accessible name. Checks: `advanced-collapsed-by-default` (Imgur Client-ID and reuse option hidden under "Opções avançadas"), `advanced-expands`, `defaults-loaded` (provider `auto`, HTML radio checked), `help-hidden-at-start`, `provider-help-on-hover` (tooltip lists the automatic chain), `imgur-help-on-hover` (tooltip mentions "fechou novos registros"), `imgur-help-closes`, `reuse-option-off-by-default`, `reuse-help-on-focus` (keyboard focus shows only the reuse note), `auto-order-default`, `auto-order-edges-disabled`, `auto-order-moves` (Subir uguu), `provider-help-follows-order`, `choices-shown` (pomf picked by clicking the Select), `auto-order-only-in-auto`, `color-scheme-follows-system`, `saved-feedback` ("Salvo!"), `settings-persisted` (exactly `{provider:'pomf', format:'markdown', imgurClientId:'', sameProviderOnly:true, autoOrder:[catbox, uguu, pomf, litterbox, tmpfiles]}`), `closes-after-save`, `no-page-errors`, `advanced-open-when-set` (non-default advanced values open the section), `stored-values-load` (litterbox + markdown from storage), `round-trip-saves-trimmed`, `custom-order-opens-advanced`, `stored-order-resolves` (unknown and repeated names dropped, missing hosts appended), `order-restores`, `unknown-stored-values-fall-back`. Writes `screenshot-collapsed.png`, `screenshot-auto-order.png`, `screenshot-light.png`, `screenshot-dark.png`, `screenshot-tooltip-reuse.png`, `screenshot-tooltip-imgur.png` and `screenshot-tooltip-provider.png`.

## Gotchas

- The stub records the last `set` and answers `get` from `?stored=`; it does not persist across page loads. Cross-run persistence of `chrome.storage.sync` is a browser feature and is out of scope.
- `/popup-test.html` injects the stub server-side before the first `<script` of the built html; `popup/index.html` itself is unmodified. The stub also replaces `window.close` so the drive can assert the close after save.
- The Select trigger's `textContent` includes Base UI's hidden `▼` glyph; the drive reads the accessible value from the ARIA snapshot instead.
- The popup hint hardcodes the auto chain (`popup/src/App.tsx`) instead of reading `limits.js`, and mentions a "catbox pausado" state that the code does not model — fallback happens on any provider error. Nothing asserts the hint text.
