# World complete — every defined ROM room exported

## Why

The mainland stopped at 171 rooms; the desert, the roof, the dogs wing, the prison annex,
the lorry-ride destinations and five more elevators stayed capped. Exporting the FULL set
of defined rooms (235 of the ROM's 251 indexed; 155/222/223/227 are RoomUndefined) removes
every map cap at once and lets the remaining actor/boss slices land into real rooms.

## What Changes

- 64 rooms exported: the roof 37-53, the desert 208-219, the dogs wing 192-207 (with the
  lorry-ride destinations 199-201 and the parachute wall 204), the prison annex 151/154/
  159-163, building-1 stragglers 104/107-110/117, the dark room 221 (with its .dark.png
  variant), and elevators 242/245-250 (the long underground 247-250 chain, the dogs-wing
  245/246, the roof 242).
- actors.json regenerated: 65 actor rooms; the new guards/prisoners/pitfalls (roof guards,
  desert red-alert troopers, the 193 prisoner trio, 221's triple pitfalls) spawn through
  the systems already shipped.
- check-graph: every exported room reachable from spawn EXCEPT room 204 — entered only by
  the parachute jump (the roof-traversal slice); documented, not an island bug.
- Bespoke actors in these rooms (scorpions, dogs, sentinels, bridges, jetpack/power
  switches, Hind D, lorry shooters, Coward Duck, rolling barrel) ship in their own slices;
  their rooms render and connect now.

## Capabilities

### Modified Capabilities

- `room-connection-export`: the world set grows to ALL defined rooms.

## Impact

- web/assets only (rooms, doors, connections, actors); no game.js changes; all suites green.
