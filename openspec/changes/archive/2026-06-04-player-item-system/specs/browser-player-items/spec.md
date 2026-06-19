## ADDED Requirements

### Requirement: Minimal weapon/item inventory with selection

The game SHALL track a current weapon (`SelectedWeapon`) and a current item (`SelectedItem`) over a
small owned set, faithful to the ROM selection model (`ReadFKeys` → `SelectWeapon`;
`constants/Enums.asm`). For this slice the owned set is the handgun (weapon) and the cardboard box
(item). A selection input SHALL change the current weapon/item. (Browsers reserve the function
keys, so the binding MAY use number keys / a dedicated key — a documented divergence.) No
inventory UI is included.

#### Scenario: Select a weapon

- **WHEN** the player presses the selection input bound to an owned weapon
- **THEN** that weapon becomes the current weapon (`SelectedWeapon`)

#### Scenario: Select an item

- **WHEN** the player selects an owned item (e.g. the cardboard box)
- **THEN** that item becomes the current item (`SelectedItem`), readable by other systems

#### Scenario: Only owned entries are selectable

- **WHEN** the player tries to select something not in the owned set
- **THEN** the current selection is unchanged
