# browser-hind-d Specification

## Purpose
TBD - created by archiving change hind-d. Update Purpose after archive.
## Requirements
### Requirement: Hind D guards the roof pad

Room 50 SHALL stage the Hind D: the stationary tile-block body with the animated propeller (its SFX every 4 iterations), firing FIVE-bullet aimed bursts — a bullet every 5 iterations with 0x11 between bursts. It has 0x64 life; its destruction SHALL latch forever (BossHindD_KO) and replace the body with the wreck block.

#### Scenario: The duel

- **WHEN** Snake trades fire with the gunship
- **THEN** its bursts track him until its 0x64 life runs out, after which the wreck
  remains on every later visit

