namespace MetalGear.RoomViewer.Render;

/// <summary>
/// One 8x8 character. Each pixel holds a 4-bit colour index (0..15) into the
/// active <see cref="Palette"/>. This mirrors a SCREEN 5 tile in VRAM after the
/// 3bpp graphics have been decoded (Decode3bppTile in Banks0123.asm).
/// </summary>
public sealed class Tile
{
    public const int Size = 8;

    // [y * 8 + x] = colour index 0..15
    public readonly byte[] Pixels = new byte[Size * Size];

    public byte Get(int x, int y) => Pixels[y * Size + x];

    public bool IsEmpty
    {
        get
        {
            foreach (var p in Pixels)
                if (p != 0) return false;
            return true;
        }
    }

    /// <summary>
    /// Decode one 3bpp source tile (8 lines x 3 bytes = 24 bytes) into 4-bit
    /// colour indices, remapping each 3-bit value through <paramref name="colorMap"/>
    /// (the ColorsTileset table). Faithful port of Decode3bpp/Decode3bppTile.
    /// </summary>
    public static Tile Decode3bpp(ReadOnlySpan<byte> gfx, int offset, byte[] colorMap, bool flip = false)
    {
        var t = new Tile();
        for (int line = 0; line < 8; line++)
        {
            // The three bit-planes for this line. The source bytes arrive
            // low-plane first (e, d, c in Decode3bpp); c carries the high bit.
            byte e = gfx[offset + line * 3 + 0];
            byte d = gfx[offset + line * 3 + 1];
            byte c = gfx[offset + line * 3 + 2];

            for (int px = 0; px < 8; px++)
            {
                int bit = 7 - px; // pixel 0 is the most-significant bit
                int idx = (((c >> bit) & 1) << 2)
                        | (((d >> bit) & 1) << 1)
                        | ((e >> bit) & 1);
                byte color = colorMap[idx & 0x07];
                int dstX = flip ? 7 - px : px;
                t.Pixels[line * 8 + dstX] = color;
            }
        }
        return t;
    }
}
