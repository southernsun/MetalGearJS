## Context

Builds on the control-mode dispatch + tile-type data. ROM: in `RoomsWater` rooms the tile under
Snake decides water state — shallow `0x73–0x74` (anim 2), deep `0x75–0x76` (anim 4), shadow
`0x6F–0x72` depth-by-room, brick-in-water `0x6D` shallow. Control stays normal walk; only the
sprite changes (`SetSprWater*` shallow, `SetSprDeepWater` swim). Deep water without the oxygen item
drains life every 8 frames (`SetInWaterMode3`) — deferred here (no item system yet).

## Goals / Non-Goals

**Goals:** shallow/deep water entry/exit by tile, with wading/swimming sprites, reachable in one
water room. **Non-Goals:** oxygen drain/UI; box/weapons; ladders.

## Decisions

- **Water is a per-tick check, not a separate control mode** (matches the ROM: it sets
  `PlayerAnimation`, control stays normal). Read the tile under Snake via the tile-type helpers;
  set anim 2/4; restore 0 on land.
- **Shadow-water depth is room-dependent** (`RoomsWater`); the JS helper applies that rule, citing
  the room list.
- **Oxygen drain left as a gated no-op hook** (`if deepWater && !hasOxygen` → TODO) so the faithful
  hook exists without inventing an item/UI; documented as deferred.
- **Sprites via the existing export path** (wading + swim frames added like the death frames).

## Risks / Trade-offs

- **[Needs a water room exported]** → ship one shallow-water room (deep optional). Flag which.
- **[Deep-water with no oxygen item]** → drain deferred; note it clearly so it's not mistaken for
  a faithful omission.
