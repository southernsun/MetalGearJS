# browser-text-system Specification

## Purpose
The ROM text pipeline: the dictionary-compressed text table decoded offline to data
(texts.json), and the text-window engine that plays it — print cadence, SFX, wrapping,
paging, skip keys, per-type window geometry. Other systems (radio, prisoners, item pickups)
trigger texts by id through this capability.
## Requirements
### Requirement: ROM texts are exported and decoded from the text table

The game's texts SHALL come from the ROM text table (`idxTexts`, data/texts.asm, non-Japanese,
**1-based** ids — `GetText` Banks0123.asm:5274), decoded by an exporter that ports the
text-window unpacker (`DecodeText`/`AddDictEntry`, Banks0123.asm:5305/5352): dictionary tokens
(bytes ≥ 0xA1) expanded from `idxDictionary` (0xFF-terminated verbatim entries, which may embed
newlines; no nesting), 0x00 = space, other bytes < 0xA1 = font character codes (custom
punctuation — 0x3D '!', 0x5C/0x5E '.', 0x5F/0x60 ',', 0x97 = half-width apostrophe), 0xFE =
newline, 0xFD = page wait, 0xFF = end, and the leading `TextBoxType` byte captured (low nibble
= window type 0-4, high nibble = show the page prompt icon). The export (`texts.json`) SHALL
structure each text as pages of lines holding the RAW ROM char codes (they index font.png
directly — lossless). Hand-written text strings SHALL NOT stand in for texts that exist in
the table.

#### Scenario: The mission briefing decodes correctly

- **WHEN** texts.json is generated
- **THEN** text 3 reads "THIS IS BIG BOSS... MISION! GAIN ACCESS TO THE ENEMY'S FORTRESS,
  OUTER HEAVEN." with a page break before "TAKE ACTION NOT TO BE DISCOVERED BY THE ENEMY.
  ...OVER" (matching the disassembly's inline comment, ROM typo included), and text 10 reads
  "THIS IS SOLID SNAKE... YOUR REPLY,PLEASE."

#### Scenario: The prisoner rescue text is real

- **WHEN** a prisoner is rescued
- **THEN** the window shows text 131 ("RESCUED") from the table, not a hardcoded string

### Requirement: The text window prints with the ROM engine semantics

The text window SHALL print decoded texts character by character at the ROM cadence
(`TW_PrintChar`, Banks0123.asm:7952: one character per `TickCounter & 3 == 0` ROM iteration —
the STAFF roll uses mask 7; iterations are ~half the 60Hz frame rate, see the call-system
pacing), playing the print SFX (0x23) for every non-space character, advancing 8px per
character (4px for the apostrophe), +12px per line (`TW_PrintNewLine`), wrapping when X passes
`TextX + TextNX − 8`, pausing at page waits, and ending into the wait-for-dismiss state. The
window SHALL be drawn at the per-type ROM geometry (`TextBoxXYSize`/`TextXYSize`,
Banks0123.asm:8374-8387) as a black box **with the white `DrawRect` frame** (`DrawTextBoxIn`,
logic/textboxappear.asm:58-62; `TextBoxEffectDat` colour 0x0E). While waiting on a non-final
page with the prompt nibble set, the enter icon (char 0x3F) SHALL blink at `PromptXY`
(`DrawEnterIcon`, TickCounter bit 4); text 10 SHALL instead auto-advance after 0x60 iterations
(`TW_Wait`, Banks0123.asm:8175).

#### Scenario: Char-by-char with print SFX

- **WHEN** a text plays
- **THEN** characters appear one at a time at the ROM cadence with the print SFX per visible
  character, and spaces are silent

#### Scenario: Page wait with the prompt icon

- **WHEN** the printer reaches a page-wait control on a prompt-flagged text
- **THEN** printing pauses with the enter icon blinking at PromptXY until a dismiss key, then
  the window clears and the next page prints

#### Scenario: Skip jumps to the next page

- **WHEN** the player presses a skip key (M/Enter) mid-print
- **THEN** the partially printed page is discarded and the NEXT page begins (or the window
  closes on the last page) — `SkipText` erases the text area; it does NOT finish the current
  page (that instant-print loop exists only in the Japanese ROM's item texts)

#### Scenario: Snake's call-out self-dismisses

- **WHEN** text 10 finishes printing
- **THEN** it closes by itself after the ROM wait (no key needed)
