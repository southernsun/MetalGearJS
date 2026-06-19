# Guard touch alerting + ChkSeePlayer visibility gates

## Why

Walking into a patrolling guard currently does nothing — no damage, no alarm — because the
ROM's touch path (`ChkTouchEnemies`/`TouchPlayer`, logic/touchenemy.asm) and its discovery
consequence (`ChkSeePlayer2` touch flag → `GuardSetAlarm`, logic/actors/chkdiscover.asm) were
never ported; contact damage was wired only for the *alerted* guard, with a guessed hitbox.
The same `ChkSeePlayer` routine also carries two visibility gates we're missing: Snake is
invisible in deep water, and invisible under a **stationary** cardboard box (a moving box is
spotted) — so the box currently has no gameplay function at all.

## What Changes

- Port the guard's touch detection with the ROM hitbox: `ActorsShapeTouch[ID_GUARD−1] = 8` →
  `ImpactAreasInfo` row 8 (data/shapes.asm): hit iff `|guardY − snakeY| < 8` AND
  `|guardX − snakeX| < 12` (`ChkArea`, strict comparisons).
- Touching ANY non-stunned guard — patrol, alert, or sleeping — damages Snake by
  `ActorTouchDamage` (2) behind the existing 0x20-frame damage delay (`TouchPlayer`); a
  stunned guard sets no touch flag and deals no damage (`ChkTouchEnemy`).
- The touch flag discovers Snake: an awake guard raises the global alarm on touch
  (`ChkSeePlayer2`); the sleeping guard's wake-on-touch now uses the same ROM box instead of
  the previous 12×12 guess (`ListenShotsChkTouch` reads the same flag).
- Port `ChkSeePlayer`'s visibility gates into LOS: Snake in **deep water** is never seen;
  Snake under the **box** is seen only while the box is moving — a stationary box hides him
  (the box finally does its job).
- Firing-noise alerting needs no change: `ChkAlertTrigger` (already ported) is the ROM's
  gunshot-noise path and has no distance check. `ListenShotsChkTouch`'s shot-scan only
  triggers on an *exploding* shot (status 1 — rocket/mine/missile), which no ported weapon
  produces yet; documented, out of scope.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `browser-guard`: LOS requirement gains the ROM visibility gates (deep water, stationary
  box) and a new touch-alert requirement (touch flag → alarm, ROM touch box, stunned guards
  immune).
- `browser-snake-damage`: contact damage applies to any non-stunned guard (patrol/alert/
  sleeping), not only the alerted one, using the ROM touch box.

## Impact

- `web/game.js`: `checkGuardContact` → ROM-faithful `chkTouchGuard` (flag + damage, runs
  before guard logic), `guardSeesSnake` gains the ChkSeePlayer gates + touched check, sleepy
  wake uses the touch flag, guard state gains `touched`.
- New `web/touch.headless.mjs` checks; existing suites must stay green.
- `Tools/coverage/coverage-map.json` + regenerated `docs/rom-coverage.md`
  (ChkTouchEnemies/ChkTouchEnemy/TouchPlayer/ChkArea/ListenShotsChkTouch/ChkDiscoverPlayer*
  statuses), SESSION-STATE.md gap list.
