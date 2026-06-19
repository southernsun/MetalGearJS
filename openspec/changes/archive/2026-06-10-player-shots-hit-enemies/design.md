# Design — player shots hit enemies

## Context

The handgun slice (player-handgun) ported `ChkHandGunShot` + `BulletLogic`: shots spawn, fly,
and stop at walls — but `logic/damagetoenemy.asm` (`ChkPlayerShots` → `ChkHitEnemies` →
`ChkEneHitByShot`) was out of scope, so shots ignore the guard. The guard side has punch-kill
(`ChkKillPunching`, 3 punches via PunchesCnt) but no LIFE points — the ROM tracks the two
independently: punches count up on `ACTOR.PunchesCnt`, bullets count down `ACTOR.LIFE`.

ROM facts (verified in this repo's disassembly):

- **Hit gate** (`ChkEneHitByShot`): the enemy must have COLLISION_CFG bit 1 set (guards are
  initialised to 3 in `SetupActor`, Banks0123.asm:6381) and a projectile shape id ≠ 0xFF in
  `ActorShapeProject` (data/shapes.asm:6, indexed `[actorID-1]`).
- **Impact box**: guards (ID_GUARD_SLOW=4 → shape 0) use `ImpactAreasInfo` row 0
  (data/shapes.asm:47): offY=0xF0 (−16), distY=0x10, offX=0, distX=8. The test is
  `|enemyY − 16 − shotY| < 16` then `|enemyX − shotX| < 8`, both strict `<`
  (`cp (hl)` / `ret nc`). Note `GetShapeInfo` is called with shape+1 (the `inc a` from the
  0xFF filter survives), and `DEC_A_HL_4xA` subtracts it back — row = shape*4.
- **Damage**: `GetWeaponDamages` points at `BulletDamage` for the handgun
  (data/weapondamage.asm:18, indexed `[actorID-1]`): guard IDs 4/5 (patrol) and 10 (alert)
  all take **2**. 0xFF in the table means "no damage" (`inc a; jr z, NoDamage`).
- **Guard life**: `idxActorLife` (data/actorspriteattr.asm:127, indexed `[actorID-1]`):
  IDs 4/5/10 have **LIFE = 2**; ID 11 (red-alert respawn) has 4. `TransformAlertGuard`
  (Banks0123.asm:6726) changes the actor ID on alert but does **not** reset LIFE — so the
  room's guard keeps its spawn LIFE of 2. **One handgun bullet (2 dmg) kills a guard.**
- **Hit consequences** (`ChkEnemyHitByShot5` → `NoDamage`): the shot id is OR'd into
  TOUCH_INFO bits 0-4; `DecEnemyLife` clamps LIFE at 0; weapons below GRENADE_LAUNCHER
  (handgun, SMG) call `RemoveShot` — the bullet is consumed by the hit.
- **Death is deferred to the actor's logic tick**: `RunEnemyLogic` (Banks0123.asm:12660)
  checks `LIFE == 0` → `KillActor` (SFX 0x16 "enemy dead", mark killed, guard kill logic =
  `KillEnemy` → `DismissActor`). `EnemiesLogic` (12626) skips `RunEnemyLogic` entirely while
  `StunnedCnt > 0` — so a guard shot mid-stun dies only when the stun expires.
- **Bullets outlive their shooter**: guard bullets are independent actors (`BulletLogic`,
  ID_GUARD_BULLET); nothing in `KillActor` removes them.

## Goals / Non-Goals

**Goals:**
- Handgun shots damage and kill the room's guard with the ROM hit box, damage and life values.
- ROM-faithful death flow: LIFE 0 → killed on the guard's next non-stunned logic tick.
- One shared death path for punch kills and shot kills; stop clearing in-flight guard bullets
  on a kill (unfaithful — ROM bullets keep flying).
- Headless checks for the new behaviour.

**Non-Goals:**
- Other weapons damaging enemies (SMG/grenade/rocket/mines/missile aren't ported).
- Item drops on kill (`ChkDropItem` — needs the pickup system; next slice).
- Reinforcements/`NumRespawnGuards` bookkeeping in `KillActor` (multi-actor system, deferred).
- The enemy-dead SFX 0x16 (not exported; death stays silent — flagged divergence, consistent
  with the silent handgun-fire SFX).
- TOUCH_INFO shot-id plumbing (its only consumers — ListenShots wake/alert paths — are a
  future slice; with LIFE 2 vs damage 2 a hit always kills in this slice anyway).

## Decisions

1. **Hit test lives in `updatePlayerShots`** (after the shot moves, before/alongside the wall
   check), mirroring the ROM running `BulletLogic` and `ChkPlayerShots` in the same frame.
   Constants: `GUARD_SHAPE = { offY: -16, distY: 16, offX: 0, distX: 8 }` (ImpactAreasInfo
   row 0), `GUARD_BULLET_DAMAGE = 2` (BulletDamage), strict `<` comparisons.
2. **Guard gains `life: GUARD_LIFE (= 2)`** in `buildGuardRaw` (idxActorLife, ID_GUARD_SLOW).
   A hit sets `life = max(0, life - damage)` (`DecEnemyLife`) and consumes the shot
   (`RemoveShot`). No 0xFF check needed — only the guard exists.
3. **Kill check at the top of the guard's logic tick**: `updateGuard` already returns early
   while `stunnedCnt > 0` (the ROM's stun gate); the `life === 0 → killGuard()` check goes
   immediately *after* that branch, reproducing `RunEnemyLogic`'s order — including the
   stun-deferred death for free.
4. **`killGuard()` helper** replaces the inline kill in `tryPunchGuard`: sets `guard = null`
   only — it does NOT clear `bullets` (ROM bullets are independent actors). The alarm still
   ends via the existing `chkAlarmEnd` (alert room cleared) — no change there.

## Risks / Trade-offs

- [One-shot kills make the alarm rarely escalate] → faithful: that's the MSX game; the shot
  *noise* already raises the alarm before the bullet lands (ChkAlertTrigger is checked on
  fire, same frame the shot spawns).
- [Punch-kill behaviour changes subtly: in-flight bullets now survive the kill] → intended
  faithfulness fix; covered by a headless check.
- [Shot-vs-wall and shot-vs-guard in the same tick] → ROM order is move/walls (BulletLogic)
  then hits (ChkPlayerShots) within one frame; we test the guard after the wall check, so a
  bullet entering a wall tile can't also hit a guard behind it — matching the ROM outcome.
