namespace ThemeOfTaraPlayer;

/// <summary>
/// Represents the state of a single sound channel, matching the SOUND structure
/// from the Metal Gear MSX2 sound driver.
/// </summary>
public class SoundChannel
{
    /// <summary>Frames remaining for current note/sound</summary>
    public int NoteCounter { get; set; }

    /// <summary>Duration of current note (in frames)</summary>
    public int NoteLength { get; set; }

    /// <summary>Sound/Music ID currently playing (0=silent)</summary>
    public int Id { get; set; }

    /// <summary>Current position in music/SFX data</summary>
    public int Pointer { get; set; }

    /// <summary>
    /// Configuration flags:
    /// Bit 3: Use Envelope
    /// Bit 2: Set Env. Freq
    /// Bit 1: Tone ON/OFF
    /// Bit 0: Noise ON/OFF
    /// </summary>
    public int Config { get; set; }

    /// <summary>Note length multiplier</summary>
    public int Tempo { get; set; }

    /// <summary>Initial volume for ADSR</summary>
    public int AttackVolume { get; set; }

    /// <summary>Current volume during decay</summary>
    public int DecayVolume { get; set; }

    /// <summary>Current octave (0-7)</summary>
    public int Octave { get; set; }

    /// <summary>Remaining steps (Note length + release steps)</summary>
    public int DecayCount { get; set; }

    /// <summary>Loop iteration counter</summary>
    public int LoopCount { get; set; }

    /// <summary>Number of decay steps</summary>
    public int DecaySteps { get; set; }

    /// <summary>Release steps count</summary>
    public int Release { get; set; }

    /// <summary>1 = Note mode, 0 = SFX mode</summary>
    public bool NoteMode { get; set; } = true;

    /// <summary>
    /// Frequency modulation flags:
    /// Bit 3: Detune
    /// Bit 2: Vibrato ON
    /// Bit 0: Attack done
    /// </summary>
    public int FreqMod { get; set; }

    /// <summary>Instrument ID (0=none)</summary>
    public int Instrument { get; set; }

    /// <summary>Pointer to instrument data</summary>
    public int InstrumentPointer { get; set; }

    /// <summary>Instrument tick counter</summary>
    public int InstrumentCount { get; set; }

    /// <summary>Instrument note duration</summary>
    public int InstrumentLength { get; set; }

    /// <summary>Current frequency value (low byte)</summary>
    public int FreqLow { get; set; }

    /// <summary>Current frequency value (high byte)</summary>
    public int FreqHigh { get; set; }

    /// <summary>Current volume (or envelope shape)</summary>
    public int Volume { get; set; }

    /// <summary>Return address for CALL command</summary>
    public int ReturnAddress { get; set; }

    /// <summary>Timer for vibrato iteration</summary>
    public int VibratoWait { get; set; }

    /// <summary>Add or subtract frequency offset toggle</summary>
    public bool VibratoClock { get; set; }

    /// <summary>Vibrato config: X = Speed/iterations delay, Y = Freq offset</summary>
    public int VibratoConfig { get; set; }

    /// <summary>Gets the 16-bit frequency value</summary>
    public int Frequency
    {
        get => FreqLow | (FreqHigh << 8);
        set
        {
            FreqLow = value & 0xFF;
            FreqHigh = (value >> 8) & 0xFF;
        }
    }

    /// <summary>Check if detune is enabled</summary>
    public bool IsDetune => (FreqMod & 0x08) != 0;

    /// <summary>Check if vibrato is enabled</summary>
    public bool IsVibrato => (FreqMod & 0x04) != 0;

    /// <summary>Check if vibrato attack phase is done</summary>
    public bool IsVibratoAttackDone => (FreqMod & 0x01) != 0;

    /// <summary>Check if tone is enabled</summary>
    public bool IsToneEnabled => (Config & 0x02) != 0;

    /// <summary>Check if noise is enabled</summary>
    public bool IsNoiseEnabled => (Config & 0x01) != 0;

    /// <summary>Check if envelope is used</summary>
    public bool UseEnvelope => (Config & 0x08) != 0;

    public void Reset()
    {
        NoteCounter = 0;
        NoteLength = 0;
        Id = 0;
        Pointer = 0;
        Config = 0;
        Tempo = 0;
        AttackVolume = 0;
        DecayVolume = 0;
        Octave = 0;
        DecayCount = 0;
        LoopCount = 0;
        DecaySteps = 0;
        Release = 0;
        NoteMode = true;
        FreqMod = 0;
        Instrument = 0;
        InstrumentPointer = 0;
        InstrumentCount = 0;
        InstrumentLength = 0;
        FreqLow = 0;
        FreqHigh = 0;
        Volume = 0;
        ReturnAddress = 0;
        VibratoWait = 0;
        VibratoClock = false;
        VibratoConfig = 0;
    }
}
