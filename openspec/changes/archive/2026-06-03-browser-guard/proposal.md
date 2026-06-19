## Why

The browser game can now explore connected rooms and open doors, but there's nothing to
sneak past — and sneaking past guards is the whole point of Metal Gear. Adding a patrolling
guard with line-of-sight detection and an alert state turns the map into a stealth playground
and makes the prototype recognizably *the game*. It also exercises the punch we already built
(knocking a guard out from behind) and reuses the room/collision/asset-export foundation.

## What Changes

- Add a **patrolling guard** to a room: it walks a waypoint path, faces its direction of
  travel with the correct walk animation, and pauses/turns occasionally (per `guard.asm`).
- Implement **line-of-sight detection** faithfully to `chkdiscover.asm`: the guard sees along
  its facing direction within a narrow perpendicular band (±8px looking up/down, ±6px looking
  left/right), the player must be *in front*, and the view is **blocked by wall tiles** (the
  same room collision map). No seeing through walls or behind itself.
- Add the **alert state**: when the guard spots Snake, show the "!" alert icon above it and
  play the ROM's **Alert music**; the guard enters alert (for this slice it stops patrolling
  and faces Snake — chasing/shooting is deferred).
- Allow **punch-KO**: punching the guard while adjacent (from behind) knocks it out — it goes
  down and stops detecting, with the existing punch sound.
- Extend the **asset export** to produce the guard's sprite frames (PNG + atlas, like Snake),
  the alert "!" icon, and the alert music rendered to an audio file.
- Keep it vanilla JS+Canvas with pre-exported static assets and no build tooling.
- **Out of scope (deferred):** guard shooting/weapons, the alert *chase* and guard respawning,
  search/return-to-patrol behaviour, multiple guards or enemy types, cameras/lasers, Snake
  taking damage / game-over, and the cardboard-box / deep-water stealth exemptions.

## Capabilities

### New Capabilities

- `guard-asset-export`: Extend the offline export to emit the guard's sprite frames (a PNG
  spritesheet + JSON atlas covering the four facing directions and walk frames), the alert
  "!" icon as a PNG, and the ROM's Alert music rendered to an audio file under `web/assets/`.
- `browser-guard`: A patrolling guard in the browser game — waypoint patrol with directional
  walk animation, line-of-sight beam detection (front-facing, wall-blocked, narrow band) that
  triggers an alert state (icon + alert music), and punch-from-behind KO — integrated with the
  existing room manager, collision, and Snake/punch logic.

### Modified Capabilities

<!-- None in openspec/specs/. Builds on the unarchived browser-snake-movement-punch,
     browser-room-traversal, and browser-doors changes; the guard is expressed here as new
     capabilities that extend that engine. -->

## Impact

- **Export tooling**: add guard-sprite decoding/export (reusing the sprite compositor used for
  Snake, driven by the actor sprite/colour tables — `data/actorspriteattr.asm`,
  `data/spritesets.asm`), the alert icon (`gfx/alerticon.asm`), and an Alert-music render mode
  to `Tools/ThemeOfTaraPlayer` (the music engine already plays it).
- **Browser game** (`web/game.js`): add a guard entity (position, facing, patrol path + state
  machine), a line-of-sight check against the active room's collision map, an alert state with
  the icon overlay + music playback, and punch-KO handling tied to the existing punch state.
  New assets under `web/assets/`: `guard.png`/`guard.json`, `alert-icon.png`, and the alert
  music file; plus a small per-room guard/patrol definition (authored or exported from
  `data/paths.asm` / `data/actorsinrooms.asm`).
- **Source data consumed (read-only)**: `logic/actors/guard.asm`, `chkdiscover.asm`,
  `setalert.asm`, `data/paths.asm`, `data/actorsinrooms.asm`, `data/actorspriteattr.asm`,
  `data/spritesets.asm`, `gfx/alerticon.asm`, and the Alert music in the sound data.
- **Dependencies**: none new — Canvas + Web Audio at runtime; .NET 8 for export.
- **Out of scope** (future): weapons/shooting, alert chase + respawn + search, damage/health
  and game-over, cameras/lasers, and additional enemy types.
