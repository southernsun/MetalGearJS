using System.Collections.Generic;
using System.Windows.Media;

namespace MetalGearGfxViewer
{
    /// <summary>
    /// A named 16-color palette the viewer can switch between.
    /// </summary>
    public class PalettePreset
    {
        public string Name { get; }
        public Color[] Colors { get; }

        /// <summary>Short description of where the palette is used (shown in the UI).</summary>
        public string Hint { get; }

        /// <summary>True for the editable "Custom" entry (selecting it keeps the current palette).</summary>
        public bool IsCustom { get; }

        public PalettePreset(string name, Color[] colors, string hint = "", bool isCustom = false)
        {
            Name = name;
            Colors = colors;
            Hint = hint;
            IsCustom = isCustom;
        }

        public override string ToString() => string.IsNullOrEmpty(Hint) ? Name : $"{Name} — {Hint}";
    }

    /// <summary>
    /// The palettes defined in the game source (data/palettes.asm). The game stores
    /// each palette as a list of (index, R&lt;&lt;4|G, B) triplets in 0-7 levels and
    /// applies them as a partial override on top of the BIOS default palette, so we
    /// do the same here: start from <see cref="Msx2Palette.DefaultPalette"/> and patch
    /// the listed indices.
    /// </summary>
    public static class GamePalettes
    {
        // Apply a palette as the game stores it in data/palettes.asm: a list of
        // (index, R&lt;&lt;4|B, G) byte pairs layered onto the game base palette (the game
        // does exactly this — DefaultPalette first, then overrides via SetPalette).
        // 'rb' is the first ROM byte (red in the high nibble, blue in the low nibble);
        // 'g' is the second ROM byte (green).
        private static Color[] Build(params (int idx, int rb, int g)[] overrides)
        {
            var palette = (Color[])Msx2Palette.GameBasePalette.Clone();
            foreach (var (idx, rb, g) in overrides)
                palette[idx & 15] = Msx2Palette.FromLevels(rb >> 4, g, rb & 0x0F);
            return palette;
        }

