## Context

ROM: `SelectedWeapon`/`SelectedItem` index the player's inventory; F-keys (`ReadFKeys`) pick a
slot via `SelectWeapon` (mapping F1–F7 to owned weapons). Constants in `constants/Enums.asm`
(`HAND_GUN=1`…`MISSILE=7`; `SELECTED_BOX=0x19`, `SELECTED_OXYGEN=0x0A`, …). The port needs only a
tiny slice of this: a current weapon, a current item, a small owned set, and a way to change them.

## Goals / Non-Goals

**Goals:** minimal selection state + input; seeded with handgun + box; readable by other systems.
**Non-Goals:** inventory UI, pickups, ammo, the full roster, equip *effects* (box render / firing).

## Decisions

- **State-only module.** `selectedWeapon`, `selectedItem`, `owned` (a Set), plus
  `selectWeapon(id)` / `selectItem(id)`. No UI; the HUD change visualises it later.
- **Key binding is a documented divergence.** Browsers intercept F1–F5; bind selection to number
  keys (or a dedicated cycle key) instead of literal F-keys, citing `ReadFKeys` and noting the
  divergence per the CLAUDE.md rule.
- **Seed minimally:** owned = { handgun, box }. Other weapons/items are added when their features land.

## Risks / Trade-offs

- **[No visible feedback without a HUD]** → acceptable; selection is observable via its effects
  (box appearing, handgun firing) once those changes land. The HUD change adds the indicator.
- **[Divergent key binding]** → flagged; trivially re-mappable when an input/HUD pass happens.
