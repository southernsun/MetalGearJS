## Context

`web/game.js` handles movement inline. The ROM uses `PlayerControlLogic` — a `JumpIndex` dispatch
on `PlayerControlMod` (0 walk, 1 punch, 2 elevator, 3 dead, 4 parachute, 5 air-flow, 6 ladder-walk,
7 ladder-climb, 8 intro) — and chooses the sprite from `PlayerAnimation` (0 walk, 2 water,
4 deep-water, 5 ladder, 6 dead, 7 box). This change ports only the dispatch skeleton + walk(=0)/
punch(=1); later changes add branches.

## Goals / Non-Goals

**Goals:** a faithful dispatch host; today's walk/collision/doors/punch run as mode 0/1 with zero
behaviour change; sprite chosen from `playerAnimation`.

**Non-Goals:** any new mode behaviour; modes 2/3/4/5/8.

## Decisions

- **Dispatch via a `switch` on `playerControlMod`** mirroring the ROM table; mode 0 and 1 wrap the
  existing walk and punch code verbatim. *Alternative:* leave walk inline and add modes ad hoc —
  rejected; it diverges from the ROM and won't compose with the later modes.
- **`playerAnimation` drives the sprite key.** Keep the current `frameKey()` for walk/punch/die;
  map animation values to keys, with ladder/water/box keys reserved (added when those frames are
  exported).

## Risks / Trade-offs

- **[Walk/punch regression from the refactor]** → keep the moved code byte-for-byte; re-run the
  movement/doors/punch/guard checks and a headless smoke. The whole value of this change is being
  a no-op behaviourally.
