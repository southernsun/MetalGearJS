"""
One-shot extractor: parse MetalGear.lst, pull the assembled music data bytes
out of the music address range (0x71B2 .. 0x8657), find the start address of
each song's three channels, and emit C# source (MusicCatalog.cs).

Why parse the .lst instead of hand-translating each .asm?  The driver
references song positions by absolute MSX address inside the bytestream
(FE xx AABB = loop/call/goto AABB). Re-basing those by hand for 7 songs is
error-prone. The simplest correct port is to keep the absolute addresses
intact and let the engine use them as direct indices into a buffer that
spans 0x0000..end-of-music — i.e. an array whose byte i holds whatever was
assembled at MSX address i.

Run once after rebuilding the ROM (sjasm MetalGear.asm MetalGear.rom):

    py extract_music.py
"""

from __future__ import annotations

import re
from pathlib import Path

# SFX data lives before and after the music block. To keep the engine's
# absolute-MSX-address indexing trick working for everything in one buffer,
# we extract the whole sound region in a single sparse byte array.
#
# Confirmed from the listing:
#   Sfx_RadioNoise       starts at 0x6950 (first SFX byte)
#   ThemeOfTaraShared1   starts at 0x71B2 (first music byte)
#   Mus_GameOverC tail   ends at 0x8657
#   Sfx_EndingExploxB    ends at 0x87B6 (last SFX byte)
SOUND_START = 0x6950
SOUND_END = 0x87B7  # exclusive

# Filler label that's just `db 0FFh`. Single-channel SFXs point channels B
# and C at this so they hit `0xFF` (RET / END) on the first frame and stay
# silent for the rest of the SFX. There are several such labels in the ROM
# (Sfx_None, Sfx_Dummy, Sfx_None2); Sfx_Dummy is the canonical one.
SILENT_FILLER_LABEL = "Sfx_Dummy"

# Music tracks. (category, display name, channel-A label, channel-B, channel-C)
MUSIC = [
    ("Theme of Tara (intro)", "Mus_IntroTara",  "Mus_IntroTaraB",  "Mus_IntroTaraC"),
    ("Theme of Tara",         "Mus_ThemeTara",  "Mus_ThemeTaraB",  "Mus_ThemeTaraC"),
    ("Red Alert",             "Mus_RedAlert",   "Mus_RedAlertB",   "Mus_RedAlertC"),
    ("Alert",                 "Mus_Alert",      "Mus_AlertB",      "Mus_AlertC"),
    ("Sneaking Mission",      "Mus_Basement",   "Mus_BasementB",   "Mus_BasementC"),
    ("Metal Gear TX-55",      "Mus_MetalGear",  "Mus_MetalGearB",  "Mus_MetalGearC"),
    ("Beyond Big Boss",       "Mus_Escape",     "Mus_EscapeB",     "Mus_EscapeC"),
    ("Mercenary (Boss)",      "Mus_Boss",       "Mus_BossB",       "Mus_BossC"),
    ("Return of Fox Hunter",  "Mus_Ending",     "Mus_EndingB",     "Mus_EndingC"),
    ("Just Another Dead Soldier", "Mus_GameOver", "Mus_GameOverB", "Mus_GameOverC"),
]

# Single-channel SFXs (IDs 0x02..0x27 in idxSoundData). Channels B and C get
# filled with the silent terminator. Order mirrors the index table so the
# UI list reads naturally.
SFX_SINGLE = [
    ("Hind D propeller",       "Sfx_Propeller"),
    ("Dog bark",               "Sfx_DogBark"),
    ("Laser shot",             "Sfx_Laser"),
    ("Bullet shot",            "Sfx_BulletShot"),
    ("Boomerang",              "Sfx_Boomerang"),
    ("Pitfall opens",          "Sfx_Pitfall"),
    ("Punch guard",            "Sfx_PunchGuard"),
    ("Punch wall",             "Sfx_PunchWall"),
    ("Punch breakable wall",   "Sfx_PunchWallBrk"),
    ("Tank shell whistle",     "Sfx_ShellWhistle"),
    ("Hand gun shot",          "Sfx_HandGunShot"),
    ("SMG shot",               "Sfx_SmgShot"),
    ("Suppressed shot",        "Sfx_FireShotSup"),
    ("Shotgunner shot",        "Sfx_ShotGunner"),
    ("Damage",                 "Sfx_Damage"),
    ("Pushed back by roof air","Sfx_RoofAir"),
    ("Grenade throw",          "Sfx_GrenadeShot"),
    ("Tank shell shot",        "Sfx_ShellShot"),
    ("Missile launch",         "Sfx_MissileShot"),
    ("Click / no ammo",        "Sfx_Click"),
    ("Guard dead",             "Sfx_GuardDead"),
    ("Plastic bomb / mine set","Sfx_PB_MineSet"),
    ("Electric floor damage",  "Sfx_ElecDamage"),
    ("Door",                   "Sfx_Door"),
    ("Explosion (grenade)",    "Sfx_Explosion"),
    ("Elevator door",          "Sfx_DoorElevator"),
    ("Plastic bomb explosion", "Sfx_Explosion2"),
    ("Rolling barrel hit",     "Sfx_BarrelHit"),
    ("Wall broken",            "Sfx_WallBroken"),
    ("Lorry moving",           "Sfx_LorryMoving"),
    ("Menu cursor move",       "Sfx_MenuMove"),
    ("Use item",               "Sfx_UseItem"),
    ("Incoming radio call",    "Sfx_RadioCall"),
    ("Text print",             "Sfx_TextPrint"),
    ("Pick up item",           "Sfx_PickItem"),
    ("Spawn item",             "Sfx_SpawnItem"),
    ("Rank up",                "Sfx_RankUp"),
    ("Rank down",              "Sfx_RankDown"),
]

