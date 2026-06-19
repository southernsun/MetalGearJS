## Context

This repo is a fully annotated Metal Gear (MSX2) disassembly plus four C# tools that
reconstruct parts of the game *directly from the `.asm`/data tables*:

- **RoomViewer** — replays the tile/metatile/palette pipeline and can export room PNGs
  headlessly.
- **GfxViewer** / **SpriteMover** — decode `gfx/sprites.asm` (RLE) and composite Snake with
  his true colors via the MSX2 CC-bit pairing (colors 7 and 10).
- **ThemeOfTaraPlayer** — emulates the AY-3-8910 PSG and re-implements the BGM/SFX driver,
  already playing all 44 SFX including `Sfx_Punch*`.

The data this change needs already has working decoders. The browser game, by contrast,
should stay dumb: load static PNG/JSON/WAV and draw/play them. The native frame is
**256×192** (a SCREEN 5 page); a room is an **8×6 metatile** grid → **32×24 tiles** of
8×8 px. Collision is a per-tile solid bitmap (`CollTiles*` → `CollisionTiles`, bit 0 =
solid), tested by `ChkTileCollision` at **two probe points per direction** using
`BoxColliderDat` offsets keyed by direction and actor size/shape.

Constraints from the project: vanilla HTML/JS/Canvas with **no build tooling**;
pre-exported assets (chosen in proposal); the disassembly is the source of truth and must
not be modified.

## Goals / Non-Goals

**Goals:**

- A runnable `web/index.html` where Snake walks a real room (4 directions, walk + idle
  animation) with faithful tile collision, and punches with the correct frame + sound.
- An offline export step that produces every browser asset from the disassembly, reusing
  the existing verified decoders rather than re-deriving formats in JS.
- A clean asset contract (`web/assets/` + a JSON atlas/collision schema) that later changes
  (more rooms, enemies, weapons) can extend.

**Non-Goals:**

- Enemies/AI, weapons beyond the punch, doors/room transitions, scrolling between rooms,
  HUD, music, save/load.
- Runtime RLE decoding or PSG emulation in the browser.
- A JS bundler/framework or any npm dependency.
- Pixel-exact reproduction of Snake's movement *speed*/acceleration constants — we match
  the look and collision behavior; exact sub-pixel speed is tunable, not a hard requirement
  for this slice.

## Decisions

### D1 — Export via the existing C# tools (headless modes), not a fresh JS/Python decoder

Add headless "export" entry points to the tools that already decode this data:

- **Sprites** → extend SpriteMover (or GfxViewer) to write a PNG spritesheet + JSON atlas
  for the Snake labels this change needs (`SprSnake{Down,Left,Up,Right}` + `1`/`2` walk
  frames + `SprSnakePunch{D,L,U,R}`), composited with the true CC-bit colors it already
  produces on screen.
- **Room background** → RoomViewer already exports room PNGs headlessly; invoke it for the
  chosen starting room.
- **Collision map** → emit the room's 32×24 solid grid by applying the room's
  `CollisionTiles` bitmap to its unpacked tile buffer (the same data RoomViewer already
  loads).
- **Punch WAV** → extend ThemeOfTaraPlayer to render `Sfx_Punch*` to a WAV via its existing
  PSG emulation instead of (or in addition to) live playback.

*Why:* these decoders are already traced byte-for-byte against the ASM (the docs note
several subtle bugs that were fixed there). Re-implementing RLE + PSG in a throwaway export
script risks reintroducing exactly those bugs.

*Alternative considered:* a standalone Python `export.py` that parses the `.asm` directly.
Rejected for v1 because it duplicates hard-won decoder logic; may be revisited if we want
the export step dependency-free of .NET.

### D2 — Asset layout and schema

```
web/
  index.html
  game.js                # game loop, input, movement, collision, punch
  assets/
    snake.png            # spritesheet (all needed frames)
    snake.json           # atlas: { "down-idle": {x,y,w,h}, "down-walk1": {...}, ... }
    room.png             # 256×192 starting-room background
    room-collision.json  # { width:32, height:24, solid:[0/1 ...] } row-major
    punch.wav            # exported punch SFX
```

