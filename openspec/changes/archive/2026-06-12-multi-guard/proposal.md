# Multi-guard rooms

## Why

The single-guard cap was the port's last big actor infidelity: the ROM's `EnemyList` holds
up to 16 actors and 20 exported rooms place 2-5 guards (room 18 has five), but the port
spawned only the first. actors.json already carries every guard with his patrol path —
this slice spawns them all.

## What Changes

- `guards[]` replaces the singleton: `buildGuardRaw` spawns EVERY guard from the room's
  actor list (a DEMO entry stays a single guard); all per-guard logic — patrol, sleep,
  LOS, alert AI, touch, punch, shots, drops, drawing — loops the array. The `guard`
  variable remains as a synced alias for guards[0] (the suites and single-guard call
  sites read it).
- The alarm semantics follow the ROM: an alarm pulls EVERY guard into the chase; the
  alert room only counts as cleared when ALL its guards are down (`chkAlarmEnd`); the
  shared 6-bullet pool spans all shooters.
- Punches hit one victim per swing; player shots/explosions pick the first target in
  range across all guards.

## Capabilities

### Modified Capabilities

- `browser-guard`: every listed guard spawns; the alert room clears only when all die.

## Impact

- web/game.js (the guards array + parameterized logic); alarm.headless.mjs grows the
  multi-guard lifecycle checks (376 total across 15 suites).
