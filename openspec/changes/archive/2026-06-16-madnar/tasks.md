# Tasks — Madnar

## 1. Survey + implementation

- [x] 1.1 fakemadnar.asm (the 4-state trap), the Ellen-gated texts (124/125 verified in
      texts.json), TouchPlayer's Madnar/fake exemptions
- [x] 1.2 game.js: Madnar as a prisoner with the gated text; the fake's trap system

## 2. Checks

- [x] 2.1 madnar.headless.mjs: 7 checks — all suites green
- [ ] 2.2 User batch playtest (end of run)

## 3. Playtest fixes (2026-06-12)

- [x] 3.1 Both Madnars draw the REAL SprMadnar (loaded at the prisoner patterns,
      SprSetMadnar): madnar.png in the prisoner atlas via ExportPrisoner — torso 0Dh
      tan + CC 0Eh white, coat/legs 0Eh white + 0Bh gray (ActorSprColors15/16 under
      SprsetPal7), overlaps black; rooms 182 (the prisoner swap) and 189 — was the
      regular prisoner sheet
- [x] 3.2 The trap staging matches FakeMadnadLogic: touch -> the freed pose; SPEAK
      (text 109) the next iteration; the pitfall + its open SFX only on the iteration
      AFTER the text closes (the SFX had played at touch, under the text); then he
      SINKS 1px/iteration for 0x10 and is dismissed — Madnar dropping into the hole IS
      original (SetActorSpeedY 0x100); suite restaged (8 checks)
