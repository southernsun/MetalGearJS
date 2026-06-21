# Project instructions

## The disassembly lives in a sibling repo

This repo is the JavaScript/web port only. The original MSX disassembly (the `.asm` sources —
`constants/`, `data/`, `gfx/`, `logic/`, `sound/` — and the `room_images/` reference
screenshots) lives in a **separate repo**, [southernsun/MetalGear](https://github.com/southernsun/MetalGear)
(a fork of [GuillianSeed/MetalGear](https://github.com/GuillianSeed/MetalGear)), expected to be
cloned as a **sibling** of this repo at `../MetalGear`. The export scripts read it from there
(override with the `MG_ROM_DIR` env var). When these instructions say "read the `.asm`", they
mean those files in `../MetalGear`.

## ROM faithfulness

- **Always mimic the actual ROM/disassembly code — never substitute our own interpretation.**
  This is a port of Metal Gear (MSX); behaviour, constants, and logic must come from the
  original `.asm` sources (in `../MetalGear`: `logic/`, `data/`, `gfx/`, `sound/`), not from
  what seems reasonable.
- Before implementing or changing a behaviour, **read the relevant `.asm` routines first**
  (in the sibling `../MetalGear` disassembly) and port their actual logic (state machines,
  counters, formulas, magic numbers). Cite the source routine/file/constant in a comment next
  to the ported code.
- A **divergence is only acceptable when the ROM logic genuinely cannot be reproduced** here
  (e.g. a prerequisite system doesn't exist yet, or a value has no faithful equivalent). When
  that happens, keep it minimal, call it out explicitly in a comment, and note it as a
  deliberate divergence in the change's tasks/notes.
- If unsure how the original behaves, **investigate the disassembly rather than guessing** — an
  approximation that "feels right" but doesn't match the ROM is a bug, not a shortcut.
- **When porting/changing a behaviour, read the surrounding code on BOTH sides — don't fix in
  isolation.** In the `.asm`, read the whole routine and what it calls/sets, not just the one line
  you're matching: adjacent setup, side effects (flags/timers/text), and callers/callees often
  carry behaviour that belongs with the change. In the JS port, check the surrounding code path
  (callers, the state machine around the edit, related helpers) so the change integrates correctly
  and nothing implied by the ROM is missed. A faithful one-liner that ignores the context around it
  is how bugs slip in.

## Git

- **The user always commits themselves. Never run `git commit` (or `git push`).** Make and
  stage changes as needed, but leave committing to the user.
