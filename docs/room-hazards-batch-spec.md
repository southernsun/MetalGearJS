# Room-hazard batch — fix spec (#111, #112, #113 + #47)

Spec for the three room-specific playtest reports filed 2026-06-29 (rooms 153 and 37), plus the
faithfulness-audit issue that turned out to overlap them. Investigation against `web/game.js` and
the disassembly in `../MetalGear`.

| # | Report | Verdict |
| --- | --- | --- |
| #111 | Rolling-bar graphics wrong (153) | Real — the art was drawn with canvas primitives, never decoded |
| #113 | Barrel rolls the wrong way, no way out entering from the right (153) | Real — **two** causes, both confirmed in the ROM |
| #112 | Electric-floor graphics wrong (37) | Real — the port tinted whole tiles; the ROM animates one palette slot |
| #47 | Barrel collision box differs from the ROM touch shape | **Mis-filed** — it cited the wrong `ImpactAreasInfo` row; the port was already right |

---

## The rolling barrel (#111, #113, #47)

### What the actor really is
`ActorsRoom141` (`data/actorsinrooms.asm:859`) is one `ID_ROLLING_BARREL` at `dw 8008h` = (x 128,
y 8). `idxActorsRooms` aliases rooms 141, 153 and 191 to that table, and 205 has its own — so all
four rooms genuinely have a barrel (already correct in `actors.json`).

It draws **18 sprites**, not one. `NumSprEnemies[ID-1]` = 0x12 = 18, and `RollBarrels1`/`RollBarrels2`
(`data/actorspriteattr.asm:361/371`) each begin with `97h`. `UpdateActorSprDat`
(`Banks0123.asm:5881-5889`) treats a first byte in `91h..0A5h` as "use a shared offsets table":
`97h - 91h = 6` → `idxSprOffsets[6]` = `SprOffsets7`, which is 18 (Yoff, Xoff) pairs — Y ramping
`0,0,10h,10h,…,80h,80h` and X `0F8h` (−8) throughout. That is **9 rows of an OR-pair of two 16×16
sprites**: a 16×144 column anchored at (actorX−8, actorY), i.e. Y 8…152.

`SprSetRolBarrel` (`data/spritesets.asm:184`) loads `SprRollingBarrel` at pattern base `0D0h`, so
sub-sprite = `(pattern − 0D0h)/4`. Frame 1 = D0/D4 cap, D8/DC ×7, E0/E4 cap; frame 2 = E8/EC,
F0/F4 ×7, F8/FC. `RollingBarrelLogic` animates the two frames every 4 iterations (`Anim2FramesActor`,
mask 3).

Colours: `ActorSprColors7` = `{0Bh, 4Ch}` ×9 — plane A colour `0Bh`, plane B `4Ch` (bit 6 = the
CC/OR-combine flag, colour `0Ch`), so an overlapping pixel reads `0Bh|0Ch = 0Fh`. All four rooms use
spriteset 19, whose `SprsetPal19` does not override `0Bh/0Ch/0Fh`, and no non-dark `RoomPalette`
touches them either — so they come from the base palette: `0Bh` = `DefaultPalette` (`64h`/6 = R6 G6
B4, light yellow), `0Ch` and `0Fh` from the `PalMenuWeapon` overlay (`33h`/3 grey, `0`/`0` black).

### #111 — the art
The port drew a brown canvas gradient with fake staves. Fixed by exporting the real sprite:
`--export-barrel` in `Tools/MetalGearSpriteMover` → `web/assets/barrel.png` (32×144 = 2 frames of
16×144) + `barrel.json` (`frameWidth/frameHeight/frames/offsetX/offsetY/rows`). Geometry and colours
are read from the tables above, not hardcoded. `game.js` blits it; the procedural
`drawBarrelColumn` is gone.

One subtlety: `UpdateActorSpr6` does an 8-bit `add a,(ix+ACTOR.Y)`, so offsets only "wrap". In
`SprOffsets7` the Y column is a downward ramp where `80h` means **+128**, while the X column `0F8h`
means **−8**. Reading both as signed put the column 128px off-screen; the exporter documents and
handles this.

### #113 — cause 1: actor init read a stale player position
`InitRollingBarrel` (`logic/actors/rollingbarrels.asm:115-128`) reads `PlayerX`: below `80h` the
barrel is launched right (`+80h` = +0.5 px/iteration), otherwise left — i.e. away from the player.

The ROM runs that **after** placing the player: the room-change routine is `LocatePlayerEntry`
(`Banks0123.asm:11863`) then `SetupEnemyRoom` (`:11925`). The port had it inverted — `setRoom()`
builds all actors, and only then does the caller (`transition()`, the door path, …) move Snake to the
entry point. `buildBarrels` therefore read the **previous room's** X, which is on the opposite side,
so the barrel launched straight at the door you had just walked through. Entering from the right made
it roll right, at you — exactly the report.

