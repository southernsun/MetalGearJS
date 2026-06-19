# Intro scene — the scripted infiltration

## Why

Starting from the title currently drops Snake straight into play. The ROM plays
`IntroSceneLogic` (logic/introscene.asm) first: Snake swims into the shore of room 121 on
his own, Big Boss calls him on the transceiver ("OPERATION INTRUDE N313", text 2), and he
climbs the perimeter fence and hops down — only then does the player get control, and that
landing spot becomes the death checkpoint (`ChkSaveGameStatus`).

## What Changes

- `titleStartGame()` starts the intro instead of play: room 121, Snake at (0xC0,0xB8) in
  deep water, control mode CONTROL_INTRO, counter 0x40 (init Banks0123.asm:8422-8438).
- The 13 `IntroScene*` states are ported on the per-tick pacing convention: two dive legs
  left (0x40, 0x50) with surfacing waits (0x30, 0x40-with-call), a north leg (0x20), the
  incoming call at count 0x20 (RadioCallFlag=1, the DrawCallTimer ring cadence), the radio
  opening with the 12-LED `RadioSignalUp` climb, text 2 over the radio UI, `ExitRadio`,
  the swim to the fence (2px legs 0x28/0x30), the scripted climb snaps (Y 0x88 with the
  ladder animation, then Y 0x66), the `BounceOffsets` landing hop (0x0C), and the handoff
  to play with the checkpoint saved.
- `restart()` respawns at the intro checkpoint in room 121 once the intro has run; the dev
  hooks (`?room`, `#auto`, `?capture`) keep bypassing the intro entirely.
- Player input is inert during the intro (CONTROL_INTRO ignores the controls); the text-2
  page dismiss works through the normal text mode.

## Capabilities

### New Capabilities

- `browser-intro-scene`: the scripted infiltration between the title and play.

### Modified Capabilities

- `browser-title`: starting now leads into the intro scene, not directly into play.

## Impact

- web/game.js (the intro state machine + wiring in update/draw/input/restart);
  web/title.headless.mjs grows the intro section (23 checks total); no new assets —
  room 121, the radio UI, text 2 and the snake water/ladder frames all shipped earlier.
