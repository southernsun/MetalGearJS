# Rendering pipeline

This ties together the [room data model](rooms.md), [tile graphics](graphics-formats.md)
and [palette](palettes.md) into the routines that actually paint a room. Routine
references are in `Banks0123.asm`.

> **Note:** `.asm` / `file:line` citations and `room_images/` references in this doc refer to the separate MSX disassembly repo ([southernsun/MetalGear](https://github.com/southernsun/MetalGear)), expected as a sibling clone at `../MetalGear`.

## `RenderRoom` (3391)

Renders the 8×6 metatile grid into the VRAM character map, in two phases: **unpack** the
metatiles into a flat 32×24 tile buffer, then **draw** that buffer tile by tile.

```asm
RenderRoom:
    call ClearPage0
    ld   hl, RoomTileBuffer       ; flat 32×24 = 0x300 tile-number buffer
    ld   de, idxRooms
    call GetRoomPointer           ; HL = room (8×6 metatile ids)
    ld   b, 6                     ; 6 rows of metatiles
RenderRoom2:
    call UnpackMetatiles          ; expand one row of 8 metatiles → 32×4 tiles
    ... advance buffer by 0x80 (32 tiles × 4 rows), advance room by 8 ...
    djnz RenderRoom2
    ; draw phase
    ld   hl, RoomTileBuffer
    ld   bc, 300h                 ; 768 tiles
RenderRoom3:
    ld   a, (hl) \ inc hl
    call DrawTile                 ; draw one 8×8 tile at the current position
    call CalcNextCharPos
    dec  bc \ jr nz, RenderRoom3
```

`RoomTileBuffer` is `32 × 24 = 768` tile numbers — exactly the visible SCREEN 5 page.

## `UnpackMetatiles` (3322)

Expands one row of 8 metatiles into the tile buffer. For each metatile it copies its 4×4
tile ids into the buffer at the right place, using a stride so the four tile-rows land 32
tiles apart (the buffer is 32 wide):

```asm
UnpackMetatiles:
    ld   a, 8 \ ld (MetatilesNX), a       ; 8 metatiles across
    ld   hl, MetaTileSetIDs
    call GetNibbleRoom \ dec a            ; metatile set (1-based → 0-based)
    ld   de, idxMetatileSet \ call GetPointerDE2A
UnpackMetatiles2:
    ld   a, (metatile id) \ call DEC_A_HL_4xA
    add  hl,hl \ add hl,hl \ add hl,de    ; HL = MetatileSet + (id-1)*16
    ld   c, 4                             ; 4 tile-rows
UnpackMetatiles3:
    ld   b, 4                             ; 4 tiles per row
UnpackMetatiles4:
    ldi tile → buffer (×4)
    ld   a, 1Ch \ call ADD_DE_A           ; next buffer row (+28 → +32 total)
    dec  c \ jr nz, UnpackMetatiles3
    ... step buffer to next metatile column, loop 8 times ...
```

The metatile id selects 16 bytes (`(id-1)*16`, see [rooms.md](rooms.md#metatiles-datametatilesasm)),
scattered into a 4×4 region of the 32-wide buffer.

## `DrawTile`

Draws one 8×8 character: looks up the tile's pattern in VRAM (loaded by `LoadRoomTiles`,
see [rooms.md](rooms.md#tileset-loading)) and writes it at the current screen position.
`CalcNextCharPos` advances left-to-right, top-to-bottom.

## Full-screen composition

A room as you see it in-game is the background plus several overlays, drawn in order by
`RenderScreen` (11503):

```asm
RenderScreen:
    call DisableScreen
    call ClearSprAttr            ; hide sprites
    call LoadSprProjectile
    ...
    call RenderRoom              ; (1) the background tilemap
    call SetRoomPal              ; (2) room palette (palettes.md)
    call SetSprPal               ; (3) sprite palette
    call DrawDoors               ; (4) doors
    call DrawRoomItems           ; (5) items on the floor
    call DrawLaserBeams          ; (6) lasers (with goggles)
    ...
```

Steps **(1)** and **(2)** are the static background. The rest are actors/overlays:

| Overlay | Routine | Why it's separate |
|---------|---------|-------------------|
| Enemies, Snake | `UpdateSprites` etc. | hardware sprites, move every frame |
| Items on floor | `DrawRoomItems` | per-room item list, can be picked up |
| Doors | `DrawDoors` | animated, drawn from fixed door graphics |
| Laser beams | `DrawLaserBeams` | only visible with goggles |
| HUD | `Hud` | overlaid border/status |

This is why a handful of small marks in some `room_images/` screenshots (enemies, items)
do not appear in a background-only renderer — they aren't part of the room tilemap.

## How the C# Room Viewer maps to this

| ROM routine | C# (`Tools/RoomViewer/`) |
|-------------|--------------------|
| `RenderRoom` | `RoomRenderer.DrawRoom` |
| `UnpackMetatiles` + `DrawTile` | `RoomRenderer.DrawMetatile` + `DrawTile` |
| `LoadRoomTiles` | `TileSetBuilder.Build` |
| `Decode3bppTile` | `Tile.Decode3bpp` |
| `SetRoomPal` / base palette | `RoomRenderer.BuildScene` + `Palette` |

The C# `DrawRoom` skips the intermediate flat tile buffer and draws each metatile
straight to the output bitmap — identical result, since the buffer was only a VRAM-layout
convenience. See [../tools/room-viewer.md](../tools/room-viewer.md).
