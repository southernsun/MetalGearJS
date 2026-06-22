# GitHub Issues — Fix Spec

Spec for addressing the three open GitHub issues filed via the in-game bug-report key (`B`).
Source investigation done against `web/game.js` and the MSX disassembly in `../MetalGear`.

| # | Title | Type | Root cause found? | Risk |
| --- | --- | --- | --- | --- |
| 4 | Bug-report form doesn't pause the game (room 138) | UX bug | Yes — definite | Low |
| 3 | "I'm sleepy" text not displayed (room 138) | ROM-faithfulness gap | Yes — definite | Low |
| 2 | Everything slows down after a long time in one room (room 5) | Perf bug | No — needs repro/profiling | Medium |

Recommended order to work through them: **#4 → #3 → #2** (cheapest and most certain first;
#2 is the only one that needs a reproduction/profiling pass before any code changes).

---

## Issue #4 — Bug-report form should pause the game

### Behaviour
Pressing `B` freezes the last ~20s clip and opens the `#report-form` DOM overlay for the user to
type a description. While the user types, the simulation keeps running underneath the form — guards
move, bullets fly, Snake can be hit. It should pause until the form closes.

### Root cause
`showBugForm()` (`web/game.js:3021`) only sets `bugFormOpen = true` and calls `held.clear()`. It
never touches the sim gate. The form is a pure DOM overlay; `update()` keeps running full
`PlayModeLogic`. Clearing `held` stops Snake responding to input, but everything else (guards,
bullets, damage) keeps ticking.

### How pausing already works in this codebase (reuse, don't invent)
- Global `paused` flag — `loop()` returns early when set (`web/game.js:7447`). `togglePause()`
  (`web/game.js:7458`) is the reference: on pause it calls `redrawStatic()`; on resume it resets
  `last = 0; acc = 0;` and re-issues `requestAnimationFrame(loop)` (the loop must be restarted
  because it stops itself while paused).
- `gameState` machine — menu/radio/text states make `update()` early-return into their own tick
  and skip `PlayModeLogic` entirely (`web/game.js:6482-6484`).

The `paused` flag is the right tool here: the form is modal and we want a hard freeze, not a new
game state.

### Fix
1. In `showBugForm()` (after `bugFormOpen = true`, `web/game.js:3030`): set `paused = true`.
2. In `closeBugForm()` (after `bugFormOpen = false`, `web/game.js:3037`): clear `paused` and
   restart the loop the same way `togglePause()` does — `last = 0; acc = 0;
   requestAnimationFrame(loop);`. `closeBugForm()` is the single choke point for cancel and submit
   (both call it), so resuming there covers every exit path.

### Notes / edge cases
- Input isolation already exists: the form `stopPropagation()`s keydown/keyup
  (`web/game.js:3013-3018`), so game keybindings can't fire while typing. No extra input handling
  needed.
- The B handler already early-returns when `paused && gameState === 'play'`
  (`web/game.js:3103`), so it won't re-trigger while the form (now paused) is open.
- Avoid drawing the "PAUSED — ROOM n" dev overlay under the form. `togglePause` paints it via
  `redrawStatic()/paintHUD()`; the bug-form path should set `paused` **without** that call (the form
  covers the canvas anyway), or guard `paintHUD` so it only shows for the manual pause.
- Edge case to keep in mind (not necessarily fix now): clicking the on-screen Pause button while
  the form is open could desync the flag. Low priority.

### Acceptance
With the form open: guards, bullets, animations frozen; Snake cannot take damage. Cancel and submit
both resume the sim cleanly with no speed glitch on the first frame back.

---

## Issue #3 — "I'm sleepy" text not displayed

### Behaviour
A sleepy guard should print the unskippable text "I'M SLEEPY" when it dozes off. The web port never
shows it. Room 138 has a sleepy guard, hence the report.

### ROM source (the behaviour to mimic)
- `../MetalGear/logic/actors/guard.asm`, routine `ChkSleepyGuard`: on the awake→asleep transition it
  loads text id `33` and calls `SetTextUnskippable` (the "I'm sleepy" message).
