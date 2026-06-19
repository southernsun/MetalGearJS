> Source map: chase = `logic/actors/guardalert.asm` (`GuardWalk`, `DirectionSpeeds2` ±2);
> bullets = `guardshot.asm` (`InitGuardShot`, `ID_GUARD_BULLET` 0x2F, sprite 0x72, speed 0x90);
> damage = `data/shapes.asm` (`ActorTouchDamage` = 2) + `logic/touchenemy.asm`
> (`DamageDelayTimer` 0x20); life/death = `logic/hud.asm` (`DecrementLife_B`, `SetDead`) +
> `Banks0123.asm` (`InitPlayerVars` 0x18, `DeadLogic` `DeadTimer` 0x80). Comment each ported
> constant with its source.

## 1. Tunables and collision-helper refactor

- [x] 1.1 Add a "Combat tunables" block: `GUARD_CHASE_SPEED = 2` (DirectionSpeeds2), `GUARD_FIRE_TICKS ≈ 16` (avg ROM chase cadence), `GUARD_MAX_BULLETS = 6` (ROM pool), `GUARD_BULLET_SPEED` (from 0x90), `TOUCH_DAMAGE = 2` / `BULLET_DAMAGE = 2` (ActorTouchDamage), `INVULN_TICKS = 0x20` (DamageDelayTimer), `SNAKE_MAX_LIFE = 0x18` (InitPlayerVars), `DEAD_TICKS = 0x80` (DeadTimer) — each with its source citation
- [x] 1.2 Generalize `blocked(x,y,dir,...)` to accept a probe set/box (default = Snake's existing PROBES) so the guard can be collision-tested; keep Snake's call behaviour byte-for-byte identical
- [x] 1.3 Add the guard's collision box/probes (reuse the guard sprite footprint) and a small `guardBlocked(x,y,dir)` wrapper

## 2. Guard chase (alert = pursuit)

- [x] 2.1 Replace the alert branch in `updateGuard()` (face-and-hold) with pursuit: pick the dominant-axis direction toward Snake (`GetDirToPlayer`: compare |dx| vs |dy|), set facing, and step `GUARD_CHASE_SPEED` px if `guardBlocked` is clear
- [x] 2.2 Advance the guard walk animation while chasing (same `GUARD_WALK_TICKS` toggle as patrol)
- [x] 2.3 Keep the stun gate ahead of chase: a stunned guard (`stunnedCnt > 0`) neither chases nor fires; resumes pursuit at 0
- [x] 2.4 Verify (node/headless): an alerted guard's position moves toward Snake each tick at 2 px and stops at a wall between them

## 3. Guard bullets

- [x] 3.1 Add a `bullets = []` array and a per-guard `fireCooldown`; while alerted + not stunned, decrement the cooldown and on expiry spawn a bullet at the guard moving along its facing axis at `GUARD_BULLET_SPEED` (InitGuardShot), respecting `GUARD_MAX_BULLETS`; play the shot SFX (or fallback)
- [x] 3.2 `updateBullets()`: advance each bullet; despawn on a solid collision-map tile or when out of room bounds
- [x] 3.3 `drawBullets()`: draw `guard-bullet.png` if loaded (load optionally with `.catch(() => null)`), else a small fallback rect
- [x] 3.4 Clear `bullets` on room change, on guard KO/kill, and on death (SetDead clears active bullets)
- [x] 3.5 Verify (node/headless): a bullet travels straight, is removed at a wall tile, and is removed when it leaves the room; concurrent bullets are capped

## 4. Snake life + damage

- [x] 4.1 Add `snake.life`/`snake.maxLife` (= `SNAKE_MAX_LIFE`) and `snake.invulnTimer`; initialize full at start
- [x] 4.2 Add a single `damage(n)` helper: ignore while `invulnTimer > 0`; else subtract `n` (clamp ≥ 0, `DecrementLife_B`), set `invulnTimer = INVULN_TICKS`, and trigger death at 0
- [x] 4.3 Decrement `invulnTimer` each tick in `update()`
- [x] 4.4 Bullet-vs-Snake overlap: when a bullet overlaps Snake and he's vulnerable, `damage(BULLET_DAMAGE)` and remove the bullet
- [x] 4.5 Guard contact: when Snake's box overlaps the (alerted) guard's box and he's vulnerable, `damage(TOUCH_DAMAGE)`
- [x] 4.6 Verify (node/headless): two hits drop life by 4; a hit during i-frames is ignored; life never goes negative

## 5. Game over + restart

- [x] 5.1 Add a `gameState` (`'play' | 'dead'`); on life 0 (SetDead): set `'dead'`, clear bullets, stop the alert music, play the decoded death SFX (`dead.wav`; Web Audio tone only as fallback), start `deadTimer = DEAD_TICKS`
- [x] 5.2 In `update()`, lock player movement/punch while `'dead'` and count `deadTimer` down (DeadLogic)
- [x] 5.3 `restart()` at `deadTimer` 0: reset Snake to `SPAWN_X/Y` + full life + cleared invuln, `setRoom(manifest.start)` (rebuilds the guard/patrol, clears alert), back to `'play'`
- [x] 5.4 Verify (node/headless): life→0 enters dead, input is inert, and after `DEAD_TICKS` Snake is back in the start room at full life with the guard patrolling

## 6. Assets — decode from the ROM (do first; fallbacks are only a safety net)

- [x] 6.1 Add a SpriteMover export mode for the guard bullet (`ID_GUARD_BULLET`, sprite 0x72) in its actor colours → `web/assets/guard-bullet.png` via the existing guard compositor; verify it decodes to a valid PNG — `--export-guard-bullet` (WebExporter.ExportGuardBullet) decodes `SprBullet` sprite 0 cropped to lit pixels → 2×2 tracer PNG (colour is a deliberate divergence; the OR-overlap index 0x0F has no faithful RGB)
- [x] 6.2 Add a ThemeOfTaraPlayer export for the death SFX (music `0x44`, "Just another dead soldier") → `web/assets/dead.wav`; verify it's a valid WAV — `--export-dead` (PunchExporter.ExportDeathMusic) renders "Just Another Dead Soldier" (0x8528) → 4.00s 16-bit mono WAV
- [x] 6.3 Wire both into the asset manifest/loader (loaded optionally, `.catch(() => null)`); the fallback rect/tone stays only for graceful degradation

## 7. Verification and polish

- [x] 7.1 Regression: Snake movement, room traversal, doors, punch, and patrol/LOS/alert-entry/punch-KO all behave exactly as before the change — the movement/door/punch block is preserved verbatim (only the early-`return`s were rewrapped as `if/else if/else`); `blocked()` stays backward-compatible via a default probe param; headless smoke ran 240 integrated ticks with no exceptions
- [x] 7.2 Headless smoke test: start room loads, guard patrols, no console errors; forcing alert produces chase + bullets without errors — loaded the real `game.js` in a mocked-DOM `vm` sandbox with `?alert`, drove 240 `update()`/`draw()` ticks; 0 errors, 0 asset-load failures
- [x] 7.3 Manually verify in a browser: walk into sight → guard chases and shoots; bullets hit → life drops, brief invulnerability; let life reach 0 → death beat + restart to start room; punch still stuns/kills and ends the chase; bullets stop at walls — confirmed by the user across iterative playtests
- [x] 7.4 Tune chase speed, `GUARD_FIRE_TICKS`, and bullet speed for fair feel (24 life ÷ 2 = 12 hits of slack); confirm it's threatening but survivable without a HUD — first playtest pass done (see §8); final feel still subject to re-test (7.3)
- [x] 7.5 Confirm all ported constants carry their ROM source citation in comments; note any deliberate divergences (deterministic fire cadence, restart-to-start-room vs checkpoint) — the combat-tunables block cites each source; divergences noted in comments: deterministic `GUARD_FIRE_TICKS` vs the ROM's RNG, `GUARD_BULLET_SPEED` approximating the 0x90 fixed-point param, the bullet's tracer colour (OR-overlap 0x0F has no faithful RGB), restart-to-start-room vs the ROM checkpoint restore, and the i-frame blink (ROM has none). (Chase speed is now faithful — see §11 — not a divergence.)

## 8. Playtest fixes (first browser pass)

- [x] 8.1 Stand-off pursuit: the guard closes only to `GUARD_SHOOT_RANGE` (0x30/48px, ChkNearPlayer) then holds and shoots, instead of charging onto Snake (fixed bullets being consumed inside Snake on spawn)
- [x] 8.2 Lower `GUARD_CHASE_SPEED` 2 → 1.0 so the guard no longer outruns Snake (and his own bullets); aim bullets *toward Snake* (CalcShot2) instead of along the 4-dir facing so they travel and connect
- [x] 8.3 Suppress the alert "!" icon during the death sequence (it was lingering over the dying guard)
- [x] 8.4 Play Snake's death animation while dead (exported `die-lean`/`die-dead` into snake.png/json; `deadFrameKey` does leaned-back → spin → dead per SetSprDead)
- [x] 8.5 Damage feedback: Snake flickers during i-frames + a hit blip on each non-fatal hit (legibility aids; ROM has neither)
- [x] 8.6 Add a simplified life/energy bar (top-left, scales to MaxLife) so damage is visible without the full HUD
- [x] 8.7 Re-verify headless: 280 ticks incl. forced death → death animation → restart, with the life bar/blink drawing — 0 errors

## 9. Playtest fixes (second browser pass)

- [x] 9.1 Obstacle routing (`GuardAvoidObstacle`): the guard was stalling when a wall sat on its path. `chaseStep` now tries the direct direction, else commits to a perpendicular detour (`detourDir`, wall-following) until the direct path reopens — verified in a node sim (guard rounds a finite pillar and reaches shooting range) + the real-module smoke
- [x] 9.2 Alert "!" icon is now a brief discovery flash (`ALERT_ICON_TICKS`), not a persistent badge — matches the original game (it disappears while the guard keeps chasing); icon draw gated on the flash timer
- [x] 9.3 Re-verify headless: 400 ticks (alert → chase around a pillar → bullets → icon flash → forced death → restart) with 0 errors

## 10. Faithful alert AI rewrite (ROM review)

- [x] 10.1 Reviewed `guardalert.asm` in full (`GuardAlertLogic` status machine, `GuardWalk`/`GuardWaitShot`/`GuardAvoidObstacle`, `GetDirToPlayer`/`GetOppositeDir` in `helperdirections.asm`, `ChkNearPlayer`, `DirectionSpeeds2`)
- [x] 10.2 Replaced per-frame homing with the ROM state machine: pick a direction toward Snake and **commit for `counter` (~20–35) frames** before re-aiming; re-aim on counter expiry or on hitting a wall (`GuardWalk`)
- [x] 10.3 **Stop-and-shoot rhythm** (`GuardShot`/`GuardWaitShot`): on re-aim ~3/4 chance to halt (`moving=0`), fire an aimed bullet, wait ~15–22 frames facing Snake, then resume — instead of firing while moving on a fixed cooldown
- [x] 10.4 **GuardAvoidObstacle** faithful detour: freeze the blocked goal direction (`walkAwayDir`), slide along the perpendicular, resume toward Snake only when the goal direction reopens (no oscillation)
- [x] 10.5 Removed the stand-off (`GUARD_SHOOT_RANGE`), which was red-alert-only (`ChkNearPlayer`) and not normal-guard behaviour (see §11 for the chase-speed correction)
- [x] 10.6 Verified: logic sim (commit / stop-and-shoot / routes around a pillar and reaches Snake / not stuck — 5/5) + real-module smoke (800 ticks: long alert chase/shoot/avoid → death → restart, 0 errors)
- [x] 10.7 Manual browser re-test of the new AI feel (segmented pursuit, stop-and-shoot, obstacle routing) — confirmed by the user across iterative passes

## 11. Chase-speed correction (ROM speed comparison)

- [x] 11.1 Compared movement speeds in the disassembly: Snake walk = `PlayerMovSpeed` 0x0200 = **2 px/frame** (8.8 fixed; `Variables.asm` PlayerYdec/Y/Xdec/X byte pairs, `Banks0123.asm` InitPlayerVars + ControlPlayer); guard patrol = `DirectionSpeeds` ±1; guard alert = `DirectionSpeeds2` ±2. ⇒ an alerted guard moves at **the same** speed as Snake (both 2 px/frame), and patrol at half — NOT 2× Snake
- [x] 11.2 Fixed `GUARD_CHASE_SPEED` from `2` to `SPEED` (alert == Snake, faithful ratio); set the guard patrol default to `SPEED/2` and the authored `guards.json` speed 0.6 → 0.5 (patrol = ½ Snake). With the stop-and-shoot pauses the guard now averages slower than Snake, so distance can be opened — as in the ROM. This removes the earlier (wrong) speed divergence
- [x] 11.3 Manual browser re-test of the corrected chase speed — confirmed by the user ("this is now fixed")
