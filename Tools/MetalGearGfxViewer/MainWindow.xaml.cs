using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.IO;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Microsoft.Win32;

namespace MetalGearGfxViewer
{
    public class GfxFileInfo
    {
        public string Name { get; set; } = "";
        public string FullPath { get; set; } = "";
    }

    public class PaletteColorInfo
    {
        public int Index { get; set; }
        public Color Color { get; set; }
        public SolidColorBrush Brush => new SolidColorBrush(Color);
        public string ToolTip => $"Color {Index}: R={Color.R}, G={Color.G}, B={Color.B}";
    }

    public partial class MainWindow : Window
    {
        private ObservableCollection<GfxFileInfo> _files = new();
        private ObservableCollection<GfxSegment> _segments = new();
        private ObservableCollection<PaletteColorInfo> _paletteColors = new();
        private IReadOnlyList<PalettePreset> _palettePresets = System.Array.Empty<PalettePreset>();
        private Color[] _currentPalette;
        private byte[]? _currentData;
        private string? _currentFile;

        // The auto-detected spec for the selected graphic (null => manual mode).
        private GfxSpec? _activeSpec;

        // Room -> tileset/palette table (loaded from the data folder when available).
        private List<RoomInfo> _rooms = new();

        public MainWindow()
        {
            InitializeComponent();

            lstFiles.ItemsSource = _files;
            lstLabels.ItemsSource = _segments;
            palettePanel.ItemsSource = _paletteColors;

            // Populate the color-set dropdowns with the tables extracted from the game.
            cmbColorSet.ItemsSource = GameColorSets.All;
            cmbColorSet.SelectedIndex = 0;
            cmbColorB.ItemsSource = GameColorSets.All;
            SelectColorBByName("Sprite fg 10 (Snake)");

            // Populate the palette presets (BIOS default, the game's room/sprite
            // palettes, and an editable Custom entry).
            _palettePresets = GamePalettes.BuildAll();
            cmbPalettePreset.ItemsSource = _palettePresets;

            // Initialize with default MSX2 palette
            _currentPalette = (Color[])Msx2Palette.DefaultPalette.Clone();
            cmbPalettePreset.SelectedIndex = 0;
            UpdatePaletteDisplay();

            // Try to auto-load gfx folder from parent directories
            TryAutoLoadGfxFolder();
        }

        private void TryAutoLoadGfxFolder()
        {
            // The disassembly's gfx/ folder now lives in the sibling repo southernsun/MetalGear
            // (../MetalGear) or wherever MG_ROM_DIR points; RomPaths finds it. If it can't be
            // found, the user can still pick a folder with the "Open GFX Folder" button.
            var gfx = RomPaths.TryFindGfxFolder();
            if (gfx != null)
                LoadGfxFolder(gfx);
        }

        private static string? FindSiblingFolder(string name)
        {
            // The examples folder sits at the repo root alongside the gfx folder, so
            // probe the same set of relative locations used to auto-load gfx.
            var searchPaths = new[]
            {
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", "..", "..", "..", name),
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", "..", name),
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", name),
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, name),
                Path.Combine(Environment.CurrentDirectory, name),
                Path.Combine(Environment.CurrentDirectory, "..", name),
                Path.Combine(Environment.CurrentDirectory, "..", "..", name),
            };

            foreach (var path in searchPaths)
            {
                if (Directory.Exists(path))
                    return Path.GetFullPath(path);
            }
            return null;
        }

        private void BtnReference_Click(object sender, RoutedEventArgs e)
        {
            var examples = FindSiblingFolder("examples");
            if (examples == null)
            {
                MessageBox.Show(
                    "Could not find the 'examples' folder (expected at the repository root).",
                    "Reference Sheets", MessageBoxButton.OK, MessageBoxImage.Information);
                return;
            }

            var window = new ReferenceWindow(examples) { Owner = this };
            window.Show();
        }

        private void BtnOpenFolder_Click(object sender, RoutedEventArgs e)
        {
            var dialog = new OpenFolderDialog
            {
                Title = "Select GFX Folder"
            };

            if (dialog.ShowDialog() == true)
            {
                LoadGfxFolder(dialog.FolderName);
            }
        }

