# browser-capture — the capture flow

## ADDED Requirements

### Requirement: The capture scene triggers once in room 8

While `EquipBagTaken` is clear, standing in room 8 at X 0xC0-0xD0 SHALL start the capture
scene (`CommonLogic`, logic/common.asm:26-47 — GameMode 0x0B); after the equipment bag has
been recovered the zone SHALL be inert. (The zone is not yet reachable on foot in the
exported cluster — a `?capture` dev hook triggers the scene, a documented divergence until
the cluster expansion.)

#### Scenario: Triggering

- **WHEN** Snake stands in room 8's trigger zone before ever recovering the bag
- **THEN** the capture scene begins

#### Scenario: Once only

- **WHEN** Snake returns to the zone after recovering the bag
- **THEN** nothing happens

### Requirement: The scripted scene plays per CaptureSceneLogic

The scene SHALL follow the ROM script (logic/capturescene.asm): guard A appears at
(0xF0, Snake's Y) and says "DON'T MOVE!" (text 6, unskippable); guard B enters at X 0xF0
(below Snake at Y 0xB0, or above at 0x88 when Snake is past Y 0x98), walks left fast to
X 0xB8, turns toward Snake's row, reaches his Y and says "YOU ARE CAPTURED" (text 7,
unskippable); the music mutes, the screen fades out at the ROM pacing, and Snake is moved
to the prison.

#### Scenario: The scene

- **WHEN** the capture triggers
- **THEN** both guards play their script with both texts, the screen fades to black, and
  play resumes in the prison cell

### Requirement: Prison strips the equipment without erasing it

`PutInPrison` (logic/capturescene.asm:87) SHALL set `EquipRemoved`, zero the selected
weapon/item, clear the alert, and place Snake at (0x80, 0x50) in room 165. While
`EquipRemoved` is set: the weapon/item menus SHALL render empty (DrawWeaponMenu/
DrawEquipMenu, Banks0123.asm:1974/2171), menu movement SHALL select 0 (MenuWeaponMove
:11469), the HUD boxes SHALL show nothing, and no weapon can fire — while the inventory
ARRAYS keep their contents for the recovery.

#### Scenario: Captured state

- **WHEN** Snake wakes in the cell and opens the menus
- **THEN** both menus are empty, the HUD shows no weapon/item, and Fire does nothing

### Requirement: The cell wall punches out and the bag restores everything

Room 165's exit SHALL be its type-14 prison-wall door (id 0x67 → room 164) opened per
`ChkPrisonWalls` as found in the disassembly. Picking up the equipment bag SHALL run
`RecoverEquipment` (logic/items.asm:295): `EquipRemoved` cleared, `EquipBagTaken` set,
text 62 shown (the Western pickup gate's one permitted description), and the TRANSMITTER
added to the inventory — the bag is bugged.

#### Scenario: Escape and recovery

- **WHEN** Snake opens the cell wall, reaches the bag and takes it
- **THEN** "I TOOK BACK THE WEAPONS AND EQUIPMENTS." shows, the menus/HUD are restored,
  and the transmitter sits in the inventory

### Requirement: The transmitter keeps the alarm alive until dropped

While `TransmiTaken` is set, the alarm SHALL never end (`ChkAlarmEnd`, Banks0123.asm:6636
returns immediately) and SHALL re-raise on room entry per `SetAreaMusic4`
(Banks0123.asm:1590, outside the no-alert rooms); using the transmitter in the equipment
menu (the already-ported `ChkUseItem` branch) SHALL consume it and clear the flag, letting
the alarm end normally again.

#### Scenario: Bugged

- **WHEN** Snake carries the transmitter through guarded rooms
- **THEN** the alarm stays up no matter how he evades, until he drops the transmitter from
  the equipment menu
