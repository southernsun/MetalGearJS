using System.Windows.Media;

namespace MetalGearSpriteMover
{
    /// <summary>
    /// The colour each of Snake's sprite indices maps to.
    ///
    /// Snake's four sprite colours are indices 7, 10, 12 and 15 (from
    /// <c>SnakeAttrShare</c>, data/playersprite.asm), where 15 is the VDP's OR-combine
    /// of the overlapping pair (7|10 and 7|12 both = 0Fh). The actual RGB for those
    /// indices was recovered by correlating the decoded sprite structure with the
    /// reference sheet <c>examples/22527.png</c> pixel-for-pixel:
    ///
    ///   index 7  -> teal  (body)         ~ MSX2 levels (1,2,2)
    ///   index 10 -> tan   (face / skin)  ~ levels (6,4,3)
    ///   index 12 -> gray  (leg detail)   ~ levels (3,3,3)
    ///   index 15 -> black (shading/outline, the OR-overlap) ~ levels (0,0,0)
    ///
    /// (These differ from the MSX2 BIOS base palette, where 7/10/12/15 would be
    /// cyan/yellow/green/white — that is why an earlier version looked washed-out.)
    ///
    /// Levels are expanded with the same curve used for the room backgrounds so Snake
    /// sits naturally on them.
    /// </summary>
    public static class SnakePalette
    {
        // MSX2 channel level (0-7) -> 8-bit value (matches docs/palettes.md).
        private static readonly byte[] LevelTable = { 6, 32, 72, 104, 144, 176, 216, 247 };

        private static Color FromLevels(int r, int g, int b)
            => Color.FromRgb(LevelTable[r & 7], LevelTable[g & 7], LevelTable[b & 7]);

        /// <summary>
        /// A 16-entry palette with Snake's indices set to their reference colours
        /// (7/10/12/15 for the body poses, plus 13/14 for the parachute canopy).
        /// </summary>
        public static Color[] SnakeColors()
        {
            var p = new Color[16];
            p[7] = FromLevels(1, 2, 2);   // teal  — body
            p[10] = FromLevels(6, 4, 3);  // tan   — face / skin
            p[12] = FromLevels(3, 3, 3);  // gray  — leg detail
            // The parachute canopy (SnakeAttrParach): base 0Dh with a CC 0Eh overlay
            // (0Fh where combined). Around the jump rooms slot 0Dh is (53h,4) tan —
            // SprsetPal20 (room 117) and SprsetPal5 (room 44) agree — and slot 0Eh is
            // PalMenuWeapon's (77h,7) white.
            p[13] = FromLevels(5, 4, 3);  // tan   — canopy
            p[14] = FromLevels(7, 7, 7);  // white — canopy highlight
            p[15] = FromLevels(0, 0, 0);  // black — overlap shading / outline
            return p;
        }

        /// <summary>
        /// Palette for the deep-water swim sprite (WaterShadowAttr, data/playersprite.asm). That
        /// table stacks two opaque (non-CC) planes at the same spot: plane 0 (front) = sub-sprite 0
        /// in colour 0x0E (14), plane 1 (behind) = sub-sprite 1 in colour 0x0F (15). SnakePal only
        /// overrides 7 and 10, so 14/15 keep the room-palette values — verified 14 = white, 15 =
        /// black. With correct MSX2 plane priority (front plane wins, see SnakeSprites.Render) the
        /// frame is a ~100px white blob with just the ~3 gap pixels of the behind-plane showing as
        /// black "holes", matching the PUDDLE sprites on the reference sheet. (The earlier 17 black
        /// pixels were a renderer bug: the behind-plane was overwriting the front plane.)
        /// </summary>
        public static Color[] WaterShadowColors()
        {
            var p = SnakeColors();
            // The deep-water swim sprite (WaterShadowAttr) draws colour index 14 over index 15. In
            // the room palette those are white and black (verified via the room palette), so the
            // sprite is a white shape with black "holes" — not the all-black/grey/all-white I tried
            // before. SnakePal doesn't touch 14/15, so they keep the room palette's values.
            p[14] = Color.FromRgb(255, 255, 255);  // white  (room palette index 14)
            p[15] = Color.FromRgb(0, 0, 0);        // black  (room palette index 15) — the holes
            return p;
        }

        /// <summary>
        /// Palette for Snake's post-hit damage flash. The ROM swaps his sprite colour table to
        /// <c>SnakeAttrDamage</c> (data/playersprite.asm) while <c>DamageDelayTimer</c> is non-zero
        /// (SetSnakeSprCol, Banks0123.asm:5489) — every sprite becomes colour <c>08h</c> with the
        /// <c>0Fh</c> OR-overlap outline. Room-palette index 8 is <c>(255,0,0)</c> (verified via
        /// RoomViewer <c>--palette</c>, identical across rooms) and the 0Fh overlap is black. We
        /// reproduce it as a palette mapping Snake's body indices to red and the outline to black, so
        /// a frame rendered with this palette IS the red flash variant — a baked equivalent of the
        /// hardware per-sprite colour swap (a technique divergence with the same on-screen result).
        /// </summary>
        public static Color[] DamageColors()
        {
            var p = SnakeColors();
            var red = Color.FromRgb(255, 0, 0);     // room palette index 8 = SnakeAttrDamage colour 08h
            p[7] = red;                             // body  -> red
            p[10] = red;                            // face  -> red
            p[12] = red;                            // legs  -> red
            p[14] = red;                            // deep-water body -> red (the puddle flashes red too)
            p[15] = Color.FromRgb(0, 0, 0);         // 0Fh overlap / holes -> black
            return p;
        }
    }
}