        private void LoadGfxFolder(string folderPath)
        {
            _files.Clear();

            if (!Directory.Exists(folderPath))
            {
                MessageBox.Show($"Folder not found: {folderPath}", "Error",
                    MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }

            _segments.Clear();
            _activeSpec = null;

            // Load all .asm files from the gfx folder
            var asmFiles = Directory.GetFiles(folderPath, "*.asm");

            foreach (var file in asmFiles)
            {
                _files.Add(new GfxFileInfo
                {
                    Name = Path.GetFileName(file),
                    FullPath = file
                });
            }

            Title = $"Metal Gear MSX2 Graphics Viewer - {folderPath}";

            LoadRoomTable(folderPath);
        }

        private void LoadRoomTable(string gfxFolder)
        {
            // The data tables live in a sibling "data" folder next to "gfx".
            var dataFolder = Path.GetFullPath(Path.Combine(gfxFolder, "..", "data"));
            _rooms = RoomTable.Load(dataFolder);

            cmbRoom.ItemsSource = _rooms;
            cmbRoom.IsEnabled = _rooms.Count > 0;
            cmbRoom.SelectedIndex = -1;
        }

        private void LstFiles_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (lstFiles.SelectedItem is not GfxFileInfo fileInfo)
                return;

            _currentFile = fileInfo.FullPath;
            _segments.Clear();

            try
            {
                var segments = AsmGfxParser.ParseLabeledSegments(fileInfo.FullPath);

                // Fall back to the whole file as one segment if no labels were found.
                if (segments.Count == 0)
                {
                    var all = AsmGfxParser.ParseFile(fileInfo.FullPath);
                    if (all.Length > 0)
                        segments.Add(new GfxSegment { Label = fileInfo.Name, Data = all });
                }

                foreach (var s in segments)
                    _segments.Add(s);

                if (_segments.Count > 0)
                    lstLabels.SelectedIndex = 0; // triggers LstLabels_SelectionChanged
                else
                    MessageBox.Show("No graphics data found in file.", "Warning",
                        MessageBoxButton.OK, MessageBoxImage.Warning);
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error loading file: {ex.Message}", "Error",
                    MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void CmbRoom_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (cmbRoom.SelectedItem is not RoomInfo room)
                return;

            // Select the room's tileset graphics file (this populates the label list
            // and auto-configures the first graphic), then override the palette with
            // the room's actual palette.
            var file = _files.FirstOrDefault(f =>
                string.Equals(f.Name, room.GfxFile, StringComparison.OrdinalIgnoreCase));
            if (file != null)
            {
                if (!ReferenceEquals(lstFiles.SelectedItem, file))
                    lstFiles.SelectedItem = file; // fires LstFiles_SelectionChanged
                else if (lstLabels.SelectedIndex < 0 && _segments.Count > 0)
                    lstLabels.SelectedIndex = 0;
            }

            SelectPaletteByName($"Room {room.PaletteId}");
        }

        private void LstLabels_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (lstLabels.SelectedItem is not GfxSegment segment)
                return;

            _currentData = segment.Data;

            // Auto-configure from the catalog when we recognise the graphic.
            _activeSpec = GfxCatalog.Lookup(segment.Label, _currentFile ?? "");
            if (_activeSpec != null)
                ApplySpecToControls(_activeSpec);

            ConfigureControlLocks();
            RenderGraphics();
        }

        /// <summary>
        /// Reflect a known graphic's spec in the (now locked) controls, and select its
        /// default palette so the result matches the game. The palette stays editable
        /// because the same graphic appears under different room/sprite palettes.
        /// </summary>
        private void ApplySpecToControls(GfxSpec spec)
        {
            chkSpriteMode.IsChecked = spec.SpriteMode;
            cmbBitDepth.SelectedIndex = spec.Bpp; // index 1..4 == 1..4 bpp; 0 == Auto
            SelectTileWidthTiles(spec.TilesPerRow);
            SelectPaletteByName(spec.Palette);

            // Sprites have no inherent color: default to Snake's primary color (the
            // file starts with Snake) so they render coloured; the user can change it,
            // and Color B is used as the OR'd partner in composite mode.
            if (spec.SpriteMode)
                SelectColorSetByName("Sprite fg 7 (Snake)");
        }

