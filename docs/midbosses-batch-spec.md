# Mid-boss batch — fix spec (#71, #72, #73)

The last of the faithfulness-audit clusters: the room-67 tank, the room-71 bulldozer and the
desert air shells (rooms 65/66). All three verified against `../MetalGear` before changing anything.

## #71 — tank vertical movement

`AnimateTank` (`logic/actors/tank.asm:137-165`) runs every iteration. When `ANIM_CNT & 7Fh == 0`
(every 128) it stops the tank: `StatusCopy = Status`, `Status = 2`, `StopTime = 28h`. It then
**falls through** to `TankStatusLogic`, which dispatches on the freshly-set Status 2 and runs
`TankIdle`'s `dec (ix+StopTime)` in the same iteration — so one tick is consumed immediately and
the idle spans 0x28 iterations in total. (This caught out my first test assertion, which expected
`StopTime == 0x28` after that iteration.)

`TankStatusLogic` dispatch:

| Status | Routine | Behaviour |
| --- | --- | --- |
| 0 | `TankMove` | every 0x32 iterations flip between +0.5 (down) and −0.5 (up). Up→down is unconditional; **down→up** also rolls `GetRandom3` and on zero enters Status 1 with `MovingTime = 9Ah`. |
| 1 | `TankMoveLong` | hold 0x9A, then Status 0, +0.5 down, `MovingTime = 9Ah`. |
| 2 | `TankIdle` | frozen; on expiry restore `StatusCopy`, `Moving = 1`. |

`GetRandom3` (`logic/actors/guardalert.asm:544`) is `ld a,r / xor ANIM_CNT / and 3` — a 1-in-4 roll.

There is **no position clamp** in the ROM; the timers alone bound the drift. The port had a hard
`[0x10,0x60]` clamp, continuous oscillation and no idle beats.

## #72 — bulldozer's final charge

`BulldozerLogic` (`logic/actors/bulldozer.asm:8-22`) dispatches a 7-entry table: Moving, Stop1,
Moving, Stop2, Moving, Stop3, **BulldozerDummy**. `BuldozerStop3` sets `SpeedY = 0E0h` and
`Timer = 30h`, then `NextActorStatus` lands on status 6 — which is *empty*. So the dozer plows
straight down at 0xE0 until the routine's opening `cp 160 / jp nc, StopBulldozer` halts it.

The port kept alternating stop/move beats past that point, adding one extra ~0x10 pause near the
bottom. Speeds (0x60/0x80/0xC0/0xE0) and timings (move 0x30, stop 0x10) were already exact.

## #73 — desert air shells

Two defects, both confirmed:

- **Accelerating X drift.** `ThankShellLogic` (`tankshell.asm:33-42`) calls `AddActorSpeedX` with
  ±18h *every iteration*, and `InitTankShell` calls `ResetActorSpeed` first — so the speed starts
  at zero and accelerates 0x18/256 = 0.09375 px/iteration². The port used a constant ±0.5.
  Also tightened: `Timer = ((r ^ TickCounter) & 0Fh) + 0Ah`, and the left/right choice is that same
  value's bit 0 (`and 1`), not an independent coin flip.
- **Lingering explosion.** On timeout the actor is not removed — it becomes `ID_BIG_EXPLOSION`
  (0x41) with `Timer = 12h` and `Moving = 0`. `ActorTouchDamage[0x40]` = **0x10** and
  `ActorsShapeTouch[0x40]` = 0x16 → `ImpactAreasInfo` row 22 = `10h, 18h, 0, 18h`, i.e.
  `|dy − 16| < 24` and `|dx| < 24`. The port played the SFX and deleted the shell, so the impact
  point was harmless.

## Result (2026-08-07)

All three fixed. 18 checks added to `web/midbosses.headless.mjs` (27 → 45): the tank's idle span and
both movement states, the bulldozer's status-6 straight run plus the retained early stops, and the
shell's acceleration in both directions, transform, lingering hitbox and expiry. All 28 suites green.

---

# Final sweep: MapZone (#78) and the long-session slowdown (#2)

## MapZone — ported, unblocking four gates

`SetRadioArea` (`Banks0123.asm:1060-1066`) reads a per-room nibble from `idxMapZones`
(`data/musicradioconfig.asm:58`) — 126 bytes covering rooms 0..251, high nibble for an even room,
low for an odd one (the `GetNibbleHL_A2` encoding already used for the tileset table). Ported as
`MAP_ZONE_NIBBLES` + `mapZoneFor(room)`. Decode sanity: rooms 0/5 → 0, 29/37 → 2, desert 103/208 →
5, building 3 basement 111/118/119 → 10.

| Consumer | Gate | Was |
| --- | --- | --- |
| `ChkReplyBigBoss4` (`:11095`) | zone == 4 suppresses the bug warning (#78) | ungated |
| `ChkRadioReply` (`:11048`) | zone >= 5 needs the antenna to reply | passing |
| `ChkRadioCalls3` (`:1719`) | zone >= 5 needs the antenna to ring | passing |
| `SetAreaMusic5` (`:1560`) | the transmitter does not re-raise the alert in zone 4 or zone >= 8 | always raised |

This closed two of the five deferred behaviours in #90 (the antenna requirement — flagged there as
"the most gameplay-significant deferral" — and the MapZone gates). A third, the rooms 16/116
electric floors, turned out to be live already. Remaining: Jennifer's dead-brother flag, and a real
difficulty value.

## #2 — measured, not guessed

A headless soak (120,000 ticks ≈ 33 minutes of game time in room 5) sampled every module-level
collection. **No growth in any of them** — the game's own state is flat, so the per-frame cost is
not the cause.

The only unbounded background machinery is `initBugReporter`, a dev/QA tool that runs
unconditionally in production. Each 20s window restart built a **new `MediaStream`** and a **new
`MediaRecorder`** while the retiring recorder was still reachable from its own `onstop` closure —
roughly 180 encoder objects an hour on top of two continuously encoding the canvas at 30fps.

Fixed both: `bugStream()` caches the combined stream (invalidated by `bugRefreshAudio`), and
`slot.begin()` detaches the outgoing recorder's handlers before creating the next one. Both strictly
reduce retained objects with no change to clip capture.

**Not confirmed fixed** — reproducing needs a real browser over a long session. #2 stays open; if it
persists, the decisive test is disabling `initBugReporter()` entirely, and the real fix would be
making it opt-in (a product call, since the B key is used heavily).
