using System.Drawing;

namespace MetalGear.RoomViewer.Render;

/// <summary>
/// A 16-entry MSX2 palette. Each colour is 3 bits per channel (0..7).
/// The VDP stores a colour as two bytes: byte0 = (Red &lt;&lt; 4) | Blue, byte1 = Green
/// (see SetPaletteColor / DefaultPalette in Banks0123.asm).
/// </summary>
public sealed class Palette
{
    private readonly Color[] _colors = new Color[16];

    public Color this[int index] => _colors[index & 0x0F];

    /// <summary>The game's power-on palette (Banks0123.asm: DefaultPalette).</summary>
    public static readonly byte[] DefaultPalette =
    {
        0x00, 0x00, // 0
        0x00, 0x00, // 1
        0x11, 0x06, // 2
        0x33, 0x07, // 3
        0x17, 0x01, // 4
        0x27, 0x03, // 5
        0x51, 0x01, // 6
        0x27, 0x06, // 7
        0x71, 0x01, // 8
        0x73, 0x03, // 9
        0x61, 0x06, // 10
        0x64, 0x06, // 11
        0x11, 0x04, // 12
        0x65, 0x02, // 13
        0x55, 0x05, // 14
        0x77, 0x07, // 15
    };

    public Palette()
    {
        // Load the default palette first; rooms only override a few entries.
        for (int i = 0; i < 16; i++)
            SetColor(i, DefaultPalette[i * 2], DefaultPalette[i * 2 + 1]);
    }

    /// <summary>Apply a room/sprite palette block: triplets of (index, RB, G) ending in 0xFF.</summary>
    public void ApplyOverrides(ReadOnlySpan<byte> block)
    {
        int i = 0;
        while (i < block.Length && block[i] != 0xFF)
        {
            int index = block[i];
            byte rb = block[i + 1];
            byte g = block[i + 2];
            SetColor(index, rb, g);
            i += 3;
        }
    }

    private void SetColor(int index, byte rb, byte g)
    {
        int r = (rb >> 4) & 0x07;
        int b = rb & 0x07;
        int gr = g & 0x07;
        _colors[index & 0x0F] = Color.FromArgb(Expand3(r), Expand3(gr), Expand3(b));
    }

    // map a 3-bit channel (0..7) to 8-bit (0..255)
    private static int Expand3(int v) => v * 255 / 7;
}