- `../MetalGear/data/texts.asm`: `txtSleepy` = text id **33**, string "I'M SLEEPY".
- Sleepy guards exist in rooms 26, 85, 138 (per the port's `actors.json`).

### Current state of the port
- The text system exists: `setText(id, mode)` (`web/game.js:769`); `texts.json` already contains id
  33; mode `2` is the unskippable/auto-advance mode matching `SetTextUnskippable`.
- The sleepy-guard state machine is implemented in `updateGuardOne()` — the awake→asleep transition
  is at `web/game.js:5004-5006`.
- `setText(33, 2)` is **never called anywhere** in the port. The feature is simply missing at the
  doze-off transition.

### Fix
Add the ROM's text call at the awake→asleep transition (`web/game.js:5004`), with a source comment:

```js
} else if (--guard.awakeTimer <= 0) {        // ChkSleepyGuard: AwakeTime elapsed -> doze off
  setText(33, 2);                            // TEXT 33 "I'M SLEEPY" via SetTextUnskippable (guard.asm ChkSleepyGuard)
  guard.asleep = true; guard.sleepTimer = SLEEPY_SLEEP_TICKS; guard.zzzFrame = 0; guard.zzzTimer = 0;
  guard.dir = 'down'; return;
}
```

### Open questions to confirm against the ROM during implementation
- **Initial sleep:** the room-138 guard *starts* asleep (`actors.json` `"sleeping":true`). Confirm in
  `ChkSleepyGuard` / `InitGuard` whether the ROM shows the text on the initial sleep too, or only on
  subsequent doze-offs after waking. The fix above fires on every doze-off; if the ROM also shows it
  at init we may need a second call (or to not pre-set `asleep`). This decides whether the reporter
  sees the text immediately on entering room 138 vs. only after the guard cycles.
- **State interaction:** `setText` switches `gameState` to `'text'` (pausing play). Confirm a guard
  dozing off mid-play correctly enters/exits the text box without stranding guard state, and that it
  doesn't fire while already in a non-play state.

### Acceptance
Entering a room with a sleepy guard and watching it doze off shows the unskippable "I'M SLEEPY" text
box, matching ROM timing.

---

## Issue #2 — Slowdown after a long time in one room

### Behaviour
"After leaving the game open for a long time, everything slows down — guards walk slower and don't
detect Snake anymore." Reporter follow-up: "happens when staying in the SAME room for a long period;
switching rooms (with another guard) seems normal again." Observed in room 5.

### What static analysis ruled OUT
The loop is a fixed-timestep accumulator (`web/game.js:7444-7455`, `TICK_HZ=60`), so a real-time
slowdown means `update()×k + draw()` can no longer fit 60 logical ticks into a wall-clock second —
i.e. per-frame work grew, RAF is being throttled, or the machine is under memory/GC pressure. We
checked the usual culprits and they're clean:
- **No per-frame timers/listeners/RAF leak.** Single RAF chain; the only `setInterval`/`setTimeout`
  are the bug-recorder windows and toast, all created once (`web/game.js` grep of
  `setInterval|setTimeout|addEventListener|requestAnimationFrame`).
- **No unbounded arrays.** `dirRecency` dedups before push (bounded ≤4). Bullets/shots/effects are
  room-scoped and reset on `setRoom`. Reinforcement guards are capped: respawn bails at
  `guards.length >= 3..4` (`web/game.js:4796`); `killGuard` splices (`web/game.js:5734`).
- **Guard AI counters are bounded/wrapping.** `tickCounter` is masked `& 0xff`
  (`web/game.js:6480`); patrol/alert/sentinel/sleepy counters reset each cycle. No drift that would
  make a guard's actions progressively rarer.
- **Audio nodes are fire-and-forget** `BufferSource`s (`playBuf`, `web/game.js:2759`) that the
  browser releases on end; tracked loops (music/ring/alert) are stopped on transition.
- **Bug-recorder chunks are bounded** — reset every 40s window (`web/game.js:2955`), so they don't
  grow without limit.

So there is **no statically-provable single root cause.** This one needs a reproduction + profiling
pass before writing a fix — guessing here would violate the ROM-faithfulness / no-approximation rule.

### Leading hypotheses (to confirm by profiling)
1. **Continuous `canvas.captureStream(30)` + dual `MediaRecorder` cost over long sessions.** The bug
   reporter encodes the canvas at 30fps the entire time the page is open
   (`web/game.js:2948-2971`), independent of room. Long sessions can grow encoder/GC pressure; a
   room switch forces a full rebuild/redraw that can mask or transiently clear it — consistent with
   "seems normal again." **Quick test:** reproduce with the bug reporter disabled
   (`initBugReporter` no-op) and see if the slowdown disappears.
2. **Browser background/occluded-tab throttling.** "Leaving the game open for a long time" often
   means the tab lost focus; Chrome throttles RAF (~1fps) and timers when hidden. The `acc>250` clamp
   (`web/game.js:7451`) should let it recover on refocus, so this is secondary — but worth ruling
   out by reproducing with the tab kept focused.
3. **Long-session memory growth / GC pressure** from some accumulating reference not visible in a
   static read (detached blobs, retained DOM, audio graph). Confirm with a heap timeline.

### Plan
1. **Instrument first.** Add a lightweight dev perf HUD (toggle via a `?perf` query hook, matching
   the existing `?alert`/`?red`/`?collision` dev hooks at `web/game.js:4971-4973`): show measured FPS,
   `update()`/`draw()` ms (via `performance.now()` deltas), guard count, and `performance.memory`
   heap if available.
2. **Reproduce** by leaving a guard room (e.g. room 5) open and watching the HUD until slowdown
   appears. Capture a Chrome DevTools Performance + Memory timeline at that point.
3. **Bisect the hypotheses** with the quick tests above (reporter off; tab kept focused).
4. **Fix the confirmed cause**, then re-verify with the HUD that frame time stays flat over a long
   session. Likely shapes of fix depending on the result: throttle/limit the recorder, or pause
   `captureStream` when not needed, or fix whatever the heap timeline shows growing.

### Acceptance
With the perf HUD, frame time and heap stay flat over a multi-minute session parked in one guarded
room; guards keep moving at constant speed and keep detecting Snake.

---

## Cross-cutting notes
- Per CLAUDE.md, all gameplay behaviour must be ported from the `../MetalGear` disassembly with a
  source citation in a comment. #3's fix cites `ChkSleepyGuard`. #4 and #2 are
  harness/web-port concerns (pause UX, browser perf) with no direct ROM equivalent — note that
  explicitly where relevant.
- The user commits; do not run `git commit`/`git push`.

---
---

# Second batch (#5, #6, #7)

| # | Title | Type | ROM equivalent? | Effort |
| --- | --- | --- | --- | --- |
| 7 | Binoculars don't work as per original (room 8) | ROM-faithfulness gap (feature missing) | Yes — full `BinocularMode` | Medium-large |
| 6 | Replace start screen with a metallic look (keep Konami scroll) | Web-port UX | No (gate is a browser-audio concern; the Konami/MG boot IS ROM-faithful and is preserved) | Small-medium |
| 5 | Phone / mobile support | Web-port feature | No (MSX had no touch input) | Large |

Recommended order: **#7 → #6 → #5** (faithfulness gap first; the two web-port features after).

---

## Issue #7 — Binoculars (the telescope/recon mode)

### Behaviour (ROM)
Selecting the **binoculars** item and exiting the equipment menu enters a dedicated **game mode**
that lets the player peek into **adjacent rooms** for reconnaissance, then returns. Fully ported
from the disassembly:

- **Entry — `ExitEquipMenu` (`logic/menuequipment.asm:299-349`):** on closing the equip menu, if
  `IsolatedRoom != 0` → no binoculars (return to play). Else if `SelectedItem == SELECTED_BINOCULARS`
  (9) → `GameMode = GAME_MODE_BINOCULARS` (8); init `BinoculStatus = 0`, `BinocularDir = 1`; back up
  `EnemyList`, `PowerSwitchOn`, `RadioCallFlag`, `AlertMode`; show the target-crosshair sprites.
- **Loop dispatch — `Banks0123.asm:12085` (`dw BinocularMode`).**
- **`BinocularMode` (`Banks0123.asm:12256`):** while *watching* an adjacent room you can't exit;
  while *idle* (status 1) `F3` exits to the equipment menu (`ExitBinocularMode`).
- **`BinocularLogic` (`Banks0123.asm:12456`):** a status jump-table.
  - status 1 = **idle** showing the player's room: poll the d-pad; a direction press sets
    `TimerBinocular = 0x80` (128 ticks) and starts a peek in that direction (Up/Down/Left/Right →
    `NextRoomDirect` 1/2/3/4).
  - status 2..5 = **showing** an adjacent room: decrement `TimerBinocular`; when it hits 0, move
    back (the opposite direction) to the player's room.
  - `MoveBinoculars2` → `GetNextRoomNum`: `FF` = no room that way → abort the move (stay).
- **`DrawBinocRoom` (`Banks0123.asm:12543`):** renders the shown room — tiles, items, doors, and
  **enemies** (`SetupEnemyRoom`) — then prints **"TELESCOPE MODE"** (`txtTelescope`) and a
  **direction arrow** (`ArrowsChars`: up `0x9A`, down `0x9B`, left `0x99`, right `0x3C`). When
  showing the player's own room it erases the enemy sprites first.
- **`ExitBinocularMode` (`Banks0123.asm:12402`):** restores the backed-up `EnemyList`/power/radio/
  alert, hides the crosshair sprites, and returns to `GAME_MODE_EQUIPMENT`.

### Current state of the port
Entirely missing. `binocular` appears only in comments ("returns silently", "out of scope"). No
`SELECTED_BINOCULARS` constant, no `'binoculars'` `gameState`, no logic/draw. `chkUseItem`
(`game.js:7035`) silently ignores it; `closeMenu` (`game.js:6951`) just returns to play.

### Fix — a self-contained `'binoculars'` game mode
The port is immediate-mode (no VRAM; `ctx` is `const`, so no offscreen render via the existing
helpers). Plan:

1. **Constant:** `const SELECTED_BINOCULARS = 0x09;` near the other `SELECTED_*` (≈`game.js:3234`),
   cited to `Enums.asm`.
2. **Entry from `closeMenu()`:** when closing the **item** menu with `selectedItem ===
   SELECTED_BINOCULARS` and the room is **not isolated**, enter binoculars instead of play. (Reuse
   the existing isolated-room test used by the alarm logic; cite `ChkIsolatedRoom`.)
3. **State machine** (`gameState = 'binoculars'`, a `binoc` object) faithful to `BinocularLogic`:
   - `home` = the player's real `currentRoom` (never call `setRoom` — play state stays intact).
   - **idle**: showing `home`; a fresh d-pad press toward a valid `neighbor(dir)` starts a peek
     (`timer = 0x80`); a press toward a dead end does nothing (the `FF` abort).
   - **show**: `timer--`; at 0 → back to idle showing `home`.
   - Input via an edge-triggered latch (mirror `menuDirTrigger`), not held state, to match
     `ControlsTrigger`.
4. **Rendering — `drawBinoculars()`** built once-per-peek **snapshot** (`{img, doors, roomItems,
   guards}`) from data via pure helpers (`makeGuard` is a pure factory; adjacency via the existing
   `neighbor(dir)` = `GetNextRoomNum`). Each frame, temporarily swap the relevant globals
   (`currentRoom/assets.room/doors/roomItems/guards`) to the snapshot, call the existing
   `drawImage`/`drawRoomItems`/`drawDoors`/`drawGuard`, then restore — safe because `draw()` is
   synchronous. Overlay: a centred **target crosshair**, **"TELESCOPE MODE"** text, and the
   **direction arrow** while peeking.
5. **Exit:** `Esc` / a menu key while idle → back to play.

### Deliberate divergences (cite in comments, per CLAUDE.md)
- **Exit returns to play, not the equipment menu.** The ROM's `ExitBinocularMode` returns to
  `GAME_MODE_EQUIPMENT`; the port's menu model ("moving is selecting", close = back to play) would
  make returning to the menu re-enter binoculars immediately. Returning to play is the clean
  equivalent.
- **No `EnemyList`/power/radio/alert backup-restore needed.** The ROM saves them only because
  `DrawBinocRoom` overwrites the shared room/enemy RAM. The port never mutates play state (it
  renders from a transient snapshot), so there's nothing to restore.
- The crosshair art (`BinocularSprAtt`/`LoadSprTarget`) isn't an exported asset; draw a simple
  reticle with primitives (note it as a stand-in).

### Acceptance
Select binoculars, close the item menu (in a non-isolated room) → telescope view of the current
room with a crosshair + "TELESCOPE MODE". D-pad peeks the adjacent room in that direction (its
layout/items/doors/guards) for ~2s with a direction arrow, then returns. A dead-end direction does
nothing. Esc returns to play. Play state (Snake, guards, alarm) is unchanged afterwards.

---

## Issue #6 — Replace the start screen (metallic look, keep the Konami scroll)

### Behaviour
Replace the green "press any key to start" gate with a metallic Metal Gear title look, while still
playing the Konami logo scroll on boot.

### Current state
- The green gate is the `#gate` **DOM overlay** (`index.html:36-43, 85`), shown at boot
  (`game.js` boot: `titlePhase = 'gate'`, gate `innerHTML = '<b>METAL GEAR</b><span>press any key
  to start</span>'`). It exists to capture the **first user gesture for the audio unlock** (browser
  autoplay policy) — `begin()` calls `unlockAudio()` then transitions `titlePhase` to
  `'konami-reveal'`.
- The boot sequence after the gate (`titleTick`/`drawTitle`: `konami-reveal` → `konami-hold` →
  `swoop` → `wipe` → `text-wait` → `ready`) is **ROM-faithful** (Konami logo line-reveal, then the
  Metal Gear logo swoop) and must be **preserved untouched**.
- Art already loaded (`game.js:355-358`): `metal.png` + `gear.png` (metallic wordmark),
  `konami-logo.png`; plus `metalgear.png` / `metalgear-bg.png`.

### Fix (recommended)
Restyle the gate to a metallic Metal Gear look while keeping the gate → `konami-reveal` flow and the
`begin()` audio-unlock gesture intact:
- Replace the gate's green text with the metallic wordmark (`metal.png` + `gear.png`, or
  `metalgear.png`) on a dark metal field, with a subtle "press any key / tap to start" prompt.
