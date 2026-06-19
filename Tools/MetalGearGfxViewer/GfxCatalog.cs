using System;
using System.Collections.Generic;

namespace MetalGearGfxViewer
{
    /// <summary>
    /// How the game builds one graphic: bit depth, compression, color mapping and
    /// layout. Derived from the loader routines in Banks0123.asm (Load1bppTile /
    /// Load2bppTile / Load3bppTiles / LoadTilesGfxBlk / SetSnakeSprPatt) and the
    /// color tables / sprite system. When a spec is known the viewer configures
    /// itself and locks the bit-depth / tile-width / color-set / sprite controls.
    /// </summary>
    public class GfxSpec
    {
        public int Bpp;                 // 1, 2, 3 or 4
        public bool Compressed;         // RLE stream (sprites, SprTarget)
        public bool SpriteMode;         // 16x16 hardware-sprite layout
        public byte[]? ColorLookup;     // index -> palette entry, for 2/3/4 bpp
        public byte Foreground1bpp;     // set-pixel color for 1bpp graphics
        public int TilesPerRow;         // layout width, in 8x8 tiles
        public string Palette;          // default palette preset name
        public string Note;             // shown in the UI

        public GfxSpec(int bpp, byte[]? colorLookup = null, byte foreground1bpp = 15,
            int tilesPerRow = 16, bool compressed = false, bool spriteMode = false,
            string palette = "MSX2 Default", string note = "")
        {
            Bpp = bpp;
            ColorLookup = colorLookup;
            Foreground1bpp = foreground1bpp;
            TilesPerRow = tilesPerRow;
            Compressed = compressed;
            SpriteMode = spriteMode;
            Palette = palette;
            Note = note;
        }
    }

    /// <summary>
    /// Maps graphics labels (and whole files) to the way the game decodes them.
    /// Lookup order: exact label, then the source file's default.
    /// </summary>
    public static class GfxCatalog
    {
        // BufferColor lookup tables (Banks0123.asm:2998-3002) and others.
        private static readonly byte[] ColorsTileset = { 1, 3, 5, 8, 9, 12, 14, 15 };
        private static readonly byte[] ColorsItems = { 0, 6, 7, 8, 10, 12, 14, 15 };
        private static readonly byte[] ColorsCameras = { 0, 2, 13, 15 };
        private static readonly byte[] ColorsPitfall = { 0, 5, 9, 15 };
        private static readonly byte[] ColSnakePic = { 2, 4, 8, 11, 13, 12, 14, 15 };
        private static readonly byte[] MGLogoColors = { 0, 2, 3, 4, 5, 9, 10, 14 };
        private static readonly byte[] ColorsCall = { 6, 8, 14, 15 };

        // Per-label specs (exceptions and graphics whose file mixes formats).
        private static readonly Dictionary<string, GfxSpec> ByLabel = new(StringComparer.OrdinalIgnoreCase)
        {
            // font.asm mixes formats (Load1bppTile / Load2bppTile, loadfont.asm).
            ["gfxFont"] = new GfxSpec(1, foreground1bpp: 14, note: "Font (1bpp, white)"),
            ["gfxSymbChars"] = new GfxSpec(1, foreground1bpp: 6, note: "Symbol chars (1bpp, yellow)"),
            ["gfxFreqDigits"] = new GfxSpec(1, foreground1bpp: 8, note: "Frequency digits (1bpp, red)"),
            ["gfxCALL"] = new GfxSpec(2, ColorsCall, note: "Incoming call sign (2bpp)"),

            // doors.asm: 4bpp blocks; left/right are 1 tile wide (LoadGfxDoors, bc=104h).
            ["GfxDoorLeft"] = new GfxSpec(4, tilesPerRow: 1, palette: "Room 0", note: "Door left (4bpp block, 1x4)"),
            ["GfxDoorRight"] = new GfxSpec(4, tilesPerRow: 1, palette: "Room 0", note: "Door right (4bpp block, 1x4)"),
        };

