# Music byte-stream format

Every song in `sound/music/*.asm` is a sequence of single bytes (with the occasional
embedded word for branch targets) interpreted by the BGM driver. Each of the three music
channels has its own independent stream that the driver walks through at 60 Hz. This doc
is the *instruction set*; [sound-driver.md](sound-driver.md) is the *executor*.

> **Note:** `.asm` / `file:line` citations and `room_images/` references in this doc refer to the separate MSX disassembly repo ([southernsun/MetalGear](https://github.com/southernsun/MetalGear)), expected as a sibling clone at `../MetalGear`.

## Quick reference

| Byte(s) | Name | Effect |
|---------|------|--------|
| `0x-0x` .. `0x-Bx` | Note + duration | High nibble = note (0=C, 1=C#, … 11=B). Low nibble = duration index. |
| `0xCx` | Rest | Silence for `x+1` tempo units (low nibble = duration). Equivalent to a note with no pitch/volume. |
| `0xDx` | Tempo | Set `TEMPO = x` (low nibble). All subsequent note/rest durations scale by this. |
| `0xE0` .. `0xE7` | Octave | Set `OCTAVE = x` (low nibble, 0–7). |
| `0xE8` | Detune | Set the detune flag — next note's frequency gets `+1`. |
| `0xE9 ii` | Instrument | Set `INSTRUMENT = ii`. The *next* note plays with that instrument; subsequent notes inherit it until `0xEF` clears it. |
| `0xEC xy` | Vibrato | Enable vibrato. `x` = speed (frames between cycles), `y` = intensity (frequency offset). |
| `0xEF` | Note OFF | Clear instrument, detune and vibrato. (Volume is **not** zeroed — it carries over.) |
| `0xFx yz` | ADSR (`x` in `0..D`) | `AttackVol = x+1`, `DecaySteps = y`, `Release = z`. Applies to subsequent notes. |
| `0xFE nn aabb` | Loop (n times) | Loop back to address `aabb` until visited `n` times. `n` is the high byte; `aabb` is little-endian. |
| `0xFE FE aabb` | GOTO | Jump to address `aabb` unconditionally (used for infinite outer loops). |
| `0xFE FF aabb` | CALL | Push current pointer as return address, jump to `aabb`. Returns on next `0xFF`. |
| `0xFE 00` | Mode swap | Toggle `NOTE_MODE` between music-notation mode and SFX-direct mode. |
| `0xFF` | RET / END | Return from `CALL` if a return address is set, otherwise mark channel finished. |

The driver dispatches by first checking for `0xFE` / `0xFF`, then the `0xFx` / `0xEx` /
`0xDx` ranges (so a `0xCx` rest falls through to the catch-all note path with note value
12, which the inner SetNote treats as silence — see [sound-driver.md](sound-driver.md)).

## Notes, octaves, duration

**Notes** are the 12 chromatic pitches starting at C:

| Index | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
|-------|---|---|---|---|---|---|---|---|---|---|----|----|
| Note  | C | C# | D | D# | E | F | F# | G | G# | A | A# | B |

Each index maps to a base period in [`NoteFrequency`](https://github.com/southernsun/MetalGear/blob/master/sound/bgmdriver.asm)
(`db 6Bh, 65h, 5Fh, 5Ah, 55h, 50h, 4Ch, 47h, 43h, 40h, 3Ch, 39h`). The PSG period for the
actual pitch is `base << OCTAVE` (left-shifted by the current octave, so octave 7 is 128×
the base).

`base = 0x6B` is octave-0 C. With the MSX2's 1.7898 MHz PSG clock and the standard ÷16
prescaler, that gives ≈ 1045 Hz — high C5/C#5 in concert pitch. So "octave 0" in this
notation is roughly MSX octave 5 (highest pitch range) and higher octave values shift
*down*.

**Duration**:

```text
duration_frames = TEMPO                     if low_nibble == 0
                = TEMPO * (low_nibble + 1)   otherwise
```

So with `TEMPO = 7` (the default in Theme of Tara), a `0x33` note is D# for `7 * 4 = 28`
frames ≈ 467 ms.

## Instruments

`0xE9` doesn't carry the instrument's data — it just sets the instrument *ID*. The driver
looks up the data via a per-ID dispatch in [`sound/instruments.asm`](https://github.com/southernsun/MetalGear/blob/master/sound/instruments.asm),
and that data uses a different sub-format:

| Byte(s) | Effect |
|---------|--------|
| `0x2x dd` | Config byte (`2x` selects this branch; the low nibble `x` packs the same Use-Envelope / Set-Env-Freq / Tone-on / Noise-on bits as `SOUND.CONFIG`). `dd` = duration in frames for this and subsequent freq/vol steps until the next config byte. |
| `0x1x` | Noise period = `x * 2`. Writes directly to PSG register 6. |
| `VF LL` | Freq/vol step. `V` (high nibble of first byte) = volume 0–15. `F` (low nibble) = top 4 bits of PSG period. `LL` (second byte) = low 8 bits. Only emitted when tone is enabled; for noise-only configs the second byte is omitted. |
| `0xFF` | End of instrument data — channel returns to note mode. |

So a single "note" with an instrument plays through a *sequence* of freq/vol steps, each
held for the duration set by the last config byte. That's how drums get their envelope,
how slap bass gets its pitch-bend attack, etc.

A worked example — `Bass1` (instrument 5, note C):

```asm
0x22, 0x01,         ; config: tone ON noise OFF, each step holds 1 frame
0xC6, 0xAE,         ; vol=12  period=0x6AE
0xC3, 0x57,         ; vol=12  period=0x357
0x22, 0x04,         ; new config: same as above but steps now hold 4 frames each
0xC6, 0xAE,         ; vol=12  period=0x6AE  (repeats the attack pitch louder)
0xB6, 0xB0,         ; vol=11  period=0x6B0
0xA6, 0xB2,         ; vol=10  …decaying envelope
0x96, 0xB4,
0x86, 0xB6,
0x86, 0xB8,
0x76, 0xBA,
0x76, 0xBC,
0x66, 0xBE,
0x66, 0xC0,
0xFF                ; end → back to note mode
```

Crucial gotcha that bit the C# port: the byte order is `[Vol|FreqHi]` then `[FreqLo]`. An
earlier draft had Vol and FreqLo swapped — every drum and bass note came out at the wrong
pitch.

## Branch targets (`0xFE …`)

All branch addresses are absolute MSX RAM addresses, stored little-endian (low byte
first). When sjasm assembles the music (this assembly step runs in the separate
disassembly repo, https://github.com/southernsun/MetalGear, cloned as a sibling at
`../MetalGear`), every `dw MusXyz` resolves to whatever MSX address `MusXyz` ended up at
— typically `0x71B2 .. 0x8657` for this game.

The C# port preserves these as-is by treating the music data as a 34 KB byte array
indexed by MSX address, so `pointer = address` works without rebasing. See
[../tools/music-extraction.md](../tools/music-extraction.md) for the trade-off.
