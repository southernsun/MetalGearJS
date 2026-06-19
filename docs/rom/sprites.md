# Hardware sprites and how they get their color

> **Note:** `.asm` / `file:line` citations and `room_images/` references in this doc refer to the separate MSX disassembly repo ([southernsun/MetalGear](https://github.com/southernsun/MetalGear)), expected as a sibling clone at `../MetalGear`.

## Pattern format

Metal Gear uses MSX2 **sprite mode 2**: sprites are **16×16** and **monochrome** (1 bit
per pixel). A 16×16 sprite is 32 bytes, stored as four 8×8 quadrants in the order **TL,
BL, TR, BR** (top-left, bottom-left, top-right, bottom-right).

The pattern data carries **no color** — every set pixel is "on", every clear pixel is
"off". Sprite pattern data is RLE-compressed (see
[graphics-formats.md](graphics-formats.md#rle-compression)) and decompressed into the
sprite pattern table by `SetSnakeSprPatt` (`Banks0123.asm:5543`).

A sprite `.asm` file (`gfx/sprites.asm`) concatenates one segment per animation frame.
Selecting a single label (e.g. `SprSnakeDown`) gives exactly that frame's patterns;
`SprSnakeDown` decompresses to 128 bytes = 4 sprites (= 2 OR-pairs, see below).

## Where color comes from

Color is in the **sprite attribute / color tables**, not the pattern:

- Each hardware sprite gets **one color** (a palette index). `SetSnakeSprCol`
  (`Banks0123.asm:5468`) and `SetActorSprColors` (1925) write a single color byte for all
  16 lines of each sprite.
- Snake: `SnakeAttr*` (`data/playersprite.asm:94+`) — each entry is
  `Yoffset, Xoffset, patternNumber, color`.
- Enemies/objects: `ActorSprColors*` (`data/actorspriteattr.asm:82+`), selected per actor
  via `idxActorSprCols`.

## Multi-color via the CC bit

A single monochrome sprite is one color. The game makes **multi-color** characters by
drawing sprites in **overlapping pairs** and OR-combining them, using the VDP's **CC
(color combination) bit** — bit 6 of the color byte.

Example, Snake's `SnakeAttrShare`:

```
db 4                       ; 4 sprites
db 0E8h, 0F8h, 0,   7      ; pattern 0, color 7
db 0E8h, 0F8h, 4,   4Ah    ; pattern 4, color 4Ah = CC | 0Ah  (same position as above)
db 0F8h, 0F8h, 8,   7      ; pattern 8, color 7
db 0F8h, 0F8h, 0Ch, 4Ch    ; pattern Ch, color 4Ch = CC | 0Ch
```

Patterns 0 & 4 occupy the same position. Where only pattern 0 has a dot you see color
`7`; where only pattern 4 has a dot you see color `0Ah`; where **both** have a dot the
VDP shows `7 | 0Ah`. That's **three colors per overlapping pair** — the "3 colors per
line" noted in `logic/updatesprites.asm`. The two pairs (0+4 and 8+0Ch) stack vertically
(Y offsets `E8h` then `F8h`) to form the full 16×32 Snake.

`ActorSprColors*` follow the same idea — most are pairs like `2, 4Dh, 2, 4Dh` (color `2`
and `CC | 0Dh`).

Recovering Snake's actual RGB from these indices is its own problem — see
[../tools/sprite-mover.md](../tools/sprite-mover.md).

## In the GFX viewer

- **Sprite Mode (RLE)** decompresses the patterns and lays them out as 16×16 sprites.
  Because a pattern is monochrome, you choose the foreground color index (the *Color Set*
  selector — sprites default to color 7, Snake's primary).
- **Composite (multicolor)** reproduces the CC pairing: it overlays consecutive 16×16
  pairs and paints color A, color B, and `A | B`. Selecting a single sprite label
  composites that frame exactly — Snake with colors 7 and 10 comes out as in-game.
  Implementation: `MainWindow.RenderCompositeSprites`, with the quadrant reader
  `SpritePixel`.

### Limitation

The viewer composites *consecutive* pairs, exact when you select one sprite label (one
frame). It does not yet map every actor's `ActorSprColors`/offset table per label, so for
non-Snake characters you pick the two colors to match. Mapping the actor attribute tables
per label is the natural next step for fully automatic sprite colors.
