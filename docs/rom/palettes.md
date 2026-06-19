# Palettes

This is the trickiest part of the graphics to get right, and the source of the one
finding that isn't obvious from the data tables alone (the **base-palette layering**,
below). It was reverse-engineered independently by both the Room Viewer and the GFX
Viewer; this doc reconciles the two.

> **Note:** `.asm` / `file:line` citations and `room_images/` references in this doc refer to the separate MSX disassembly repo ([southernsun/MetalGear](https://github.com/southernsun/MetalGear)), expected as a sibling clone at `../MetalGear`.

## MSX2 palette format

SCREEN 5 has 16 color slots; each slot is **3 bits per channel** (0–7). The V9938 stores
a color as **two bytes**:

```
byte0 = (Red << 4) | Blue      (0RRR0BBB)
byte1 = Green                  (00000GGG)
```

`SetPaletteColor` (`Banks0123.asm:3869`) writes `d` (= byte0, "Red Blue") then `e`
(= byte1, "Green").

> This byte order is easy to get wrong: the middle byte is **R|B**, not R|G. The green
> level is the *third* byte. (Both viewers originally had G and B swapped, which made
> room colors look off.)

A palette block is a list of triplets `(slot, byte0, byte1)` terminated by `0FFh`,
applied by `SetPalette` (`Banks0123.asm:3961`). **`SetPalette` only writes the slots
present in the block — it does not clear the others.** That single fact is what makes
the layering below work.

## Level → 8-bit RGB

The MSX2 outputs an analog signal; an emulator maps the 8 levels to 8-bit values.
Sampling the reference screenshots in [`room_images/`](https://github.com/southernsun/MetalGear/blob/master/room_images/)
recovered the exact curve:

```
level   0    1    2    3    4    5    6    7
byte    6   32   72  104  144  176  216  247
```

Both viewers use this table (`Msx2Palette.LevelTable` / `RoomViewer Palette`) so
converted palettes match the captured screenshots. To convert a channel to 8-bit RGB
without the curve, `value * 255 / 7` is the linear approximation.

## The boot palette (`DefaultPalette`, Banks0123.asm:3935)

`SetDefaultPal` loads all 16 slots from `DefaultPalette` at boot / Konami logo. Decoded
to (R,G,B) levels:

```
 0 (0,0,0)   1 (0,0,0)   2 (1,6,1)   3 (3,7,3)
 4 (1,1,7)   5 (2,3,7)   6 (5,1,1)   7 (2,6,7)
 8 (7,1,1)   9 (7,3,3)  10 (6,6,1)  11 (6,6,4)
12 (1,4,1)  13 (6,2,5)  14 (5,5,5)  15 (7,7,7)
```

In this palette slot 15 is white, slot 14 is mid-grey, slot 8 is red, slot 12 is dark
green. **These are NOT the values rooms display in gameplay** — see the key finding.

## Key finding: the persistent in-game base is `PalMenuWeapon`, not `DefaultPalette`

Rooms only re-tweak a few slots (`SetRoomPal`, below) — they **never set slots 8, 12, 14,
15**. If those kept their `DefaultPalette` values, rooms would render with a white slot
15 and green slot 12, which does **not** match the screenshots (mechs/crates come out
white instead of dark teal, floor green instead of brown).

The fixed slots are actually established by the **persistent in-game base palette**
`PalMenuWeapon` (`data/palettes.asm:4`), applied by `SetMenuWeaponPal`
(`Banks0123.asm:2873`, called on menu/equipment screens that precede gameplay):

```asm
PalMenuWeapon:  db  0,  0,   0     ; slot 0  = black
                db  6, 70h,  7     ; slot 6  = yellow
                db  8, 70h,  0     ; slot 8  = red
                db 0Ch, 33h, 3     ; slot 12 = grey  (104,104,104)
                db 0Eh, 77h, 7     ; slot 14 = white
                db 0Fh,  0,  0     ; slot 15 = black
                db 0FFh
```

Because `SetPalette` only overwrites the slots it lists, these values **persist** when
control returns to the room (`RenderScreen` re-applies only the sparse `SetRoomPal`). So
the colors a room actually shows are:

```
boot:    DefaultPalette          (all 16 slots)
  then:  PalMenuWeapon overlay   (slots 0, 6, 8, 12, 14, 15)   ← persists
  then:  RoomPalette<n> overlay  (slots 1, 3, 5, 9)            ← per room
```

Notably this **swaps the intuitive defaults**: in gameplay **slot 14 is white and slot
15 is black** (the reverse of `DefaultPalette`), and slot 12 is grey.

> **Which viewer does what.** The Room Viewer reproduces this exactly
> (`PalMenuWeapon` base + room overrides — verified pixel-exact). The GFX Viewer
> currently layers room/sprite overrides on `DefaultPalette` *only* and does **not** apply
> the `PalMenuWeapon` overlay (`Msx2Palette.GameBaseLevels` is `DefaultPalette`); for the
> fixed slots its colors are therefore approximate. Aligning the GFX viewer's base with
> `PalMenuWeapon` is a known clean-up. This also resolves the Snake-palette caveat — see
> [the sprite-mover doc](../tools/sprite-mover.md#caveat).

## Per-room palettes (`SetRoomPal`, Banks0123.asm:2937)

On room entry the game picks a palette id from the `IdsRoomPal` nibble table (see
[rooms.md](rooms.md)) and applies one of `RoomPalette0..15` (`data/palettes.asm:70+`).
Inspecting all 16: they only ever set slots **1, 3, 5, 9** (occasionally 12) — the slots
`ColorsTileset` maps the variable tile colors to. Worked example, room palette 0:

```asm
RoomPalette0:  db 1, 12h, 2   ; slot 1: R=1 B=2 G=2  -> #204848
               db 3, 01h, 1   ; slot 3: R=0 B=1 G=1  -> #062020
               db 5, 31h, 2   ; slot 5: R=3 B=1 G=2  -> #684820
               db 9, 20h, 1   ; slot 9: R=2 B=0 G=1  -> #482006  (brown floor)
               db 0FFh
```

These four colors reproduce the dominant colors of `room_images/MGEAR1_0000.png` exactly.

By area (from `IdsRoomPal × RoomGfxSetIds`):

| Palette | Area |
|---|---|
| 0–3 | Building (base; lighting variants) |
| 4, 6, 7 | Lorry / truck rooms |
| 5 | Basement / desert |
| 8 | Building / roof |
| 9 | Building / Metal Gear |
| 10 | Goggles (infrared gray) |
| 11 | Dark room (needs flashlight) |
| 12 | Hind D (boss) |
| 13, 15 | Special (red) |
| 14 | Basement / lorry |

### Special-case palettes (`SetRoomPal`)

- Rooms 123–125, 220, 221 are **dark rooms**: without the flashlight equipped they use
  palette `0Bh` (`RoomPalette11`, all black). With the flashlight, the normal palette is
  used.
- With **goggles** equipped, palette `0Ah` (`RoomPalette10`, greys) simulates infrared.
- Room 251 is the ending.

## Sprite-set palettes

`SprsetPal*` (`data/palettes.asm:214+`) override the sprite color indices (**2, 4, 11,
13**), selected per room's sprite-set by `SetSprPal` (`Banks0123.asm:2915`) via
`idxSprSetPals`. Note these are *different* slots from the room (1,3,5,9) and fixed
(8,12,14,15) slots — so neither the room palette nor the sprite-set palette touches
Snake's own indices (7, 10 — the slots `SnakePal` at `Banks0123.asm:2890` sets). See [sprites.md](sprites.md) and
[the sprite-mover doc](../tools/sprite-mover.md).

## UI palettes

- `RadioPalette` (`data/palettes.asm:15`) — radio/codec screen.
- `PalMenuWeapon` (`data/palettes.asm:4`) — weapon/equipment menu (and the persistent
  in-game base, above).

## How the base palette was verified

The 3bpp decode and tile assembly were already producing pixel-perfect *shapes*, but
wrong colors. The viewer rendered room 0 as a per-pixel **color-slot map** (each pixel =
its 0–15 slot) and, for each slot, looked up the color of the corresponding pixels in
`MGEAR1_0000.png`:

```
slot  1: (32,72,72)    slot  3: (6,32,32)     slot  5: (104,72,32)
slot  9: (72,32,6)     slot 12: (104,104,104) slot 14: (247,247,247) white
slot 15: (6,6,6) black
```

Each slot mapped cleanly to a **single** color — which simultaneously proved the 3bpp
decode correct *and* revealed the true fixed-slot values. Slots 1/3/5/9 matched
`RoomPalette0`; slots 12/14/15 matched `PalMenuWeapon`, **not** `DefaultPalette`. (Full
method in [room-viewer.md](../tools/room-viewer.md#how-fidelity-was-verified).)

## Summary table (room 0, palette 0)

| slot | source | byte0,byte1 | RGB | role |
|------|--------|-------------|-----|------|
| 1 | RoomPalette0 | 12h,2 | (36,72,72) | mech/crate light |
| 3 | RoomPalette0 | 01h,1 | (0,36,36) | floor dark |
| 5 | RoomPalette0 | 31h,2 | (108,72,36) | brown light |
| 9 | RoomPalette0 | 20h,1 | (72,36,0) | brown |
| 8 | PalMenuWeapon | 70h,0 | (255,0,0) | (unused in room 0) |
| 12 | PalMenuWeapon | 33h,3 | (104,104,104) | grey |
| 14 | PalMenuWeapon | 77h,7 | (255,255,255) | white highlight |
| 15 | PalMenuWeapon | 00h,0 | (0,0,0) | black outline |