- Keep it a **DOM overlay** (simplest, no boot-flow change) — or, optionally, draw it on-canvas in
  the `'gate'` phase of `drawTitle()` for a unified look. Either way the first gesture must still
  call `unlockAudio()` before `konami-reveal`.
- This is a **web-port-only** concern (no ROM equivalent — the ROM has no audio-gate). Note it.

### Acceptance
Boot shows a metallic Metal Gear start screen; first key/tap unlocks audio and plays the Konami
scroll and the rest of the existing boot unchanged. Works on desktop and touch.

---

## Issue #5 — Phone / mobile support

### Behaviour
Add mobile/phone support so the game is playable on touch devices.

### Current state
- Input is **keyboard-only**: `window` keydown/keyup feed a `held` Set + edge latches
  (`DIR_KEYS`, fire/punch/weapon/item/menu/radio/pause). No touch handling.
- Layout: fixed 256×192 canvas in a centred panel (`index.html`), no responsive scaling; viewport
  meta present.

### Fix (scope — needs UX decisions)
A web-port-only feature (no ROM equivalent). Components:
1. **Responsive canvas scaling** — scale the 256×192 canvas to the viewport (integer/`max` scale,
   `image-rendering: pixelated` already set), handle orientation.
2. **On-screen touch controls** — a d-pad + action buttons (Fire, Punch, Weapon, Item, Radio,
   Pause, and now binoculars/menu) that feed the **same** `held` Set and edge latches the keyboard
   path uses, so no game-logic changes are needed. Touch handlers must `preventDefault` to stop
   scroll/zoom; multi-touch for move+fire.
