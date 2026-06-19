using System.Collections.Generic;

namespace MetalGearGfxViewer
{
    /// <summary>
    /// A named index-to-palette mapping, used by the decoders to turn a decoded
    /// 1/2/3bpp pixel value into an actual MSX2 palette entry (0-15).
    /// </summary>
    public class GameColorSet
    {
        public string Name { get; }

        /// <summary>
        /// Lookup applied to 2bpp/3bpp pixel indices (wraps via modulo if shorter
        /// than the number of indices the bit depth produces).
        /// </summary>
        public byte[] Lookup { get; }

        /// <summary>Palette index used for set pixels when rendering 1bpp data.</summary>
        public byte Foreground1bpp { get; }

        public GameColorSet(string name, byte[] lookup, byte foreground1bpp)
        {
            Name = name;
            Lookup = lookup;
            Foreground1bpp = foreground1bpp;
        }

        public override string ToString() => Name;
    }

    /// <summary>
    /// The color lookup tables extracted from the game source. These are the
    /// values the game copies into BufferColor (E700h) before decoding graphics
    /// (see ColorsTileset/ColorsItems/... in Banks0123.asm, MGLogoColors in
    /// logic/mainmenu.asm and colorsCALL in logic/loadfont.asm), plus the sprite
    /// foreground colors taken from the sprite attribute tables.
    /// </summary>
    public static class GameColorSets
    {
        public static readonly IReadOnlyList<GameColorSet> All = new[]
        {
            // Default identity-ish mapping (the viewer's neutral fallback).
            new GameColorSet("Default (identity)", new byte[] { 0, 1, 2, 3, 4, 5, 6, 7 }, 15),

            // ----- 3bpp tile lookups (8 entries) -----
            new GameColorSet("Tileset (3bpp)", new byte[] { 1, 3, 5, 8, 9, 12, 14, 15 }, 15),
            new GameColorSet("Items (3bpp)", new byte[] { 0, 6, 7, 8, 10, 12, 14, 15 }, 15),
            new GameColorSet("Metal Gear Logo (3bpp)", new byte[] { 0, 2, 3, 4, 5, 9, 10, 14 }, 14),

            // ----- 2bpp tile lookups (4 entries) -----
            new GameColorSet("Cameras (2bpp)", new byte[] { 0, 2, 13, 15 }, 15),
            new GameColorSet("Pitfall (2bpp)", new byte[] { 0, 5, 9, 15 }, 15),
            new GameColorSet("Incoming Call (2bpp)", new byte[] { 6, 8, 14, 15 }, 15),

            // ----- Sprite foreground color index (1bpp) -----
            // A hardware sprite pattern is monochrome; its color comes from the sprite
            // attribute (the low nibble of the color byte). These pick which palette
            // index lights the set pixels, so the actual hue depends on the chosen
            // sprite palette. Indices below are the ones the game actually uses for
            // sprites (SnakeAttr* and ActorSprColors* / SprsetPal*).
            new GameColorSet("Sprite fg 13 (enemies)", new byte[] { 0, 13 }, 13),
            new GameColorSet("Sprite fg 7 (Snake)", new byte[] { 0, 7 }, 7),
            new GameColorSet("Sprite fg 10 (Snake)", new byte[] { 0, 10 }, 10),
            new GameColorSet("Sprite fg 12 (Snake)", new byte[] { 0, 12 }, 12),
            new GameColorSet("Sprite fg 11", new byte[] { 0, 11 }, 11),
            new GameColorSet("Sprite fg 2", new byte[] { 0, 2 }, 2),
            new GameColorSet("Sprite fg 4", new byte[] { 0, 4 }, 4),
            new GameColorSet("Sprite fg 14 (gray)", new byte[] { 0, 14 }, 14),
            new GameColorSet("Sprite fg 15 (white)", new byte[] { 0, 15 }, 15),
        };
    }
}
