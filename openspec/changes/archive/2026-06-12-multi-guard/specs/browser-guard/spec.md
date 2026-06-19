# browser-guard delta — multi-guard rooms

## ADDED Requirements

### Requirement: Rooms spawn ALL their guards

A room SHALL spawn EVERY guard in its ROM actor list (the EnemyList holds them all), each
with his own position, patrol path and speed class, each running the full per-guard logic
independently (patrol, sleep, LOS discovery, the alert AI, touch damage, punches, drops).
The alarm SHALL pull every guard into the chase, and the alert room SHALL count as cleared
only when ALL of its guards are down (`ChkAlarmEnd`'s enemy scan). The shared bullet pool
(6) spans all shooters.

#### Scenario: The room-18 gauntlet

- **WHEN** Snake walks into room 18 (five guards)
- **THEN** all five patrol their own paths, and an alarm sends all five after him

#### Scenario: Clearing an alerted room

- **WHEN** the alarm is up in a two-guard room and Snake downs only one
- **THEN** the alarm stays up until the second falls
