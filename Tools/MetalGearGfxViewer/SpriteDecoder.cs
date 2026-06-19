using System.Collections.Generic;

namespace MetalGearGfxViewer
{
    /// <summary>
    /// Decompresses Metal Gear's run-length-encoded graphics streams.
    ///
    /// This is the format consumed by the game's <c>SetSnakeSprPatt</c> (sprite
    /// patterns) and <c>UnpackGfx</c> (background tiles) routines in Banks0123.asm.
    /// Reading the control byte B:
    ///   - (B and 7Fh) == 0  -> end of this segment (B is 00h or 80h)
    ///   - B &lt; 80h          -> run: the next byte is repeated B times
    ///   - B &gt;= 80h         -> literal: copy the next (B and 7Fh) bytes verbatim
    ///
    /// Sprite files concatenate many independent segments (one per animation
    /// frame), each ending in a 00h/80h terminator, so <see cref="DecompressAll"/>
    /// keeps decoding past terminators until the input is exhausted.
    ///
    /// Note: the real <c>UnpackGfx</c> treats 80h as a "new VRAM address" marker
    /// (followed by a 2-byte address) rather than a hard stop. The viewer has no
    /// VRAM layout to honour, so it just treats 80h as a segment boundary; this is
    /// exact for sprite data and visually contiguous for background data.
    /// </summary>
    public static class SpriteDecoder
    {
        /// <summary>
        /// Decompress a single RLE segment starting at <paramref name="startOffset"/>.
        /// Decoding stops at the first 00h/80h terminator (or end of input).
        /// </summary>
        /// <param name="consumed">Number of input bytes read, including the terminator.</param>
        public static byte[] DecompressRLE(byte[] data, int startOffset, out int consumed)
        {
            var output = new List<byte>();
            int i = startOffset;

            while (i < data.Length)
            {
                byte controlByte = data[i];
                int count = controlByte & 0x7F;

                // 00h or 80h: end of segment.
                if (count == 0)
                {
                    i++;
                    break;
                }

                i++;

                if (controlByte < 0x80)
                {
                    // Run: repeat the next byte 'count' times.
                    if (i >= data.Length)
                        break;

                    byte value = data[i++];
                    for (int j = 0; j < count; j++)
                        output.Add(value);
                }
                else
                {
                    // Literal: copy the next 'count' bytes.
                    for (int j = 0; j < count && i < data.Length; j++)
                        output.Add(data[i++]);
                }
            }

            consumed = i - startOffset;
            return output.ToArray();
        }

        /// <summary>
        /// Convenience overload that decodes a single segment from offset 0.
        /// </summary>
        public static byte[] DecompressRLE(byte[] data, int startOffset = 0)
            => DecompressRLE(data, startOffset, out _);

        /// <summary>
        /// Decode every concatenated RLE segment in the data and return the
        /// combined output, so an entire sprite sheet is visible at once.
        /// </summary>
        public static byte[] DecompressAll(byte[] data)
        {
            var output = new List<byte>();
            int offset = 0;

            while (offset < data.Length)
            {
                byte[] segment = DecompressRLE(data, offset, out int consumed);

                // Guard against a control byte that consumes nothing (e.g. trailing
                // padding), which would otherwise spin forever.
                if (consumed == 0)
                    break;

                output.AddRange(segment);
                offset += consumed;
            }

            return output.ToArray();
        }
    }
}
