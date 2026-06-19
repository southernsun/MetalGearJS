# browser-dogs-wing delta

## ADDED Requirements

### Requirement: Dogs sleep, listen, and charge

Room 207's dogs SHALL follow DogLogic: sleeping a random 0x20-0x38 iterations, listening 20-32, then a coin flip back to sleep or a charge — single-axis runs at 3px per iteration toward the player, re-aiming with the bark every random 20-32 iterations and flipping to the other axis at walls. A bite costs 2 life and raises the alarm; a dog has 2 life.

#### Scenario: The charge

- **WHEN** a listening dog decides to run
- **THEN** it charges on one axis, barking at each re-aim, until shot or evaded

### Requirement: Coward Duck keeps CARD8

Room 193's Coward Duck SHALL appear while CARD8 is untaken: the unskippable text 139 once with the boss music, then the loop — sidestep toward the player for 8 iterations at 2px, stop and throw the elliptical boomerang (8 damage, returning to vanish), pause, return toward the room centre. He has 0x14 life; his death SHALL drop CARD8 at (0x38,0x70).

#### Scenario: Taking CARD8

- **WHEN** Coward Duck dies
- **THEN** CARD8 spawns at (0x38,0x70), and once taken he never appears again

### Requirement: Shooter rooms ambush

Entering rooms 88/90/91/206 SHALL force the alarm with their shooters already alerted (InitShooter spawns them in alert with a deep reinforcement timer).

#### Scenario: The ambush

- **WHEN** Snake enters room 206
- **THEN** the alarm is already up and the shooters converge
