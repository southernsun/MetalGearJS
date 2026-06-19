# browser-player-items Specification

## Purpose
TBD - created by archiving change player-item-system. Update Purpose after archive.
## Requirements
### Requirement: Minimal weapon/item inventory with selection

The game SHALL track a current weapon (`SelectedWeapon`) and a current item (`SelectedItem`)
over the player's REAL inventory, faithful to the ROM model (`Weapons` / `Equipment` arrays,
`constants/Enums.asm`): Snake starts with nothing, and entries exist only once picked up (see
`browser-item-pickups`). Weapons carry an ammo count and items a units count; inventory order
SHALL be pickup order (the ROM fills the first empty slot). The suppressor is a flag
(`InvSupressor`), not a selectable weapon entry in the inventory arrays. A selection input
SHALL change the current weapon/item over the owned entries only. (Browsers reserve the
function keys, so the binding MAY use number keys / a dedicated key — a documented
divergence.)

#### Scenario: Empty start

- **WHEN** a new run begins
- **THEN** no weapon or item is owned, `SelectedWeapon`/`SelectedItem` are none, and Snake
  walks unarmed

#### Scenario: Select a weapon

- **WHEN** the player presses the selection input bound to an owned weapon
- **THEN** that weapon becomes the current weapon (`SelectedWeapon`)

#### Scenario: Select an item

- **WHEN** the player selects an owned item (e.g. the cardboard box, oxygen tank, or a keycard)
- **THEN** that item becomes the current item (`SelectedItem`), readable by other systems

#### Scenario: A selected keycard opens its door

- **WHEN** the player selects an owned keycard and faces the matching keycard door
- **THEN** the door's lock is satisfied (see `browser-doors`)

#### Scenario: Only owned entries are selectable

- **WHEN** the player tries to select something not in the inventory
- **THEN** the current selection is unchanged

### Requirement: Selection through the equipment menus

The current weapon and item SHALL also be selectable through the full-screen menus (see
`browser-equipment-menu`): confirming an entry in the weapon menu sets `SelectedWeapon`, and
confirming an entry in the item menu sets `SelectedItem`, over the REAL inventory in pickup
order (`CompactWeapons`/`CompactEquipment` compact the filled slots). The menus SHALL show
each owned weapon's ammo count from the inventory (3-digit `Render3Numbers` format) and the
ration's units count. The existing quick bindings SHALL continue to work.

#### Scenario: Menu selection updates the current weapon/item

- **WHEN** the player confirms a weapon in the weapon menu (or an item in the item menu)
- **THEN** `SelectedWeapon` (or `SelectedItem`) becomes that entry, readable by the rest of
  the game

#### Scenario: Menus list the inventory in pickup order

- **WHEN** the player opens a menu after collecting entries in some order
- **THEN** the menu lists exactly the owned entries, in the order they were collected, with
  real ammo/units counts

#### Scenario: Quick-select still works

- **WHEN** the player uses the existing quick-select binding instead of a menu
- **THEN** the current weapon/item still changes as before
