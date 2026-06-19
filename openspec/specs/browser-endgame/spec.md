# browser-endgame Specification

## Purpose
TBD - created by archiving change endgame. Update Purpose after archive.
## Requirements
### Requirement: The self-destruct countdown runs the final act

Metal Gear's destruction SHALL arm the base's self-destruct: 3000 units counting down every iteration in every mode, displayed as red digits in the CALL-sign slot; reaching zero kills Snake. Cigarettes used during the countdown SHALL add 2000 units and be consumed.

#### Scenario: The race out

- **WHEN** Metal Gear falls
- **THEN** the countdown starts in the HUD and only the escape (or cigarettes) buys time

### Requirement: Radio messages set the late-game flags

Reading text 117 SHALL set Jennifer's rocket promise, text 118 SHALL set the compass-door flag (the lock-13 door opens), and text 138 SHALL mark Schneider captured — exactly TextBoxExit's flag table (skipped texts set nothing).

#### Scenario: Jennifer opens the door

- **WHEN** Jennifer's "I WILL OPEN THE DOOR" message is read to the end
- **THEN** the compass room's lock-13 door opens on the next push

