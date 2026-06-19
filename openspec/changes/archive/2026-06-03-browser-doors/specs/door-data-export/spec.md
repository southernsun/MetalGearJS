## ADDED Requirements

### Requirement: Export per-room door records

The export step SHALL emit `doors.json` listing, for each exported room, its normal doors
with fields decoded from `data/doors.asm` (`idxDoors` → `DoorsRoomNNN`, 5-byte records
`[ID, Type, DrawY, DrawX, DestRoom]`, `0xFF` terminator).

#### Scenario: Doors JSON is generated

- **WHEN** the export step runs for the exported room set
- **THEN** it writes `web/assets/doors.json` mapping each exported room number to an array of
  door objects, each with `id`, `type`, `x`, `y`, and `dest` (destination room number)

#### Scenario: Non-traversable doors are filtered out

- **WHEN** a door's destination is an elevator (`DestRoom ≥ 0xF0`), or the door is a known
  fake/special door (lorry-exit locators, the Metal Gear self-destruct lock), or its
  destination room is not in the exported set
- **THEN** that door is omitted from `doors.json` (only doors usable in this slice are listed)

#### Scenario: Rooms with no doors

- **WHEN** a room's `idxDoors` entry is `NoDoorsRoom` (or all its doors are filtered out)
- **THEN** that room maps to an empty door list (or is absent), and the game treats it as
  having no doors

### Requirement: Export the door type table

The export step SHALL emit `door-types.json` derived from `DoorOpenEnterDat`, giving for each
door type the open-footprint offsets/sizes and the enter-placement offsets used to size a
door and to position Snake when he arrives through a door of that type.

#### Scenario: Door types JSON is generated

- **WHEN** the export step runs
- **THEN** it writes `web/assets/door-types.json` keyed by door type, each entry exposing the
  `DoorOpenEnterDat` fields (open offset/size in X and Y, and the enter offset in X and Y)
- **AND** the values match the bytes in `DoorOpenEnterDat` for that type (signed where the ROM
  treats them as signed offsets)

### Requirement: Export the door sound effect

The export step SHALL render the door sound effect (`Sfx_Door` from `sound/sfx/SfxDoors.asm`)
to `web/assets/door.wav`, using the same PSG/driver reproduction as the existing SFX export.

#### Scenario: Door WAV is generated

- **WHEN** the door SFX export runs
- **THEN** it writes `web/assets/door.wav` as a valid WAV reproducing `Sfx_Door`
