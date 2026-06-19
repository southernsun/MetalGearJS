# Design — guard-touch-alert

## Context

ROM facts (verified in the disassembly this session):

- **Touch scan** (`ChkTouchEnemies` → `ChkTouchEnemy`, logic/touchenemy.asm): each frame, per
  enemy: clear TOUCH_INFO bits 7/6 (line 55-57), require COLLISION_CFG bit 0 (guards spawn
  with 3), look up the touch shape `ActorsShapeTouch[ID−1]` (guards: 8) and run `ChkArea`
  against the player. A hit is skipped entirely when the enemy is stunned (lines 103-105).
  On a hit: set TOUCH_INFO bit 7 and fall into `TouchPlayer`.
- **Touch box**: `GetShapeInfo` is called with shape+1 (the `inc a` from the 0xFF filter
  survives — same quirk as the projectile path), so the row is `ImpactAreasInfo[shape*4]` =
  row 8: `0, 8, 0, 0Ch` → offY 0, distY 8, offX 0, distX 12. `ChkArea`
  (logic/punchenemy.asm:101): hit iff `|actorY + offY − playerY| < distY` then
  `|actorX + offX − playerX| < distX`, strict `<` (`cp`/`ret nc`).
- **TouchPlayer** (touchenemy.asm:137): guards (ID 4 < ID_PRISONER1 range checks) damage by
  `ActorTouchDamage[ID−1]` = 2, gated on `DamageDelayTimer` (0x20 set on hit), with damage
  SFX 0x10. The armor halving applies only to bullet-class IDs — not the guard's body.
- **Discovery on touch** (`ChkSeePlayer2`, chkdiscover.asm:49-52): TOUCH_INFO bit 7 →
  `GuardSetAlarm`, before the directional LOS dispatch. Applies to awake guards
  (`GuardLogic` calls `ChkActSeePlayer` for every non-sleeping status).
- **ChkSeePlayer gates** (chkdiscover.asm:12-47), in order: AlertMode already on → return
  (guards already know); SnakeSprId 37/38 (deep-water shadow frames) → never seen;
  PlayerAnimation 7 (box) → seen only if the player speed is non-zero (the "is the cardboard
  box moving" check — the moving gate is box-only, NOT general).
- **Sleeping guards** (`ListenShotsChkTouch`, chkdiscover.asm:502): touched flag → discovered
  (wake + GuardSetAlarm). The noise branch scans `PlayerShotsList` for a shot with
  status == 1 (*exploding* — only rocket/land-mine/missile ever set it, damagetoenemy.asm
  ChkEnemyHitByShot4); plain bullets never match, so with only the handgun ported the branch
  is dead code. Gunshot *noise* is `ChkAlertTrigger` (already ported), which raises the
  global alarm that already wakes our sleeping guard.

Current port gaps: `checkGuardContact` damages only when `guard.state === 'alert'` with a
guessed 10×14 box; nothing alerts on touch; the sleepy wake uses a guessed 12×12 box; LOS has
no deep-water or box gates.

## Goals / Non-Goals

**Goals:**
- One ROM-faithful touch path: flag + damage for any non-stunned guard, alarm for awake
  guards, wake for sleeping guards — all on the ROM hitbox.
- `ChkSeePlayer` visibility gates: deep water hides Snake; a stationary box hides him; a
  moving box does not.
- Headless coverage for boxes, gates, and state interactions.

**Non-Goals:**
- The exploding-shot wake (`ChkDiscoverPlayer2-5`) — no ported weapon explodes; documented.
- The suppressor's effect on firing noise (`InvSupressor`) — belongs to the weapons slice.
- Armor damage-halving (bullet-class only; tracked in browser-snake-damage as out of scope).
- Box/water sneaking interactions beyond visibility (e.g. guards bumping a box actor).

## Decisions

1. **`chkTouchGuard()` replaces `checkGuardContact()`** and runs *before* `updateGuard` in
   `update()` (the ROM scans touches in the player phase, before `EnemiesLogic` reads the
   flag). It clears `guard.touched` each frame (ChkTouchEnemy does), returns early when
   stunned, tests the ROM box (strict `<`, Y then X), then sets `guard.touched = true` and
   calls the existing `damage(TOUCH_DAMAGE)` — whose i-frame window already models
   `DamageDelayTimer` and plays the hit SFX stand-in.
2. **Discovery reads the flag**: `guardSeesSnake()` becomes the full `ChkSeePlayer` port —
   deep-water gate (`snake.anim === ANIM_DEEP_WATER`), box gate (`snake.anim === ANIM_BOX`
   and not walking → unseen; our `snake.state === 'walk'` stands in for PlayerSpeed ≠ 0),
   then `guard.touched → true` (ChkSeePlayer2), then the existing directional band + wall
   LOS. The sleeping branch in `updateGuard` swaps its 12×12 guess for `guard.touched`.
3. **No change to alarm plumbing**: touch discovery feeds the existing
   `raiseAlarm(currentRoom)`, identical to LOS discovery (both are `GuardSetAlarm` in the
   ROM). Noise stays `chkAlertTrigger` as-is.

## Risks / Trade-offs

- [Touch damage while the box gate hides Snake] → faithful: ChkSeePlayer's gates don't stop
  `ChkTouchEnemies`; in the ROM a guard walking into a boxed Snake damages him and the touch
  flag then discovers him (the flag check sits after the box gate, but a *stationary* box
  returns before ChkSeePlayer2 — so a boxed, stationary Snake takes damage without raising
  the alarm; reproduce exactly that order).
- [`snake.state === 'walk'` vs ROM PlayerSpeed] → our state is set whenever a direction is
  held (even against a wall); the ROM speed vars behave the same while input is held —
  equivalent within this engine.
- [Old behaviour change: patrol contact now hurts] → intended; it is the ROM rule, and the
  alert-only gate was an undocumented divergence.
