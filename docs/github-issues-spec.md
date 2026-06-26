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

---
---

# Batch 4 — issues #12–#26 (filed 2026-06-24)

Investigated against `web/game.js` and the MSX disassembly in `../MetalGear`.
**Cross-room rule applied:** the room in each report is only where the user happened to hit the bug;
the fix is for the SHARED logic and must be verified across every room that exercises it. The
"Cross-room scope" line on each issue lists those rooms/paths.

| # | Title | Type | Root cause | Confidence | Risk |
| --- | --- | --- | --- | --- | --- |
| 13 | Death softlock — can't restart (room 128) | State bug | Mode-switch clobbers `gameState==='dead'` so the dead countdown never runs | Medium — needs clip | Med |
| 12 | Wrong alert triggered (room 128) | Alert logic | Alert-level bit-math is faithful; likely reinforcement type/timer carrying over | Low — needs clip | Med |
| 18 | Guard faces wrong way + instant alert (room 30) | ROM faithfulness | Initial facing from `path[0]→path[1]` instead of ROM `spawn→path-point-0` (`SetDirToPoint`) | High | Low |
| 21 | Guards shoot too quick (room 32) | Timing | `updateGuard()` runs at 60 Hz, but ROM shot/wait counters are per-iteration (~30 Hz) → ~2× fire rate | High | Med |
| 22 | Killing guards should stop alarm (room 32) | Alert logic | Blanket `guards.length===0` stop check + over-eager `numRespawnGuards` decrement vs ROM `ChkAlarmEnd` (type-keyed count + kill budget) | High | Med |
| 24 | Electric floor color wrong (room 37) | Render | Fixed yellow overlay vs ROM grayscale ramp 1↔7 (white at peak), wrong cadence | High | Low |
| 26 | Can't blow up fuse / power switch (room 37) | ROM faithfulness | No `dmgTable` → any weapon hurts it (ROM: missile-only); + missile detonates on surrounding wall before hitting it | High | Med |
| 15 | Sleep "Z" symbol position (room 138) | Render | Zzz drawn ~19 px too LOW; ROM offset is guard-top − 0x23. X is already faithful | High | Low |
| 20 | Barrel roll not displayed (room 153) | Art | Movement/bounce faithful; `barrel.png` is a solid blob with no roll frames | High | Low |
| 14 | Binocular crosshair wrong (room 5) | Render | Hand-drawn green circle vs ROM 32×32 white bracketed target (`SprTarget`) | High | Low |
| 25 | Ratio stays at max on pickup (room 32) | Not a bug | Port already clamps + redraws faithfully | High | — |
| 16 | Music restarts each loop (room 2) | Audio | `src.loop=true` over whole WAV replays the intro; ROM loops from an internal marker (`FE FE` GOTO), not song start | High | Med |
| 17 | Lift door sound too early (room 240) | ROM faithfulness | Open+SFX gated on the door's draw footprint, not the ROM open-area test (`ChkTouchDoor`) | High | Med |
| 19 | Wrong radio sequence / gas mask (room 29) | Integration | Radio data matches ROM byte-for-byte; fault is downstream (room-id mapping or radio-open freq state) | Low — needs repro | Med |
| 23 | Bottom camera dwells too long (room 36) | Timing | Dwell `rnd&0xFF` (0–255) vs ROM `R>>1` (0–127, min 1) | High | Low |

