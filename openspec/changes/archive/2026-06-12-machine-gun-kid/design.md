# Design — Machine Gun Kid

## Context (verified)

- `MachGunKidLogic` 5 states: intro / think / move-to-shoot / shooting / move-to-hide;
  `MachGunStatus` bit 0 = dead (set by `DismissActor7` on kill — permanent), bit 1 =
  speech shown. Boss music via `SetBossMusic` (tank.asm:30, "Mercenary" 0x3E), restored
  by `RemoveActorMusic` on death.
- Movement: Y fixed 0x34; ±4 px/iteration; X limits 0x20/0xE0 (`MG_ChoseDir`); walk
  bursts of 8 iterations; think-wait 0x2D only while the player is in his ±16px column;
  shoot window 0x28 with the ±0x30 player arc.
- The shot (`InitMGunKidShot`/`MGunKidShotLogic`): bullet sprite, speedY 5/iteration,
  speedX (burstDir×0x40 − 0x80)/256 → ±0.5 px/iteration fan, SFX 5 = `Sfx_BulletShot` —
  which CONFIRMS the guard-shot SFX mapping the port had stubbed with a synth.
- Tables: life 0x14; his bullet damage 8; weapon damage vs him = the guard column
  (2/2/5/0xA/5/5/5); explosion impact shape 0x1B = (0, 0x14, 0, 0x10).
- Sprites: SprMGunKid 8 sprites = torso pair (0,1), recoil torso (2,3), legs (4,5),
  walk-legs (6,7); frames fire/recoil/walk1/walk2 (attr 0x31-0x34, header 0xA5);
  SprsetPal11 colours (2 = 41h/2 brown, 0Dh = 53h/4 tan, overlap 0x0F).

## Decisions

1. **A dedicated `boss` object** ticked on ROM iterations, drawn between the cameras and
   the guard; bullets go into the existing guard-bullet pool with a per-bullet `dmg`
   field (the pool's tile collision gives the pillar cover for free, faithful to the
   arena).
2. **shotTarget grows the boss** with his own explosion shape; weapon damages apply
   unchanged (verified equal to the guard column).
3. **Contact-triggered explosions don't double-hit**: RocketExplode/MineExplode/
   MissileExplode clear KILL_BY_CONTACT in the ROM — only the grenade/bomb transitions
   open the one-iteration blast window (fixed while porting; the suite pins it).
4. **Death**: enemy-dead SFX + music stop + `mgkDead` latch (module state, survives
   restart like the ROM variable); no death explosion animation (KillActor's visual is
   minimal for him — noted).
5. **Music**: mercenary.wav loops like alert.wav; `--export-sfx` grew a Music-category
   fallback with a fixed 12s render.

## Risks / Trade-offs

- [Boss music vs alert music can overlap if the alarm rises in room 20] → acceptable;
  the ROM swaps AreaMusic entirely (our port has no full music system) — noted.
- [Touch damage from his body (4) unported] → he's unreachable behind the wall row.
