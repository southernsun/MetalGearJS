## Context

The browser port (`web/game.js` + the `Tools/` exporters) reimplements Metal Gear MSX slice by
slice. Each openspec change cites the ROM routines it ports, and `game.js` comments cite source
files/constants — but there's no aggregate view of progress. The user wants a per-component
coverage metric: identify a component's ROM `.asm` and track how much is translated.

The disassembly is sizeable and already well-structured by folder:

- `logic/` — ~106 files, ~20,351 lines, ~1,353 routine labels (the bulk of gameplay: actors,
  collisions, controls, damage, hud, checkpoints, …; `logic/actors/` holds per-enemy files like
  `guard.asm`, `guardalert.asm`, `guardshot.asm`, `chkdiscover.asm`).
- `data/` — ~39 files, ~11,508 lines (tables: sprites, rooms, paths, shapes, …).
- `gfx/` — ~24 files, `sound/` — ~45 files, `constants/` — ~35 files.

Routine labels are easy to parse: a routine begins at a line matching `^[A-Za-z_]\w*:` at
column 0 (the same convention the existing C# tools' `ParseDbSegments` keys on). That gives a
reliable automated denominator.

Constraint from the user: **gameplay code only** in the denominator — hardware init, the
PSG/sound-driver internals, and copy-protection are `out-of-scope`.

## Goals / Non-Goals

**Goals:**

- A single curated map (machine-readable) of components → ROM routines/files → status + JS pointer.
- A script that parses the `.asm` for denominators (routine labels + lines), reads the map, and
  prints per-component + overall coverage, excluding `out-of-scope`.
- A generated `docs/rom-coverage.md` that's honest about the curated, approximate nature.
- Seeded from the citations in our shipped changes so it's immediately useful.

**Non-Goals:**

- Translating any new ROM code (tracking only).
- Auto-detecting JS↔asm correspondence (numerator stays curated).
- Instruction/line-level diff coverage, a UI/dashboard, or CI gating (could come later).

## Decisions

### 1. Node CLI, not C#

The existing exporters are C#/WPF, but a coverage tool is cross-cutting and benefits from zero
build friction. A small Node script (already used to serve/verify `web/`) can parse `.asm` and
render markdown with no toolchain. *Alternative:* a C# console in `Tools/` — rejected for the
build step and because it isn't sprite/audio work. Place it at `Tools/coverage/coverage.mjs`
(or `scripts/coverage.mjs`).

### 2. The map is the source of truth; the denominator is parsed

A curated file (`Tools/coverage/coverage-map.json`) lists components, each with:
`{ asmFiles: [...], routines: [...]?, status overrides, jsRef, notes }`. The script parses the
named `.asm` files for `^label:` definitions to get the routine set (denominator). Per-routine
status comes from the map; a routine present in source but absent from the map counts as `todo`
(so new ROM areas show as uncovered by default). A map entry naming a missing routine/file is
reported, not silently dropped. *Alternative:* hand-typed totals — rejected (rots immediately).

### 3. Component granularity mirrors our changes

Seed components matching shipped slices, so each maps cleanly to a change's citations:

| Component | Primary ROM sources (seed) |
|---|---|
| `snake-movement` | `logic/controls.asm`, `logic/collisions.asm`, player-move in `Banks0123.asm`, `data/playersprite.asm` |
| `room-traversal` | room load/connection logic + `data/` room/connection tables |
| `doors` | door draw/erase + door data tables |
| `guard` | `logic/actors/guard.asm`, `guardalert.asm`, `guardshot.asm`, `chkdiscover.asm` |
| `player-damage-hud` | `logic/hud.asm`, `logic/touchenemy.asm`, `SetDead`/`DeadLogic`, `data/shapes.asm` |
| `asset-export` | `gfx/` sprite/room/door/icon decode (offline tooling) |
| `audio-export` | `sound/` SFX/music render (offline tooling) |

Routines that are `Banks0123.asm` sub-pieces (e.g. `InitPlayerVars`, `SetSprDead`) are listed
by label rather than whole-file, since that mega-file mixes many components.

### 4. "done / partial / out-of-scope" semantics

`done` = faithfully reimplemented (allowing documented divergences); `partial` = some behaviour
in place, known gaps; `todo` = not started (default for unmapped in-scope routines);
`out-of-scope` = excluded from the denominator (hardware/sound-driver/protection, or routines we
deliberately won't port). Percentage = `done / (in-scope total)`, with `partial` counted
separately (and optionally as half) and shown in the table. The doc states this plainly.

## Risks / Trade-offs

- **[Curation rots / overclaims]** → keep the numerator small and reviewed; the script flags
  map entries pointing at missing routines, and unmapped in-scope routines default to `todo`
  (bias toward under-claiming). The doc is explicit that it's a curated estimate.
- **[`Banks0123.asm` mixes everything]** → map by routine label, not whole file, for the big
  shared banks; assign only the labels a component actually owns.
- **[Label parsing misses macro/conditional definitions]** → acceptable for an estimate; the
  denominator just needs to be stable and approximately right. Note any parser limitations in
  the doc.
- **[Scope creep into a dashboard]** → explicitly out of scope; a CLI + generated markdown is
  the whole deliverable.

## Migration Plan

Purely additive: new `Tools/coverage/` (script + map) and `docs/rom-coverage.md`. No `.asm`,
gameplay, or existing tooling changes. Rollback = delete the new files. Run the script manually
(`node Tools/coverage/coverage.mjs`); wiring it into CI is a possible future follow-up.

## Open Questions

- Should `partial` count as 0, 0.5, or just be reported alongside `done`? (Lean: report
  separately and also show a "done + ½·partial" blended %.)
- Map format JSON vs YAML? (Lean JSON — no dependency to parse in Node.)
- Tool location `Tools/coverage/` vs `scripts/`? (Lean `Tools/coverage/`, beside the other tools.)
