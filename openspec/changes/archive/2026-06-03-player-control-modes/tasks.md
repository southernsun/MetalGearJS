> Foundation refactor. Port `PlayerControlLogic` (Banks0123.asm) dispatch; cite it in comments.
> Must be behaviourally a no-op (walk/punch unchanged). Unblocks the movement-mode changes.

## 1. Control-mode state + dispatch

- [x] 1.1 Add `playerControlMod` (0=walk, 1=punch; table reserves 6/7/… ) and `playerAnimation` to the player state
- [x] 1.2 Add a `switch`/dispatch in `update()` mirroring `PlayerControlLogic`; move the existing walk/door/room-traversal handling into the mode-0 branch and punch into the mode-1 branch, unchanged
- [x] 1.3 Select the drawn sprite from `playerAnimation` (keep walk/punch/die mapping; reserve ladder/water/box keys)

## 2. Verification

- [x] 2.1 Regression (headless + manual): walk, collision, doors, room traversal, punch, and the guard chase/shoot/damage all behave exactly as before
- [x] 2.2 Headless smoke: real `game.js` runs many ticks across walk/punch with no console errors
- [x] 2.3 Confirm the dispatch cites `PlayerControlLogic`/`CONTROL_*` and is ready for later modes to plug in
