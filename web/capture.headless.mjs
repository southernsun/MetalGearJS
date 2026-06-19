// Headless verification for the capture flow (CommonLogic :26 trigger, CaptureSceneLogic /
// CaptureGuardsLogic, PutInPrison, ChkPrisonWalls, RecoverEquipment — logic/capturescene.asm,
// logic/doors/opendoor.asm:286, logic/items.asm:295). Loads the REAL web/game.js + exported
// data and runs: trigger in room 8 -> the scripted two-guard scene with unskippable texts ->
// fade -> prison 165 with EquipRemoved -> punch out the cell wall (40 hits) -> the bag in 168
// restores everything + plants the bugged transmitter. Run: node web/capture.headless.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const calls = [];
function makeCtx() {
  const rec = {};
  for (const m of ['scale','clearRect','fillRect','strokeRect','drawImage','fillText','beginPath',
                   'moveTo','lineTo','closePath','fill','stroke','save','restore','clip','rect','transform','translate'])
    rec[m] = (...a) => calls.push({ m, a });
  rec.measureText = () => ({ width: 0 });
  rec.fillStyle = '#000'; rec.strokeStyle = '#000'; rec.font = ''; rec.lineWidth = 1;
  rec.textAlign = 'left'; rec.textBaseline = 'top'; rec.imageSmoothingEnabled = false;
  return rec;
}
const recCtx = makeCtx();
const el = () => ({ getContext: () => recCtx, addEventListener(){}, classList:{add(){},remove(){}}, style:{}, blur(){}, width:0, height:0 });
const sandbox = {
  console, Math, Date, JSON, Set, Map, Array, Object, URLSearchParams, isNaN, parseInt, parseFloat, String, Number,
  requestAnimationFrame: () => 0,
  document: { getElementById: () => el(), addEventListener(){} },
  window: { addEventListener(){}, AudioContext: undefined, webkitAudioContext: undefined },
  location: { search: '', hash: '', href: '' },
  fetch: () => Promise.reject(new Error('no fetch in harness')),
  Image: class { set src(_) {} },
  performance: { now: () => 0 },
};
sandbox.globalThis = sandbox;
sandbox.__doors = JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'doors.json'), 'utf8'));
sandbox.__dtypes = JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'door-types.json'), 'utf8'));
sandbox.__texts = JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'texts.json'), 'utf8'));
sandbox.__items = JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'items.json'), 'utf8'));
sandbox.__actors = JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'actors.json'), 'utf8'));
for (const r of [8, 165, 164, 168, 166, 167])
  sandbox['__coll' + r] = JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'rooms', r + '.collision.json'), 'utf8'));

let src = fs.readFileSync(path.join(dir, 'game.js'), 'utf8').replace(/\bmain\(\);\s*$/, '// main() stripped\n');
const results = [];
sandbox.__check = (name, cond, extra='') => results.push({ name, ok: !!cond, extra });