3. **Menus/radio/binoculars on touch** — ensure the d-pad-driven menus and the new binoculars mode
   are reachable via the touch controls.
4. **Polish** — hide touch UI on desktop (pointer/hover media query), fullscreen prompt.

### Open decisions (ask before building)
- Control layout (floating d-pad + buttons vs. fixed bars), button set, and whether to use a
  library or hand-roll. Recommend hand-rolled touch → `held` for zero logic divergence.

### Acceptance
On a phone, the canvas fills the screen and the game is fully playable (move, fire, punch, weapons,
items, menus, radio, pause) via on-screen controls; desktop is unchanged.

---

## Cross-cutting (batch 2)
- #7 is a faithfulness port (cite `BinocularMode`/`BinocularLogic`/`DrawBinocRoom`/`ExitEquipMenu`);
  its divergences are listed above and must be called out in comments.
- #6 and #5 are deliberate web-port additions with **no ROM equivalent** — note that in code, per
  CLAUDE.md.
- The user commits; do not run `git commit`/`git push`.

---
---

# Third batch (#8, #9, #10) — the attract-demo / "intro"

All three were filed (`State: title`) while watching the **attract demo** (`GS_DemoPlay`,
`logic/gamedemo.asm`). The ROM cycles 4 demo scenes (`DemoPlayId` 0..3): **gameplay 1** (room 5,
the lorry yard), radio-tutorial, **gameplay 2** (room 31, with a handgun & cameras), radio-tutorial.
The user calls the demo "the intro". Demo gameplay 1 starts in room 5 at (0x10,0x70), the lorry
guard emerges, then Snake walks **left into room 1** and punches a guard (the recorded byte stream
`DemoGameplay1` / `DEMO_GAMEPLAY1`, `game.js:3695`, matches the disassembly verbatim).

