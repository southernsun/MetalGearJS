using System.Drawing;
using MetalGear.RoomViewer.Game;

namespace MetalGear.RoomViewer.Render;

/// <summary>
/// A recognisable room element. In Metal Gear these are metatiles, so a "sprite"
/// routine is really "draw metatile N from set S, using a room that shows it".
/// </summary>
public readonly record struct NamedElement(string Name, int SampleRoom, int MetatileId);

/// <summary>
/// Routines that draw individual room elements -- crates/barrels, walls, the
/// Metal Gear body, etc. -- on their own, plus a metatile "atlas" to help find
/// and name more of them.
/// </summary>
public sealed class SpriteRoutines
{
    public const int MetatilePx = GameData.MetatileTiles * Tile.Size; // 32

    private readonly GameData _data;
    private readonly RoomRenderer _renderer;

    public SpriteRoutines(GameData data, RoomRenderer renderer)
    {
        _data = data;
        _renderer = renderer;
    }

    /// <summary>
    /// A starter catalogue of named elements. Each points at a room that uses
    /// the element so the correct tileset + palette is applied. Extend freely
    /// after browsing the atlas (Tab in the viewer).
    /// </summary>
    public static readonly NamedElement[] Catalog =
    {
        // Stack of wood crates / barrels (tiles 0xA0.. from GfxCrates), set 1.
        new("Crate",     0, 6),
        // Surrounding wall metatiles vary per set; these are common in set 1.
        new("WallLeft",  0, 1),
        new("WallTop",   0, 2),
        new("Floor",     0, 3),
    };

    /// <summary>Draw one metatile from a scene's set into a 32x32 bitmap.</summary>
    public Bitmap DrawMetatile(RoomScene scene, int metatileId)
    {
        var buffer = new int[MetatilePx * MetatilePx];
        _renderer.DrawMetatile(scene, metatileId, buffer, MetatilePx, 0, 0);
        return RoomRenderer.ToBitmap(buffer, MetatilePx, MetatilePx);
    }

    /// <summary>Draw a named element using its sample room's tileset and palette.</summary>
    public Bitmap DrawNamed(NamedElement element)
    {
        var scene = _renderer.BuildScene(element.SampleRoom);
        return DrawMetatile(scene, element.MetatileId);
    }

    /// <summary>
    /// Render every metatile in a scene's set into a labelled grid, so elements
    /// can be identified by eye and added to <see cref="Catalog"/>.
    /// </summary>
    public Bitmap DrawAtlas(RoomScene scene, int columns = 8)
    {
        int total = scene.MetatileSet.Length / 16;
        int rows = (total + columns - 1) / columns;
        const int cell = MetatilePx + 4;   // 2px margin each side
        const int labelH = 12;

        var bmp = new Bitmap(columns * cell, rows * (cell + labelH));
        using var gfx = Graphics.FromImage(bmp);
        gfx.Clear(Color.FromArgb(40, 40, 40));
        using var font = new Font("Consolas", 7f);

        for (int id = 1; id <= total; id++)
        {
            int slot = id - 1;
            int cx = (slot % columns) * cell;
            int cy = (slot / columns) * (cell + labelH);
            using var tile = DrawMetatile(scene, id);
            gfx.DrawImage(tile, cx + 2, cy + 2, MetatilePx, MetatilePx);
            gfx.DrawString($"{id} ({id:X2}h)", font, Brushes.LightGray, cx + 2, cy + cell);
        }
        return bmp;
    }
}
