using NAudio.Wave;

namespace ThemeOfTaraPlayer;

/// <summary>
/// Audio player using a custom WaveProvider for smooth, on-demand sample generation.
/// This approach eliminates buffer underruns and timing issues.
/// </summary>
public class AudioPlayer : IDisposable
{
    private readonly WaveOutEvent _waveOut;
    private readonly PsgWaveProvider _waveProvider;

    public event Action? PlaybackStarted;
    public event Action? PlaybackStopped;

    public bool IsPlaying => _waveProvider.IsPlaying;

    public AudioPlayer()
    {
        _waveProvider = new PsgWaveProvider();
        _waveProvider.PlaybackStopped += () => PlaybackStopped?.Invoke();

        _waveOut = new WaveOutEvent
        {
            DesiredLatency = 80,
            NumberOfBuffers = 3
        };
        _waveOut.Init(_waveProvider);

        // Start the device immediately and keep it running for the lifetime
        // of the app. The wave provider returns silence while no music is
        // loaded, so this costs nothing audible — but it means the audio
        // driver / WaveOut hardware FIFO have already warmed up by the time
        // the user clicks PLAY. Calling Play() on a cold device eats the
        // first ~100–500 ms of generated audio, which was making the song
        // appear to start partway through its first notes.
        _waveOut.Play();
    }

    public DebugSnapshot? GetDebugSnapshot() => _waveProvider.GetDebugSnapshot();

    public void PlayThemeOfTara() => Play(MusicCatalog.Songs[1]);

    public void Play(MusicCatalog.Song song)
    {
        _waveProvider.LoadSong(song);
        PlaybackStarted?.Invoke();
    }

    public void Stop()
    {
        // Leave the device running — just tell the wave provider to emit
        // silence. That way the next PLAY press has no warm-up delay.
        _waveProvider.Stop();
        PlaybackStopped?.Invoke();
    }

    public void Dispose()
    {
        _waveOut.Stop();
        _waveOut.Dispose();
    }
}

/// <summary>
/// Custom WaveProvider that generates PSG audio samples on-demand.
/// This is called by NAudio's audio thread, ensuring smooth playback.
/// </summary>
public class PsgWaveProvider : IWaveProvider
{
    private const int SampleRate = 44100;
    private const int FrameRate = 60;
    private const int SamplesPerFrame = SampleRate / FrameRate; // ~735 samples

    private readonly PsgEmulator _psg;
    private readonly MusicEngine _engine;
    private readonly object _lock = new();

    private int _sampleCounter;
    private bool _isPlaying;

    public event Action? PlaybackStopped;

    public WaveFormat WaveFormat { get; } = WaveFormat.CreateIeeeFloatWaveFormat(SampleRate, 1);

    public bool IsPlaying
    {
        get { lock (_lock) return _isPlaying; }
    }

    public PsgWaveProvider()
    {
        _psg = new PsgEmulator(SampleRate);
        _engine = new MusicEngine(_psg);
    }

    public DebugSnapshot? GetDebugSnapshot()
    {
        lock (_lock)
        {
            if (!_isPlaying) return null;
            return _engine.GetDebugSnapshot();
        }
    }

    public void LoadSong(MusicCatalog.Song song)
    {
        lock (_lock)
        {
            _engine.LoadMusic(MusicCatalog.Data, song.Channel1, song.Channel2, song.Channel3);
            _sampleCounter = 0;
            _isPlaying = true;
        }
    }

    public void Stop()
    {
        lock (_lock)
        {
            _isPlaying = false;
        }
    }

    public int Read(byte[] buffer, int offset, int count)
    {
        var floatBuffer = new float[count / 4];
        int samplesGenerated = 0;

        lock (_lock)
        {
            if (!_isPlaying)
            {
                // Output silence
                Array.Clear(buffer, offset, count);
                return count;
            }

            while (samplesGenerated < floatBuffer.Length)
            {
                // Check if we need to process a new frame
                if (_sampleCounter == 0)
                {
                    _engine.ProcessFrame();

                    if (!_engine.IsPlaying)
                    {
                        _isPlaying = false;
                        // Fill rest with silence
                        Array.Clear(buffer, offset + samplesGenerated * 4, (floatBuffer.Length - samplesGenerated) * 4);
                        System.Windows.Application.Current?.Dispatcher.BeginInvoke(() => PlaybackStopped?.Invoke());
                        return count;
                    }
                }

                // Generate samples until next frame or buffer full
                int samplesToGenerate = Math.Min(
                    SamplesPerFrame - _sampleCounter,
                    floatBuffer.Length - samplesGenerated
                );

                _psg.GenerateSamples(floatBuffer, samplesGenerated, samplesToGenerate);

                samplesGenerated += samplesToGenerate;
                _sampleCounter += samplesToGenerate;

                if (_sampleCounter >= SamplesPerFrame)
                {
                    _sampleCounter = 0;
                }
            }
        }

        // Convert float samples to bytes
        Buffer.BlockCopy(floatBuffer, 0, buffer, offset, count);
        return count;
    }
}
