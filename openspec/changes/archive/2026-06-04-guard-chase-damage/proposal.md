## Why

The guard we just shipped detects Snake and raises an alert — but the alert is a dead end:
the guard stops, faces Snake, and nothing happens. You can stand in a guard's face forever
with zero consequence, so stealth is currently cosmetic. Giving the alert teeth — the guard
chases and shoots, Snake takes damage, and running out of life is game-over — is what turns
the map from a walking sim into the actual stealth game.

## What Changes

- **Alert now means pursuit.** When a guard enters the alert state it stops patrolling and
  **chases Snake** at the ROM's fast speed (2 px/frame vs. the 1 px patrol), re-evaluating his
  direction toward Snake each tick and moving collision-aware around the room
  (`guardalert.asm` `GuardWalk` / `DirectionSpeeds2`). **BREAKING** behaviour change to the
  archived `browser-guard` alert requirement (which had the guard hold position).
- **Guards shoot.** A chasing guard periodically **fires a bullet** toward Snake
  (`ID_GUARD_BULLET`, ~1-in-16 frames during chase, bullet sprite travels along the facing
  axis). Bullets are simple entities: they travel, despawn on a solid wall tile or when they
  leave the room, and deal damage on contact with Snake. (Single guard / single weapon type;
  red-alert fire-rate and weapon variety are out of scope.)
- **Snake has life and takes damage.** Add a life/HP value (ROM start = 24,
  `InitPlayerVars`). A guard **bullet hit** and **direct contact** with a guard each deal
  **2 HP** (`ActorTouchDamage`), followed by a **32-frame invulnerability window**
  (`DamageDelayTimer`) during which further enemy damage is ignored.
- **Game-over.** When life reaches 0, enter a dead state (`SetDead`): freeze player control,
  play a brief death beat, then **restart the slice** — respawn Snake in the start room at full
  life and reset the guard's patrol. (No checkpoint/continue/save system in this slice; ROM
  checkpoint restore is deferred.)
- Keep it vanilla JS + Canvas with the existing pre-exported static assets; no build tooling,
  no new runtime dependencies. Reuse the existing guard entity, LOS detection, room collision,
  and Snake movement/punch.

**Out of scope (deferred):** the *full* on-screen HUD — rank, weapon/item, status bar (the next
change). A **minimal life bar is included here** (playtest feedback: damage was illegible without
it). Also deferred: rank-based life scaling, the armor item's damage halving, red-alert guards and
weapon variety, guard respawn, multiple guards / enemy types, the alert chase calm-down / search /
return-to-patrol, and a checkpoint/continue/save system.

## Capabilities

### New Capabilities

- `browser-snake-damage`: Snake's life/HP in the browser game — a life value with a max, taking
  damage from guard bullets and direct guard contact (2 HP each, with a post-hit invulnerability
  window), and the game-over → restart flow when life reaches zero.

### Modified Capabilities

- `browser-guard`: the **alert state** requirement changes from "stop patrolling and face
  Snake" to an active pursuit — the alerted guard chases Snake at the fast ROM speed and fires
  bullets at him. Adds guard-bullet entity behaviour (spawn, travel, despawn on wall/exit).

## Impact

- **Browser game** (`web/game.js`): extend `updateGuard()` alert branch from face-only to
  chase movement (reuse the collision probes / `blocked()` for the guard) + a fire timer that
  spawns bullets; add a bullet list with per-tick travel + wall/exit despawn and drawing; add
  Snake `life`/`maxLife` + `invulnTimer` + a `damage(n)` helper; add contact and bullet-hit
  checks; add a `dead` game state with a death timer and a restart that re-spawns Snake and
  rebuilds the room/guard. New tunables block for chase speed, fire rate, bullet speed, damage,
  and i-frames.
- **Assets**: a **guard bullet sprite** is needed under `web/assets/` (`ID_GUARD_BULLET`,
  sprite 0x72). If a decoded PNG isn't exported, draw a small fallback dot — but prefer
  exporting it for faithfulness (decode path: `logic/actors/guardshot.asm` + the actor sprite
  tables, same compositor used for the guard). No other new assets (death uses existing SFX or
  a simple beat; the alert music already loops).
- **Source data consumed (read-only)**: `logic/actors/guardalert.asm` (chase + `GuardShot`),
  `logic/actors/guardshot.asm` (`InitGuardShot`, bullet speed 0x90), `data/shapes.asm`
  (`ActorTouchDamage` = 2), `logic/touchenemy.asm` (`DamageDelayTimer` = 0x20),
  `logic/hud.asm` (`DecrementLife_B`, `SetDead`), `Banks0123.asm` (`InitPlayerVars` life = 24,
  `DeadLogic` timer 0x80).
- **Dependencies**: none new — Canvas + Web Audio at runtime; .NET 8 only if the bullet sprite
  is exported.
- **Out of scope** (future): HUD/life-bar UI, rank/level life scaling, armor, checkpoints +
  continues, red-alert + weapon variety, multiple guards, and alert calm-down/search.
