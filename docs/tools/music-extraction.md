# Music data extraction (`extract_music.py`)

`extract_music.py` is a one-shot tool that converts the assembled music data into a C# file
the player can compile. It reads `MetalGear.lst` (produced as a side effect of `sjasm` —
this assembly step runs in the separate disassembly repo,
https://github.com/southernsun/MetalGear, cloned as a sibling at `../MetalGear`),
pulls out every assembled byte in the music address range, and emits
[`Tools/ThemeOfTaraPlayer/MusicCatalog.cs`](../../Tools/ThemeOfTaraPlayer/MusicCatalog.cs). It's used by
the [Music + SFX Player](sound-player.md).

> **Note:** `.asm` / `file:line` citations and `room_images/` references in this doc refer to the separate MSX disassembly repo ([southernsun/MetalGear](https://github.com/southernsun/MetalGear)), expected as a sibling clone at `../MetalGear`.

## Why parse the listing instead of the `.asm` files

The naive approach is to translate each `sound/music/*.asm` into a C# byte array by hand.
That was how `ThemeOfTaraData.cs` (now removed) worked — ~600 lines per song, eight songs ×
hours each, plus manually resolving every `dw MusXyz` label into a relative offset and
re-doing it whenever the music is edited.

The driver references song positions by **absolute MSX RAM address** in the bytestream
(`FE xx aabb` = loop/call/goto to MSX address `aabb`). So any extraction approach must
either:

1. Re-base every word reference (find every `0xFE …`, rewrite the address) — needs a full
   mini-parser of the byte language, fragile, easy to miss a corner case.
2. Keep the absolute addresses intact and let the engine use them as direct indices into a
   buffer whose byte `i` holds whatever was assembled at MSX address `i`.

Option 2 is what the port does. The buffer is `0x87B7` bytes (~34 KB, `= SOUND_END`): the
music block is `0x71B2..0x8657`, with the early SFXs below it (`0x6950..0x71B1`) and the late
SFXs above (`0x8658..0x87B6`); the leading 29 KB are unused zeroes. Trivial memory cost, zero
address-rewriting.

## How the listing is parsed

sjasm emits assembled bytes in two formats on the same line type:

```text
00038+++7285 EF D7 C3    Mus_ThemeTara:    db 0EFh,0D7h,0C3h
00006+++71B2 EFD7FA03EC53E23341F72241E90443B3
```

The first is a short `db` rendered alongside its source text — bytes are space-separated.
The second is a long `db` that exceeded the line budget and got rendered on its own — bytes
are one concatenated hex blob, no source on the line.

The extractor:

1. Matches lines starting `^\d+\+\+\+([0-9A-F]{4})\s+(.*)`.
2. Splits the rest to isolate the bytes column from any source text. The regex matches
   **either** a concatenated 4..32-hex-char blob **or** 1..4 single-space-separated `XX`
   chunks explicitly (the earlier "split on 2+ whitespace" heuristic silently dropped any
   short `db` where sjasm packed the source text right after a 4-byte run with a single
   space — which zeroed `Sfx_Laser`'s bytes and made it play wrong).
3. Verifies the bytes column is purely hex (filters out label-declaration lines).
4. Pulls all 2-hex-char pairs and writes them into the buffer at `addr + i`.

Labels are separately captured with `^\d+\+\+\+([0-9A-F]{4}).*?\s([A-Za-z_]\w*):` to get
the MSX address of every `Foo:` declaration. The first definition wins.

The hard-coded address window (`SOUND_START = 0x6950`, `SOUND_END = 0x87B7`) covers the
entire sound region — early SFXs (`0x6950..0x71B1`), the music block (`0x71B2..0x8657`) and
late SFXs (`0x8658..0x87B6`). If you ever shift the assembly layout substantially, update
these constants.

### Single-channel SFXs

The original game's SFX channel runs alongside the 3 music channels; in this port there's
no fourth PSG channel, so a single-channel SFX (`Sfx_Propeller`, `Sfx_BulletShot`, … — IDs
`0x02..0x27`) plays on channel A only. Channels B and C are pointed at `Sfx_Dummy`
(`db 0FFh`), which the engine reads on the first frame as a RET/END and immediately shuts
the channel down. The `SILENT_FILLER_LABEL` constant names the filler.

### Multi-channel SFXs

A handful (`Sfx_MenuLogoUp`, `Sfx_Pause`, `Sfx_RadioNoise`, `Sfx_BigBossDead`,
`Sfx_EndingExplosion`) come with three channel streams of their own — those go into the
catalog with the actual three labels. Some entries use `Sfx_None2` or `Sfx_Dummy` for an
unused channel; that's faithful to the source and ends that channel cleanly.

## How to regenerate the catalog

Whenever you edit `sound/music/*.asm` or `sound/instruments.asm` (step 1 runs in the
**disassembly** repo, `../MetalGear`, where the `.asm` sources and `MetalGear.asm`/`run.bat`
live; step 2 runs here and reads that repo's `MetalGear.lst` via the sibling / `MG_ROM_DIR`):

```bash
# 1. (in ../MetalGear) Reassemble the ROM — this also rewrites MetalGear.lst
sjasm MetalGear.asm MetalGear.rom

# 2. (in this repo) Extract music data into C# (reads ../MetalGear/MetalGear.lst)
py Tools/ThemeOfTaraPlayer/extract_music.py

# 3. Rebuild the player
dotnet build Tools/ThemeOfTaraPlayer/ThemeOfTaraPlayer.csproj
```

The extractor reports how many non-zero bytes it pulled and which songs resolved. If a song
fails to resolve, the script `SystemExit`s with the missing label name — usually a renamed
label or a music file not `include`d in `sounddata.asm`.

## When to expand the `SONGS` table

If you add a new song:

1. Add it to `sounddata.asm`'s `idxSoundData` table with three sequential
   `dw Mus_NewSong[ABC]` entries.
2. Include the new `sound/music/NewSong.asm` after the existing music includes.
3. Add a `("Display Name", "Mus_NewSong", "Mus_NewSongB", "Mus_NewSongC")` entry to `SONGS`
   in `extract_music.py`.
4. Re-run sjasm + the extractor.

If you add a new *sound effect*, the catalog doesn't need touching — SFX scope is fixed
today.

## What if `MetalGear.lst` isn't available

The extractor reads the listing from the disassembly repo (`../MetalGear/MetalGear.lst`, or
`$MG_ROM_DIR/MetalGear.lst`); `run.bat` produces it there as a side effect of assembling. If
you've cloned the disassembly without assembling, run the assembler once first.
`.gitignore` excludes `*.lst` and `*.rom`, so they're never committed.

A future enhancement could parse the `.asm` files directly (the `db` literals plus label
tracking would be straightforward — the music language has no expressions or macros). For
now, requiring `MetalGear.lst` is the simplest correct approach.