| # | Title | Type | Root cause found? | Risk |
| --- | --- | --- | --- | --- |
| 8 | Lorry guard walks really slow in room 5 | Faithfulness bug | **FIXED** (patrol now 60 Hz) | Low |
| 9 | Snake doesn't walk far enough left to punch the guard (room 1) | Room-transition desync | **FIXED** (EntryRoomXY + ChkExitRoom thresholds) | Med (broad, but suites green) |
| 10 | "Another intro where it walks through cameras and gets detected is missing" | **Not a bug** — present & working | N/A — left as-is per user | — |

---

## Issue #8 — Lorry guard patrols at half speed (room 5)

### Behaviour
In the room-5 lorry yard, the guard that emerges from the lorry walks/patrols noticeably slower than
a normal guard. Reported during the attract demo.

### ROM source (the behaviour to mimic)
- `../MetalGear/logic/actors/guardlorry.asm`, `GuardLorryLogic`: a guard parked in a lorry that, on
  the `LORRY_TIMER` (0x64) emerge timer, walks **down** out of the lorry (`SetActorSpeed` Y=`0x200` =
  2 px/iteration), then **`GuardLorryWalk` calls the normal `GuardLogic`** to patrol its path, then
  walks **up** (Y=`-0x200`) back in. The lorry guard is `ID_GUARD_SLOW` (room 7's 2nd guard alone
  gets `IdxGuardSpeed=8`, faster). Crucially, **the patrol uses the same `GuardLogic` (and the same
  per-iteration actor speed) as any normal slow guard** — it is not deliberately slow.

