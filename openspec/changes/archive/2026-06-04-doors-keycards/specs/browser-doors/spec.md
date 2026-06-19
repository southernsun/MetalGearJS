## MODIFIED Requirements

### Requirement: Open a door on contact

When Snake walks into a closed door, the game SHALL open it **only if its lock allows** (faithful to
`ChkOpenDoor`, `logic/doors/opendoor.asm`, which dispatches on the door's lock type, DoorsList byte `+2`
`LogicOpen`): a plain door (lock 0) opens on contact as before; a **keycard** door opens only when the
matching card is the selected item and Snake faces it (see below). On a successful open the game SHALL
play the door sound effect once and show the open transition; a locked door SHALL stay closed (and not
transition). Snake cannot open any door while under the cardboard box (`PlayerAnimation == 7`). (Elevator
doors are deferred to the elevator change — they do not push-open here.)

#### Scenario: Contact opens an unlocked door

- **WHEN** Snake moves against a closed, unlocked door's footprint
- **THEN** the door plays `door.wav` once and becomes open (its appearance changes to open)
- **AND** the sound plays only after audio has been unlocked by a user gesture

#### Scenario: A locked door stays closed

- **WHEN** Snake contacts a door whose lock is not satisfied (wrong/again no card, wrong direction)
- **THEN** the door does not open and Snake does not transition through it

#### Scenario: An already-open door does not replay the open

- **WHEN** Snake contacts a door that is already open
- **THEN** the open sound is not replayed and the door stays open

#### Scenario: No door opening under the box

- **WHEN** Snake is under the cardboard box and contacts a door
- **THEN** the door does not open

## ADDED Requirements

### Requirement: Keycard-locked doors

A door with a keycard lock (`ChkCard1..8`) SHALL open only when the player's **selected item** is the
matching card (`SelectedItem == SELECTED_CARDn`) **and** Snake is facing the door (the door's render
direction equals `PlayerDirection`). Holding the card without selecting it, selecting the wrong card, or
facing the wrong way SHALL leave the door locked. When both conditions hold the door opens like any
unlocked door (transition into its destination).

#### Scenario: Right card opens the door

- **WHEN** Snake faces a keycard door with the matching card selected and walks into it
- **THEN** the door opens and behaves like a normal open door

#### Scenario: Wrong or unselected card keeps it locked

- **WHEN** Snake contacts a keycard door without the matching card selected
- **THEN** the door stays locked