        private void ConfigureControlLocks()
        {
            bool manual = _activeSpec == null;
            bool sprite = _activeSpec?.SpriteMode == true;

            // In auto mode the catalog drives these, so lock them. The colour selector
            // stays available for sprites (their colour is a per-instance choice), and
            // the palette selector is always available for trying room/sprite palettes.
            cmbBitDepth.IsEnabled = manual;
            cmbTileWidth.IsEnabled = manual;
            chkSpriteMode.IsEnabled = manual;
            cmbColorSet.IsEnabled = manual || sprite;

            // Composite multicolor view only applies to sprites.
            chkComposite.IsEnabled = manual || sprite;
            cmbColorB.IsEnabled = (manual || sprite) && chkComposite.IsChecked == true;
        }

        private void SelectColorSetByName(string name)
        {
            for (int i = 0; i < GameColorSets.All.Count; i++)
            {
                if (GameColorSets.All[i].Name == name)
                {
                    cmbColorSet.SelectedIndex = i;
                    return;
                }
            }
        }

        private void SelectColorBByName(string name)
        {
            for (int i = 0; i < GameColorSets.All.Count; i++)
            {
                if (GameColorSets.All[i].Name == name)
                {
                    cmbColorB.SelectedIndex = i;
                    return;
                }
            }
        }

        private void ChkComposite_Changed(object sender, RoutedEventArgs e)
        {
            ConfigureControlLocks(); // enable/disable the Color B selector
            RenderGraphics();
        }

        private void CmbColorB_SelectionChanged(object sender, SelectionChangedEventArgs e) => RenderGraphics();

        private byte ColorBIndex() =>
            (cmbColorB.SelectedItem as GameColorSet)?.Foreground1bpp ?? 10;

        private bool IsSpriteActive() =>
            _activeSpec?.SpriteMode == true || (_activeSpec == null && chkSpriteMode.IsChecked == true);

        private void SelectTileWidthTiles(int tiles)
        {
            int px = tiles * 8;
            foreach (ComboBoxItem item in cmbTileWidth.Items)
            {
                if (int.TryParse(item.Content?.ToString(), out int w) && w == px)
                {
                    cmbTileWidth.SelectedItem = item;
                    return;
                }
            }
        }

        private void SelectPaletteByName(string name)
        {
            for (int i = 0; i < _palettePresets.Count; i++)
            {
                if (_palettePresets[i].Name == name)
                {
                    cmbPalettePreset.SelectedIndex = i;
                    return;
                }
            }
        }

