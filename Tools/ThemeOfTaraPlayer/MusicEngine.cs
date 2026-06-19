namespace ThemeOfTaraPlayer;

/// <summary>
/// Music engine that replicates the Metal Gear MSX2 BGM driver.
/// Processes music notation commands and drives the PSG emulator.
/// </summary>
public class MusicEngine
{
    private readonly PsgEmulator _psg;
    private readonly SoundChannel[] _channels = new SoundChannel[3];

    // Note frequency table (base frequencies for octave 0)
    // C, C#, D, D#, E, F, F#, G, G#, A, A#, B
    private static readonly int[] NoteFrequency = { 0x6B, 0x65, 0x5F, 0x5A, 0x55, 0x50, 0x4C, 0x47, 0x43, 0x40, 0x3C, 0x39 };

    // Music data storage
    private byte[]? _musicData;

    // Mixer state
    private int _mixerValue = 0x38; // Tone enabled for all 3 channels, noise disabled

    // Instrument data for each channel
    private readonly byte[]?[] _currentInstrumentData = new byte[]?[3];

    // Debug tracking
    private int _frameCount;
    private readonly int[] _lastNote = new int[3];
    private readonly byte?[] _lastCommand = new byte?[3];
    private readonly List<string> _debugLog = new();
    private const int MaxDebugLogEntries = 500;

    // Note history for each channel
    private readonly List<string>[] _noteHistory = new List<string>[3] { new(), new(), new() };
    private const int MaxNoteHistoryEntries = 50;

    public MusicEngine(PsgEmulator psg)
    {
        _psg = psg;
        for (int i = 0; i < 3; i++)
        {
            _channels[i] = new SoundChannel();
        }
    }

    /// <summary>
    /// Load music data and set up the three channels
    /// </summary>
    public void LoadMusic(byte[] data, int channel1Offset, int channel2Offset, int channel3Offset)
    {
        _musicData = data;

        // Initialize channels
        for (int i = 0; i < 3; i++)
        {
            _channels[i].Reset();
            _channels[i].Id = 1; // Mark as active
            _channels[i].NoteMode = true;
            _channels[i].NoteCounter = 1; // Will immediately process first command
            _channels[i].Config = 2; // Tone ON
            _channels[i].Tempo = 7; // Default tempo
            _channels[i].AttackVolume = 15; // Default max volume
            _channels[i].DecaySteps = 0;
            _channels[i].Release = 0;
            _channels[i].Octave = 4; // Default middle octave
            _channels[i].InstrumentLength = 1; // Default instrument step duration
            _currentInstrumentData[i] = null;
            _noteHistory[i].Clear();
        }

        // Clear debug logs
        _debugLog.Clear();
        _frameCount = 0;

        _channels[0].Pointer = channel1Offset;
        _channels[1].Pointer = channel2Offset;
        _channels[2].Pointer = channel3Offset;

        // Reset PSG
        _psg.Reset();

        // Enable tone for all channels (bits 0-2 = 0 means tone enabled)
        // Disable noise for all channels (bits 3-5 = 1 means noise disabled)
        _mixerValue = 0x38;
        _psg.WriteRegister(7, _mixerValue);
    }

    /// <summary>
    /// Process one frame (1/60th of a second on MSX2)
    /// </summary>
    public void ProcessFrame()
    {
        if (_musicData == null) return;

        _frameCount++;

        // Process each channel
        for (int ch = 0; ch < 3; ch++)
        {
            if (_channels[ch].Id != 0)
            {
                ProcessChannel(ch);
            }
        }

        // Update mixer after processing all channels
        _psg.WriteRegister(7, _mixerValue);
    }

    private void ProcessChannel(int channelIndex)
    {
        var channel = _channels[channelIndex];

        // Three independent states (mirroring bgmdriver.asm `ProcessChannelData2`):
        //  1. An instrument is currently stepping through its own data buffer
        //     (_currentInstrumentData[ch] != null). The instrument's freq/vol
        //     envelope plays out via InstrumentPointer; main POINTER is paused
        //     until NoteCounter (the outer note duration) hits 0.
        //  2. NoteMode = true: the main POINTER reads note-format commands
        //     (the case most songs and the one we ported first).
        //  3. NoteMode = false: the main POINTER reads SFX-format commands
        //     (the same `0x2x dd VF LL …` layout the instrument buffer uses,
        //     but inline in the song stream). Red Alert and Alert toggle into
        //     this mode via `0xFE 0x00` at the very first command.
        if (_currentInstrumentData[channelIndex] != null)
        {
            ProcessInstrumentMode(channel, channelIndex);
        }
        else if (channel.NoteMode)
        {
            ProcessNoteMode(channel, channelIndex);
        }
        else
        {
            ProcessSfxMode(channel, channelIndex);
        }
    }