const test = `
;(function(){
  doorsData = __doors; doorTypes = __dtypes; doorGfx = {}; textsData = __texts; itemsData = __items;
  actorsData = __actors;
  rooms.set(8,   { img: null, collision: __coll8 });
  rooms.set(165, { img: null, collision: __coll165 });
  rooms.set(164, { img: null, collision: __coll164 });
  rooms.set(168, { img: null, collision: __coll168 });
  rooms.set(166, { img: null, collision: __coll166 });
  rooms.set(167, { img: null, collision: __coll167 });
  gameState = 'play';
  const tick = (n) => { for (let i = 0; i < (n || 1); i++) update(); };

  // --- the trigger (CommonLogic :26-47): room 8, X 0xC0-0xD0, once per game ---
  setRoom(8); snake.x = 0xB0; snake.y = 0x68; held.clear();
  tick(2);
  __check('outside the zone: nothing happens', gameState === 'play');
  snake.x = 0xC8;
  equipBagTaken = true;                       // already recovered: the scene is latched off
  tick(2);
  __check('the zone is inert after the bag was recovered (EquipBagTaken)', gameState === 'play');
  equipBagTaken = false;
  tick(1);
  __check('standing in the zone starts the capture scene', gameState === 'capture');

  // --- the scene (CaptureSceneLogic + CaptureGuardsLogic) ---
  tick(8);
  __check('guard A appears at (0xF0, Snake Y) and says DON\\'T MOVE (text 6)',
    captureGuards.length === 2 && captureGuards[0].x === 0xF0 && captureGuards[0].y === snake.y
      && gameState === 'text' && textBox && textBox.id === 6, 'guards='+captureGuards.length);
  __check('guard B enters at (0xF0, 0xB0) — below Snake (Y < 0x98)',
    captureGuards[1].x === 0xF0 && captureGuards[1].y === 0xB0, 'by='+captureGuards[1].y);
  __check('the text is unskippable: M/Enter is ignored (SetTextUnskippable mode 2)',
    (dismissText(), gameState === 'text'));
  let g = 0;
  while (gameState === 'text' && g++ < 1000) tick(1);
  __check('the unskippable text auto-advances on the 0x60 timer', gameState === 'capture', 'g='+g);

  // guard B: left to X 0xB8 fast, then up to Snake's even Y, then "YOU ARE CAPTURED"
  g = 0;
  while (captureStatus < 4 && g++ < 1000) tick(1);
  const b = captureGuards[1];
  __check('guard B walked to (0xB8, Snake Y & 0xFE) and faces RIGHT toward Snake (sprite 0x0B = GuardRight)',
    b.x === 0xB8 && b.y === (snake.y & 0xFE) && b.dir === 'right', 'bx='+b.x+' by='+b.y+' dir='+b.dir);
  g = 0;
  while (gameState !== 'text' && g++ < 50) tick(1);
  __check('guard B says YOU ARE CAPTURED (text 7)', textBox && textBox.id === 7);
  g = 0;
  while (gameState === 'text' && g++ < 1000) tick(1);

  // the mute wait, the fade, the post-fade wait -> prison
  g = 0;
  while (captureStatus < 7 && g++ < 1000) tick(1);
  __check('after the 0x3C wait the fade starts', captureStatus === 7, 'st='+captureStatus);
  g = 0;
  while (gameState === 'capture' && g++ < 1000) tick(1);
  __check('PutInPrison: Snake at (0x80, 0x50) in room 165, playing',
    gameState === 'play' && currentRoom === 165 && snake.x === 0x80 && snake.y === 0x50,
    'room='+currentRoom+' x='+snake.x+' y='+snake.y);

  // --- EquipRemoved (PutInPrison :92; menu checks Banks0123.asm:1974/2171/11469) ---
  weapons.set(1, 20); items.set(1, 1); invSuppressor = true;   // the arrays KEEP contents
  __check('EquipRemoved set; selections zeroed', equipRemoved && selectedWeapon === 0 && selectedItem === 0);
  openMenu('weapon');
  __check('the weapon menu renders EMPTY while captured (suppressor included)',
    menuList().length === 0);
  gameState = 'play'; openMenu('item');
  __check('the item menu renders EMPTY while captured', menuList().length === 0);
  gameState = 'play';
  selectWeapon(1); cycleItem();
  __check('nothing is selectable while captured', selectedWeapon === 0 && selectedItem === 0);

  // --- the cell wall (ChkPrisonWalls :286): punch LEFT, 40 hits (PrisonWall1Life 0x28) ---
  const wall = activeDoors.find((d) => d.id === 0x67);
  __check('cell 165 has its type-14 prison wall (lock 15, dest 164)',
    wall && wall.type === 14 && wall.lock === 15 && wall.dest === 164);
  // The wall blocks by its DRAWN tiles' collision bits: columns 0x14/0x33 solid, the right
  // column 0x35 walkable — Snake steps 8px into the drawn wall (stopping at X 56, where the
  // ChkTouchDoor open area passes) but no further.
  __check('Snake can step INTO the wall to X 56 (the 0x35 column is walkable)',
    closedDoorBlocking(56, 70, 'left') === null);
  __check('but the solid 0x14/0x33 columns stop him there',
    closedDoorBlocking(55, 70, 'left') !== null);
  snake.x = 56; snake.y = 70;                  // flush against the solid columns, punchable
  snake.dir = 'left'; snake.controlMod = CONTROL_PUNCH;
  for (let i = 0; i < 39; i++) chkPunchOpenDoors();
  __check('39 punches: the wall still stands (life 1 left)', !wall.open && prisonWall1Life === 1);
  snake.dir = 'right';
  chkPunchOpenDoors();
  __check('punching the WRONG direction does nothing (PunchWallDirs: LEFT)', !wall.open && prisonWall1Life === 1);
  snake.dir = 'left';
  chkPunchOpenDoors();
  __check('the 40th punch breaks the wall open', wall.open === true);
  snake.controlMod = CONTROL_NORMAL;

  // --- Grey Fox: room 164 is a REAL RoomsPrisoner room (prisoner.asm:43), rescue text 59 ---
  setRoom(164);
  __check('Grey Fox waits in room 164', prisoner !== null);
  __check('his rescue text is 59 (PrisonerTexts)', prisonerTextId(164) === 59);

  // --- the bag (RecoverEquipment :295): room 168, pickup 34 -> text 62 + the bugged transmitter ---
  setRoom(168);
  __check('room 168 holds the equipment bag (pickup 34)', roomItems.some((it) => it && it.id === 34));
  snake.x = 136; snake.y = 40;                 // on the bag (136, 32)
  tick(2);
  __check('taking the bag clears EquipRemoved and latches EquipBagTaken',
    !equipRemoved && equipBagTaken);
  __check('text 62 (the one Western take-description) shows',
    gameState === 'text' && textBox && textBox.id === 62);
  while (gameState === 'text') dismissText();
  __check('the TRANSMITTER is planted in the inventory (AddTransmitter)',
    items.get(SELECTED_TRANSMITTER) === 1 && transmiTaken);

  // --- the bug (ChkAlarmEnd :6636 + SetAreaMusic4 :1590) ---
  alertMode = true; roomAlert = 168;
  setRoom(164);                                // leaving the alert room would normally end it
  tick(2);
  __check('the alarm never ends while the transmitter is carried', alertMode === true);
  selectedItem = SELECTED_TRANSMITTER;
  chkUseItem();
  __check('using the transmitter consumes it and clears TransmiTaken',
    !transmiTaken && !items.has(SELECTED_TRANSMITTER));
  tick(2);
  __check('with the bug dropped the alarm can end again', alertMode === false);

  // ==== Ellen's trap room (166) + her cell (167) ============================================
  alertMode = false; gameState = 'play';
  setRoom(166); snake.x = 0x40; snake.y = 0x40;
  __check('room 166 arms its pitfall (closed) + the HELP-ME voice',
    pitfalls.length === 1 && pitfalls[0].state === 'closed' && helpmeActive === true);
  pitfallTick(); pitfallTick();                  // the ROM's first-cry timer is 2 iterations
  __check('the HELP-ME cry (text 128, unskippable) comes at once',
    gameState === 'text' && textBox.id === 128 && textBox.mode === 2);
  let pg = 0;
  while (gameState === 'text' && pg++ < 2000) updateTextBox();
  // approach the pitfall (centre 160, 96): within ±40 triggers it
  snake.x = 130; snake.y = 96;
  pitfallTick();
  __check('stepping near the pit triggers it (ChkTriggerPitfall ±40)', pitfalls[0].state === 'opening');
  for (let i = 0; i < 40; i++) pitfallTick();
  __check('the hole grows 2px/iteration to 64', pitfalls[0].state === 'open' && pitfalls[0].size === 0x40);
  const lifeBefore = snake.life;
  snake.x = 160; snake.y = 96;                   // inside the hole
  pitfallTick();
  __check('standing in the pit is LETHAL (ChkPitfall: all life)',
    snake.life === 0 && gameState === 'dead', 'life='+snake.life);
  gameState = 'play'; snake.life = lifeBefore; snake.invulnTimer = 0;  // restore for the next checks
  // the lock-14 bomb wall 166 <-> 167 (door id 106): punches never open it, a bomb does
  const bw = activeDoors.find((d) => d.id === 106);
  __check('the wall to Ellen is the lock-16 BOMB wall (ChkBasementWall)',
    bw && bw.lock === 16 && bw.dest === 167);
  snake.x = bw.x + 24; snake.y = bw.y + 40; snake.dir = 'left'; snake.controlMod = CONTROL_PUNCH;
  for (let i = 0; i < 60; i++) chkPunchOpenDoors();
  __check('60 punches achieve nothing', !bw.open);
  snake.controlMod = CONTROL_NORMAL;
  weapons.set(PLASTIC_BOMB, 1); selectedWeapon = PLASTIC_BOMB;
  playerShots.length = 0;
  playerShots.push({ type: PLASTIC_BOMB, status: 0, timer: 2,
                     x: bw.x + (doorTypes['14'].openOffX|0) + 4, y: bw.y + doorTypes['14'].openOffY + 4,
                     vx: 0, vy: 0 });
  updatePlayerShots(); updatePlayerShots();
  __check('a plastic bomb EXPLODING in its zone opens it (ChkBasementWall)', bw.open === true);
  // Ellen
  setRoom(167);
  __check('Ellen waits in her cell with her real rescue text (129)',
    prisoner !== null && prisonerTextId(prisoner) === 129);

  // ==== Gas rooms (ChkGasRooms, damagegas.asm) ==============================================
  rooms.set(112, { img: null, collision: __coll166 });   // any collision stands in
  gameState = 'play'; setRoom(112);
  snake.life = 24; snake.invulnTimer = 0; selectedItem = 0;
  chkGasRooms();
  __check('a gas room without the mask drains 2 life', snake.life === 22 && gasDraining === true);
  chkGasRooms();
  __check('the 0x10 damage delay gates the drain', snake.life === 22 && snake.invulnTimer > 0);
  snake.invulnTimer = 0; selectedItem = SELECTED_GAS_MASK;
  chkGasRooms();
  __check('the GAS MASK stops the gas', snake.life === 22 && gasDraining === false);
  selectedItem = 0;

  // --- the punch door (ChkPunchDoor :143): 57<->168, one punch facing the door ---
  const pd = activeDoors.length, _ = setRoom(168);
  const punchDoor = activeDoors.find((d) => d.id === 154);
  __check('room 168 has its lock-10 punch door (type 1, dest 57)',
    punchDoor && punchDoor.lock === 10 && punchDoor.type === 1 && punchDoor.dest === 57);
  snake.x = punchDoor.x + 12; snake.y = punchDoor.y + 36;   // in the type-1 open area
  snake.dir = 'up'; snake.controlMod = CONTROL_PUNCH;
  chkPunchOpenDoors();
  __check('one punch facing it opens the punch door', punchDoor.opening || punchDoor.open);
})();
`;

vm.createContext(sandbox);
vm.runInContext(src + '\n' + test, sandbox, { filename: 'game.js+test' });

let pass = 0, fail = 0;
for (const r of results) {
  if (r.ok) { pass++; console.log('  ok  ' + r.name); }
  else { fail++; console.log('FAIL  ' + r.name + (r.extra ? '  [' + r.extra + ']' : '')); }
}
console.log(`\ncapture.headless: ${pass}/${results.length} checks passed`);
if (fail) process.exit(1);
