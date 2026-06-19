# browser-madnar Specification

## Purpose
TBD - created by archiving change madnar. Update Purpose after archive.
## Requirements
### Requirement: Dr. Madnar's dialogue follows the Ellen gate

Room 182's Dr. Madnar SHALL rescue like a prisoner, with text 124 ("save Ellen first") until Ellen is rescued and text 125 (the Metal Gear briefing) after.

#### Scenario: The gate

- **WHEN** Snake reaches Madnar before rescuing Ellen
- **THEN** the doctor refuses to talk shop; after Ellen, the briefing follows

### Requirement: The fake doctor springs his trap

Room 189's Fake Madnar SHALL wait in the prisoner pose; touching him triggers the unskippable text 109, opens a pitfall at (0x80,0x60), and removes him forever.

#### Scenario: The trap

- **WHEN** Snake "rescues" the double
- **THEN** the taunt plays, the floor opens, and the fake never reappears

