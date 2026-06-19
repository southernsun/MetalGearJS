using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;

namespace ThemeOfTaraPlayer;

public partial class MainWindow : Window
{
    private readonly AudioPlayer _audioPlayer;
    private readonly DispatcherTimer _debugTimer;

    // UI element arrays for easy access
    private TextBlock[] _modeTexts = null!;
    private TextBlock[] _noteTexts = null!;
    private TextBlock[] _octaveTexts = null!;
    private TextBlock[] _freqTexts = null!;
    private TextBlock[] _volTexts = null!;
    private TextBlock[] _instTexts = null!;
    private TextBlock[] _tempoTexts = null!;
    private TextBlock[] _cfgTexts = null!;
    private TextBlock[] _cmdTexts = null!;
    private TextBlock[] _flagsTexts = null!;

    public MainWindow()
    {
        InitializeComponent();

        // Initialize UI element arrays after InitializeComponent
        _modeTexts = new[] { Ch0Mode, Ch1Mode, Ch2Mode };
        _noteTexts = new[] { Ch0Note, Ch1Note, Ch2Note };
        _octaveTexts = new[] { Ch0Octave, Ch1Octave, Ch2Octave };
        _freqTexts = new[] { Ch0Freq, Ch1Freq, Ch2Freq };
        _volTexts = new[] { Ch0Vol, Ch1Vol, Ch2Vol };
        _instTexts = new[] { Ch0Inst, Ch1Inst, Ch2Inst };
        _tempoTexts = new[] { Ch0Tempo, Ch1Tempo, Ch2Tempo };
        _cfgTexts = new[] { Ch0Cfg, Ch1Cfg, Ch2Cfg };
        _cmdTexts = new[] { Ch0Cmd, Ch1Cmd, Ch2Cmd };
        _flagsTexts = new[] { Ch0Flags, Ch1Flags, Ch2Flags };

        _audioPlayer = new AudioPlayer();
        _audioPlayer.PlaybackStarted += OnPlaybackStarted;
        _audioPlayer.PlaybackStopped += OnPlaybackStopped;

        SongSelector.ItemsSource = MusicCatalog.Songs;
        // Default to the main "Theme of Tara" track (index 1) — the [0] entry
        // is the short intro fanfare.
        SongSelector.SelectedIndex = 1;

        // Setup debug timer (updates ~15 times per second)
        _debugTimer = new DispatcherTimer
        {
            Interval = TimeSpan.FromMilliseconds(67)
        };
        _debugTimer.Tick += DebugTimer_Tick;

        Closing += (_, _) =>
        {
            _debugTimer.Stop();
            _audioPlayer.Dispose();
        };
    }

    private void PlayButton_Click(object sender, RoutedEventArgs e)
    {
        if (SongSelector.SelectedItem is MusicCatalog.Song song)
            _audioPlayer.Play(song);
    }

    private void StopButton_Click(object sender, RoutedEventArgs e)
    {
        _audioPlayer.Stop();
    }

    private void SongSelector_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        // If a song is already playing and the user picks another one,
        // hot-swap to the new track rather than forcing them to press Stop
        // then Play. Matches how the original game switches tracks.
        if (_audioPlayer.IsPlaying && SongSelector.SelectedItem is MusicCatalog.Song song)
            _audioPlayer.Play(song);
    }

    private void OnPlaybackStarted()
    {
        Dispatcher.Invoke(() =>
        {
            PlayButton.IsEnabled = false;
            StopButton.IsEnabled = true;
            StatusText.Text = "Playing...";
            ClearDebugDisplay();
            _debugTimer.Start();
        });
    }

    private void OnPlaybackStopped()
    {
        Dispatcher.Invoke(() =>
        {
            PlayButton.IsEnabled = true;
            StopButton.IsEnabled = false;
            StatusText.Text = "Stopped";
            _debugTimer.Stop();
        });
    }

    private void DebugTimer_Tick(object? sender, EventArgs e)
    {
        var snapshot = _audioPlayer.GetDebugSnapshot();
        if (snapshot == null) return;

        UpdateDebugDisplay(snapshot);
    }

    private void UpdateDebugDisplay(DebugSnapshot snapshot)
    {
        FrameCountText.Text = $" - Frame: {snapshot.FrameCount}";
        MixerText.Text = $"  Mixer: 0x{snapshot.MixerValue:X2}";

        for (int i = 0; i < 3; i++)
        {
            var ch = snapshot.Channels[i];

            _modeTexts[i].Text = ch.GetModeString();
            _noteTexts[i].Text = ch.NoteName;
            _octaveTexts[i].Text = ch.Octave.ToString();
            _freqTexts[i].Text = $"0x{ch.Frequency:X3}";
            _volTexts[i].Text = ch.Volume.ToString();
            _instTexts[i].Text = ch.Instrument > 0 ? ch.Instrument.ToString() : "-";
            _tempoTexts[i].Text = ch.Tempo.ToString();
            _cfgTexts[i].Text = ch.GetConfigString();
            _cmdTexts[i].Text = ch.LastCommand.HasValue ? $"0x{ch.LastCommand.Value:X2}" : "-";

            // Build flags string
            var flags = new List<string>();
            if (ch.HasVibrato) flags.Add("VIB");
            if (ch.HasDetune) flags.Add("DET");
            _flagsTexts[i].Text = flags.Count > 0 ? string.Join(" ", flags) : "-";

            // Color code based on volume (brighter when louder)
            if (ch.Volume > 0 && ch.IsActive)
            {
                _volTexts[i].Foreground = new System.Windows.Media.SolidColorBrush(
                    System.Windows.Media.Color.FromRgb(
                        (byte)(100 + ch.Volume * 10),
                        (byte)(255),
                        (byte)(100 + ch.Volume * 10)
                    ));
            }
            else
            {
                _volTexts[i].Foreground = new System.Windows.Media.SolidColorBrush(
                    System.Windows.Media.Color.FromRgb(80, 80, 80));
            }
        }

        // Update note history for each channel
        NoteHistoryA.Text = string.Join(" ", snapshot.NoteHistory[0]);
        NoteHistoryB.Text = string.Join(" ", snapshot.NoteHistory[1]);
        NoteHistoryC.Text = string.Join(" ", snapshot.NoteHistory[2]);

        // Update log (show all entries)
        if (snapshot.RecentLog.Count > 0)
        {
            LogText.Text = string.Join("\n", snapshot.RecentLog);
        }
    }

    private void ClearDebugDisplay()
    {
        FrameCountText.Text = " - Frame: 0";
        MixerText.Text = "  Mixer: 0x00";

        for (int i = 0; i < 3; i++)
        {
            _modeTexts[i].Text = "-";
            _noteTexts[i].Text = "-";
            _octaveTexts[i].Text = "-";
            _freqTexts[i].Text = "-";
            _volTexts[i].Text = "-";
            _instTexts[i].Text = "-";
            _tempoTexts[i].Text = "-";
            _cfgTexts[i].Text = "-";
            _cmdTexts[i].Text = "-";
            _flagsTexts[i].Text = "-";
        }

        LogText.Text = "";
        NoteHistoryA.Text = "";
        NoteHistoryB.Text = "";
        NoteHistoryC.Text = "";
    }
}
