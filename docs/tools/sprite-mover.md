# Snake Sprite Mover — finding Snake's correct palette

This documents how the **Snake Sprite Mover** ([`Tools/MetalGearSpriteMover/`](../../Tools/MetalGearSpriteMover/))
arrives at the colours it paints Solid Snake with, why the "obvious" approach gives the
wrong result, and how the right colours were recovered from the assets already in this
repo. For running the mover and its file layout, see
[`Tools/MetalGearSpriteMover/README.md`](../../Tools/MetalGearSpriteMover/README.md).

> **Note:** `.asm` citations and `room_images/` references in this doc refer to the separate MSX disassembly repo ([southernsun/MetalGear](https://github.com/southernsun/MetalGear)), expected as a sibling clone at `../MetalGear`. `.cs`/`file:line` citations point at this repo's own tool source under `Tools/`.

It builds on:
- [sprites](../rom/sprites.md) — the monochrome sprite format and the CC / OR pairing.
- [palettes](../rom/palettes.md) — the MSX2 palette format and the game's base palette.

## 1. What the source tells us (structure, not colour)

A hardware sprite pattern is **monochrome** — it only says *which pixels are on*. The
colour lives elsewhere. For Snake the relevant tables are in `data/playersprite.asm`:

- `idxSnakeSpr` (`data/playersprite.asm:7`) — the list of pattern labels per
  direction/frame (`SprSnakeDown`, `SprSnakeDown1`, …).
- `SnakeAttrShare` (`data/playersprite.asm:94`) — the sprite attribute table that assigns
  each of the four 16×16 sprites a position and a **colour byte**:

```
SnakeAttrShare:  db 4
                 db 0E8h, 0F8h, 0,   7      ; sprite 0  colour 7
                 db 0E8h, 0F8h, 4,   4Ah    ; sprite 1  colour 4Ah = CC | 0Ah
                 db 0F8h, 0F8h, 8,   7      ; sprite 2  colour 7
                 db 0F8h, 0F8h, 0Ch, 4Ch    ; sprite 3  colour 4Ch = CC | 0Ch
```

The low nibble of each colour byte is the **palette index**; bit 6 is the VDP's **CC
(colour-combination) bit**, which asks the hardware to OR this sprite onto the one before
it. So Snake is two vertically-stacked OR-pairs and uses exactly four indices:

| Sprite | Pair | Index | Appears where |
|---|---|---|---|
| 0 | top | `7` | top half |
| 1 | top | `0Ah` (10), CC | top half, OR-ed onto sprite 0 |
| 2 | bottom | `7` | bottom half |
| 3 | bottom | `0Ch` (12), CC | bottom half, OR-ed onto sprite 2 |

Where two CC sprites overlap, the VDP shows the **bitwise OR of the colour codes**:

- top overlap = `7 | 0Ah` = `0Fh` (15)
- bottom overlap = `7 | 0Ch` = `0Fh` (15)

So every Snake pixel resolves to one of four palette indices: **7, 10, 12, 15**. That much
is pure source code — it gives the *structure* (which pixel is which index) but **not** the
actual RGB of those indices.

## 2. Why the boot palette is the wrong answer

The natural assumption is "indices 7/10/12/15 → look them up in the game's boot palette"
(`DefaultPalette`, see [palettes](../rom/palettes.md#the-boot-palette-defaultpalette-banks0123asm3935)).
That yields:

| Index | DefaultPalette | Colour |
|---|---|---|
| 7  | (2,6,7) | cyan |
| 10 | (6,6,1) | dark yellow |
| 12 | (1,4,1) | dark green |
| 15 | (7,7,7) | white |

Rendering Snake with these makes him a pale, **white-dominated** figure (the overlap is
the largest region and white is bright), which looks nothing like the real character.

Note that the *live* in-game base palette is **not** `DefaultPalette`: it is overwritten by
the persistent `PalMenuWeapon` overlay before gameplay (the Room Viewer finding — see
[palettes](../rom/palettes.md#key-finding-the-persistent-in-game-base-is-palmenuweapon-not-defaultpalette)).
That overlay sets **slot 15 = black** and **slot 12 = grey (3,3,3)** — which match two of
Snake's four indices below exactly, and is strong corroboration that the decode is right
and that the overlap really is dark. But it leaves slots **7 and 10 untouched**, and no
room or sprite-set palette overrides them either (those only touch 1/3/5/9 and 2/4/11/13).
So the in-game palettes alone still cannot fully colour Snake — his teal body (7) and tan
skin (10) come from elsewhere.

The resolution: the reference sprite sheet in this repo, `examples/22527.png`, shows Snake
as he should look. We use the **source for structure** and the **sheet for colour**, and
tie them together.

## 3. The method: correlate decoded structure with the reference

Label every pixel of one decoded frame with the palette *index* it came from, then read
the *colour* the reference sheet uses at that same pixel.

### 3a. Build a slot-map from the source

Decode `SprSnakeDown` (RLE → 128 bytes → four 16×16 sprites) and, for the standing frame,
paint a 16×32 image where each pixel is coloured by its **final index**:

```
for each pixel:
    a = sprite-A pixel set?     (top: sprite 0 / bottom: sprite 2  -> index 7)
    b = sprite-B pixel set?     (top: sprite 1 -> 10 / bottom: sprite 3 -> 12)
    slot = both ? 15 : a ? 7 : b ? (10 or 12) : transparent
```

Encode the slots as flat marker colours (e.g. 7→red, 10→green, 12→blue, 15→yellow,
off→black). The derivation used a throwaway `_slots.png` dump for this (since removed); today
`--export` writes only `_export.png`, the full frame sheet (`MainWindow.xaml.cs:349`).

### 3b. Align it with the reference

Find the idle-down sprite's bounding box in `examples/22527.png` (top-left cell, on the
magenta background) — it sits at origin **(x=2, y=26)**, 16×~28. The decoded frame and the
reference frame are the same pose, so they line up cell-for-cell.

### 3c. Read back the colour per slot

For every pixel, pair `slot-map[x,y]` with `reference[2+x, 26+y]` and tally. The result is
unambiguous — each slot maps to essentially one reference colour:

| Slot (index) | Reference colour | ≈ MSX2 levels |
|---|---|---|
| 7  | **teal** (36,71,72)   | (1,2,2) |
| 10 | **tan / skin** (218,145,109) | (6,4,3) |
| 12 | **gray** (109,109,109) | (3,3,3) |
| 15 (overlap) | **black** (0,0,0) | (0,0,0) |
| off | magenta (cell background) | — transparent |

The clean correlation is itself the proof that the decoder is correct: the slots line up
with the artwork pixel-for-pixel. Note that slots 12 (grey) and 15 (black) here **agree
with the live in-game base palette** (`PalMenuWeapon`), so only 7 and 10 are sheet-specific.

### 3d. The key insight

The **OR-overlap (index 15) is black, not white.** That overlap is the *largest* region of
the sprite — Snake's dark shading and outline. Painting it white (the boot palette) is
exactly what made the earlier attempt look washed-out. With 15 = black, the teal body (7)
and tan skin (10) read correctly against the dark shading.

## 4. How the app uses it

`SnakePalette.SnakeColors()` (`Tools/MetalGearSpriteMover/SnakePalette.cs`) returns a
16-entry palette with just Snake's four indices set to the colours found above:

```
index 7  -> levels (1,2,2)  teal   (body)
index 10 -> levels (6,4,3)  tan    (face / skin)
index 12 -> levels (3,3,3)  gray   (leg detail)
index 15 -> levels (0,0,0)  black  (overlap shading / outline)
```

The levels are expanded with the **same level curve** used for the room backgrounds
(`{6,32,72,104,144,176,216,247}`, see [palettes](../rom/palettes.md#level--8-bit-rgb)) so
Snake sits naturally on the captured room screenshots.

`SnakeSprites.Render` (`SnakeSprites.cs:144`) then paints each frame: for every pixel it picks `palette[7]`,
`palette[10]`/`palette[12]`, or — where both sprites of a pair are set —
`palette[7 | 0Ah]` / `palette[7 | 0Ch]`, which is `palette[15]` (black). Snake's palette is
fixed, so the twelve frames (4 directions × 3 walk frames) are composited once at startup.

## Caveat

This is the **sheet's palette**, not provably the live ROM palette for indices 7 and 10.
The MSX2 has a single shared 16-colour palette for both tiles and sprites; the live base
(`PalMenuWeapon`) pins 12=grey and 15=black, which Snake matches, but 7 and 10 are never
set by any palette the game loads in the rooms examined — so the teal body and tan skin
come from the agreed ground-truth reference sheet rather than a palette proven loaded at a
specific moment. The Sprite Mover draws Snake as a separate overlay, so giving him his own
palette doesn't conflict with the baked-in room background image.

## Reproducing the derivation

1. `dotnet run --project Tools/MetalGearSpriteMover -- --export` → writes `_export.png` (all
   frames) next to the executable. (The original derivation also dumped a `_slots.png`
   slot-map, since removed — reproduce it by colouring each pixel by its slot as above.)
2. Locate the idle-down sprite in `examples/22527.png` (origin (2,26), 16×28).
3. For each pixel, pair the slot-map marker colour with the reference colour and tally; the
   dominant reference colour per slot is that index's colour.
4. Convert each colour to MSX2 levels (`round(value / 255 * 7)`) and plug into
   `SnakePalette.SnakeColors()`.