    private void ProcessNoteMode(SoundChannel channel, int channelIndex)
    {
        channel.NoteCounter--;

        if (channel.NoteCounter <= 0)
        {
            // Process next command(s)
            ProcessCommands(channel, channelIndex);
        }
        else
        {
            // Apply vibrato if enabled
            if (channel.IsVibrato && channel.Instrument == 0)
            {
                ApplyVibrato(channel, channelIndex);
            }

            // ADSR decay (only for non-instrument notes)
            if (channel.Instrument == 0)
            {
                ProcessAdsrDecay(channel, channelIndex);
            }
        }
    }

    private void ProcessInstrumentMode(SoundChannel channel, int channelIndex)
    {
        // Decrement main note counter to keep timing in sync
        channel.NoteCounter--;

        // Check if note duration has expired - return to note mode for next command
        if (channel.NoteCounter <= 0)
        {
            EndInstrument(channel, channelIndex);
            ProcessCommands(channel, channelIndex);
            return;
        }

        // Process instrument frame timing
        channel.InstrumentCount--;

        if (channel.InstrumentCount <= 0)
        {
            // Process next instrument command
            ProcessInstrumentData(channel, channelIndex);
        }
    }

    private void ProcessCommands(SoundChannel channel, int channelIndex)
    {
        if (_musicData == null) return;

        int maxIterations = 100; // Prevent infinite loops
        int iterations = 0;

        while (iterations++ < maxIterations)
        {
            int ptr = channel.Pointer;
            if (ptr < 0 || ptr >= _musicData.Length)
            {
                channel.Id = 0;
                return;
            }

            byte cmd = _musicData[ptr];

            // Check for special commands first
            if (cmd == 0xFE)
            {
                if (ptr + 1 >= _musicData.Length) { channel.Id = 0; return; }
                byte loopParam = _musicData[ptr + 1];

                if (loopParam == 0)
                {
                    // Mode swap: note → SFX. ASM `ChangeMode` toggles
                    // NOTE_MODE and re-enters ProcessChannelData in the same
                    // frame, also clearing INSTRUMENT (via ProcessChannelData2)
                    // because instruments only exist in note mode.
                    channel.NoteMode = !channel.NoteMode;
                    channel.Instrument = 0;
                    channel.Pointer = ptr + 2;
                    if (!channel.NoteMode)
                    {
                        ProcessSfxCommands(channel, channelIndex);
                        return;
                    }
                    continue;
                }
                else if (loopParam == 0xFF)
                {
                    // CALL subroutine
                    if (ptr + 3 >= _musicData.Length) { channel.Id = 0; return; }
                    int address = _musicData[ptr + 2] | (_musicData[ptr + 3] << 8);
                    channel.ReturnAddress = ptr + 4;
                    channel.Pointer = address;
                    continue;
                }
                else if (loopParam == 0xFE)
                {
                    // GOTO (infinite loop)
                    if (ptr + 3 >= _musicData.Length) { channel.Id = 0; return; }
                    int address = _musicData[ptr + 2] | (_musicData[ptr + 3] << 8);
                    channel.Pointer = address;
                    continue;
                }
                else
                {
                    // Finite loop
                    channel.LoopCount++;
                    if (channel.LoopCount >= loopParam)
                    {
                        // Loop complete
                        channel.LoopCount = 0;
                        channel.Pointer = ptr + 4;
                        continue;
                    }
                    else
                    {
                        // Continue looping
                        if (ptr + 3 >= _musicData.Length) { channel.Id = 0; return; }
                        int address = _musicData[ptr + 2] | (_musicData[ptr + 3] << 8);
                        channel.Pointer = address;
                        continue;
                    }
                }
            }
            else if (cmd == 0xFF)
            {
                // END/RET
                if (channel.ReturnAddress != 0)
                {
                    // Return from subroutine
                    channel.Pointer = channel.ReturnAddress;
                    channel.ReturnAddress = 0;
                    continue;
                }
                else
                {
                    // End of channel
                    channel.Id = 0;
                    channel.Volume = 0;
                    UpdateVolume(channel, channelIndex);
                    return;
                }
            }

            // Process command byte
            int highNibble = cmd >> 4;
            int lowNibble = cmd & 0x0F;

            if (highNibble == 0x0D)
            {
                // Tempo command
                channel.Tempo = lowNibble == 0 ? 1 : lowNibble;
                channel.Pointer++;
                continue;
            }
            else if (cmd >= 0xF0 && cmd <= 0xFD)
            {
                // ADSR command
                if (ptr + 1 >= _musicData.Length) { channel.Id = 0; return; }
                channel.AttackVolume = lowNibble + 1;
                byte adsrParam = _musicData[ptr + 1];
                channel.DecaySteps = (adsrParam >> 4) & 0x0F;
                channel.Release = adsrParam & 0x0F;
                channel.Pointer += 2;
                continue;
            }
            else if (cmd >= 0xE0 && cmd <= 0xE7)
            {
                // Octave command
                channel.Octave = lowNibble;
                channel.Pointer++;
                continue;
            }
            else if (cmd == 0xE8)
            {
                // Detune command
                channel.FreqMod |= 0x08;
                channel.Pointer++;
                continue;
            }
            else if (cmd == 0xE9)
            {
                // Instrument command
                if (ptr + 1 >= _musicData.Length) { channel.Id = 0; return; }
                channel.Instrument = _musicData[ptr + 1];
                channel.Pointer += 2;
                continue;
            }
            else if (cmd == 0xEC)
            {
                // Vibrato command
                if (ptr + 1 >= _musicData.Length) { channel.Id = 0; return; }
                channel.FreqMod |= 0x04;
                channel.VibratoConfig = _musicData[ptr + 1];
                channel.Pointer += 2;
                continue;
            }
            else if (cmd == 0xEF)
            {
                // Note OFF - clear modifiers and reset vibrato state
                channel.FreqMod = 0;
                channel.Instrument = 0;
                channel.VibratoWait = 0;
                channel.VibratoClock = false;
                channel.Pointer++;
                continue;
            }
            else if (highNibble == 0x0C)
            {
                // Silence/Rest (ASM MuteNote).
                int duration = CalculateNoteDuration(channel, lowNibble);
                channel.NoteLength = duration;
                channel.NoteCounter = duration;
                channel.Frequency = 0;
                channel.Volume = 0;
                UpdateFrequency(channel, channelIndex);
                UpdateVolume(channel, channelIndex);
                channel.Pointer++;
                return;
            }
            else if (highNibble <= 0x0B)
            {
                // Note command
                int note = highNibble;
                int duration = CalculateNoteDuration(channel, lowNibble);

                channel.NoteLength = duration;
                channel.NoteCounter = duration;
                channel.Pointer++;

                // Track for debug
                _lastNote[channelIndex] = note;
                _lastCommand[channelIndex] = cmd;

                if (channel.Instrument != 0)
                {
                    // Use instrument
                    SetupInstrument(channel, note, channelIndex);
                }
                else
                {
                    // Regular note
                    PlayNote(channel, note, channelIndex);
                }
                return;
            }

            // Unknown command, skip
            channel.Pointer++;
        }
    }

