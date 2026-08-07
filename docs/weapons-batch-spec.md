# Weapons batch — fix spec (#60, #61, #62, #63, #64, #66, #67)

The faithfulness-audit weapons cluster. Every claim below was re-verified against the disassembly in
`../MetalGear` before changing anything; two of the seven issues turned out to describe the ROM
slightly wrong, and those corrections are noted.

| # | Verdict |
| --- | --- |
| #61 | Confirmed. The per-weapon byte is a *damage-loop* count, not a spawn cap. Needs a real slot model. |
| #63 | Confirmed. Rocket/bomb/missile require **shot slot 0** empty. Same slot model. |
| #62 | Confirmed. Left/right bursts use the negated perpendicular drift. |
| #66 | Confirmed, with a correction: the table's last entry (`0Bh`) is **unreachable**. |
| #67 | Confirmed. The latch is set before the slot-0 bail-out. |
| #64 | Confirmed. `ControlMissile` reads `ControlsTrigger`. |
| #60 | Confirmed but **latent** — no difficulty system exists. Structural only. |

---

## The shared shot pool (#61 + #63) — one model fixes both

### What the ROM does
`GetEmptyShotDat` (`logic/weaponuse.asm:52-73`) scans the 6 shot structures and takes the **first
empty slot**, with a hardcoded `ld b,6`. It never consults any per-weapon value. So up to 6 shots of
any pooled type can coexist.

The byte preceding each damage table (`data/weapondamage.asm` — `db 6` before `BulletDamage`, `db 2`
before `GrenadeDamage`, `db 3` before `MineDamage`, …) is fetched by `GetWeaponDamages`
(`Banks0123.asm:1081-1094`) and used in exactly one place — the loop bound in `ChkPlayerShots`
(`logic/damagetoenemy.asm:27-42`):

```
    call GetWeaponDamages
    ld   b, a            ; Maximum number of simultaneous "bullets"
    ld   ix, PlayerShotsList
ChkPlayerShots3:
    ...  call nz, ChkHitEnemies
    add  ix, de          ; next slot
    djnz ChkPlayerShots3
```

So it caps **how many slots are scanned for hits**, not how many may exist. A grenade in slot 4 flies
and draws, it just cannot damage anything.

Note the quirk this creates: the count comes from `WeaponInUse`, which is written alongside
`SelectedWeapon` (`Banks0123.asm:11493-11494`, `logic/items.asm:260`) — i.e. the **currently selected**
weapon, regardless of what is actually in flight. Select the grenade launcher and only slots 0-1 are
checked, even if slots 2-5 hold handgun bullets.

Rocket, plastic bomb and missile additionally hard-wire themselves to slot 0 and refuse to fire
unless it is free (`logic/weapon/rocket.asm:23-25`, `plasticbomb.asm:22-24`, `missile.asm:23-25`):

```
    ld   a, (PlayerShotsList)
    and  a
    ret  nz              ; something is already in slot 0
    ld   ix, PlayerShotsList
```

### What the port does
`playerShots` is a compacting array with no slot identity. `WEAPON_MAX = [0,6,6,2,1,1,3,1]` is applied
as a hard **spawn** cap (`takeAmmo`), so grenades cap at 2 and mines at 3 on screen. The three slot-0
weapons gate on "no shot of my own type exists" instead of "slot 0 is free", and nothing limits which
shots may deal damage.

### Fix
Give each shot a `slot` (0-5), allocated as the lowest free index — the array stays compacting, so
only allocation and the two queries change:

- `allocShotSlot()` returns the lowest index in 0..5 not held by a live shot, or `-1`.
- `takeAmmo` fails when no slot is free; the per-type `WEAPON_MAX` spawn cap is removed.
- Rocket / plastic bomb / missile require slot 0 to be free (which is then what they get, since 0 is
  the lowest).
- `WEAPON_SHOT_SLOTS` keeps the `weapondamage.asm` header bytes, now used only to gate damage:
  a shot may hit only while `slot < WEAPON_SHOT_SLOTS[selectedWeapon]`.

---

## #62 — SMG burst drift is handed

`SMG_BulletSpeeds` (`logic/weapon/smg.asm:139-146`) is 4 directions × 8 ranges × (speedY word,
speedX word), 8.8 fixed point. Decoding it:

- **up** (`Y = 0FA00h` = −6.0): X drift over ranges 1-8 = `{0, −1.5, −3, −1.5, 0, +1.5, +3, +1.5}`
- **down** (`Y = 0600h` = +6.0): same X sequence
- **left** (`X = 0FA00h` = −6.0): Y drift = `{0, +1.5, +3, +1.5, 0, −1.5, −3, −1.5}` — **negated**
- **right** (`X = 0600h` = +6.0): same as left

The port applies the up/down sequence to the perpendicular axis for every direction, mirroring
horizontal bursts. Fix: negate the drift for left/right.

---

## #66 — laser length table, with a correction

`LaserLenghts` (`logic/damagelaser.asm:72-83`) is twelve bytes: `1,1,2,3,4,5,6,7,8,9,0Ah,0Bh`. The
port stops at `9`, so a fully grown beam reaches 72px instead of 80px.

**Correction to the issue:** it claims lengths 10 and 11 give half-spans of 80 and 88. In fact
`ChkLaserShot4` bails out *before* indexing when the grown count is `0Ch`:

```
ChkLaserShot4:
    cp   0Ch
    ret  z          ; 12 -> no damage at all
    and  a
    ret  z          ; 0  -> no damage
    ld   hl, LaserLenghts
    dec  a          ; index = count - 1
```

