using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text.RegularExpressions;

namespace MetalGearGfxViewer
{
    /// <summary>
    /// A single labeled run of graphics data (one db block under one label).
    /// </summary>
    public class GfxSegment
    {
        public string Label { get; set; } = "";
        public byte[] Data { get; set; } = System.Array.Empty<byte>();
        public override string ToString() => $"{Label} ({Data.Length} bytes)";
    }

    /// <summary>
    /// Parses graphics data from Z80 assembly files containing db (define byte) statements
    /// </summary>
    public class AsmGfxParser
    {
        /// <summary>
        /// Split a file into labeled segments. A line beginning "Label:" starts a new
        /// segment; subsequent db data accumulates into it until the next label. This
        /// lets each graphic (which the game loads independently) be configured on its
        /// own, even when several share one .asm file.
        /// </summary>
        public static List<GfxSegment> ParseLabeledSegments(string filePath)
        {
            var segments = new List<GfxSegment>();
            GfxSegment? current = null;
            var bytes = new List<byte>();

            void Flush()
            {
                if (current != null)
                    current.Data = bytes.ToArray();
            }

            foreach (var line in File.ReadAllLines(filePath))
            {
                var trimmed = line.Trim();
                if (string.IsNullOrEmpty(trimmed) || trimmed.StartsWith(";"))
                    continue;

                // A leading "Label:" begins a new segment.
                var labelMatch = Regex.Match(trimmed, @"^([A-Za-z_]\w*):");
                if (labelMatch.Success)
                {
                    Flush();
                    current = new GfxSegment { Label = labelMatch.Groups[1].Value };
                    segments.Add(current);
                    bytes = new List<byte>();
                    trimmed = trimmed.Substring(labelMatch.Length).Trim();
                    if (string.IsNullOrEmpty(trimmed))
                        continue;
                }

                if (current == null)
                    continue;

                var dbMatch = Regex.Match(trimmed, @"^db\s+(.+?)(?:;.*)?$", RegexOptions.IgnoreCase);
                if (dbMatch.Success)
                    ParseDbData(dbMatch.Groups[1].Value, bytes);
            }

            Flush();

            // Keep only segments that actually carry graphics data.
            segments.RemoveAll(s => s.Data.Length == 0);
            return segments;
        }

        /// <summary>
        /// Parse an assembly file and extract all byte data
        /// </summary>
        public static byte[] ParseFile(string filePath)
        {
            var bytes = new List<byte>();
            var lines = File.ReadAllLines(filePath);

            foreach (var line in lines)
            {
                var trimmed = line.Trim();

                // Skip empty lines and pure comments
                if (string.IsNullOrEmpty(trimmed) || trimmed.StartsWith(";"))
                    continue;

                // Handle conditional assembly (skip for now - include everything)
                if (trimmed.StartsWith("IF ") || trimmed.StartsWith("ELSE") ||
                    trimmed.StartsWith("ENDIF") || trimmed.StartsWith("IF("))
                    continue;

                // Look for db (define byte) statements
                var dbMatch = Regex.Match(trimmed, @"^\s*(?:\w+:)?\s*db\s+(.+?)(?:;.*)?$",
                    RegexOptions.IgnoreCase);

                if (dbMatch.Success)
                {
                    var dataStr = dbMatch.Groups[1].Value;
                    ParseDbData(dataStr, bytes);
                }
            }

            return bytes.ToArray();
        }

        /// <summary>
        /// Parse the data portion of a db statement
        /// </summary>
        private static void ParseDbData(string dataStr, List<byte> bytes)
        {
            // Split by comma, handling potential whitespace
            var parts = dataStr.Split(',');

            foreach (var part in parts)
            {
                var trimmed = part.Trim();

                // Skip empty parts
                if (string.IsNullOrEmpty(trimmed))
                    continue;

                // Handle comment at end
                var semicolonIdx = trimmed.IndexOf(';');
                if (semicolonIdx >= 0)
                    trimmed = trimmed.Substring(0, semicolonIdx).Trim();

                if (string.IsNullOrEmpty(trimmed))
                    continue;

                // Try to parse as hex (0FFh format or 0xFFh format)
                var hexMatch = Regex.Match(trimmed, @"^0?([0-9A-Fa-f]+)h$");
                if (hexMatch.Success)
                {
                    if (byte.TryParse(hexMatch.Groups[1].Value, NumberStyles.HexNumber,
                        CultureInfo.InvariantCulture, out byte value))
                    {
                        bytes.Add(value);
                    }
                    continue;
                }

                // Try to parse as 0x prefix hex
                if (trimmed.StartsWith("0x", StringComparison.OrdinalIgnoreCase))
                {
                    if (byte.TryParse(trimmed.Substring(2), NumberStyles.HexNumber,
                        CultureInfo.InvariantCulture, out byte value))
                    {
                        bytes.Add(value);
                    }
                    continue;
                }

                // Try to parse as $ prefix hex (common in some assemblers)
                if (trimmed.StartsWith("$"))
                {
                    if (byte.TryParse(trimmed.Substring(1), NumberStyles.HexNumber,
                        CultureInfo.InvariantCulture, out byte value))
                    {
                        bytes.Add(value);
                    }
                    continue;
                }

                // Try to parse as binary (00001111b format)
                var binMatch = Regex.Match(trimmed, @"^([01]+)b$", RegexOptions.IgnoreCase);
                if (binMatch.Success)
                {
                    try
                    {
                        bytes.Add(Convert.ToByte(binMatch.Groups[1].Value, 2));
                    }
                    catch { }
                    continue;
                }

                // Try to parse as decimal
                if (byte.TryParse(trimmed, out byte decValue))
                {
                    bytes.Add(decValue);
                }
            }
        }

        /// <summary>
        /// Guess the bit depth from the file name, based on how the game actually
        /// loads each kind of graphic (see the Load*Tiles routines in Banks0123.asm).
        /// Most tile graphics are 3bpp; this only special-cases the exceptions.
        /// </summary>
        public static int DetectBitDepth(string filename, byte[] data)
        {
            var lowerName = filename.ToLowerInvariant();

            // Fonts are 1bpp (8 bytes per 8x8 tile), expanded by Load1bppTile.
            if (lowerName.Contains("font"))
                return 1;

            // Surveillance camera and the radio/incoming-call screen are 2bpp
            // (Load2bppTile).
            if (lowerName.Contains("camera") || lowerName.Contains("radio"))
                return 2;

            // Doors are stored as raw Screen 5 bytes (4bpp, 2 pixels/byte) and
            // block-copied straight to VRAM by LoadGfxDoors.
            if (lowerName.Contains("door"))
                return 4;

            // Everything else is 3bpp tile data (Load3bppTiles).
            return 3;
        }
    }
}
