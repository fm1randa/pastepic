---
name: verify-pastepic
description: Verify the PastePic Chrome extension (paste-to-upload flow) using a local CodeMirror 5 fixture with the real content.js and background.js. Use when changing content.js, background.js, popup.*, or manifest.json, or when a paste/upload/insertion bug is reported.
---

# Verify PastePic

The app is a Chrome MV3 extension with no build step and no local server: a
content script (`content.js`) intercepts image pastes in the ByteMD/CodeMirror 5
comment editor of TabNews and curso.dev, and a service worker (`background.js`)
uploads to free image hosts. Verification drives the REAL `content.js` and
`background.js` from the repo root in headless Chromium against a fixture page
that reproduces the real editor stack (CodeMirror 5.65.x, same major version as
the `bytemd@1.22.0` used by both sites).

All paths below are relative to this skill directory
(`.agents/skills/verify-pastepic/`).

## Launch

```sh
./launch.sh [port]          # or PASTEPIC_VERIFY_PORT=8931 ./launch.sh
```

Starts `helpers/fixture-server.mjs` on 127.0.0.1 (default port 8931) and waits
for readiness. Ready means this line is printed:

```text
fixture up at http://127.0.0.1:8931/fixture-cm5.html
```

The server serves the fixture page, CodeMirror 5 assets from
`helpers/node_modules/codemirror`, and the REAL extension files as
`/ext/content.js`, `/ext/background.js`, `/ext/popup.js`. The server refuses a
second instance while its pid file exists. First-time setup (run once):

```sh
npm install --prefix helpers --no-audit --no-fund   # playwright + codemirror 5
npx --prefix helpers playwright install chromium    # headless Chromium binary
```

Teardown (kills only the pid this run started; proof artifacts survive):

```sh
./cleanup.sh
```

## Doctor

Read-only gate. Run first whenever anything looks off; do not drive on FAIL:

```sh
node helpers/doctor.mjs            # or PASTEPIC_VERIFY_PORT=<port> node helpers/doctor.mjs
```

Checks every fixture route returns 200, the real extension files exist and pass
`node --check`, and the Chromium binary is present. Ends with `DOCTOR PASS`.

## Drive

One script per mapped feature (see `features/`). Every drive launches headless
Chromium with a FRESH profile, performs the user path, writes
`artifacts/<feature>/{screenshot.png,result.json}` plus `editor.txt` or
`editors.json` where it reads editor state, prints one `ok`/`FAIL` line per
check plus `RESULT PASS|FAIL`, and exits 0/1:

```sh
node helpers/drive-paste-image.mjs --run-id <id> [--provider auto] [--format html] [--out artifacts/paste-image-cm5]
node helpers/drive-two-editors.mjs --run-id <id> [--out artifacts/two-editors]
node helpers/drive-passthrough.mjs --run-id <id> [--out artifacts/paste-text-passthrough]
node helpers/drive-oversize.mjs --run-id <id> [--out artifacts/oversize-guard]
node helpers/drive-popup-settings.mjs --run-id <id> [--out artifacts/provider-format-settings]
```

`--port` overrides the fixture port on every script. `--provider` pins one
uploader on `drive-paste-image` only (real network either way); `drive-two-editors`
hardcodes litterbox. Default `auto` exercises the full fallback chain but can
take minutes (60s timeout per provider) — pin a fast provider for iteration, run
`auto` before handing over.

## Evidence

Proof standards for every run:

- Exercise the real user path: a real `ClipboardEvent` paste dispatched on the
  real CodeMirror 5 input field, through the real `content.js`, with the real
  `background.js` upload chain over the real network. Never call the editor API
  or `handleUpload` directly as a substitute for the paste.
- Capture the action AND the resulting state: placeholder shown, toast text,
  final editor value (`editor.txt`), screenshot.
- Verify side effects, not just pixels: extract the inserted URL and fetch it —
  HTTP 200 with `content-type: image/*`.
- The only mock is the production boundary the extension itself isolates: the
  `chrome.*` stub (`chrome.storage.sync` returns fixture settings,
  `chrome.runtime.sendMessage` runs the real `handleUpload`). No host, editor,
  or toast behavior is mocked.
- `result.json` records feature, run id, provider requested AND provider that
  actually served, and every check. It is the artifact of record alongside the
  screenshot.

## Isolation

