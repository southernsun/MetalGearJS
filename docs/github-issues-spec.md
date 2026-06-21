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
