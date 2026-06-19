# room-connection-export delta — the full mainland

## MODIFIED Requirements

### Requirement: The world set spans the connected map

The canonical export SHALL cover the FULL mainland (171 rooms): buildings 1-3 with all
floors/basements/interiors, the prison, the courtyard, the water network, the lorries,
building 2's three floor strips with elevators 243/244, the gas floor, the dark rooms
(123-125, 220), the moving-lasers room 72, and the card-chain interiors (CARD1/3/4/5/6) —
with check-graph confirming EVERY exported room reachable from spawn (zero islands; the
remaining unexported zones are the desert 208+, the roof 37-53, and the endgame rooms).

#### Scenario: No islands

- **WHEN** check-graph walks from spawn
- **THEN** every exported room is reached on foot, by door, by elevator, or by water