- One fixture server per port; concurrent runs set `PASTEPIC_VERIFY_PORT` (and
  `--port`/`--out`) to distinct values. `launch.sh` refuses a second server on
  the same directory state.
- Each drive uses a fresh browser profile; no cookies, storage, or editor state
  leak between runs.
- Never drive a logged-in tabnews.com.br/curso.dev session: that is production
  state (posts comments publicly). The fixture is the only drive target.

## Cleanup

`./cleanup.sh` stops the fixture server via its pid file (never by process
name) and lists the surviving evidence. Run it after every attempt, failed or
not, so ports are not stranded. Do not delete `artifacts/` during cleanup.

## Helpers

All executable; invocations are shown above, not reverse-engineered:

- `launch.sh`, `cleanup.sh` — instance lifecycle.
- `helpers/fixture-server.mjs` — static fixture server (`--port`).
- `helpers/fixture-cm5.html` — fixture page (served, not opened directly).
- `helpers/doctor.mjs` — read-only health gate.
- `helpers/drive-paste-image.mjs` — core paste→upload→insert proof.
- `helpers/drive-passthrough.mjs` — text paste untouched.
- `helpers/drive-oversize.mjs` — >20MB rejection (no network needed).
- `helpers/drive-popup-settings.mjs` — popup persistence via `/popup-test.html`.

`helpers/node_modules/` is harness-only (Playwright, CodeMirror 5) and never
part of the extension.

## Verification ladder

One entry point runs the tiers that do not need a human:

```sh
node helpers/verify.mjs --level fast     # T0 + T1 + T2  (~10s, no extension)
node helpers/verify.mjs --level full     # + T3 + T4 + T5 (~2min, real extension)
node helpers/verify.mjs --level release  # full, and T5 must find >=2 healthy providers
```

| Tier | File | Proves | Cannot prove |
| --- | --- | --- | --- |
| T0 | `check-static.mjs` | manifest wiring, permissions vs `fetchT`, world fences, MV3 limits, zip = manifest closure | any runtime behavior |
| T1 | `t1-background.test.mjs` | uploader parsing, chain order, timeout, base64 transport | browser, worker, CORS |
| T2 | `drive-contract.mjs` | host protocol codes and client retry/cleanup, one side at a time | the world boundary |
| T3 | `t3-extension.mjs` | the REAL extension with DNS virtualised: worlds, `matches`, `host_permissions`, messages, real editor | real sites, real hosts |
| T4 | `t4-mutants.mjs` | that the suite goes red: 5 known bug classes must kill T3 | bug classes nobody imagined |
| T5 | `t5-canary.mjs` | the real uploaders work today (non-blocking) | CORS/Origin acceptance |
| T6 | human | the real TabNews/curso.dev DOM with a logged-in user | everything else |

T3 redirects `tabnews.com.br`, `curso.dev` and every upload host to a local HTTPS
server via `--host-resolver-rules`; Chrome still believes it is talking to them,
so the real manifest decides injection and permissions. The CORS canary proves
the upload came from the worker's `host_permissions`, not from the page.

`verify.mjs` always prints an `UNPROVEN` list. A green run never means "all".


## Gotchas

- Uploads run IN-PAGE in the fixture but in the SERVICE WORKER in production.
  Hosts without CORS headers log `CORS policy` console errors in-page while the
  chain correctly moves on — `drive-paste-image` filters exactly this noise and
  fails on any other console/page error. A CORS error here is scaffolding noise,
  never a product bug.
- In-page CORS also means some providers can never succeed in the fixture
  (only hosts sending `Access-Control-Allow-Origin` can). This harness proves
  interception + insertion + fallback logic + one live end-to-end upload; it
  does NOT prove the `host_permissions` path — that needs a loaded extension.
- `waitForFunction` resolves to a JSHandle in Playwright; read values with a
  separate `evaluate` (a past run failed by treating the handle as the value).
- Synthetic (untrusted) paste events perform no default insertion, so text
  passthrough is proven by non-interference (not prevented, no toast, no
  upload, field untouched) — see the passthrough feature file.
- Uploaded URLs rot (temporary hosts expire; litterbox ≤72h). The durable proof
  is `screenshot.png` + `editor.txt` + `result.json`, not the live URL.
- Headless-shell Chromium cannot load unpacked extensions, which is why the
  harness injects the real files instead of loading the extension.
