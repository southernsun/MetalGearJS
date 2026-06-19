using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using MetalGear.RoomViewer.Game;

namespace MetalGear.RoomViewer.Render;

/// <summary>
/// Everything needed to draw one room: its palette and its 256-tile table.
/// Built once per room and reused by the higher-level drawing routines.
/// </summary>
public sealed class RoomScene
{
    public required int Room { get; init; }
    public required Palette Palette { get; init; }
    public required Tile[] Tiles { get; init; }
    public required byte[] MetatileSet { get; init; }
    public required byte[] Metatiles { get; init; } // 8x6 metatile ids
    public required int MetatileSetId { get; init; }
    public required int GfxSetId { get; init; }
    public required int PaletteId { get; init; }
}

/// <summary>
/// Faithful re-implementation of the room drawing pipeline (RenderRoom /
/// UnpackMetatiles / DrawTile in Banks0123.asm), built from small subroutines
/// so individual elements -- a tile, a metatile, the whole room -- can be drawn
/// on their own.
/// </summary>
public sealed class RoomRenderer
{
    public const int RoomWidth = GameData.RoomCols * GameData.MetatileTiles * Tile.Size;  // 256
    public const int RoomHeight = GameData.RoomRows * GameData.MetatileTiles * Tile.Size; // 192

    private readonly GameData _data;
    private readonly TileSetBuilder _tiles;

    public RoomRenderer(GameData data)
    {
        _data = data;
        _tiles = new TileSetBuilder(data);
    }

    /// <summary>Assemble the palette + tile table + metatiles for a room.
    /// `extraPalBlock` is applied on top (e.g. RoomPalette10 — ChkGogglesPal's grey
    /// infrared palette, Banks0123.asm:2967-2973).</summary>
    public RoomScene BuildScene(int room, byte[]? extraPalBlock = null)
    {
        var palette = new Palette();
        palette.ApplyOverrides(_data.BasePaletteBlock());     // fixed gameplay slots
        int palId = _data.PaletteId(room);
        palette.ApplyOverrides(_data.RoomPaletteBlock(palId)); // per-room slots 1,3,5,9
        if (extraPalBlock != null) palette.ApplyOverrides(extraPalBlock);

        int metaSetId = _data.MetatileSetId(room);
        return new RoomScene
        {
            Room = room,
            Palette = palette,
            Tiles = _tiles.ForRoom(room),
            MetatileSet = _data.MetatileSet(metaSetId),
            Metatiles = _data.RoomMetatiles(room),
            MetatileSetId = metaSetId,
            GfxSetId = _data.GfxSetId(room),
            PaletteId = palId,
        };
    }

    /// <summary>DrawRoom: draw the full 8x6 metatile grid into a fresh bitmap.</summary>
    public Bitmap DrawRoom(int room, byte[]? extraPalBlock = null)
    {
        var scene = BuildScene(room, extraPalBlock);
        var buffer = new int[RoomWidth * RoomHeight];

        for (int mRow = 0; mRow < GameData.RoomRows; mRow++)
        for (int mCol = 0; mCol < GameData.RoomCols; mCol++)
        {
            int metatileId = scene.Metatiles[mRow * GameData.RoomCols + mCol];
            DrawMetatile(scene, metatileId, buffer, RoomWidth,
                         mCol * 32, mRow * 32);
        }

        return ToBitmap(buffer, RoomWidth, RoomHeight);
    }

    /// <summary>
    /// Unpack a room's 8x6 metatile grid into the flat 32x24 grid of tile
    /// numbers (row-major, 32 wide x 24 tall, length 768). Mirrors the placement
    /// in <see cref="DrawRoom"/>/<see cref="DrawMetatile"/>: metatile (mCol,mRow)
    /// fills tile columns mCol*4..+3 and tile rows mRow*4..+3.
    /// </summary>
    public int[] UnpackTileNumbers(int room)
    {
        var scene = BuildScene(room);
        const int gridW = GameData.RoomCols * GameData.MetatileTiles;  // 32
        const int gridH = GameData.RoomRows * GameData.MetatileTiles;  // 24
        var tiles = new int[gridW * gridH];

        for (int mRow = 0; mRow < GameData.RoomRows; mRow++)
        for (int mCol = 0; mCol < GameData.RoomCols; mCol++)
        {
            int metatileId = scene.Metatiles[mRow * GameData.RoomCols + mCol];
            if (metatileId == 0) continue; // empty cell -> tile 0
            int baseOff = (metatileId - 1) * 16;
            if (baseOff < 0 || baseOff + 16 > scene.MetatileSet.Length) continue;

            for (int ty = 0; ty < GameData.MetatileTiles; ty++)
            for (int tx = 0; tx < GameData.MetatileTiles; tx++)
            {
                byte tileId = scene.MetatileSet[baseOff + ty * 4 + tx];
                int gx = mCol * GameData.MetatileTiles + tx;
                int gy = mRow * GameData.MetatileTiles + ty;
                tiles[gy * gridW + gx] = tileId;
            }
        }

        return tiles;
    }

    /// <summary>DrawMetatile: blit a 4x4 block of tiles at (x,y).</summary>
    public void DrawMetatile(RoomScene scene, int metatileId, int[] buffer, int stride, int x, int y)
    {
        if (metatileId == 0) return; // empty cell
        int baseOff = (metatileId - 1) * 16;
        if (baseOff < 0 || baseOff + 16 > scene.MetatileSet.Length) return;

        for (int ty = 0; ty < GameData.MetatileTiles; ty++)
        for (int tx = 0; tx < GameData.MetatileTiles; tx++)
        {
            byte tileId = scene.MetatileSet[baseOff + ty * 4 + tx];
            DrawTile(scene.Tiles[tileId], scene.Palette, buffer, stride,
                     x + tx * Tile.Size, y + ty * Tile.Size);
        }
    }

    /// <summary>DrawTile: blit one 8x8 character through the palette.</summary>
    public static void DrawTile(Tile tile, Palette palette, int[] buffer, int stride, int x, int y)
    {
        for (int py = 0; py < Tile.Size; py++)
        {
            int row = (y + py) * stride + x;
            for (int px = 0; px < Tile.Size; px++)
            {
                byte ci = tile.Pixels[py * Tile.Size + px];
                buffer[row + px] = palette[ci].ToArgb();
            }
        }
    }

    public static Bitmap ToBitmap(int[] argb, int width, int height)
    {
        var bmp = new Bitmap(width, height, PixelFormat.Format32bppArgb);
        var rect = new Rectangle(0, 0, width, height);
        var bd = bmp.LockBits(rect, ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
        Marshal.Copy(argb, 0, bd.Scan0, argb.Length);
        bmp.UnlockBits(bd);
        return bmp;
    }
}
