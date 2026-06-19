# Design — intro scene

## Context

`IntroSceneLogic` (logic/introscene.asm) is a 13-state scripted sequence dispatched from
`PlayerControlLogic` as control mode CONTROL_INTRO (8); init at Banks0123.asm:8422-8438
(room 121, Snake (0xC0,0xB8), deep-water animation 4, speed 0x100, IntroSceneCnt 0x40).
The scripted moves feed the NORMAL collision-checked movement (IntroSceneControls), while
the fence climb is done with literal Y snaps (0x88, then 0x66) that cross the solid fence
band of room 121 (rows 0x68-0x80) — verified against 121.collision.json.

## Decisions

1. `gameState 'intro'` rather than a real CONTROL_INTRO branch: the existing game-state
   dispatch in update()/draw() is where every other scene (title, capture, elevator) lives;
   the intro tick owns Snake exactly like IntroSceneLogic owns PlayerControlLogic. Input is
   dropped at the keydown layer (the ROM ignores ControlsNew in mode 8).
2. The radio overlay reuses the REAL radio screen: `introRadio` latches while the scripted
   call runs (DrawRadio → RadioSignalUp → text 2 → ExitRadio), driving the same
   radioState/radioLedCnt/drawRadioScreen the transceiver slice ported — no duplicate UI.
   The LED climb is paced on the ROM iteration boundary like radioTick.
3. The ring follows DrawCallTimer's cadence (SFX 0x22 when callTickCounter ≡ 0 mod 16, the
   bit-3 blink) by advancing callTickCounter inside the intro wait state — chkIncomingCall
   doesn't run outside play, and the one-shot alternative would diverge from the ROM's
   repeating ring.
4. `ChkSaveGameStatus` is reduced to its observable effect: the landing spot is stored and
   restart() respawns there (room 121) instead of the dev spawn. The ROM's full save-game
   block (rank, inventory snapshot) already matches our restart semantics (both are kept).
5. The dev hooks (?room/#auto/?capture) bypass the title AND the intro — they jump straight
   to play as before; only the title's Fire start enters the intro.

## Risks

- [The swim path depends on room 121's water collision] → the suite drives the real
  collision JSON through all 13 states and asserts the scripted snaps; the visual pass
  happens in the user's batch playtest.
