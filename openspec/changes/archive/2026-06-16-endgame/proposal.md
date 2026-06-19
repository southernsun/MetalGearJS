# The endgame — the destruction countdown + the radio event flags

## Why

The final act: Metal Gear's death starts the base's self-destruct, the countdown owns the
HUD slot, cigarettes buy time, and the radio messages drive the late-game event flags.

## What Changes

- THE COUNTDOWN (BossDefeatedLogic:13388-13401 + DecNukeTimer + DrawDestrucTimer): Metal
  Gear's destruction arms DestructionTimerOn with 3000 units (0x3000 BCD), ticking every
  iteration in every mode; the red digit count takes over the CALL-sign slot (120,193);
  zero kills Snake with the base. CIGARETTES used during the countdown add 2000 units
  and are consumed (ChkUseCigarettes) — finally giving the starting smokes their purpose.
- THE RADIO EVENT FLAGS (TextBoxExit, Banks0123.asm:8301-8324): READING text 117 sets
  Jennifer's rocket promise, 118 sets JeniOpenDoorF (the lock-13 compass door now opens
  through her call), 138 marks Schneider captured.
- THE ESCAPE: the existing escape-ladder banner stands in for the ending screens (the
  full GS_Ending cinematics are documented out of scope); the true run is: bomb order ->
  the countdown -> Big Boss -> the lock-14 escape door -> the ladders out.
- BCD ammo display: documented as display-equivalent (our integer counters render the
  same digits the ROM's BCD does); not changed.

## Capabilities

### New Capabilities

- `browser-endgame`: the countdown + the event flags.

## Impact

- web/game.js; endgame.headless.mjs (7 checks).
