# browser-item-pickups — delta (item-pickups)

## ADDED Requirements

### Requirement: Rooms place their ROM items

On entering a room the game SHALL build the room's live items from the ROM placement data
(`AddRoomItems`, logic/addroomitems.asm via exported `items.json`): up to 3 items with their
(id, y, x), skipping any item whose taken flag is set. The ROM places items only in rooms
122–217; rooms outside that range SHALL have no faithful items. A clearly-flagged DEMO overlay
MAY add items to demo-cluster rooms (documented divergence, like the demo guard).

#### Scenario: A room's items appear

- **WHEN** Snake enters a room that has placement data with untaken items
- **THEN** those items (up to 3) are drawn at their ROM coordinates and are collectable

#### Scenario: Taken items don't reappear

- **WHEN** Snake re-enters a room after collecting a non-respawning item (gun, card, gear)
- **THEN** that item is not placed again

#### Scenario: Consumables respawn

- **WHEN** Snake re-enters a room whose placement holds a ration, ammo crate, or explosive
  ammo (plastic bomb / land mine / missile) he already collected
- **THEN** that item is placed again (`SetItemAsTaken` deliberately never marks them)

### Requirement: Pickup collision uses the ROM box

A room item SHALL be collected when Snake enters its ROM pickup box (`ChkTakeItem`):
`|itemY + 16 − playerY| < 16` AND `|itemX + w/2 − playerX| < r`, strict comparisons, where
32-wide items (weapons 1–4) use w/2 = 16, r = 20 and 16-wide items (weapons 5–8 and all
equipment) use w/2 = 8, r = 12 (the `WeaponGfxXY`/`ItemGfxXY` odd-X size rule).

#### Scenario: Walking over an item collects it

- **WHEN** Snake's position enters an item's pickup box
- **THEN** the item is collected, removed from the room, and a pickup cue plays

#### Scenario: Near the box edge is a miss

- **WHEN** Snake stands exactly at the box edge (e.g. 12px lateral of a 16-wide item)
- **THEN** the item is not collected (strict comparisons)

### Requirement: Collected items grant their ROM amounts

Collection SHALL dispatch as the ROM does (`ChkTakeItem4`): a **weapon** is added to the
weapon inventory with `ItemTakeAmount` ammo (0 for guns 1–4 — ammo comes from crates; 5 for
plastic bombs / mines / missiles), and Snake's FIRST weapon auto-selects unless it is the
grenade launcher (`GetWeapon3`); the **suppressor** sets the `InvSupressor` flag, after which
firing the handgun no longer runs the noise alert check (`ChkHandGunShot`); an **ammo crate**
grants +20 handgun, +20 SMG, +6 grenades, +2 rockets — to weapons already owned only
(`PickAmmoCrate`); an **equipment item** is added to the item inventory (inventory id =
pickup id − 8) or its units increment (ration +1; a card's units hold its identification
number). All amounts SHALL clamp to the rank-1 maxima (`MaxAmmoLv1`: handgun/SMG 50,
grenades 15, others 5; rations 3).

#### Scenario: First weapon auto-selects

- **WHEN** Snake (owning no weapons) picks up the handgun
- **THEN** the handgun is in the inventory with 0 ammo and becomes the selected weapon

#### Scenario: Ammo crate fills only owned guns

- **WHEN** Snake owns only the handgun and collects an ammo crate
- **THEN** handgun ammo rises by 20 (clamped at 50) and no other weapon appears

#### Scenario: Suppressor silences the handgun

- **WHEN** Snake owns the suppressor and fires the handgun in a non-secure room
- **THEN** no alarm is raised by the shot's noise

#### Scenario: Rations accumulate to their cap

- **WHEN** Snake collects rations repeatedly
- **THEN** the ration count rises by 1 each time and never exceeds 3 (rank 1)

### Requirement: A punch-killed guard may drop an item

When the third punch kills a guard, the game SHALL roll the ROM drop (`ChkDropItem`,
Banks0123.asm: `(r>>2)&3` — 0 spawns a ration, 1 an ammo crate, ≥2 nothing) and spawn the
item at the guard's body (X−8, Y−4) via `SpawnItem`: only one spawned item per room, and only
if the room's first item slot is free. Shot-killed guards SHALL NOT drop (the ROM calls
`ChkDropItem` only from the punch path).

#### Scenario: A punch kill can drop a ration or ammo crate

- **WHEN** the third punch kills the guard and the roll is 0 or 1
- **THEN** a ration (0) or ammo crate (1) appears at the guard's position and can be picked up

#### Scenario: A shot kill never drops

- **WHEN** a guard dies to a handgun bullet
- **THEN** no item spawns
