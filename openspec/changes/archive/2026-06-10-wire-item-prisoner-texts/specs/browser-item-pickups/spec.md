# browser-item-pickups delta — the Western pickup-description gate

## ADDED Requirements

### Requirement: Pickup descriptions follow the Western ROM gate

After a pickup that empties the room of items (the ROM shows descriptions only for the LAST
item taken, logic/items.asm:399-401), the game SHALL run the ROM's description path: look up
the pickup's text id in `ItemTakeText` (data/itemtaketextid.asm; 0/255 = none), then apply
the **non-Japanese gate** (logic/items.asm:409-413): only text 62 — "I took back the weapon
and equipment", the post-capture recovery — may show; every other description SHALL be
suppressed, exactly as the Western ROM does (its disassembly marks this as a BUG/LIMITATION
versus the Japanese version). With no capture flow in this slice, all normal pickups are
therefore silent BY PORTED LOGIC, and text 62 lights up when the capture flow lands.

#### Scenario: Normal pickups stay silent

- **WHEN** Snake picks up a weapon or item (the room's last or not)
- **THEN** no description text window opens (the Western gate suppresses it)

#### Scenario: The table and gate are real

- **WHEN** the pickup-text lookup runs for known pickups
- **THEN** it resolves the ROM's ids (handgun → 16, card1 → 11, ration → 8) and the gate —
  not a missing feature — is what suppresses them
