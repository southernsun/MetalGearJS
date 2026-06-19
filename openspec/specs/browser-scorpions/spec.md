# browser-scorpions Specification

## Purpose
TBD - created by archiving change desert-scorpions. Update Purpose after archive.
## Requirements
### Requirement: Scorpions wander, charge, and sting with poison

Scorpions (rooms 102/208/209) SHALL follow ScorpionLogic: random DIAGONAL wander bursts (±1px per iteration, 5-8 iterations each), turning to the opposite diagonal at the room margins; when the player comes within 0x51 (manhattan), a straight charge toward him for 8 iterations, then a 0x14-iteration rest. A sting (the guard-class touch box) SHALL deal NO direct damage — it sets Poisoned with the damage SFX; while poisoned, Snake SHALL lose 1 life every 0x40 iterations until the ANTIDOTE is used (which clears the flag without consuming the item). Scorpions have 2 life (one handgun bullet) with the shape-2 bullet box.

#### Scenario: The sting

- **WHEN** a scorpion touches Snake
- **THEN** no life is lost at contact, but the poison drains 1 life every 0x40 iterations
  until the antidote is used

#### Scenario: The charge

- **WHEN** Snake comes within 0x51 of a wandering scorpion
- **THEN** it charges straight at him, rests, and resumes wandering

### Requirement: The desert flag locks gate as in the ROM

Lock 12 (building 2's desert entrance) SHALL open from inside room 73 by walking south, and from outside only when the desert-security event has set its one-shot flag; lock 13 (the compass room) SHALL open only when Jennifer's radio event has set its one-shot flag. Both flags clear on use (the ROM's xor-a stores).

#### Scenario: Locked until the event

- **WHEN** Snake pushes the lock-12 door from the desert without the flag
- **THEN** it stays locked; with the flag set it opens once and the flag clears

