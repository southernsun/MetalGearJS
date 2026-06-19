# Sound & music audit — analysis, findings & fixes (curated)

> **Note:** `data/*.asm` / `logic/*.asm` / `file:line` references here are in the separate MSX disassembly repo ([southernsun/MetalGear](https://github.com/southernsun/MetalGear)), expected as a sibling clone at `../MetalGear`. The `*.json` / `web/` / `MusicCatalog.cs` paths are in this repo.

Companion to the auto-generated [sound-audit.md](sound-audit.md) (run `node Tools/audit/audit-sound.mjs`
to refresh the per-room music table + the music/call/shoot-secure mismatch tallies). This file is the
hand-curated analysis: what plays per room and per event, ROM source, and what's covered vs missing.

## Method

`audit-sound.mjs` parses the ROM `RoomsMusic` table (`data/musicradioconfig.asm`, non-Japanese branch)
and `RoomShotSecure` (`logic/checkweaponalert.asm`) and diffs them against the port's `ROOMS_MUSIC`
byte table, `radio.json` call rooms, and `ROOM_SHOT_SECURE` + `roomIsolated`. The SFX/music catalog
below is cross-referenced against `Tools/ThemeOfTaraPlayer/MusicCatalog.cs` and the exported
`web/assets/*.wav`.

## Per-room music — RESULT after fixes: 0 mismatches

The `RoomsMusic` byte (per room) carries: **high nibble = music id**, **bit 3 = incoming call**,
**bits 2-0 = IsolatedRoom** (==1 ⇒ shooting raises no alarm + binoculars disabled). Music ids used:
0 Theme of Tara · 1 Sneaking Mission · 2 Metal Gear TX-55 · 4 Beyond Big Boss.

- **FIXED — music table (32 rooms):** the port's `ROOMS_MUSIC` was hand-built and diverged in rooms
  160–226 (and was truncated at 224, so the escape ladders 224–226 played Tara instead of TX-55).
  Replaced with the verbatim ROM `RoomsMusic` byte table; `areaTrackFor` derives the nibble (`>>4`).
- **FIXED — IsolatedRoom shoot-secure (102 rooms):** the ROM's `ChkAlertTrigger` skips the alarm when
  `IsolatedRoom == 1` (`RoomsMusic[room] & 7 == 1`) OR the room is in `RoomShotSecure`. The port only
  checked `RoomShotSecure` (which matches the ROM table exactly), so gunfire in the 102 interior rooms
  with the isolated flag wrongly raised the alarm. `chkAlertTrigger` now also checks `roomIsolated`.
- **Already correct:** the incoming-call bit (bit 3) — 0 mismatches vs `radio.json`.

## Music track inventory (10 ROM tracks)

| # | ROM track | file | when it plays | status |
|---|---|---|---|---|
| 1 | Theme of Tara (intro) | tara.wav | title / intro scene | ✅ |
| 2 | Theme of Tara | tara.wav | area music id 0 | ✅ |
| 3 | Red Alert | red-alert.wav | a RED alert (RedAlertRooms) | ✅ **exported + wired this pass** |
| 4 | Alert | alert.wav | a plain (yellow) alert | ✅ |
| 5 | Sneaking Mission | sneaking.wav | area music id 1 (basements/interiors) | ✅ |
| 6 | Metal Gear TX-55 | tx55.wav | area id 2 (room 118 + ladders 224–226) | ✅ |
| 7 | Beyond Big Boss | escape.wav | area id 4 + the self-destruct countdown | ✅ |
| 8 | Mercenary (Boss) | mercenary.wav | mid-bosses / MGK / Shotgunner | ✅ |
| 9 | Return of Fox Hunter | foxhunter.wav | the ending / staff roll | ✅ exported + wired in the ending (2026-06-15) |
| 10 | Just Another Dead Soldier | dead.wav | Snake's death (GS_Dead) | ✅ |

## SFX / event catalog (~44 ROM SFX)

**Covered (exported + wired):** Hind D propeller (propeller.wav) · dog bark (bark.wav) · laser shot
(laser.wav) · guard/boss bullet (bullet-shot.wav) · boomerang · pitfall opens · punch guard
(punch.wav) · punch breakable wall (wall-hit.wav) · hand gun (handgun.wav) · SMG (smg.wav) · suppressed
(silencer.wav) · shotgunner (shotgun.wav) · damage · roof air (airflow.wav) · grenade throw · missile ·
click/no-ammo · guard dead · plastic bomb/mine set (bomb-set.wav) · electric floor · door · grenade
explosion (explosion.wav) · elevator door · plastic-bomb explosion (bomb-explosion.wav) · rolling
barrel hit · wall broken · lorry moving · menu cursor · use item · incoming call (call.wav) · text
print · pick up · spawn · rank up · rank down · logo move/stop · radio noise.

**Gaps / stand-ins (per event):**

| ROM SFX | event | status |
|---|---|---|
| Tank shell shot (0x6D1D) | desert barrage / tank cannon fires | reuses rocket.wav (stand-in) |
| Tank shell whistle (0x7145) | a shell falling from the sky | ❌ not exported (no whistle) |
| Punch wall (0x6C32) | punching a solid (non-breakable) wall | reuses wall-hit.wav (stand-in) |
| Pause (0x8658) | pressing pause | ❌ not exported (pause is silent) |
| Big Boss dies (0x8675) | Big Boss's death | reuses guard-dead.wav (stand-in) |
| Ending explosion (SFX 0x56) | the ending cinematic | reuses bomb-explosion.wav (stand-in) |

To export any of these: `dotnet run --project Tools/ThemeOfTaraPlayer -- --export-sfx "<catalog name>" web/assets/<file>.wav` (music tracks take a trailing seconds arg).

## Special music events (verified wired)

- **Area music** follows `RoomsMusic >> 4` on room entry (`updateAreaMusic`/`SetAreaMusic6`).
- **Alert** replaces the area music; **red alert** now plays the distinct Red Alert track.
- **Boss music** (Mercenary) replaces the area music for the boss rooms; restored on death/exit.
- **Countdown** forces Beyond Big Boss everywhere while the self-destruct runs (`destructionOn`).
- **Death** replaces the music with the death tune (dead.wav).
- **Incoming call** rings SFX 0x22 (call.wav) per `RoomsMusic` bit 3 (radio.json) — 0 mismatches.

## How to re-run
`node Tools/audit/audit-sound.mjs` → refreshes `docs/sound-audit.md` and prints the music / call /
shoot-secure mismatch counts (all 0) + the verbatim `ROOMS_MUSIC` byte table for re-paste if the ROM
data changes. Then run the 25 headless suites (alarm suite covers the IsolatedRoom shoot-secure rule).
