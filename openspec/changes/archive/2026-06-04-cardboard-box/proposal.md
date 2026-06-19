## Why

The cardboard box is Metal Gear's iconic hide-in-plain-sight item. In the ROM it's simple: when the
box item is selected, Snake is drawn as the box (`PlayerAnimation=7`, `SetSprBox`) and otherwise
moves exactly like normal walking. With the control-mode dispatch and the item system in place,
this change adds it.

## What Changes

- When the selected item is the cardboard box (`SELECTED_BOX`), draw Snake as the box
  (`PlayerAnimation=7`, `SetSprBox` — sprites 42/44, alternating when moving) and let him move
  under normal control.
- Drop the box appearance when the box is deselected, or when Snake enters water / punches / dies
  (the ROM lets those animations take over).
- **Export**: the box Snake frames.

**Out of scope:** enemy/guard reactions to the box (the ROM box is a sprite/flag — guards still
see you; box-vs-detection stealth is a later gameplay change); the truck/box auto-transport; other
items.

## Capabilities

### Modified Capabilities

- `browser-player-control-modes`: adds the cardboard-box appearance/movement (box sprite while the
  box item is selected; normal-control movement; dropped on deselect/water/punch/death).
- `rom-asset-export`: emits the cardboard-box Snake sprite frames.

## Impact

- **Browser game** (`web/game.js`): when `selectedItem == box`, set `playerAnimation=7` and draw
  the box frames; otherwise unchanged. Precedence so water/punch/death override the box.
- **Export tooling**: add the box frames (`SetSprBox`, sprites 42/44) to the Snake spritesheet.
- **Source consumed (read-only)**: `Banks0123.asm` `SetSprBox` and the `NormalCtrl` box check;
  `constants/Enums.asm` `SELECTED_BOX=0x19`.
- **Depends on**: `player-control-modes` (animation/sprite selection) and `player-item-system`
  (`SelectedItem`).
