# Design — wire the prisoner and item-pickup texts

## Context

ROM behaviour, verified:

- **Prisoner rescue** (`PrisonerRescued`/`RescuedLogic3`, logic/actors/prisoner.asm:216-260):
  on rescue, the text id comes from the room — room 167 → text 129 (Ellen, `ld b,81h`),
  room 193 → `ChkRescJenBro` (actor Y == 0x54 → text 140 Jennifer's brother + rescued flag,
  else 131), otherwise a linear scan of `PrisonerTexts` (19 `db room, textId` pairs,
  :271-289). A room not in the table returns without text or rescue credit — unreachable in
  the ROM (prisoners only exist in listed rooms).
- **Item pickup text** (`ErasePickedItem3` tail, logic/items.asm:399-414): only when the
  taken item was the room's LAST item (`TempData2` check), look up `ItemTakeText[id-1]`
  (data/itemtaketextid.asm — e.g. handgun→16, card1→11, ration→8; 0/255 = none); then the
  `IF (!JAPANESE)` gate returns unless the text is 62 ("I took back the weapon and
  equipment") — the Western ROM shows no other description (commented in the disassembly as
  a BUG/LIMITATION). Text 62 fires for the equipment-recovery pickup after capture.

Our port: rescue currently calls `setText(131)` flatly; pickups show nothing (by accident
rather than by ported logic). The DEMO prisoners sit in cluster rooms 3/5-9 — outside the
ROM table — as an existing documented divergence.

## Goals / Non-Goals

**Goals:**
- Rescues show the ROM's per-room dialogue through the real lookup chain.
- The pickup-text path exists with its Western gate, byte-for-byte citable, so capture-flow
  work later only has to set the stage, not build the plumbing.

**Non-Goals:**
- The capture flow itself (text 62's trigger), Madnar/Ellen special actor logic beyond the
  text id, the Japanese all-descriptions variant, prisoner texts for rooms we don't export.

## Decisions

1. **Tables inlined with citations** (like `PLAYER_IN_DOOR_DAT`): `PRISONER_TEXTS` (19
   pairs) and `ITEM_TAKE_TEXT` (35 entries) are small cited constants in game.js — no
   exporter needed; texts.json already holds the bodies.
2. **Demo prisoners get real table texts via a separate demo map.** The faithful lookup
   (167/193 specials + `PRISONER_TEXTS`) runs first; only when the room misses (exactly our
   demo rooms 3/5-9) a `DEMO_PRISONER_TEXTS` map assigns each room a REAL text id from the
   table set — surfacing actual dialogue variety (28 "I'M SAVED!", 27 Diane's frequency,
   90 Pettrovich moved, 54 isolated-cell tip, 52 Grey Fox confined, 131 RESCUED) — flagged
   as part of the existing demo-prisoner divergence. Alternative (all rooms → 131) shows
   nothing of the system; rejected.
3. **Pickup gate ported as the ROM shapes it**: last-item check → table lookup → 0 means
   silent → Western gate `text !== 62 → return` → `setText`. In this slice the gate always
   returns (no capture flow grants the recovery pickup), which IS the Western behaviour for
   every normal item.

## Risks / Trade-offs

- [Demo text ids reference systems we lack (e.g. Diane's frequency tip mentions calling
  her)] → they're flavour only; the radio exists, and Diane simply doesn't answer (her
  reply gates are inert) — consistent with the demo nature.
- [`ITEM_TAKE_TEXT` indexing is by pickup id (`GET_HL_A_DEC` = 1-based)] → assert the known
  anchors in the suite (handgun→16, ration→8, card1→11) to catch off-by-one.

## Open Questions

- None.
