# Tasks — item-pickups

## 1. Data export

- [x] 1.1 Write `Tools/export-items.mjs`: parse `data/itemsinrooms.asm` (idxRoomItemsIdx for
      rooms 122–217 → idxRoomItems → (ID, Y, X) triplets, 0xFF-terminated) resolving the item
      ID constants from `constants/Enums.asm`; write `web/assets/items.json` as
      `{ "<room>": [{"id":n,"y":n,"x":n}], ... }`. Omit the rocket launcher (JeniRocketF gate
      — radio events unported; documented). Validate triplet counts ≤ 3 live per room.
- [x] 1.2 Run the exporter; sanity-check a few rooms against the .asm by hand (e.g. room 122's
      set, a card room, a multi-item room).

## 2. Inventory rework

- [x] 2.1 Replace the seeded loadout in web/game.js: `weapons` Map (id → ammo), `items` Map
      (SELECTED id → units), `invSuppressor` flag; empty start; `selectedWeapon = 0`,
      `selectedItem = 0`. Keep `ownedWeapons`/`ownedItems` API shape as accessors (Map
      insertion order = ROM pickup-slot order). Remove `HANDGUN_START_AMMO`/`handgunAmmo`
      (ammo lives in the Map); `restart()` keeps the inventory (ROM continue keeps equipment).
- [x] 2.2 `firePlayerShot`: ammo from the Map; skip `chkAlertTrigger()` when `invSuppressor`
      (ChkHandGunShot's `call z, ChkAlertTrigger`). Menus/HUD: ammo for every owned weapon
      (suppressor shows none), ration units in the item menu; `renderHud` ammo for the
      selected weapon from the Map.

## 3. Room items + pickup + drops

- [x] 3.1 Port `AddRoomItems`: on `setRoom`, build `roomItems` from items.json minus taken
      flags (`weaponsTaken`/`itemsTaken` Sets per `SetItemAsTaken` rules), max 3; merge the
      flagged `DEMO_ITEMS` overlay (demo-cluster rooms; divergence comment); reset the
      per-room `spawnedItem` latch. Draw items via hud-icons.png (`w<id>` / `i<id−8>`) at
      (x, y) — documented approximation.
- [x] 3.2 Port `ChkTakeItem`: per tick in play mode, the ROM pickup box (Y: ±16 around
      itemY+16; X: ±20 around itemX+16 for 32-wide weapons 1–4, ±12 around itemX+8
      otherwise; strict `<`), then the dispatch: PickUpWeapon (ItemTakeAmount grant,
      first-weapon auto-select except grenade launcher, mark taken for guns 1–4),
      PickSupressor, PickAmmoCrate (+20/+20/+6/+2 owned-only), item add/increment
      (ration +1, cards store their number), all clamped to MaxAmmoLv1 (50/50/15/5…,
      rations 3). Pickup synth blip (SFX 0x24 stand-in).
- [x] 3.3 Port `ChkDropItem`/`SpawnItem`: third-punch kill rolls `(rnd>>2)&3` → 0 ration /
      1 ammo crate / else nothing, spawned at (guardX−8, guardY−4) when slot 0 free and
      nothing spawned in the room yet; shot kills never drop. Wire into `tryPunchGuard`'s
      kill path before `killGuard()`.

## 4. Headless checks

- [x] 4.1 Adapt `web/hud.headless.mjs` and `web/menu.headless.mjs` to the real inventory
      (seed via the Maps/pickup calls instead of the old seeded sets).
- [x] 4.2 Add `web/items.headless.mjs`: pickup-box boundaries (strict <, both sizes); empty
      start; handgun pickup auto-selects with 0 ammo; ammo crate +20 owned-only, clamp at 50;
      ration +1 cap 3; card pickup → its SELECTED id usable on keycard doors; suppressor →
      firing raises no alarm; taken gun doesn't respawn on re-entry, ration does; punch-kill
      drop (forced roll) spawns at the guard and is collectable; shot kill never drops; demo
      item positions sit on open floor in their rooms' collision maps.
- [x] 4.3 All suites green (`hud`, `menu`, `alarm`, `shots`, `touch`, `items`) +
      `node --check web/game.js`.

## 5. Coverage + docs

- [x] 5.1 Coverage map: add `logic/items.asm`, `logic/addroomitems.asm`, `logic/spawnitem.asm`,
      `logic/maxammo.asm` (+ `GetItemAmount`, `GetItemInvAdd` extras) to a fitting component
      (player-weapons or a new pickups component); statuses per what's ported
      (RecoverEquipment/text/rank-growth stay todo). Regenerate docs/rom-coverage.md.
- [x] 5.2 SESSION-STATE.md: pickups shipped (note demo overlay + icon-art + integer-BCD +
      kept-inventory-on-restart divergences); remove the pickups gap; update check counts +
      export instructions (`node Tools/export-items.mjs`).

## 6. Manual verification

- [x] 6.1 Interactive pass: start unarmed; collect the demo handgun (auto-selected, 0 ammo —
      click on fire); punch-kill the guard until a drop, collect the ammo crate (+20) and
      fire; collect the suppressor and confirm silent fire (no alarm); ration to 3 (cap);
      leave/re-enter: gun gone, ration back.
