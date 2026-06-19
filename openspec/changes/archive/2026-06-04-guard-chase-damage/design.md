## Context

The archived `browser-guard` slice gave us a guard entity (`web/game.js`) that patrols a
waypoint path, detects Snake via ROM-faithful line-of-sight (`chkdiscover.asm`), raises a
latched alert (icon + looping Alert music), and can be punch-stunned/killed
(`punchenemy.asm` / `ChkKillPunching`). The alert branch of `updateGuard()` currently just
faces Snake and holds — a dead end. There is no concept of Snake's life, no enemy damage, and
no game-over.

This change closes that loop, staying as faithful to the ROM as the engine allows — matching
both **behaviour** and **source** (cite the routine/constant for each ported value). The
relevant ROM sources, confirmed by reading the disassembly:

- `logic/actors/guardalert.asm` — alerted guard logic: `GuardWalk` chases via
  `GetDirToPlayer` + `SetWalkSpeedFast`; `GuardShot` spawns a bullet; `DirectionSpeeds2` =
  ±2 px/frame (patrol `DirectionSpeeds` = ±1).
- `logic/actors/guardshot.asm` — `InitGuardShot`: bullet `ID_GUARD_BULLET` (0x2F),
  sprite 0x72, speed 0x90, SFX 5.
- `data/shapes.asm` `ActorTouchDamage` — guard and guard-bullet both deal **2**.
- `logic/touchenemy.asm` — `DamageDelayTimer = 0x20` (32-frame post-hit i-frames); armor
  halves bullet damage (out of scope here).
- `logic/hud.asm` — `DecrementLife_B` (clamp at 0), `SetDead` (control lock, death anim,
  `DeadTimer = 0x80`, clears bullets, death SFX 0x44).
- `Banks0123.asm` — `InitPlayerVars` life = `0x18` (24); `DeadLogic` counts `DeadTimer` to 0
  then leaves play mode.

Engine constraints: vanilla JS + Canvas, fixed 60 Hz timestep, pre-exported static assets,
no build tooling, no new runtime dependencies. All new logic lives in `web/game.js`.

## Goals / Non-Goals

**Goals:**

- An alerted guard chases Snake at the fast ROM speed (2 px/frame), collision-aware, and fires
  `ID_GUARD_BULLET` bullets at the ROM cadence.
- Snake has life (start/max 24); bullets and guard contact each deal 2 damage with a 32-frame
  invulnerability window; life clamps at 0.
- Game-over at 0 life: `SetDead`-style death state (control lock + death beat + `DeadTimer`),
  then a restart of the slice (start room, full life, guard re-patrolling).
- Every ported number is traceable to a named ROM routine/constant in code comments.

**Non-Goals (deferred):**

- The on-screen HUD / life-bar UI — the next change. This slice keeps `life` as state; the only
  required on-screen feedback is the existing alert icon/music, the death beat, and the restart.
- Rank/level-based life scaling, the armor item's damage halving, red-alert guards and weapon
  variety, multiple guards / enemy types, guard respawn, alert calm-down/search/return-to-patrol,
  and the ROM checkpoint/continue/save restore (restart goes to the start room instead).

## Decisions

### 1. Chase reuses the existing collision probes, not a new pather

The alerted guard moves toward Snake one dominant axis at a time (matching `GetDirToPlayer`,
which compares |dx| vs |dy| and picks the larger), at `GUARD_CHASE_SPEED = 2`. Movement is
gated by the same tile-collision test Snake uses. The cleanest reuse is to generalize the
existing `blocked(x, y, dir)` (currently closes over `snake`'s probe set) so the guard can be
tested too — either by passing a probe set/box, or by adding a small `guardBlocked(x,y,dir)`
using the guard's box. **Decision:** add a box-parameterized collision helper and have both
Snake and the guard call it; keep Snake's behaviour byte-for-byte identical (regression-check
that movement/doors are unchanged). *Alternative considered:* full A* pathfinding around walls
— rejected; the ROM doesn't path-find (it has a simple `GuardAvoidObstacle` wiggle), and A* is
far more than this slice needs. If the guard wedges on a wall we may port the ROM's
obstacle-avoidance nudge, but the minimal faithful behaviour is "step toward Snake on the
dominant axis, blocked by walls."

### 2. Bullets are a small entity array, updated in the fixed-timestep loop

