using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace MetalGearGfxViewer
{
    /// <summary>
    /// One room: which tileset graphics and which palette the game uses for it.
    /// </summary>
    public class RoomInfo
    {
        public int Number { get; set; }
        public int TilesetId { get; set; }
        public int PaletteId { get; set; }
        public string Area { get; set; } = "";
        public string GfxFile { get; set; } = "";

        public override string ToString() => $"Room {Number}: {Area} (palette {PaletteId})";
    }

    /// <summary>
    /// Builds the room -> tileset/palette table from the game data tables
    /// (RoomGfxSetIds in data/roomtileset.asm, IdsRoomPal in data/palettes.asm).
    /// Both are nibble-packed, two rooms per byte; even rooms use the high nibble,
    /// odd rooms the low nibble (per GetNibbleHL_A2 in Banks0123.asm).
    /// </summary>
    public static class RoomTable
    {
        // idxTileSets order in data/roomtileset.asm.
        private static readonly string[] TilesetFiles =
        {
            "building.asm", "basementdesert.asm", "roof.asm", "elevator.asm",
            "lorry.asm", "hindd.asm", "metalgear.asm", "ending.asm",
        };

        private static readonly string[] TilesetNames =
        {
            "Building", "Basement/Desert", "Roof", "Elevator",
            "Lorry room", "Hind D", "Metal Gear", "Ending",
        };

        private static int Nibble(byte[] data, int room)
        {
            int b = data[room / 2];
            return (room % 2 == 0) ? (b >> 4) & 0x0F : b & 0x0F;
        }

        private static byte[]? SegmentBytes(string filePath, string label)
        {
            if (!File.Exists(filePath))
                return null;
            return AsmGfxParser.ParseLabeledSegments(filePath)
                .FirstOrDefault(s => s.Label == label)?.Data;
        }

        /// <summary>
        /// Load the room table from the data folder, or return an empty list if the
        /// tables can't be found.
        /// </summary>
        public static List<RoomInfo> Load(string dataFolder)
        {
            var rooms = new List<RoomInfo>();
            if (!Directory.Exists(dataFolder))
                return rooms;

            var tilesetIds = SegmentBytes(Path.Combine(dataFolder, "roomtileset.asm"), "RoomGfxSetIds");
            var paletteIds = SegmentBytes(Path.Combine(dataFolder, "palettes.asm"), "IdsRoomPal");
            if (tilesetIds == null || paletteIds == null)
                return rooms;

            int count = System.Math.Min(tilesetIds.Length, paletteIds.Length) * 2;
            for (int r = 0; r < count; r++)
            {
                int ts = Nibble(tilesetIds, r);
                int pal = Nibble(paletteIds, r);
                rooms.Add(new RoomInfo
                {
                    Number = r,
                    TilesetId = ts,
                    PaletteId = pal,
                    Area = ts < TilesetNames.Length ? TilesetNames[ts] : $"Tileset {ts}",
                    GfxFile = ts < TilesetFiles.Length ? TilesetFiles[ts] : "",
                });
            }
            return rooms;
        }
    }
}
