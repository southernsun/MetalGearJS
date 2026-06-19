## Why

The cardboard box and the handgun both depend on Snake having a *selected item* and *selected
weapon* — the ROM's `SelectedItem`/`SelectedWeapon` driven by the F-key selection (`ReadFKeys`/
`SelectWeapon`). The port has none of this. This change adds the minimal selection subsystem those
two features need — state only, no inventory UI (the HUD is its own change).

## What Changes

- Add a minimal inventory: a small **owned** set, a **current weapon** (`SelectedWeapon`) and a
  **current item** (`SelectedItem`), seeded with the handgun (weapon) and the cardboard box (item).
- Add selection input (`ReadFKeys` → choose the current weapon/item). Browsers reserve the function
  keys, so the binding may use number keys / a dedicated key instead — a documented divergence.
- No firing, no box rendering, no projectiles here — just the selection state and its changes
  (consumed by `cardboard-box` and `player-handgun`).

**Out of scope:** the visible inventory/HUD UI (HUD change); the full weapon/item roster; actually
firing or equipping effects (their own changes).

## Capabilities

### New Capabilities

- `browser-player-items`: a minimal player inventory/selection — current weapon and current item
  over a small owned set, changed via the selection input — the hook the box and handgun build on.

## Impact

- **Browser game** (`web/game.js`): add `selectedWeapon`, `selectedItem`, and an `owned` set;
  selection input handling; expose the current selection for other systems to read.
- **Source consumed (read-only)**: `logic/controls.asm` `ReadFKeys`; `Banks0123.asm` `SelectWeapon`;
  `constants/Enums.asm` weapon constants (`HAND_GUN=1`, …) and item constants (`SELECTED_BOX=0x19`).
- **Dependencies**: none required to implement; it is the prerequisite for `cardboard-box` and
  `player-handgun`.
