# Tasks — rank-progression

## 1. Exports

- [x] 1.1 MetalGearSpriteMover `--export-prisoner`: composite SprPrisoner/SprPrisoner2
      OR-pairs per the attr frames (idle-1 = 0D0/0D4 over 0E0/0E4, idle-2 = 0D8/0DC over the
      same legs, rescued = 0E8/0EC over 0F0/0F4; VRAM base 0xD0 → sprite (pattern−0xD0)/4)
      into prisoner.png (3 cells, 16×32, anchor feet) + prisoner.json. Hand-picked palette
      like the guard's (comment).
- [x] 1.2 Export the rank SFX: `--export-sfx "Rank up" web/assets/rankup.wav` and
      `--export-sfx "Rank down" web/assets/rankdown.wav`.

## 2. Rank core (IncRescued / IncClassLv / UpdateLevels / DowngradeRank)

- [x] 2.1 Rank-indexed maxima: `MAX_AMMO_LV[0..3]` (50/50/15/5… per MaxAmmoLv1-4, BCD-read)
      and `MAX_RATIONS_LV = [3, 6, 9, 18]`; `clampInventory()` reads the current class row.
- [x] 2.2 Port `incRescued()` (counter to 5 → reset + `incClassLv()`), `incClassLv()` (cap 3,
      rankup.wav, `updateLevels(true)`), `updateLevels(refill)` (maxLife from RANK_MAX_LIFE;
      refill ? life = max : life = min(life, max)), and `downgradeRank()` (reset counter +
      clear the regular rescued flags, class−1 floor 0 with rankdown.wav, `updateLevels(false)`,
      `clampInventory()`). Cite Banks0123.asm:9581/9634/9654.
- [x] 2.3 `restart()` keeps class/rescue state (ROM continue keeps rank); life refills to the
      rank's MaxLife.

## 3. Prisoner actor

- [x] 3.1 Prisoner state beside the guard: `prisonersData` (DEMO rooms — the ROM's
      RoomsPrisoner rooms 129–203 are unexported, documented), `rescuedRooms` Set,
      `buildPrisoner(n)` in `setRoom` (skip when rescued), idle 2-frame animation
      (Anim2FramesActor cadence), draw from prisoner.png with a fallback rectangle.
- [x] 3.2 Rescue: touch box (`ActorsShapeTouch` 0x17 → ImpactAreasInfo row: offY −8, distY 16,
      offX 0, distX 16, strict <, no damage/alarm) → freed pose + short wait → mark
      `rescuedRooms`, `incRescued()`. Run from `update()` in the player phase.
- [x] 3.3 Kill: `updatePlayerShots` tests the prisoner with the shape-0 projectile box
      (ActorShapeProject — same as the guard's); LIFE 2 − 2 → killed on his logic tick →
      `downgradeRank()` (KillPrisoner). Punching a prisoner does nothing (no punch branch in
      PrisonerLogic).
- [x] 3.4 Downgrade flag-reset rule: only "regular" prisoner rooms clear (RoomsPrisoner[6..]
      + the DEMO rooms); the 6 specials' rooms (189,182,167,164,203,202) never clear.

## 4. Headless checks

- [x] 4.1 Add `web/rank.headless.mjs`: touch-box boundaries; rescue marks the room + counter;
      rescued prisoner absent on re-entry; 5th rescue → class 1 + full heal 32 + crate cap
      100 + counter reset; cap at class 3; shooting a prisoner → death on his logic tick →
      class−1, life clamped, ammo clamped, regular flags cleared (re-rescue possible),
      specials preserved; class floor 0; restart keeps class; prisoner touch causes no
      damage/alarm; demo prisoner positions on open floor.
- [x] 4.2 All suites green + `node --check web/game.js`.

## 5. Coverage + docs

- [x] 5.1 Coverage map: new `rank-progression` component (logic/actors/prisoner.asm routines
      ported vs text/special todo; IncRescued/IncClassLv/UpdateLevels/DowngradeRank/
      KillPrisoner/KillPrisoner2 extras; SetMaxAmmoVals → done minus cheats). Regenerate.
- [x] 5.2 SESSION-STATE: rank shipped (demo prisoner divergence, texts/capture out of scope),
      gaps list updated, export instructions + check counts.

## 6. Feedback fixes (from the first manual pass)

- [x] 6.1 Rescue text balloon: minimal `SetText`/GAME_MODE_TEXT_BOX port — play pauses, a
      bottom window prints "RESCUED!" per character with the decoded "Text print" SFX (0x22,
      new textprint.wav), Fire/punch completes then dismisses. Divergence-flagged (ROM text
      table/paging unported). Covered by 5 new rank-suite checks.
- [x] 6.2 Text cadence faithful: print one character only when `TickCounter & 3 == 0`
      (TW_PrintChar3, Banks0123.asm:7994 — every 4 frames on the free-running counter, which
      gives the slightly irregular feel), SFX corrected to 0x23 (TW_PrintChar6; 0x22 is the
      incoming-call sound), no sound for spaces. Covered by a cadence check. Dismiss keys
      faithful: M (Fire2) or Enter (RET) per TW_PrintChar/TW_Wait — Space is not a text key.
- [x] 6.3 Navigation: the pause overlay (P) now shows the current ROOM number; new
      `Tools/check-graph.mjs` (footprint-aware room-level reachability) verifies every demo
      prisoner/item room is walkable from room 0 and documents the cluster map (5-9 and 6-7
      edges are walled; 9 via 10, 7 via 3 or the lock-5 doors) in SESSION-STATE.md.
- [x] 6.4 Room-8 prisoner was in an unreachable pocket (reported in play): check-graph.mjs
      upgraded to GLOBAL position-level reachability (fixpoint across rooms from Snake's
      spawn, footprint-aware, edges + matching-id doors); the prisoner moved to room 8's
      reachable bottom-left area, and BOTH suites (rank/items) now validate every demo
      placement against the global mask instead of a local floor check.

- [x] 6.5 "Keycards not working" (reported): verified end-to-end with a new
      `web/doors.headless.mjs` (5 checks: CARD4 opens the lock-5 door; no card / wrong card
      (CARD5) / owned-but-not-selected stay shut; lock-L -> card-(L-1) mapping). The system
      works — the trap was that ALL cluster card doors are lock 5 = CARD4 while the demo also
      hands out CARD5 (which fits the water rooms' lock-6 doors); documented in game.js +
      SESSION-STATE, along with the corrected route (6's main floor, 10 and 9 are only behind
      room 7's card doors).

## 7. Manual verification

- [x] 7.1 Interactive pass: rescue 5 demo prisoners → rank-up jingle, 2 stars, full 32 bar,
      crates now stack to 100; shoot a prisoner → rank-down sting, clamped bar, regulars back
      in their rooms; die and confirm the rank survives the restart.
