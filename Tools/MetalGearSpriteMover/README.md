# Metal Gear — Snake Sprite Mover

A small WPF app that loads Solid Snake's player sprites **directly from
`gfx/sprites.asm`** and lets you walk him around a canvas with the keyboard, switching
between all of his animations (walk, armed walk, swim, punch, climb, box, dying).

It is a focused companion to `Tools/MetalGearGfxViewer`: rather than browsing every
graphic, it reproduces exactly how the game assembles the main character and animates
him.

## Run

```
dotnet run --project Tools/MetalGearSpriteMover
```

This reads the real `.asm` sources (`gfx/sprites.asm`, `data/playersprite.asm`), so the
separate disassembly repo must be present: clone
[southernsun/MetalGear](https://github.com/southernsun/MetalGear) as a sibling at
`../MetalGear` (or set the `MG_ROM_DIR` env var). The tool resolves it automatically from
there; without it, the tool will fail. Exported assets are written into **this** repo's
`web/assets/`.

### Headless export

Besides the interactive window, this tool exports the actor/sprite sheets for the
[`web/`](../../web/) browser port (each writes into `web/assets/`, dispatched in
`App.xaml.cs`):

- `--export` — dump every precomputed Snake frame to `_export.png` next to the executable.
- `--export-web` — Snake's `snake.png` + `snake.json`.
- `--export-guard`, `--export-guard-bullet`, `--export-zzz`, `--export-prisoner`,
  `--export-elevator`, `--export-camera`, `--export-shots`, `--export-mgk`,
  `--export-bigboss`, `--export-sgunner` — the corresponding actor/projectile sheets.
- `--export-actor <SprLabel> <out.png> [#A #B #overlap]` and
  `--export-actor-singles <SprLabel> <out.png> [#color]` — generic exporters for any sprite
  label (composited OR-pairs / individual sprites).

## Controls

- **Arrow keys** or **WASD** — move Snake. Facing direction follows movement. The walk
  animation alternates the two step frames (1 ↔ 2) while moving and shows the standing
  pose (frame 0) when idle — matching the game's `SetSprWalk` routine, which loops
  `PlayerFrameNum` as 1,2,1,2 (it resets to 1, not 0, at the end) and only uses frame 0
  when stopped.
- **Tab** or **number keys 1–7** — change the animation (see below).
- **`[` / `]`** or **PgUp / PgDn** — cycle through the game's rooms.

Movement and animation are driven off the compositor frame tick
(`CompositionTarget.Rendering`) and advance by real elapsed time, so motion is smooth
and runs at the same speed regardless of the display's refresh rate.

## Animations

Each mode maps to the sprite ids the game uses (indices into `idxSnakeSpr`,
`data/playersprite.asm`); the current mode is shown in the status bar.

| Mode | Behaviour | Sprite ids |
|---|---|---|
| Walk | directional; stand when idle, 2-frame step loop when moving | 0–11 |
| Armed walk | directional; same, holding a weapon | 12–23 |
| Swim | directional pose (deep-water) | 28–31 |
| Punch | directional pose | 24–27 |
| Climb | 2-frame loop (ladder) | 39, 40 |
| Box | 2-frame loop (cardboard box bob) | 42, 44 |
| Dying | clutch → spin (all four facings) → collapse | 41, 0/3/6/9, 43 |

In every mode the arrow/WASD keys still move Snake around the room.

## Room background

The canvas is a real room screenshot from the disassembly's `room_images/`
(`MGEAR1_NNNN.png`, one per room, 512×384). Those PNGs are the game's 256×192 screen
at 2×, so Snake is drawn at 2× to match. If `room_images/` can't be found, the canvas
falls back to a plain background and Snake still works.

## How Snake is built (matches the game)

Rendering is driven entirely by the game's own tables in `data/playersprite.asm`, so
every animation composites the same way the game does:

1. **Decompress** every labelled `db` block in `gfx/sprites.asm` (RLE — the format
   `SetSnakeSprPatt` consumes, `Banks0123.asm`). Each block is a run of 16×16
   monochrome sprites (32 bytes each).
2. For a sprite id, look up its **pattern label** (`idxSnakeSpr`), its **attribute set**
   (`SnakeSprAttIds` → `idxSnakeSprAttr` → a `SnakeAttr*` table), and read the per-sprite
   rows: `Yoffset, Xoffset, pattern, colour`.
3. **Composite** each row's 16×16 sprite (`pattern / 4` selects which) at its signed
   Y/X offset, painting palette index `colour & 0Fh`. When a row has the **CC bit**
   (`colour & 40h`) its colour is OR-combined with whatever is already there — the VDP's
   colour-combination feature that gives monochrome sprites more than one colour.
   For ordinary Snake (`SnakeAttrShare`) this is two stacked OR-pairs (indices 7 & 0Ah
   on top, 7 & 0Ch below, overlaps `= 0Fh`); the box, swim, dead, etc. tables just have
   different counts/offsets, and the same code handles them all.
4. Those indices are coloured by `SnakePalette` (see below).

## Palette accuracy

Snake's four colour indices (7, 10, 12, 15) were resolved by **correlating the decoded
sprite structure against the reference sheet `examples/22527.png` pixel-for-pixel** —
overlaying the slot each pixel belongs to onto the sheet and reading back the colour:

| Index | Role | Colour (≈ MSX2 levels) |
|---|---|---|
| 7 | body | teal (1,2,2) |
| 10 | face / skin (top pair) | tan (6,4,3) |
| 12 | leg detail (bottom pair) | gray (3,3,3) |
| 15 | OR-overlap shading / outline | black (0,0,0) |

The key subtlety: the OR-overlap (index 15) is **black**, not white. An earlier version
assumed the MSX2 BIOS palette (where 7/10/12/15 are cyan/yellow/green/white), which made
Snake look washed-out; the indices in the reference sheet map to a different palette.
Levels are expanded with the same curve used for the room backgrounds so Snake sits
naturally on them.

See [`docs/rom/sprites.md`](../../docs/rom/sprites.md) for the full format description, and
[`docs/tools/sprite-mover.md`](../../docs/tools/sprite-mover.md) for how this app's colors
were derived.

## Files

| File | Purpose |
|------|---------|
| `SnakeSprites.cs` | Parse `sprites.asm` + `playersprite.asm`, RLE-decompress, composite any sprite id from its attribute table |
| `SnakePalette.cs` | Snake's sprite colours, recovered from `examples/22527.png` |
| `MainWindow.xaml(.cs)` | Canvas, room backgrounds, keyboard movement, animation modes |
| `App.xaml(.cs)` | Headless arg dispatch — routes the `--export-*` flags before the window opens |
| `WebExporter.cs` | The web/actor sprite-sheet export pipeline |
