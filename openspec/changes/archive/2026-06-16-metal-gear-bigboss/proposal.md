# Metal Gear + the bomb order + Big Boss

## Why

The final chain: room 118's Metal Gear (the 16-bomb leg puzzle), the lock-14 door it
opens, and room 119's Big Boss with the escape door his death opens.

## What Changes

- METAL GEAR (room 118): the towering body (MetalGearTileMap, 64x96 at (0x60,0x08);
  exported with room 118's real tileset, the bare background replacing it on
  destruction), flanked by its two laser cameras. IMMUNE to everything except the
  SIXTEEN-BOMB LEG ORDER (damagetoenemy.asm:166-213): each exploding plastic bomb near
  the legs pushes Left/Right (bomb X vs the centre 0x80) into the 16-deep shift buffer;
  matching PlasticBombOrder (play order R,R,L,R,L,R,R,L,L,R,L,L,R,L,R,R) kills both
  cameras and destroys it — setting OpenBigBossDoor. Wrong bombs do nothing; the
  sequence can restart forever.
- LOCK 14 (ChkBigBossDoor): the one-shot OpenBigBossDoor gate — Metal Gear's destruction
  opens the door to Big Boss; Big Boss's death re-arms it for the escape-ladders door.
- BIG BOSS (bigboss.asm, room 119, life 0x28, BigBossStat latch): the confession (text
  147, unskippable, once) + the Mercenary music; hit-and-run — fleeing when Snake closes
  within 0x30, firing aimed bursts when row/column-aligned, drifting between cover. The
  crate-cover checks (BBChkCovered/BBChkTurnCorner) are approximated by the
  flee/align/drift triad; he draws with the guard sheet pending SprBigBoss (documented).

## Capabilities

### New Capabilities

- `browser-metal-gear`: the bomb puzzle + the final duel + lock 14.

## Impact

- web/game.js, web/assets (metalgear/metalgear-bg pngs); metalgear.headless.mjs (13).