        private void RenderGraphics()
        {
            if (_currentData == null || _currentData.Length == 0)
                return;

            try
            {
                var decoder = new GfxDecoder(_currentPalette);
                byte[] dataToRender = _currentData;

                // Pull the decode settings from the auto-detected spec when we have one,
                // otherwise from the manual toolbar controls.
                bool spriteMode;
                bool compressed;
                int bitDepth;
                byte[]? lookup;
                byte foreground;

                if (_activeSpec != null)
                {
                    spriteMode = _activeSpec.SpriteMode;
                    compressed = _activeSpec.Compressed;
                    bitDepth = _activeSpec.Bpp;
                    lookup = _activeSpec.ColorLookup;
                    // A sprite pattern is monochrome; its color is a per-instance choice,
                    // so take it from the (still-enabled) color selector for sprites.
                    foreground = _activeSpec.SpriteMode
                        ? SelectedColorSet().Foreground1bpp
                        : _activeSpec.Foreground1bpp;
                }
                else
                {
                    spriteMode = chkSpriteMode.IsChecked == true;
                    compressed = spriteMode; // manual sprite mode implies the RLE stream
                    bitDepth = GetSelectedBitDepth();
                    GameColorSet colorSet = SelectedColorSet();
                    lookup = colorSet.Lookup;
                    foreground = colorSet.Foreground1bpp;
                }

                string statusInfo;
                if (compressed)
                {
                    dataToRender = spriteMode
                        ? SpriteDecoder.DecompressAll(_currentData)
                        : SpriteDecoder.DecompressRLE(_currentData);
                    statusInfo = $"{_currentData.Length} bytes compressed -> {dataToRender.Length} decompressed";
                }
                else
                {
                    statusInfo = $"Raw data: {_currentData.Length} bytes";
                }

                // Composite multicolor view: combine sprite pairs the way the game does.
                if (spriteMode && chkComposite.IsChecked == true)
                {
                    RenderCompositeSprites(dataToRender, foreground, ColorBIndex(), statusInfo);
                    return;
                }

                if (bitDepth == 0) // Auto (manual mode only)
                {
                    bitDepth = spriteMode
                        ? 1
                        : AsmGfxParser.DetectBitDepth(_currentFile ?? "", dataToRender);
                }

                byte[] pixels;
                int bytesPerTile;

                switch (bitDepth)
                {
                    case 1:
                        pixels = decoder.Decode1bpp(dataToRender, foreground);
                        bytesPerTile = 8;
                        break;
                    case 2:
                        pixels = decoder.Decode2bpp(dataToRender, lookup);
                        bytesPerTile = 16;
                        break;
                    case 4:
                        pixels = decoder.Decode4bpp(dataToRender);
                        bytesPerTile = 32;
                        break;
                    case 3:
                    default:
                        pixels = decoder.Decode3bpp(dataToRender, lookup);
                        bytesPerTile = 24;
                        break;
                }

                int numTiles = dataToRender.Length / bytesPerTile;
                if (numTiles == 0)
                {
                    numTiles = 1;
                }

                // Calculate the layout. In sprite mode each MSX2 hardware sprite is
                // 16x16, stored as four 8x8 patterns in column-major quadrant order
                // (top-left, bottom-left, top-right, bottom-right), so we group every
                // 4 tiles into one 16x16 block. Otherwise we lay out a plain 8x8 grid.
                int tilesPerRow = _activeSpec != null ? _activeSpec.TilesPerRow : GetSelectedTileWidth();
                int imageWidth, imageHeight;
                int spritesPerRow = 0;

                if (spriteMode)
                {
                    spritesPerRow = System.Math.Max(1, tilesPerRow / 2); // 2 tiles wide per sprite
                    int numSprites = (numTiles + 3) / 4;
                    int spriteRows = (numSprites + spritesPerRow - 1) / spritesPerRow;
                    imageWidth = spritesPerRow * 16;
                    imageHeight = spriteRows * 16;
                }
                else
                {
                    int rows = (numTiles + tilesPerRow - 1) / tilesPerRow;
                    imageWidth = tilesPerRow * 8;
                    imageHeight = rows * 8;
                }

                // Ensure we have valid dimensions
                if (imageWidth <= 0 || imageHeight <= 0)
                    return;

                // Update status
                string layoutInfo = spriteMode
                    ? $"{(numTiles + 3) / 4} sprites (16x16)"
                    : $"{numTiles} tiles";
                string mode = _activeSpec != null
                    ? $"AUTO: {_activeSpec.Note}"
                    : "MANUAL (unrecognised — adjust controls)";
                txtStatus.Text = $"{mode} | {statusInfo} | {bitDepth}bpp | {layoutInfo} ({imageWidth}x{imageHeight} pixels)";

                // Create the bitmap
                var bitmap = new WriteableBitmap(imageWidth, imageHeight, 96, 96,
                    PixelFormats.Bgra32, null);

                // Arrange tiles in a grid
                bitmap.Lock();
                unsafe
                {
                    byte* backBuffer = (byte*)bitmap.BackBuffer;
                    int stride = bitmap.BackBufferStride;

                    // Clear to black
                    for (int y = 0; y < imageHeight; y++)
                    {
                        for (int x = 0; x < imageWidth; x++)
                        {
                            int offset = y * stride + x * 4;
                            backBuffer[offset + 0] = 0; // B
                            backBuffer[offset + 1] = 0; // G
                            backBuffer[offset + 2] = 0; // R
                            backBuffer[offset + 3] = 255; // A
                        }
                    }

                    // Copy tiles
                    int pixelIdx = 0;
                    for (int tile = 0; tile < numTiles && pixelIdx < pixels.Length; tile++)
                    {
                        int tileX, tileY;
                        if (spriteMode)
                        {
                            int sprite = tile / 4;
                            int quad = tile % 4;                 // 0=TL, 1=BL, 2=TR, 3=BR
                            int spriteX = (sprite % spritesPerRow) * 16;
                            int spriteY = (sprite / spritesPerRow) * 16;
                            tileX = spriteX + (quad >= 2 ? 8 : 0);
                            tileY = spriteY + (quad % 2 == 1 ? 8 : 0);
                        }
                        else
                        {
                            tileX = (tile % tilesPerRow) * 8;
                            tileY = (tile / tilesPerRow) * 8;
                        }

                        for (int py = 0; py < 8 && pixelIdx < pixels.Length; py++)
                        {
                            for (int px = 0; px < 8 && pixelIdx < pixels.Length; px++)
                            {
                                int destX = tileX + px;
                                int destY = tileY + py;

                                if (destX < imageWidth && destY < imageHeight)
                                {
                                    int offset = destY * stride + destX * 4;
                                    backBuffer[offset + 0] = pixels[pixelIdx + 0]; // B
                                    backBuffer[offset + 1] = pixels[pixelIdx + 1]; // G
                                    backBuffer[offset + 2] = pixels[pixelIdx + 2]; // R
                                    backBuffer[offset + 3] = pixels[pixelIdx + 3]; // A
                                }
                                pixelIdx += 4;
                            }
                        }
                    }
                }
                bitmap.AddDirtyRect(new Int32Rect(0, 0, imageWidth, imageHeight));
                bitmap.Unlock();

                // Apply zoom
                int zoom = GetSelectedZoom();
                imgGraphics.Source = bitmap;
                imgGraphics.Width = imageWidth * zoom;
                imgGraphics.Height = imageHeight * zoom;
            }
            catch (Exception ex)
            {
                txtStatus.Text = $"Error: {ex.Message}";
            }
        }

