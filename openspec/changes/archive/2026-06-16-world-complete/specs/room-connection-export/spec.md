# room-connection-export delta — the full world

## MODIFIED Requirements

### Requirement: The world set spans the connected map

The canonical export SHALL cover EVERY defined ROM room (235 of the 251 indexed — 155/222/223/227 are RoomUndefined): the full mainland plus the roof (37-53), the desert (208-219), the dogs wing (192-207, including the lorry-ride destinations 199-201 and the parachute wall 204), the prison annex (151/154/159-163), the building-1 stragglers (104/107-110/117), the dark room 221, and the elevators 242/245-250 — with check-graph confirming every exported room reachable from spawn except room 204, which the ROM enters only by the parachute jump.

#### Scenario: No islands

- **WHEN** check-graph walks from spawn
- **THEN** every exported room except the parachute wall 204 is reached on foot, by door,
  by elevator, or by water
