# Metal Gear — GFX Viewer

A WPF app (Windows) that renders Metal Gear's graphics **straight from the `gfx/*.asm`
source files**, so you can see what the `db` byte tables actually look like without
assembling and running the game. It decodes each graphic with the game's own loaders
(bit depth, tile layout, colour table and RLE compression detected automatically),
composites multi-colour sprites the way the hardware does, and can recolour any graphic
with every room / sprite-set palette defined in `data/palettes.asm`.

## Run

```
dotnet run --project Tools/MetalGearGfxViewer
```

On startup it auto-loads the disassembly's `gfx/` folder (and the sibling `data/` tables).
Those `.asm` sources live in the **separate disassembly repo** — clone
[southernsun/MetalGear](https://github.com/southernsun/MetalGear) as a sibling at
`../MetalGear` (or set the `MG_ROM_DIR` env var). If it can't be found, use the
**Open GFX Folder** button to point at any `gfx/` folder manually. The **Reference Sheets**
button opens the rips in this repo's [`examples/`](../../examples/).

For the full description — the graphics formats, the palette system, sprite colouring, the
room tables, and the viewer's architecture — see
[`docs/tools/gfx-viewer.md`](../../docs/tools/gfx-viewer.md) and the
[`docs/rom/`](../../docs/rom/) internals.
