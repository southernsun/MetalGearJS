using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace MetalGearGfxViewer
{
    /// <summary>
    /// A simple window that displays the spriters-resource reference sheets from the
    /// examples folder, so decoded graphics can be compared against known-good rips.
    /// Pan with the scrollbars, zoom with Ctrl + mouse wheel.
    /// </summary>
    public class ReferenceWindow : Window
    {
        private readonly ComboBox _files = new();
        private readonly Image _image = new();
        private double _zoom = 1.0;

        public ReferenceWindow(string examplesFolder)
        {
            Title = "Reference Sheets";
            Width = 900;
            Height = 650;
            Background = new SolidColorBrush(Color.FromRgb(0x1E, 0x1E, 0x1E));

            var root = new Grid();
            root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });

            // Top bar: sheet selector.
            var bar = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                Background = new SolidColorBrush(Color.FromRgb(0x2D, 0x2D, 0x30)),
            };
            bar.Children.Add(new TextBlock
            {
                Text = "Sheet:",
                Foreground = Brushes.White,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 6, 0),
            });
            _files.Width = 380;
            _files.Margin = new Thickness(0, 6, 8, 6);
            _files.SelectionChanged += (_, _) => ShowSelected();
            bar.Children.Add(_files);
            bar.Children.Add(new TextBlock
            {
                Text = "(Ctrl + wheel to zoom)",
                Foreground = Brushes.Gray,
                VerticalAlignment = VerticalAlignment.Center,
            });
            Grid.SetRow(bar, 0);
            root.Children.Add(bar);

            // Image area.
            RenderOptions.SetBitmapScalingMode(_image, BitmapScalingMode.NearestNeighbor);
            _image.HorizontalAlignment = HorizontalAlignment.Left;
            _image.VerticalAlignment = VerticalAlignment.Top;
            var scroller = new ScrollViewer
            {
                HorizontalScrollBarVisibility = ScrollBarVisibility.Auto,
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                Content = _image,
            };
            scroller.PreviewMouseWheel += OnWheel;
            Grid.SetRow(scroller, 1);
            root.Children.Add(scroller);

            Content = root;

            // Populate with the PNGs in the examples folder.
            if (Directory.Exists(examplesFolder))
            {
                foreach (var file in Directory.GetFiles(examplesFolder, "*.png"))
                    _files.Items.Add(new ReferenceFile(file));
            }
            if (_files.Items.Count > 0)
                _files.SelectedIndex = 0;
        }

        private void ShowSelected()
        {
            if (_files.SelectedItem is not ReferenceFile file)
                return;

            var bmp = new BitmapImage();
            bmp.BeginInit();
            bmp.CacheOption = BitmapCacheOption.OnLoad;
            bmp.UriSource = new System.Uri(file.FullPath);
            bmp.EndInit();

            _zoom = 1.0;
            _image.Source = bmp;
            _image.Width = bmp.PixelWidth;
            _image.Height = bmp.PixelHeight;
        }

        private void OnWheel(object sender, MouseWheelEventArgs e)
        {
            if (Keyboard.Modifiers != ModifierKeys.Control || _image.Source is not BitmapSource bmp)
                return;

            _zoom = System.Math.Clamp(_zoom * (e.Delta > 0 ? 1.25 : 0.8), 0.25, 16.0);
            _image.Width = bmp.PixelWidth * _zoom;
            _image.Height = bmp.PixelHeight * _zoom;
            e.Handled = true;
        }

        private class ReferenceFile
        {
            public string FullPath { get; }
            public string Name { get; }
            public ReferenceFile(string path)
            {
                FullPath = path;
                Name = Path.GetFileNameWithoutExtension(path);
            }
            public override string ToString() => Name;
        }
    }
}
