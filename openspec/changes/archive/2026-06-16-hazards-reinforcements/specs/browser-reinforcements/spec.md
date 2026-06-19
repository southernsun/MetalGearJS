# browser-reinforcements delta

## ADDED Requirements

### Requirement: Cameras alert the surveillance centre

A camera sighting (and a camera TOUCH — the body has the shape-8 box with 0x10 contact damage, so hugging its wall is detected) SHALL raise the RED alert AND arm AlertRespawnTimer = 0x28, like ChkViewObstacles' camera branch ("the surveillance centre alerts other guards").

#### Scenario: Near the wall

- **WHEN** Snake touches a camera's body
- **THEN** he takes 0x10 damage, the red alert rises, and reinforcements are armed

### Requirement: Reinforcements respawn while the alert is armed

While the alarm is up and AlertRespawnTimer is armed (the RED alert and camera sightings arm it), the current room's RespawnInfo entry SHALL spawn an ALERTED guard at one of its two packed spots each time the timer elapses (next = 0x14 + rnd&0xF), capped at 3 simultaneous guards, never from room 188 on; ending the alarm disarms the spawner.

#### Scenario: Guards keep coming

- **WHEN** a camera spots Snake in a RespawnInfo room
- **THEN** alerted guards keep arriving every ~20-30 iterations until he escapes the alarm

### Requirement: The ROM guard variants spawn faithfully

actors.json SHALL classify ID_GUARD_MEDIUM (0.75 patrol speed), ID_GUARD_SILENCER (slow; room 150's four count toward DismissActor8 — the LAST kill spawns the SUPPRESSOR at (0x62,0x24)), and ID_GUARD_ALERT/ID_GUARD_REDALERT (spawn already chasing).

#### Scenario: The suppressor room

- **WHEN** the last of room 150's four silencer guards dies
- **THEN** the suppressor pickup appears at (0x62,0x24) with the spawn SFX