        /// <summary>
        /// Read one pixel from a 16x16 sprite pattern stored as four 8x8 quadrants
        /// (TL, BL, TR, BR — the MSX2 layout).
        /// </summary>
        private static bool SpritePixel(byte[] data, int spriteBase, int x, int y)
        {
            int quad = (x >= 8 ? 2 : 0) + (y >= 8 ? 1 : 0);
            int idx = spriteBase + quad * 8 + (y & 7);
            if (idx < 0 || idx >= data.Length)
                return false;
            return ((data[idx] >> (7 - (x & 7))) & 1) != 0;
        }

        /// <summary>
        /// Render decompressed sprite patterns the way the game composites them: each
        /// consecutive pair of 16x16 sprites is overlaid, the second OR-combined with
        /// the first (the CC bit), giving three colors per pair — colorA, colorB and
        /// colorA|colorB.
        /// </summary>
        private void RenderCompositeSprites(byte[] data, int colorA, int colorB, string statusInfo)
        {
            const int spriteBytes = 32; // 16x16, 1bpp
            int numSprites = data.Length / spriteBytes;
            if (numSprites == 0)
                return;

            int numPairs = (numSprites + 1) / 2;
            int tilesPerRow = _activeSpec != null ? _activeSpec.TilesPerRow : GetSelectedTileWidth();
            int perRow = System.Math.Max(1, tilesPerRow / 2);
            int rows = (numPairs + perRow - 1) / perRow;
            int imageWidth = perRow * 16;
            int imageHeight = rows * 16;
            if (imageWidth <= 0 || imageHeight <= 0)
                return;

            Color cA = _currentPalette[colorA & 15];
            Color cB = _currentPalette[colorB & 15];
            Color cAB = _currentPalette[(colorA | colorB) & 15];
            Color bg = _currentPalette[0];

            var bitmap = new WriteableBitmap(imageWidth, imageHeight, 96, 96, PixelFormats.Bgra32, null);
            bitmap.Lock();
            unsafe
            {
                byte* buf = (byte*)bitmap.BackBuffer;
                int stride = bitmap.BackBufferStride;

                void Put(int px, int py, Color c)
                {
                    int o = py * stride + px * 4;
                    buf[o + 0] = c.B;
                    buf[o + 1] = c.G;
                    buf[o + 2] = c.R;
                    buf[o + 3] = 255;
                }

                for (int y = 0; y < imageHeight; y++)
                    for (int x = 0; x < imageWidth; x++)
                        Put(x, y, bg);

                for (int pair = 0; pair < numPairs; pair++)
                {
                    int baseA = (pair * 2) * spriteBytes;
                    int baseB = baseA + spriteBytes;
                    bool hasB = (pair * 2 + 1) < numSprites;

                    int ox = (pair % perRow) * 16;
                    int oy = (pair / perRow) * 16;

                    for (int y = 0; y < 16; y++)
                    {
                        for (int x = 0; x < 16; x++)
                        {
                            bool a = SpritePixel(data, baseA, x, y);
                            bool b = hasB && SpritePixel(data, baseB, x, y);
                            if (!a && !b)
                                continue; // leave background
                            Color c = (a && b) ? cAB : (a ? cA : cB);
                            Put(ox + x, oy + y, c);
                        }
                    }
                }
            }
            bitmap.AddDirtyRect(new Int32Rect(0, 0, imageWidth, imageHeight));
            bitmap.Unlock();

            int zoom = GetSelectedZoom();
            imgGraphics.Source = bitmap;
            imgGraphics.Width = imageWidth * zoom;
            imgGraphics.Height = imageHeight * zoom;

            string mode = _activeSpec != null ? $"AUTO: {_activeSpec.Note}" : "MANUAL";
            txtStatus.Text = $"{mode} | {statusInfo} | composite | {numPairs} multicolor sprites " +
                             $"(colors {colorA}/{colorB}/{colorA | colorB}) ({imageWidth}x{imageHeight} pixels)";
        }

