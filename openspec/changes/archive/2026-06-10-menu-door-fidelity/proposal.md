# Menu + door entry fidelity

## Why

Two user-reported behaviours diverge from the ROM and are now blocking faithful play:

1. **Menus select on confirm instead of on cursor move.** In the ROM, moving the cursor IS the
   selection (`CtrlMenuWeapon` → `SelectWeapon`, Banks0123.asm:11387; `MenuEquipMove` →
   `SetSelectedItem`, logic/menuequipment.asm:160) — there is no confirm press, and closing the
   menu keeps whatever is highlighted. Fire in the EQUIPMENT menu is not a confirm either: it
   runs `ChkUseItem` (ration = full heal + consume, blocked in deep water). Our port uses
   confirm-to-select and has no item use at all.
2. **Door entry placement drifts.** Going in and out of a door shifts Snake a little each time
   until a door stops working. The ROM places Snake with exact per-door-type offsets
   (`SetPlayerInDoor`/`PlayerInDoorDat`, logic/nextroom.asm:393-481) and also sets his facing
   from the same table; our `enterDoor` uses approximate per-type enter offsets plus a `freeAt`
   outward scan that relocates Snake when an offset lands on a solid tile — the scan is the
   drift source (E/W doors 7↔11 are the prime case).

## What Changes

- **Menus select on cursor move** (both menus): every cursor move immediately writes
  `SelectedWeapon`+`WeaponInUse` / `SelectedItem`; closing keeps the highlighted entry. The
  confirm-press path is removed.
- **Faithful menu grid movement**: the cursor walks the ROM's fixed grid (weapons: 2 columns,
  4+3 slots, `SelectIdx` 1-7; equipment: 3 columns, 9+9+7 slots, `SelectIdx` 1-25) with the
  ROM's edge clamps (no wrapping). Moving onto an empty compacted slot selects ID 0
  (holstered / no item) — exactly like the ROM. OPTION and the suppressor slot are not
  cursor-navigable (the ROM's cursor cannot reach them).
- **Hold-to-repeat cursor movement**: held directions repeat with the ROM's 8-frame
  `ControlHoldWait` delay (trigger moves immediately).
- **Fire in the EQUIPMENT menu = `ChkUseItem`**: ration → consume 1 + full heal (skipped in
  deep water), antidote → clears poison (not consumed — faithful), transmitter → consumed +
  flag cleared, cigarettes → only while the destruction timer runs. Only the ration path is
  observable in the current slice (no poison/timer systems); the rest is ported as guarded
  no-ops with the checks in place.
- **Menu SFX**: cursor move plays SFX 0x20, item use plays SFX 0x21 (new `--export-sfx`
  exports: cursor.wav, useitem.wav).
- **Door entry uses `PlayerInDoorDat`**: port the 19-entry table (offY, offX, direction per
  render type); on entering a room through a door, Snake is placed at door draw XY + the
  type's signed offsets and his facing is set from the table. The `freeAt` outward scan and
  the old `enterOffX/Y` approximations are removed from the door path.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `browser-equipment-menu`: cursor movement selects immediately (no confirm press); ROM grid
  navigation with edge clamps and hold-repeat; Fire in the equipment menu uses the selected
  item (`ChkUseItem`); cursor-move and use-item SFX.
- `browser-doors`: entering a door places Snake via the ROM's `PlayerInDoorDat` per-type
  offsets and sets his direction from the table; no free-tile relocation scan.

## Impact

- `web/game.js`: menu input/state (`menuMove`, `menuConfirm` removal, grid model, hold-repeat,
  `useItem`), `enterDoor` rewrite, new SFX buffers.
- `web/menu.headless.mjs`, `web/doors.headless.mjs`: updated + new checks (select-on-move,
  ration use, exact door landing positions, no-drift round trips).
- `web/assets/`: cursor.wav, useitem.wav (via `ThemeOfTaraPlayer --export-sfx`).
- `web/index.html` / docs: key help text (Space in menus = use item, not confirm).
- `docs/SESSION-STATE.md`, `docs/rom-coverage.md` (regenerated).
