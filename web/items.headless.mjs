// Headless verification for item-pickups (task 4.2). Loads the REAL web/game.js in a vm sandbox
// with mocked DOM, strips the trailing main(), and appends asserts in the same scope.
// Run: node web/items.headless.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeGlobalMasks, pointReachable } from '../Tools/check-graph.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const calls = [];
function makeCtx() {
  const rec = {};
  for (const m of ['scale','clearRect','fillRect','strokeRect','drawImage','fillText','beginPath',
                   'moveTo','lineTo','closePath','fill','stroke','save','restore','clip','rect','transform','translate'])
    rec[m] = () => calls.push(m);
  rec.measureText = () => ({ width: 0 });
  rec.fillStyle = '#000'; rec.strokeStyle = '#000'; rec.font = ''; rec.lineWidth = 1;
  rec.textAlign = 'left'; rec.textBaseline = 'top'; rec.imageSmoothingEnabled = false;
  return rec;
}
const recCtx = makeCtx();
const el = () => ({ getContext: () => recCtx, addEventListener(){}, classList:{add(){},remove(){}}, style:{}, blur(){}, width:0, height:0 });
const sandbox = {
  console, Math, Date, JSON, Set, Map, Array, Object, URLSearchParams, isNaN, parseInt, parseFloat,
  requestAnimationFrame: () => 0,
  document: { getElementById: () => el(), addEventListener(){} },
  window: { addEventListener(){}, AudioContext: undefined, webkitAudioContext: undefined },
  location: { search: '', hash: '', href: '' },
  fetch: () => Promise.reject(new Error('no fetch in harness')),
  Image: class { set src(_) {} },
  performance: { now: () => 0 },
};
sandbox.globalThis = sandbox;

let src = fs.readFileSync(path.join(dir, 'game.js'), 'utf8').replace(/\bmain\(\);\s*$/, '// main() stripped\n');
const results = [];
sandbox.__check = (name, cond, extra='') => results.push({ name, ok: !!cond, extra });
// Real exported data + collision maps for the demo rooms.
sandbox.__itemsJson = JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'items.json'), 'utf8'));
sandbox.__texts = JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'texts.json'), 'utf8'));
// GLOBAL reachability (walked from Snake's spawn) for demo placement validation.
const reach = computeGlobalMasks();
sandbox.__reachable = (room, px, py) =>
  !!reach.masks[room] && pointReachable(reach.coll[room], reach.masks[room], px, py);

