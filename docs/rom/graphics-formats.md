# Graphics formats (1 / 2 / 3 / 4 bpp + RLE)

Metal Gear runs in MSX2 **SCREEN 5**: a 4-bit-per-pixel bitmap (16 colors), packed
**2 pixels per byte** (high nibble = left pixel, low nibble = right pixel). Everything
below is eventually written to VRAM in that 4bpp packed form. The *source* data,
however, is stored more compactly and expanded by dedicated loaders.

All routine references are in `Banks0123.asm` unless noted.

> **Note:** `.asm` / `file:line` citations and `room_images/` references in this doc refer to the separate MSX disassembly repo ([southernsun/MetalGear](https://github.com/southernsun/MetalGear)), expected as a sibling clone at `../MetalGear`.

## Tile graphics: 1 / 2 / 3 bpp

Background tiles are 8×8 and stored as **bit planes** — 1, 2, or 3 bits per pixel — to
save ROM. A loader reads the packed bytes, looks each pixel value up in an 8-entry
**color table** (`BufferColor`), and writes the resulting 4bpp pixels to VRAM. The
packed value is *not* a color directly: it indexes the color table, which yields the
real 0–15 palette slot. This buys ~25% smaller graphics **and** the ability to recolour
a whole tileset by changing 8 bytes.

| Loader | Entry | bpp | Bytes per 8×8 tile | Used for |
|---|---|---|---|---|
| `Load1bppTile` | 4441 | 1 | 8 | font, digits, symbols, Konami logo |
| `Load2bppTile` | 5023 | 2 | 16 | surveillance cameras, incoming-call sign |
| `Load3bppTiles` | 5129 | 3 | 24 | room tilesets, items, crates, radio, portrait, MG logo |

### 3bpp storage layout

Each tile is **8 lines × 3 bytes = 24 bytes**. The three bytes of a line are the three
**bit-planes** of those 8 pixels:

```
line L bytes:  [ plane0 ][ plane1 ][ plane2 ]
                 (e)        (d)        (c)
```

For pixel `p` (`p = 0` is leftmost = bit 7), the 3-bit color index is:

```
index(p) = (bit_p(c) << 2) | (bit_p(d) << 1) | bit_p(e)
```

where `c` is the most-significant plane. Bits are consumed **MSB-first**
(pixel 0 ↔ bit 7).

### `Decode3bpp` (Banks0123.asm:5204)

```asm
Decode3bpp:
    ld   b, 4            ; 4 output bytes = 8 pixels in SCREEN 5
    ld   e, (hl) \ inc hl   ; e = plane 0  (byte 0)
    ld   d, (hl) \ inc hl   ; d = plane 1  (byte 1)
    ld   c, (hl) \ inc hl   ; c = plane 2  (byte 2, the high bit)
Decode3bpp2:
    xor  a
    rl   c \ rla         ; a = (a<<1) | top bit of c   → bit 2
    rl   d \ rla         ;                              → bit 1
    rl   e \ rla         ;                              → bit 0
    ; a = 3-bit color index for this pixel
    exx
    ld   e, a
    ld   d, BufferColor/256
    ld   a, (de)         ; BufferColor[index] = 4-bit color
    add  a,a \ add a,a \ add a,a \ add a,a   ; <<4  → high nibble (pixel 1)
    ld   c, a
    exx
    ... repeat for the second pixel, OR into the low nibble ...
    ld   (hl), a         ; store 1 byte = 2 packed SCREEN 5 pixels
    inc  hl
    djnz Decode3bpp2
    ret
```

`Decode3bppTile` (5183) just calls `Decode3bpp` 8 times (one per line). The **two pixels
per output byte** are packed `high nibble = left pixel, low nibble = right pixel`.

### 2bpp decode (`Decode2bppRow`, 5076)

Each row is 2 bytes (`E` = byte1 = low plane, `D` = byte2 = high plane):

```
value = (bit(7-p) of byte2) << 1 | (bit(7-p) of byte1)
```

> Note: the high plane is the **second** byte. (An early version of the GFX viewer had
> these swapped.)

## Color tables (`BufferColor`)

A graphic's packed pixel value indexes an 8- (or 4-) entry table copied into
`BufferColor` (`E700h`) before decoding, via `SetTilesetColors` / `SetColorsIndexes`
(826 / 829):

```asm
SetTilesetColors:
    ld hl, ColorsTileset
SetColorsIndexes:
    ld c, 8
    ld de, BufferColor
    ld b, 0
    ldir                 ; copy 8 bytes
```

| Table | Location | Values (palette indices) | Used by |
|---|---|---|---|
| `ColorsTileset` | 2998 | 1, 3, 5, 8, 9, 12, 14, 15 | room tilesets, crates, radio, power switch |
| `ColorsItems` | 2999 | 0, 6, 7, 8, 10, 12, 14, 15 | items, alert icon |
| `ColorsCameras` | 3000 | 0, 2, 13, 15 | cameras (2bpp) |
| `ColorsPitfall` | 3001 | 0, 5, 9, 15 | pitfall tiles |
| `ColSnakePic` | 3002 | 2, 4, 8, 11, 13, 12, 14, 15 | Snake radio portrait |
| `MGLogoColors` | `logic/mainmenu.asm:181` | 0, 2, 3, 4, 5, 9, 10, 14 | Metal Gear logo |
| `colorsCALL` | `logic/loadfont.asm:57` | 6, 8, 14, 15 | incoming-call sign (2bpp) |

**Room background tiles always use `ColorsTileset`.** Different graphics use different
tables via the same `SetColorsIndexes` entry point (e.g. `LoadGameGfx` at 3013 loads
items with `ColorsItems`, cameras with `ColorsCameras`, the portrait with `ColSnakePic`).

### Why `ColorsTileset` picks those slots

`ColorsTileset = {1,3,5,8,9,12,14,15}`. The 3-bit index maps as:

| 3-bit index | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|-------------|---|---|---|---|---|---|---|---|
| palette slot | 1 | 3 | 5 | 8 | 9 | 12 | 14 | 15 |

The spread is deliberate so the **per-room palette can recolour the variable parts**
(slots 1, 3, 5, 9) while the fixed highlights/shadows (slots 8, 12, 14, 15) stay
constant — see [palettes.md](palettes.md). Indices 0,1,2,4 → variable slots; indices
3,5,6,7 → fixed slots.

## Raw 4bpp blocks: doors

Door graphics (`gfx/doors.asm`) are stored as **raw SCREEN 5 bytes** (4bpp, 2 px/byte)
and block-copied to VRAM by `LoadGfxDoors` → `LoadTilesGfxBlk` (2710 / 2754). The data
is laid out as `NX` sequential 8×8 tiles per row; after each row the VRAM pointer
advances `0x400` (one pixel-row band). So a door is `NX × NY` tiles of 32 bytes each:

| Label | Size (tiles) |
|---|---|
| `GfxDoorFront`, `GfxDoorElevator` | 4 × 4 |
| `GfxDoorLeft`, `GfxDoorRight` | 1 × 4 |
| `GfxDoorDown` | 4 × 1 |

## RLE compression

Sprite patterns and some graphics are run-length encoded, decoded by `UnpackGfx` (3684)
and `SetSnakeSprPatt` (5543). Reading control byte **B**:

- `(B & 7Fh) == 0` → end of this segment (B is `00h` or `80h`)
- `B < 80h` → **run**: the next byte is repeated `B` times
- `B ≥ 80h` → **literal**: copy the next `(B & 7Fh)` bytes verbatim

Two callers, one small difference:

- `UnpackGfx` writes straight to the VDP and treats `80h` as a *new VRAM address* marker
  (a 2-byte address follows), not a stop.
- `SetSnakeSprPatt` (sprite patterns) treats both `00h` and `80h` as end-of-segment.

Sprite `.asm` files concatenate many segments (one per animation frame), each ending in
a terminator. Example: `SprSnakeDown` begins `0C2h, 3, 7, 7, …` — `0C2h` means "copy 66
literal bytes", so `3, 7, 7, …` are pattern data, **not** a header. See
[sprites.md](sprites.md).

## Horizontal flip

A flipped tile is produced by `LoadTilesGfxFlip` (4542). For each line it reads the 4
SCREEN 5 bytes and writes them out in reverse order **with the nibbles of each byte
swapped** — a full 8-pixel horizontal mirror (in C# this is just `dstX = 7 − px`).
Flipping reuses one set of graphics for both facings (e.g. the right half of a crate
stack, doors). See [rooms.md](rooms.md#tileset-loading).

## Worked decode: first building tile

`GfxBuilding` line 0 = `0FFh, 1Fh, 1Fh` → `e=FF, d=1F, c=1F`.
`0x1F = 0001 1111`, so planes `c,d` have bit 7..5 = 0 and bit 4..0 = 1; plane `e` is all
1s.

| pixel | c | d | e | index | slot |
|-------|---|---|---|-------|------|
| 0–2 (bits 7–5) | 0 | 0 | 1 | 1 | 3 |
| 3–7 (bits 4–0) | 1 | 1 | 1 | 7 | 15 |

So the line is three pixels of slot 3 (dark) then five of slot 15 (a highlight). This
decode was confirmed pixel-exact by recovering the palette from the screenshots — see
[palettes.md](palettes.md#how-the-base-palette-was-verified) and
[../tools/room-viewer.md](../tools/room-viewer.md#how-fidelity-was-verified).

## Where each graphic lives / how it's built

See the [GFX viewer catalogue](../tools/gfx-viewer.md#the-catalogue-gfxcatalogcs) for the
full per-file table (bit depth, color table, palette, compression). It was built
directly from the loader call sites above.
