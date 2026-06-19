## Why

Snake currently moves via inline walk logic with a `state` of `idle|walk|punch`. The ROM instead
runs a control-mode state machine — `PlayerControlLogic` dispatches on `PlayerControlMod`, and the
sprite follows `PlayerAnimation`. Every other movement mode (ladders, water, box) is a branch of
that machine. Porting the dispatch first — with today's walk as mode 0 — is the foundation the
later movement-mode changes build on, with no behaviour change of its own.

## What Changes

- Add `playerControlMod` and `playerAnimation` to the player state.
- Add a dispatch in `update()` mirroring `PlayerControlLogic` (`Banks0123.asm`): mode 0 = walk,
  mode 1 = punch (the existing behaviour), with the table laid out for the modes that follow
  (6 = ladder-walk, 7 = ladder-climb, etc., added by later changes).
- Drive the drawn sprite from `playerAnimation` (walk/punch/die mapping unchanged; ladder/water
  /box keys reserved for later changes).
- **No behaviour change**: walking, collision, doors, punch, and room traversal are identical —
  they simply run as mode 0/1 of the state machine.

**Out of scope:** the actual ladder/water/box/weapon modes (their own changes); parachute, air
flow, elevator, dead beyond what exists.

## Capabilities

### New Capabilities

- `browser-player-control-modes`: the player control-mode state machine in the browser
  (`PlayerControlMod` dispatch + `PlayerAnimation` sprite selection), with plain walk as mode 0.

## Impact

- **Browser game** (`web/game.js`): refactor `update()` to dispatch on `playerControlMod`; move
  walk/door/punch handling into the mode-0/mode-1 branches unchanged; select the sprite from
  `playerAnimation`.
- **Source consumed (read-only)**: `Banks0123.asm` `PlayerControlLogic` + its dispatch table;
  `constants/Enums.asm` `CONTROL_*` / `PlayerAnimation` values.
- **Dependencies**: none. This is a pure, regression-protected refactor that unblocks
  `snake-ladders`, `snake-water`, `cardboard-box`, and (with the item system) `player-handgun`.
