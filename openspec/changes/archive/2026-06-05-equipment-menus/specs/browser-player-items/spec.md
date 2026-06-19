## ADDED Requirements

### Requirement: Selection through the equipment menus

The current weapon and item SHALL also be selectable through the full-screen menus (see
`browser-equipment-menu`): confirming an entry in the weapon menu sets `SelectedWeapon`, and confirming
an entry in the item menu sets `SelectedItem`, over the same owned set as the quick-select bindings.
The existing quick bindings SHALL continue to work.

#### Scenario: Menu selection updates the current weapon/item

- **WHEN** the player confirms a weapon in the weapon menu (or an item in the item menu)
- **THEN** `SelectedWeapon` (or `SelectedItem`) becomes that entry, readable by the rest of the game

#### Scenario: Quick-select still works

- **WHEN** the player uses the existing quick-select binding instead of a menu
- **THEN** the current weapon/item still changes as before
