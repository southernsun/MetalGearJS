using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace MetalGearSpriteMover
{
    public partial class MainWindow : Window
    {
        // The room PNGs are 512x384 = the game's 256x192 screen at 2x, so we draw
        // Snake (16x16 native sprites) at 2x too, keeping both at the same pixel scale.
        private const int Zoom = 2;
        private const double MoveSpeedPerSec = 120.0;   // canvas pixels per second
        private const double WalkFrameSeconds = 0.1;    // seconds per walk-frame swap (6 ticks @ 60Hz)

        // Fallback canvas size when no room images are available.
        private const int FallbackWidth = 512, FallbackHeight = 384;

        // The game's walk loop alternates only frames 1 and 2; frame 0 is the standing
        // pose, shown when idle but never inside the walk cycle. (SetSprWalk in
        // Banks0123.asm increments PlayerFrameNum and resets it to 1 — not 0 — at 3,
        // so it runs 1,2,1,2,…) Reintroducing frame 0 here made Snake stutter mid-step.
        private static readonly int[] WalkCycle = { 1, 2 };

        // ----- Animation modes -----
        // Sprite ids index idxSnakeSpr (data/playersprite.asm). WalkLoop modes have a
        // standing frame (base) plus two walk frames (base+1, base+2) per direction;
        // Pose modes show one frame per direction; Loop modes cycle a fixed sequence
        // (no direction). Ids/sequences match how the game drives each one.
        private enum ModeKind { WalkLoop, Pose, Loop }

        private sealed class AnimMode
        {
            public string Name = "";
            public ModeKind Kind;
            public int[] DirBase = Array.Empty<int>();  // [Down, Up, Left, Right]
            public int[] Frames = Array.Empty<int>();   // Loop sequence
            public double FrameSeconds = 0.18;          // Loop speed
        }

        // DirBase arrays follow the Direction enum order: Down, Up, Left, Right.
        private static readonly AnimMode[] Modes =
        {
            new() { Name = "Walk",       Kind = ModeKind.WalkLoop, DirBase = new[] { 3, 0, 6, 9 } },
            new() { Name = "Armed walk", Kind = ModeKind.WalkLoop, DirBase = new[] { 15, 12, 18, 21 } },
            new() { Name = "Swim",       Kind = ModeKind.Pose,     DirBase = new[] { 29, 28, 30, 31 } },
            new() { Name = "Punch",      Kind = ModeKind.Pose,     DirBase = new[] { 25, 24, 26, 27 } },
            new() { Name = "Climb",      Kind = ModeKind.Loop,     Frames = new[] { 39, 40 },          FrameSeconds = 0.15 },
            new() { Name = "Box",        Kind = ModeKind.Loop,     Frames = new[] { 42, 44 },          FrameSeconds = 0.30 },
            new() { Name = "Dying",      Kind = ModeKind.Loop,     Frames = new[] { 41, 0, 3, 6, 9, 43 }, FrameSeconds = 0.18 },
        };

        private SnakeSprites _sprites = null!;
        private Color[] _palette = Array.Empty<Color>();
        private readonly Dictionary<int, BitmapSource> _bitmaps = new(); // sprite id -> bitmap
        private readonly HashSet<Key> _keysDown = new();

        private string? _roomImageFolder;
        private int _roomCount;
        private int _room;

        private int _modeIndex;
        private Direction _facing = Direction.Down;
        private double _x = 240, _y = 160;
        private TimeSpan _lastRender = TimeSpan.Zero;  // for delta-time movement
        private double _walkTimer;                     // seconds accumulated in walk cycle
        private int _walkIndex;
        private double _loopTimer;                     // seconds accumulated in a Loop mode
        private int _loopIndex;
        private bool _moving;                          // showing a walk frame vs. standing

        public MainWindow()
        {
            InitializeComponent();
            Loaded += OnLoaded;
            KeyDown += OnKeyDown;
            KeyUp += (_, e) => _keysDown.Remove(e.Key);
        }

        private void OnLoaded(object sender, RoutedEventArgs e)
        {
            try
            {
                _sprites = SnakeSprites.Load(
                    LocateRepoFile("gfx", "sprites.asm"),
                    LocateRepoFile("data", "playersprite.asm"));
            }
            catch (Exception ex)
            {
                txtStatus.Text = "Error loading sprites: " + ex.Message;
                return;
            }

            // Snake's palette is fixed (recovered from examples/22527.png), so all the
            // sprites every mode needs are composited once up front.
            _palette = SnakePalette.SnakeColors();
            PrecomputeBitmaps();

            LocateRoomImages();
            LoadRoom(_room);

            if (Environment.GetCommandLineArgs().Contains("--export"))
            {
                ExportFrames();
                Close();
                return;
            }

            UpdateSprite();
            Focus();
            // Drive movement/animation off the compositor's frame tick (smooth, unlike
            // a Background-priority DispatcherTimer) and advance by real elapsed time.
            CompositionTarget.Rendering += OnRendering;
        }

        // Composite every sprite id any mode can show, once.
        private void PrecomputeBitmaps()
        {
            void Add(int id)
            {
                if (_bitmaps.ContainsKey(id) || !_sprites.CanRender(id))
                    return;
                _bitmaps[id] = _sprites.Render(id, _palette);
            }

            foreach (var m in Modes)
            {
                if (m.Kind == ModeKind.Loop)
                {
                    foreach (int id in m.Frames) Add(id);
                }
                else
                {
                    foreach (int b in m.DirBase)
                    {
                        Add(b);
                        if (m.Kind == ModeKind.WalkLoop) { Add(b + 1); Add(b + 2); }
                    }
                }
            }
        }

        private void OnKeyDown(object sender, KeyEventArgs e)
        {
            // One-shot actions (not the held-key set used for movement).
            switch (e.Key)
            {
                case Key.OemCloseBrackets:
                case Key.PageUp:
                    ChangeRoom(+1); return;
                case Key.OemOpenBrackets:
                case Key.PageDown:
                    ChangeRoom(-1); return;
                case Key.Tab:
                    CycleMode(+1); e.Handled = true; return; // don't let Tab move focus
            }

            // Number keys 1..N jump straight to a mode.
            if (e.Key >= Key.D1 && e.Key <= Key.D9)
            {
                int i = e.Key - Key.D1;
                if (i < Modes.Length) SetMode(i);
                return;
            }

            _keysDown.Add(e.Key);
        }

        private void CycleMode(int delta) => SetMode((_modeIndex + delta + Modes.Length) % Modes.Length);

        private void SetMode(int index)
        {
            _modeIndex = index;
            _walkIndex = _loopIndex = 0;
            _walkTimer = _loopTimer = 0;
            UpdateSprite();
            UpdateStatus();
        }

        private void ChangeRoom(int delta)
        {
            if (_roomCount == 0) return;
            _room = ((_room + delta) % _roomCount + _roomCount) % _roomCount;
            LoadRoom(_room);
        }

        private void OnRendering(object? sender, EventArgs e)
        {
            // Elapsed real time since the last frame, so speed is independent of the
            // monitor's refresh rate.
            var now = ((RenderingEventArgs)e).RenderingTime;
            double dt = _lastRender == TimeSpan.Zero ? 0 : (now - _lastRender).TotalSeconds;
            _lastRender = now;
            if (dt <= 0) return;
            if (dt > 0.1) dt = 0.1; // clamp after a stall so Snake doesn't teleport

            double dirX = 0, dirY = 0;
            if (IsDown(Key.Left, Key.A))  { dirX -= 1; _facing = Direction.Left; }
            if (IsDown(Key.Right, Key.D)) { dirX += 1; _facing = Direction.Right; }
            if (IsDown(Key.Up, Key.W))    { dirY -= 1; _facing = Direction.Up; }
            if (IsDown(Key.Down, Key.S))  { dirY += 1; _facing = Direction.Down; }

            _moving = dirX != 0 || dirY != 0;
            if (_moving)
            {
                // Normalise so diagonal isn't faster than cardinal movement.
                double len = Math.Sqrt(dirX * dirX + dirY * dirY);
                double step = MoveSpeedPerSec * dt;
                _x += dirX / len * step;
                _y += dirY / len * step;
                ClampToCanvas();
                Canvas.SetLeft(imgSnake, _x);
                Canvas.SetTop(imgSnake, _y);

                _walkTimer += dt;
                if (_walkTimer >= WalkFrameSeconds)
                {
                    _walkTimer -= WalkFrameSeconds;
                    _walkIndex = (_walkIndex + 1) % WalkCycle.Length;
                }
            }
            else
            {
                // Idle: reset so the next walk starts cleanly at WalkCycle[0].
                _walkIndex = 0;
                _walkTimer = 0;
            }

            // Loop modes (climb / box / dying) animate continuously, moving or not.
            var mode = Modes[_modeIndex];
            if (mode.Kind == ModeKind.Loop)
            {
                _loopTimer += dt;
                if (_loopTimer >= mode.FrameSeconds)
                {
                    _loopTimer -= mode.FrameSeconds;
                    _loopIndex = (_loopIndex + 1) % mode.Frames.Length;
                }
            }

            UpdateSprite();
        }

        private void UpdateSprite()
        {
            if (_bitmaps.Count == 0) return;
            var mode = Modes[_modeIndex];

            int id = mode.Kind switch
            {
                ModeKind.WalkLoop => mode.DirBase[(int)_facing] + (_moving ? WalkCycle[_walkIndex] : 0),
                ModeKind.Pose     => mode.DirBase[(int)_facing],
                _                 => mode.Frames[_loopIndex % mode.Frames.Length],
            };

            if (!_bitmaps.TryGetValue(id, out var bmp))
                return;

            imgSnake.Source = bmp;
            imgSnake.Width = bmp.PixelWidth * Zoom;
            imgSnake.Height = bmp.PixelHeight * Zoom;
            Canvas.SetLeft(imgSnake, _x);
            Canvas.SetTop(imgSnake, _y);
        }

        private bool IsDown(params Key[] keys)
        {
            foreach (var k in keys)
                if (_keysDown.Contains(k)) return true;
            return false;
        }

        private void ClampToCanvas()
        {
            double maxX = Math.Max(0, canvas.Width - imgSnake.Width);
            double maxY = Math.Max(0, canvas.Height - imgSnake.Height);
            _x = Math.Clamp(_x, 0, maxX);
            _y = Math.Clamp(_y, 0, maxY);
        }

        private void UpdateStatus()
        {
            string room = _roomImageFolder != null ? $"Room {_room}/{_roomCount - 1}" : "no room images";
            txtStatus.Text = $"{room}  |  Mode: {Modes[_modeIndex].Name}  |  " +
                             "Arrows/WASD move, Tab or 1-7 change animation, [ ] change room.";
        }

        // ----- Room background -----

        private void LocateRoomImages()
        {
            try
            {
                _roomImageFolder = LocateRepoDir("room_images");
                _roomCount = Directory.GetFiles(_roomImageFolder, "MGEAR1_*.png").Length;
            }
            catch
            {
                _roomImageFolder = null;
                _roomCount = 0;
            }
        }

        private void LoadRoom(int room)
        {
            if (_roomImageFolder == null)
            {
                // No room images found: keep the plain green canvas.
                canvas.Width = FallbackWidth;
                canvas.Height = FallbackHeight;
                ClampSnakeIntoView();
                UpdateStatus();
                return;
            }

            string path = Path.Combine(_roomImageFolder, $"MGEAR1_{room:0000}.png");
            if (!File.Exists(path))
                return;

            var bmp = new BitmapImage();
            bmp.BeginInit();
            bmp.CacheOption = BitmapCacheOption.OnLoad; // load now so the file isn't locked
            bmp.UriSource = new Uri(path);
            bmp.EndInit();
            bmp.Freeze();

            imgBg.Source = bmp;
            imgBg.Width = bmp.PixelWidth;
            imgBg.Height = bmp.PixelHeight;
            canvas.Width = bmp.PixelWidth;
            canvas.Height = bmp.PixelHeight;

            ClampSnakeIntoView();
            UpdateStatus();
        }

        private void ClampSnakeIntoView()
        {
            ClampToCanvas();
            Canvas.SetLeft(imgSnake, _x);
            Canvas.SetTop(imgSnake, _y);
        }

        // Dump every precomputed sprite (all animation modes) in a grid to _export.png
        // next to the executable, for inspection. Run the app with --export.
        private void ExportFrames()
        {
            const int scale = 6, gap = 6, cols = 8, cellW = 16 * scale, cellH = 32 * scale;
            var ids = _bitmaps.Keys.OrderBy(i => i).ToList();
            int rows = (ids.Count + cols - 1) / cols;
            int w = cols * cellW + (cols + 1) * gap, h = rows * cellH + (rows + 1) * gap;

            var dv = new DrawingVisual();
            RenderOptions.SetBitmapScalingMode(dv, BitmapScalingMode.NearestNeighbor);
            using (var dc = dv.RenderOpen())
            {
                dc.DrawRectangle(Brushes.Magenta, null, new Rect(0, 0, w, h));
                for (int i = 0; i < ids.Count; i++)
                {
                    var bmp = _bitmaps[ids[i]];
                    double x = gap + (i % cols) * (cellW + gap);
                    double y = gap + (i / cols) * (cellH + gap);
                    dc.DrawImage(bmp, new Rect(x, y, bmp.PixelWidth * scale, bmp.PixelHeight * scale));
                }
            }
            var rtb = new RenderTargetBitmap(w, h, 96, 96, PixelFormats.Pbgra32);
            rtb.Render(dv);
            var enc = new PngBitmapEncoder();
            enc.Frames.Add(BitmapFrame.Create(rtb));
            using var fs = File.Create(Path.Combine(AppContext.BaseDirectory, "_export.png"));
            enc.Save(fs);
        }

        // ----- File location: the disassembly sources now live in the sibling ../MetalGear repo -----

        private static string LocateRepoFile(params string[] relativeParts)
            => RomPaths.RomFile(relativeParts);

        private static string LocateRepoDir(string name)
            => RomPaths.RomSubdir(name);
    }
}