### Root cause (port)
`lorryGuardLogic(g)` (`game.js:5680`) gates itself to ~30 Hz at the top:
`if ((tickCounter & 1) !== 0) return;` (`game.js:5681`). Its **patrol** (case 2, `game.js:5694`)
moves `g.speed` per call → `g.speed` per **30 Hz** iteration. But **normal** guards run in
`updateGuardOne()`, called from `updateGuard()` **every 60 Hz tick** (`game.js:6598`, no
`tickCounter` gate), moving `g.speed` per **60 Hz** tick = `2·g.speed` per iteration. So the lorry
guard patrols at **half** the speed of an identical normal guard (its `speed` is `0.5` —
`actors.json["5"]`, so 0.5 px/iteration ≈ 15 px/s vs a normal slow guard's ≈ 30 px/s). That halving
is the "really slow".

The **emerge** (case 1, `g.y += 2`) and **enter** (case 3, `g.y -= 2`) are 2 px per *gated* 30 Hz
iteration = the ROM's `0x200` — those are **correct and must stay 30 Hz**. Only the patrol is wrong.

### Fix
Run only the patrol case at 60 Hz (like every other guard); keep the timer/emerge/enter cases on the
30 Hz iteration gate. Minimal change at `game.js:5681`:

```js
function lorryGuardLogic(g) {
  // Cases 0/1/3 are ROM-iteration timers (0x64 wait, 0x200 emerge/enter); the patrol (case 2)
  // is the normal GuardLogic and must run at the normal-guard 60Hz rate (guardlorry.asm
  // GuardLorryWalk -> GuardLogic). Gating the patrol too made it walk at half a normal guard's speed.
  if (g.lorryStat !== 2 && (tickCounter & 1) !== 0) return;   // 30Hz for the timers/emerge/enter only
  ...
```

(Case 2 already mirrors the normal patrol — waypoint homing at `g.speed`, the `alertMode →
enterAlert` transform — so running it every tick makes it identical to a normal slow guard.)

### Acceptance
In room 5 (or the attract demo), the emerged lorry guard patrols at the **same** speed as a normal
slow guard; the emerge/return into the lorry are unchanged (still 2 px/iteration). No alarm/punch
regressions.

---

## Issue #9 — Snake stops short of the punch in the demo (room 1) — FIXED

### Behaviour
In demo gameplay 1, Snake walks **5 → (into a parked lorry) 127 → 5 → 1**, then in room 1 punches
**downward** three times to take out a patrolling guard. In the port he stopped too far right/high
and the punches whiffed.

### What was NOT the cause (verified by an instrumented trace)
- Replay **cadence/walk speed are faithful**: `demoControlTick()` gated to 30 Hz (`game.js:6533`);
  Snake moves 2 px/iteration = the ROM's `0x200` (`NormalCtrl`). Each segment travels the ROM
  distance.
- **Door placement is faithful**: `PLAYER_IN_DOOR_DAT` matches the ROM `PlayerInDoorDat`
  (`nextroom.asm:463`) byte-for-byte; the lorry-127 entry/exit land on the right pixels.
- **Guard data is faithful**: room-1 actors + paths match `ActorsRoom001` / `Paths_000`
  (`actorsinrooms.asm`, `paths.asm`); `HideGuardRoom1` removes the right guard (Y=0x18) on a
  west entry.

### Root cause (two real ROM-faithfulness bugs in room transitions)
The trace showed Snake landing the final Left walk at **x=211** when he needs **x≤~200** to clear
room 1's right-side wall (his right probe hits the x≥216 solid) and walk **down** onto the guard's
y=176 band. Two transition bugs, both now fixed:

1. **Wrong room-entry coordinates.** `transition()` derived entry coords symmetrically from
   `ENTER_MARGIN=12`; the ROM's `EntryRoomXY` table (`nextroom.asm:362`) is **asymmetric**:
   Left→**242** (was 244), Right→12, Up→**184** (was 180), Down→**18** (was 12). Replaced with the
   exact ROM values (`ENTRY_LEFT_X/RIGHT_X/UP_Y/DOWN_Y`).
2. **Wrong room-exit trigger (the dominant bug).** The port only changed rooms at the **screen
   border** (`outOfBounds`: x<0 / ≥256 / y<0 / ≥192). The ROM's `ChkExitRoom` (`Banks0123.asm:9418`)
   crosses at **x<12 / x≥244 / y<16 / y≥186** — ~12 px sooner. Walking ~12 px too far into room 5's
   left edge before crossing ate ~11 px of the next room's walk budget, leaving Snake too far right.
   Added `crossesEdge(dir,x,y)` with the ROM thresholds and use it in the walk dispatch
   (`game.js`, normalControl). Pairs with the ENTRY_* values so a fresh entry never re-exits.

Both are **general** fixes (every room crossing in the game now exits/enters at the ROM pixels), not
demo-only hacks.

3. **Guard headed the wrong way first.** `makeGuard` set the initial patrol target to `path[1]`,
   but the ROM's `GetPathPoint` (`Banks0123.asm:6956`) makes the guard's first destination **path
   point 0**. With `path[1]`, room 1's bottom guard doubled back left before coming right, arriving
   ~16 px late at the punch spot — so only the 3rd of the three scripted punches connected. Set the
   initial target to `0` (both the normal patrol in `makeGuard` and the lorry-guard patrol-start,
   which uses the same `GetPathPoint_`). The guard's WALK speeds were already correct (medium =
   `WalkSpeeds` 0x140 = 1.25 px/iter = our 0.625/tick × 2).