    private void PlayNote(SoundChannel channel, int note, int channelIndex)
    {
        channel.DecayVolume = channel.AttackVolume;
        channel.Volume = channel.AttackVolume;
        channel.FreqMod &= ~0x01; // Reset vibrato attack flag
        channel.VibratoWait = 0;
        channel.VibratoClock = false;
        channel.DecayCount = channel.NoteLength + channel.DecaySteps;
        channel.Config = 2; // Tone ON

        // Calculate frequency (period value for PSG)
        // Base frequencies are for highest octave, left-shift for lower octaves
        int baseFreq = NoteFrequency[note];
        int freq = baseFreq;
        for (int i = 0; i < channel.Octave; i++)
        {
            freq <<= 1;
        }

        if (channel.IsDetune)
        {
            freq++;
        }

        channel.Frequency = freq;

        // Debug log
        string noteName = ChannelDebugInfo.GetNoteName(note);
        LogDebug($"F{_frameCount} Ch{channelIndex}: PlayNote {noteName}{channel.Octave} base=0x{baseFreq:X2} freq=0x{freq:X3} vol={channel.Volume} atk={channel.AttackVolume} dec={channel.DecaySteps} rel={channel.Release} vib={channel.IsVibrato} cfg=0x{channel.VibratoConfig:X2}");

        // Log to note history
        LogNoteHistory(channelIndex, note, channel.Octave, 0, channel.NoteLength);

        UpdateFrequency(channel, channelIndex);
        UpdateVolume(channel, channelIndex);
        UpdateMixer(channel, channelIndex);
    }

