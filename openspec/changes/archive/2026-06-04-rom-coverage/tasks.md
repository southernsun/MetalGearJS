> Denominator = gameplay code only (`logic/`, `data/`, actor/room/HUD); hardware init,
> PSG/sound-driver internals, and copy-protection are `out-of-scope`. Numerator is curated.
> Routine labels parse as `^[A-Za-z_]\w*:` at column 0 (same convention as the C# tools).

## 1. Coverage map (curated numerator)

- [x] 1.1 Define the map schema and create `Tools/coverage/coverage-map.json`: components, each with `asmFiles`, optional explicit `routines` (for shared mega-files like `Banks0123.asm`), per-routine/file `status` (`done`/`partial`/`todo`/`out-of-scope`), `jsRef`, and `notes`
- [x] 1.2 Seed components from shipped changes: `snake-movement`, `room-traversal`, `doors`, `guard`, `player-damage-hud`, `asset-export`, `audio-export` — populate each with the ROM routines/files those changes cite (see design table), marked `done`/`partial`
- [x] 1.3 Mark the known non-portable areas `out-of-scope` (MSX hardware init, PSG/sound-driver internals, copy-protection) so they're excluded from denominators

## 2. Coverage script (auto denominator + report)

- [x] 2.1 `Tools/coverage/coverage.mjs`: parse the `.asm` files assigned to each component for routine labels (and line counts) to build the denominator
- [x] 2.2 Merge the curated statuses over the parsed routine set; unmapped in-scope routines default to `todo`; exclude `out-of-scope` from totals
- [x] 2.3 Validate the map: report any map-named routine/file that is absent from the disassembly (warn/error, don't miscount)
- [x] 2.4 Compute per-component and overall coverage (`done`, `partial`, total, %); decide `partial` weighting (report separately + a blended "done + ½·partial" %)
- [x] 2.5 Print a console table; support a `--check` mode (non-zero exit if `docs/rom-coverage.md` is stale vs the computed result) for future CI use

## 3. Generated documentation

- [x] 3.1 Render `docs/rom-coverage.md` from the script: per-component table (sources, done/partial/total, %), an overall line, and a generated-on note
- [x] 3.2 Add the honesty note: "translated" is a curated judgement, faithfulness varies (some entries are approximations/divergences), denominator is gameplay-only, and how to refresh (`node Tools/coverage/coverage.mjs`)

## 4. Verification

- [x] 4.1 Run the script; confirm denominators match a manual spot-count (e.g. `guard` routines in `guardalert.asm`/`guardshot.asm`/`chkdiscover.asm`)
- [x] 4.2 Confirm `out-of-scope` routines are excluded and that an intentionally-bad map entry is reported by the validator
- [x] 4.3 Confirm the seeded percentages look sane (guard/doors/movement non-trivial; untouched systems near 0) and `docs/rom-coverage.md` regenerates deterministically
- [x] 4.4 README/pointer: note the coverage tool + doc location so it's discoverable
