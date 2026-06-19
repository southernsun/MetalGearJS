# browser-metal-gear Specification

## Purpose
TBD - created by archiving change metal-gear-bigboss. Update Purpose after archive.
## Requirements
### Requirement: Metal Gear falls only to the bomb order

Room 118's Metal Gear SHALL ignore all weapons except plastic bombs exploding at its legs: each pushes Left/Right (by bomb X vs the centre) into a 16-deep newest-first buffer, and ONLY the full PlasticBombOrder match (play order R,R,L,R,L,R,R,L,L,R,L,L,R,L,R,R) destroys it — killing its two laser cameras, replacing the body with the background block forever, and opening the lock-14 door (OpenBigBossDoor). Wrong bombs do nothing and the sequence can always be restarted.

#### Scenario: The puzzle

- **WHEN** the sixteen bombs land in the resistance's order
- **THEN** Metal Gear is destroyed and the way to Big Boss opens

### Requirement: Big Boss duels and frees the escape

Room 119's Big Boss SHALL deliver his confession (text 147) once, then fight hit-and-run: fleeing when Snake closes within 0x30, firing aimed shots when aligned, drifting between cover otherwise. Life 0x28; his death SHALL latch (never returning) and set OpenBigBossDoor for the escape-ladders door.

#### Scenario: The end of Outer Heaven's commander

- **WHEN** Big Boss falls
- **THEN** the escape door opens and the room stays empty forever

