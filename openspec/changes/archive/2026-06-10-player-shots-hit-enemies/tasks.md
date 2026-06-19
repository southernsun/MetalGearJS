# Tasks — player-shots-hit-enemies

## 1. Guard life + shared death path

- [x] 1.1 Add `GUARD_LIFE = 2` (idxActorLife, data/actorspriteattr.asm:127, ID_GUARD_SLOW) and
      seed `life: GUARD_LIFE` in `buildGuardRaw` (web/game.js), with ROM citations.
- [x] 1.2 Extract a `killGuard()` helper (sets `guard = null` only) and use it in
      `tryPunchGuard` for the third-punch kill — removing the unfaithful `bullets.length = 0`
      (ROM guard bullets are independent actors; cite KillActor/BulletLogic).
- [x] 1.3 In `updateGuard`, immediately after the `stunnedCnt > 0` early-return branch, check
      `guard.life === 0 → killGuard()` (RunEnemyLogic LIFE check, Banks0123.asm:12660;
      EnemiesLogic skips it while stunned — cite the deferral).

## 2. Shot-vs-guard hit test

- [x] 2.1 Add the shape-0 impact box constants (`ImpactAreasInfo` row 0, data/shapes.asm:47:
      offY −16, distY 16, offX 0, distX 8) and `GUARD_BULLET_DAMAGE = 2` (BulletDamage,
      data/weapondamage.asm:18) to web/game.js.
- [x] 2.2 In `updatePlayerShots`, after the wall check, test the live shot against the guard's
      impact box (strict `<` on both axes, Y then X as ChkEnemyHitByShot2/3); on a hit apply
      `life = max(0, life - 2)` (DecEnemyLife) and remove the shot (RemoveShot for weapons
      below GRENADE_LAUNCHER). Skip when there is no guard.

## 3. Headless checks

- [x] 3.1 Add `web/shots.headless.mjs` (mirroring the existing harness style) covering: hit
      inside the box kills (one bullet, life 2−2=0 → guard removed on next tick), near miss
      (≥8px lateral) doesn't, hit during stun defers death until the stun expires, the shot is
      consumed on hit, in-flight guard bullets survive a punch kill and a shot kill, and the
      alarm ends when the alert-room guard is shot.
- [x] 3.2 Run all headless checks (`hud`, `menu`, `alarm`, new `shots`) and `node --check
      web/game.js`; all green.

## 4. Coverage + docs

- [x] 4.1 Update `Tools/coverage/coverage-map.json`: ChkPlayerShots, ChkPlayerShots2/3,
      ChkHitEnemies, ChkHitEnemies2, ChkEneHitByShot, ChkEnemyHitByShot2/3/5, DecEnemyLife,
      SetEnemyLife, NoDamage → done (handgun path; explosives/plastic-bomb branches stay todo);
      KillActor/KillActor2/KillActor3/KillEnemy → partial (no SFX 0x16, no respawn counter,
      no drop). Regenerate `docs/rom-coverage.md` via `node Tools/coverage/coverage.mjs`.
- [x] 4.2 Refresh docs/SESSION-STATE.md: move "player shots don't hit enemies" out of the gaps
      list; note the flagged divergences (silent enemy-dead SFX 0x16, no item drops yet).

## 5. Manual verification

- [x] 5.1 Interactive pass: shoot the room-0 guard (one bullet kills), miss past his shoulder
      (bullet flies on), punch him then shoot during the stun (he dies as the stun ends), and
      confirm an alert guard's airborne bullets still land after he dies.