### Verified outcome
Replay of demo gameplay 1 (locked in by `web/demo.headless.mjs`): Snake walks 5 → 127 → 5 → 1,
punches **down at (200,158)**, and all **three** punches land — the guard is taken out (2 guards → 1)
with **no false alarm**, then Snake walks off and the demo ends at the 0xFF terminator. Matches the
original attract demo. All **27** headless suites pass (the exit-threshold and path-point changes are
high blast-radius — checkpoints/doors/capture/elevator/alarm all green).

### Acceptance
Demo gameplay 1: Snake crosses into room 1, walks to the lower-right, and his three punches connect
on the patrolling guard and take him out — no longer whiffing into empty space.

---

## Issue #10 — "camera-detection intro is missing"

### Finding: **not missing — present and working.**
The camera-walk-and-get-detected scene the user describes **is the ROM's gameplay demo 2** (room 31,
handgun): `SetDemoPlay2` (`gamedemo.asm:83`) loads room 31; `DemoGameplay2` walks Snake **down** from
(0x70,0x28) straight through camera #0's sight column; room 31's cameras (`camera.asm`
`RoomsWithCamera`) `ChkSeePlayer` → `SetAlertMode` raise the alarm.

The port replicates this faithfully: `DEMO_SCENES[2] = {room:31, x:0x70, y:0x28, weapon:HAND_GUN}`
(`game.js:3710`); `startDemo()` sets `gameState='play'` and `setRoom(31)` (`buildCameras`);
`cameraTick()` runs unconditionally in the loop (`game.js:6591`) — **no `demoActive` guard suppresses
cameras or the alarm**. A headless run of the real `update()` loop confirmed: camera #0 spots Snake
and a **RED alert is raised** mid-demo. The 4-scene cycle (`endDemo` → `demoSceneIdx = (idx+1)%4`,
`game.js:3774`) reliably reaches scene 2 every 4th demo.

