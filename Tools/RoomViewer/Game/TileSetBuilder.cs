using MetalGear.RoomViewer.Render;

namespace MetalGear.RoomViewer.Game;

/// <summary>
/// Reconstructs the 256-entry tile (character) table a room sees in VRAM, by
/// replaying the original load sequence: power-switch tiles, wood crates, then
/// the room's main tileset blocks (LoadRoomTiles in Banks0123.asm).
/// </summary>
public sealed class TileSetBuilder
{
    public const int TileCount = 256;
    private const int BytesPer3bppTile = 24; // 8 lines x 3 planes
    private const int MetalGearTileSet = 6;  // skips crates

    private readonly GameData _data;
    private readonly Dictionary<int, Tile[]> _cache = new();

    public TileSetBuilder(GameData data) => _data = data;

    public Tile[] ForRoom(int room) => Build(_data.GfxSetId(room));

    public Tile[] Build(int tileSetId)
    {
        if (_cache.TryGetValue(tileSetId, out var cached)) return cached;

        var tiles = new Tile[TileCount];
        for (int i = 0; i < TileCount; i++) tiles[i] = new Tile();

        var map = _data.ColorsTileset;

        // 1) Power switch / elevator panel tiles -> tile 0x92 (VRAM 0x9048).
        LoadBlock(tiles, _data.Gfx("gfxPowSwitch"), VramToTile(0x9048), 4, map, flip: false);

        // 2) Wood crates -> tile 0xA0, flipped copy -> tile 0xD0 (except Metal Gear set).
        if (tileSetId != MetalGearTileSet)
        {
            var crates = _data.Gfx("GfxCrates");
            LoadBlock(tiles, crates, VramToTile(0x9400), 8, map, flip: false);
            LoadBlock(tiles, crates, VramToTile(0x9840), 8, map, flip: true);
        }

        // 3) The room's main tileset: up to three blocks (see LoadRoomTiles3).
        ReplayTileSet(tiles, tileSetId, map);

        _cache[tileSetId] = tiles;
        return tiles;
    }

    private void ReplayTileSet(Tile[] tiles, int tileSetId, byte[] map)
    {
        var tokens = _data.TileSetTokens(tileSetId);
        int i = 0;
        int prevCount = 0;
        string prevGfx = "";

        for (int block = 0; block < 3 && i < tokens.Count; block++)
        {
            byte flags = tokens[i++].Value;
            if ((flags & 0x80) != 0) break; // collision-tiles marker -> done

            int dest, count;
            string gfxName;
            bool flip = (flags & 0x40) != 0;

            if (flip)
            {
                dest = tokens[i++].Value;
                count = prevCount;
                gfxName = prevGfx;
            }
            else
            {
                count = tokens[i++].Value;
                dest = tokens[i++].Value;
                gfxName = tokens[i++].Symbol;
                prevCount = count;
                prevGfx = gfxName;
            }

            LoadBlock(tiles, _data.Gfx(gfxName), dest, count, map, flip);
        }
    }

    private static void LoadBlock(Tile[] tiles, byte[] gfx, int destTile, int count, byte[] map, bool flip)
    {
        if (gfx.Length == 0) return;
        for (int n = 0; n < count; n++)
        {
            int off = n * BytesPer3bppTile;
            if (off + BytesPer3bppTile > gfx.Length) break;
            int dst = (destTile + n) & 0xFF;
            tiles[dst] = Tile.Decode3bpp(gfx, off, map, flip);
        }
    }

    /// <summary>VRAM page-1 address (>= 0x8000) -> tile number, per TileToVramAdd.</summary>
    public static int VramToTile(int vramAddr)
    {
        int off = vramAddr - 0x8000;
        int row = off / 1024;            // 32 tiles * 32 bytes per tile row
        int col = (off % 1024) / 4;      // 4 bytes per tile column
        return (row * 32 + col) & 0xFF;
    }
}
