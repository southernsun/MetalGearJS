## 1. Prisoner rescue texts (PrisonerRescued / PrisonerTexts)

- [x] 1.1 Port the rescue text lookup into the prisoner rescue path in web/game.js,
      replacing the flat `setText(131)`: room 167 → 129 (Ellen), room 193 → 140/131 by the
      prisoner's Y (`ChkRescJenBro`, Y == 0x54), else the verbatim `PRISONER_TEXTS` table
      (19 pairs, logic/actors/prisoner.asm:271-289, cited)
- [x] 1.2 Add the `DEMO_PRISONER_TEXTS` map for cluster rooms 3/5-9 using real table ids
      (90, 52, 54, 27, 28, 131), documented as part of the existing demo-prisoner
      divergence; all referenced ids verified present in texts.json

## 2. Item-pickup description gate (ItemTakeText)

- [x] 2.1 Port `ITEM_TAKE_TEXT` (data/itemtaketextid.asm, 35 entries, 1-based pickup-id
      index) and the description path into chkTakeItems: only when the room's LAST item was
      taken → table lookup (0/255 = none) → the `IF (!JAPANESE)` gate (only text 62 may
      show, logic/items.asm:409-413, BUG/LIMITATION comment cited) → setText
- [x] 2.2 Verify the index anchors against the pickup ids (handgun → 16, card1 → 11,
      ration → 8) — asserted in items.headless.mjs

## 3. Checks + docs

- [x] 3.1 rank.headless.mjs (30 checks): demo room 5 → text 52; table room 159 → 27;
      Ellen 167 → 129; room 193 Y 0x54 → 140 / other Y → 131
- [x] 3.2 items.headless.mjs (31 checks): last-item and non-last pickups stay silent
      (Western gate, not absence); anchors resolve; forced text-62 passes the gate
- [x] 3.3 All suites pass — 239/239 across 10 suites; check-graph clean; SESSION-STATE
      updated (texts-wiring gap closed; capture flow noted as text 62's unlock) and
      rom-coverage regenerated
