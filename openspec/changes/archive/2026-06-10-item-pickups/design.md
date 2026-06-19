# Design — item-pickups

## Context

ROM facts (verified in the disassembly this session):

- **ID spaces**: pickup IDs are 1–35 (`constants/Enums.asm`): weapons 1–7, SUPRESSOR 8,
  items 9+ (ARMOR 9 … CARD1 0x16, RATION 0x1E, AMMO_CRATE 0x23). Equipment inventory stores
  pickup id − 8 (`AddItemInventory` does `sub SUPRESSOR`), which is exactly the existing
  `SELECTED_*` space (CARD1 pickup 0x16 → SELECTED_CARD1 0x0E ✓).
- **Placement** (`AddRoomItems`, logic/addroomitems.asm): only rooms 122–217 have items
  (`idxRoomItemsIdx[room−122]` → `idxRoomItems` set → (ID, Y, X) triplets, 0xFF-terminated,
  max 3 live items). Items whose taken flag is set are skipped. The rocket launcher is gated
  on the Schneider radio event (`JeniRocketF`) — radio isn't ported, so it would never
  appear; we omit it with a comment. **No currently exported room is in 122–217**, so the
  faithful dataset places nothing in the demo cluster; a flagged DEMO overlay (like the
  room-0 demo guard) provides in-cluster items.
- **Size rule** (`DrawRoomItems`/`WeaponGfxXY`/`ItemGfxXY`): odd gfx X ⇒ 16×16. Weapons 1–4
  are 32×16; weapons 5–8 and ALL items are 16×16.
- **Pickup box** (`ChkTakeItem`): `|itemY + 16 − playerY| < 16` then
  `|itemX + NX/2 − playerX| < radius`; 32-wide: NX/2 = 0x10, radius = 0x14 (20); 16-wide:
  NX/2 = 8, radius = 0x0C (12). Strict `<` (`cp`/`ret nc`).
- **Dispatch** (`ChkTakeItem4`): AMMO_CRATE → `PickAmmoCrate` (+0x20 handgun, +0x20 SMG,
  +6 grenades, +2 rockets — only for weapons already in the inventory, `GetWeaponInvAdd`
  carry check); id < 8 → `PickUpWeapon`; id 8 → `PickSupressor` (`InvSupressor` flag —
  `ChkHandGunShot` then plays SFX 0x0E and SKIPS `ChkAlertTrigger`: silent fire); else item →
  add to Equipment or increment units.
- **Amounts** (`ItemTakeAmount[id−1]`, data/itemtakeamount.asm): guns 1–4 grant 0 (ammo
  comes from crates), explosives 5–7 grant 5, cards grant 0x31–0x38 (the card's
  identification number, stored as the units byte), RATION grants 1. Ammo is BCD in the ROM
  (`daa` + tens/units + hundreds bytes); we use plain integers — equivalent values,
  documented divergence.
- **Clamps** (`SetMaxAmmoVals`/`ChkMaxAmount`, logic/maxammo.asm): rank-1 maxima
  (`MaxAmmoLv1`) handgun 50, SMG 50, grenade 15, rocket/bomb/mine/missile 5; rations max 3.
  Rank progression isn't ported; rank-1 values apply.
- **First weapon auto-selects** (`GetWeapon3`): picking your first weapon sets
  `SelectedWeapon` — unless it is the grenade launcher. Inventory order is first-empty-slot =
  pickup order (menus show pickup order via `CompactWeapons`; a JS `Map` preserves insertion
  order, matching for free).
- **Taken flags** (`SetItemAsTaken`): mark guns 1–4 and items ≥ ARMOR; do NOT mark
  explosives 5–7, RATION, AMMO_CRATE (they respawn on re-entry).
- **Drops** (`ChkDropItem` Banks0123.asm:12832 → `SpawnItem` logic/spawnitem.asm): third
  PUNCH kill only (the shot-kill path never reaches it), and due to a ROM bug only
  ID_GUARD_SLOW drops — which is our guard's type, so the bug costs nothing. Roll
  `(r>>2)&3`: 0 → ration, 1 → ammo crate, ≥2 → nothing. Spawn at (X−8, Y−4), only if no item
  is in slot 0 and nothing was spawned in this room before (`SpawnedItems` latch), SFX 0x25.
- **Pickup SFX 0x24** — not exported; a short synth blip stands in (same convention as
  playShot/playHit).

## Goals / Non-Goals

**Goals:**
- The full ROM acquisition loop: empty start, room items from ROM data, pickup box/dispatch/
  amounts/clamps, taken-flag respawn rules, suppressor silence, punch-kill drops.
- Menus/HUD read the real inventory (ammo for every owned weapon, ration units).
- items.json exporter from the disassembly; demo overlay clearly flagged.

**Non-Goals:**
- The trash-bag equipment-recovery event (`RecoverEquipment`), transmitter, antenna radio
  hook (`IncomingCallTimer`) — need radio/capture systems.
- Item description text boxes (`ItemTakeText`/`SetText`) — no text-window system yet.
- Rank-based max-ammo growth (`MaxAmmoLv2-4`) — rank progression isn't ported.
- BCD ammo arithmetic (plain integers, same values).
- The rocket-launcher placement gate (`JeniRocketF`) — omitted until radio events exist.

## Decisions

1. **Inventory model**: `const weapons = new Map()` (weapon id → ammo), `const items = new
   Map()` (SELECTED id → units), `let invSuppressor = false`. `ownedWeapons`/`ownedItems`
   become accessors over the Maps so the menus/quick-select/cycle code keeps its shape.
   Insertion order = pickup order = ROM slot order.
2. **Death/restart keeps the inventory** (the ROM's continue keeps your equipment; only life
   and position reset in our slice restart). The old ammo re-seed on restart is dropped.
3. **Exporter is Node, not C#**: `Tools/export-items.mjs` parses `data/itemsinrooms.asm`
   text (the coverage tool already parses .asm in JS) and writes `web/assets/items.json`:
   `{ room: [{id, y, x}], ... }`. No dotnet required; re-runnable.
4. **Demo overlay in code**: `DEMO_ITEMS` table in game.js (room → triplets) merged after the
   faithful data, marked as a divergence in comments and SESSION-STATE — mirrors the demo
   guard precedent. Headless checks assert the demo positions sit on open floor.
5. **Floor-item rendering** uses `hud-icons.png` atlas entries (`w<id>` / `i<id−8>`) at the
   item's (x, y) — the ROM blits dedicated 16/32-wide bitmaps from the same graphics bank;
   the icon art is the closest existing export (documented approximation; a dedicated
   `--export-floor-items` can replace it later).
6. **Suppressor wiring**: `firePlayerShot` skips `chkAlertTrigger()` when `invSuppressor`
   (ChkHandGunShot's `call z, ChkAlertTrigger`). The sleeping-guard noise path needs no
   change (already alarm-driven).

## Risks / Trade-offs

- [Empty start changes the demo feel — punch-only until the demo handgun is found] →
  intended; it is the ROM's opening, and the demo overlay puts a handgun nearby.
- [hud/menu headless suites poke the old seeded inventory] → adapt them to seed via the new
  API (pickup calls or direct Map writes) — test-only churn, asserted green in tasks.
- [Demo items could land on solid tiles] → headless check validates each DEMO_ITEMS position
  against the exported collision maps.
- [Math.random for the drop roll] → same stand-in convention as the guard AI's `ld a,r`
  (rndByte), already documented there.
