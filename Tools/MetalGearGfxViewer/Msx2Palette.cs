using System.Windows.Media;

namespace MetalGearGfxViewer
{
    /// <summary>
    /// MSX2 Screen 5 palette (16 colors, 3 bits per channel).
    /// </summary>
    public static class Msx2Palette
    {
        /// <summary>
        /// Maps an MSX2 channel level (0-7) to an 8-bit value. These are the exact
        /// values produced by the emulator used to capture the reference shots in
        /// the room_images folder, recovered by sampling those PNGs, so palettes
        /// converted with this table match the game's on-screen colors.
        /// </summary>
        public static readonly byte[] LevelTable = { 6, 32, 72, 104, 144, 176, 216, 247 };

        /// <summary>Build a color from MSX2 RGB levels (each 0-7).</summary>
        public static Color FromLevels(int r, int g, int b)
        {
            return Color.FromRgb(
                LevelTable[r & 7],
                LevelTable[g & 7],
                LevelTable[b & 7]);
        }

        // MSX2 BIOS default Screen 5 palette, expressed in RGB levels (0-7).
        private static readonly (int R, int G, int B)[] DefaultLevels =
        {
            (0, 0, 0), // 0: transparent
            (0, 0, 0), // 1: black
            (1, 6, 1), // 2: medium green
            (3, 7, 3), // 3: light green
            (1, 1, 7), // 4: dark blue
            (2, 3, 7), // 5: light blue
            (5, 1, 1), // 6: dark red
            (2, 6, 7), // 7: cyan
            (7, 1, 1), // 8: medium red
            (7, 4, 4), // 9: light red
            (6, 6, 1), // 10: dark yellow
            (6, 6, 4), // 11: light yellow
            (1, 4, 1), // 12: dark green
            (6, 2, 5), // 13: magenta
            (5, 5, 5), // 14: gray
            (7, 7, 7), // 15: white
        };

        // Metal Gear's own base palette (Banks0123.asm:3935, "DefaultPalette"), set
        // once at screen init. Room/sprite palettes override only a few indices on
        // top of THIS, so it is the correct base for reproducing in-game colors.
        // The ROM stores each entry as two bytes (R<<4|B, then G); decoded to (R,G,B)
        // levels (0-7) below, index order 0-15.
        private static readonly (int R, int G, int B)[] GameBaseLevels =
        {
            (0, 0, 0), (0, 0, 0), (1, 6, 1), (3, 7, 3),
            (1, 1, 7), (2, 3, 7), (5, 1, 1), (2, 6, 7),
            (7, 1, 1), (7, 3, 3), (6, 6, 1), (6, 6, 4),
            (1, 4, 1), (6, 2, 5), (5, 5, 5), (7, 7, 7),
        };

        /// <summary>The MSX2 BIOS default 16-color palette, calibrated to the curve.</summary>
        public static readonly Color[] DefaultPalette = BuildFrom(DefaultLevels);

        /// <summary>Metal Gear's base palette that room/sprite palettes are layered onto.</summary>
        public static readonly Color[] GameBasePalette = BuildFrom(GameBaseLevels);

        private static Color[] BuildFrom((int R, int G, int B)[] levels)
        {
            var palette = new Color[16];
            for (int i = 0; i < 16; i++)
                palette[i] = FromLevels(levels[i].R, levels[i].G, levels[i].B);
            return palette;
        }

        public static Color[] CreateGrayscalePalette()
        {
            var palette = new Color[16];
            for (int i = 0; i < 16; i++)
            {
                byte gray = (byte)(i * 17); // 0, 17, 34, ... 255
                palette[i] = Color.FromRgb(gray, gray, gray);
            }
            return palette;
        }

        public static Color[] CreateGreenPalette()
        {
            var palette = new Color[16];
            for (int i = 0; i < 16; i++)
            {
                byte green = (byte)(i * 17);
                palette[i] = Color.FromRgb(0, green, 0);
            }
            return palette;
        }
    }
}
