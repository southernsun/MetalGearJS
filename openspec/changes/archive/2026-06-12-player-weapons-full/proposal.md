# The other weapons (SMG, grenades, rockets, plastic bombs, mines, remote missiles)

## Why

Only the handgun is ported. The disassembly specifies the entire weapon system through one
clean dispatch (`ChkWeaponShot`, logic/weaponuse.asm:8-40 → per-weapon fire checks;
`PlayerShotLogic` :190-207 → per-weapon shot logic, all in logic/weapon/*.asm), with the
shared shot pool (6 slots), per-weapon damage-vs-enemy tables (data/weapondamage.asm),
sprites for every projectile (SprGrenade/SprRocket*/SprPlasticBomb/SprMine/SprMissile*/
SprExplosionS/B), and catalogued SFX. The plastic bomb also unlocks the lock-14 basement
bomb walls (`ChkBasementWall` + `ChkBombLocation`) the doors system already dispatches
around.

## What Changes

- **SMG** (`ChkSMGShot`): hold-to-autofire every 2 iterations, a cycling 8-step burst
  whose bullets fan out per `SMG_BulletSpeeds` (per-direction 8.8 speed pairs), ammo per
  bullet, suppressor honoured, SMG SFX 0x0D, the rest identical to handgun bullets
  (range 0x10, kills by contact).
- **Grenade launcher** (`ChkGrenadeShot`/`PlayerGrenadeLogic`): a lobbed grenade — real
  position moves at ±3 on the facing axis while the VISUAL Y adds the `GrenadeYOffsets`
  parabola; flies over tiles, no contact kill; after 0x18 iterations it explodes (SFX 0x1A,
  alert trigger, a 1-frame kill window, the 3-frame small explosion). Max 2 in flight.
- **Rocket launcher** (`ChkFireRocket`): one rocket at a time, ±5 straight, kills by
  contact, explodes on tile collision (medium explosion, 15 frames), SFX 0x13.
- **Plastic bomb** (`ChkPBombShot`): placed one tile ahead (`PBombDirOffset`), 0x30 timer,
  then the medium explosion (SFX 0x1C) with a 1-frame kill window — and `ChkBasementWall`:
  an exploding bomb near a lock-14 wall's area OPENS it. One at a time; consumable.
- **Land mine** (`ChkLMineShot`): placed at Snake's feet, passive, kills by contact — an
  enemy stepping on it takes the hit and the mine explodes (small explosion, SFX 0x1C).
  Up to 3 set; consumable.
- **Remote missile** (`ChkMissileShot`/`ControlMissile`): one at a time, speed ±4; while it
  flies the DIRECTION KEYS STEER IT (any 90° turn, re-aiming sprite + speeds); explodes on
  tile collision (medium); SFX 0x14; consumable. (Player movement gating verified from the
  ROM during implementation.)
- **Damage**: per-weapon per-enemy tables (data/weapondamage.asm) — vs guards: SMG 2,
  grenade 5, rocket 0x0A, bomb 5, mine 5, missile 5; max actives from the table headers
  (6/2/1/1/3/1).
- **Exports**: shots.png (grenade, rocket x4, bomb, mine, missile x4, small + medium
  explosion frames, colours from the ROM shot-sprite tables), SFX wavs (SMG, grenade
  throw, rocket, missile, bomb-set, explosion, bomb-explosion).
- **Playability**: the launcher/explosive pickups join the DEMO items in cluster rooms
  (their real rooms aren't exported — the established divergence). Pickups/ammo/menus/
  HUD/max-ammo already work (the items system shipped them).

## Capabilities

### Modified Capabilities

- `browser-player-weapons`: grows from "the handgun" to the full seven-weapon dispatch.
- `browser-doors`: the lock-14 bomb walls open per ChkBasementWall when a plastic bomb
  explodes in their zone.

## Impact

- `web/game.js`: the fire dispatch, per-weapon shot logic in the existing playerShots
  pool, explosions, the bomb-wall hook, missile steering.
- MetalGearSpriteMover: `--export-shots`; ThemeOfTaraPlayer: 7 SFX exports.
- web/shots.headless.mjs grows per-weapon checks; SESSION-STATE, rom-data-formats,
  coverage.
