# browser-guard-alarm Specification

## Purpose
TBD - created by archiving change guard-alarm-system. Update Purpose after archive.
## Requirements
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

### Requirement: The alarm is a global flag, bounded by its lifecycle

The alarm SHALL be a single game-wide flag (not a per-guard latch). A guard in the trigger room
(`RoomAlert`) SHALL be in the alerted (chasing) state while the alarm is up. The alarm SHALL end per
its lifecycle (`ChkAlarmEnd`) — when the trigger room is left or its guard is cleared (see the
alarm-end requirement) — rather than being latched for the whole slice.

#### Scenario: The trigger room's guard is alerted

- **WHEN** the alarm is active and the trigger room has a guard
- **THEN** that guard is alerted (chasing), without re-detecting Snake

#### Scenario: Leaving the trigger room ends the alarm

- **WHEN** the player leaves the trigger room while the alarm is up
- **THEN** the alarm ends (faithful to `ChkAlarmEnd`, with no reinforcements pending)

### Requirement: Reinforcements are deferred to a multi-actor system

Faithful red-alert reinforcements SHALL be **deferred**: the ROM spawning **new** guards entering from
room exits, scaled by `NumRespawnGuards` (`SetAlertMode`/`SetRespawnTime*`/`RespawnInfo`), requires an
actor-spawn system the browser does not have (it models one guard per room). The slice SHALL NOT fake
them by respawning the killed guard in place (an earlier approximation that was removed as unfaithful).
A red alert SHALL still be distinguished by its red alert sign.

#### Scenario: A killed guard does not respawn in place

- **WHEN** the room's guard is defeated during a red alert
- **THEN** no guard respawns in its place (reinforcements await the multi-actor system)

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


### Requirement: The transmitter prevents the alarm from ending

While `TransmiTaken` is set, `ChkAlarmEnd` SHALL return without ending the alarm
(Banks0123.asm:6636-6638), and entering a room outside the no-alert list SHALL re-raise the
alert (`SetAreaMusic4`, Banks0123.asm:1590-1595). Consuming the transmitter from the
equipment menu clears the flag and restores normal alarm behaviour. Cameras and laser
beams force the RED alert variant when they raise it (`SetAlertMode5`,
logic/setalert.asm:52-64).

#### Scenario: The alarm will not die

- **WHEN** the alarm is up and Snake carries the transmitter out of the alert room
- **THEN** the alarm continues in the next room instead of ending

#### Scenario: Dropping the bug

- **WHEN** Snake uses the transmitter in the equipment menu
- **THEN** it is consumed, and the alarm can end again by the normal rules
