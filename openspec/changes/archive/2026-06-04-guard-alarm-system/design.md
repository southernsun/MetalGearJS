## Context

`guard-chase-damage` gave a single guard a private alert latch: once it sees Snake it chases forever
(cleared only by KO/kill or room change). `player-hud` added a firing-noise hook that calls
`enterAlert(guard)` on the current room's guard only. The ROM instead has a **global alarm** (`AlertMode`)
driven from `logic/setalert.asm`, `logic/actors/chkdiscover.asm`, `logic/checkweaponalert.asm`,
`logic/actors/guard.asm`/`guardalert.asm`, and `Banks0123.asm` (`ChkAlarmEnd`).

The browser already has: a per-room single `guard` object (`buildGuard`/`setRoom`), `enterAlert`,
`guardSeesSnake` (LOS), `stopAlert`, alert music, and the player-shot noise hook. What's missing is the
*game-wide* state and lifecycle around it.

## Goals / Non-Goals

**Goals:**
- One global alarm (`alertMode`) raised by LOS discovery or unsuppressed noise (faithful gating:
  `RoomShotSecure`, isolated rooms, already-up).
- Red vs. low alert from `RedAlertRooms` (the 16-byte table, inlined); red arms reinforcements.
- Alarm persists across room changes; guards entered into an alarmed room start alerted.
- Sleeping guards that hold a pose and wake on alarm / noise / touch.
- Alarm end (`ChkAlarmEnd`/`StopAlert`): alert room cleared/left → music resumes, guards patrol.

**Non-Goals:**
- A multi-actor (16-per-room) spawn pool — the browser has one guard per room, so reinforcements are
  scoped to respawning that one guard on the red-alert timer.
- Cameras/lasers as alarm triggers, dogs/lorries, boss AI, the transmitter-keeps-alarm case.
- The unskippable "I'm sleepy"/"Overslept" text windows (no text-window system yet) — the sleep/wake
  *behaviour* is ported; the dialogue is omitted (flagged).

## Decisions

- **A small alarm module in `game.js`, separate from the per-guard state.** Globals: `alertMode`,
  `redAlertFlag`, `roomAlertTrigged`, `alertRespawnTimer`, plus the inlined `RED_ALERT_ROOMS` (16 bytes)
  and `ROOM_SHOT_SECURE` (set). One `raiseAlarm(room, {bySight})` entry implements
  `GuardSetAlarm`→`SetAlert`→`SetAlertMode`: compute `redAlertFlag` from the `RedAlertRooms` bit (rooms
  ≥128 → low), set `alertMode`, record `roomAlertTrigged`, arm `alertRespawnTimer` (red only), play
  alert music. Rationale: mirrors the ROM's split between discovery (`chkdiscover`) and the mode-set
  (`setalert`), and keeps the alarm independent of which guard/room is active.
- **Route both triggers through `raiseAlarm`.** `guardSeesSnake()` → `raiseAlarm(currentRoom,
  {bySight:true})`; the player-shot noise hook → `chkAlertTrigger()` (the `RoomShotSecure`/isolated/
  already-up gate) → `raiseAlarm`. Replaces the current-room-only `enterAlert` shortcut. The guard's
  own transition into chase (`enterAlert`/`TransformAlertGuard`) still happens, but is now triggered
  by `alertMode` being set, not the other way round.
- **`buildGuard`/`setRoom` consult `alertMode`.** When a room becomes active while `alertMode` is set
  and it has a guard, the guard is built directly into the alerted/chase state (faithful to entering a
  room during an alarm — guards aren't patrolling). Rationale: the alarm is global, so room entry must
  reflect it.
- **Reinforcement respawn = respawn the room's single guard.** Track `alertRespawnTimer` (the ROM uses
  a word: high byte `0x0A`, low byte a random `0x10–0x1F`, room-gated via `SetRespawnTime`). Under red
  alert, when the room's guard is killed/KO'd, schedule a respawn after the timer (and re-arm), faithful
  to `ChkAlarmEnd`'s respawn countdown. Document that the ROM would spawn up to `NumRespawnGuards`
  (`cards+3`) *distinct* actors — out of scope here. Rationale: largest faithful subset the single-guard
  model allows.
- **Sleeping guard as a guard sub-state.** Add `sleeping` to the guard state (seeded from a `sleeping`
  flag in `guards.json`, defaulting false). A sleeping guard renders a down/sleep pose, skips patrol &
  LOS, and on noise/touch (`listenShots`/contact) wakes → `raiseAlarm`; a raised alarm also wakes it.
  Rationale: matches `ChkSleepyGuard`/`GuardSleeping`/`GuardWakeUp` without needing the text system.
- **Alarm end via `chkAlarmEnd` each tick.** Port the `ChkAlarmEnd`/`StopAlert` conditions applicable
  here: elevator room ends it; otherwise when the alert room (`roomAlert`) has no active guard and no
  respawn pending → `stopAlert` (clear `alertMode`/flags, resume area music, guards back to patrol).
  Rationale: removes the permanent-latch behaviour faithfully.

## Risks / Trade-offs

- **Single-guard reinforcements read as "respawn", not "swarm"** → faithful in lifecycle, not in count;
  flagged in the spec/tasks. Mitigation: structure `alertRespawnTimer`/`NumRespawnGuards` so a future
  multi-actor change can lift the cap without reworking the alarm.
- **Alarm-end conditions are room/enemy-count based in the ROM, not a simple timer** → must port the
  `roomAlert`-cleared / respawn-pending logic, not invent a countdown, or the alarm will feel wrong.
- **`RedAlertRooms`/`RoomShotSecure` are for the first 128 rooms / fixed lists** → inline them verbatim
  from the ROM; rooms outside the browser's current cluster simply won't be exercised (note it).
- **Sleep/wake dialogue omitted** → behaviour matches, the text cue doesn't; acceptable until a text
  system exists.

## Migration Plan

1. `game.js`: add the alarm module (state + `RED_ALERT_ROOMS`/`ROOM_SHOT_SECURE` + `raiseAlarm`/
   `chkAlertTrigger`/`chkAlarmEnd`/`stopAlert`); wire LOS + noise into it; make `buildGuard` honor
   `alertMode`; add the sleeping sub-state; add red-alert respawn of the room guard.
2. `guards.json` export: add the `sleeping` flag (and any respawn marker) where the ROM has them.
3. Verify headless (raise by sight/noise; secure-room no-raise; red vs low; persist across room change;
   guard spawns alerted; sleeping holds then wakes+alarms; respawn under red; alarm ends → patrol) and
   in-browser. Update `coverage-map.json` (guard alarm/sleep/respawn routines) + regenerate the doc.

Rollback: the alarm module is additive; reverting restores the per-guard latch.

## Open Questions

- Which of the browser's current rooms (if any) have a `sleeping` guard or a red-alert bit set — verify
  against `guards.json` + `RedAlertRooms` so the feature is actually exercisable (else gate behind a dev
  hook and note it).