**Recommended order** (highest-impact + most certain first):
**#13 → #23 → #21 → #18 → #24 → #26 → #15 → #14 → #20 → #16 → #17 → #22 → #12 → #19 → #25.**
(#13 is a softlock; #23/#21/#18/#24/#26/#15/#14/#23 are high-confidence one-spot/asset fixes; #22/#12
need the alert-respawn rework; #12/#13/#19 want clip/repro confirmation; #25 is likely close-as-WAI.)

---

## Issue #13 — Death softlock: continue/restart never fires

**Reported room:** 128 · **Cross-room scope:** GLOBAL — the death→restart path is shared by every
play room. Triggered by any death source: `damage()` (`game.js:5928`), electric floor
(`chkElectricFloor` `:1309`), gas (`chkGasRooms` `:3216`), deep water (`chkWater` `:6661`), poison
(`:6606`). Most visible during ALERT (the only state that reliably drains all 24 life).

### Behaviour
ROM: on life→0, `SetDead` (`logic/hud.asm` `SetDead`) sets `GameMode=GAME_MODE_DEAD`,
`DeadTimer=0x80`, clears bullets, plays death music 0x44. `DeadLogic` (`Banks0123.asm:12276`)
decrements `DeadTimer`; at 0, `DeadLogicEnd`→`InitGame3` (`Banks0123.asm:11818`) calls
`RestoreGameStat`+`StopAlert` and resumes at the last checkpoint with full life. The continue ALWAYS
works (a checkpoint exists from game start). Port: dies but never restarts — stuck on the death frame.

### Root cause (most likely — needs clip confirmation)
The dead dispatch is structurally correct: `update()` `:6558` does
`if (gameState==='dead') { ... if (--deadTimer<=0) restart(); return; }`, and `restart()` (`:5965`)
rolls back to the checkpoint + `stopAlarm()`. So the softlock is a **state clobber**: something
switches `gameState` away from `'dead'` so the dead branch stops running. Prime suspect is `setText()`
(`:785`, sets `gameState='text'`) firing during an ALERT death — e.g. `chkIncomingCall()` runs at
`:6552` *before* the dead check, or a sleepy-guard / event text. Once `gameState==='text'`, `update()`
dispatches to `updateTextBox()` and the dead countdown never completes → permanent softlock.

### Fix
1. Make the dead state authoritative: in `enterDead()` (`:5951`) cancel any pending text, and gate
   `setText()`/`chkIncomingCall()`/capture with `if (gameState==='dead') return;` (mirrors the ROM
   where `GAME_MODE_DEAD` owns the dispatch).
2. Confirm the dead branch is reached every frame (no earlier `return` gated on `alertMode`).
3. Keep `restart()`'s checkpoint rollback + `stopAlarm()`.

### Risk / open questions
Could not reproduce from code alone — the dead path is correct in isolation, so confirm from the clip
(`clip-20260624-223452.webm`) whether a text box / radio CALL is on screen at the stuck moment.
Secondary: if the player never crossed a `SAVE_STAT_ROOMS` pair, `restart()` falls to the legacy
respawn-at-`manifest.start` branch (`:5980`) — functional but not a true ROM continue.

### Acceptance
Enter ALERT, let guards drain all life: death frame holds for the dead timer, then control returns at
the last checkpoint with full life and the alarm cleared — with NO text/mode able to interrupt the
countdown. Repeat for electric-floor, gas, deep-water, and poison deaths.

---

## Issue #12 — Wrong alert level triggered

**Reported room:** 128 · **Cross-room scope:** GLOBAL alert classification — every `raiseAlarm()`
(`game.js:4664`) and every room's reinforcement behaviour; specifically rooms whose `RedAlertRooms`
bit is set vs not, the room ≥128 boundary, and camera/laser forced-red rooms.

### Behaviour
ROM `GuardSetAlarm` (`chkdiscover.asm:327`) picks a **low alert** (white "!", music 0x32, no respawn)
vs **red alert** (red sign, music 0x2F/reinforcements) from the `RedAlertRooms` 128-bit table — but
**only for rooms < 128**; rooms ≥128 are forced to low alert (`chkdiscover.asm:334-336`).
Cameras/lasers force red music regardless (`setalert.asm`).

### Root cause (uncertain — needs clip)
The JS bit-math is faithful: `redAlertBit()` (`:4653`) reproduces the ROM's byte/bit/rotate exactly
and `RED_ALERT_ROOMS` (`:4641`) matches the table; the `room<128` low-alert boundary is honored. So
the *classification* is correct. The likely real defect is **reinforcement type/timer carrying over**:
room 128 has a red-alert `respawn.json` entry; if `alertRespawnTimer` (armed by a prior red/camera
alert) carries in with a stale `redAlertFlag`, `respawnTick` (`:4834`) spawns red-alert reinforcements
under what should be a low alert.

### Fix
1. When the alarm re-homes to a non-red room, clear `alertRespawnTimer` and recompute `redAlertFlag`
   for the trigger room (don't carry it).
2. Verify `devForceRed`/`devForceAlert` (`:5019-5020`) are off in production.
3. Gate spawned reinforcement type + cap on the ACTUAL `redAlertFlag` of the trigger room.

### Risk / open questions
Could not confirm a concrete wrong-level from data alone (room 5 → normal, 128 → normal). Confirm
from the clip what the player saw (red sign? red music? respawning waves?). Likely overlaps with #22.

### Acceptance
Trigger detection in a non-red room (e.g. 5): white "!", music 0x32, no waves. In a red room (e.g.
32): red sign, red music, reinforcements. Walking between rooms keeps the level fixed at trigger time.

---

## Issue #18 — Guard faces wrong way and instantly triggers alert on entry

**Reported room:** 30 · **Cross-room scope:** EVERY room whose guard's spawn position differs from
its first path point (`guardDefsFor` `:4783` runs for all `actors.json` rooms) — i.e. most patrol
guards. Wrong wherever `spawn→path[0]` differs from `path[0]→path[1]`.

### Behaviour / ROM source
ROM: a guard's initial `Direction` is set by `SetDirToPoint` toward **path point 0**, via
`GetPathPoint` (`Banks0123.asm:6956`, `SetDirToPoint` `:6965`) — direction = spawn position vs
**destination point 0**. Room 30 guard #2 spawns (56,176), p0=(104,176): ROM faces **RIGHT** (dx=+48).
The port faces **UP** (from p0→p1 dy=−88). Snake enters room 30 from 149 at (56,144) — directly above
the guard; a guard wrongly facing UP sees Snake instantly → immediate alert. The ROM guard faces right
and doesn't. LOS bands: `chkdiscover.asm:447` `ChkViewVertical` H=0x08, `:472` `ChkViewHorizontal`
H=0x06.

### Current port state
`guardDefsFor` (`:4790-4795`) computes facing from `path[1]-path[0]` (WRONG vector):
```js
const dx = path[1][0]-path[0][0], dy = path[1][1]-path[0][1];   // should be path[0]-spawn
```

### Fix
Compute initial facing from **spawn→path[0]** (mirror `SetDirToPoint`): `dx=path[0][0]-r.x`,
`dy=path[0][1]-r.y`, dominant axis wins. If `spawn==path[0]` (zero vector) fall back to
`path[0]→path[1]` (matches the ROM's next `UpdateActorPath` step). Apply the same to lorry/shooter
guards via `makeGuard` (`:4736`). Optionally align LOS bands to inclusive ±8/±6 (`losDirectional`
`:4934`).

### Risk / open questions
Confirm the ROM's single-axis tie-break when both axes differ (`SetDirToPoint3` ORs up/down + l/r
bits). Re-derive room 30 guard #1 too (spawn (200,144)→p0 (200,171) = DOWN; current code gives LEFT).

### Acceptance
Enter room 30 from 149: guard #2 faces RIGHT, guard #1 DOWN, and neither instant-alerts on Snake's
entry tile. Spot-check 2–3 other spawn≠path[0] rooms for correct facing + no spurious entry detection.

---

## Issue #21 — Guards shoot too quick (alert AI runs at 2× ROM rate)

**Reported room:** 32 · **Cross-room scope:** GLOBAL — every alert guard in every room.
`updateGuard()` runs ungated at 60 Hz while the ROM's `GuardAlertLogic` runs once per iteration
(~30 Hz).

### Behaviour / ROM source
ROM alert guards re-aim/shoot on per-iteration counters: shoot roll on re-aim
(`guardalert.asm:143` `GuardChasePlayer2`: `b = 0x0F..0x16` shot wait; `and 3` → ~3/4 shoot), then
wait `Counter` iterations (`guardalert.asm:212` `GuardWaitShot`) before resuming;
`SetGuardRndCounter` (`:237`) = `rnd&0xF + 0x14` (0x0A red alert). Dispatch `EnemiesLogic`
(`Banks0123.asm:12612`) runs once per `GameLogic` iteration (~30 Hz). The port decrements these same
constants every 60 Hz tick → ~2× fire rate.

### Current port state
`updateGuard()` (`:5024`) is called at `:6621` **outside** the `if ((tickCounter & 1)!==0)` block
(`:6613`) that gates cameraTick/bossTick. The counter values match the ROM
(`guardChasePlayer2` `:5204`, `guardWalkCounter` `:5160`, `guardShoot`/`guardWaitShot` `:5229/:5238`)
— but the call rate is doubled.

### Fix
Run the alert/patrol **decision/shot counters** on the iteration boundary (`(tickCounter&1)===0`)
while keeping **movement** at 60 Hz (chase speed must stay equal to Snake — see risk). Apply to
`guardWaitShot`, `guardWalk`, `guardWalkAwayShot`, `guardWaitChkAlert`, and the red-alert double-shot
(`:5244`). (Alternative: double all shot-wait constants — simpler but less faithful and doesn't help
patrol; prefer the gate.)

### Risk / open questions
The port deliberately ticks patrol movement at 60 Hz (comment `:85`, "alert == Snake speed") — gating
the *whole* `updateGuardOne` to 30 Hz would halve chase speed. The fix MUST separate movement (60 Hz)
from decision/shot counters (30 Hz). Bullet flight is already halved (`fireGuardBullet` `:5347`) —
verify bullets aren't too fast.

### Acceptance
In room 32 ALERT, the interval between a guard's shots should roughly double (matching ROM
~0.5–0.75 s between volleys) while chase movement stays equal to Snake.

---

## Issue #22 — Killing guards should stop the alarm

**Reported room:** 32 (a red-alert room — `RED_ALERT_ROOMS[4]=0xA3`, bit7 set, so it arms
reinforcements) · **Cross-room scope:** every trigger room with a `respawn.json` entry under an active
alert, especially red-alert rooms and rooms with `alertRespawnTimer` armed (cameras/lasers/roof).

### Behaviour / ROM source
ROM `ChkAlarmEnd` (`Banks0123.asm:6635`) ends the alarm when, in the trigger room, the reinforcement
budget is spent (`NumRespawnGuards==0`) AND the count of the room's respawn-enemy TYPE reaches 0
(`CountEnemyType`). `NumRespawnGuards = highestCard + 3` (`setalert.asm` `SetAlertMode3/4`) and is
decremented ONLY when an ALERT/REDALERT/SHOOTER/JETPACK actor is killed (`KillActor`→`DecRespawnGuards`
`Banks0123.asm:13214`).

### Current port state (two divergences)
`chkAlarmEnd` (`:4688`), `respawnTick` (`:4834`), `killGuard` (`:5787`):
1. `killGuard` decrements `numRespawnGuards` for **every** kill (`:5789`), not just
   reinforcement-eligible types (ROM keys on actor ID).
2. The stop check at `:4702` uses `guards.length===0` (ALL guards) instead of the ROM's
   `CountEnemyType(respawn-id)==0` (only the respawn type). In red-alert room 32, `respawnTick` keeps
   spawning red-alert guards (cap 3) and re-arming `alertRespawnTimer`, so `guards.length` may never
   hit 0 and the alarm feels unbreakable.

### Fix
1. Decrement `numRespawnGuards` ONLY for reinforcement-eligible types (tag each guard
   alertSpawn/redalert/shooter/jetpack at creation).
2. Replace `guards.length===0` (`:4702`) with "count of the room's respawn-type enemies == 0" using
   `respawn.json[room].id`; add the ROM's `count==0x10 → stop` quirk.
3. Keep budget `= highestCard + 3` and `setRespawnTime` overrides; confirm `respawnTick` stops once
   `chkAlarmEnd` zeroes `alertRespawnTimer`.

### Risk / open questions
Need the `respawn.json` id mapping (id 10 = ID_GUARD_REDALERT). Match the ROM's punch-kill rule
(a punched REDALERT reinforcement spends budget; a punched plain patrol guard does not). Likely shares
its fix surface with #12 (carried `alertRespawnTimer`).

### Acceptance
In room 32 (red alert): after spending the budget (`highestCard+3`) the spawns STOP, and once the
room's red-alert guards are all dead the alarm drops to normal. A normal-alert room (no respawn) still
ends the moment its guard is killed / trigger room is left. Punching a plain patrol guard to death
does NOT spend the reinforcement budget.

---

## Issue #24 — Electric floor color wrong (should flash white)

**Reported room:** 37 · **Cross-room scope:** every electrified-floor room — ROM rooms
**16, 37, 40, 110, 116** (`damageelectric.asm`); all share the JS `drawPowerSwitchFloor` overlay +
`ELECTRIC_TILES` map. **Pairs with #26 (same object).**

### Behaviour / ROM source
ROM `PowerSwitchLogic` (`powerswitch.asm:24`) every 4 iterations ramps `BRIGHT` and oscillates 1↔7
(`ChkRevertFade` `:67`), building a palette word with **R=G=B=BRIGHT** (grayscale → pure **white** at
7,7,7). Room 37 pulses palette slot #9 (`:46-57`). On destruction `SetRoomPal` resets it.

### Current port state
`drawPowerSwitchFloor` (`:1319-1333`) paints a fixed **yellow** `rgba(255,255,160, a)` with a
free-running `sin(tickCounter/20)` alpha — wrong hue and wrong cadence (admitted stand-in at `:1320`).

### Fix
Drive a `bright` counter exactly like the ROM (tick every 4 iterations, ramp 1→7→1) and tint the
`ELECTRIC_TILES` floor with `rgb(v,v,v)` where `v=round(bright/7*255)` (gray→white), not yellow.
Since the port composites over the room PNG instead of swapping a palette slot, use a near-opaque
white/gray tint (or screen/lighten blend) so peak reads white. Keep the per-room tile set.

### Risk / open questions
Deliberate divergence: canvas pipeline has no palette indirection, so match the visible result
(gray→white pulse) + 4-iteration cadence rather than the palette swap. Verify the tint reads correctly
over the tile art.

### Acceptance
Room 37 with switch on: floor pulses smoothly dim-gray↔bright-white on the ROM cadence, never yellow.
Destroy switch (#26) → tint stops. Verify rooms 16/40/110/116 too.

---

## Issue #26 — Can't blow up the fuse / power switch

**Reported room:** 37 · **Cross-room scope:** every `ID_POWER_SWITCH` — ROM rooms **37 & 110**
(pre-placed), room **40** (jetpack-event switch), room **16** (guard-operated variant). The JS builds
switches in three places, all WITHOUT a `dmgTable`: `buildPowerSwitch` (`:1293`), room-16
(`:5599`), room-40 jetpack (`:1481`). **Pairs with #24.**

### Behaviour / ROM source
The power-supply box is destroyable **only by the remote-control MISSILE (Nikita, weapon id 7)** —
that's the puzzle. Damage table `data/weapondamage.asm`, index = `ACTOR.ID−1`;
`ID_POWER_SWITCH=0x2C=44` → index 43: Bullet/Grenade/Rocket/PlasBomb = `0xFF` (immune), Mine = `0`,
**Missile = `5`**. Box LIFE = 2 → one missile kills. Destruction (`EraseBitmapActor`
`Banks0123.asm:13586`, `:13601` `xor a; ld (PowerSwitchOn),a`) flips the floor off + `SetRoomPal`.
The switch is hit via the **separate enemy-shot pass** (`damagetoenemy.asm` `ChkEneHitByShot`),
independent of the missile's own wall-collision move — which is why a missile reaches a switch
embedded in the wall.

### Current port state (two faults)
1. No `dmgTable` → `weaponDamage()` (`:6183`) falls back to the guard `WEAPON_DMG` (`:6176`), so
   **every** weapon damages it (handgun 2 ≥ life 2). Inverse of the ROM.
2. The switch sits in solid wall tiles; the missile case (`:6426-6433`) runs the **tile-collision
   check first** and only checks `shotTarget` if the tile test missed — and `explodeShot` (`:6341`)
   doesn't re-run `shotTarget` for the missile. So a steered missile **detonates on the surrounding
   wall for zero damage** → switch indestructible.

### Fix
1. Give every power-switch a missile-only `dmgTable: {1:0,2:0,3:0,4:0,5:0,6:0,7:5}`, `life:2`. Factor
   into one shared `POWER_SWITCH_DMG` const, reference at `:1293`, `:5599`, `:1481`.
2. Let the missile (and rocket) hit a wall-embedded actor: in the MISSILE/ROCKET case (`:6427-6432`)
   test `shotTarget(b,false)` and apply damage/explode **before** the `shotHits` wall check
   (mirrors the ROM's independent `ChkPlayerShots` pass).

### Risk / open questions
ROM distinguishes `0xFF` (no damage, shot passes) vs `0` (hit, 0 dmg); modelling non-missile weapons
as plain 0 is a harmless simplification — note it. Confirm JS `MISSILE=7` and 1-based dmgTable index
(per Hind D `:2144`). Rocket stays immune (table). Confirm the player has missile ammo by room 37.

### Acceptance
In room 37 only the Nikita missile destroys the switch (one hit, even embedded in the wall); floor
de-energizes (#24 tint stops), SFX plays. Handgun/SMG/grenade/rocket/pbomb/mine leave it intact.
Verify rooms 16/40/110.

---

## Issue #15 — Sleep "Z" symbol position

**Reported room:** 138 · **Cross-room scope:** every sleeping-guard Zzz — dynamic doze
(`ChkSleepyGuard`, rooms 26/85/138) + placed `ID_SLEEPING_SIGN` guards (room 140). All use the same
JS `drawGuard` Zzz block.

### Behaviour / ROM source
ROM `ChkSleepyGuard` (`guard.asm`): Zzz cell at `d = guard.X` (same X), `e = guard.Y − 0x23`
(35 px above the guard top). Room 140 placed sign confirms ΔX=0, ΔY=−0x23
(`actorsinrooms.asm:847-850`). Frame sequence `{0,1,2,1}`, cadence mask 0x0F. The `SprZzz` art
(`gfx/sprites.asm:954`) has frame 0 left-aligned and frames 1/2 drifting upper-right — i.e. the ROM
itself shows the Zzz floating up-and-right 3/4 of the cycle.

### Current port state — X is faithful; only Y is wrong
Zzz draw (`:6129-6137`): X = `g.x − 8` (guard sprite center → same column as the ROM cell — **faithful**;
the perceived "right of head" is the ROM-correct drift puffs). `ZZZ_FRAMES=[0,1,2,1]` (`:4648`) and
cadence 16 (`:4649`) match. **But** Y = `g.y − 46`, while the ROM is `(g.y − 30) − 35 = g.y − 65` →
the JS Zzz sits **~19 px too low**.

### Fix
Set the Zzz cell top to `Math.round(g.y) - a.anchorY - 0x23` (= `g.y − 65`), keeping X at `g.x − 8`.
Do NOT re-center X — it's already faithful.

### Risk / open questions
This is the one issue where the literal complaint ("right, not center") doesn't match the code (X is
faithful; only Y is off). Confirm against the clip / `room_images` before touching X. Re-centering the
big glyph would diverge from the ROM (its glyph is left-aligned by design) — only on explicit request.

### Acceptance
A sleeping guard's Zzz sits one guard-height-plus above the head (top at guard-top − 35 px),
horizontally over the guard, cycling big-left → small-right puffs.

---

## Issue #20 — Rolling barrel not displayed / not rolling

**Reported room:** 153 · **Cross-room scope:** barrel rooms **141, 153, 191, 205** — ALL ROM-faithful.
The literal `db ID_ROLLING_BARREL` appears only in the `ActorsRoom141`/`ActorsRoom205` table
*definitions*, BUT the `idxActorsRooms` room→table pointer table (`actorsinrooms.asm:1026`) aliases
**rooms 141, 153 AND 191 all to `ActorsRoom141`** (lines 1167/1179/1217), and room 205 to
`ActorsRoom205`. So 153/191 genuinely have the rolling barrel in the ROM — the ROM reuses one actor
layout across the three Building-1-F2 cylinder rooms instead of duplicating it. (`export-actors.mjs`
follows `idxActorsRooms`, so `actors.json` already has all four correctly — NO data change needed.)
Shared `barrelTick`/`drawBarrels`.

### Behaviour / ROM source — it's a TALL COLUMN, not a single barrel (corrected)
The actor placement word `dw 8008h` decodes (X = high byte, Y = low byte — verified vs known guards)
to **x=128, y=8**: one barrel actor at the top-centre. Its sprite-attribute list `RollBarrels1/2`
(`data/actorspriteattr.asm:361/371`) draws a **16-px-wide column of ~9 stacked barrel segments**
(`D0/D4` cap + `D8/DC` ×7 + `E0/E4` cap, ≈144 px) — almost the full 192-px room height. So it's a
rolling **wall of barrels** sweeping side to side; you dodge through the bottom corridor. `RollBarrels1`
and `RollBarrels2` are the two roll frames (`Anim2FramesActor` every 4 iterations). Movement: init
±0.5 px/iter away from player, accel ±8/256, bounce X=200→199 / X=56→57 with SFX 0x1D; **touch damage
0xFF = all life (instant death)**. `barrelTick` already reproduced movement/bounce, but rendered a
single, badly-drawn 16×16 `barrel.png` and only collided in a 16×16 box near the top.

### Fix (implemented)
1. Render the barrel as a full **rolling cylinder column** (`BARREL_W`=16 × `BARREL_H`=144, 9 segments)
   from y=8 down — drawn procedurally in `drawBarrelColumn` (round width-shading + joint rings +
   vertical staves that slide between the 2 roll frames `f = Math.floor(anim/4)&1`). Replaces the
   `barrel.png` blob.
2. **Collision spans the whole column** (`|snake.x-b.x|<12` and `snake.y ∈ [b.y-8, b.y+BARREL_H]`) →
   touching it anywhere is instant death.

### Risk / open questions
The procedural cylinder is a faithful-intent stand-in (the RLE `SprRollingBarrel` bytes weren't decoded
pixel-exact). **Resolved:** rooms 153/191 ARE faithful — they alias `ActorsRoom141` via
`idxActorsRooms` (see scope above). Keep all four; no `actors.json` change.

### Acceptance
In room 153 (and 141/205) a tall column of barrels fills most of the room height, rolls left↔right,
bounces off the walls (hit SFX) and visibly rotates; walking into it anywhere kills Snake instantly.

---

## Issue #14 — Binocular crosshair wrong

**Reported room:** 5 · **Cross-room scope:** binoculars mode in any room (single shared reticle).

### Behaviour / ROM source
ROM `SetBinoTargetSpr` (`updatesprites.asm:98`) loads `BinocularSprCol` (color **0x0E = white**) and
four 16×16 sprites laid 2×2 → a **32×32** white target: four L-shaped corner brackets + a centered
cross with small flares/ticks (patterns from `SprTarget`, `gfx/targetspr.asm`). (The grenade-launcher
target is a *different* smaller 16×16 reticle — don't reuse it.)

### Current port state
`drawBinocReticle` (`:7191-7203`) draws a **green circle** (radius 10) with cross-gaps — wrong shape,
wrong color, wrong size (stand-in, comment `:7191`).

### Fix
Replace with a faithful **32×32 white** target centered at `(VIEW_W>>1, VIEW_H>>1)`: four L-corner
brackets + centered cross with flares/ticks. Either hand-draw to match the decoded `SprTarget` bitmap
or export `SprTarget` as a sprite asset and blit it (preferred for fidelity). Keep 32×32, not 16×16.

### Risk / open questions
`SprTarget` isn't currently an exported asset (`:7131`); simplest faithful route is to draw the
decoded bitmap with rects/lines, or add the export.

### Acceptance
Entering binoculars shows a white 32×32 bracketed square reticle with a centered cross, not a green
circle.

---

## Issue #25 — Ratio stays at max on pickup (likely NOT a bug)

**Reported room:** 32 · **Cross-room scope:** the shared pickup→clamp→HUD path (every pickup, every
room).

### Behaviour / ROM source
"Ratio" = the ammo/units count. ROM: an item picked up while already at the rank cap is **always
taken, SFX 0x24 plays, and the displayed count stays pinned at the cap** (clamp happens before the HUD
redraw); a ration has no play-HUD number at all (`logic/items.asm` → `LimitAmmo`/`ChkMaxAmount`
`logic/maxammo.asm:169`).

### Current port state — already faithful
`takeItem`/`pickUpWeapon`/`pickAmmoCrate` each call `clampInventory()` (`:569/579/586`, clamp
`:593-599`); the HUD draws from the clamped value every frame (`renderHud :7458`). Pickup zeroes the
slot + plays SFX (`chkTakeItems :530`). No value/persistence discrepancy.

### Fix
**No code change** — recommend close as works-as-intended. At max, a pickup correctly takes the item,
plays SFX 0x24, leaves the count at the cap; a ration shows no play-HUD number by design. Any "max!"
flash / forced number would be a deliberate divergence — only on explicit request.

### Risk / open questions
Confirm from the clip whether the drop was a ration (no HUD number expected) or an ammo crate with no
weapon selected (empty box expected) — both faithful. If the user means the **rank stars** that's a
different element (`DrawClass`) and a separate report.

### Acceptance
Pick up an item at the rank cap: item disappears, chime plays, ammo number (if a weapon selected)
holds at the cap — never overshoots/blanks/flickers.

---

## Issue #16 — Music restarts each loop (intro replays)

**Reported room:** 2 · **Cross-room scope:** ALL area-music rooms / every track with a one-time intro
before its loop marker (shared JS audio-loop logic) — Theme of Tara (most of the map), Sneaking
Mission, TX-55, Beyond Big Boss, alert/boss/lorry/countdown tracks.

### Behaviour / ROM source
ROM loops each theme from an **internal marker**, not the song start. `ThemeOfTara.asm`: the opening
phrase `MusThemeOfTara1` plays once; the end-of-song command `db 0FEh,0FEh / dw MusThemeTara2`
(GOTO, `bgmdriver.asm` `#FE #FE address`) loops to **`MusThemeTara2` (mid-song)** — so the intro is
never heard again. The other themes share this `FE FE`→mid-label shape.

### Current port state
`startAreaMusic()` (`:5893`) sets `areaMusicSrc.loop = true` (`:5900`) over the **whole** exported WAV,
which begins at the song intro (`tara.wav` is rendered from the `"Theme of Tara (intro)"` catalog
entry — channel START pointer `0x7245`, per `MusicCatalog.cs:19` / `docs/SESSION-STATE.md` — i.e. the
intro lead-in `Mus_IntroTara` + the opening phrase `MusThemeOfTara1` + the body). So every loop replays the intro =
"restart." (Room re-entry is NOT the cause: `updateAreaMusic()` only restarts when the track id
differs, so 1→2 same-track does not restart.) Same whole-buffer loop at alert `:5832`, boss `:5408`,
lorry `:2551`, foxhunter `:6868`.

### Fix
Give each looping track a loop point = the ROM's GOTO target label, instead of looping the whole
buffer. Preferred: compute per-track the loop-label time offset in the exporter (it already walks the
channel byte stream — emit the sample index of `MusThemeTara2`/equivalent into per-track metadata) and
set `areaMusicSrc.loopStart = offset; loopEnd = bufferEnd; loop = true` at each `src.loop=true` site.
Apply to every track whose `.asm` ends in `FE FE`/`FE nn` GOTO to a non-start label (verify each in
`sound/music/*.asm`). Exclude the radio-noise SFX loop (`:4504`, a true full-buffer loop).

### Risk / open questions
Must compute the exact sample offset (driver ticks → samples); imprecision could glitch the seam —
verify by ear. Confirm each track's GOTO target label individually (Tara → `MusThemeTara2` verified;
others TODO in the exporter change).

### Acceptance
Enter room 2, let Tara play a full cycle: opening phrase heard once, loop continues from the mid-song
body (no intro restatement), continuous. Re-entering same-music rooms (1↔2) still doesn't restart.
Re-check Sneaking Mission (e.g. room 54) and Beyond Big Boss (room 88).

### Implemented (this pass)
- Loop detection done via the music tool, NOT via the `0xFE 0xFE` GOTO directly (that period is the
  full channel length, far longer than the audible loop). Instead `--export-music-loops`
  (`PunchExporter.ExportMusicLoops` + `MusicEngine.StateKey`) finds the first recurrence of the whole
  driver state — intro states occur once, so the first repeat IS the body loop. Writes
  `web/assets/music-loops.json` `{track:{start,end}}`. `game.js` `applyMusicLoop()` sets
  `loopStart/loopEnd` (intro plays once); tracks with no entry keep the whole-buffer loop. The state
  key includes each channel's instrument/envelope phase, so the `[start,end]` seam is bit-exact in
  driver state → no audible glitch at the loop point.
- **`applyMusicLoop` wired at every music-loop site:** `startAreaMusic` (`:5893`), `playEndingMusic`
  (foxhunter, `:6868`), `startBossMusic` (mercenary, `:5408`), `playAlert` (alert/red-alert, `:5832`).
  Excluded: radio-noise SFX (`:4504`) and the lorry **engine** drone (`lorryBuf`, `:2596`) — true
  full-buffer loops with no intro (no loop entry → unchanged).
- **Shipped (all 8 looping tracks):**
  - Already long enough (zero-cost): sneaking (0.3→31.5s), tx55 (0.3→13.1s), escape (1.7→33.7s).
  - **Re-rendered faithfully** (user chose intro+body over body-only/defer) to contain the one-time
    intro + one full body, sized just past each loop-end: tara (74.0→166.6s, WAV 167.5s/14.1MB),
    mercenary (3.4→19.4s, 20.5s), foxhunter (10.7→40.6s, 41.5s), alert (1.4→40.0s, 41.0s),
    red-alert (4.0→42.65s, 43.5s). Total asset growth ≈ +16MB (tara +7.7MB dominates).
- **Reproduce:** `dotnet build -c Release`, then for each re-rendered track
  `ThemeOfTaraPlayer.exe --export-sfx "<catalog name>" <abs-path>\<file>.wav <seconds>` (seconds ≳
  loop-end), then `--export-music-loops` to regenerate `music-loops.json` + `.log` (the log prints
  each track's `loop start..end` and skips any whose WAV is still too short).

---

## Issue #17 — Lift/elevator door sound played too early

**Reported room:** 240 · **Cross-room scope:** ALL door opening — the open trigger gate is shared, so
this affects every door/keycard/elevator open in the game. Room 240's type-6 elevator-exit doors open
instantly with a distinctive SFX, making the early trigger audible.

### Behaviour / ROM source
ROM gates the door open (and its SFX) behind `ChkTouchDoor` (`opendoor.asm:401`), which returns
unlocked only when Snake is inside the door's per-type **open area** (the approach strip), not its draw
footprint. Every openable branch of `ChkOpenDoor` ends in `jp ChkTouchDoor` (`opendoor.asm:74,134,156`).
Only then does `ChkDoors` enter `GAME_MODE_OPEN_DOOR` and `InitOpenDoor` (`erasedoor.asm:40`) play the
SFX (`DoorOpenSfxs`: types 1-4 → 0x19 `Sfx_Door`, types 5/6 → 0x1B `Sfx_DoorElevator`).

### Current port state
`elevatorControl()` (`:4359`, room 240) and the play loop (`:6717`) do
`if (canOpenDoor(closed)) openDoor(closed);` where `closed = closedDoorBlocking(...)` uses the door's
full **block rect** (`doorBlockRect` → `d.rect`, `:3397`). `canOpenDoor` (`:3425`) checks lock +
facing only — it does **not** call `touchDoor()` (the faithful `ChkTouchDoor` port at `:3483`, used
only for punch/bomb walls). The block rect is wider/offset from the open area, so the SFX fires a few
px early.

### Fix
Gate `openDoor` behind `touchDoor(d)` — mirror the ROM's `jp ChkTouchDoor`. Preferred: add the
`touchDoor` requirement inside `canOpenDoor`'s lock-0/1/keycard branches (whose ROM equivalents end in
`jp ChkTouchDoor`), leaving punch/lorry/wall locks (10/11/15/16) to their existing `touchDoor` checks.
Snake is still blocked by the footprint (movement unchanged); only OPEN + SFX defer to the open area.

### Risk / open questions
Confirm the type-6 open-area values (`door-types.json["6"]`) match the ROM `DoorOpenEnterDat`. Verify
the open area is reachable given the block rect for normal NSEW + elevator doors (it should be — block
rect = doorway opening, open area = approach strip).

### Acceptance
In room 240, the elevator-door SFX (0x1B) fires only when Snake reaches the doorway/open area and the
door opens — not a few px earlier. Verify a normal/keycard door too (SFX exactly when it opens).
Round-trip 31→240→back on both type-5 (floor) and type-6 (exit) doors.

---

## Issue #19 — Wrong radio sequence / should report gas mask (room 29)

**Reported room:** 29 · **Cross-room scope:** radio is shared across all rooms; the gas-mask call is
specific to room 29. Verify against other auto-tune/incoming-call rooms (0,37,53,69,99,104,108,111,
115,116,119,125,165,178,192,193).

### Behaviour / ROM source
Entering room 29 (a gas room) should ring a CALL; opening the transceiver auto-tunes to Big Boss
(freq 0x85) → text 25 "…PUT ON A GAS MASK IN THE GAS ROOM…", and after SEND on Schneider (0x79) →
text 26 "…GO TO THE SOUTH PART OF THE 1ST FLOOR TO GET YOUR MASK…". Source: `data/radiocalls.asm:45`
`RadioRoom_029` (BIGBOSS|AUTOREPLY, text 25; SCHNEIDER|WAITCALL|END, text 26); decode in
`Banks0123.asm:2413` `UpdateRadio2`; texts `data/texts.asm:30-31`; incoming-call arming
`musicradioconfig.asm:19`; room 29 is a real `GasRooms` entry (`logic/damagegas.asm`).

### Current port state — data is faithful; fault is downstream
`radiocalls.json["29"]` = `[{freq:133,autoTune:true,textId:25},{freq:121,waitCall:true,textId:26}]`
(133=0x85, 121=0x79); `texts.json` 25/26 match; `radio.json` callRooms includes 29; decode/state
machine (`:482-483`, `chkRadioReceiv :4602`, `radioTick :4534`, `setText :785`) all match. Could NOT
reproduce a defect from data/logic alone.

### Fix (confirm root cause first — do NOT change the data)
Check, in priority order:
1. **Room-id mapping / reachability:** verify the in-game gas room is exported under key `"29"` and
   the world graph routes Snake there (a mismatched internal id → wrong/empty radio lookup).
2. **Auto-tune persistence:** `openRadio()` (`:4515`) resets `autoReplyDone` but never re-applies the
   room's auto-tune freq (only applied on room ENTRY `:483`). Confirm `radioFreq===133` when the radio
   opens in room 29.
3. Else capture exact text shown vs expected and diff.

### Risk / open questions
Genuinely uncertain — radio table matches the ROM byte-for-byte, so the bug is room identity or
radio-open freq state. Needs a live repro in room 29.

### Acceptance
Enter the gas room: CALL rings; open transceiver → already on Big Boss, text 25 (gas-mask warning);
tune to Schneider + SEND → text 26 (mask location). Both gas-mask wording, in order.

---

## Issue #23 — Bottom camera dwells too long at sweep end (room 36)

**Reported room:** 36 · **Cross-room scope:** ALL non-laser surveillance cameras — rooms
14/21/27/28/31/36 (`RoomsWithCamera`). Shared dwell constant; laser cameras unaffected.

### Behaviour / ROM source
A camera reaching a sweep end pauses a random **0–127** iterations (min 1), then resumes:
`SetCamRndWait` (`Banks0123.asm:7169`) = `ld a,r / srl a / inc a if zero` → `R>>1` (0–127, min 1).
Cameras run on the actor iteration (every other 60 Hz tick), 1 px/iter.

### Current port state
`camPatrol` (`:4089`) line **4103**: `c.wait = (Math.random()*256)|0;` — range 0–255 (≈2× too long).
Pacing is otherwise correct (`cameraTick` under `(tickCounter&1)`, 1 px/iter). Room 36 camera
paths/positions in `cameras.json` are correct; the bottom cam starts right (x=240) and sweeps to its
left endpoint first, so the over-long dwell shows "on the left."

### Fix
Change `:4103` to a 0–127, min-1 value: `((Math.random()*128)|0) || 1` (faithful to `R>>1` + `inc a`
on zero). Update the misleading comments at `:4088/:4103`. No other camera change needed.

### Risk / open questions
Minor — preserve the min-1 edge. The projectile 2× flight convention does NOT apply to cameras
(iteration-gated) — don't double anything.

### Acceptance
In room 36 the bottom camera's pause tops out ~2 s (127 iters) instead of ~4 s; cameras in
14/21/27/28/31 also feel snappier and never exceed the shorter dwell.

---

## Cross-cutting (batch 4)
- **#24 + #26 are the same object** (the power switch): #26's destruction must reset the floor so #24's
  tint stops. Implement together.
- **#12 + #22** likely share a fix surface (carried `alertRespawnTimer` / reinforcement type under the
  wrong alert level).
- **#21** fix must separate guard *movement* (keep 60 Hz) from *decision/shot counters* (gate to
  30 Hz) — do not gate the whole `updateGuardOne`.
- **#15** code analysis contradicts the literal report: only the Y offset is wrong; X is faithful.
  Verify against the clip before any X change.
- **#20** is an ART fix (`barrel.png`) — the logic is already faithful.
- **#25** is likely works-as-intended — confirm with the user before any change.
- **#13 / #12 / #19** need clip/repro confirmation before coding.
- The user commits; do not run `git commit`/`git push`.