Fixed by splitting the position-dependent half out: `setRoom` sets `roomEntryInitPending`, and
`flushRoomEntryInit()` runs `initBarrelDirections()` before the first actor tick of the new room.
(An audit of every `build*` found only two that read the player position — barrels, and basement dog
facing. The dog case is a port invention: `InitDogBasement` reads no player coordinate, so it is left
alone rather than made "faithfully" stale.)

### #113 — cause 2: the acceleration quirk
`RB_IncrementSpeed` (`:64-73`) is `ld a,(ACTOR.Direction) / rra` — carry (bit 0) picks `+8` or `−8`
in 8.8 fixed point. But **`InitRollingBarrel` never sets `Direction`**, and `SetupEnemyRoom`
(`Banks0123.asm:6128-6132`) zeroes the whole `EnemyList` first. So on the first leg Direction is 0 →
bit 0 clear → the barrel **always accelerates left** until its first wall bounce writes a real value.

A barrel launched rightward therefore decelerates over 16 iterations, stops, and rolls back left.
Only after a bounce does acceleration follow travel: `ChkBarrelBounce` stores `DIR_DOWN` (2) for
"moving left" and `DIR_LEFT` (3) for "moving right" — the ROM re-uses those enum values as markers,
they are never a facing. The port had been accelerating along the current direction of travel, which
never turned the barrel around. Now reproduced with a `dir` field mirroring `ACTOR.Direction`.

Bounce limits are also now exact: right at `X >= 200` → `X = 199`; left at `X < 56` → `X = 57`
(the port bounced at `X <= 56`, one pixel early).

### #47 — the collision box was already correct
`ActorsShapeTouch[ID_ROLLING_BARREL−1]` = `ActorsShapeTouch[0x0E]` = **`10h`** → `ImpactAreasInfo`
**row 16** = `48h, 48h, 0, 0Ch`. With the semantics confirmed by the guard box (shape 8 → row 8 =
`0,8,0,0Ch` = the known `|dy| < 8, |dx| < 12`), that is `|dy − 72| < 72` and `|dx| < 12` — i.e.
**exactly the 16×144 sprite column**, Y from actor.Y to actor.Y+144.

Issue #47 read row 13 (`E8h,18h,0,20h`) and concluded the box should be ±32 wide and short. That is
the shape for a different actor id. The port's `|dx| < 12` and full-column height were right; only
the top edge was 8px generous (`b.y − 8` instead of `b.y`). Corrected, and #47 should be closed as
mis-filed.

---

## The electric floor (#112)

### What the ROM does
`PowerSwitchLogic` (`logic/actors/powerswitch.asm:24-58`) does not touch tiles at all. Every 4
iterations it steps a brightness value and rewrites **one palette entry** to
`rgb(BRIGHT,BRIGHT,BRIGHT)` (`D = BRIGHT<<4|BRIGHT` for R/B, `E = BRIGHT` for G) — slot **9**, or
slot **5** in rooms 40 and 116. Every pixel drawn through that slot pulses; everything else in those
tiles is untouched.

`InitPowerSwitch` seeds BRIGHT = 4, DELTA = +1. `ChkRevertFade` is `cp 7 / call nc`, so it fires on
`BRIGHT >= 7` — **including the `0FFh` wrap** when the fade-out runs past zero — and it rewrites
BRIGHT *before* the colour is read:

- BRIGHT reaches 7 → clamped to 6, DELTA = −1 (**7 is never displayed; the peak is 6**)
- BRIGHT reaches `0FFh` → clamped to 1, DELTA = +1 (**0 *is* displayed on the way down — full black**)

Displayed ramp from the seed: `5,6,6,5,4,3,2,1,0,1,2,3,4,5,6,6,…`

### What the port did
`drawPowerSwitchFloor` 'lighten'-blended a flat grey over every 8×8 tile whose id was in
`ELECTRIC_TILES`, washing out the whole floor slab instead of its conductor pixels — and
`powerSwitchTick` clamped BRIGHT to 1..7, so it peaked pure white and never reached black. Wrong
shape *and* wrong range.

### Fix
The rooms are flat PNGs with no palette indices left, so RoomViewer now exports a **stencil** of the
animated slot per electric room: `rooms/<n>.electric.png`, written during `--export-web` for the five
`ChkElectricFloor` rooms. It is derived, not hand-authored — the room is rendered twice through
`DrawRoom(room, extraPalBlock)` with the slot forced to two different colours, and the differing
pixels are the stencil. `game.js` tints just those pixels to `rgb(BRIGHT×255/7)`, caching one tinted
canvas per BRIGHT level. `powerSwitchTick` now reproduces `ChkRevertFade` exactly.

Stencil sizes: room 16 → 6015 px, 37 → 7446, 110 → 6878, 40 → 14491, 116 → 9873.

---

## Result (2026-08-07)

- All 28 headless suites green; `hazards.headless.mjs` went from 58 to 62 checks.
- New barrel assertions cover both #113 causes (the deferred init, and the Direction-0 leftward
  acceleration turning a rightward launch around after 16 iterations), the exact bounce edges
  including "X == 56 must not bounce", the ROM touch box including both boundary cases, and the
  `barrel.json`-vs-`RollBarrels1/2` geometry for #111.