    private void LogNoteHistory(int channelIndex, int note, int octave, int instrument, int duration)
    {
        string noteName = ChannelDebugInfo.GetNoteName(note);
        string instStr = instrument > 0 ? $"i{instrument}" : "";
        string entry = $"{noteName}{octave}{instStr}";

        _noteHistory[channelIndex].Add(entry);
        if (_noteHistory[channelIndex].Count > MaxNoteHistoryEntries)
        {
            _noteHistory[channelIndex].RemoveAt(0);
        }
    }

    private void LogDebug(string message)
    {
        _debugLog.Add(message);
        if (_debugLog.Count > MaxDebugLogEntries)
        {
            _debugLog.RemoveAt(0);
        }
    }

    private void SetupInstrument(SoundChannel channel, int note, int channelIndex)
    {
        int instrumentId = channel.Instrument;
        var instrumentData = InstrumentData.GetInstrument(instrumentId, note);

        string noteName = ChannelDebugInfo.GetNoteName(note);
        if (instrumentData != null && instrumentData.Length > 0)
        {
            LogDebug($"F{_frameCount} Ch{channelIndex}: SetupInst id={instrumentId} note={noteName} len={instrumentData.Length}");

            // Log to note history with instrument
            LogNoteHistory(channelIndex, note, channel.Octave, instrumentId, channel.NoteLength);

            _currentInstrumentData[channelIndex] = instrumentData;
            channel.InstrumentPointer = 0;
            // NOTE: do NOT flip NoteMode here. The instrument-active state is
            // tracked via _currentInstrumentData[ch], independently of the
            // note-vs-SFX format flag (which is what NoteMode actually means
            // in bgmdriver.asm — see ProcessChannel).
            ProcessInstrumentData(channel, channelIndex);
        }
        else
        {
            LogDebug($"F{_frameCount} Ch{channelIndex}: SetupInst id={instrumentId} note={noteName} -> NULL, fallback to PlayNote");
            // No valid instrument, play as regular note
            channel.Instrument = 0;
            PlayNote(channel, note, channelIndex);
        }
    }

    // One full SFX-format step. Mirrors `ChkCmd_2x → ChkCmd_1x → SfxLogic3`
    // in bgmdriver.asm and is shared by both instrument playback (data comes
    // from the static instrument blob) and main-pointer SFX mode (data is the
    // music buffer).
    //
    // Format of a single step:
    //   [0x2x dd]            optional: config + duration (resets InstrumentLength)
    //   [env-hi env-lo]      optional: only if config has bit 3 set (envelope)
    //                        AND bit 2 clear (set-env-freq is *not* set)
    //   [0x1x]               optional: noise period (period * 2 → PSG reg 6)
    //   VF [LL]              required: 1 byte if config noise-only, else 2 bytes
    //   0xFF                 end of stream
    //
    // The earlier port handled 0x2x, 0x1x and freq/vol as three mutually
    // exclusive branches, which meant a noise-period byte sandwiched between
    // a config and a freq/vol pair (e.g. `0x23 0x01 0x11 0xE0 0x20` in
    // Sfx_Click) got eaten as if it were the high half of a freq/vol pair.
    private bool ProcessSoundStep(SoundChannel channel, int channelIndex, byte[] data, ref int ptr)
    {
        if (ptr < 0 || ptr >= data.Length) return false;
        if (data[ptr] == 0xFF) return false;

        // ChkCmd_2x: optional config + duration (+ env period)
        if ((data[ptr] >> 4) == 2)
        {
            channel.Config = data[ptr++];
            if (ptr >= data.Length) return false;
            byte duration = data[ptr++];
            channel.InstrumentLength = duration;
            channel.InstrumentCount = duration;
            UpdateMixer(channel, channelIndex);

            // Special-case the ASM does for `CONFIG == 0x20` (no tone, no
            // noise): consume nothing further and set volume 0. None of the
            // shipping SFXs hit this, but it's cheap to honour.
            if (channel.Config == 0x20)
            {
                channel.Volume = 0;
                UpdateVolume(channel, channelIndex);
                return true;
            }

            // Envelope mode + NOT set-env-freq → next two bytes are the
            // envelope period (high byte first; ASM writes reg 12 then reg 11).
            if ((channel.Config & 0x08) != 0 && (channel.Config & 0x04) == 0)
            {
                if (ptr + 1 >= data.Length) return false;
                _psg.WriteRegister(12, data[ptr++]);
                _psg.WriteRegister(11, data[ptr++]);
            }
        }

        // ChkCmd_1x: optional noise period.
        if (ptr < data.Length && (data[ptr] >> 4) == 1)
        {
            _psg.WriteRegister(6, (data[ptr] & 0x0F) * 2);
            ptr++;
        }

        // SfxLogic3: freq/vol bytes (required). Noise-only = single byte
        // (volume in high nibble); otherwise two bytes (`[Vol|FreqHi] [FreqLo]`).
        if (ptr >= data.Length) return false;
        byte b1 = data[ptr];
        if (b1 == 0xFF) return false;

        if ((channel.Config & 0x03) == 1)
        {
            channel.Volume = (b1 >> 4) & 0x0F;
            ptr++;
        }
        else
        {
            if (ptr + 1 >= data.Length) return false;
            channel.Volume = (b1 >> 4) & 0x0F;
            channel.FreqHigh = b1 & 0x0F;
            channel.FreqLow = data[ptr + 1];
            ptr += 2;
        }

        UpdateFrequency(channel, channelIndex);
        UpdateVolume(channel, channelIndex);
        return true;
    }

