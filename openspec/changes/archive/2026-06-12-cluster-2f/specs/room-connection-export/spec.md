# room-connection-export delta — the connected world

## ADDED Requirements

### Requirement: Extras export even when the BFS has seen them

`--extra` rooms SHALL be deduplicated against the EXPORTED room list, not the BFS `seen`
set — the BFS marks enqueued neighbours as seen without exporting them when the room-count
cap hits (room 15 was silently dropped this way).

#### Scenario: A neighbour beyond the cap

- **WHEN** a room adjacent to the BFS cluster is requested via `--extra`
- **THEN** it exports, with its connections to the cluster intact

### Requirement: The world set spans the connected map

The canonical export SHALL cover the connected world: the start cluster, the 12-15
stairwell, the second floor (16-36 with its interior offices 139-158/195), both elevator
rooms (240/241), the prison pocket with its basement chain (54/57-63, 164/165/168), and
the deliberate islands (water 71-78/105, ladders 224-226, laser-camera 111) — with
check-graph confirming everything else reachable on foot/elevator from spawn.

#### Scenario: The capture zone on foot

- **WHEN** check-graph walks from spawn
- **THEN** room 8's right corridor (the capture trigger zone) is reached via 11 → 15 →
  14 → 13 → 12