Atlas keys follow `<dir>-<state>` (`dir` ∈ down/left/up/right; `state` ∈
idle/walk1/walk2/punch). The collision JSON is a flat row-major 0/1 array so the game can
index `solid[ty*32 + tx]` directly.

### D3 — Starting room = room 0 (building), configurable

Room 0 is the best-documented mapping (Building tileset, palette 0) and a natural entry
room. The export step takes the room number as a parameter so a different start room is a
config change, not a code change.

### D4 — Collision model mirrors `ChkTileCollision`

Movement is attempted per axis/direction; before committing a move, test the two probe
points for that direction (Snake's position + `BoxColliderDat` offsets for Snake's
size/shape) and convert each probe pixel to a tile (`tx = x>>3, ty = y>>3`); if either
probed tile is solid, cancel the move in that direction. Snake's size/shape offsets are
ported as constants from `logic/collisions.asm` (matching whichever shape the SpriteMover
uses for Snake). This reproduces the original's "you can clip a corner because only two
points are checked" feel rather than a full AABB.

### D5 — Fixed-timestep loop, integer-scaled canvas

`requestAnimationFrame` drives a fixed-timestep accumulator (logical 60 Hz) so movement and
the walk-cycle cadence are refresh-rate independent. The canvas backing store is 256×192;
CSS scales it by an integer factor with `image-rendering: pixelated` and the 2D context's
`imageSmoothingEnabled = false`.

### D6 — State machine: `idle | walk | punch`

A tiny per-frame state machine. `punch` is entered on the punch key, holds the punch frame
for a fixed number of logical frames (a small constant, tuned to feel like the game), locks
out movement for its duration, then falls back to `walk`/`idle` based on input. Input uses
a held-keys set; `walk1`/`walk2` alternate on a frame counter while moving.

### D7 — Audio via Web Audio, unlocked on first input

`punch.wav` is decoded once into an `AudioBuffer`; each punch plays a fresh
`AudioBufferSourceNode`. The `AudioContext` is created/resumed on the first user gesture
(keydown), satisfying browser autoplay policy. A simple "press any key to start" gate makes
the unlock explicit.

## Risks / Trade-offs

- **[Snake's exact size/shape and speed constants may not be obvious from the ASM]** →
  Mitigation: port the `BoxColliderDat` offsets and cross-check Snake's footprint against
  the SpriteMover, which already positions Snake on a room screenshot; treat movement speed
  as a tunable and match by eye to reference footage for this slice.
- **[Composited 16×32 Snake vs two 16×16 hardware sprites]** → Mitigation: export Snake as
  pre-composited 16×32 frames in the atlas so the browser draws one image per frame; the CC
  pairing stays in the (verified) C# compositor.
- **[Collision map exported from the unpacked tile buffer must match what the PNG shows]** →
  Mitigation: generate both `room.png` and `room-collision.json` from the same RoomViewer
  room load in one pass so the tile grid and the image can't drift.
- **[Adding export modes touches three C# tools]** → Mitigation: keep each export a small,
  additive headless flag; no change to existing interactive behavior, and no change to the
  disassembly.
- **[Punch WAV loop/length]** → Mitigation: render until the SFX byte stream ends (the
  driver's end-of-channel `0xFF`), trimming trailing silence so the one-shot is tight.

## Migration Plan

Additive only — new `web/` files and new headless export flags on existing tools. Rollback
is deleting `web/` and the added flags; the disassembly and existing tool behavior are
untouched. No runtime/deploy infrastructure (the game is a static page opened locally or
served by any static host).

## Open Questions

- Final key bindings (arrows vs WASD for movement; which key punches — e.g. Space or J).
  Default to arrows + WASD for movement and Space for punch unless the user prefers
  otherwise.
- Whether to ship the export as added C# tool flags (D1) now, or also provide a Python
  fallback later for a .NET-free export path.
- Exact starting room if not 0, and Snake's spawn position within it.
