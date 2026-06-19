using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace MetalGearSpriteMover
{
    /// <summary>The four ways Snake can face.</summary>
    public enum Direction { Down, Up, Left, Right }

    /// <summary>
    /// Loads Solid Snake's player sprites from <c>gfx/sprites.asm</c> and composites
    /// any of his animation sprites exactly the way the game does, driven by the real
    /// attribute tables in <c>data/playersprite.asm</c>:
    ///
    ///   - <c>idxSnakeSpr</c>      — sprite id -> pattern label (SprSnakeDown, ...).
    ///   - <c>SnakeSprAttIds</c>   — sprite id -> attribute-set id.
    ///   - <c>idxSnakeSprAttr</c>  — attribute-set id -> attribute table label.
    ///   - <c>SnakeAttr*</c>       — a count followed by per-sprite
    ///                               (Yoffset, Xoffset, pattern, colour) rows.
    ///
    /// Rendering one sprite id: decompress its pattern label (RLE), then for every
    /// attribute row place a 16x16 monochrome sprite (pattern/4 selects which) at its
    /// signed Y/X offset, painting palette index <c>colour &amp; 0Fh</c>. When a row has
    /// the CC bit (<c>colour &amp; 40h</c>) its colour is OR-combined with whatever is
    /// already there — the VDP's colour-combination feature, which is how Snake gets
    /// more than one colour out of monochrome sprites (see docs/sprites.md).
    /// </summary>
    public class SnakeSprites
    {
        private struct AttrRow
        {
            public int Y, X;          // signed screen offsets
            public int Pattern;       // pattern number (sprite index = Pattern / 4)
            public int ColorIndex;    // palette index (low nibble of colour byte)
            public bool Cc;           // OR-combine with lower sprites
            public bool Hidden;       // off-screen placeholder (Y == 80h)
        }

        // label -> decompressed pattern bytes (each 16x16 sprite is 32 bytes).
        private readonly Dictionary<string, byte[]> _patterns;
        private readonly string[] _idxSnakeSpr;       // sprite id -> pattern label
        private readonly int[] _sprAttIds;            // sprite id -> attribute-set id
        private readonly string[] _idxSnakeSprAttr;   // attr-set id -> attr table label
        private readonly Dictionary<string, AttrRow[]> _attrTables;

        private SnakeSprites(Dictionary<string, byte[]> patterns, string[] idxSnakeSpr,
            int[] sprAttIds, string[] idxSnakeSprAttr, Dictionary<string, AttrRow[]> attrTables)
        {
            _patterns = patterns;
            _idxSnakeSpr = idxSnakeSpr;
            _sprAttIds = sprAttIds;
            _idxSnakeSprAttr = idxSnakeSprAttr;
            _attrTables = attrTables;
        }

        /// <summary>Number of sprite ids defined in idxSnakeSpr.</summary>
        public int SpriteCount => _idxSnakeSpr.Length;

        /// <summary>The RLE-decompressed pattern bytes of any label (32 bytes per 16x16 sprite).</summary>
        public byte[] DecodedPatterns(string label) =>
            _patterns.TryGetValue(label, out var b) ? b : System.Array.Empty<byte>();

        /// <summary>Read one pixel of the Nth 16x16 sprite in a decompressed pattern block.</summary>
        public static bool ReadPixel(byte[] data, int spriteIndex, int x, int y) =>
            SpritePixel(data, spriteIndex * 32, x, y);

        public static SnakeSprites Load(string spritesAsmPath, string playerSpriteAsmPath)
        {
            // 1. Decompress every labelled pattern block in sprites.asm.
            var rawSegments = ParseDbSegments(spritesAsmPath);
            var patterns = new Dictionary<string, byte[]>();
            foreach (var (label, bytes) in rawSegments)
                patterns[label] = DecompressRLE(bytes, 0);

            // 2. Parse the player sprite/attribute tables.
            var player = ParseDbSegments(playerSpriteAsmPath);
            var dwLists = ParseDwLists(playerSpriteAsmPath);

            if (!dwLists.TryGetValue("idxSnakeSpr", out var idxSnakeSpr))
                throw new InvalidDataException("idxSnakeSpr not found in " + playerSpriteAsmPath);
            if (!dwLists.TryGetValue("idxSnakeSprAttr", out var idxSnakeSprAttr))
                throw new InvalidDataException("idxSnakeSprAttr not found in " + playerSpriteAsmPath);
            if (!player.TryGetValue("SnakeSprAttIds", out var attIds))
                throw new InvalidDataException("SnakeSprAttIds not found in " + playerSpriteAsmPath);

            int[] sprAttIds = Array.ConvertAll(attIds, b => (int)b);

            // 3. Parse each attribute table referenced by idxSnakeSprAttr.
            var attrTables = new Dictionary<string, AttrRow[]>();
            foreach (var attrLabel in idxSnakeSprAttr)
            {
                if (attrTables.ContainsKey(attrLabel) || !player.TryGetValue(attrLabel, out var raw))
                    continue;
                attrTables[attrLabel] = ParseAttrTable(raw);
            }

            return new SnakeSprites(patterns, idxSnakeSpr.ToArray(), sprAttIds,
                idxSnakeSprAttr.ToArray(), attrTables);
        }

        private static AttrRow[] ParseAttrTable(byte[] raw)
        {
            if (raw.Length == 0)
                return Array.Empty<AttrRow>();

            int count = raw[0];
            var rows = new List<AttrRow>();
            for (int i = 0; i < count; i++)
            {
                int off = 1 + i * 4;
                if (off + 3 >= raw.Length)
                    break;
                int y = raw[off], x = raw[off + 1], pattern = raw[off + 2], colour = raw[off + 3];
                rows.Add(new AttrRow
                {
                    Y = (sbyte)y,
                    X = (sbyte)x,
                    Pattern = pattern,
                    ColorIndex = colour & 0x0F,
                    Cc = (colour & 0x40) != 0,
                    Hidden = y == 0x80, // game parks unused sprites off-screen
                });
            }
            return rows.ToArray();
        }

        /// <summary>True if the given sprite id can be rendered (label and data exist).</summary>
        public bool CanRender(int spriteId)
        {
            if (spriteId < 0 || spriteId >= _idxSnakeSpr.Length)
                return false;
            return _patterns.ContainsKey(_idxSnakeSpr[spriteId]);
        }

        /// <summary>
        /// Composite sprite <paramref name="spriteId"/> (an index into idxSnakeSpr) with
        /// the given 16-colour palette, into a tightly-cropped RGBA bitmap.
        /// </summary>
        public BitmapSource Render(int spriteId, Color[] palette)
        {
            string label = _idxSnakeSpr[spriteId];
            byte[] data = _patterns[label];

            string attrLabel = _idxSnakeSprAttr[_sprAttIds[spriteId]];
            AttrRow[] rows = _attrTables[attrLabel];

            // Bounding box over the visible sprites (each is 16x16).
            int minX = int.MaxValue, minY = int.MaxValue, maxX = int.MinValue, maxY = int.MinValue;
            foreach (var r in rows)
            {
                if (r.Hidden) continue;
                minX = Math.Min(minX, r.X); maxX = Math.Max(maxX, r.X + 16);
                minY = Math.Min(minY, r.Y); maxY = Math.Max(maxY, r.Y + 16);
            }
            if (minX > maxX) // nothing visible — emit a 16x16 blank
            { minX = minY = 0; maxX = maxY = 16; }

            int w = maxX - minX, h = maxY - minY;
            var buffer = new int[w * h]; // palette index per pixel, 0 = transparent

            foreach (var r in rows)
            {
                if (r.Hidden) continue;
                int spriteBase = (r.Pattern / 4) * 32;
                for (int y = 0; y < 16; y++)
                    for (int x = 0; x < 16; x++)
                    {
                        if (!SpritePixel(data, spriteBase, x, y))
                            continue;
                        int idx = (r.Y - minY + y) * w + (r.X - minX + x);
                        // MSX2 sprite priority: attribute rows are plane 0..N front-to-back.
                        // A CC row (colour & 40h) OR-combines with the plane(s) in front of it
                        // (how Snake's body builds its outline). A non-CC row is opaque, so the
                        // front-most plane wins — it must NOT be overwritten by a later (further
                        // back) non-CC plane. This is why WaterShadowAttr's white plane (front)
                        // shows over its black plane (behind), leaving only the gap pixels black.
                        if (r.Cc) buffer[idx] |= r.ColorIndex;
                        else if (buffer[idx] == 0) buffer[idx] = r.ColorIndex;
                    }
            }

            var pixels = new byte[w * h * 4];
            for (int i = 0; i < buffer.Length; i++)
            {
                int v = buffer[i];
                if (v == 0) continue; // transparent
                Color c = palette[v & 15];
                int o = i * 4;
                pixels[o + 0] = c.B;
                pixels[o + 1] = c.G;
                pixels[o + 2] = c.R;
                pixels[o + 3] = 255;
            }

            var bmp = new WriteableBitmap(w, h, 96, 96, PixelFormats.Bgra32, null);
            bmp.WritePixels(new Int32Rect(0, 0, w, h), pixels, w * 4, 0);
            bmp.Freeze();
            return bmp;
        }

        /// <summary>
        /// The visible bounding box of one sprite id, expressed as offsets from the actor
        /// origin (0,0): minX..maxX horizontally, minY..maxY vertically, where each visible
        /// attribute row spans [X, X+16) x [Y, Y+16). Returns false if nothing is visible.
        /// </summary>
        public bool TryGetBounds(int spriteId, out int minX, out int minY, out int maxX, out int maxY)
        {
            minX = int.MaxValue; minY = int.MaxValue; maxX = int.MinValue; maxY = int.MinValue;
            string attrLabel = _idxSnakeSprAttr[_sprAttIds[spriteId]];
            AttrRow[] rows = _attrTables[attrLabel];
            foreach (var r in rows)
            {
                if (r.Hidden) continue;
                minX = Math.Min(minX, r.X); maxX = Math.Max(maxX, r.X + 16);
                minY = Math.Min(minY, r.Y); maxY = Math.Max(maxY, r.Y + 16);
            }
            return minX <= maxX;
        }

        /// <summary>
        /// Composite sprite <paramref name="spriteId"/> into a fixed
        /// <paramref name="cellW"/> x <paramref name="cellH"/> canvas, placing every
        /// sub-sprite at (originX + r.X + x, originY + r.Y + y) so that all frames share a
        /// common size and origin (the actor origin sits at originX/originY in the cell).
        /// Uses the identical CC-bit / palette logic as <see cref="Render"/>.
        /// </summary>
        public BitmapSource RenderAligned(int spriteId, Color[] palette, int originX, int originY, int cellW, int cellH)
        {
            string label = _idxSnakeSpr[spriteId];
            byte[] data = _patterns[label];

            string attrLabel = _idxSnakeSprAttr[_sprAttIds[spriteId]];
            AttrRow[] rows = _attrTables[attrLabel];

            var buffer = new int[cellW * cellH]; // palette index per pixel, 0 = transparent

            foreach (var r in rows)
            {
                if (r.Hidden) continue;
                int spriteBase = (r.Pattern / 4) * 32;
                for (int y = 0; y < 16; y++)
                    for (int x = 0; x < 16; x++)
                    {
                        if (!SpritePixel(data, spriteBase, x, y))
                            continue;
                        int px = originX + r.X + x, py = originY + r.Y + y;
                        if (px < 0 || px >= cellW || py < 0 || py >= cellH)
                            continue;
                        int idx = py * cellW + px;
                        // MSX2 sprite priority (see Render): non-CC planes are opaque and the
                        // front-most (earlier row) wins; only CC planes OR-combine. This keeps the
                        // deep-water white plane on top of the black plane behind it.
                        if (r.Cc) buffer[idx] |= r.ColorIndex;
                        else if (buffer[idx] == 0) buffer[idx] = r.ColorIndex;
                    }
            }

            var pixels = new byte[cellW * cellH * 4];
            for (int i = 0; i < buffer.Length; i++)
            {
                int v = buffer[i];
                if (v == 0) continue; // transparent
                Color c = palette[v & 15];
                int o = i * 4;
                pixels[o + 0] = c.B;
                pixels[o + 1] = c.G;
                pixels[o + 2] = c.R;
                pixels[o + 3] = 255;
            }

            var bmp = new WriteableBitmap(cellW, cellH, 96, 96, PixelFormats.Bgra32, null);
            bmp.WritePixels(new Int32Rect(0, 0, cellW, cellH), pixels, cellW * 4, 0);
            bmp.Freeze();
            return bmp;
        }

        /// <summary>
        /// Read one pixel of a 16x16 sprite stored as four 8x8 quadrants in the
        /// MSX2 order TL, BL, TR, BR (matching the game's sprite pattern layout).
        /// </summary>
        private static bool SpritePixel(byte[] data, int spriteBase, int x, int y)
        {
            int quad = (x >= 8 ? 2 : 0) + (y >= 8 ? 1 : 0);
            int idx = spriteBase + quad * 8 + (y & 7);
            if (idx < 0 || idx >= data.Length)
                return false;
            return ((data[idx] >> (7 - (x & 7))) & 1) != 0;
        }

        // ----- RLE decompression (the format SetSnakeSprPatt / UnpackGfx consume) -----
        // Control byte B:  (B & 7Fh)==0 -> end of segment; B<80h -> repeat next byte B
        // times; B>=80h -> copy the next (B & 7Fh) bytes verbatim.
        private static byte[] DecompressRLE(byte[] data, int startOffset)
        {
            var output = new List<byte>();
            int i = startOffset;

            while (i < data.Length)
            {
                byte control = data[i];
                int count = control & 0x7F;

                if (count == 0) // 00h or 80h terminator
                    break;

                i++;
                if (control < 0x80)
                {
                    if (i >= data.Length) break;
                    byte value = data[i++];
                    for (int j = 0; j < count; j++)
                        output.Add(value);
                }
                else
                {
                    for (int j = 0; j < count && i < data.Length; j++)
                        output.Add(data[i++]);
                }
            }

            return output.ToArray();
        }

        // ----- Assembly parsing -----

        // Collect the raw db bytes under each "Label:".
        private static Dictionary<string, byte[]> ParseDbSegments(string filePath)
        {
            var segments = new Dictionary<string, byte[]>();
            string? label = null;
            var bytes = new List<byte>();

            void Flush()
            {
                if (label != null && !segments.ContainsKey(label))
                    segments[label] = bytes.ToArray();
            }

            foreach (var rawLine in File.ReadAllLines(filePath))
            {
                var trimmed = rawLine.Trim();
                if (trimmed.Length == 0 || trimmed.StartsWith(";"))
                    continue;

                var labelMatch = Regex.Match(trimmed, @"^([A-Za-z_]\w*):");
                if (labelMatch.Success)
                {
                    Flush();
                    label = labelMatch.Groups[1].Value;
                    bytes = new List<byte>();
                    trimmed = trimmed.Substring(labelMatch.Length).Trim();
                    if (trimmed.Length == 0)
                        continue;
                }

                if (label == null)
                    continue;

                var dbMatch = Regex.Match(trimmed, @"^db\s+(.+?)(?:;.*)?$", RegexOptions.IgnoreCase);
                if (dbMatch.Success)
                    ParseDbData(dbMatch.Groups[1].Value, bytes);
            }

            Flush();
            return segments;
        }

        // Collect the operands of "dw name[, name...]" lines under each "Label:".
        private static Dictionary<string, List<string>> ParseDwLists(string filePath)
        {
            var lists = new Dictionary<string, List<string>>();
            string? label = null;
            List<string>? current = null;

            foreach (var rawLine in File.ReadAllLines(filePath))
            {
                var trimmed = rawLine.Trim();
                if (trimmed.Length == 0 || trimmed.StartsWith(";"))
                    continue;

                var labelMatch = Regex.Match(trimmed, @"^([A-Za-z_]\w*):");
                if (labelMatch.Success)
                {
                    label = labelMatch.Groups[1].Value;
                    if (!lists.TryGetValue(label, out current))
                    {
                        current = new List<string>();
                        lists[label] = current;
                    }
                    trimmed = trimmed.Substring(labelMatch.Length).Trim();
                    if (trimmed.Length == 0)
                        continue;
                }

                if (current == null)
                    continue;

                var dwMatch = Regex.Match(trimmed, @"^dw\s+(.+?)(?:;.*)?$", RegexOptions.IgnoreCase);
                if (!dwMatch.Success)
                    continue;

                foreach (var part in dwMatch.Groups[1].Value.Split(','))
                {
                    var name = part.Trim();
                    int semi = name.IndexOf(';');
                    if (semi >= 0) name = name.Substring(0, semi).Trim();
                    if (name.Length > 0)
                        current.Add(name);
                }
            }

            return lists;
        }

        private static void ParseDbData(string dataStr, List<byte> bytes)
        {
            foreach (var part in dataStr.Split(','))
            {
                var t = part.Trim();
                int semi = t.IndexOf(';');
                if (semi >= 0) t = t.Substring(0, semi).Trim();
                if (t.Length == 0) continue;

                var hex = Regex.Match(t, @"^0?([0-9A-Fa-f]+)h$");
                if (hex.Success && byte.TryParse(hex.Groups[1].Value, NumberStyles.HexNumber, CultureInfo.InvariantCulture, out byte hv))
                {
                    bytes.Add(hv);
                    continue;
                }
                if (byte.TryParse(t, out byte dv))
                    bytes.Add(dv);
            }
        }
    }
}
