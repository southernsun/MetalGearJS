# Metal Gear (MSX2) — Room Viewer

A C# / WinForms application that reconstructs the rooms of the MSX2 *Metal Gear*
exactly the way the original Z80 code does, reading the real data tables straight
out of the disassembly. Output is pixel-accurate to the disassembly's `room_images/`
screenshots.

![room 0](https://raw.githubusercontent.com/southernsun/MetalGear/master/room_images/MGEAR1_0000.png)

## Running

```
dotnet run --project Tools/RoomViewer
```

The viewer reads the real `.asm` sources (`data/rooms.asm` and friends), so the separate
disassembly repo must be present: clone [southernsun/MetalGear](https://github.com/southernsun/MetalGear)
as a sibling at `../MetalGear` (or set the `MG_ROM_DIR` env var). The viewer resolves it
automatically from there; you can also pass the root explicitly:
`dotnet run --project Tools/RoomViewer -- <disassembly-root>`. Exported assets are written
into **this** repo's `web/assets/`.

### Controls

| Key            | Action                                  |
|----------------|-----------------------------------------|
| `←` / `→`      | previous / next defined room            |
| `PgUp`/`PgDn`  | jump ±10 rooms                          |
| `Home`/`End`   | first / last room                       |
| `G`            | toggle the 32×32 metatile grid          |
| `Tab`          | open the metatile **atlas** for the set |
| `S`            | save the current room as a PNG          |
| `Esc`          | quit                                    |

### Headless export

```
dotnet run --project Tools/RoomViewer -- --render 0 1 5 out_dir
```

renders the listed rooms to `out_dir/room_NNN.png` with no window.

This tool is also the main asset pipeline for the [`web/`](../../web/) browser port. Each of
these flags writes a slice of `web/assets/` (most accept an optional `<outDir>`):

| Flag | Writes |
|------|--------|
| `--export-web [start] [count] [outDir] [--extra N,N…]` | the room PNGs + collision/door/name/HUD/font/radio JSON for the room range (plus any `--extra` rooms) |
| `--export-doors` | `doors.json` / `door-types.json` / `door-gfx.json` + the door & breakable-wall PNGs |
| `--export-hud-icons` | the HUD icon sheet + `call-sign.png` |
| `--export-names` | decoded weapon/item name strings |
| `--export-radio` | radio/transceiver screen assets (bg, portrait + talk frames, freq digits, LEDs) |
| `--export-title` | the boot/title-sequence assets |
| `--export-pitfall` / `--export-hindd` / `--export-ending` | the open-pitfall image / Hind D body+wreck blocks / ending-explosion atlas |
| `--doors-audit` | a console door-data audit (no files) |

See [`docs/SESSION-STATE.md`](../../docs/SESSION-STATE.md) for the exact `--export-web` room
list used to regenerate the connected world.

## How it works (the original pipeline, in C#)

The renderer mirrors the ROM's drawing routines. Each stage maps to a routine in
`Banks0123.asm`:

```
Room (8×6 metatile ids)          data/rooms.asm            RenderRoom
  └─ Metatile (4×4 = 16 tiles)   data/metatiles.asm        UnpackMetatiles
       └─ Tile (8×8, 3bpp gfx)   gfx/*.asm                 Decode3bppTile
            └─ 3-bit index ──remap──> 4-bit colour          ColorsTileset
                 └─ palette ──────────> RGB                  SetPalette / SetRoomPal
```

Key fidelity details, all recovered from the source:

- **Tiles are 3 bits-per-pixel.** `Tile.Decode3bpp` is a line-by-line port of
  `Decode3bpp`: three plane-bytes per row, MSB-first, giving a 0–7 index.
- **The 3-bit index is remapped** through `ColorsTileset = {1,3,5,8,9,C,E,F}`
  to a 4-bit SCREEN-5 colour (`SetTilesetColors`).
- **The 256-tile table is assembled per room** (`TileSetBuilder`) by replaying
  the load order in `LoadRoomTiles`: power-switch tiles, wood crates (and their
  horizontally-flipped copies), then the room's main tileset blocks — including
  the flip and collision-marker flags.
- **Palette.** Each room only re-tweaks slots 1, 3, 5, 9 (`SetRoomPal`); the
  fixed slots (0, 6, 8, 12=gray, 14=white, 15=black) come from the persistent
  in-game base palette `PalMenuWeapon`. This split was verified pixel-exact
  against the disassembly's `room_images/` screenshots (see `Palette` /
  `RoomRenderer.BuildScene`).

Which metatile set, graphics set and palette a room uses are nibble-per-room
tables (`MetaTileSetIDs`, `RoomGfxSetIds`, `IdsRoomPal`) read exactly like
`GetNibbleRoom` (even room → high nibble, odd → low).

## Drawing routines / "sprites"

In this engine the recognisable elements — wood crates/barrels, walls, the
trucks, etc. — *are* metatiles. `Render/SpriteRoutines.cs` exposes them as
stand-alone draw calls:

- `DrawMetatile(scene, id)` — draw any metatile from a room's set to a 32×32 bitmap.
- `DrawNamed(element)` — draw a catalogued element (e.g. `Crate`) using a room
  that shows it, so the right tileset + palette apply.
- `DrawAtlas(scene)` — render every metatile in a set into a labelled grid so you
  can identify elements and add them to `SpriteRoutines.Catalog` (press `Tab` in
  the viewer).

## Not rendered

Only the static room tilemap is drawn. Moving actors (enemies, the player),
items and doors are sprites/overlays drawn by separate routines, so they don't
appear here — which is why a few small marks visible in some of the disassembly's
`room_images/` screenshots are absent.

## Project layout

```
Asm/AsmParser.cs        reads db/dw operands following labels in the .asm sources
Game/GameData.cs        loads every table the renderer needs, by label
Game/TileSetBuilder.cs  assembles a room's 256-tile table (LoadRoomTiles)
Render/Tile.cs          3bpp tile decode (Decode3bppTile)
Render/Palette.cs       MSX2 16-colour palette (default + overrides)
Render/RoomRenderer.cs  DrawTile / DrawMetatile / DrawRoom
Render/SpriteRoutines.cs named element drawing + metatile atlas
UI/ViewerForm.cs        the interactive browser
```