    private void ProcessInstrumentData(SoundChannel channel, int channelIndex)
    {
        var data = _currentInstrumentData[channelIndex];
        if (data == null) { EndInstrument(channel, channelIndex); return; }

        int ptr = channel.InstrumentPointer;
        bool ok = ProcessSoundStep(channel, channelIndex, data, ref ptr);
        channel.InstrumentPointer = ptr;

        if (!ok) { EndInstrument(channel, channelIndex); return; }

        // Each subsequent freq/vol step on this same config plays for
        // InstrumentLength frames (the duration the most recent 0x2x set).
        channel.InstrumentCount = channel.InstrumentLength;
    }

    private void EndInstrument(SoundChannel channel, int channelIndex)
    {
        // Clearing the buffer is what ProcessChannel uses to know the
        // instrument is done. NoteMode is left alone — see the comment in
        // SetupInstrument.
        _currentInstrumentData[channelIndex] = null;
        channel.Config = 2; // Restore tone-only mode
        channel.Volume = 0;
        UpdateVolume(channel, channelIndex);
        UpdateMixer(channel, channelIndex);
    }

    // --- SFX-format mode (NoteMode == false) -----------------------------
    //
    // When the song's main pointer reads SFX-format bytes directly (as
    // opposed to note-format), the byte layout is identical to instrument
    // data: alternating `0x2x dd` config bytes and `VF LL` freq/vol pairs,
    // with `0x1x` noise periods and `0xFF` ending the SFX. The driver still
    // honours `0xFE` / `0xFF` branch/return opcodes — those are universal.
    //
    // Songs that use this mode: Red Alert, Alert (both toggle in with
    // `0xFE 0x00` at the very first command).

    private void ProcessSfxMode(SoundChannel channel, int channelIndex)
    {
        channel.NoteCounter--;
        if (channel.NoteCounter > 0)
        {
            // Hold the current freq/vol step.
            return;
        }
        ProcessSfxCommands(channel, channelIndex);
    }

