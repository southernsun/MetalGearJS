## Context

The browser engine has Snake movement, room collision, room/door transitions, the punch +
sound, and an asset-export pipeline (sprites → PNG/atlas, room/collision, SFX → WAV, door
graphics). A guard slots in as the first *actor* with AI.

ROM systems to mirror:
- **Patrol** (`logic/actors/guard.asm`, `data/paths.asm`): a guard follows a waypoint path
  (`Path_RRR_NN` = `[count, (b,b)×count]`), faces its travel direction (`ChangeGuardSprDir`),
  and has states patrol / turn / wait / sleep / wake (random waits + ±90° turns).
- **Detection** (`logic/actors/chkdiscover.asm`): a straight line-of-sight *beam* in the
  facing direction — Snake must be in front, within a narrow perpendicular band
  (`ChkViewVertical` ±8px when looking up/down, `ChkViewHorizontal` ±6px when looking
  left/right), and no solid wall tile may lie between guard and Snake (`CollisionTiles`).
  Range is effectively to the first wall. Several exemptions (deep water, still box) exist.
- **Alert** (`logic/setalert.asm`, `chkdiscover.asm:GuardSetAlarm`): sets `AlertMode`, draws
  the "!" icon above the guard, and plays **MUSIC: Alert (0x32)**.
- **Punch** (`logic/punchenemy.asm`): a punch sets `TOUCH_INFO` bit6; the guard is in the
  punchable list; `Sfx_PunchGuard` (our `punch.wav`) plays.

## Goals / Non-Goals

**Goals:** one guard in a room that patrols, detects Snake by the faithful LOS-beam rule
(front, narrow band, wall-blocked), raises an alert (icon + alert music, stops + faces Snake),
and can be punched out from up close.

**Non-Goals:** guard shooting/weapons, the alert chase + guard respawn + search/return, Snake
damage / game-over, cameras/lasers, multiple guards or enemy types, and the box/deep-water
detection exemptions.

## Decisions

### D1 — Guard sprites: decode the actor frames, with a fallback

Reuse the sprite RLE decoder/compositor used for Snake, driven by the actor sprite/colour
tables (`data/actorspriteattr.asm` `ActorSprColors*`, `data/spritesets.asm`) to export the
guard's four-direction walk frames as `guard.png` + `guard.json` (same fixed-cell + anchor
format as Snake). **Risk/fallback:** the actor attribute/colour mapping is more involved than
Snake's single table; if decoding the exact guard frames proves too costly for this slice,
fall back to cropping the guard frames from the bundled spriters-resource sheet in `examples/`
(less "straight from the ROM", but unblocks the gameplay). Decoding is preferred.

### D2 — Guard placement + patrol data: `guards.json`

A small `web/assets/guards.json` maps a room number → one guard `{ x, y, dir, speed,
path:[{x,y}…] }`. The starting room is a good host so the guard is visible immediately. The
patrol path is authored as a simple loop on open floor (optionally seeded from `data/paths.asm`
for that room), kept data-driven so the path/room is a config change, not code. The guard
moves toward the next waypoint, snapping to it and advancing (with a short wait), looping.

### D3 — Detection ported from `chkdiscover.asm`

Each tick (guard not knocked out, no alert yet): given guard facing `dir`,
- **front check**: Snake must be on the facing side (up → `snakeY < guardY`, etc.);
- **band check**: perpendicular offset within ±8 (up/down facing) or ±6 (left/right);
- **LOS check**: step tile-by-tile from the guard toward Snake along the facing axis using the
  active room's collision map; if any tile is solid, sight is blocked.
If all pass → raise alert. Range is unbounded until a wall (as in the ROM).

### D4 — Alert state

On detection: set `alert = true`, record it once. Draw `alert-icon.png` above the guard;
start the alert music (looping) once — guarded by a flag so it isn't restarted each frame; the
guard stops patrolling and faces Snake. (No chase/shoot this slice.) Alert music is decoded
like the SFX and unlocked by the same first-gesture audio handling. A simple "calm down" is
out of scope — once alerted, it stays alerted for the slice (or until the guard is KO'd).

### D5 — Punch KO

When Snake enters the punch state adjacent to the guard (within a punch reach ~16px) and
facing it, the guard is knocked out: it stops moving, stops detecting, and is drawn downed (or
removed). The existing punch sound already covers the audio. KO works whenever Snake faces and
reaches the guard; "from behind" is the stealth ideal but not strictly enforced this slice.

### D6 — Asset export additions

- Guard frames (D1) via the sprite exporter.
- Alert "!" icon from `gfx/alerticon.asm` → `alert-icon.png` (transparent), decoded like the
  door graphics.
- Alert music: add a music-render mode to `Tools/ThemeOfTaraPlayer` (it already plays the
  track) → `alert.wav`. The track loops in-game; export a clean loop and loop it in the
  browser. Normalize like the SFX so it's audible.

### D7 — Loop + render integration

The guard updates inside the existing fixed-timestep `update()` only when its room is active,
after Snake's move (so detection sees Snake's new position). Draw order in `draw()`: room →
doors → guard → Snake (or ordered by Y) → alert icon overlay. Reuses the room manager so a
guard appears only in its room and resets on room change.

## Risks / Trade-offs

- **[Guard actor-sprite decode is harder than Snake's]** → D1 fallback to the examples sheet;
  keep the atlas format identical so the game code doesn't care which path produced it.
- **[Alert music as a WAV could be large/long]** → export a short clean loop and loop it in the
  browser; if size is a concern, fall back to a short alert *sting* (SFX) plus the icon.
- **[LOS band/range feels too strong or too weak]** → the band/range constants are ported but
  exposed as tunables; verify by walking into and out of sight.
- **[Path coordinate order from `paths.asm` (Y,X vs X,Y) is ambiguous]** → author patrol
  waypoints directly in `guards.json` (x,y) rather than depending on the ROM byte order; seed
  from paths only after verifying.
- **[Guard vs Snake draw overlap / z-order]** → draw by Y or guard-then-Snake; acceptable for
  one guard.

## Migration Plan

Additive: new export outputs (`guard.png/json`, `alert-icon.png`, `alert.wav`, `guards.json`)
and new `game.js` guard code layered on the room manager and movement step. Rollback removes
the guard code + assets; movement/traversal/doors are untouched. No disassembly or
runtime-dependency changes.

## Open Questions

- Which room hosts the first guard (default: the start room) and the exact patrol loop.
- Whether to ship alert *music* or a shorter alert *sting* for this slice.
- Whether to enforce "KO only from behind" now or keep KO-on-adjacent-facing and tighten later.
- Exact guard speed / wait timing to feel right.
