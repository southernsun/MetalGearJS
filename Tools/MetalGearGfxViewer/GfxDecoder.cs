using System;
using System.Windows.Media;

namespace MetalGearGfxViewer
{
    /// <summary>
    /// Decodes MSX2 graphics data in 1bpp, 2bpp, and 3bpp formats
    /// </summary>
    public class GfxDecoder
    {
        private readonly Color[] _palette;

        public GfxDecoder(Color[] palette)
        {
            _palette = palette ?? Msx2Palette.DefaultPalette;
        }

        /// <summary>
        /// Decode 1bpp graphics (8 bytes per 8x8 tile)
        /// Each bit represents 1 pixel: 0 = color 0, 1 = specified color
        /// </summary>
        public byte[] Decode1bpp(byte[] data, int colorIndex = 15)
        {
            // Each tile is 8 bytes (8 lines x 8 pixels, 1 bit per pixel)
            int numTiles = data.Length / 8;
            int totalPixels = numTiles * 64; // 8x8 pixels per tile

            // Output: 4 bytes per pixel (BGRA)
            byte[] output = new byte[totalPixels * 4];

            Color color0 = _palette[0];
            Color color1 = _palette[colorIndex % 16];

            int dataIdx = 0;
            int outIdx = 0;

            for (int tile = 0; tile < numTiles; tile++)
            {
                for (int line = 0; line < 8; line++)
                {
                    byte rowData = data[dataIdx++];

                    for (int pixel = 0; pixel < 8; pixel++)
                    {
                        // MSB first
                        bool isSet = (rowData & (0x80 >> pixel)) != 0;
                        Color c = isSet ? color1 : color0;

                        output[outIdx++] = c.B;
                        output[outIdx++] = c.G;
                        output[outIdx++] = c.R;
                        output[outIdx++] = c.A;
                    }
                }
            }

            return output;
        }

        /// <summary>
        /// Decode 2bpp graphics (16 bytes per 8x8 tile)
        /// Each pair of bits represents a color index (0-3)
        ///
        /// Plane order matches the game's Decode2bppRow routine (Banks0123.asm):
        /// for each line the first byte holds the low plane and the second byte
        /// the high plane, i.e. colorIndex = (plane2 bit &lt;&lt; 1) | plane1 bit.
        /// </summary>
        public byte[] Decode2bpp(byte[] data, byte[]? colorLookup = null)
        {
            // Default color lookup maps each index straight to that palette entry.
            // The game uses a per-tileset lookup table (BufferColor); we don't have
            // it here, so we fall back to the identity mapping.
            colorLookup ??= new byte[] { 0, 1, 2, 3 };

            // Each tile is 16 bytes (8 lines x 2 bytes per line)
            int numTiles = data.Length / 16;
            int totalPixels = numTiles * 64;

            byte[] output = new byte[totalPixels * 4];

            int dataIdx = 0;
            int outIdx = 0;

            for (int tile = 0; tile < numTiles; tile++)
            {
                for (int line = 0; line < 8; line++)
                {
                    // Read 2 bytes for this line (low plane, then high plane)
                    byte plane1 = data[dataIdx++];
                    byte plane2 = data[dataIdx++];

                    for (int pixel = 0; pixel < 8; pixel++)
                    {
                        // High bit from plane2, low bit from plane1 (MSB first)
                        int bit1 = (plane1 >> (7 - pixel)) & 1;
                        int bit2 = (plane2 >> (7 - pixel)) & 1;
                        int colorIdx = (bit2 << 1) | bit1;

                        // Look up actual palette index
                        int paletteIdx = colorLookup[colorIdx % colorLookup.Length] % 16;
                        Color c = _palette[paletteIdx];

                        output[outIdx++] = c.B;
                        output[outIdx++] = c.G;
                        output[outIdx++] = c.R;
                        output[outIdx++] = c.A;
                    }
                }
            }

            return output;
        }

        /// <summary>
        /// Decode 3bpp graphics (24 bytes per 8x8 tile)
        /// Each triplet of bits represents a color index (0-7)
        /// </summary>
        public byte[] Decode3bpp(byte[] data, byte[]? colorLookup = null)
        {
            // Default color lookup if not provided (maps to first 8 colors)
            colorLookup ??= new byte[] { 0, 1, 2, 3, 4, 5, 6, 7 };

            // Each tile is 24 bytes (8 lines x 3 bytes per line)
            int numTiles = data.Length / 24;
            int totalPixels = numTiles * 64;

            byte[] output = new byte[totalPixels * 4];

            int dataIdx = 0;
            int outIdx = 0;

            for (int tile = 0; tile < numTiles; tile++)
            {
                for (int line = 0; line < 8; line++)
                {
                    // Read 3 bytes for this line
                    byte byte1 = data[dataIdx++];
                    byte byte2 = data[dataIdx++];
                    byte byte3 = data[dataIdx++];

                    // Decode 8 pixels from the 3 bytes (MSB first), matching the
                    // game's Decode3bpp routine (Banks0123.asm): the registers are
                    // loaded as E=byte1, D=byte2, C=byte3 and the color index is
                    // assembled as (C bit << 2) | (D bit << 1) | (E bit).
                    for (int pixel = 0; pixel < 8; pixel++)
                    {
                        int bit1 = (byte3 >> (7 - pixel)) & 1; // plane C (byte3) -> bit 2
                        int bit2 = (byte2 >> (7 - pixel)) & 1; // plane D (byte2) -> bit 1
                        int bit3 = (byte1 >> (7 - pixel)) & 1; // plane E (byte1) -> bit 0

                        int colorIdx = (bit1 << 2) | (bit2 << 1) | bit3;

                        // Look up actual palette index
                        int paletteIdx = colorLookup[colorIdx % colorLookup.Length] % 16;
                        Color c = _palette[paletteIdx];

                        output[outIdx++] = c.B;
                        output[outIdx++] = c.G;
                        output[outIdx++] = c.R;
                        output[outIdx++] = c.A;
                    }
                }
            }

            return output;
        }

        /// <summary>
        /// Decode raw 4bpp data (MSX2 VRAM format, 2 pixels per byte)
        /// </summary>
        public byte[] Decode4bpp(byte[] data)
        {
            int totalPixels = data.Length * 2;
            byte[] output = new byte[totalPixels * 4];

            int outIdx = 0;

            foreach (byte b in data)
            {
                // High nibble = first pixel, low nibble = second pixel
                int color1 = (b >> 4) & 0x0F;
                int color2 = b & 0x0F;

                Color c1 = _palette[color1];
                output[outIdx++] = c1.B;
                output[outIdx++] = c1.G;
                output[outIdx++] = c1.R;
                output[outIdx++] = c1.A;

                Color c2 = _palette[color2];
                output[outIdx++] = c2.B;
                output[outIdx++] = c2.G;
                output[outIdx++] = c2.R;
                output[outIdx++] = c2.A;
            }

            return output;
        }
    }
}