# Multi-channel SFXs (3 channels). Some channels use a silent-filler label
# in the original (e.g. Sfx_None2) — we keep the original labels here.
SFX_MULTI = [
    ("Menu logo moves up",     "Sfx_MenuLogoUp",   "Sfx_MenuLogoUpB",  "Sfx_MenuLogoUpC"),
    ("Menu logo stops",        "Sfx_MenuLogoEnd",  "Sfx_MenuLogoEndB", "Sfx_Dummy"),
    ("Pause",                  "Sfx_Pause",        "Sfx_PauseB",       "Sfx_PauseC"),
    ("Radio noise",            "Sfx_RadioNoise",   "Sfx_RadioNoiseB",  "Sfx_RadioNoiseC"),
    ("Big Boss dies",          "Sfx_BigBossDead",  "Sfx_BigBossDeadB", "Sfx_None2"),
    ("Ending explosion",       "Sfx_None2",        "Sfx_EndingExplox", "Sfx_EndingExploxB"),
]

def _find_rom_root(start: Path) -> Path:
    """Locate the MSX disassembly (the dir holding MetalGear.asm).

    The disassembly was split into the sibling repo southernsun/MetalGear; it is expected at
    ../MetalGear (override with the MG_ROM_DIR env var). Falls back to a legacy in-tree copy.
    """
    import os
    env = os.environ.get("MG_ROM_DIR")
    if env and (Path(env) / "MetalGear.asm").exists():
        return Path(env).resolve()
    start = start.resolve()
    for cand in (start, *start.parents):
        if (cand / "MetalGear.asm").exists():          # legacy: in this tree
            return cand
        if (cand.parent / "MetalGear" / "MetalGear.asm").exists():  # sibling ../MetalGear
            return (cand.parent / "MetalGear").resolve()
    raise SystemExit(
        "Could not locate the disassembly (MetalGear.asm). Clone southernsun/MetalGear as a "
        "sibling so it is at ../MetalGear, or set MG_ROM_DIR to its location."
    )


ROM_ROOT = _find_rom_root(Path(__file__).parent)
LST_PATH = ROM_ROOT / "MetalGear.lst"
OUT_PATH = Path(__file__).resolve().parent / "MusicCatalog.cs"

# sjasm emits two styles for assembled bytes after the address:
#   short db  : "00038+++7285 EF D7 C3    Mus_ThemeTara: db 0EFh,0D7h,0C3h"
#               "00001+++7197 FE 00 22 01 Sfx_Laser:    db 0FEh,   0, 22h,    1"
#   long db   : "00006+++71B2 EFD7FA03EC53E23341F72241E90443B3"
# We match each form with a separate alternation right after the address —
# tried the 2+-whitespace split-then-validate approach first and it silently
# dropped any short-db whose 4 bytes were followed by source code with only a
# single space separator (which is exactly how sjasm formats 4-byte short
# rows; Sfx_Laser's 8 bytes were going AWOL because of this).
ADDR_LINE_RE = re.compile(r"^\d+\+\+\+([0-9A-F]{4})\s(.*)$")
# Concatenated form: an even number of hex chars (4..32) followed by end-of-line
# or whitespace. Continuation lines from a long `db` can be any length up to
# 16 bytes (32 hex chars).
CONCAT_BYTES_RE = re.compile(r"^((?:[0-9A-F]{2}){2,16})(?:\s|$)")
# Space-separated form: 1..4 chunks of `XX` separated by single spaces. sjasm
# only uses this when the bytes fit alongside the source text on one line.
SPACED_BYTES_RE = re.compile(r"^([0-9A-F]{2}(?: [0-9A-F]{2}){0,3})(?:\s|$)")

# A label-defining source line looks like:
#   "00038+++7285 EF D7 C3    Mus_ThemeTara:	    db 0EFh,0D7h,0C3h"
# or:
#   "00006+++71B2             ThemeOfTaraShared1: db ..."
# We just want the address and label name; the bytes (if any) come from the
# assembled-bytes line which we parse separately.
LABEL_RE = re.compile(r"^\d+\+\+\+([0-9A-F]{4}).*?\s([A-Za-z_][A-Za-z0-9_]*):")


