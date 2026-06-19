## Context

ROM: in `NormalCtrl`, if `SelectedItem == SELECTED_BOX` (0x19) it sets `PlayerAnimation=7`,
otherwise 0 — no separate control mode; movement is identical to walking. `SetSprBox` shows sprite
42 idle and alternates 42/44 every 8 ticks while moving. If Snake is in water/punch/dead, those
animations win over the box.

## Goals / Non-Goals

**Goals:** faithful box appearance + normal-control movement, with correct precedence.
**Non-Goals:** guard reactions, truck transport, other items.

## Decisions

- **Box is an animation/flag, not a control mode** (faithful): when `selectedItem == box` and Snake
  is in normal control (not water/punch/dead), set `playerAnimation=7` and draw the box frames.
- **Precedence**: water/punch/death set their own animation and take priority — check the box only
  in the normal branch, matching `NormalCtrl`.
- **Sprites via the existing export path** (box frames 42/44 added like the death frames).

## Risks / Trade-offs

- **[Cosmetic without guard interaction]** → acceptable and faithful; note that box-vs-detection
  stealth is a separate future gameplay change (guards currently still see Snake).
