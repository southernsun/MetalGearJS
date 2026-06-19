# browser-text-system — the ROM text table + text-window engine

## ADDED Requirements

### Requirement: ROM texts are exported and decoded from the text table

The game's texts SHALL come from the ROM text table (`idxTexts`, data/texts.asm, non-Japanese),
decoded by an exporter that ports the text-window unpacker: dictionary bytes (≥ 0x80) expanded
to their words, 0x00 = space, 0x41+ = characters (0x97 = apostrophe, half width), 0xFE =
newline, 0xFD = page wait, 0xFF = end, and the leading window-config byte captured. The export
(`texts.json`) SHALL structure each text as pages of lines. Hand-written text strings SHALL NOT
stand in for texts that exist in the table.

#### Scenario: The mission briefing decodes correctly

- **WHEN** texts.json is generated
- **THEN** text 3 reads "THIS IS BIG BOSS... MISSION! GAIN ACCESS TO THE ENEMY'S FORTRESS,
  OUTER HEAVEN." with a page break before "TAKE ACTION NOT TO BE DISCOVERED BY THE ENEMY.
  ...OVER" (matching the disassembly's inline comment), and text 10 reads "THIS IS SOLID
  SNAKE... YOUR REPLY, PLEASE."

### Requirement: The text window prints with the ROM engine semantics

The text window SHALL print decoded texts character by character at the ROM cadence
(`TW_PrintChar`, Banks0123.asm:7952: one character when `TickCounter & 7 == 0`, in ROM
iterations), playing the print SFX (0x23) for every non-space character, advancing 8px per
character (4px for the apostrophe), wrapping at the window's right edge, pausing at page
waits for a key, and ending into the wait-for-dismiss state. The ROM skip keys (M / Enter)
SHALL complete the current page instantly when the text is skippable (`SkipTextMode` 0).

#### Scenario: Char-by-char with print SFX

- **WHEN** a text plays
- **THEN** characters appear one at a time at the ROM cadence with the print SFX per visible
  character, and spaces are silent

#### Scenario: Page wait

- **WHEN** the printer reaches a page-wait control
- **THEN** printing pauses until a dismiss key, then the window clears and the next page prints

#### Scenario: Skip completes the page

- **WHEN** the player presses a skip key mid-print of a skippable text
- **THEN** the current page completes immediately rather than character by character
