# Design — rank-progression

## Context

ROM facts (verified in the disassembly this session):

- **Rank up** (`IncRescued` Banks0123.asm:9634): `RescuedCnt` increments per rescue; at 5 it
  resets and falls into `IncClassLv`: Class < 3 → increment, SFX 0x26, then `UpdateLevels`:
  MaxLife = 24/32/40/48 by Class, **Life = MaxLife** (rank up is a full heal), DrawClass +
  DrawLife, `SetMaxAmmoVals` (per-rank maxima). Note `UpdateLevels` always refills life — the
  downgrade path compensates (below).
- **Rank down** (`DowngradeRank` Banks0123.asm:9581): resets the LAST-17 prisoners' rescued
  flags (the first 6 in `RoomsPrisoner` — fake Madnar, Madnar, Ellen, Grey Fox, and the two
  message prisoners — stay rescued; Jennifer's brother's flag is explicitly preserved),
  `RescuedCnt` = 0; if Class > 0: decrement, SFX 0x27, `UpdateLevels` with Life saved/
  restored around it, clamped to the new MaxLife (a downgrade never heals), then `LimitAmmo`
  clamps ammo/rations.
- **Trigger** (`KillPrisoner` Banks0123.asm:13276): a prisoner reaching LIFE 0 goes through
  `KillActor` → kill-logic `KillPrisoner` → `DowngradeRank`. Prisoners have LIFE 2
  (`idxActorLife`) and take 2 from a handgun bullet (`BulletDamage`) — one shot kills.
- **Rescue** (`PrisonerLogic`, logic/actors/prisoner.asm): idle = 2-frame animation
  (`Anim2FramesActor`, Prisoner/Prisoner2 attr frames — alternating torso over fixed legs);
  Snake's touch (TOUCH_INFO bit 7; touch shape `ActorsShapeTouch[ID−1]` = 0x17 →
  `ImpactAreasInfo` row 0x17: offY −8, distY 16, offX 0, distX 16, ChkArea strict `<`) →
  rescued pose (PrisonerFree frame) → brief wait → `SetAsRescued` (RescuedArray flag, keyed
  by the room's position in `RoomsPrisoner`) + `IncRescued`. A rescued prisoner's room slot
  stays empty on re-entry (`InitPrisoner` dismisses when the flag is set). Touching a
  prisoner causes NO damage (`TouchPlayer` exempts prisoner IDs) and NO alarm.
- **Rooms** (`RoomsPrisoner`, prisoner.asm:43): 23 rooms, 129–203 — none exported; a DEMO
  prisoner goes in a cluster room (divergence, like the demo guard/items).
- **Sprites**: `SprPrisoner`/`SprPrisoner2` (gfx/sprites.asm) hold the cells; attr frames
  (actorspriteattr.asm:378-380) OR-pair them as torso(0D0/0D4 ↔ 0D8/0DC) over legs(0E0/0E4),
  rescued = 0E8/0EC over 0F0/0F4 — same compositing as the guard export (VRAM base 0xD0 →
  sprite index (pattern−0xD0)/4).
- **Maxima** (`MaxAmmoLv1-4` + ration caps, logic/maxammo.asm — BCD): handgun/SMG
  50/100/200/300, grenade 15/30/60/90, rocket 5/10/20/30, bomb/mine/missile 5/10/15/20,
  rations 3/6/9/18. The INTRUDER/ISOLATION password cheats are out of scope.

## Goals / Non-Goals

**Goals:**
- Rescue/kill prisoner actor with the ROM touch shape, rescue flags, and respawn rules.
- `IncRescued`/`IncClassLv`/`UpdateLevels`/`DowngradeRank` with exact life/ammo consequences.
- Rank-indexed maxima in `clampInventory`; Class persists across the slice restart.
- Real prisoner sprites and rank-up/down SFX exported from the ROM.

**Non-Goals:**
- Prisoner/Madnar/Ellen texts, the Madnar rescue exploit, Coward-Duck/Jennifer's-brother
  specials, Ellen's voice actor — text/radio/boss systems.
- The capture/jail flow and equipment removal.
- Password cheats for maxima.

## Decisions

1. **Prisoner as a sibling singleton to the guard** (`prisoner` beside `guard`): our actor
   system is single-slot per kind; prisoner rooms and guard rooms don't overlap in the demo.
   State: `{x, y, status: idle|wait|rescued-done, animTimer, phase, life}` driven from
   `prisonersData` (DEMO table; the faithful `RoomsPrisoner` rooms are unexported, documented).
2. **Rescue flags**: `rescuedRooms` Set keyed by room number + the ROM's reset rule —
   `downgradeRank` deletes only rooms in the "regular 17" list (`RoomsPrisoner[6..22]` plus
   the demo room), never the first 6 specials. RescuedCnt is a plain counter.
3. **`updateLevels()`** sets `snake.maxLife`/HUD from `RANK_MAX_LIFE[class]` (table already
   present) and is shared by up (life = max) and down (life = min(life, max)) paths, matching
   the ROM's push/pop-around-UpdateLevels structure. `clampInventory()` reads
   `MAX_AMMO_LV[snake.class]` / `MAX_RATIONS_LV[snake.class]`.
4. **Shooting a prisoner reuses the guard shot path**: `updatePlayerShots` tests the
   prisoner with the same shape-0 projectile box (ActorShapeProject[ID_PRISONER−1] = 0,
   data/shapes.asm row 4 — same shape as the guard), LIFE 2 − damage 2 → killed on his
   logic tick → `downgradeRank()`.
5. **Exports**: `--export-prisoner` composites the three frames (idle-1, idle-2, rescued)
   exactly like the guard exporter (OR-pairs, 16×32 cells, anchor at the feet); colors from
   the shared actor palette (uniform + tan face, hand-picked RGB like the guard's — comment).
   SFX: `--export-sfx "Rank up"` → rankup.wav, `"Rank down"` → rankdown.wav.

## Risks / Trade-offs

- [Touching a prisoner also triggers the guard-touch damage path?] → No: prisoners are a
  separate object; `chkTouchGuard` only tests the guard. The prisoner's own touch check is
  damage-free (TouchPlayer exempts prisoners in the ROM).
- [SprPrisoner cell layout may not match the assumed (pattern−0xD0)/4 mapping] → verify
  visually after export; the attr-table pairs are authoritative, and the exporter prints the
  decoded sprite count for sanity.
- [Demo prisoner + rank tuning makes ranking up trivially fast (5 touches of one respawning
  prisoner?)] → No: a rescued prisoner is flagged and does NOT respawn (faithful). The demo
  places several prisoners across cluster rooms so reaching rank 2 is possible; full rank 4
  needs 15 rescues and stays a long-game goal (documented).