        private int GetSelectedZoom()
        {
            return (cmbZoom.SelectedIndex) switch
            {
                0 => 1,
                1 => 2,
                2 => 4,
                3 => 8,
                4 => 16,
                _ => 4
            };
        }

        private int GetSelectedBitDepth()
        {
            return (cmbBitDepth.SelectedIndex) switch
            {
                0 => 0, // Auto
                1 => 1,
                2 => 2,
                3 => 3,
                4 => 4,
                _ => 0
            };
        }

        private int GetSelectedTileWidth()
        {
            var item = cmbTileWidth.SelectedItem as ComboBoxItem;
            if (item != null && int.TryParse(item.Content?.ToString(), out int width))
                return width / 8; // Convert pixels to tiles

            return 2; // Default 16 pixels = 2 tiles
        }

        private void CmbZoom_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            RenderGraphics();
        }

        private void CmbBitDepth_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            RenderGraphics();
        }

        private void CmbTileWidth_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            RenderGraphics();
        }

        private void ChkSpriteMode_Changed(object sender, RoutedEventArgs e)
        {
            ConfigureControlLocks(); // sprite-only controls (composite) follow this

            // When turning sprite mode on, widen a narrow layout so the patterns
            // tile into a proper sprite sheet instead of a single column. Only
            // override small defaults so a deliberately wide choice is respected.
            if (chkSpriteMode.IsChecked == true && cmbTileWidth.SelectedIndex <= 3)
            {
                // Index 6 = "256" px wide => 16 sprites per row.
                // This triggers CmbTileWidth_SelectionChanged, which re-renders.
                cmbTileWidth.SelectedIndex = 6;
                return;
            }

            RenderGraphics();
        }

        private void CmbColorSet_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            RenderGraphics();
        }

        private GameColorSet SelectedColorSet()
        {
            return cmbColorSet.SelectedItem as GameColorSet ?? GameColorSets.All[0];
        }

        private void UpdatePaletteDisplay()
        {
            _paletteColors.Clear();
            for (int i = 0; i < 16; i++)
            {
                _paletteColors.Add(new PaletteColorInfo
                {
                    Index = i,
                    Color = _currentPalette[i]
                });
            }
        }

        private void PaletteColor_Click(object sender, MouseButtonEventArgs e)
        {
            if (sender is Border border && border.DataContext is PaletteColorInfo colorInfo)
            {
                // Simple color picker using system dialog
                var dialog = new System.Windows.Forms.ColorDialog
                {
                    Color = System.Drawing.Color.FromArgb(
                        colorInfo.Color.R,
                        colorInfo.Color.G,
                        colorInfo.Color.B)
                };

                if (dialog.ShowDialog() == System.Windows.Forms.DialogResult.OK)
                {
                    _currentPalette[colorInfo.Index] = Color.FromRgb(
                        dialog.Color.R,
                        dialog.Color.G,
                        dialog.Color.B);

                    // Switch the dropdown to the editable "Custom" entry without
                    // wiping the edit (the handler keeps the current palette for it).
                    SelectCustomPreset();
                    UpdatePaletteDisplay();
                    RenderGraphics();
                }
            }
        }

        private void CmbPalettePreset_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (cmbPalettePreset.SelectedItem is not PalettePreset preset)
                return;

            // The Custom entry keeps whatever colors are currently set (possibly
            // hand-edited); every other preset replaces the palette.
            if (preset.IsCustom)
                return;

            _currentPalette = (Color[])preset.Colors.Clone();
            UpdatePaletteDisplay();
            RenderGraphics();
        }

        private void SelectCustomPreset()
        {
            for (int i = 0; i < _palettePresets.Count; i++)
            {
                if (_palettePresets[i].IsCustom)
                {
                    cmbPalettePreset.SelectedIndex = i;
                    return;
                }
            }
        }
    }
}
