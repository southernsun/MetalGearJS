> Port the ROM alarm faithfully; cite the routine next to each piece (per CLAUDE.md). Sources:
> `logic/setalert.asm` (SetAlertMode/Respawn), `logic/actors/chkdiscover.asm` (SetAlert/SetAlertRoom/
> GuardSetAlarm/RedAlertRooms), `logic/checkweaponalert.asm` (ChkAlertTrigger/RoomShotSecure),
> `logic/actors/guard.asm` (ChkSleepyGuard/GuardSleeping/GuardWakeUp), `logic/actors/guardalert.asm`
> (SetRespawnTime*), `Banks0123.asm` (ChkAlarmEnd/StopAlert/TransformAlertGuard), `Variables.asm`
> (AlertMode/RedAlertFlag/AlertRespawnTimer/RoomAlert). Single guard per room → reinforcements scoped
> to respawning that guard (flagged).

## 1. Alarm state + tables

- [x] 1.1 Add the alarm module to `game.js`: globals `alertMode`, `redAlertFlag`, `roomAlertTrigged`/`roomAlert`, `alertRespawnTimer`, `numRespawnGuards`. Reset on restart.
- [x] 1.2 Inline the ROM tables: `RED_ALERT_ROOMS` (the 16 bytes from `chkdiscover.asm`) and `ROOM_SHOT_SECURE` (the 55 rooms from `checkweaponalert.asm`), with a `redAlertBit(room)` helper (rooms ≥128 → low).

## 2. Raising the alarm

- [x] 2.1 `raiseAlarm(room, {bySight})` = `GuardSetAlarm`→`SetAlert`→`SetAlertMode`: no-op if already up; set `redAlertFlag` from `redAlertBit`; set `alertMode`; record `roomAlert`; arm `alertRespawnTimer` (red only; `SetRespawnTime` room gating + value `0x0A00 | rand(0x10..0x1F)`); set `numRespawnGuards = cards+3` (min 3); play alert music (`0x32`).
- [x] 2.2 `chkAlertTrigger()` (`ChkAlertTrigger`): an unsuppressed player shot raises the alarm unless the room is isolated or in `ROOM_SHOT_SECURE`, or the alarm is already up. Replace the player-hud current-room `enterAlert` shortcut with this.
- [x] 2.3 Route LOS discovery (`guardSeesSnake`) through `raiseAlarm(currentRoom, {bySight:true})` instead of the per-guard `enterAlert`.

## 3. Persistence across rooms

- [x] 3.1 `buildGuard`/`setRoom`: when `alertMode` is set and the entered room has a guard, build it directly into the alerted/chase state (`TransformAlertGuard` — entering an alarmed room, guards aren't patrolling).
- [x] 3.2 Confirm the alarm is NOT cleared by a plain room change (only by the alarm lifecycle).

## 4. Sleeping guards

- [x] 4.1 Add a `sleeping` guard sub-state (seeded from a `guards.json` `sleeping` flag, default false): render a down/sleep pose, skip patrol + LOS while asleep. Done — full **awake↔sleep cycle** (`ChkSleepyGuard` AwakeTime 0xC0 → `GuardSleeping` SleepingTime 256 → `GuardWakeUp`), with the **real animated Zzz sign** exported from `SprZzz` (`--export-zzz` → `zzz.png`, frames per `AnimZzzFrames`) drawn over the sleeper.
- [x] 4.2 Wake on noise/touch (`GuardSleeping`/`ListenShotsChkTouch`) → wake the guard AND `raiseAlarm`; a raised alarm also wakes a sleeping guard (`GuardWakeUp` restores prior status). (The "I'm sleepy"/"Overslept" text is omitted — no text system — flagged.) Done.

## 5. Reinforcements + alarm end

- [x] 5.1 Red-alert respawn: when the alert room's guard is killed/KO'd and `alertRespawnTimer` is armed, respawn that guard after the timer (re-arm per `ChkAlarmEnd`). Document the single-guard divergence (ROM spawns up to `numRespawnGuards` distinct actors).
- [x] 5.2 `chkAlarmEnd()` each tick (`ChkAlarmEnd`/`StopAlert`): elevator room ends it; otherwise when `roomAlert` has no active guard and no respawn pending → `stopAlert` (clear `alertMode`+flags, resume area music). Guards return to patrol.

## 6. Assets

- [x] 6.1 Extend the guard export (`guards.json`) with the `sleeping` flag (and any respawn marker) from the ROM where present; verify which current-cluster rooms actually have a sleeping guard or a red-alert bit (else gate behind a dev hook + note it). Done — `buildGuardRaw` reads a `sleeping` flag from `guards.json` (default false); the ROM's per-room sleeping marker isn't in the current guard export and no cluster room is confirmed to have one, so sleeping is gated behind the `?sleep` dev hook (flagged). Red-alert bits ARE exercisable: rooms 7/11/12/13 in the cluster are red per `RED_ALERT_ROOMS`.

## 6b. Playtest fixes

- [x] 6b.1 Red-alert icon: export the ROM's real red "!" (`alert-icon-red.png`, the red tiles of `GfxItems`/`gfxAlertIcon`) and use it for red alerts (normal = white starburst, red = yellow). Replaces the wrong runtime tint.
- [x] 6b.2 Guard bullets: re-export white (`guard-bullet.png`) — the OR-combine index `0x0F` is white in the gameplay palette (was a yellowish "tracer" divergence).
- [x] 6b.3 Collision: make patrol movement collision-aware (same probes as Snake) and re-home a guard onto its path when the alarm ends, so a guard can never cross a wall the player can't — in any state. Chase was already collision-checked (verified 0 violations / 3000 ticks headless).

## 7. Verification

- [x] 7.1 Headless: alarm raised by sight and by unsuppressed shot; NOT raised in a `ROOM_SHOT_SECURE`/isolated room or when already up; red vs low from `RED_ALERT_ROOMS`; alarm persists across a room change; a guard entered during the alarm starts alerted; sleeping guard holds then wakes+alarms on noise; red-alert respawn fires; `chkAlarmEnd` clears the alarm when the room is cleared → patrol resumes.
- [x] 7.2 Manual browser: get spotted / fire unsuppressed → alarm + chase; leave and re-enter → still alerted; clear/leave the alert room → calms down to patrol; (if a sleeping/red room is reachable) sleeping wake + reinforcement respawn. Confirmed in-browser (incl. playtest fixes: red icon, white bullets, sleep Zzz position/rate; tank-overhang verified faithful). `?sleep`/`?red`/`?collision` dev hooks. Red-alert rooms in cluster: 7/11/12/13.
- [x] 7.3 Regression: patrol, LOS, chase, bullets, punch-KO, damage, doors/water/box unaffected; confirm ROM citations.
- [x] 7.4 Update `Tools/coverage/coverage-map.json` (SetAlert/SetAlertMode/GuardSetAlarm/RedAlertRooms/ChkAlertTrigger/ChkSleepyGuard/GuardSleeping/GuardWakeUp/SetRespawnTime/ChkAlarmEnd/StopAlert done/partial) and regenerate `docs/rom-coverage.md`.
