# browser-lorry-ride delta

## ADDED Requirements

### Requirement: Boarding a moving lorry rides it out

Entering one of the six MovingLorries interiors SHALL start the ride: 0x90 iterations with controls dead, the screen wobbling through the VertScrollOffset table, the engine SFX looping, and text 91 once per game; the ride then returns to play inside the lorry, whose exit door opens at its destination.

#### Scenario: I goofed

- **WHEN** Snake boards lorry 173 in the courtyard
- **THEN** the lorry drives off — shaking, engine running, the one-time goof text — and
  drops him where it was headed

### Requirement: The desert convoy ambushes

Room 104 SHALL spawn its four lorry shooters already alerted with the alarm forced on entry.

#### Scenario: The convoy trap

- **WHEN** Snake climbs into the desert lorry
- **THEN** four shooters converge under the alarm
