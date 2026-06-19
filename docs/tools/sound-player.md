# Music + SFX Player — C# port architecture

The [`Tools/ThemeOfTaraPlayer/`](../../Tools/ThemeOfTaraPlayer/) project is a WPF app that
re-implements the BGM driver in C# and plays the resulting samples through NAudio. It
targets .NET 8 on Windows and bundles a debug panel showing per-channel state. (The folder
keeps its historical name; "Theme of Tara" was the first track ported — it now plays all
10 tracks and 44 SFXs.)

> **Note:** `.asm` / `file:line` citations and `room_images/` references in this doc refer to the separate MSX disassembly repo ([southernsun/MetalGear](https://github.com/southernsun/MetalGear)), expected as a sibling clone at `../MetalGear`.

This doc covers the architecture, where it mirrors the ASM and where it doesn't, and the
operations you'll most likely want to perform. The original engine is documented in
[sound-driver](../rom/sound-driver.md); the byte-stream language in
[music-format](../rom/music-format.md).

## File map

| File | Role |
|------|------|
| `PsgEmulator.cs` | AY-3-8910 emulation. Generates audio samples by maintaining tone/noise/envelope phase accumulators driven by the PSG period registers. |
| `SoundChannel.cs` | The 32-byte `SOUND` work-area structure from `constants/structures/sound.asm`, as a C# class. Pure data. |
| `MusicEngine.cs` | Runs the per-frame state machine: command fetch, note play, ADSR, vibrato, instrument tick. Mirrors `bgmdriver.asm`. |
| `InstrumentData.cs` | The 12-drum / slap-bass / bass instrument data from `sound/instruments.asm`, hand-translated. |
| `MusicCatalog.cs` | **Auto-generated** by `extract_music.py` from `MetalGear.lst`. The song table and the music byte stream indexed by MSX RAM address. |
| `AudioPlayer.cs` | Wraps NAudio. Manages playback lifetime and the song-load / start / stop API. |
| `MainWindow.xaml(.cs)` | The WPF window. Song picker, Play/Stop, debug panel. |
| `DebugInfo.cs` | Snapshot types ferrying per-channel state to the UI thread. |
| `extract_music.py` | One-shot extractor — see [music-extraction](music-extraction.md). |

## Runtime architecture

```
MainWindow (UI thread)
   │ Play / Stop / select song
   ▼
AudioPlayer.Play(song)
   │ LoadSong → flips _isPlaying flag, resets sample counter
   ▼
PsgWaveProvider (NAudio worker thread)
   │ IWaveProvider.Read() called by WaveOutEvent on its own thread
   │  for each frame's worth of samples to fill:
   │      if at frame boundary:  MusicEngine.ProcessFrame()
   │      PsgEmulator.GenerateSamples(buffer)
   ▼
WaveOutEvent → speakers
```

A 60 Hz "frame" is exactly `44100 / 60 = 735` samples. Each `Read()` may straddle several
frames, calling `ProcessFrame()` once per crossing. `_isPlaying = false` short-circuits to
a buffer of zeroes — the audio device keeps running either way.

## How it mirrors (and deviates from) the ASM

The intent is byte-for-byte equivalence with `bgmdriver.asm` in everything actually
implemented. Where they differ:

- **No SFX channel.** The C# port handles 3 music channels; the 4th SFX channel and all of
  `SfxLogic*` is omitted. The reused `ChkCmd_2x` / `SfxLogic3` parser the ASM jumps to from
  `InstrumentTick` is open-coded as `ProcessInstrumentData`.
- **No pause / fade-out / mute.** `MusicFadeOut`, `VolumeFadeVal`, `SoundDataSaved`,
  `MuteSoundFlag`, `RestoreSoundData` are not ported. Stop just stops, Play starts fresh.
- **No region-lock / SetSound state machine.** `setsound.asm` (SFX priority, music
  transitions, channel allocation) is not in the port — `LoadMusic` initialises the 3
  channels directly.
- **`NoteMode = false` during instrument playback.** In the ASM, `NOTE_MODE` stays at 1
  while an instrument plays; instrument state is gated purely on `INSTRUMENT != 0`.
  Functionally equivalent for music; disentangle if you ever port the SFX path.
- **`channel.Frequency` is a 16-bit int.** Vibrato underflow/overflow wraps through `int`
  arithmetic, giving the same low-12-bit result the ASM gets via `add hl`/`sub` with carry.

## Audio device latency — why the device is kept hot

`WaveOutEvent.Play()` has a real warm-up cost — Windows allocates buffers, takes the
audio-device lock, primes the hardware FIFO (~100 ms to several hundred ms before the first
sample reaches the speakers). Meanwhile NAudio's worker thread is already calling `Read()`,
so the *music engine has advanced past the opening silence* by the time real audio comes
out. The symptom was "the song starts partway through its first notes."

Fix in `AudioPlayer.cs`: the constructor calls `_waveOut.Play()` once at startup; `Stop()`
just flips `_waveProvider._isPlaying = false` (the device keeps running, outputting
silence); `Play()` flips it back true so new music is audible within ~1 NAudio buffer
(~27 ms). `Dispose()` is the only place that actually stops the device.

If you ever swap `WaveOutEvent` for `WasapiOut`, the warm-up cost drops far enough that
this hack is unnecessary — but keep the always-on pattern anyway; it's negligible cost and
avoids per-Play startup glitches across backends.

## Phase-accumulator footgun

`PsgEmulator.GenerateSamples` uses `while (_phase >= 1.0)` rather than `if`. Looks
redundant — *isn't*. On reset, all PSG period registers are 0, which `GetTonePeriod` clamps
to 1. With period=1, the per-sample phase increment is ~2.5; an `if` only subtracts 1.0, so
phase climbs unboundedly. By the time the first real period is written (after the song's
~28-frame opening rest), `_tonePhase[0]` has accumulated to ~30,000. It then stays
`>= 1.0` for every sample and toggles at Nyquist — inaudible noise — for ~1 second while it
drains. **Keep the `while`. Don't "optimise" it back to `if`.**

## Adding a new song

The catalog is auto-generated:

1. Add or modify the `.asm` in `sound/music/` (it must be `include`d from
   `sound/sounddata.asm` and assigned a sound ID in `idxSoundData`).
2. Re-assemble: `sjasm MetalGear.asm MetalGear.rom` (regenerates `MetalGear.lst`). This
   assembly step runs in the separate disassembly repo,
   https://github.com/southernsun/MetalGear, cloned as a sibling at `../MetalGear`.
3. Add the song's three channel labels to the `SONGS` list at the top of
   `extract_music.py`.
4. Re-run the extractor: `py Tools/ThemeOfTaraPlayer/extract_music.py` (overwrites
   `MusicCatalog.cs`).
5. Rebuild: `dotnet build Tools/ThemeOfTaraPlayer/ThemeOfTaraPlayer.csproj`.

The song appears in the picker automatically (the UI binds to `MusicCatalog.Songs`). Full
extractor details: [music-extraction](music-extraction.md).

## Debugging a divergence

1. **Open the debug panel.** Per-channel mode, note, octave, frequency, volume, tempo,
   config flags and last command byte are live; the log shows the last ~500 dispatches with
   frame numbers.
2. **Compare against the ASM.** Trace the same sequence by hand in `sound/bgmdriver.asm`.
   Its labels (`SetNote`, `ProcessCommand_Ex`, `InstrumentTick`, `ChkVibratoAttack`,
   `Decay`, `Decay2`) line up directly with C# method names.
3. **Right values in the log but wrong audio** → bug is downstream of `MusicEngine` (in
   `PsgEmulator.GenerateSamples` or the NAudio pipeline). The phase-runaway bug looked like
   this.
4. **Wrong values in the log** → bug is in `MusicEngine` or `SoundChannel`. Find the
   equivalent ASM block and diff.
5. **Both look right but still wrong** → audio-latency / driver-buffering. Check
   `DesiredLatency` and whether `_waveOut.Play()` is called more than once.

## SFX step format — the shared `ProcessSoundStep` helper

Both instrument data (`SnareDrum`, `Bass4`) and main-pointer SFX mode use the same per-step
byte layout, which `bgmdriver.asm`'s `ChkCmd_2x → ChkCmd_1x → SfxLogic3` flow walks
linearly:

```
[0x2x dd]             optional: config byte + step-duration
[env-hi env-lo]       optional: only if config bit 3 set AND bit 2 clear
[0x1x]                optional: noise period (period * 2 → PSG reg 6)
VF [LL]               required: 1 byte noise-only, else 2 bytes [Vol|FreqHi] [FreqLo]
```

The earlier port treated `0x2x`, `0x1x` and freq/vol as three top-level dispatch branches —
which silently mis-parsed any sequence combining them (e.g. `0x23 0x01 0x11 0xE0 0x20` in
Sfx_Click). `ProcessSoundStep(channel, ch, data, ref ptr)` now walks the sequence linearly
and is called by both `ProcessInstrumentData` and `ProcessSfxCommands`. **Don't fold its
branches back into a dispatch** — the *order* and *optionality* of each section is what
makes it correct.

## Known divergences from the original audio

These affect timbre, not which notes play:

- **Noise period is doubled twice.** The ASM doubles the noise-period byte before writing
  register 6 (`add a, a` in `ChkCmd_1x`); `PsgEmulator.GenerateSamples` then multiplies
  again by 2. Net: noise pitches an octave lower than a real AY-3-8910 would produce. Real
  fix is to drop the `* 2` in `GenerateSamples` and verify against openMSX.
- **Envelope-volume mode** is implemented in the PSG emulator, and the instrument/SFX
  reader now reads the env-period bytes correctly, but `UpdateVolume` always writes the raw
  volume. The ASM equivalent (`UpdateChVol2`) sets bit 4 of the volume register to switch
  the channel to envelope-controlled amplitude when CONFIG bit 3 is set. Adding that would
  make SnareDrum / BassDrum sound closer to the original.
- **Logarithmic volume curve** in `PsgEmulator.VolumeTable` is the datasheet's ≈3 dB/step
  approximation, not measured against a real chip.