- New electric assertions pin the full 17-step BRIGHT ramp, the peak of 6, the trough of 0, and that
  a dead switch freezes the fade.
- The world was re-exported to generate the stencils; every room PNG came out byte-identical, so
  only the five new `*.electric.png` files are added.

---

# Follow-up: patrol-path export (#122)

Found while investigating #11 (room 4 itself turned out to be faithful).

## Two defects in `Tools/export-actors.mjs`

**1. Label-boundary parse.** All four `dw`-table scans tested for `dw` *before* the next-label
break, so a line that is both — `Paths_139:    dw Path_139_01` — never ended the scan and a table
absorbed every following table's pointers. A room whose actor index ran past its own table then read
another room's paths. Fixed with shared `dwListFrom`/`dbBytesFrom` helpers that test the label first;
`pathFor` also refuses to read a block too short to hold `cnt` coordinate pairs (that is a sentinel
look-direction list).

**2. Path slots.** The exporter used one running `pathIdx` for every guard. The ROM uses **four**
separate rules, each a `CountEnemyType` over a specific set followed by `GetPathPoints`' `dec b`:

| actor | routine | counts |
| --- | --- | --- |
| SLOW / MEDIUM / FAST | `InitGuardPath` (`Banks0123.asm:6852-6888`) | SLOW + CAMERA + SENTINEL + MEDIUM + FAST |
| sentinel | `GetSentinelLookDirs` (`Banks0123.asm:7188-7194`) | SENTINEL only |
| camera | `InitCamera3` (`logic/actors/camera.asm:66`) | its own `IDX_SAME_ID` |
| lorry guard | `InitGuardLorry` (`logic/actors/guardlorry.asm:8-22`) | SLOW + EXIT_LORRY |

`ID_GUARD_ALERT`, `ID_GUARD_REDALERT`, `ID_GUARD_SILENCER`, `ID_GUARD_SWITCH`, `ID_GUARD_ELEVATOR`,
`ID_SHOOTER` and `ID_LORRY_SHOOTER` reach no path lookup at all (verified by grepping each init
routine), so they take neither a path nor a slot. `ID_CAMERA_LASER` is not in `InitGuardPath`'s list
either. Now tracked as `guardSlot` / `sentinelSlot` / `lorrySlot`.

## Result

14 guard path entries changed, every one an alert or silencer guard losing a path the ROM never
gives it (rooms 108 ×3, 127, 131 ×4, 132, 150 ×4, 154). **No regular patrol guard's path changed**
and all 26 sentinel direction lists are byte-identical. The 3 malformed `[[3,null]]` paths are gone,
so `stopAlarm()`'s re-home no longer produces a NaN position in room 131.

Two of the removed entries were cross-room bleed: room 154's alert guard was reading room 150's
path, and room 131's three were reading `Paths_139`'s sentinel lists.

## Regression cover

The exporter now throws on a malformed path point, on an alert/silencer guard holding a path, and if
room 4's two known ROM paths shift. `web/hazards.headless.mjs` adds 6 checks (58 → 68), including a
room-131 `stopAlarm()` run asserting finite coordinates. All 28 suites green.

---

# Follow-up: SetDirToPoint (#123)

## Scope collapsed once #122 landed

All 9 guards with a diagonal spawn→p0 approach were `ID_GUARD_ALERT` / `ID_GUARD_REDALERT` /
`ID_GUARD_SILENCER` — exactly the guards #122 established take no path in the ROM. After that fix:

```
guards WITH a patrol path: 85
diagonal spawn->p0 approaches: 0
diagonal path legs: 0
```

On axis-aligned data the ROM rule and the port's dominant-axis rule are identical (same X → `b|0 = b`;
same Y → `0|c = c`). Verified empirically over every approach and leg in `actors.json`:
**379 compared, 0 facing differences.**

## Ported anyway

The dominant-axis rule was our interpretation standing in for the ROM routine, so `SetDirToPoint`
(`Banks0123.asm:6965-7005`) is now ported literally as `setDirToPoint(x, y, destX, destY)` and used
at both ROM call sites — the initial facing in `guardDefsFor` and the waypoint re-aim in
`guardPatrol`. The 0-based direction mapping is confirmed by `ChangeGuardSprDir`
(`logic/actors/guard.asm:7-17`, `SpriteId = Direction*2`) against `idxSprites`.

The `b|c` quirk (**down+left = 1|2 = 3 = RIGHT**) is reproduced deliberately and asserted.

## Deliberately not implemented

`SetDirToPoint3` also sets both speed components, so a diagonal approach would *move* diagonally.
That branch is unreachable with current data, and implementing it would mean restructuring
`guardPatrol`'s axis-commit (which exists to stop guards staircasing). Documented here as the other
half, should a diagonal approach ever appear in the data.

## Cover

8 checks added to `web/hazards.headless.mjs` (68 → 76): four pure-axis cases, all four diagonal
combinations including the quirk, and a room-4 integration check. All 28 suites green.
