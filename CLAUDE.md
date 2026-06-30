# Project instructions

## The disassembly lives in a sibling repo

This repo is the JavaScript/web port only. The original MSX disassembly (the `.asm` sources —
`constants/`, `data/`, `gfx/`, `logic/`, `sound/` — and the `room_images/` reference
screenshots) lives in a **separate repo**, [southernsun/MetalGear](https://github.com/southernsun/MetalGear)
(a fork of [GuillianSeed/MetalGear](https://github.com/GuillianSeed/MetalGear)), expected to be
cloned as a **sibling** of this repo at `../MetalGear`. The export scripts read it from there
(override with the `MG_ROM_DIR` env var). When these instructions say "read the `.asm`", they
mean those files in `../MetalGear`.

## Before you start: read the docs, use the tools

This repo already documents the ROM internals and ships decoders for them. **Consult these before
re-deriving a format, hand-rolling a decoder, or guessing a value** — most "hunts" have already
been done once and written down.

- **[`docs/README.md`](docs/README.md)** — the documentation index (ROM internals, tools,
  audits). Start here.
- **[`docs/rom/`](docs/rom/)** — ROM data & render formats: `graphics-formats.md` (1/2/3/4bpp +
  RLE), `sprites.md`, `palettes.md`, `rendering-pipeline.md`, `rooms.md`, `sound-driver.md`.
- **[`docs/rom-data-formats.md`](docs/rom-data-formats.md)** — storage formats the exporters
  parse: coordinate words (`dw YYXX`), BCD counters, terminators, graphics planes, data tables.
- **`Tools/` (+ [`docs/tools/`](docs/tools/))** — decoders that read the real `.asm`, not baked
  output: `MetalGearGfxViewer` (all graphics, RLE, palettes — its `GfxCatalog` already knows
  assets like `targetspr.asm`), `RoomViewer` (rooms pixel-exact), `MetalGearSpriteMover` (Snake
  sprites), plus the JS `Tools/export-*.mjs` / `dump-glyphs.mjs` and `Tools/coverage` +
  `Tools/audit`. Re-render/re-export through these instead of inventing a one-off.
- **[`docs/faithfulness-divergences.md`](docs/faithfulness-divergences.md)** — the canonical
  record of deliberate & deferred divergences (do-not-"fix" list).
- **`web/*.headless.mjs`** — the headless-test pattern (load the real `web/game.js` in a vm
  sandbox, assert against ROM-derived numbers).

If a doc and the disassembly disagree, **the disassembly wins — and fix the doc** (they drift;
e.g. the coordinate-word byte order in `rom-data-formats.md` was wrong until 2026-06).

## ROM faithfulness

- **Always mimic the actual ROM/disassembly code — never substitute our own interpretation.**
  This is a port of Metal Gear (MSX); behaviour, constants, and logic must come from the
  original `.asm` sources (in `../MetalGear`: `logic/`, `data/`, `gfx/`, `sound/`), not from
  what seems reasonable.
- Before implementing or changing a behaviour, **read the relevant `.asm` routines first**
  (in the sibling `../MetalGear` disassembly) and port their actual logic (state machines,
  counters, formulas, magic numbers). Cite the source routine/file/constant in a comment next
  to the ported code.
- A **divergence is only acceptable when the ROM logic genuinely cannot be reproduced** here
  (e.g. a prerequisite system doesn't exist yet, or a value has no faithful equivalent). When
  that happens, keep it minimal, then do all three: (1) call it out explicitly in a comment at
  the `web/game.js` call site, (2) add a row to
  [`docs/faithfulness-divergences.md`](docs/faithfulness-divergences.md) (the canonical index),
  and (3) note it in the change's OpenSpec tasks/notes. Unintentional gaps are bugs — file them
  as GitHub issues under the `faithfulness` label, don't list them as divergences.
- If unsure how the original behaves, **investigate the disassembly rather than guessing** — an
  approximation that "feels right" but doesn't match the ROM is a bug, not a shortcut.
- **When porting/changing a behaviour, read the surrounding code on BOTH sides — don't fix in
  isolation.** In the `.asm`, read the whole routine and what it calls/sets, not just the one line
  you're matching: adjacent setup, side effects (flags/timers/text), and callers/callees often
  carry behaviour that belongs with the change. In the JS port, check the surrounding code path
  (callers, the state machine around the edit, related helpers) so the change integrates correctly
  and nothing implied by the ROM is missed. A faithful one-liner that ignores the context around it
  is how bugs slip in.

## Graphics & UI faithfulness

The rules above apply to *behaviour*; pixels, coordinates, and colours are where fidelity most
often slips, because they get ported from a prose description of the `.asm` instead of from the
actual data. Don't do that. Use ground truth:

- **Never port a pixel, screen coordinate, or palette colour from a description of the `.asm`.**
  Decode the actual ROM bytes. We already have decoders — use them instead of hand-rolling or
  approximating: `Tools/MetalGearGfxViewer` (`GfxDecoder`/`SpriteDecoder`/`AsmGfxParser`, with the
  real palettes in `GamePalettes`/`GameColorSets`, and a `GfxCatalog` that already knows graphics
  like `targetspr.asm`), `Tools/RoomViewer` for room/tile rendering, `Tools/dump-glyphs.mjs` for
  font glyphs, and the `Tools/export-*.mjs` scripts for data tables. Commit the decoded result as
  an exported asset under `web/assets/`. A subagent's narrative of "what the routine draws" is a
  lead to verify, never a source to copy.
- **Packed graphics must be decoded through the game's own loader** (`UnpackGfx` RLE etc.) —
  reuse the `GfxDecoder`/`GfxCatalog` in `Tools/MetalGearGfxViewer`, which detects bit depth,
  tile layout, colour table and compression automatically. Blit the result byte-exact. "Drawn
  here with primitives" / "approximated" is a divergence — file it as one (it is a bug, e.g. the
  telescope reticle #118), don't silently ship it. A comment admitting the art isn't decoded is a
  red flag, not a license.
- **Screen coordinates must be decoded AND calibrated.** ROM text XY words are `0xYYXX` (high
  byte = Y pixel, low byte = X pixel). State the decode and verify it against at least one known
  on-screen reference (e.g. `txtLife 0xC110` → (16,193), `txtClass 0xC908` → (8,201)) before
  trusting it. Do not assume which byte is X.
- **Every visual element gets a numeric assertion** in a headless test (`web/*.headless.mjs`):
  draw position, palette index, and for art a pixel/byte checksum against the decoded ROM data —
  not just "it renders".
- **A graphics investigation must return artifacts, not adjectives** — decoded bytes, the exact
  coordinate word and its decode, routine citations — and must flag what it could *not* decode
  (e.g. "RLE not unpacked") as a blocker. "Reads as corner brackets" is a guess, not a finding.

## Git

- **The user always commits themselves. Never run `git commit` (or `git push`).** Make and
  stage changes as needed, but leave committing to the user.