const test = `
;(function(){
  const C = () => ({ width:32, height:24, solid:new Array(32*24).fill(0), tiles:new Array(32*24).fill(0) });
  function reset(){ alertMode=false; redAlertFlag=false; roomAlert=-1; gameState='play';
    currentRoom=0; assets.collision=C(); bullets.length=0; playerShots.length=0;
    snake.x=200; snake.y=150; snake.dir='down'; snake.state='idle'; snake.anim=ANIM_NORMAL;
    snake.life=snake.maxLife=24; snake.invulnTimer=0; guard=null;
    weapons.clear(); items.clear(); invSuppressor=false; selectedWeapon=0; selectedItem=0;
    weaponsTaken.clear(); itemsTaken.clear(); itemsData={}; roomItems=[null,null,null]; spawnedItemLatch=false;
    textBox=null; textReturnState='play'; }
  const live = () => roomItems.filter(Boolean);   // occupied slots (ItemsInTheRoom holes don't compact)

  // --- empty start (InitPlayerVars: the infiltration starts with nothing) ---
  reset();
  __check('empty start: nothing owned, unarmed', weapons.size===0 && items.size===0
          && selectedWeapon===0 && selectedItem===0);

  // --- exported ROM data sample (items.json vs data/itemsinrooms.asm) ---
  __check('items.json: room 122 = CARD3 + ammo crate',
          JSON.stringify(__itemsJson['122'])===JSON.stringify([{id:24,y:112,x:66},{id:35,y:64,x:160}]));
  __check('items.json: ROM rooms only (122-217)',
          Object.keys(__itemsJson).every(r => +r >= 122 && +r <= 217));

  // --- pickup box (ChkTakeItem): 16-wide |y+16-sy|<16 & |x+8-sx|<12; 32-wide x+16, r=20 ---
  reset(); roomItems=[{id:0x1E, y:100, x:100}, null, null];      // ration (16-wide), centre (108,116)
  snake.x=108+12; snake.y=116; chkTakeItems();
  __check('16-wide: X edge 12 is a miss (strict <)', live().length===1);
  snake.x=108+11; chkTakeItems();
  __check('16-wide: X 11 collects', live().length===0 && items.get(SELECTED_RATION)===1);
  reset(); roomItems=[{id:0x1E, y:100, x:100}, null, null];
  snake.x=108; snake.y=116+16; chkTakeItems();
  __check('16-wide: Y edge 16 is a miss (strict <)', live().length===1);
  reset(); roomItems=[{id:1, y:100, x:100}, null, null];         // handgun (32-wide), centre (116,116)
  snake.x=116+20; snake.y=116; chkTakeItems();
  __check('32-wide: X edge 20 is a miss (strict <)', live().length===1);
  snake.x=116+19; chkTakeItems();
  __check('32-wide: X 19 collects', live().length===0 && weapons.has(HAND_GUN));

  // --- first weapon auto-selects with 0 ammo (GetWeapon3 + ItemTakeAmount) ---
  reset(); takeItem(1);
  __check('handgun first: auto-selected, 0 ammo', selectedWeapon===HAND_GUN && weapons.get(HAND_GUN)===0);
  reset(); takeItem(3);                                          // grenade launcher first
  __check('grenade launcher first: NOT auto-selected', weapons.has(GRENADE_LAUNCHER) && selectedWeapon===0);
  reset(); takeItem(1); takeItem(5);                             // plastic bomb grants 5
  __check('plastic bomb grants 5 rounds', weapons.get(5)===5);

  // --- ammo crate: +20 to owned guns only, clamp at 50 (PickAmmoCrate / MaxAmmoLv1) ---
  reset(); takeItem(1); takeItem(0x23);
  __check('crate: handgun +20, SMG not granted', weapons.get(HAND_GUN)===20 && !weapons.has(SUB_MACHINE_GUN));
  takeItem(0x23); takeItem(0x23);
  __check('crate: handgun clamps at 50', weapons.get(HAND_GUN)===50, 'ammo='+weapons.get(HAND_GUN));

  // --- rations: +1, cap 3 (MaxRations rank 1) ---
  reset(); takeItem(0x1E); takeItem(0x1E); takeItem(0x1E); takeItem(0x1E);
  __check('rations cap at 3', items.get(SELECTED_RATION)===3, 'n='+items.get(SELECTED_RATION));

  // --- cards land on their SELECTED ids (pickup id - 8; lock mapping intact) ---
  reset(); takeItem(0x19); takeItem(0x1A);
  __check('card4/card5 -> SELECTED 0x11/0x12', items.has(SELECTED_CARD4) && items.has(SELECTED_CARD5)
          && cardItemForLock(5)===SELECTED_CARD4 && cardItemForLock(6)===SELECTED_CARD5);

  // --- suppressor: flag set, handgun fire raises no alarm (ChkHandGunShot skips ChkAlertTrigger) ---
  reset(); takeItem(1); weapons.set(HAND_GUN, 5);
  fireQueued = true; chkWeaponShot();
  __check('unsuppressed fire raises the alarm', alertMode===true);
  reset(); takeItem(1); takeItem(8); weapons.set(HAND_GUN, 5);
  fireQueued = true; chkWeaponShot();
  __check('suppressed fire stays silent', invSuppressor===true && alertMode===false);

  // --- taken flags: guns never respawn, consumables do (SetItemAsTaken) ---
  // (room 5 — outside the DEMO overlay rooms, so only the injected data places items)
  reset(); itemsData={'5':[{id:1,y:100,x:100},{id:0x1E,y:100,x:140}]};
  buildRoomItems(5);
  __check('room places its items', live().length===2);
  snake.x=116; snake.y=116; chkTakeItems();                      // grab the gun
  snake.x=148; chkTakeItems();                                   // grab the ration
  buildRoomItems(5);                                             // re-enter the room
  __check('gun gone, ration respawned', live().length===1 && live()[0].id===0x1E);

  // --- punch-kill drops (ChkDropItem 50%: ration/crate at guard-8,-4); shot kills never drop ---
  let drops=0, badDrop=false, sawCrate=false, sawRation=false;
  for (let t=0; t<200 && !(sawCrate && sawRation); t++) {
    reset(); guardsData={'0':{x:120,y:100,dir:'left'}}; buildGuardRaw(0);
    snake.x=132; snake.y=100; snake.dir='left'; guard.punchesCnt=2; tryPunchGuard();
    const it=roomItems[0];
    if (it) {
      drops++;
      if (it.id===0x23) sawCrate=true; else if (it.id===0x1E) sawRation=true; else badDrop=true;
      if (!(it.x===112 && it.y===96)) badDrop=true;
    }
  }
  __check('punch kill drops at the body (rations AND ammo crates both occur)',
          drops>0 && sawCrate && sawRation && !badDrop,
          'drops='+drops+' crate='+sawCrate+' ration='+sawRation);
  let shotDrops=0;
  for (let t=0; t<20; t++) {
    reset(); guardsData={'0':{x:120,y:100,dir:'left'}}; buildGuardRaw(0);
    playerShots.push({x:120,y:84,vx:0,vy:0,range:10}); updatePlayerShots(); updateGuard();
    shotDrops += live().length;
  }
  __check('shot kills never drop', shotDrops===0);

  // --- one spawn per room; spawn requires only SLOT 0 free (SpawnItem2 checks slot 0 alone) ---
  reset(); spawnItem(0x1E, 50, 50); spawnItem(0x23, 60, 60);
  __check('only one spawned item per room', live().length===1 && roomItems[0].id===0x1E);
  reset(); roomItems=[{id:0x1E,y:10,x:10}, null, null]; spawnItem(0x23, 60, 60);
  __check('no spawn while slot 0 is occupied', live().length===1 && roomItems[0].id===0x1E);
  // Regression (reported in play): a stocked room blocks drops only until the SLOT-0 item is
  // collected — slots 1/2 staying full must NOT block the drop (slots never compact).
  reset(); itemsData={'5':[{id:1,y:100,x:100},{id:0x1E,y:100,x:140},{id:0x12,y:100,x:180}]};
  buildRoomItems(5);
  snake.x=116; snake.y=116; chkTakeItems();                      // take the slot-0 gun only
  let drop2=null;
  for (let t=0; t<60 && !drop2; t++) {
    guardsData={'5':{x:60,y:60,dir:'left'}}; buildGuardRaw(5);
    snake.x=72; snake.y=60; snake.dir='left'; guard.punchesCnt=2; tryPunchGuard();
    drop2 = roomItems[0];
  }
  __check('drop lands in slot 0 while slots 1/2 hold items',
          !!drop2 && !!roomItems[1] && !!roomItems[2], JSON.stringify(roomItems));

  // Regression (reported in play): room 0 must stay item-free — AddRoomItems compacts on every
  // entry, so a respawning item would retake slot 0 and block a punch-kill drop.
  reset(); buildRoomItems(0);
  __check('room 0 places no items', live().length===0);
  let drop3=null;
  for (let t=0; t<60 && !drop3; t++) {
    buildRoomItems(0);                                   // fresh room entry (resets the latch)
    guardsData={'0':{x:120,y:100,dir:'left'}}; buildGuardRaw(0);
    snake.x=132; snake.y=100; snake.dir='left'; guard.punchesCnt=2; tryPunchGuard();
    drop3 = roomItems[0];
  }
  __check('kills in room 0 can drop (nothing collected first)', !!drop3);

  // (the DEMO_ITEMS reachability check was removed along with the demo overlay)

  // --- pickup descriptions: the Western gate (ItemTakeText, logic/items.asm:399-414) ---
  textsData = __texts;
  __check('ItemTakeText anchors (handgun->16, card1->11, ration->8)',
          ITEM_TAKE_TEXT[HAND_GUN-1]===16 && ITEM_TAKE_TEXT[0x16-1]===11 && ITEM_TAKE_TEXT[P_RATION-1]===8,
          [ITEM_TAKE_TEXT[HAND_GUN-1], ITEM_TAKE_TEXT[0x15], ITEM_TAKE_TEXT[P_RATION-1]].join(','));
  // Taking the room's LAST item: the lookup resolves but the !JAPANESE gate suppresses it.
  reset(); roomItems=[{id:1, y:100, x:100}, null, null];
  snake.x=116; snake.y=116; chkTakeItems();
  __check('last-item pickup stays silent (Western gate)', live().length===0 && gameState==='play' && textBox===null);
  // A non-last pickup never reaches the lookup at all.
  reset(); roomItems=[{id:0x1E, y:100, x:100}, {id:0x12, y:200, x:40}, null];
  snake.x=108; snake.y=116; chkTakeItems();
  __check('non-last pickup: silent too', live().length===1 && textBox===null);
  // Text 62 (the post-capture equipment recovery) passes the gate — unit-level: pickup id 34
  // is the ItemTakeText entry that maps to 62; the capture flow that places it isn't ported.
  reset(); chkItemTakeText(34);
  __check('text 62 passes the gate (ready for the capture flow)',
          gameState==='text' && textBox && textBox.id===62, 'id='+(textBox&&textBox.id));

  // ChkUsingArmor (touchenemy.asm): the bullet-proof vest (item 1) selected halves incoming damage.
  reset(); snake.maxLife=24; snake.life=24; snake.invulnTimer=0; selectedItem=0;
  damage(8);
  __check('no armor: full damage', snake.life===16, 'life='+snake.life);
  snake.life=24; snake.invulnTimer=0; selectedItem=SELECTED_ARMOR;
  damage(8);
  __check('armor selected: damage halved (>>1)', snake.life===20, 'life='+snake.life);
})();
`;

vm.createContext(sandbox);
try { vm.runInContext(src + test, sandbox, { filename: 'game.js+test' }); }
catch (e) { console.error('HARNESS ERROR:', e); process.exit(2); }

let pass = 0;
for (const r of results) { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.extra ? '  ['+r.extra+']' : '')); if (r.ok) pass++; }
console.log(`\n${pass}/${results.length} checks passed`);
process.exit(pass === results.length ? 0 : 1);