    private void ProcessSfxCommands(SoundChannel channel, int channelIndex)
    {
        if (_musicData == null) return;

        int maxIterations = 100;
        int iterations = 0;

        while (iterations++ < maxIterations)
        {
            int ptr = channel.Pointer;
            if (ptr < 0 || ptr >= _musicData.Length)
            {
                channel.Id = 0;
                return;
            }

            byte cmd = _musicData[ptr];

            if (cmd == 0xFE)
            {
                // Reuse the branch handler from ProcessCommands — same opcodes
                // mean the same thing in SFX mode. If it's a 0xFE 0x00 mode
                // toggle, we flip back to note mode and hand off.
                if (ptr + 1 >= _musicData.Length) { channel.Id = 0; return; }
                byte loopParam = _musicData[ptr + 1];

                if (loopParam == 0)
                {
                    channel.NoteMode = !channel.NoteMode;
                    channel.Instrument = 0;
                    channel.Pointer = ptr + 2;
                    if (channel.NoteMode)
                    {
                        ProcessCommands(channel, channelIndex);
                        return;
                    }
                    continue;
                }
                else if (loopParam == 0xFF)
                {
                    if (ptr + 3 >= _musicData.Length) { channel.Id = 0; return; }
                    int address = _musicData[ptr + 2] | (_musicData[ptr + 3] << 8);
                    channel.ReturnAddress = ptr + 4;
                    channel.Pointer = address;
                    continue;
                }
                else if (loopParam == 0xFE)
                {
                    if (ptr + 3 >= _musicData.Length) { channel.Id = 0; return; }
                    int address = _musicData[ptr + 2] | (_musicData[ptr + 3] << 8);
                    channel.Pointer = address;
                    continue;
                }
                else
                {
                    channel.LoopCount++;
                    if (channel.LoopCount >= loopParam)
                    {
                        channel.LoopCount = 0;
                        channel.Pointer = ptr + 4;
                        continue;
                    }
                    if (ptr + 3 >= _musicData.Length) { channel.Id = 0; return; }
                    int address = _musicData[ptr + 2] | (_musicData[ptr + 3] << 8);
                    channel.Pointer = address;
                    continue;
                }
            }
            else if (cmd == 0xFF)
            {
                if (channel.ReturnAddress != 0)
                {
                    channel.Pointer = channel.ReturnAddress;
                    channel.ReturnAddress = 0;
                    continue;
                }
                // End of channel.
                channel.Id = 0;
                channel.Volume = 0;
                UpdateVolume(channel, channelIndex);
                return;
            }

            // Not a branch (0xFE / 0xFF): delegate to the shared SFX step
            // processor, which walks config → env-period → noise-period →
            // freq/vol as a single sequence per the ASM ChkCmd_2x flow.
            int ptrBefore = ptr;
            bool ok = ProcessSoundStep(channel, channelIndex, _musicData, ref ptr);
            channel.Pointer = ptr;

            if (!ok)
            {
                // ProcessSoundStep returns false on 0xFF, out-of-bounds, or a
                // truncated step. Let the outer loop re-fetch on the next
                // iteration so the 0xFF/EOD case hits the channel-end branch
                // above with consistent bookkeeping.
                if (ptr == ptrBefore)
                {
                    channel.Id = 0;
                    channel.Volume = 0;
                    UpdateVolume(channel, channelIndex);
                }
                return;
            }

            // The step we just processed runs for InstrumentLength frames
            // (set by the last 0x2x config). NoteCounter is what
            // ProcessSfxMode decrements next frame.
            channel.NoteCounter = channel.InstrumentLength;
            return;
        }
    }

    private void ApplyVibrato(SoundChannel channel, int channelIndex)
    {
        if (!channel.IsVibratoAttackDone)
        {
            channel.VibratoWait++;
            if (channel.VibratoWait >= 10)
            {
                channel.FreqMod |= 0x01;
                channel.VibratoWait = 0;
            }
            return;
        }

        int speed = (channel.VibratoConfig >> 4) & 0x0F;
        if (speed == 0) speed = 1;

        int intensity = channel.VibratoConfig & 0x0F;

        channel.VibratoWait++;
        if (channel.VibratoWait >= speed)
        {
            channel.VibratoWait = 0;
            channel.VibratoClock = !channel.VibratoClock;

            // ASM `cpl` initialises VIBRATO_CLK from 0 to 0xFF and branches
            // to the decrement path first; mirror that here so the vibrato
            // waveform starts going down.
            int freq = channel.Frequency;
            if (channel.VibratoClock)
            {
                freq -= intensity;
            }
            else
            {
                freq += intensity;
            }
            channel.Frequency = freq;
            UpdateFrequency(channel, channelIndex);
        }
    }

