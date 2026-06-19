# Design — multi-guard rooms

## Context

The ROM's `EnemiesLogic` walks the 16-slot EnemyList running each actor's logic; the
port's guard systems were all written against a single `guard` object (154 references)
with every behaviour already shipped and suite-pinned.

## Decisions

1. **`guards[]` + the `guard` alias**: the array is the truth; `guard` stays as a synced
   pointer to guards[0] so the existing suites (which build single-guard rooms and read
   `guard`) keep passing unchanged in semantics. The alias re-syncs after build, each
   updateGuard pass, and kills.
2. **Parameter shadowing**: `updateGuardOne(guard)` keeps the old body intact by naming
   its parameter `guard` — only the inner `guardSeesSnake()` call needed an explicit
   argument (its default reads the module alias, not the shadowed name).
3. **Per-guard loops**: chkTouchGuard (damage gated by the i-frames as before), the punch
   (first victim per swing, like the ROM's loop break), shotTarget spreads over
   [...guards, prisoner, boss], drawGuard loops.
4. **Alarm**: buildGuard alerts every guard when entering the alert room; chkAlarmEnd's
   "room cleared" = guards.length === 0 (the ROM scans the EnemyList for living guards).
5. Suites that simulated kills by nulling the alias now also empty the array (5 lines in
   alarm.headless).

## Risks / Trade-offs

- [Crowded rooms + the 6-bullet cap] → the ROM's own cap; alert AI already commits to
  directions so packs don't perfectly stack.
- [Performance] → trivial (≤5 small objects per room).
