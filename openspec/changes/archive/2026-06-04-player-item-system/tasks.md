> Minimal selection subsystem (state only). Port the ROM selection model (ReadFKeys/SelectWeapon,
> constants/Enums.asm); cite constants. Prerequisite for cardboard-box and player-handgun.

## 1. Inventory state

- [x] 1.1 Add `selectedWeapon`, `selectedItem`, and an `owned` set; seed owned = { handgun (`HAND_GUN=1`), box (`SELECTED_BOX=0x19`) }
- [x] 1.2 Add `selectWeapon(id)` / `selectItem(id)` (no-op if not owned); expose the current selection for other systems

## 2. Selection input

- [x] 2.1 Bind a selection input to choosing the current weapon/item (number keys or a dedicated key, since browsers reserve F-keys) — cite `ReadFKeys`/`SelectWeapon` and note the divergence

## 3. Verification

- [x] 3.1 Verify selection changes `selectedWeapon`/`selectedItem` and rejects unowned entries
- [x] 3.2 Regression: no effect on existing movement/guard (state-only)