    // Mirrors bgmdriver.asm `NoteLogic` ADSR block.
    // DecayCount starts at NoteLength + DecaySteps (set in PlayNote) and
    // NoteCounter starts at NoteLength, so the initial difference is exactly
    // DecaySteps. Each frame we decrement DecayCount once; if it still
    // doesn't match NoteCounter (we're inside the decay window) we
    // decrement it again AND drop the volume by 1. When the two finally
    // align we're in sustain — and we keep going one-for-one with
    // NoteCounter until DecayCount falls inside the release window
    // (DecayCount <= Release), at which point the volume drops again
    // each frame.
    private void ProcessAdsrDecay(SoundChannel channel, int channelIndex)
    {
        channel.DecayCount--;

        if (channel.DecayCount != channel.NoteCounter)
        {
            // Still in decay window: catch DecayCount up to NoteCounter
            // by burning an extra tick, and drop the volume.
            channel.DecayCount--;
            DecayVolumeStep(channel, channelIndex);
        }
        else if (channel.Release >= channel.DecayCount)
        {
            // Release window reached: drop volume each frame.
            DecayVolumeStep(channel, channelIndex);
        }
        // else: sustain — volume held.
    }

    private void DecayVolumeStep(SoundChannel channel, int channelIndex)
    {
        if (channel.DecayVolume <= 0) return;
        channel.DecayVolume--;
        channel.Volume = channel.DecayVolume;
        UpdateVolume(channel, channelIndex);
    }

    private int CalculateNoteDuration(SoundChannel channel, int durationValue)
    {
        int tempo = channel.Tempo;
        if (tempo <= 0) tempo = 1;

        if (durationValue == 0)
            return tempo;

        return tempo * (durationValue + 1);
    }

    private void UpdateFrequency(SoundChannel channel, int channelIndex)
    {
        int freq = channel.Frequency;
        int freqRegLow = channelIndex * 2;
        int freqRegHigh = channelIndex * 2 + 1;

        // PSG frequency registers: write low byte to even register, high bits to odd register
        _psg.WriteRegister(freqRegLow, freq & 0xFF);
        _psg.WriteRegister(freqRegHigh, (freq >> 8) & 0x0F);
    }

    private void UpdateVolume(SoundChannel channel, int channelIndex)
    {
        int volumeReg = 8 + channelIndex;
        int volume = Math.Clamp(channel.Volume, 0, 15);
        _psg.WriteRegister(volumeReg, volume);
    }

    private void UpdateMixer(SoundChannel channel, int channelIndex)
    {
        int toneBit = 1 << channelIndex;
        int noiseBit = 8 << channelIndex;

        // Config bit 1 = Tone enable, bit 0 = Noise enable
        // PSG mixer: 0 = enabled, 1 = disabled (inverted logic)

        if ((channel.Config & 0x02) != 0)
        {
            _mixerValue &= ~toneBit; // Enable tone
        }
        else
        {
            _mixerValue |= toneBit; // Disable tone
        }

        if ((channel.Config & 0x01) != 0)
        {
            _mixerValue &= ~noiseBit; // Enable noise
        }
        else
        {
            _mixerValue |= noiseBit; // Disable noise
        }
    }

    public bool IsPlaying => _channels[0].Id != 0 || _channels[1].Id != 0 || _channels[2].Id != 0;

    /// <summary>
    /// Get debug snapshot of current state
    /// </summary>
    public DebugSnapshot GetDebugSnapshot()
    {
        var snapshot = new DebugSnapshot
        {
            FrameCount = _frameCount,
            MixerValue = _mixerValue
        };

        for (int i = 0; i < 3; i++)
        {
            var ch = _channels[i];
            var info = snapshot.Channels[i];

            info.IsActive = ch.Id != 0;
            info.IsNoteMode = ch.NoteMode;
            info.NoteName = ChannelDebugInfo.GetNoteName(_lastNote[i]);
            info.Octave = ch.Octave;
            info.Frequency = ch.Frequency;
            info.Volume = ch.Volume;
            info.Instrument = ch.Instrument;
            info.NoteCounter = ch.NoteCounter;
            info.Tempo = ch.Tempo;
            info.HasVibrato = ch.IsVibrato;
            info.HasDetune = ch.IsDetune;
            info.Config = ch.Config;
            info.Pointer = ch.Pointer;
            info.LastCommand = _lastCommand[i];
        }

        // Copy recent log entries
        snapshot.RecentLog = new List<string>(_debugLog);

        // Copy note history for each channel
        for (int i = 0; i < 3; i++)
        {
            snapshot.NoteHistory[i] = new List<string>(_noteHistory[i]);
        }

        return snapshot;
    }
}
