# Room Viewer — C# implementation notes

The viewer in [`Tools/RoomViewer/`](../../Tools/RoomViewer/) is a direct, data-driven port of the ROM
room pipeline ([rooms](../rom/rooms.md), [graphics](../rom/graphics-formats.md),
[palettes](../rom/palettes.md), [rendering](../rom/rendering-pipeline.md)). It bakes in no
pre-rendered art: at startup it parses the `.asm` sources and reproduces the ROM pipeline,
pixel-exact against [`room_images/`](https://github.com/southernsun/MetalGear/blob/master/room_images/).

> **Note:** `.asm` / `file:line` citations and `room_images/` references in this doc refer to the separate MSX disassembly repo ([southernsun/MetalGear](https://github.com/southernsun/MetalGear)), expected as a sibling clone at `../MetalGear`.

For running, controls and headless export, see
[`Tools/RoomViewer/README.md`](../../Tools/RoomViewer/README.md).

## Where the data comes from

`AsmParser` reads `db`/`dw` operands following each label, so tables are reached by name.
It handles Sjasm numeric literals (`19h`, `0FFh`, decimal) and keeps `dw Label`
references as symbols. `GameData` loads:

```
data/rooms.asm        rooms, MetaTileSetIDs, idxMetatileSet
data/metatiles.asm    Metatiles1..6
data/roomtileset.asm  RoomGfxSetIds, idxTileSets, TileSet* blocks
data/palettes.asm     IdsRoomPal, idxRoomPalettes, RoomPalette0..15, PalMenuWeapon
gfx/*.asm             every Gfx* / gfx* blob
Banks0123.asm         ColorsTileset
```

Everything else (VRAM addresses for crates/power-switch, the `ColorsTileset` fallback,
`DefaultPalette`) is mirrored as documented constants with source references in the code.

## Module map

| File | Mirrors | Notes |
|------|---------|-------|
| `Asm/AsmParser.cs` | — | label → `db`/`dw` operands |
| `Game/GameData.cs` | the data tables | nibble lookup = `GetNibbleRoom` |
| `Game/TileSetBuilder.cs` | `LoadRoomTiles` | builds & caches `Tile[256]` per gfx set |
| `Render/Tile.cs` | `Decode3bppTile` | 3bpp → 4-bit indices |
| `Render/Palette.cs` | `SetPaletteColor`/`DefaultPalette` | 3-bit channels → RGB |
| `Render/RoomRenderer.cs` | `RenderRoom`/`UnpackMetatiles`/`DrawTile` | → `Bitmap` |
| `Render/SpriteRoutines.cs` | (none) | named-element draws + metatile atlas |
| `UI/ViewerForm.cs` | `RenderScreen` (background only) | the browser |

## Fidelity decisions

- **3bpp decode** is a literal port: plane bytes `e,d,c` (c = MSB), pixels MSB-first,
  index through `ColorsTileset`. Confirmed by palette recovery (below).
- **Tile table** is assembled in the exact `LoadRoomTiles` order (power-switch, crates +
  flipped crates, then up to three tileset blocks, honouring the flip/collision flags).
  Cached per graphics-set id.
- **Palette** = `PalMenuWeapon` base + `RoomPalette<n>` overrides on top of the 16-entry
  default — the persistent-base finding (see [palettes](../rom/palettes.md#key-finding-the-persistent-in-game-base-is-palmenuweapon-not-defaultpalette)).
- **Not drawn:** actors, items, doors, lasers, HUD — sprite/overlay routines, not the room
  tilemap (see [rendering-pipeline](../rom/rendering-pipeline.md#full-screen-composition)).

## How fidelity was verified

The colors were wrong at first (shapes perfect, palette off). Two throwaway diagnostic
modes pinned it down; both are described here for the record (the code was removed after
use, leaving the clean literal decode):

1. **Permutation sweep** — render room 0 under every plausible decode variant (which byte
   is which bit-plane, MSB/LSB-first, index complement) and score each against
   `MGEAR1_0000.png` by summed squared RGB error. *Result:* all variants scored within
   ~7% of each other and all poorly → the error was the palette, not the decode.
2. **Palette recovery** — with the literal decode, render room 0 as a per-pixel
   *color-slot map* (value 0–15, not RGB). For each slot, histogram the colors of the
   matching pixels in the screenshot. *Result:* every slot mapped to a single color;
   slots 1/3/5/9 matched `RoomPalette0`, slots 12/14/15 matched `PalMenuWeapon` (not
   `DefaultPalette`). This both **proved the decode correct** and revealed the
   base-palette source.

After applying the `PalMenuWeapon` base, rooms 0, 1 and 5 (three different tilesets and
palettes) matched their screenshots pixel-for-pixel.

## Drawing individual elements ("sprite" routines)

In this engine the recognisable props — crates/barrels, walls, the trucks, the Metal Gear
body — are **metatiles**, so `SpriteRoutines` draws them as metatiles:

- `DrawMetatile(scene, id)` → a 32×32 bitmap of any metatile in the room's set.
- `DrawNamed(element)` → a catalogued element drawn with a room that shows it (so the
  right tileset + palette apply). The catalogue is a small seed list; only `Crate` (set 1,
  metatile 6) is verified.
- `DrawAtlas(scene)` → every metatile in the set as a labelled grid, to identify and name
  more (the viewer's `Tab` key).

## Known limitations / future work

- The named-element catalogue is a stub — most props still need identifying via the atlas.
- Doors, items and actors could be added as optional overlays by porting `DrawDoors` /
  `DrawRoomItems` / the spriteset loaders.
- The base palette is taken to be `PalMenuWeapon`; rooms that rely on a different
  fixed-slot setup (e.g. the ending, some cutscenes) are not specially handled.
