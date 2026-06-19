namespace ThemeOfTaraPlayer;

/// <summary>
/// Emulates the AY-3-8910 Programmable Sound Generator (PSG) chip
/// used in the MSX2 for the Metal Gear sound system.
/// </summary>
public class PsgEmulator
{
    // PSG clock on MSX2 is 1.7897725 MHz, divided by 16 for tone generation
    private const double PsgClock = 1789772.5;
    private const double ToneDivisor = 16.0;

    public int SampleRate { get; }

    // PSG registers
    private readonly int[] _registers = new int[16];

    // Tone generator state - using phase accumulators for smoother output
    private readonly double[] _tonePhase = new double[3];
    private readonly bool[] _toneOutput = new bool[3];

    // Noise generator state
    private int _noiseShiftRegister = 1;
    private bool _noiseOutput;
    private double _noisePhase;

    // Envelope generator state
    private int _envelopeStep;
    private bool _envelopeAttack;
    private bool _envelopeAlternate;
    private bool _envelopeHold;
    private bool _envelopeHolding;
    private double _envelopePhase;

    // Pre-calculated clock rate per sample
    private readonly double _clocksPerSample;

    // Volume table (DAC output levels)
    // The AY-3-8910 has a logarithmic volume curve
    private static readonly double[] VolumeTable;

    static PsgEmulator()
    {
        VolumeTable = new double[16];
        VolumeTable[0] = 0.0;

        // Logarithmic volume: each step is roughly sqrt(2) (~3dB)
        // This gives a more authentic PSG sound
        for (int i = 1; i < 16; i++)
        {
            VolumeTable[i] = Math.Pow(10.0, (i - 15) * 3.0 / 20.0);
        }
    }

    public PsgEmulator(int sampleRate = 44100)
    {
        SampleRate = sampleRate;
        _clocksPerSample = (PsgClock / ToneDivisor) / sampleRate;
        Reset();
    }

    public void Reset()
    {
        Array.Clear(_registers);
        Array.Clear(_tonePhase);
        Array.Clear(_toneOutput);

        _noiseShiftRegister = 1;
        _noiseOutput = false;
        _noisePhase = 0;

        _envelopeStep = 0;
        _envelopeAttack = false;
        _envelopeAlternate = false;
        _envelopeHold = false;
        _envelopeHolding = false;
        _envelopePhase = 0;

        // Default: all tone and noise disabled
        _registers[7] = 0x3F;
    }

    public void WriteRegister(int register, int value)
    {
        if (register < 0 || register > 15) return;

        _registers[register] = value & 0xFF;

        // Reset envelope on shape register write
        if (register == 13)
        {
            _envelopeStep = 0;
            _envelopePhase = 0;
            _envelopeHolding = false;

            // Decode shape bits
            bool cont = (value & 0x08) != 0;
            _envelopeAttack = (value & 0x04) != 0;
            _envelopeAlternate = (value & 0x02) != 0;
            _envelopeHold = (value & 0x01) != 0;

            // If continue bit is 0, force specific behavior
            if (!cont)
            {
                _envelopeHold = true;
                _envelopeAlternate = _envelopeAttack;
            }
        }
    }

    public int ReadRegister(int register)
    {
        if (register < 0 || register > 15) return 0;
        return _registers[register];
    }

    private int GetTonePeriod(int channel)
    {
        int low = _registers[channel * 2];
        int high = _registers[channel * 2 + 1] & 0x0F;
        int period = (high << 8) | low;
        return Math.Max(period, 1);
    }

    private int GetNoisePeriod()
    {
        int period = _registers[6] & 0x1F;
        return Math.Max(period, 1);
    }

    private int GetEnvelopePeriod()
    {
        int period = _registers[11] | (_registers[12] << 8);
        return Math.Max(period, 1);
    }

    private int GetEnvelopeVolume()
    {
        int vol = _envelopeAttack ? _envelopeStep : (15 - _envelopeStep);
        return Math.Clamp(vol, 0, 15);
    }

    private double GetChannelVolume(int channel)
    {
        int volReg = _registers[8 + channel];

        if ((volReg & 0x10) != 0)
        {
            // Use envelope
            return VolumeTable[GetEnvelopeVolume()];
        }
        else
        {
            return VolumeTable[volReg & 0x0F];
        }
    }

    public void GenerateSamples(float[] buffer, int offset, int count)
    {
        int mixer = _registers[7];

        for (int i = 0; i < count; i++)
        {
            // Update tone generators.
            // Use `while` rather than `if` so the phase accumulator can never
            // run away when the period is tiny (e.g. registers still 0 at
            // start of playback). A bare `if` would let phase climb by
            // ~1.5/sample with period=1 and take >1s to drain once a real
            // period is finally written — that was the first-two-notes bug.
            for (int ch = 0; ch < 3; ch++)
            {
                int period = GetTonePeriod(ch);
                _tonePhase[ch] += _clocksPerSample / period;

                while (_tonePhase[ch] >= 1.0)
                {
                    _tonePhase[ch] -= 1.0;
                    _toneOutput[ch] = !_toneOutput[ch];
                }
            }

            // Update noise generator (runs at half speed)
            int noisePeriod = GetNoisePeriod() * 2;
            _noisePhase += _clocksPerSample / noisePeriod;

            while (_noisePhase >= 1.0)
            {
                _noisePhase -= 1.0;
                // 17-bit LFSR with taps at bits 0 and 3
                int bit = ((_noiseShiftRegister ^ (_noiseShiftRegister >> 3)) & 1);
                _noiseShiftRegister = (_noiseShiftRegister >> 1) | (bit << 16);
                _noiseOutput = (_noiseShiftRegister & 1) != 0;
            }

            // Update envelope generator
            if (!_envelopeHolding)
            {
                int envPeriod = GetEnvelopePeriod();
                _envelopePhase += _clocksPerSample / (envPeriod * 16.0);

                while (_envelopePhase >= 1.0)
                {
                    _envelopePhase -= 1.0;
                    _envelopeStep++;

                    if (_envelopeStep >= 16)
                    {
                        if (_envelopeHold)
                        {
                            _envelopeStep = 15;
                            _envelopeHolding = !_envelopeAlternate;
                            if (_envelopeHolding) break;
                        }
                        else
                        {
                            _envelopeStep = 0;
                            if (_envelopeAlternate)
                            {
                                _envelopeAttack = !_envelopeAttack;
                            }
                        }
                    }
                }
            }

            // Mix channels
            double output = 0.0;

            for (int ch = 0; ch < 3; ch++)
            {
                bool toneEnabled = (mixer & (1 << ch)) == 0;
                bool noiseEnabled = (mixer & (8 << ch)) == 0;

                // PSG logic: output is AND of enabled sources
                // If source is disabled, it's treated as always high (1)
                bool toneGate = !toneEnabled || _toneOutput[ch];
                bool noiseGate = !noiseEnabled || _noiseOutput;

                // Channel produces sound if both gates are high
                if (toneGate && noiseGate)
                {
                    output += GetChannelVolume(ch);
                }
            }

            // Normalize to [-1, 1] range and apply master volume
            // Max output is 3.0 (all channels at max), scale to reasonable level
            buffer[offset + i] = (float)(output / 3.0) * 0.7f;
        }
    }
}
