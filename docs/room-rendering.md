# Room rendering: ROM → RoomViewer → web

This document describes how Metal Gear (MSX) room backgrounds are stored in the
ROM, how the C# `RoomViewer` tool decodes and rebuilds them, and how the browser
port consumes the result. Everything cited here comes from the disassembly
sources (`data/`, `gfx/`, `Banks0123.asm`) and the tool/web code in
`Tools/RoomViewer/` and `web/`.

> **Note:** `.asm` / `file:line` citations and `room_images/` references in this doc refer to the separate MSX disassembly repo ([southernsun/MetalGear](https://github.com/southernsun/MetalGear)), expected as a sibling clone at `../MetalGear`.

## Overview

A room is **not** stored as a pixel image. The ROM stores a compact grid of
*metatile* indices per room; each metatile expands to a 4×4 block of 8×8 tiles;
each tile is a 3-bits-per-pixel character that is decoded through an 8-entry
colour-index table into a 16-colour MSX2 palette. The screen is a 32×24 tile
grid (256×192 px). Per-room nibble tables choose the metatile set, the tile
graphics set, and the palette.

The browser port does **no** decoding at runtime. The `RoomViewer` tool replays
the ROM's decode pipeline offline and bakes each room into a flat PNG plus JSON
grids, which the browser blits and reads directly.

```
  ROM data tables                RoomViewer (C#, offline)              web/assets                 browser (web/game.js)
  ---------------                ------------------------              ----------                 ---------------------
  rooms.asm        ─ metatile ─┐
  metatiles.asm    ─ defs ─────┤
  roomtileset.asm  ─ tileset ──┤  GameData ─► TileSetBuilder ─►        rooms/<n>.png    ─────────► drawImage (blit, no decode)
  palettes.asm     ─ palette ──┼─►            RoomRenderer            rooms/<n>.collision.json ──► solid[] / tiles[] lookups
  gfx/*.asm        ─ 3bpp gfx ─┤              .DrawRoom / .BuildScene  connections.json ─────────► room transitions
  roomsconnections.asm ───────┘              .UnpackTileNumbers       manifest.json    ─────────► preload list
  Banks0123.asm (CollTiles*) ──► ComputeSolid                         doors.json, hud-icons.png, font.png, ...
```

## How rooms are stored in the ROM

### The 32×24 tile grid and the 8×6 metatile grid

A room screen is 32 tiles wide × 24 tiles tall (256×192 px). The ROM stores it
as an **8×6 grid of metatiles**, and each metatile is a **4×4 block of 8×8
tiles** (8 metatiles × 4 tiles = 32 tiles wide; 6 × 4 = 24 tall). This is stated
directly in `data/rooms.asm` (`; Rooms: 8x6 metatiles`) and in
`Banks0123.asm:RenderRoom` (`A room is defined by 8x6 metatiles / A metatiles is
defined by 8x8 tiles` — note the comment says "8x8 tiles" but the unpack loop
below uses 4×4; the 8×8 refers to the pixel size of each tile).

### Room data

`data/rooms.asm` begins with `idxRooms:` — a table of `dw RoomNNN` pointers, one
per room number (slots that aren't real rooms point at `RoomUndefined`). Each
`RoomNNN` label is 48 bytes: 6 rows × 8 columns of metatile IDs. Example
(`Room000`):

```
Room000:    db  19h, 07, 07, 07, 07, 07, 1Ch, 0Bh   ; row 0 (8 metatile IDs)
            db  19h, 78h, 79h, 75h, 80h, 75h, 75h, 88h
            ... 6 rows total ...
```

A metatile ID of `0` means an empty cell (drawn as tile 0); otherwise the ID is
**1-based** into the room's metatile set (see `UnpackTileNumbers` /
`DrawMetatile`, which compute `baseOff = (metatileId - 1) * 16`). There is no
RLE — the data is a flat byte-per-cell grid.

### Metatiles

`data/metatiles.asm` holds the metatile-set definitions, indexed by
`idxMetatileSet:` (`Metatiles1` … `Metatiles6`). Each metatile is **16 bytes** =
the 4×4 grid of 8×8 tile numbers, row-major. `Banks0123.asm:UnpackMetatiles`
reads a metatile ID, multiplies by 16 (`DEC_A_HL_4xA` then two `add hl,hl`), and
copies the 4×4 = 16 tile numbers into the room tile buffer, advancing the
destination by `1Ch` (28) after each 4-tile row so the 4 tiles land in the right
columns of the 32-wide buffer.

Which metatile set a room uses is selected by the **`MetaTileSetIDs`** nibble
table at the bottom of `data/rooms.asm` (one nibble per room; `5` rooms in the
table comment note "Room 222 seems was a dark room").

### Per-room tileset and palette selection (nibble tables)

Three parallel nibble tables select a room's resources by room number. Each byte
holds two rooms' values; even room = high nibble, odd room = low nibble. The ROM
reads them via `Banks0123.asm:GetNibbleRoom` / `GetNibbleHL_A2`, and the tool
mirrors this exactly in `GameData.Nibble`:

| Selector | Table (file) | Indexes |
|---|---|---|
| Metatile set | `MetaTileSetIDs` (`data/rooms.asm`) | `idxMetatileSet` → `Metatiles1..6` |
| Tile graphics set | `RoomGfxSetIds` (`data/roomtileset.asm`) | `idxTileSets` → `TileSetBuilding..Ending` |
| Palette | `IdsRoomPal` (`data/palettes.asm`) | `idxRoomPalettes` → `RoomPalette0..15` |

`GameData` exposes these as `MetatileSetId(room)`, `GfxSetId(room)`,
`PaletteId(room)`.

### Tile graphics sets

`data/roomtileset.asm` defines the 8 tilesets (`idxTileSets`):
`TileSetBuilding`, `TileSetBasemDeser`, `TileSetRoof`, `TileSetElevator`,
`TileSetLorryRoom`, `TileSetHindD`, `TileSetMetalGear`, `TileSetEnding`. Each is
a list of up to three **load blocks** with this layout (documented in the file
header and consumed by `Banks0123.asm:LoadRoomTiles3` / `LoadTileset`):

```
+0: flags  (bit7 = "load collision tiles" marker / end; bit6 = flip tiles)
+1: number of tiles to decode
+2: destination tile number
+3..4: dw pointer to 3bpp gfx data (Gfx... label in gfx/*.asm)
```

A flip block (bit6 set) is shorter — it reuses the previous block's count and
gfx pointer and only carries a new destination tile number (e.g.
`TileSetBuilding`'s third block `db 41h / db 0D8h` is a flipped copy). The
`LoadRoomTiles` path also loads two shared blocks **before** the room tileset:
the power-switch/elevator-panel tiles (`LoadPowSwitTiles`) and the wood crates
(`LoadGfxCrates`, skipped for the Metal Gear tileset id 6 — see
`LoadRoomTiles2`, `cp 6`).

### Connections

`data/roomsconnections.asm:RoomConnections` stores 4 bytes per room in order
**north, south, west, east** (`; Each room is connected to 4 rooms (north,
south, west, east)`). `255` means "no exit". `GameData.Connections` returns this
as `[Up, Down, Left, Right]`.

### The collision bitmap

Collision is **per tile number, per tileset** — a 256-bit solid map. The
`IdxColisTiles` table (`data/roomtileset.asm`) points at one `CollTiles*` blob
per tileset (`CollTilesBuilding`, `CollTilesBasem`, `CollTilesRoof`,
`CollTilesElevator`, `CollTilesLorry`, `CollTilesHindD`, `CollTilesMetalGear`).
Each blob is **32 bytes = 256 bits**, one bit per tile number; a set bit means
"solid". `Banks0123.asm:LoadColliTiles` walks the 32 bytes, expanding each into 8
per-tile flags (`rlca` MSB-first: tile 0 = bit 7 of byte 0).

## Tile graphics & palette

### 3bpp tile format

Each tile graphic is stored 3 bits per pixel: **3 bytes per line × 8 lines = 24
bytes per tile**. The three bytes are bit-planes for the 8 pixels of a line.
`Banks0123.asm:Decode3bpp` reads them as `E`, `D`, `C` (low plane first; `C`
carries the high bit), then for each pixel shifts out one bit from each plane to
form a 3-bit value (0–7), which it looks up in `BufferColor` (the 8-entry colour
map loaded by `SetColorsIndexes`) to get the final 4-bit (0–15) palette index.
`Decode3bppTile` calls `Decode3bpp` 8 times (8 lines per tile); `Load3bppTiles`
decodes `count` tiles in a row.

The colour map is **`ColorsTileset`** (`Banks0123.asm`:
`db 1,3,5,8,9,0Ch,0Eh,0Fh`) for room tiles, set up by `SetTilesetColors` /
`SetColorsIndexes`. Other 3bpp assets use different maps — `ColorsItems`
(`db 0,6,7,8,0Ah,0Ch,0Eh,0Fh`) for the HUD/item icons and alert icon, etc. So
the same 3-bit gfx value maps to different palette slots depending on which map
is active when it is decoded.

`Tools/RoomViewer/Render/Tile.cs:Decode3bpp` is a faithful port:

```csharp
byte e = gfx[offset + line*3 + 0];   // low plane
byte d = gfx[offset + line*3 + 1];
byte c = gfx[offset + line*3 + 2];   // high plane
int idx = ((c>>bit)&1)<<2 | ((d>>bit)&1)<<1 | ((e>>bit)&1);
byte color = colorMap[idx & 0x07];   // colorMap = ColorsTileset
```

Pixel 0 is the most-significant bit (`bit = 7 - px`), matching the ROM's `rl`
order. The `flip` flag mirrors X, used for the bit6 flip blocks. Each decoded
`Tile` is an 8×8 array of 4-bit palette indices.

The raw gfx blobs live in `gfx/*.asm` under `Gfx...` labels (e.g.
`GfxBuilding`, `GfxCrates`, `gfxPowSwitch`), referenced by name from the tileset
load blocks.

### MSX2 palette: level → RGB

The MSX2 VDP palette has 16 entries, each colour 3 bits per channel (0–7).
A colour is two bytes: `byte0 = (Red<<4) | Blue`, `byte1 = Green` (see
`Banks0123.asm:SetPaletteColor`, which `out`s `d` = Red/Blue then `e` = Green;
and `DefaultPalette`, whose entries are `db RB, G`). Palette blocks in the data
files are triplets `(colorIndex, RB, G)` terminated by `0FFh` — e.g.
`RoomPalette0: db 1,12h,2 / db 3,1,1 / ... / db 0FFh`.

`Tools/RoomViewer/Render/Palette.cs` decodes these:

```csharp
int r  = (rb >> 4) & 0x07;
int b  =  rb       & 0x07;
int gr =  g        & 0x07;
color  = FromArgb(Expand3(r), Expand3(gr), Expand3(b));
static int Expand3(int v) => v * 255 / 7;   // 3-bit channel -> 8-bit
```

The expansion curve `v*255/7` is a deliberate linear approximation of the MSX2
DAC; see "Faithfulness notes" below.

`Palette.DefaultPalette` is the game's power-on palette (ported from
`Banks0123.asm:DefaultPalette`). A room only overrides a handful of slots: the
ROM's `SetRoomPal` first establishes "fixed" gameplay slots and then applies the
per-room block, which only re-tweaks slots **1, 3, 5, 9** (and occasionally
`0Ch`). The tool reproduces this in `RoomRenderer.BuildScene`:

```csharp
palette.ApplyOverrides(_data.BasePaletteBlock());      // PalMenuWeapon: fixed slots 0,6,8,12,14,15
palette.ApplyOverrides(_data.RoomPaletteBlock(palId)); // per-room RoomPaletteN: slots 1,3,5,9
```

`GameData.BasePaletteBlock()` returns `PalMenuWeapon` (`data/palettes.asm`); the
comment notes this is "verified pixel-exact against room_images". Note: the
in-game dark-room / flashlight / goggles palette swaps in `SetRoomPal`
(black palette `0Bh`, gray/infrared `0Ah`) are **not** applied by the tool — it
always renders the room's normal palette.

## How the RoomViewer rebuilds a room

The tool replays the ROM pipeline class by class. All bytes come from parsing
the `.asm` sources (`Tools/RoomViewer/Asm/AsmParser.cs`), so the renderer is
driven by exactly the ROM's data.

### `GameData` (`Game/GameData.cs`)

Parses the data tables (`rooms.asm`, `metatiles.asm`, `roomtileset.asm`,
`palettes.asm`, `roomsconnections.asm`, `doors.asm`, HUD coord tables), every
`gfx/*.asm`, and `Banks0123.asm` (for `ColorsTileset`, `CollTiles*`,
`PalMenuWeapon`, etc.). Exposes:

- `RoomMetatiles(room)` → the 48-byte 8×6 metatile grid.
- `MetatileSetId/GfxSetId/PaletteId(room)` → the per-room nibbles (via
  `Nibble`, mirroring `GetNibbleRoom`).
- `MetatileSet(id)` → the raw metatile bytes; `TileSetTokens(id)` → the tileset
  load-block tokens; `RoomPaletteBlock(id)` / `BasePaletteBlock()` → palette
  triplets.
- `Connections(room)`, `Doors(room)`, `DoorTypeInfo(type)`.
- `RoomDefined(room)` → false for `RoomUndefined` slots.

### `TileSetBuilder` (`Game/TileSetBuilder.cs`)

Rebuilds the **256-entry tile table** a room sees in VRAM, replaying
`LoadRoomTiles`:

1. Power-switch/elevator-panel tiles → tile `0x92` (`LoadPowSwitTiles`).
2. Wood crates → tile `0xA0`, flipped copy → `0xD0` — **skipped** for the Metal
   Gear set (id 6), matching `LoadRoomTiles2`'s `cp 6`.
3. The room's tileset: walks up to 3 load blocks (`ReplayTileSet`), honoring the
   bit7 collision-marker (stop) and bit6 flip (reuse previous count/gfx, new
   dest). Each block is decoded by `LoadBlock` → `Tile.Decode3bpp` with
   `ColorsTileset`.

`VramToTile` converts the ROM's VRAM page-1 addresses (`0x9048`, `0x9400`,
`0x9840`) to tile numbers, mirroring `TileToVramAdd` (32 tiles × 32 bytes per
tile row, 4 bytes per tile column). Results are cached per tileset id.

### `RoomRenderer` (`Render/RoomRenderer.cs`)

- **`BuildScene(room)`** assembles a `RoomScene`: palette (base + per-room
  overrides), the 256-tile table (`TileSetBuilder.ForRoom`), the metatile set,
  and the room's 8×6 metatile grid.
- **`DrawRoom(room)`** loops the 8×6 grid; for each cell calls `DrawMetatile`,
  which expands metatile ID → `(id-1)*16` offset → 4×4 tile numbers and blits
  each 8×8 `Tile` through the palette at `(mCol*32 + tx*8, mRow*32 + ty*8)`.
  Output is a 256×192 ARGB bitmap. (Faithful to `RenderRoom` /
  `UnpackMetatiles` / `DrawTile`.)
- **`UnpackTileNumbers(room)`** produces the flat **32×24 grid of tile numbers**
  (length 768, row-major) using the same metatile placement as `DrawRoom`.
  Empty cells (metatile ID 0) stay tile 0. This grid feeds collision and tile
  classification.

### `--export-web` outputs (`Program.cs:ExportWeb`)

`ExportWeb` does a BFS over `Connections` from a start room (default start 0,
count 16), keeping only `RoomDefined` rooms, and for each writes:

- **`rooms/<n>.png`** — the 256×192 `DrawRoom` bitmap.
- **`rooms/<n>.collision.json`** — `{ width:32, height:24, solid:[768], tiles:[768] }`
  (`WriteCollisionJson`). `tiles[]` is `UnpackTileNumbers`; `solid[]` is
  `ComputeSolid`.
- **`connections.json`** — each exported room → `{up,down,left,right}` (`null`
  if no exit or the neighbour wasn't exported).
- **`manifest.json`** — `{ "rooms":[...], "start":n }`.
- Plus `doors.json` / `door-types.json` / door PNGs, `alert-icon.png`,
  `hud-icons.png` + `.json`, `font.png` + `.json`, and legacy single-room
  `room.png` / `room-collision.json` for the start room.

**`ComputeSolid`** looks up the room's tileset (`GfxSetId`), reads its
`CollTiles*` blob via `IdxColisTiles`, and for each of the 768 tile numbers sets
`solid[i] = (collBytes[t>>3] >> (7-(t&7))) & 1` — the exact bit order of
`LoadColliTiles` (tile 0 = bit 7 of byte 0).

## What the browser consumes

The browser does **no decoding**. `web/game.js:loadAssets` preloads every room
in `manifest.json` as a PNG + collision JSON pair:

```js
const [img, collision] = await Promise.all([
  loadImage(`assets/rooms/${n}.png`),
  loadJSON(`assets/rooms/${n}.collision.json`),
]);
```

`setRoom(n)` just points `assets.room` / `assets.collision` at the loaded pair,
and the room is drawn with a single blit:
`ctx.drawImage(assets.room, 0, 0, VIEW_W, VIEW_H)`.

Gameplay reads the two grids from the collision JSON:

- **`solid[ty*width+tx]`** — wall/obstacle test for Snake, guards (`hasLineOfSight`,
  `ChkViewObstacles`), and bullets.
- **`tiles[ty*width+tx]`** — the raw tile number, used for tile classification
  via `tileAt`: `isLadder` (`=== 0x08`), `isShallowWater` (`0x6D`, `0x73`,
  `0x74`, plus shadow `0x6F–0x72` when the current room isn't a deep-water
  room), `isDeepWater` (`0x75`, `0x76`, plus shadow `0x6F–0x72` in
  `DEEP_WATER_ROOMS = {105,106,211,212}`). These tile constants are documented
  in `web/game.js` as coming from `Banks0123.asm`.

Connections (`connections.json`) and the preload list (`manifest.json`) drive
room transitions; the browser never touches the original `.asm` data.

## Faithfulness notes / known divergences

- **Palette expansion curve.** The ROM hands 3-bit-per-channel values straight
  to the MSX2 VDP DAC; the tool approximates the analog output with a linear
  `v*255/7` map (`Render/Palette.cs:Expand3`). This is an approximation of real
  hardware, not a ROM constant. `GameData.BasePaletteBlock` notes the overall
  result is "verified pixel-exact against room_images".
- **Dynamic palette modes not applied.** `SetRoomPal` swaps to a black palette
  (`0Bh`) in unlit dark rooms without the flashlight, and a gray/infrared
  palette (`0Ah`) when goggles are equipped. The tool always renders each
  room's *normal* `RoomPaletteN`; lighting/goggles state is a runtime concern
  the browser would handle, not baked into the PNG.
- **Exported subset.** `--export-web` exports only a BFS-connected cluster from
  a start room (default 16 rooms), and `connections.json`/`doors.json` null out
  links whose target isn't in the cluster. Rooms reached only via elevators
  (door dest `>= 0xF0`) and fake/special doors are dropped from `doors.json`
  (`WriteDoorsJson`).
- **`UnpackTileNumbers` placement** mirrors `DrawRoom` rather than the ROM's
  exact buffer arithmetic (`+1Ch` per row, `-7Ch` per metatile in
  `UnpackMetatiles`); the resulting 32×24 grid is identical, but the C# uses
  direct `(gx,gy)` indexing for clarity.
- **`RenderRoom` "8x8 tiles" comment.** The `Banks0123.asm:RenderRoom` header
  comment says a metatile is "8x8 tiles" while the actual unpack loop
  (`UnpackMetatiles3/4`) is 4×4 tiles of 8×8 pixels. The code (4×4) is
  authoritative; the tool follows the code.
- **Source-comment uncertainties** (carried verbatim, not resolved here):
  `data/rooms.asm` notes "Room 222 seems was a dark room"; the second tileset
  load-block field naming follows the file's own header comments.
