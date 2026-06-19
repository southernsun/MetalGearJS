# How the original ASM sound driver works

> **Note:** `.asm` / `file:line` citations and `room_images/` references in this doc refer to the separate MSX disassembly repo ([southernsun/MetalGear](https://github.com/southernsun/MetalGear)), expected as a sibling clone at `../MetalGear`.

The driver lives in [`sound/bgmdriver.asm`](https://github.com/southernsun/MetalGear/blob/master/sound/bgmdriver.asm) (~1355 lines). It's
called once per frame by the 60 Hz vsync interrupt handler, walks four channel work areas
(3 music + 1 SFX), and writes PSG registers. This doc covers the parts that matter for
music playback — pause/resume, SFX priorities, and the radio-noise frequency hack are
skipped.

The byte-stream language each channel reads is documented separately in
[music-format.md](music-format.md); this doc covers the *executor*, not the *instruction
set*.

## Channel work area (`constants/structures/sound.asm`)

Each channel has a 32-byte `SOUND` structure:

| Offset | Field | Used for |
|--------|-------|----------|
| 0 | `NOTE_COUNTER` | Frames remaining on the current note. Decremented every frame; when it hits 0 the next command is fetched. |
| 1 | `NOTE_LENGTH` | Total duration of the current note (for re-arming `NOTE_COUNTER` on certain branches). |
| 2 | `ID` | 0 = channel inactive. Set when music starts. |
| 3–4 | `POINTER_L/H` | Current position in the byte stream. |
| 5 | `CONFIG` | Bit 3 = envelope, bit 2 = set-env-freq, bit 1 = tone on, bit 0 = noise on. |
| 6 | `TEMPO` | Note-length multiplier (see music-format.md). |
| 7 | `ATTACK_VOL` | Initial volume after an ADSR command (`AttackVol = nibble + 1`). |
| 8 | `DECAY_VOL` | Live volume during decay/release. |
| 9 | `OCTAVE` | 0–7. Frequency = base << octave. |
| 10 | `DECAY_CNT` | Counts down the ADSR envelope (see below). |
| 11 | `LOOP_CNT` | Number of times the current `0xFE nn` loop has fired. |
| 12 | `DECAY_STEPS` | Number of decay frames after note onset. |
| 13 | `RELEASE` | Number of release frames before note end. |
| 14 | `NOTE_MODE` | 1 = music-notation mode, 0 = SFX-direct mode. |
| 15 | `FREQ_MOD` | bit 3 = detune, bit 2 = vibrato on, bit 0 = vibrato-attack-done. |
| 16 | `INSTRUMENT` | 0 = no instrument; else ID looked up in instruments.asm. |
| 17–18 | `INSTRUMENT_L/H` | Pointer into the current instrument's data sub-stream. |
| 19 | `INSTRUMENT_CNT` | Frames remaining on current instrument step. |
| 20 | `INSTRUMENT_LENGTH` | Duration that the last `0x2x` config applied — re-used for each subsequent freq/vol step until the next config. |
| 21–22 | `FREQ_LOW/HIGH` | Current PSG period (16-bit, only low 12 actually reach the chip). |
| 23 | `VOLUME` | Live volume (or envelope shape if envelope mode). |
| 24–25 | `RETURN_L/H` | Return address for `CALL` — single level, no nesting. |
| 26 | `VIBRATO_WAIT` | Frames since last vibrato pulse (or attack-window count). |
| 27 | `VIBRATO_CLK` | Toggles between increment and decrement direction. ASM uses `cpl`. |
| 28 | `VIBRATO_CFG` | Speed (high nibble) and intensity (low nibble) from the `0xEC` command. |
| 29–31 | unused | — |

`LOOP_CNT` and `RETURN_L/H` are both single-slot, which is why no song nests CALLs or has
loops-within-loops.

## Per-frame flow (`UpdateSound`)

For each of the 4 channels:

1. **If `ID == 0`** — channel idle, skip it.
2. **Else dispatch on `NOTE_MODE`:**
   - `NOTE_MODE = 1` → `NoteLogic`: decrement `NOTE_COUNTER`, then either fetch next
     command (counter hit 0) or update ADSR/vibrato/instrument tick.
   - `NOTE_MODE = 0` → SFX-direct path: read raw config/freq/vol bytes from the stream.

The driver always writes the PSG mixer (`reg 7`) once at the top of `UpdateSound`, before
processing any channel.

### `NoteLogic` (music notation mode)

```text
NoteLogic:
    dec NOTE_COUNTER
    if NOTE_COUNTER == 0: jump to ProcessChannelData3   ; fetch next command
    if MuteSoundFlag set: return                        ; muted — leave PSG alone

    if INSTRUMENT != 0: jump to InstrumentTick          ; instrument is steering this note
    if FREQ_MOD bit 2 set: call ChkVibratoAttack        ; vibrato modulates frequency

    ; ADSR — see below
    dec DECAY_CNT
    if DECAY_CNT != NOTE_COUNTER:
        dec DECAY_CNT          ; we're inside the decay window
        Decay
    else if RELEASE >= DECAY_CNT:
        Decay                  ; release window
    else:
        ; sustain — volume held
```

`Decay`/`Decay2` (`sound/bgmdriver.asm:424`/`:427`) decrement `DECAY_VOL` by 1 and write the
volume to the PSG, unless `DECAY_VOL` is already 0 (in which case it bails out — `dec a;
jp m, …` protects against underflow).

### ADSR shape, in detail

When a note starts, `SetNote`/`SetNote2` (`sound/bgmdriver.asm:662`/`:672`) set:

```text
DECAY_VOL = ATTACK_VOL                         ; initial loud
VOLUME    = ATTACK_VOL
DECAY_CNT = NOTE_LENGTH + DECAY_STEPS          ; total decay+sustain+release budget
NOTE_COUNTER = NOTE_LENGTH                     ; total note duration
```

So `DECAY_CNT` starts `DECAY_STEPS` ahead of `NOTE_COUNTER`. Each frame:

- Both counters drop by 1 (`NOTE_COUNTER` at the top, `DECAY_CNT` from the ADSR block).
- *If they differ* — still inside the decay window — `DECAY_CNT` drops by an additional 1
  and volume falls by 1. This burns the `DECAY_STEPS` gap in `DECAY_STEPS` frames,
  dropping volume by `DECAY_STEPS` along the way.
- Once they're equal, sustain begins. Volume holds.
- When `DECAY_CNT` falls inside the release window (`RELEASE >= DECAY_CNT`), volume drops
  by 1 per frame for the last `RELEASE` frames.

This is non-obvious enough that the C# port had it implemented as
`if (DecayCount % DecaySteps == 0)` — completely the wrong shape — until it was traced
byte-by-byte against the ASM.

### Vibrato

Vibrato has two phases:

1. **Attack delay** — `ChkVibratoAttack` waits 10 frames before the first pulse, so
   vibrato doesn't kick in immediately on note onset. `VIBRATO_WAIT` counts up; when it
   hits 10, `FREQ_MOD` bit 0 is set ("attack done") and the wait resets to 0.
2. **Pulse** — `VibratoLogic` runs every frame thereafter. The speed nibble in
   `VIBRATO_CFG` says how many frames between freq adjustments. On each pulse,
   `VIBRATO_CLK` is complemented (`cpl`) and the intensity nibble is added or subtracted
   from `FREQ_LOW/HIGH`.

The direction-on-first-pulse subtlety: `VIBRATO_CLK` starts at 0, `cpl` flips to 0xFF,
then `jr nz` takes the *decrement* branch. So the very first vibrato cycle nudges the
pitch *down*, not up. The C# port had this inverted at first.

### Instrument tick

If `INSTRUMENT != 0` and the note isn't over, control jumps to `InstrumentTick`:

```text
InstrumentTick:
    dec INSTRUMENT_CNT
    if INSTRUMENT_CNT != 0: return         ; still on current step

    ; Current step finished — fetch next instrument byte
    HL = INSTRUMENT_L/H
    if (HL) == 0xFF: jump to MuteChannel   ; instrument done — silence
    jump to ChkCmd_2x                       ; reuse the SFX-direct parser
```

So instrument playback layers an inner state machine on top of the outer note-mode loop.
The outer `NOTE_COUNTER` controls *how long* the channel plays this instrument; the inner
`INSTRUMENT_CNT` controls *what step within the instrument's envelope* is sounding.

## Command fetch (`ProcessCommand` and friends)

When `NOTE_COUNTER` hits 0, control reaches `ProcessChannelData3`, which fetches the byte
at `POINTER` and dispatches:

1. `0xFE` → loop/call/goto/mode-swap (`CmdLoopLogic`).
2. `0xFF` → return-from-call if `RETURN_H != 0`, else end-of-channel (`CmdEndLogic`).
3. Otherwise enter `ProcessCommand`, which sequentially tests:
   - `0xDx` — set tempo, fall through to read the next byte.
   - `0xF0..0xFD` — ADSR: store `ATTACK_VOL`, `DECAY_STEPS`, `RELEASE`, then read next byte.
   - `0xE0..0xE7` — set octave, fall through.
   - `0xE8` — set detune flag, fall through.
   - `0xEC xy` — set vibrato config + flag, fall through (`jp NextCmd`).
   - `0xEF` — note OFF: clear `FREQ_MOD` and `INSTRUMENT`, fall through.
   - `0xE9 ii` — set instrument, *fall through to SetNote* — meaning `0xE9 ii NOTE` is
     effectively a 3-byte sequence that immediately plays the next note with the
     instrument applied.
   - `0xCx` — silence: `MuteNote` zeroes `FREQ_LOW/HIGH` and `VOLUME`, arms
     `NOTE_COUNTER`, writes PSG.
   - `0x-Bx` and below — note: `SetNote` computes duration from tempo+nibble, re-reads the
     byte for the high-nibble note value, computes the period from
     `NoteFrequency[note] << OCTAVE`, and writes PSG.

Most non-note commands "fall through" and immediately fetch the next byte, so a frame can
process many configuration bytes followed by exactly one note (which returns).

## PSG register layout the driver writes

| Register | Purpose | Driver function |
|----------|---------|-----------------|
| 0,1 | Channel A frequency (12-bit) | `WrtPsgChnFreq` with `c=1` |
| 2,3 | Channel B frequency | `c=3` |
| 4,5 | Channel C frequency | `c=5` |
| 6 | Noise period (5-bit) | `SetNoisePeriod` (after `add a, a` — the game doubles the period before writing) |
| 7 | Mixer (3 tone-enable bits + 3 noise-enable bits, all inverted) | `SetPsgMixer` / `UpdateMixer` |
| 8,9,10 | Volume for channels A/B/C (or envelope shape if bit 4 set) | `SetChnVolume` |
| 11,12 | Envelope period (16-bit) | `SfxLogic` only, when CONFIG bit 3 + bit 2 are set |
| 13 | Envelope shape | `UpdateChVol2` |

The `c` register tracks the *frequency-high* PSG register for the current channel (1, 3,
or 5). Volume register is derived as `((c >> 1) | 0x88) & 0x0F | 0x08` — pragmatically:
A→8, B→9, C→10.

How the C# port mirrors this engine is in [../tools/sound-player.md](../tools/sound-player.md).
