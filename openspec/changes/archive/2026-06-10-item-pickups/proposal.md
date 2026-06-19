# Item/weapon pickups in rooms

## Why

The inventory is a stub: every weapon and item is seeded as owned ("full loadout for now —
function later"), the handgun starts with hand-seeded ammo, and nothing can ever be picked up —
the ROM's entire acquisition loop (`logic/items.asm`, `logic/addroomitems.asm`,
`logic/spawnitem.asm`) is missing. This blocks guard item drops (flagged as a divergence in the
shots slice), the suppressor's silent-fire effect, ration/ammo economies, and makes the
equipment menus cosmetic.

## What Changes

- **Real inventory**: Snake starts with NOTHING (faithful — the infiltration starts empty);
  `Weapons` and `Equipment` become pickup-order inventories (first-empty-slot fill =
  insertion order, as `GetWeapon3`/`AddItemInventory` do). The seeded full loadout, seeded
  handgun ammo, and the "only handgun ammo is tracked" divergence are removed. Menus and
  quick-select operate over what has actually been collected.
- **Room items**: a Node exporter parses `data/itemsinrooms.asm` into `web/assets/items.json`
  (the ROM places items only in rooms 122–217 — none of the currently exported cluster, which
  is faithful). `addRoomItems` ports the ROM loader: up to 3 items per room, skipping items
  whose taken-flag is set (`WeaponsTaken`/`ItemsTaken`). A small clearly-flagged DEMO overlay
  places a few items in the demo cluster (like the existing demo guard) so the loop is
  playable today.
- **Pickup** (`ChkTakeItem`): box `|itemY+16 − playerY| < 16` and `|itemX + w/2 − playerX| <
  r` (w/2=16, r=20 for 32-wide weapons 1–4; w/2=8, r=12 for everything else — the
  `WeaponGfxXY`/`ItemGfxXY` odd-X size rule), strict comparisons. Dispatch per the ROM:
  weapons add + grant `ItemTakeAmount` (0 for guns, 5 for explosives) and the FIRST weapon
  auto-selects (unless it's the grenade launcher); the suppressor sets `InvSupressor` — the
  handgun goes silent (`ChkHandGunShot` skips `ChkAlertTrigger`); the ammo crate grants
  +20/+20/+6/+2 to owned guns only (`PickAmmoCrate`); items add to Equipment (inventory id =
  pickup id − 8) with their amounts (ration +1); everything clamps to the rank-1 maxima
  (`MaxAmmoLv1`: 50/50/15/5…, rations 3).
- **Taken flags** (`SetItemAsTaken`): guns/cards/gear never respawn; explosives, rations and
  ammo crates do (the ROM deliberately skips marking them).
- **Guard drops** (`ChkKillPunching` → `ChkDropItem` → `SpawnItem`): the third PUNCH kill
  rolls `(r>>2)&3`; 0 spawns a ration, 1 an ammo crate (50%), at the guard's body, one
  spawned item per room. Shot kills don't drop (faithful — `ChkDropItem` is only on the punch
  path). This closes the "no drops" divergence from player-shots-hit-enemies.
- Floor items render using the exported HUD icon sheet (same `GfxItems` family — documented
  approximation of the dedicated `WeaponGfxXY`/`ItemGfxXY` bitmaps).

## Capabilities

### New Capabilities

- `browser-item-pickups`: items placed in rooms from ROM data, the pickup box and dispatch,
  grant amounts and clamps, taken-flag respawn rules, and enemy item drops.

### Modified Capabilities

- `browser-player-items`: the owned set is no longer seeded — it is the real pickup-order
  inventory (weapons with ammo, items with units, suppressor flag); selection/menus operate
  over it; ammo/units display generalizes beyond the handgun.

## Impact

- `web/game.js`: inventory rework (`weapons`/`items` Maps + `invSuppressor`), room-item
  state in `setRoom`, pickup/dispatch/drop logic, item rendering, menu/HUD ammo from the
  inventory, suppressor gate in `firePlayerShot`.
- New `Tools/export-items.mjs` + `web/assets/items.json`.
- `web/hud.headless.mjs` and `web/menu.headless.mjs` need adaptation (they poke the old
  seeded inventory); new `web/items.headless.mjs`.
- Coverage map (`logic/items.asm`, `logic/addroomitems.asm`, `logic/spawnitem.asm`,
  `logic/maxammo.asm` routines) + SESSION-STATE.
