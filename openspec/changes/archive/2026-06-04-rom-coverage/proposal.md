## Why

We're porting Metal Gear (MSX) to the browser one slice at a time, but we have no way to see
*how far along we are*. After each change we cite the ROM routines we reimplemented, yet those
citations live scattered across openspec changes and code comments — there's no rolled-up,
per-component view of "how much of the guard logic is done?" or "what's left in the damage
system?". A coverage tracker turns that scattered knowledge into a maintained map, so we can
prioritise the next slice and show progress.

## What Changes

- Add a **per-component ROM→JS coverage map**: a curated, machine-readable file listing each
  gameplay component, its ROM `.asm` files/routines, a per-routine status (`done` / `partial`
  / `todo` / `out-of-scope`), and the JS function/file that covers it.
- Add a **coverage script** that computes the numbers so they stay honest: it parses the `.asm`
  sources for routine labels and line counts (the **denominator**, automated), reads the curated
  status map (the **numerator**, hand-maintained), and emits a per-component and overall
  percentage table.
- Generate/refresh **`docs/rom-coverage.md`** from the script (a human-readable table), with a
  clear note that "translated" is a curated judgement and faithfulness varies (some entries are
  approximations/divergences).
- **Denominator = gameplay code only.** Count gameplay-relevant routines (`logic/`, `data/`,
  actor/room/HUD/game logic); MSX hardware init, the PSG/sound-driver internals, and
  copy-protection are marked `out-of-scope` so they don't drag the ceiling — the percentage
  reflects "the game we can actually port".
- **Seed** the map from the ROM-source citations already in our existing changes
  (snake-movement, room-traversal, doors, guard, player-damage/HUD, asset/audio export).

This change adds **no gameplay code** and translates no new ROM logic — it is tracking
tooling + documentation only.

## Capabilities

### New Capabilities

- `rom-coverage`: A maintained, per-component map of which original Metal Gear ROM routines have
  been reimplemented in the browser port, plus a script that computes per-component and overall
  coverage percentages (auto denominators from parsing the `.asm`; curated numerator) and renders
  a `docs/rom-coverage.md` report.

### Modified Capabilities

<!-- None. This is additive tooling/docs; it does not change any existing capability's behaviour. -->

## Impact

- **New tooling**: a small coverage script (Node CLI preferred for portability — it parses
  `.asm` label definitions and line counts, no build step). Lives under the repo's tooling
  area (e.g. `Tools/coverage/` or `scripts/`).
- **New data**: a curated status map (JSON/YAML) of components → routines → status + JS pointer.
- **New doc**: `docs/rom-coverage.md`, generated/checked by the script.
- **Source consumed (read-only)**: the disassembly tree — `logic/` (~106 files, ~20k lines,
  ~1350 routine labels), `data/`, `gfx/`, `sound/`, `constants/`. No `.asm` is modified.
- **Dependencies**: none new (Node already used to serve/verify the web port).
- **Out of scope**: translating any new ROM code; a UI/dashboard; line-level or instruction-level
  diff coverage; auto-detecting JS↔asm correspondence (the numerator is deliberately curated).
