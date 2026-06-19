# Metal Gear (MSX2, RC750) — ROM internals, tools & browser-port documentation

How *Metal Gear* (Konami, MSX2, 1987) stores and builds its graphics, rooms and sound,
reverse-engineered from the MSX disassembly, plus how the companion C# tools reproduce it and
how the [`web/`](../web/) browser port re-implements the game from the exported assets.
Everything here was confirmed against the game's own routines and the reference
screenshots/sheets in the disassembly's `room_images/` and this repo's
[`examples/`](../examples/); routine and table references use `file:line` so they can be
checked against the source.

> **Note:** This repo is the JavaScript/web port. The MSX disassembly these docs describe
> (the `.asm` sources and `room_images/`) lives in a separate repo,
> [southernsun/MetalGear](https://github.com/southernsun/MetalGear) (a fork of
> [GuillianSeed/MetalGear](https://github.com/GuillianSeed/MetalGear)), expected as a sibling
> clone at `../MetalGear`. All `.asm` / `file:line` / `room_images/` references below point
> there.

The docs are split into three layers: **ROM internals** (knowledge about the game itself,
shared by everything), **tools** (the C# apps that put that knowledge to use), and the
**browser port & audits** (the playable `web/` re-creation and the coverage/audit docs that
track how faithfully it reproduces the ROM).

## ROM internals — [`rom/`](rom/)

| Doc | Covers |
|-----|--------|
| [graphics-formats](rom/graphics-formats.md) | Tile/sprite encodings (1/2/3/4 bpp), the color tables, RLE compression, horizontal flip, and the loader routines that expand them into VRAM. |
| [palettes](rom/palettes.md) | MSX2 palette format, the level→RGB curve, and the key finding: the live in-game base palette is `PalMenuWeapon` (not `DefaultPalette`); rooms re-tweak only 4 slots on top. |
| [rooms](rom/rooms.md) | The room data model (room → metatile → tile), the per-room nibble tables, and how a room's 256-tile character table is assembled in VRAM. |
| [rendering-pipeline](rom/rendering-pipeline.md) | `RenderRoom` → `UnpackMetatiles` → `DrawTile`, and how `RenderScreen` composes the full frame (background + overlays). |
| [sprites](rom/sprites.md) | The monochrome hardware-sprite format and how multi-color characters are made by OR-combining pairs (the VDP CC bit). |
| [music-format](rom/music-format.md) | The byte-stream command language every song/SFX is written in: opcodes, instrument sub-format, note/octave/tempo conventions. |
| [sound-driver](rom/sound-driver.md) | How `sound/bgmdriver.asm` runs each frame: channel state, the note/instrument state machine, ADSR, vibrato, PSG register writes. |

## Tools — [`tools/`](tools/)

Four C# apps, each a data-driven port that reads the real `.asm`/data tables rather than
baking in pre-rendered output. Each tool's own `README.md` covers running it; the docs
below cover *how it works* and what was learned building it.

| Tool | Doc | Project |
|------|-----|---------|
| Room Viewer | [room-viewer](tools/room-viewer.md) | [`Tools/RoomViewer/`](../Tools/RoomViewer/) — renders any room pixel-exact (WinForms) |
| GFX Viewer | [gfx-viewer](tools/gfx-viewer.md) | [`Tools/MetalGearGfxViewer/`](../Tools/MetalGearGfxViewer/) — browses/decodes all graphics (WPF) |
| Snake Sprite Mover | [sprite-mover](tools/sprite-mover.md) | [`Tools/MetalGearSpriteMover/`](../Tools/MetalGearSpriteMover/) — walks Snake around, true sprite colors (WPF) |
| Music + SFX Player | [sound-player](tools/sound-player.md) + [music-extraction](tools/music-extraction.md) | [`Tools/ThemeOfTaraPlayer/`](../Tools/ThemeOfTaraPlayer/) — plays all tracks/SFX via PSG emulation (WPF) |

## Browser port & audits

The [`web/`](../web/) folder is a playable browser re-creation (vanilla JS + Canvas) built
from assets exported by the C# tools above. These docs cover it and track how faithfully it
matches the ROM. (Several are auto-generated — regenerate, don't hand-edit.)

| Doc | Covers |
|-----|--------|
| [SESSION-STATE](SESSION-STATE.md) | The browser-port handoff/orientation doc: how to run and re-export the `web/` game, controls, the OpenSpec change log, known divergences, and current coverage. **Start here for the port.** |
| [rom-coverage](rom-coverage.md) | Per-component matrix of how much of the original ROM's gameplay routines are reimplemented (done/partial/todo, strict vs blended %). *Auto-generated* by `node Tools/coverage/coverage.mjs`. |
| [rom-data-formats](rom-data-formats.md) | The ROM's data-storage formats the exporters parse: graphics planes, door/item/radio/text tables, sound opcodes. |
| [room-rendering](room-rendering.md) | The room render pipeline traced ROM → RoomViewer → `web/game.js` (metatiles, tile decode, palettes, water/ladder tile constants). |
| [room-audit](room-audit.md) + [room-audit-notes](room-audit-notes.md) | Per-room ROM-vs-port actor/item/door coverage (*auto-generated* by `node Tools/audit/audit-rooms.mjs`) plus a curated companion of gaps, ROM sources, and fixes. |
| [sound-audit](sound-audit.md) + [sound-audit-notes](sound-audit-notes.md) | Per-room music / call-bit / shoot-secure audit (*auto-generated* by `node Tools/audit/audit-sound.mjs`) plus a curated companion. |

Two standalone illustrated deep-dives (open in a browser):
[audio-storage.html](audio-storage.html) (how audio is stored in the ROM) and
[sprite-compression.html](sprite-compression.html) (the ROM's sprite/RLE compression).

## Quick mental model

The MSX2 runs Metal Gear in **SCREEN 5** (256×212, 16 colors, 4 bits/pixel, 2 px/byte).
Three systems sit on top:

```
Room (8×6 metatile ids)         data/rooms.asm           RenderRoom
  └─ Metatile (4×4 = 16 tiles)  data/metatiles.asm       UnpackMetatiles
       └─ Tile (8×8, 3bpp gfx)  gfx/*.asm                Decode3bppTile
            └─ 3-bit index ─remap→ 4-bit color            ColorsTileset
                 └─ palette ──────→ RGB                    PalMenuWeapon + SetRoomPal
```

1. **Background tiles (bitmap layer).** Stored compactly as 1/2/3 bits per pixel and
   *expanded* to 4bpp VRAM by `Load*Tiles`, via an 8-entry color table mapping the packed
   value to a real palette slot. A few graphics (doors) are raw 4bpp blocks.
2. **Hardware sprites (mode 2).** 16×16 *monochrome* patterns. No color of their own —
   color comes from the sprite attribute table, and multi-color sprites are made by
   overlapping pairs and OR-combining them.
3. **Sound.** Three PSG channels (+1 SFX) driven by per-channel byte-streams at 60 Hz; the
   BGM driver walks them and writes the AY-3-8910 registers each frame.

Colors everywhere come from a **16-entry palette** of MSX2 RGB triplets (3 bits per
channel). The game starts from a base palette and overrides a few entries per room and per
sprite-set.

## Conventions

- Hex is written either Z80-style (`0FFh`, `19h`) as in the source, or as `0x..`.
- Routine names and line numbers refer to `Banks0123.asm` unless noted.
- "Tile" = an 8×8 character; "metatile" = a 4×4 block of tiles; "slot"/"index" = a palette
  color 0–15.

## Why this exists

These docs front-load the context that made each reverse-engineering hunt long, so the next
person (likely future you) doesn't have to re-derive it. A few that cost hours each: the
`PalMenuWeapon` base-palette layering (rooms rendered with the wrong fixed-slot colors
otherwise); the PSG phase-accumulator runaway that swallowed the first second of audio; the
ADSR decay shape; the vibrato direction; the SFX step-format parse order.
