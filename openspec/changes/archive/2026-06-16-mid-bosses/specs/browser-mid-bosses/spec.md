# browser-mid-bosses delta

## ADDED Requirements

### Requirement: The Tank shells and strafes

Room 67's Tank SHALL drift vertically with idle beats, shell Snake's column (the falling shell bursting for 0x20 in a ±20 box), and rake machine-gun bursts from alternating sides (a bullet every 8 iterations, the 0-4 fan, 8 damage). It has 0x37 life, crushes on contact, and its death latches forever (BossTank_KO).

#### Scenario: The column

- **WHEN** Snake lines up with the cannon
- **THEN** a shell drops on him and bursts

### Requirement: The Bulldozer advances

Room 71's Bulldozer SHALL push downward in accelerating phases with brief stops, halting at the bottom; 0x28 life, a crushing touch, and the permanent KO latch.

#### Scenario: Stopping the push

- **WHEN** Snake unloads into it before it corners him
- **THEN** it dies for good and the route opens

### Requirement: The Arnolds keep CARD7

Room 83's two Arnolds SHALL watch (flipping facing randomly) and dash at 3px/iteration when Snake crosses their ±0x10 row (touch 8, life 0x28 each); the SECOND death SHALL drop CARD7 at (0x30,0x30), and once CARD7 is taken they never appear again.

#### Scenario: The pair

- **WHEN** the second Arnold dies
- **THEN** CARD7 spawns; re-entering later finds the room clear

### Requirement: The Fire Trooper sweeps his jet

Room 95's Fire Trooper SHALL deliver his unskippable text 108 once, stalk horizontally between X 0x60-0x80, and sweep his eight flames out and back toward Snake (each flame burning for 8); life 0x1E, touch 4; his death extinguishes the flames and latches.

#### Scenario: The jet

- **WHEN** the trooper attacks
- **THEN** the flame line extends toward Snake and retracts in a cycle