        // Per-file default specs (filename without path, lower-case).
        private static readonly Dictionary<string, GfxSpec> ByFile = new(StringComparer.OrdinalIgnoreCase)
        {
            // Room tilesets: 3bpp, ColorsTileset (Load3bppTiles via LoadTileset).
            ["building.asm"] = new GfxSpec(3, ColorsTileset, palette: "Room 0", note: "Building tileset (3bpp)"),
            ["building2.asm"] = new GfxSpec(3, ColorsTileset, palette: "Room 0", note: "Building tileset 2 (3bpp)"),
            ["basementdesert.asm"] = new GfxSpec(3, ColorsTileset, palette: "Room 5", note: "Basement/desert tileset (3bpp)"),
            ["basementdesert2.asm"] = new GfxSpec(3, ColorsTileset, palette: "Room 5", note: "Basement/desert tileset 2 (3bpp)"),
            ["roof.asm"] = new GfxSpec(3, ColorsTileset, palette: "Room 8", note: "Roof tileset (3bpp)"),
            ["elevator.asm"] = new GfxSpec(3, ColorsTileset, palette: "Room 3", note: "Elevator tileset (3bpp)"),
            ["lorry.asm"] = new GfxSpec(3, ColorsTileset, palette: "Room 4", note: "Lorry-room tileset (3bpp)"),
            ["hindd.asm"] = new GfxSpec(3, ColorsTileset, palette: "Room 12", note: "Hind D tileset (3bpp)"),
            ["metalgear.asm"] = new GfxSpec(3, ColorsTileset, palette: "Room 9", note: "Metal Gear tileset (3bpp)"),
            ["ending.asm"] = new GfxSpec(3, ColorsTileset, palette: "Room 0", note: "Ending tileset (3bpp)"),
            ["crate.asm"] = new GfxSpec(3, ColorsTileset, palette: "Room 0", note: "Crates (3bpp)"),
            ["powerswitch.asm"] = new GfxSpec(3, ColorsTileset, palette: "Room 0", note: "Power switch / panel (3bpp)"),
            ["radio.asm"] = new GfxSpec(3, ColorsTileset, palette: "Room 0", note: "Radio tiles (3bpp)"),

            // Items / alert icon: 3bpp, ColorsItems.
            ["items.asm"] = new GfxSpec(3, ColorsItems, palette: "Room 0", note: "Items & weapons (3bpp)"),
            ["alerticon.asm"] = new GfxSpec(3, ColorsItems, palette: "Room 0", note: "Alert icon (3bpp)"),

            // Cameras: 2bpp, ColorsCameras.
            ["camera.asm"] = new GfxSpec(2, ColorsCameras, palette: "Room 0", note: "Surveillance camera (2bpp)"),

            // Pitfall: 3bpp, ColorsPitfall.
            ["pitfall.asm"] = new GfxSpec(3, ColorsPitfall, palette: "Room 0", note: "Pitfall tiles (3bpp)"),

            // Snake radio portrait: 3bpp, ColSnakePic.
            ["snakeportrait.asm"] = new GfxSpec(3, ColSnakePic, palette: "Radio screen", note: "Snake portrait (3bpp)"),

            // Logos.
            ["metalgearlogo.asm"] = new GfxSpec(3, MGLogoColors, palette: "MSX2 Default", note: "Metal Gear logo (3bpp)"),
            ["konamilogo.asm"] = new GfxSpec(1, foreground1bpp: 13, note: "Konami logo (1bpp)"),

            // Doors: 4bpp raw Screen 5 blocks, 4 tiles wide (LoadTilesGfxBlk).
            ["doors.asm"] = new GfxSpec(4, tilesPerRow: 4, palette: "Room 0", note: "Doors (4bpp block)"),

            // Fonts default (when a font label isn't matched above).
            ["font.asm"] = new GfxSpec(1, foreground1bpp: 14, note: "Font (1bpp)"),

            // Sprites: RLE-compressed 1bpp 16x16 hardware sprites (SetSnakeSprPatt).
            ["sprites.asm"] = new GfxSpec(1, compressed: true, spriteMode: true, foreground1bpp: 15,
                tilesPerRow: 32, palette: "Sprite set 2", note: "Hardware sprites (RLE, 1bpp 16x16)"),

            // Binocular target: RLE-compressed raw 4bpp (UnpackGfx).
            ["targetspr.asm"] = new GfxSpec(4, compressed: true, palette: "Room 0", note: "Binocular target (RLE, 4bpp)"),
        };

        /// <summary>Find the spec for a label in a given file, or null if unknown.</summary>
        public static GfxSpec? Lookup(string label, string fileName)
        {
            if (label != null && ByLabel.TryGetValue(label, out var byLabel))
                return byLabel;

            var name = System.IO.Path.GetFileName(fileName);
            if (name != null && ByFile.TryGetValue(name, out var byFile))
                return byFile;

            return null;
        }
    }
}
