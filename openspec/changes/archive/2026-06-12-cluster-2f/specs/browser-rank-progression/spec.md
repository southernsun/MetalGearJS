# browser-rank-progression delta — real prisoner placements

## ADDED Requirements

### Requirement: Prisoner rooms place their ROM prisoners

A `RoomsPrisoner` room SHALL place its prisoner from the ROM's room actor list
(actors.json; most plain rooms share the `ActorPrisoner` block at X 0x80, Y 0x60), with
his real `PrisonerTexts` rescue text — live in rooms 144/145/146/148/152/164/195 of the
exported world. DEMO prisoners keep their rooms (3/5-9) as the documented divergence.

#### Scenario: A real rescue

- **WHEN** Snake reaches interior room 144 behind its keycard door and touches the prisoner
- **THEN** the rescue counts toward his class with the room's real text (78)
