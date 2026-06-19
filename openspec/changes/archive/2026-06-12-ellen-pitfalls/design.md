# Design — Ellen's cell

## Context (verified)

- Door id 106 (rooms 166 ⇄ 167, render types 15/14) has lock 16 in IdDoorsLogic;
  `ChkOpenDoor`'s dispatch (opendoor.asm:28-43, lock−1 indexed): ...10 ChkPunchDoor,
  11 lorry, 12 desert, 13 compass, 14 ChkBigBossDoor, 15 ChkPrisonWalls,
  16 ChkBasementWall. The weapons slice keyed chkBombWalls on 14 — wrong; corrected.
- Room 166's actors: ID_HELPME_VOICE (ChkSayHelpMe, prisoner.asm:105 — text 128
  unskippable, first after 2 iterations then every 0xC0) + ID_PITFALL at (0xA0, 0x60).
- Pitfall (pitfall.asm + logic/actors/pitfall.asm): trigger ±40px both axes; the hole
  grows +2/iteration to 0x40 with SFX 7; inside ±size/2 of the centre = DecrementLife_B
  with 0xFF (all life, immediate). Room 190's pre-opened variant is out of the world.
- Room 167: ID_ELLEN at the standard spot; colours ActorSprColors14 = both pairs
  0Dh + CC|0Bh (tan + dark red, SprsetPal8); sheet SprElen (10 sprites, the prisoner
  layout). prisonerTextId already special-cases 167 → 129.
- The route: 54 → 55 → 56 (edges); 55's south door (id 14, lock 7 = CARD6) → 166.
  CARD6 isn't placed in the exported world yet — the room is gated until a later zone
  (or the dev places the card via the menu hooks); documented.

## Decisions

1. Pitfalls/help-me ride actors.json (the exporter grew both + fixed ID_ELLEN's
   spelling); per-room state rebuilt on entry like all actor systems.
2. The pit kills through `damage(0xFF)` with the i-frames cleared first — the ROM calls
   DecrementLife_B directly, bypassing the DamageDelayTimer.
3. The hole art: a shaded black square grown per the ROM's size counter (GfxPitfall's
   12-tile rim art approximated — noted; everything mechanical is exact).
4. Ellen reuses the prisoner pipeline with a third sheet, like Grey Fox.

## Risks / Trade-offs

- [CARD6 gating] → faithful; the card arrives with a later zone's items.
- [Pit art approximation] → geometry/lethality exact; revisit if the look jars.