Add `bullets = []`; each bullet is `{x, y, vx, vy}` set at fire time from the guard's facing
(`InitGuardShot` orientation) and `GUARD_BULLET_SPEED`. Each tick: advance, despawn on a solid
tile (reuse the collision map) or when out of room bounds, and test overlap with Snake. The ROM
fires randomly (~1/16 frames in chase via RNG) — we use a simple per-guard `fireCooldown`
counter reset to `GUARD_FIRE_TICKS ≈ 16` (deterministic cadence; we avoid `Math.random` for
testability and match the *average* rate, noting the ROM's is stochastic). Cap concurrent
bullets (ROM pools at 6). *Alternative considered:* hitscan (instant ray) — rejected; the ROM
bullet is a visible travelling sprite the player can out-maneuver, which is the point.

### 3. Damage is centralized in one `damage(n)` helper guarded by an i-frame timer

`snake.life`, `snake.maxLife = 24`, `snake.invulnTimer`. A single `damage(n)` decrements life
(clamped ≥ 0), sets `invulnTimer = 32`, and triggers death at 0. Both the bullet-overlap check
and the guard-contact check call it, and both early-return while `invulnTimer > 0` — this is
exactly the ROM's single `DamageDelayTimer` gate shared across damage sources. Contact uses an
AABB/center-distance overlap between Snake's and the guard's boxes. *Alternative considered:*
per-source cooldowns — rejected; the ROM uses one shared timer.

### 4. Death + restart as a top-level game state, not a guard concern

Introduce a `gameState` of `'play' | 'dead'`. On reaching 0 life: set `gameState='dead'`, lock
input (the existing `update()` early-returns its movement/punch handling), clear `bullets`,
stop the alert music, play the death beat, and start `deadTimer = 128`. `update()` in the dead
state just counts `deadTimer` down; at 0 it calls a `restart()` that resets `snake` to
`SPAWN_X/Y` + full life, `setRoom(manifest.start)` (which rebuilds the guard via `buildGuard`),
and returns to `'play'`. This mirrors `SetDead` → `DeadLogic`. *Liberty taken:* the ROM restores
the last checkpoint; we have no checkpoint system, so we restart from the start room — flagged
in the proposal/spec as deferred.

### 5. Export the guard bullet sprite and death SFX from the ROM (decided)

Both assets are decoded from the ROM as part of this change (not deferred). Add a SpriteMover
export mode that decodes `ID_GUARD_BULLET` (sprite 0x72) in its actor colours to
`web/assets/guard-bullet.png` via the same compositor used for the guard, and a
ThemeOfTaraPlayer export of the death SFX (music `0x44`, "Just another dead soldier") to
`web/assets/dead.wav`, exactly as the guard slice exported `guard.png` / `alert.wav`. Both are
loaded optionally at runtime (`.catch(() => null)`) so a missing file degrades gracefully to a
small bullet-sized rect / a short Web Audio tone, but the intended runtime path is the decoded
assets. Export them first so the rest of the work renders the real sprite/sound.

## Risks / Trade-offs

- **[Snake-movement regression from refactoring `blocked()`]** → keep the public behaviour for
  Snake identical; add the box parameter with Snake's existing probes as the default, and
  re-run the movement/traversal/doors checks from the prior slice.
- **[Guard wedging against walls during chase]** → acceptable for the slice (the ROM itself can
  look awkward); if it stalls badly, port the `GuardAvoidObstacle` sidestep. Documented as a
  known limitation, not a blocker.
- **[Deterministic fire cadence differs from the ROM's RNG]** → we match the average rate and
  comment the divergence; keeps the sim testable headlessly. Can swap to seeded RNG later.
- **[Difficulty/feel: chase + bullets may be too punishing without a HUD]** → tune
  `GUARD_FIRE_TICKS`, chase speed, and bullet speed; 24 life ÷ 2/hit = 12 hits gives slack.
  Real feel is a manual-pass item, as in the guard slice.
- **[No on-screen life feedback yet]** → intentional; the HUD is the next change. Death + restart
  still make damage legible. Surfacing `life` to `window`/console can aid the manual pass.

## Migration Plan

Additive, single file (`web/game.js`) plus one optional asset. No data migrations. Rollback is
reverting the change; the archived `browser-guard` behaviour (alert = hold) is fully restorable.
Sequence: collision-helper refactor (regression-safe) → chase → bullets → life/damage → death +
restart → tune. Verify headlessly where possible (chase steps toward Snake; bullet despawn on
wall/edge; damage math + i-frame gate; death at 0 → restart) and finish with a manual browser
pass.

## Open Questions

_Both resolved (2026-06-03):_

- **Export assets now vs. fallback-first** → **export now.** Decode the guard-bullet sprite
  (0x72) and death SFX (music 0x44) from the ROM in this change; fallbacks remain only as a
  graceful-degradation safety net. (See Decision 5.)
- **Alert persistence across rooms** → **keep the per-room reset for now.** A guard that
  "remembers" the alert across room changes is deferred to a later change.