        public static IReadOnlyList<PalettePreset> BuildAll()
        {
            var list = new List<PalettePreset>
            {
                new PalettePreset("MSX2 Default", (Color[])Msx2Palette.DefaultPalette.Clone(), "BIOS default"),
                new PalettePreset("Game base", (Color[])Msx2Palette.GameBasePalette.Clone(), "untinted base palette"),
                new PalettePreset("Grayscale", Msx2Palette.CreateGrayscalePalette()),
                new PalettePreset("Green (Night Vision)", Msx2Palette.CreateGreenPalette()),

                // ----- Room palettes -----
                // Tile colors come through ColorsTileset (indices 1,3,5,8,9,12); each
                // room palette overrides a few of those on the game base. The hints show
                // which areas use each palette (IdsRoomPal x RoomGfxSetIds).
                new PalettePreset("Room 0", Build((1,0x12,2),(3,0x01,1),(5,0x31,2),(9,0x20,1)), "Building (start)"),
                new PalettePreset("Room 1", Build((1,0x22,2),(3,0x11,1),(5,0x13,2),(9,0x02,1)), "Building"),
                new PalettePreset("Room 2", Build((1,0x22,2),(3,0x11,1),(5,0x31,2),(9,0x00,2)), "Building"),
                new PalettePreset("Room 3", Build((1,0x21,2),(3,0x10,1),(5,0x22,2),(9,0x11,1)), "Building / elevators"),
                new PalettePreset("Room 4", Build((1,0x22,2),(3,0x11,1),(5,0x12,2),(9,0x01,1)), "Lorry / truck rooms"),
                new PalettePreset("Room 5", Build((1,0x53,4),(3,0x42,3),(5,0x41,2),(9,0x20,2)), "Basement / desert"),
                new PalettePreset("Room 6", Build((1,0x22,2),(3,0x11,1),(5,0x31,2),(9,0x20,1)), "Lorry / truck rooms"),
                new PalettePreset("Room 7", Build((1,0x31,2),(3,0x20,1),(5,0x12,2),(9,0x01,1)), "Lorry / truck rooms"),
                new PalettePreset("Room 8", Build((1,0x40,2),(3,0x30,1),(5,0x12,2),(9,0x01,1)), "Building / roof"),
                new PalettePreset("Room 9", Build((1,0x22,2),(3,0x10,1),(5,0x32,3),(9,0x11,1)), "Building / Metal Gear"),
                new PalettePreset("Room 10", Build((1,0x44,4),(3,0x11,1),(5,0x22,2),(9,0x00,0)), "Goggles (infrared gray)"),
                new PalettePreset("Room 11", Build((1,0x00,0),(3,0x00,0),(5,0x00,0),(9,0x00,0),(12,0x00,0)), "Dark room (needs flashlight)"),
                new PalettePreset("Room 12", Build((1,0x10,3),(3,0x30,1),(5,0x12,2),(9,0x01,1)), "Hind D (boss)"),
                new PalettePreset("Room 13", Build((1,0x70,4),(3,0x40,0),(8,0x70,0),(9,0x70,7)), "Special (red)"),
                new PalettePreset("Room 14", Build((1,0x22,2),(3,0x11,1),(5,0x11,2),(9,0x00,1),(12,0x33,3)), "Basement / lorry"),
                new PalettePreset("Room 15", Build((1,0x70,7),(3,0x40,0),(8,0x70,4),(9,0x70,4)), "Special (red)"),

                // ----- Sprite-set palettes (sprites use indices 2,4,11,13) -----
                new PalettePreset("Sprite set 0", Build((2,0x27,2),(11,0x22,2),(13,0x55,5))),
                new PalettePreset("Sprite set 2", Build((4,0x50,0),(11,0x50,0),(2,0x22,2),(13,0x42,3))),
                new PalettePreset("Sprite set 3", Build((2,0x21,1),(13,0x53,4))),
                new PalettePreset("Sprite set 4", Build((2,0x40,0),(13,0x70,0))),
                new PalettePreset("Sprite set 5", Build((2,0x30,2),(13,0x53,4))),
                new PalettePreset("Sprite set 6", Build((13,0x73,4))),
                new PalettePreset("Sprite set 7", Build((2,0x21,2),(13,0x53,4),(11,0x55,5))),
                new PalettePreset("Sprite set 8", Build((13,0x53,4),(11,0x41,0))),
                new PalettePreset("Sprite set 9", Build((2,0x13,2),(13,0x42,3))),
                new PalettePreset("Sprite set 10", Build((2,0x12,1),(13,0x42,3))),
                new PalettePreset("Sprite set 11", Build((2,0x41,2),(13,0x53,4))),
                new PalettePreset("Sprite set 13", Build((11,0x12,2))),
                new PalettePreset("Sprite set 14", Build((11,0x12,1))),
                new PalettePreset("Sprite set 15", Build((2,0x02,1),(11,0x21,3),(13,0x53,4))),
                new PalettePreset("Sprite set 16", Build((2,0x77,7),(13,0x53,4))),
                new PalettePreset("Sprite set 17", Build((2,0x20,2),(13,0x53,4))),
                new PalettePreset("Sprite set 18", Build((2,0x12,2),(13,0x53,4))),
                new PalettePreset("Sprite set 19", Build((2,0x44,4),(13,0x22,2))),
                new PalettePreset("Sprite set 20", Build((4,0x50,0),(11,0x50,0),(2,0x22,2),(13,0x53,4))),
                new PalettePreset("Sprite set 24", Build((2,0x55,5),(13,0x22,2))),
                new PalettePreset("Sprite set 29", Build((2,0x20,0),(13,0x42,3))),
                new PalettePreset("Sprite set 30", Build((2,0x03,0),(13,0x42,3))),
                new PalettePreset("Sprite set 31", Build((2,0x00,2),(13,0x42,3))),

                // ----- UI palettes -----
                new PalettePreset("Radio screen", Build((1,0x10,2),(2,0x42,3),(3,0x55,7),(4,0x31,2),(5,0x40,0),(9,0x23,2),(11,0x20,1),(12,0x33,3),(13,0x05,2),(14,0x77,7),(15,0x00,0))),
                new PalettePreset("Weapon menu", Build((6,0x70,7),(8,0x70,0),(12,0x33,3),(14,0x77,7),(15,0x00,0))),

                // Editable custom palette (always last).
                new PalettePreset("Custom", (Color[])Msx2Palette.DefaultPalette.Clone(), isCustom: true),
            };
            return list;
        }
    }
}
