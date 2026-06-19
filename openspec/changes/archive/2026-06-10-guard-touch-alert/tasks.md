# Tasks — guard-touch-alert

## 1. Touch path (ChkTouchEnemies / TouchPlayer)

- [x] 1.1 Add `GUARD_TOUCH_SHAPE = { offY: 0, distY: 8, offX: 0, distX: 12 }`
      (ActorsShapeTouch[ID_GUARD−1]=8 → ImpactAreasInfo row 8, data/shapes.asm; ChkArea
      strict `<`) and `touched: false` to `buildGuardRaw`, with ROM citations.
- [x] 1.2 Replace `checkGuardContact()` with `chkTouchGuard()`: clear `guard.touched` each
      frame; return early when stunned (ChkTouchEnemy skips stunned — no flag, no damage);
      test the ROM box (Y then X, strict `<`); on touch set the flag and call
      `damage(TOUCH_DAMAGE)` (TouchPlayer — i-frames/SFX already inside `damage()`). Remove
      the alert-state gate. Call it in `update()` *before* `chkAlarmEnd`/`updateGuard`.

## 2. Discovery (ChkSeePlayer / ChkSeePlayer2 / ListenShotsChkTouch)

- [x] 2.1 In `guardSeesSnake()`, port the ChkSeePlayer gates in ROM order: deep water
      (`snake.anim === ANIM_DEEP_WATER` → never seen), box
      (`snake.anim === ANIM_BOX && snake.state !== 'walk'` → not seen; moving box is seen),
      then `guard.touched → seen` (ChkSeePlayer2), then the existing band/front/wall LOS.
- [x] 2.2 In the sleepy branch of `updateGuard`, replace the 12×12 proximity guess with
      `guard.touched` (ListenShotsChkTouch reads TOUCH_INFO bit 7); keep wake + raiseAlarm.
      Note in a comment that the exploding-shot scan (ChkDiscoverPlayer2-5, status 1) is dead
      code until explosive weapons exist, and that gunshot noise is chkAlertTrigger.

## 3. Headless checks

- [x] 3.1 Add `web/touch.headless.mjs` covering: ROM box boundaries (8/12 miss, 7/11 hit,
      strict `<`); touching a patrol guard damages Snake (24→22, i-frames open) AND raises
      the alarm; repeat touch inside the i-frame window deals no extra damage but the alarm
      stays; stunned guard → no flag/damage/alarm; sleeping guard touch wakes + alarms +
      damages; deep-water Snake unseen in clear LOS; stationary boxed Snake unseen, moving
      boxed Snake seen; alerted-guard contact still damages.
- [x] 3.2 Run all headless suites (hud, menu, alarm, shots, touch) + `node --check
      web/game.js`; all green (alarm suite's sleepy-touch checks may need the new box).

## 4. Coverage + docs

- [x] 4.1 Coverage map: add logic/touchenemy.asm routines used (ChkTouchEnemies/2/3,
      ChkTouchEnemy/2, TouchPlayer/2 already partial → done where now faithful), ChkArea
      (logic/punchenemy.asm) done, ListenShotsChkTouch + ChkDiscoverPlayer6 done,
      ChkDiscoverPlayer2-5 stay todo (exploding-shot scan); ChkSeePlayer gates → ChkSeePlayer
      stays done with notes. Regenerate docs/rom-coverage.md.
- [x] 4.2 SESSION-STATE.md: remove the touch/noise gap; note the box now hides Snake when
      stationary and deep water hides him (ChkSeePlayer gates ported).

## 5. Manual verification

- [x] 5.1 Interactive pass: bump a patrolling guard (damage + alarm), punch-stun him and walk
      through (nothing), `?sleep` guard touch (wake + alarm + damage), `?room=105` deep water
      (guard blind), box selected: stand still in LOS (unseen) then move (spotted).
