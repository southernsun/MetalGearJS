## ADDED Requirements

### Requirement: A global alarm raised by sight or noise

The game SHALL maintain a single game-wide alarm flag (`AlertMode`) that is raised when the player is
discovered by a guard's line of sight (`GuardSetAlarm`) **or** makes noise — firing an unsuppressed
weapon in a room that is not secure. Firing-noise SHALL be gated faithfully to `ChkAlertTrigger`: it
does NOT raise the alarm in an isolated room or any room in `RoomShotSecure`, nor if the alarm is
already up. Both trigger paths SHALL go through one `raiseAlarm`/`SetAlert` entry point (replacing the
previous current-room-only alert), recording the trigger room (`RoomAlert`/`RoomAlertTrigged`) and
playing the alert music (`0x32`).

#### Scenario: Seen by a guard raises the alarm

- **WHEN** a guard's line of sight detects Snake and the alarm is not already up
- **THEN** the global alarm is raised, the trigger room is recorded, and the alert music plays

#### Scenario: An unsuppressed shot raises the alarm

- **WHEN** Snake fires the handgun (no suppressor) in a room that is not secure or isolated, and the
  alarm is not already up
- **THEN** the global alarm is raised (same as being seen)

#### Scenario: Shots in a secure room do not raise the alarm

- **WHEN** Snake fires in a `RoomShotSecure` room (or an isolated room)
- **THEN** no alarm is raised

### Requirement: Red alert vs. low alert per room

The alarm level SHALL be determined by the trigger room per `RedAlertRooms` (a 16-byte / 128-bit table
over rooms 0–127, the trigger room's bit = `RedAlertFlag`). A **red alert** SHALL arm reinforcements
(a non-zero `AlertRespawnTimer`); a **low alert** SHALL not. Rooms numbered ≥ 128 SHALL always be low
alert. (Camera/laser triggers raise the red-alert music `0x2F`; with no cameras in scope this is noted
but not required.)

#### Scenario: Red-alert room arms reinforcements

- **WHEN** the alarm is raised in a room whose `RedAlertRooms` bit is set
- **THEN** the alert is a red alert and the reinforcement respawn timer is armed

#### Scenario: Low-alert room has no reinforcements

- **WHEN** the alarm is raised in a room whose `RedAlertRooms` bit is clear (or room ≥ 128)
- **THEN** the alert is a low alert and no reinforcement timer is armed

### Requirement: The alarm persists across rooms

While the alarm is up, it SHALL remain up when the active room changes (it is global, not per-guard).
A guard in a room entered during an active alarm SHALL start in the alerted (chasing) state rather
than patrolling.

#### Scenario: Entering a new room during an alarm

- **WHEN** the alarm is active and the player moves to a connected room that has a guard
- **THEN** that guard begins alerted (chasing), without needing to re-detect Snake

#### Scenario: Alarm survives a room change

- **WHEN** the player changes rooms while the alarm is up
- **THEN** the alarm stays up (it is not cleared merely by leaving the room)

### Requirement: Reinforcements respawn during a red alert

While a red alert is up, a guard that is defeated or leaves the alert room SHALL **respawn** on the
reinforcement timer (`AlertRespawnTimer`, `SetRespawnTime*`/`ChkAlarmEnd`), so the room keeps producing
a threat until the alarm ends. The number of would-be reinforcements SHALL follow `NumRespawnGuards`
(minimum 3, scaling with the highest card obtained, per `SetAlertMode`). Because the browser models
**one guard per room**, this is realized as respawning that single guard on the timer; spawning
additional simultaneous guards is out of scope (a multi-actor system) and SHALL be noted as a divergence.

#### Scenario: A defeated guard respawns under red alert

- **WHEN** the room's guard is killed/KO'd while a red alert is active and the respawn timer is armed
- **THEN** a guard respawns in the room after the timer elapses

#### Scenario: No respawn under low alert

- **WHEN** the room's guard is defeated while only a low alert is active
- **THEN** no guard respawns

### Requirement: Sleeping guards wake on alarm or proximity

A guard flagged as sleeping SHALL hold a sleeping pose and not patrol until it is woken — by the alarm
being raised, or by Snake making noise / touching it (`ListenShotsChkTouch`) — faithful to
`ChkSleepyGuard`/`GuardSleeping`/`GuardWakeUp`. On waking by noise/touch the guard SHALL itself raise
the alarm (`GuardSetAlarm`); otherwise it returns to its prior patrol state.

#### Scenario: A sleeping guard stays put until woken

- **WHEN** a room has a sleeping guard and the alarm is not up
- **THEN** the guard remains in its sleeping pose and does not patrol or detect

#### Scenario: Noise near a sleeping guard wakes it and alarms

- **WHEN** Snake fires (unsuppressed) or contacts a sleeping guard
- **THEN** the guard wakes and the alarm is raised

### Requirement: The alarm ends and guards return to patrol

The alarm SHALL clear faithfully to `ChkAlarmEnd`/`StopAlert`: once the alert room is cleared of
enemies (and no respawn is pending), or on the ROM's end conditions (entering an elevator), the alarm
turns off, alert state is reset, area music resumes, and guards drop back to patrol. (The
transmitter-keeps-alarm-forever case is out of scope.) This replaces the prior "latched for the whole
slice, never calms down" behaviour.

#### Scenario: Clearing the alert room ends the alarm

- **WHEN** the alert room has no remaining active guard and no respawn is pending
- **THEN** the alarm clears, area music resumes, and guards return to patrol

#### Scenario: Guard returns to patrol after the alarm

- **WHEN** the alarm has ended
- **THEN** a guard that was chasing resumes its normal patrol path
