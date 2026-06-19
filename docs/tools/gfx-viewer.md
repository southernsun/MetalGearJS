# The Metal Gear GFX Viewer

A Windows (.NET 8, WPF + WinForms interop) tool in [`Tools/MetalGearGfxViewer/`](../../Tools/MetalGearGfxViewer/)
that renders the graphics straight from the `gfx/*.asm` source files, reproducing how the
game builds them.

> **Note:** `.asm` / `file:line` citations and `room_images/` references in this doc refer to the separate MSX disassembly repo ([southernsun/MetalGear](https://github.com/southernsun/MetalGear)), expected as a sibling clone at `../MetalGear`.

## Build & run

Requires the [.NET SDK](https://dotnet.microsoft.com/) (8.0+):

```
dotnet run --project Tools/MetalGearGfxViewer
```

On startup it auto-locates the `gfx` folder in parent directories; the *Open GFX Folder*
button picks any folder. The room browser and reference viewer also look for sibling
`data/` and `examples/` folders.

## Workflow

1. Select a **file** (left, top list) → its individual graphics (labels) appear in the
   **Graphics** list below it.
2. Select a **graphic** → it renders. If recognised, the viewer **auto-configures** bit
   depth, layout, color table and compression, locks those controls, and shows `AUTO: …`
   in the status bar. Unrecognised data falls back to **MANUAL** mode with the controls
   enabled.
3. Optionally change the **palette** (always editable — the same graphic appears under
   different room/sprite palettes), pick a **Room** to load its tileset + palette, or open
   the **Reference Sheets**.
4. For sprites, choose the foreground color, and toggle **Composite (multicolor)** to
   OR-combine pairs (see [sprites](../rom/sprites.md)).

## Source files

| File | Responsibility |
|---|---|
| `MetalGearGfxViewer.csproj` | net8.0-windows, `UseWPF` + `UseWindowsForms`, `AllowUnsafeBlocks` (fast bitmap writes) |
| `App.xaml` / `App.xaml.cs` | WPF application entry |
| `MainWindow.xaml` / `.cs` | UI layout and the whole render pipeline |
| `AsmGfxParser.cs` | parse `db` bytes; `ParseLabeledSegments` splits a file into labeled graphics; `DetectBitDepth` heuristic for manual mode |
| `GfxDecoder.cs` | `Decode1bpp` / `Decode2bpp` / `Decode3bpp` / `Decode4bpp` → BGRA pixels |
| `SpriteDecoder.cs` | `DecompressRLE` (one segment) and `DecompressAll` (all concatenated segments) |
| `Msx2Palette.cs` | `LevelTable` (calibrated 0–7 → byte), `FromLevels`, BIOS default and game base palettes |
| `GamePalettes.cs` | `PalettePreset` + every room / sprite-set / UI palette, layered on the game base |
| `GameColorSets.cs` | the `BufferColor` tile lookups and the sprite foreground-color choices |
| `GfxCatalog.cs` | `GfxSpec` + the per-label/per-file auto-detection catalogue |
| `RoomTable.cs` | parses `RoomGfxSetIds` + `IdsRoomPal` → room → tileset/palette |
| `ReferenceWindow.cs` | separate window showing the `examples/` reference sheets (Ctrl+wheel zoom) |

## The render pipeline (`MainWindow.RenderGraphics`)

1. Pick decode settings from the active `GfxSpec` (auto) or the toolbar controls (manual):
   sprite mode, compression, bit depth, color lookup, 1bpp foreground.
2. If compressed, decompress (`DecompressAll` for sprites, `DecompressRLE` otherwise).
3. If sprite + composite, hand off to `RenderCompositeSprites` and return.
4. Decode to BGRA pixels with the chosen bit depth and color lookup.
5. Lay out: a plain 8×8 grid, or — in sprite mode — group every 4 tiles into one 16×16
   sprite (quadrants TL, BL, TR, BR), widening the sheet automatically.
6. Blit into a `WriteableBitmap`, apply zoom, update the status bar.

## The catalogue (`GfxCatalog.cs`)

`GfxSpec` records how a graphic is built: `Bpp`, `Compressed`, `SpriteMode`, `ColorLookup`
(the `BufferColor` table), `Foreground1bpp`, `TilesPerRow`, default `Palette`, and a
`Note`. `Lookup(label, file)` checks an exact-label table first, then a per-file default.
It was filled in from the loader call sites (see [graphics-formats](../rom/graphics-formats.md)).
Summary:

| Source | bpp | Color table / fg | Notes |
|---|---|---|---|
| `building/…/ending`, `crate`, `powerswitch`, `radio` | 3 | `ColorsTileset` | room tilesets |
| `items`, `alerticon` | 3 | `ColorsItems` | |
| `camera` | 2 | `ColorsCameras` | |
| `pitfall` | 3 | `ColorsPitfall` | |
| `snakeportrait` | 3 | `ColSnakePic` | |
| `metalgearlogo` | 3 | `MGLogoColors` | |
| `gfxFont` / `gfxSymbChars` / `gfxFreqDigits` | 1 | fg 14 / 6 / 8 | font.asm mixes formats |
| `gfxCALL` | 2 | `colorsCALL` | |
| `konamilogo` | 1 | fg 13 | |
| `doors` | 4 | raw block | `GfxDoorLeft/Right` = 1 tile wide |
| `sprites` | 1 | sprite mode | RLE, 16×16 |
| `targetspr` | 4 | raw | RLE (UnpackGfx) |

## Notes / limitations

- The auto bit-depth/layout/color-table are exact (taken from the loaders). The
  **palette** is left selectable because one graphic is reused across rooms with different
  palettes.
- The viewer's game base palette is currently `DefaultPalette`; it does not apply the
  persistent `PalMenuWeapon` overlay that the live ROM uses, so fixed-slot colors are
  approximate. See [palettes](../rom/palettes.md#key-finding-the-persistent-in-game-base-is-palmenuweapon-not-defaultpalette).
- Sprite **color** is a per-instance attribute, not in the pattern — see
  [sprites](../rom/sprites.md). Composite mode reproduces the CC pairing; per-actor
  automatic colors are not yet wired.
- The toolbar can overflow on a narrow window; widen it (or use the `»` overflow button)
  to reach the sprite/composite controls.
