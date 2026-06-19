# Player shots hit enemies

## Why

The handgun fires faithful ROM bullets, but they pass straight through the guard — the port
has no `ChkPlayerShots`/`ChkHitEnemies` (logic/damagetoenemy.asm), so the player's primary
weapon can't actually hurt anyone. This is the most visible gameplay gap left in the slice
(noted in docs/rom-coverage.md: "player-shot-vs-enemy hits are not yet done").

## What Changes

- Player handgun shots collide with the room's guard using the ROM's shot-vs-enemy hit test
  (`ChkEneHitByShot`, logic/damagetoenemy.asm): shape-0 impact box from `ImpactAreasInfo`
  (data/shapes.asm) — |guardY−16−shotY| < 16 AND |guardX−shotX| < 8, strict comparisons.
- The guard gains ROM life points (`idxActorLife`, data/actorspriteattr.asm: LIFE = 2 for
  ID_GUARD_SLOW/MEDIUM/ALERT) and the handgun deals its ROM damage (`BulletDamage`,
  data/weapondamage.asm: 2) — so one handgun bullet kills a guard, as on the MSX.
- The hit removes the bullet (`RemoveShot` for weapons below GRENADE_LAUNCHER).
- Death follows the ROM flow: LIFE hits 0, and the actor is killed on its next logic tick
  (`RunEnemyLogic` → `KillActor`) — which is *skipped while stunned* (EnemiesLogic), so a
  shot guard who is mid-stun dies only when the stun expires.
- Punch kills and shot kills share one death path; the unfaithful clearing of in-flight guard
  bullets on a punch kill is removed (ROM bullets are independent actors that keep flying).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `browser-player-weapons`: player shots now test the guard's ROM impact box each tick and are
  consumed on a hit, dealing the ROM bullet damage.
- `browser-guard`: the guard has ROM life points, takes bullet damage, and dies via the ROM
  kill flow (deferred while stunned); punch kills no longer clear in-flight guard bullets.

## Impact

- `web/game.js`: guard state (life), `updatePlayerShots` (hit test + damage), `updateGuard`
  (LIFE-0 kill check), `tryPunchGuard` (shared `killGuard()`, bullet-clearing removed).
- `web/alarm.headless.mjs` (or a small new headless check): cover shot-kill, stun-deferred
  death, and alarm end when the alert room's guard is shot.
- `Tools/coverage/coverage-map.json` + `docs/rom-coverage.md`: ChkPlayerShots/ChkHitEnemies/
  ChkEneHitByShot/DecEnemyLife/KillActor family moves to done/partial.
- No new assets (the enemy-dead SFX 0x16 isn't exported; death stays silent — flagged).
