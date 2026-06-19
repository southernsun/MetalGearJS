# Hind D (room 50) — and the guard-bullet regression fix

## Why

The roof gunship was the last empty boss arena on the roof — and porting it surfaced a
LATENT REGRESSION: a player-side `fireBullet` (added by the weapons slice) had been
silently shadowing the guard-side function of the same name, killing every AIMED guard
shot since.

## What Changes

- HIND D (hindd.asm, room 50, life 0x64, BossHindD_KO): the stationary body — the
  HindDTileMap tile block at (0x40,0), exported via the NEW --export-hindd / generic
  ExportTileBlock (hindd.png + hindd-wreck.png; the wreck replaces the body on death) —
  with the animated propeller (its SFX every 4 iterations) and FIVE-bullet AIMED bursts:
  a bullet every 5 iterations, 0x11 iterations between bursts. Mercenary music; the kill
  latches forever.
- THE REGRESSION FIX: the guard's aimed-bullet spawner renamed fireGuardBullet; the
  guard alert AI, the jetpacks, and Hind D all shoot again.

## Capabilities

### New Capabilities

- `browser-hind-d`: the fight.

## Impact

- web/game.js, Tools/RoomViewer (ExportTileBlock + --export-hindd), web/assets
  (hindd/hindd-wreck pngs, propeller.wav); hindd.headless.mjs (5 checks).
