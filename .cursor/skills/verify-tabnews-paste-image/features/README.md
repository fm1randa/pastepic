# TabNews Paste Image verification map

This directory is the maintained source for verifying the user-facing behavior
of the TabNews Paste Image extension. Read this index before driving, then use
the matching feature file as the recipe.

## Baseline preconditions

- Fixture server up via `./launch.sh` (default `http://127.0.0.1:8931`).
- `node helpers/doctor.mjs` ends with `DOCTOR PASS`.
- Each drive uses a fresh browser profile; no login or production site is used.
- Pass a distinct `--run-id` per run; use `--out` to keep concurrent runs apart.

## Driving conventions

- Start every recipe from the baseline state unless its preconditions say otherwise.
- Run drives with `node helpers/drive-<feature>.mjs --run-id <id>` from the skill directory.
- Treat every command as literal. Keep provider names and flags unchanged.
- Proof = `result.json` (all checks pass) + screenshot + editor value where applicable.
- Report an unreachable path with the attempted command and the unmet precondition.
- Do not report a path verified through a different entry point as covering the listed one.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the
user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with the fixture harness` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable
handles, required state, commands, and observable proof.

## Features

- [Paste image into the comment editor](./paste-image-cm5.md) covers image paste, placeholder, upload fallback, tag insertion, and expiry-safe proof.
- [Text paste passes through](./paste-text-passthrough.md) covers non-interference with normal typing/pasting.
- [Provider and format settings](./provider-format-settings.md) covers the popup choices and their persistence.
- [Oversize image rejected](./oversize-guard.md) covers the 20MB guard, error feedback, and a clean editor.
