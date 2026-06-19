# Rooms: data model, tilesets and palettes

How a room is stored and how its 256-tile character table is assembled. Routine
references are in `Banks0123.asm` unless noted.

> **Note:** `.asm` / `file:line` citations and `room_images/` references in this doc refer to the separate MSX disassembly repo ([southernsun/MetalGear](https://github.com/southernsun/MetalGear)), expected as a sibling clone at `../MetalGear`.

## The three-level tile hierarchy

A room screen is built from three nested levels:

```
Room      = 8 × 6 metatiles      → 256 × 192 px
Metatile  = 4 × 4 tiles          →  32 ×  32 px
Tile      = 8 × 8 pixels (a character / "pattern")
```

So a room is `32 × 24 = 768` tiles, exactly the 256×192 visible area of the SCREEN 5
page. Drawing the grid is covered in [rendering-pipeline.md](rendering-pipeline.md).

## Rooms (`data/rooms.asm`)

Each room is a label (`Room000`, `Room001`, …) followed by **48 bytes** — an 8×6 grid of
*metatile ids*, row-major:

```asm
Room000:    db  19h,   7,   7,   7,   7,   7, 1Ch, 0Bh   ; row 0 (8 metatiles)
            db  19h, 78h, 79h, 75h, 80h, 75h, 75h, 88h   ; row 1
            db  19h, 7Ch, 7Dh, 1Fh, 81h, 1Eh, 1Fh, 88h   ; row 2
            db  19h, 78h, 79h, 78h, 79h, 80h,   7, 89h   ; row 3
            db  19h, 7Ch, 7Dh, 7Ch,   6, 59h,   7, 1Ah   ; row 4
            db  0Ch, 0Dh, 0Dh,   7, 1Ah, 66h, 0Dh, 0Dh   ; row 5
```

Each byte indexes the room's *metatile set*.

### The room index (`idxRooms`)

`idxRooms` is a table of 256 word pointers — one per room **number** — pointing either at
a `RoomNNN` label or at `RoomUndefined` for gaps. There are ~165 real room definitions
spread across numbers up to 250; unused numbers point at `RoomUndefined`. A room is
"defined" only when its `idxRooms` slot is not `RoomUndefined`. `GetRoomPointer` (used by
`RenderRoom`) just does `idxRooms[room]`.

## Metatiles (`data/metatiles.asm`)

There are **6 metatile sets**: `Metatiles1` … `Metatiles6`, listed in `idxMetatileSet`.
Each set is a long run of **16-byte metatiles** (a 4×4 grid of *tile ids*, row-major):

```asm
Metatiles1: db  3,  1,  1,  4,    ; metatile 1, tile row 0
                1Dh, 5, 61h,60h,  ; metatile 1, tile row 1
                1Fh, 2, 61h,60h,  ; metatile 1, tile row 2
                60h,60h,0Ch,1Ch   ; metatile 1, tile row 3
            ...
```

**Metatile ids are 1-based.** `UnpackMetatiles` computes the address with `(id − 1) × 16`:

```
metatile_bytes = MetatileSet + (id − 1) × 16
```

A metatile id of `0` is treated as "empty" (the ROM never indexes it for normal rooms).

## Per-room selector tables (nibble arrays)

Three tables choose which assets a room uses. **Each entry is a nibble**, packed two
rooms per byte:

```
byte_index = room >> 1
even room  → high nibble of that byte
odd  room  → low  nibble of that byte
```

| Table | File | Selects |
|-------|------|---------|
| `MetaTileSetIDs` | `data/rooms.asm` | metatile set (value is **1-based**: `idxMetatileSet[value − 1]`) |
| `RoomGfxSetIds`  | `data/roomtileset.asm:10` | graphics tileset (0-based into `idxTileSets`) |
| `IdsRoomPal`     | `data/palettes.asm:34` | palette id 0–15 (0-based into `idxRoomPalettes`) |

Both `RoomGfxSetIds` and `IdsRoomPal` are 126 bytes → 252 rooms.

### `GetNibbleHL_A2` (Banks0123.asm:859)

```asm
GetNibbleHL_A2:
    ld   c, a          ; c = room
    srl  a             ; a = room / 2
    call ADD_HL_A      ; hl += room/2  → byte address
    bit  0, c          ; room odd?
    ld   a, (hl)
    jr   nz, GetNibbleHL_A3   ; odd → use low nibble
    rra \ rra \ rra \ rra     ; even → shift high nibble down
GetNibbleHL_A3:
    and  0Fh
    ret
```

### Worked example: room 0

| Selector | Table byte 0 | Nibble (room 0 → high) | Result |
|----------|-------------|------------------------|--------|
| Metatile set | `MetaTileSetIDs[0]` = `11h` | `1` | `idxMetatileSet[0]` = `Metatiles1` |
| Graphics set | `RoomGfxSetIds[0]` = `00h` | `0` | `idxTileSets[0]` = `TileSetBuilding` |
| Palette | `IdsRoomPal[0]` = `00h` | `0` | `idxRoomPalettes[0]` = `RoomPalette0` |

So room 0 draws its 8×6 grid using `Metatiles1`, the *building* tileset graphics, and
palette 0. Other verified mappings:

| Room | Tileset | Palette |
|---|---|---|
| 0 | Building | 0 |
| 20 | Building | 1 |
| 40 | Roof | 8 |
| 56 | Basement/Desert | 14 |

## Tileset loading

Before a room is drawn, the 256 tile "characters" it references must be decoded into
VRAM. Metatiles reference tiles by an 8-bit *tile number* (0–255); this is how each tile
number gets its graphics.

### Tile number → VRAM address (`TileToVramAdd`, 2687)

Tiles live in SCREEN 5 VRAM page 1 (starts at `0x8000`):

```
col  = tile & 0x1F          (0..31)
row  = tile >> 5            (0..7)
addr = 0x8000 + row*1024 + col*4
```

(1024 = 32 tiles × 32 bytes/tile per tile-row; 4 = bytes per tile column in a SCREEN 5
line.) Consecutive tile numbers advance one tile right and wrap at column 32 — so a block
loaded at a starting tile number fills sequential tile numbers.

### `LoadRoomTiles` (2540) — assembly order

On room entry, in this order (later loads overwrite earlier ones, so **order matters**):

```asm
LoadRoomTiles:
    call SetTilesetColors        ; BufferColor = ColorsTileset
    ld   hl, RoomGfxSetIds
    call GetNibbleRoom           ; A = graphics tileset id of this room
    ... (skip if already loaded) ...
    call LoadPowSwitTiles        ; power-switch / elevator panel tiles
    cp   6                       ; Metal Gear tileset?
    jr   z, LoadRoomTiles2       ; ...then skip crates
    call LoadGfxCrates           ; wood crates (+ flipped copies)
LoadRoomTiles2:
    ld   de, idxTileSets
    call GetPointerDE2A          ; IX = this tileset's block list
    ld   b, 3                    ; up to three blocks
LoadRoomTiles3:
    ld   a, (ix+0)
    rla                          ; bit 7 set → collision marker, stop
    jr   c, LoadColliTiles
    call LoadTileset
    ld   de, 5 \ add ix, de
    djnz LoadRoomTiles3
```

### Fixed extra tiles

Loaded into the same 256-tile space at fixed positions:

| Graphics | VRAM addr | Tile no. | Count | Routine |
|----------|-----------|----------|-------|---------|
| `gfxPowSwitch` | `0x9048` | `0x92` | 4 | `LoadPowSwitTiles` (3092) |
| `GfxCrates` | `0x9400` | `0xA0` | 8 | `LoadGfxCrates` (3111) |
| `GfxCrates` (flipped) | `0x9840` | `0xD0` | 8 | `LoadGfxCrates` |

The crates at `0xA0` (+ flipped at `0xD0`) is why metatiles reference tile numbers like
`0A0h, 0D0h, 0A2h, 0D2h …` for crate/barrel stacks (e.g. `Metatiles1` metatile 6).

### Tileset block format (`data/roomtileset.asm`)

`idxTileSets` lists 8 tilesets:

| Id | Tileset | Primary gfx file |
|---|---|---|
| 0 | Building | `gfx/building.asm` |
| 1 | Basement / Desert | `gfx/basementdesert.asm` |
| 2 | Roof | `gfx/roof.asm` |
| 3 | Elevator | `gfx/elevator.asm` |
| 4 | Lorry room | `gfx/lorry.asm` |
| 5 | Hind D | `gfx/hindd.asm` |
| 6 | Metal Gear | `gfx/metalgear.asm` |
| 7 | Ending | `gfx/ending.asm` |

Each tileset is up to **three 5-byte blocks**:

```
+0  flags   bit7 = collision-tiles marker (stop), bit6 = flip tiles
+1  count   number of tiles to decode
+2  dest    starting tile number
+3  ptr     pointer to 3bpp graphics (word)
```

A **flip block** is shorter — it reuses the *previous* block's count and graphics
pointer, only supplying new flags + dest (`+0 flags (bit6=1)`, `+1 dest`).

Example — `TileSetBuilding`:

```asm
TileSetBuilding:
    db 1            ; flags: normal
    db 87h          ; 135 tiles
    db 3            ; dest tile 3
    dw GfxBuilding
    db 21h          ; flags: normal
    db 28h          ; 40 tiles
    db 0A8h         ; dest tile 0xA8
    dw GfxBuilding2
    db 41h          ; flags: bit6 = flip
    db 0D8h         ; dest tile 0xD8  (reuses count=40, ptr=GfxBuilding2)
```

So the building tileset fills tiles `0x03..0x89` from `GfxBuilding`, `0xA8..0xCF` from
`GfxBuilding2`, and `0xD8..0xFF` from `GfxBuilding2` horizontally flipped. `TileSetRoof`
is an example of an early stop: one block then `db 80h` (bit7) → the loader jumps to the
collision-tile load and ignores the remaining blocks.

`LoadTileset` / `LoadTilesFlip` (2642) decode each block one tile at a time via
`Load3bppTiles` → `Decode3bppTile`; the flip path uses `Load3bppTileFlip` →
`LoadTilesGfxFlip` (see [graphics-formats.md](graphics-formats.md#horizontal-flip)).

### Collision tiles (not used for drawing)

After the graphics blocks, `LoadColliTiles` reads a 32-byte bitmap (`IdxColisTiles` →
`CollTiles*`) where each bit marks a tile as solid. This feeds movement/collision, not
rendering, so a pure renderer stops at the bit7 marker exactly like the ROM does for
drawing purposes.

## Other per-room tables (gameplay, not background)

- `SpritesetRooms` / `idxSprSet` — which sprites (actors) load for the room.
- `RoomGfxSetIds` doubles as the collision-tile selector (`IdxColisTiles`).
- `roomsconnections.asm`, `doors.asm`, `actorsinrooms.asm`, `itemsinrooms.asm` — gameplay
  overlays drawn on top of the background (see
  [rendering-pipeline.md](rendering-pipeline.md#full-screen-composition)).