So the reachable indices are 0..10 and the last entry (`0Bh`) is **dead data**. The correct table for
the port is `[1,1,2,3,4,5,6,7,8,9,0Ah]`, and a grown count of 12 must deal no damage.

---

## #67 — the drop latch is consumed even when nothing spawns

`SpawnItem2` (`logic/spawnitem.asm:38-49`) sets the latch **first**:

```
SpawnItem2:
    ld   a,(SpawnedItems)
    and  a
    ret  nz                  ; already spawned once in this room
    inc  a
    ld   (SpawnedItems), a   ; <-- latch set here
    ld   hl, ItemsInTheRoom
    ld   a,(hl)
    and  a
    ret  nz                  ; slot 0 busy -> nothing spawns, but the latch stays set
```

The port returns before setting the latch when slot 0 is busy, so a later kill can still drop.
Fix: set the latch before the slot-0 test.

---

## #64 — missile steering

`ControlMissile` (`logic/weapon/missile.asm:112-132`) reads `ControlsTrigger`, so the missile re-aims
only on a fresh direction press. The port re-aims from the held direction every tick. Fix: steer from
the direction trigger.

---

## #60 — difficulty addend (latent)

`CalcShot2` scales aimed-shot speed by `(Dificulty << 3) + param`. No difficulty system exists in the
port, and Metal Gear MSX never sets `Dificulty` above 0 in normal play, so this is structural only:
express the formula with an explicit `DIFFICULTY = 0` constant so the shape matches the ROM and the
hook is obvious if difficulty is ever modelled. **No behaviour change** — that must be verified, not
assumed.

---

## Order of work
1. Slot model (#61 + #63) — the largest change, everything else is local.
2. #62, #64, #66, #67, #60.
3. Headless assertions for each; all 28 suites green.

---

## Result (2026-08-07)

| # | Outcome |
| --- | --- |
| #61 | Slot model added; per-type spawn cap removed; header bytes become the `ChkPlayerShots` damage bound |
| #63 | Rocket/bomb/missile gate on `shotSlot0Free()` and receive slot 0 |
| #62 | `smgDrift(burst, dir)` negates the sequence for left/right |
| #66 | Table extended to the full 12 bytes; grown count `>= 0x0C` now deals no damage |
| #67 | Latch set before the slot-0 bail-out |
| #64 | `missileDirTrigger` (ControlsTrigger edge) replaces the held direction |
| #60 | `DIFFICULTY`/`shotSpeedFor` express the ROM formula; behaviour identical at difficulty 0 |

Two ROM behaviours reproduced that were not in the issues:

- `ChkPlayerShots` bails out on `WeaponInUse == 0`, so **holstering stops all player-shot damage**.
- The damage bound follows the *selected* weapon, not the type of the shot being tested.

Corrections made to the issues while verifying: #66 claimed grown counts 10/11 give half-spans 80/88;
in fact `ChkLaserShot4` rejects 12 before indexing, so `0Bh` is dead data and 12 deals no damage.

Cover: `shots.headless.mjs` 43 → 60, `lasers.headless.mjs` 24 → 28, `items.headless.mjs` 36 → 38.
The existing missile-steering check asserted the old held-direction behaviour and was rewritten to
cover both halves of the ControlsTrigger rule. All 28 suites green.

---

# Follow-up batch: player/movement (#49, #51, #52, #55) + #12

| # | ROM source | Change |
| --- | --- | --- |
| #51 | `chkPunch` `ld a,8 / ld (PunchCnt),a` (`Banks0123.asm:8949`) | `PUNCH_TICKS` 12 → 8; also corrects prison-wall break rate |
| #55 | `ChkPunchColl` `call c` SFX 9 (`:9050`); `ChkPunchEnemy4` SFX 8 (`punchenemy.asm:73`) | Swing is silent; SFX 9 on a solid probe, SFX 8 moved into `tryPunchGuard` |
| #52 | `ChkStartClimb` (`:9338`), `ChkExitLadders` (`:9378`) | `ladderDirTrigger` edge replaces held/`currentDir()` |
| #49 | `ChkPlayerColl` room-78 second pass (`:8998-9007`), `BoxColliderDat` shape 2 | `PROBES_SHAPE2` second probe in room 78 only |
| #12 | `GuardSetAlarm` (`chkdiscover.asm:327-336`) | Already fixed by #28/#22/#59 — verified, not changed |

## Notes

`punch.wav` is the **"Punch guard"** SFX (`MusicCatalog.cs:35`), so the port was playing the *hit*
sound on every swing including air punches — that identification is what made #55 unambiguous.

`ControlsTrigger` is rebuilt every ROM iteration, so an unconsumed trigger must not survive.
The first cut of #52 latched until consumed, which would have let a stale `up` auto-mount the next
ladder — the exact bug being fixed. Both `ladderDirTrigger` and `missileDirTrigger` (#64) are now
cleared at the end of each play iteration.

#12 needed no code change: the `< 128` boundary, the per-source reinforcement seeds (#28) and the
red-flag/red-music split (#59) are all faithful, and `raiseAlarm`'s `if (alertMode) return` mirrors
`GuardSetAlarm`'s `ret nz` so a live alarm can never be re-classified. The one thing that can still
look wrong — a red alert persisting into room 128 — is `ChkAlarmEnd` behaving correctly.

## Cover
`touch.headless.mjs` 20 → 37, `alarm.headless.mjs` 77 → 84. All 28 suites green.
