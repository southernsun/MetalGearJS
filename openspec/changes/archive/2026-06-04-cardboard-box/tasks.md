> Depends on player-control-modes (animation selection) + player-item-system (SelectedItem). Port
> the ROM box behaviour (Banks0123.asm SetSprBox / NormalCtrl box check); cite it. SELECTED_BOX=0x19.

## 1. Assets

- [x] 1.1 Export the cardboard-box frames (`SetSprBox`, sprites 42 idle / 44 moving) into `snake.png`/`snake.json`

## 2. Box behaviour

- [x] 2.1 In the normal-control branch, if `selectedItem == box` set `playerAnimation=7`; otherwise leave normal walk (matching `NormalCtrl`)
- [x] 2.2 Draw the box: sprite 42 when stopped, alternate 42/44 every ~8 ticks while moving (`SetSprBox`)
- [x] 2.3 Precedence: water/punch/death animations override the box (check the box only in the normal branch)

## 3. Verification

- [x] 3.1 Headless/manual: select box → box appears and moves like walking; deselect → restored; enter water/punch → box dropped
- [x] 3.2 Regression: movement/guard unaffected; confirm ROM citations
- [x] 3.3 Update `Tools/coverage/coverage-map.json` (box routine done) and regenerate `docs/rom-coverage.md`
