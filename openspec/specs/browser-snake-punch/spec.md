# browser-snake-punch Specification

## Purpose
TBD - created by archiving change browser-snake-movement-punch. Update Purpose after archive.
## Requirements
### Requirement: Punch action triggered by a key

The game SHALL let the player trigger a punch with a dedicated key. On trigger, Snake
SHALL enter a punch state for a short fixed duration, showing the punch sprite frame for
Snake's current facing, then return to the normal movement state.

#### Scenario: Punch plays the directional punch frame

- **WHEN** the player presses the punch key while Snake faces a direction
- **THEN** the canvas shows the punch frame for that direction for a short fixed duration
- **AND** after the duration elapses Snake returns to idle/walk animation

#### Scenario: Punch faces the current direction

- **WHEN** the player punches while facing left
- **THEN** the left punch frame is shown (and likewise for up, down, right)

### Requirement: Punch plays the punch sound effect

When a punch is triggered, the game SHALL play the exported punch sound effect through the
Web Audio API.

#### Scenario: Sound plays on punch

- **WHEN** the player triggers a punch
- **THEN** the punch sound effect plays once
- **AND** audio playback begins only after a user interaction, satisfying browser
  autoplay restrictions

### Requirement: Punch does not corrupt movement state

The punch action SHALL be self-contained: triggering it SHALL NOT leave Snake stuck in the
punch state, and movement SHALL resume normally after the punch completes. Re-triggering
the punch SHALL not stack indefinitely.

#### Scenario: Movement resumes after punch

- **WHEN** a punch completes
- **THEN** the player can immediately move Snake again with the correct walk/idle animation

#### Scenario: Holding or spamming punch is bounded

- **WHEN** the player presses the punch key repeatedly or holds it
- **THEN** the game does not enter an inconsistent state and each punch resolves within its
  fixed duration

