using System.Drawing.Drawing2D;
using MetalGear.RoomViewer.Game;
using MetalGear.RoomViewer.Render;

namespace MetalGear.RoomViewer.UI;

/// <summary>
/// Interactive room browser. Arrow keys / PgUp-PgDn step through the defined
/// rooms; the room is rendered exactly as the ROM would, then scaled up.
/// </summary>
public sealed class ViewerForm : Form
{
    private const int Zoom = 2;
    private const int InfoHeight = 28;

    private readonly GameData _data;
    private readonly RoomRenderer _renderer;
    private readonly SpriteRoutines _sprites;

    private readonly List<int> _definedRooms = new();
    private int _index;
    private Bitmap? _current;
    private bool _showGrid;

    public ViewerForm(GameData data)
    {
        _data = data;
        _renderer = new RoomRenderer(data);
        _sprites = new SpriteRoutines(data, _renderer);

        for (int r = 0; r < data.RoomCount; r++)
            if (data.RoomDefined(r))
                _definedRooms.Add(r);

        Text = "Metal Gear (MSX2) — Room Viewer";
        ClientSize = new Size(RoomRenderer.RoomWidth * Zoom,
                              RoomRenderer.RoomHeight * Zoom + InfoHeight);
        BackColor = Color.Black;
        DoubleBuffered = true;
        KeyPreview = true;
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;

        LoadRoom();
    }

    private int CurrentRoom => _definedRooms.Count == 0 ? -1 : _definedRooms[_index];

    private void LoadRoom()
    {
        if (CurrentRoom < 0) return;
        _current?.Dispose();
        _current = _renderer.DrawRoom(CurrentRoom);
        var scene = _renderer.BuildScene(CurrentRoom);
        Text = $"Metal Gear Room {CurrentRoom} ({_data.RoomLabel(CurrentRoom)})  " +
               $"— metaset {scene.MetatileSetId}, gfxset {scene.GfxSetId}, palette {scene.PaletteId}  " +
               $"[{_index + 1}/{_definedRooms.Count}]";
        Invalidate();
    }

    private void Step(int delta)
    {
        if (_definedRooms.Count == 0) return;
        _index = (_index + delta + _definedRooms.Count) % _definedRooms.Count;
        LoadRoom();
    }

    protected override void OnKeyDown(KeyEventArgs e)
    {
        switch (e.KeyCode)
        {
            case Keys.Right or Keys.Down: Step(+1); break;
            case Keys.Left or Keys.Up: Step(-1); break;
            case Keys.PageDown: Step(+10); break;
            case Keys.PageUp: Step(-10); break;
            case Keys.Home: _index = 0; LoadRoom(); break;
            case Keys.End: _index = _definedRooms.Count - 1; LoadRoom(); break;
            case Keys.G: _showGrid = !_showGrid; Invalidate(); break;
            case Keys.Tab: ShowAtlas(); break;
            case Keys.S: SaveCurrent(); break;
            case Keys.Escape: Close(); break;
        }
        base.OnKeyDown(e);
    }

    private void ShowAtlas()
    {
        if (CurrentRoom < 0) return;
        var scene = _renderer.BuildScene(CurrentRoom);
        var atlas = _sprites.DrawAtlas(scene);
        var form = new Form
        {
            Text = $"Metatile atlas — set {scene.MetatileSetId} (room {CurrentRoom})",
            ClientSize = new Size(Math.Min(atlas.Width, 1000), Math.Min(atlas.Height, 800)),
            AutoScroll = true,
        };
        var pic = new PictureBox { Image = atlas, SizeMode = PictureBoxSizeMode.AutoSize };
        form.Controls.Add(pic);
        form.Show(this);
    }

    private void SaveCurrent()
    {
        if (_current == null) return;
        string file = Path.Combine(AppContext.BaseDirectory, $"room_{CurrentRoom:000}.png");
        _current.Save(file, System.Drawing.Imaging.ImageFormat.Png);
        MessageBox.Show(this, $"Saved {file}", "Saved");
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.Clear(Color.Black);
        if (_current == null) return;

        g.InterpolationMode = InterpolationMode.NearestNeighbor;
        g.PixelOffsetMode = PixelOffsetMode.Half;

        int w = RoomRenderer.RoomWidth * Zoom;
        int h = RoomRenderer.RoomHeight * Zoom;
        g.DrawImage(_current, new Rectangle(0, 0, w, h));

        if (_showGrid) DrawMetatileGrid(g, w, h);

        using var bg = new SolidBrush(Color.FromArgb(30, 30, 30));
        g.FillRectangle(bg, 0, h, w, InfoHeight);
        using var font = new Font("Consolas", 9f);
        g.DrawString(
            "←/→ room   PgUp/PgDn ±10   G grid   Tab atlas   S save PNG   Esc quit",
            font, Brushes.Gainsboro, 6, h + 6);
    }

    private static void DrawMetatileGrid(Graphics g, int w, int h)
    {
        using var pen = new Pen(Color.FromArgb(90, 0, 255, 255));
        for (int x = 0; x <= w; x += 32 * Zoom) g.DrawLine(pen, x, 0, x, h);
        for (int y = 0; y <= h; y += 32 * Zoom) g.DrawLine(pen, 0, y, w, y);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) _current?.Dispose();
        base.Dispose(disposing);
    }
}