### Why the user may not have seen it
1. It's the **3rd** demo in the cycle (gameplay1 → tutorial → **gameplay2** → tutorial), ~256 idle
   iterations apart, and **any keypress resets the title idle and aborts an active demo**
   (`game.js:2855,2862` — a deliberate divergence noted at `game.js:3693`). Tapping a key means never
   reaching demo 2.
2. The detection may be **visually under-sold**: camera alerts have no "!" sign (ROM
   `AlertSignNotOnScreen`); the cue is the red palette + alarm music. Worth eyeballing that
   `playAlert()` actually sounds during the demo.

### Recommendation
No faithfulness fix is warranted (the ROM also buries it as the 3rd demo). **Confirm with the user**
what they actually observe. Optional, low-risk follow-ups if they want it more discoverable: verify
the RED-alert audio/palette renders during the demo, and add a regression test that plays gameplay 2
and asserts the camera raises the alarm (`title.headless.mjs` currently stops at `demoSceneIdx===2`,
so demo 2 is untested).

---

## Cross-cutting (batch 3)
- #8 is a faithfulness fix — cite `guardlorry.asm` `GuardLorryWalk -> GuardLogic` in the comment.
- #9 must be fixed by correcting the underlying geometry/timing, never by editing the verbatim demo
  byte stream (`DemoGameplay1`).
- #10 is likely no-op; do not "fix" a working feature without user confirmation.
- The user commits; do not run `git commit`/`git push`.
