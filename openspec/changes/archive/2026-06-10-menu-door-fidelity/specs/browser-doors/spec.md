# browser-doors delta — ROM door-entry placement (PlayerInDoorDat)

## MODIFIED Requirements

### Requirement: Enter an open door to its destination room

When Snake enters an open door, the game SHALL hard-cut to that door's destination room and place
Snake at the destination room's door with the same ID using the ROM's door-entry placement
(`SetPlayerInDoor2..4` + `PlayerInDoorDat`, logic/nextroom.asm:397-481): Snake's position is the
destination door's draw XY plus that door **render type's** table offsets as **8-bit adds**
(`Y = (drawY + offY) & 0xFF`, `X = (drawX + offX) & 0xFF`; offsets like `0xF8` act as negative),
and Snake's **facing is set from the same table entry** (1=up, 2=down, 3=left, 4=right). The
placement SHALL be exact and deterministic — no free-tile relocation scan, no clamping — so
repeated in-and-out transits through the same doors land on identical pixels every time.

#### Scenario: Entering a door transitions to its destination

- **WHEN** Snake walks into an open door whose `dest` is an exported room
- **THEN** the game makes `dest` the active room (a discrete cut, no scroll)
- **AND** Snake is positioned at the matching door's draw XY plus the `PlayerInDoorDat` offsets
  for its type, facing the table's direction for that type

#### Scenario: Door round trips do not drift

- **WHEN** Snake enters a door, returns through the destination room's matching door, and repeats
  the round trip several times
- **THEN** his landing position in each room is pixel-identical on every transit and every door
  on the path keeps working

#### Scenario: Destination has no matching door

- **WHEN** the destination room has no door with the entered door's ID
- **THEN** the game places Snake at a safe default position inside the destination room rather
  than off-screen, and does not crash
