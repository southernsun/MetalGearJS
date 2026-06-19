namespace ThemeOfTaraPlayer;

/// <summary>
/// Debug information for a single channel
/// </summary>
public class ChannelDebugInfo
{
    public int ChannelNumber { get; set; }
    public bool IsActive { get; set; }
    public bool IsNoteMode { get; set; }
    public string NoteName { get; set; } = "-";
    public int Octave { get; set; }
    public int Frequency { get; set; }
    public int Volume { get; set; }
    public int Instrument { get; set; }
    public int NoteCounter { get; set; }
    public int Tempo { get; set; }
    public bool HasVibrato { get; set; }
    public bool HasDetune { get; set; }
    public int Config { get; set; }
    public int Pointer { get; set; }
    public byte? LastCommand { get; set; }

    private static readonly string[] NoteNames = { "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B" };

    public static string GetNoteName(int noteValue)
    {
        if (noteValue < 0 || noteValue >= 12)
            return "-";
        return NoteNames[noteValue];
    }

    public string GetModeString()
    {
        if (!IsActive) return "OFF";
        return IsNoteMode ? "NOTE" : "INST";
    }

    public string GetConfigString()
    {
        if (Config == 0) return "---";
        var parts = new List<string>();
        if ((Config & 0x02) != 0) parts.Add("T");  // Tone
        if ((Config & 0x01) != 0) parts.Add("N");  // Noise
        if ((Config & 0x08) != 0) parts.Add("E");  // Envelope
        return string.Join("", parts);
    }
}

/// <summary>
/// Complete debug state snapshot
/// </summary>
public class DebugSnapshot
{
    public ChannelDebugInfo[] Channels { get; } = new ChannelDebugInfo[3];
    public int FrameCount { get; set; }
    public int MixerValue { get; set; }
    public List<string> RecentLog { get; set; } = new();

    /// <summary>
    /// Note history for each channel (channel index -> list of note entries)
    /// </summary>
    public List<string>[] NoteHistory { get; } = new List<string>[3];

    public DebugSnapshot()
    {
        for (int i = 0; i < 3; i++)
        {
            Channels[i] = new ChannelDebugInfo { ChannelNumber = i };
            NoteHistory[i] = new List<string>();
        }
    }
}

/// <summary>
/// Represents a note that was played
/// </summary>
public class NoteHistoryEntry
{
    public int Frame { get; set; }
    public string NoteName { get; set; } = "";
    public int Octave { get; set; }
    public int Instrument { get; set; }
    public int Duration { get; set; }

    public override string ToString()
    {
        string instStr = Instrument > 0 ? $"i{Instrument}" : "";
        return $"{NoteName}{Octave}{instStr}";
    }
}
