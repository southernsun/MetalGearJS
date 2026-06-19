## Why

Today an alert is a single guard's private state: detection latches *that guard* into chase for the
rest of the slice, and the firing-noise hook added in `player-hud` only alerts the current room's
guard. The ROM models something bigger — a **global alarm** (`AlertMode`) raised by being seen *or*
making noise, that persists across rooms, escalates to a "red alert" with reinforcements in designated
rooms, wakes sleeping guards, and only ends when the area is cleared/left (`ChkAlarmEnd`). Porting this
makes getting spotted actually matter and is the natural completion of the guard work (62% coverage).

## What Changes

- **Global alarm state** — port `AlertMode` + `RoomAlertTrigged`/`RoomAlert` (`chkdiscover.asm`
  `SetAlert`/`SetAlertRoom`, `Banks0123.asm`). The alarm is a game-wide flag, not per-guard: once
  raised it stays up across room changes, so a guard in a room you enter while the alarm is active
  starts alerted.
- **Two trigger paths into the same alarm** — LOS discovery (`GuardSetAlarm`, already wired to the
  guard's line-of-sight) and **noise** (`ChkAlertTrigger`: an unsuppressed shot in a room not in
  `RoomShotSecure`, and not an `IsolatedRoom`). This replaces the current single-room `enterAlert`
  shortcut: both paths call the same `SetAlert`.
- **Red alert vs. low alert** — port `RedAlertRooms` (a 16-byte / 128-bit table over rooms 0–127):
  the trigger room's bit sets `RedAlertFlag`. Red alert arms reinforcements (`AlertRespawnTimer`);
  low alert does not. Rooms ≥ 128 are always low alert.
- **Reinforcements (scoped)** — port the respawn lifecycle (`AlertRespawnTimer`, `ChkAlarmEnd`'s
  respawn countdown, `RespawnInfo`/`CountEnemyType`, `SetRespawnTime*`): while a red alert is up, a
  defeated/departed guard in the alert room **respawns** on the timer. (See Impact for the
  single-guard limitation.)
- **Sleeping guards** — port `ChkSleepyGuard`/`GuardSleeping`/`GuardWakeUp`: a guard flagged asleep
  holds a sleep pose until the alarm is raised or Snake gets close, then wakes into patrol/alert.
- **Alarm end → return to patrol** — port `ChkAlarmEnd`/`StopAlert`: the alarm clears when the alert
  room is cleared of enemies / left (with the ROM's elevator and respawn-pending conditions), at which
  point guards drop back to patrol and area music resumes. This removes the current "latched for the
  whole slice, never calms down" behaviour.

## Capabilities

### New Capabilities
- `browser-guard-alarm`: the game-wide alarm state machine — raising the alarm (by sight or noise),
  red vs. low alert per `RedAlertRooms`, persistence across rooms, reinforcement respawn, sleeping
  guards waking, and the alarm-end/return-to-patrol lifecycle.

### Modified Capabilities
- `browser-guard`: the alert is no longer a per-guard latch cleared only by KO/room-change — it is the
  global alarm (persists across rooms; can be red; ends via `ChkAlarmEnd` returning the guard to
  patrol). A guard entering an already-alarmed room starts alerted.

## Impact

- **Code:** `web/game.js` — add an alarm module (`alertMode`, `redAlertFlag`, `roomAlertTrigged`,
  `alertRespawnTimer`, timers + `RedAlertRooms`/`RoomShotSecure` tables); route LOS discovery and the
  player-shot noise hook through a single `raiseAlarm()` (replacing the current-room `enterAlert`);
  make `buildGuard`/`setRoom` consult `alertMode` so guards spawn alerted during an alarm; add the
  sleeping-guard state; implement `chkAlarmEnd`/`stopAlert`. Guard data (`guards.json`) gains a
  `sleeping` flag and rooms may need a respawn marker.
- **Assets:** export the small `RedAlertRooms` (and `RoomShotSecure`) tables (or inline them, since
  they're tiny and fixed); a `RESPAWN`/sleeping flag in the per-room guard export if available.
- **Single-guard limitation (flagged divergence):** the browser models **one guard per room**; the
  ROM's reinforcement system spawns from a 16-actor-per-room pool via `RespawnInfo`. This change
  scopes reinforcements to **respawning the room's one guard** on the red-alert timer (the alarm keeps
  bringing the guard back). Spawning *additional simultaneous* guards is deferred to a future
  multi-actor change and called out in tasks. Dogs/lorries, cameras as separate actors, and boss AI
  are out of scope.
- **Specs:** new `browser-guard-alarm`; delta to `browser-guard` (alert requirement).
- **ROM sources:** `logic/actors/chkdiscover.asm` (`SetAlert`/`SetAlertRoom`/`GuardSetAlarm`/
  `RedAlertRooms`), `logic/checkweaponalert.asm` (`ChkAlertTrigger`/`RoomShotSecure`),
  `logic/actors/guard.asm` (`ChkSleepyGuard`/`GuardSleeping`/`GuardWakeUp`), `logic/actors/guardalert.asm`
  (`SetRespawnTime*`/`ChkDismissGuard`/`GuardWaitChkAlert`), `Banks0123.asm` (`ChkAlarmEnd`/`StopAlert`/
  `TransformAlertGuard`/`RespawnInfo`/`CountEnemyType`), `Variables.asm` (`AlertMode`/`RedAlertFlag`/
  `AlertRespawnTimer`/`RoomAlert`).
