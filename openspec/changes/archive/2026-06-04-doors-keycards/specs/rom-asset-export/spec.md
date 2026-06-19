## ADDED Requirements

### Requirement: Export door lock type

The door export SHALL emit, for each usable door, its **lock type** (DoorsList byte `+2` `LogicOpen`, low
5 bits — the value `ChkOpenDoor` dispatches on: plain, keycard `ChkCard1..8`, elevator, etc.) alongside
the existing render type, so the browser can apply the correct open rule. Elevator and card doors SHALL
no longer be filtered out of the export when they are part of an exported room.

#### Scenario: Doors carry their lock

- **WHEN** a room with a keycard door is exported
- **THEN** each door entry in `doors.json` includes its lock type (e.g. card N) in addition to its
  render type and destination