def parse_listing(lst_path: Path) -> tuple[bytearray, dict[str, int]]:
    """Return (bytes-by-MSX-address, label-name -> MSX-address)."""
    buffer = bytearray(SOUND_END)
    labels: dict[str, int] = {}

    with lst_path.open("r", encoding="utf-8", errors="replace") as f:
        for line in f:
            # Capture label addresses anywhere — we'll filter by address range
            # when we look them up.
            m = LABEL_RE.match(line)
            if m:
                addr = int(m.group(1), 16)
                name = m.group(2)
                # First definition wins (don't let identically-named labels in
                # other contexts overwrite — none expected, but be safe).
                labels.setdefault(name, addr)

            m = ADDR_LINE_RE.match(line.rstrip())
            if not m:
                continue

            addr = int(m.group(1), 16)
            if addr < SOUND_START or addr >= SOUND_END:
                continue

            rest = m.group(2)
            cm = CONCAT_BYTES_RE.match(rest)
            if cm:
                hex_chars = cm.group(1)
                pairs = [hex_chars[i:i + 2] for i in range(0, len(hex_chars), 2)]
            else:
                sm = SPACED_BYTES_RE.match(rest)
                if not sm:
                    # No bytes on this line (pure comment / label / include).
                    continue
                pairs = sm.group(1).split()

            for i, pair in enumerate(pairs):
                a = addr + i
                if a >= SOUND_END:
                    break
                buffer[a] = int(pair, 16)

    return buffer, labels


def emit_csharp(buffer: bytearray, labels: dict[str, int]) -> str:
    def resolve(label: str) -> int:
        try:
            return labels[label]
        except KeyError:
            raise SystemExit(
                f"Label {label!r} not found in {LST_PATH.name}. "
                f"Has the ROM been re-assembled?"
            )

    filler = resolve(SILENT_FILLER_LABEL)

    # Resolve every catalog entry up-front so any missing label fails the
    # extractor before we start writing the C# file.
    resolved: list[tuple[str, str, int, int, int]] = []
    for display, a, b, c in MUSIC:
        resolved.append(("Music", display, resolve(a), resolve(b), resolve(c)))
    for display, a in SFX_SINGLE:
        # Single-channel SFX: only channel A carries data; B and C immediately
        # hit `0xFF` at the filler and shut down.
        resolved.append(("SFX", display, resolve(a), filler, filler))
    for display, a, b, c in SFX_MULTI:
        resolved.append(("SFX", display, resolve(a), resolve(b), resolve(c)))

    lines: list[str] = []
    lines.append("// <auto-generated>")
    lines.append("// Generated by extract_music.py from MetalGear.lst.")
    lines.append("// Do not edit by hand — re-run the extractor instead.")
    lines.append("// </auto-generated>")
    lines.append("")
    lines.append("namespace ThemeOfTaraPlayer;")
    lines.append("")
    lines.append("public static class MusicCatalog")
    lines.append("{")
    lines.append("    public record Song(string Category, string Name, int Channel1, int Channel2, int Channel3)")
    lines.append("    {")
    lines.append("        // What the ComboBox shows. Prefixing the category keeps everything")
    lines.append("        // discoverable in a single flat list (sorted music-first by source order).")
    lines.append("        public string DisplayName => $\"{Category} \\u2014 {Name}\";")
    lines.append("    }")
    lines.append("")
    lines.append("    public static readonly Song[] Songs = new[]")
    lines.append("    {")
    for category, display, c1, c2, c3 in resolved:
        safe = display.replace("\\", "\\\\").replace("\"", "\\\"")
        lines.append(
            f"        new Song(\"{category}\", \"{safe}\", "
            f"0x{c1:04X}, 0x{c2:04X}, 0x{c3:04X}),"
        )
    lines.append("    };")
    lines.append("")
    lines.append(f"    // The sound byte stream, indexed by MSX RAM address.")
    lines.append(f"    // Covers both early SFXs (0x{SOUND_START:04X}+) and the music block (0x71B2..0x8657)")
    lines.append(f"    // plus late SFXs (0x8658..0x{SOUND_END:04X}). Leading bytes are unused padding.")
    lines.append(f"    public static readonly byte[] Data = new byte[]")
    lines.append("    {")

    for row_start in range(0, len(buffer), 16):
        row = buffer[row_start:row_start + 16]
        hex_tokens = ", ".join(f"0x{b:02X}" for b in row)
        lines.append(f"        {hex_tokens},")

    lines.append("    };")
    lines.append("}")
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    buffer, labels = parse_listing(LST_PATH)
    non_zero = sum(1 for b in buffer[SOUND_START:SOUND_END] if b != 0)
    total = SOUND_END - SOUND_START
    if non_zero == 0:
        raise SystemExit(
            f"No sound bytes extracted from {LST_PATH.name}. Check the .lst format."
        )
    print(f"Extracted {non_zero}/{total} non-zero sound bytes "
          f"(0x{SOUND_START:04X}..0x{SOUND_END:04X}).")
    print(f"Catalog: {len(MUSIC)} music tracks, "
          f"{len(SFX_SINGLE)} single-channel SFX, "
          f"{len(SFX_MULTI)} multi-channel SFX.")

    cs = emit_csharp(buffer, labels)
    OUT_PATH.write_text(cs, encoding="utf-8")
    print(f"Wrote {OUT_PATH.name} ({len(cs)} chars).")


if __name__ == "__main__":
    main()
