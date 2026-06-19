# browser-guard delta — real placements

## ADDED Requirements

### Requirement: Rooms spawn their ROM guards

A room without a DEMO guard entry SHALL spawn its FIRST guard from the ROM's room actor
list (data/actorsinrooms.asm via actors.json) at the listed position, with his real patrol
path (`idxRoomPaths` point list) and speed class (ID_GUARD_FAST at Snake's speed,
ID_GUARD_SLOW at half — DirectionSpeeds). Additional guards in the list stay out until the
multi-actor system lands (the documented single-guard limit).

#### Scenario: A real patrol

- **WHEN** Snake enters room 26 on the second floor
- **THEN** its guard patrols the ROM's path (the row Y 112 between X 56 and 200)
