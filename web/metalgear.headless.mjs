// Headless verification for Metal Gear (room 118: the 16-bomb leg order, the camera
// kill, the lock-14 door) and Big Boss (room 119: text 147, hit-and-run, the escape
// door). Run: node web/metalgear.headless.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const recCtx = new Proxy({ fillStyle: 0, strokeStyle: 0, lineWidth: 1 }, {
  get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => (t[k] = v, true),
});
const el = () => ({ getContext: () => recCtx, addEventListener(){}, classList:{add(){},remove(){}}, style:{}, blur(){}, width:0, height:0 });
const sandbox = {
  console, Math, Date, JSON, Set, Map, Array, Object, URLSearchParams, isNaN, parseInt, parseFloat,
  requestAnimationFrame: () => 0,
  document: { getElementById: () => el(), addEventListener(){} },
  window: { addEventListener(){}, AudioContext: undefined, webkitAudioContext: undefined },
  location: { search: '', hash: '', href: '' },
  fetch: () => Promise.reject(new Error('no fetch')),
  Image: class { set src(_) {} },
  performance: { now: () => 0 },
};
sandbox.globalThis = sandbox;
sandbox.__texts = fs.readFileSync(path.join(dir, 'assets', 'texts.json'), 'utf8');

let src = fs.readFileSync(path.join(dir, 'game.js'), 'utf8').replace(/\bmain\(\);\s*$/, '\n');
const results = [];
sandbox.__check = (name, cond, extra='') => results.push({ name, ok: !!cond, extra });

const test = `
;(function(){
  const C = () => ({ width:32, height:24, solid:new Array(32*24).fill(0), tiles:new Array(32*24).fill(0) });
  textsData = JSON.parse(__texts);
  gameState='play'; assets.collision=C(); actorsData=null; guardsData={};
  const iter2 = (fn, n) => { for (let i=0;i<(n||1);i++) { tickCounter=(tickCounter+1)&0xff; fn(); tickCounter=(tickCounter+1)&0xff; fn(); } };

  // ==== Metal Gear: the bomb order ====
  currentRoom=118; mgDestroyed=false; buildMetalGear(118);
  cameras=[{status:0},{status:0}];
  __check('Metal Gear stands in room 118', mgAlive===true);
  // the PLAY order: R,R,L,R,L,R,R,L,L,R,L,L,R,L,R,R (stored reversed = MG_BOMB_ORDER)
  const PLAY = [...MG_BOMB_ORDER].reverse();
  const bomb = (side) => chkMetalGearBomb({ x: side===1 ? 0x70 : 0x90, y: 0x70 });
  bomb(1); bomb(1); bomb(2);                       // three WRONG bombs first
  __check('wrong-order bombs leave it standing (the buffer just shifts)', mgAlive===true);
  for (const s of PLAY) bomb(s);
  __check('the FULL 16-bomb sequence destroys Metal Gear', mgAlive===false && mgDestroyed===true);
  __check('both laser cameras die with it', cameras.length===0);
  __check('the lock-14 door to Big Boss opens (OpenBigBossDoor)', openBigBossDoor===true);
  __check('DoorOpenArray+62h: door 99 (118<->119) is PERMANENTLY open, no push needed',
    openedDoorIds.has(99));
  const door14 = { lock: 14, type: 1 };
  snake.anim = ANIM_NORMAL;
  __check('canOpenDoor consumes the one-shot flag', canOpenDoor(door14)===true && openBigBossDoor===false);
  buildMetalGear(118);
  __check('the wreck is permanent', mgAlive===false);

  // ==== Big Boss (room 119) ====
  bigBossDead=false; bigBossSpeechDone=false; openBigBossDoor=false;
  currentRoom=119; buildBigBoss(119);
  __check('Big Boss waits in room 119 (life 0x28)', bigBoss!==null && bigBoss.life===0x28);
  __check('he spawns at the ActorsRoom119 crate (0x30,0x38)', bigBoss.x===0x30 && bigBoss.y===0x38);
  iter2(bigBossTick, 2);
  __check('the confession (text 147, unskippable, once)',
    gameState==='text' && textBox && textBox.id===147);
  textBox=null; gameState='play';
  snake.x=bigBoss.x-0x10; snake.y=bigBoss.y;       // close (within 0x48 both axes): he must flee
  const bx0=bigBoss.x;
  iter2(bigBossTick, 4);
  __check('he RUNS along the corridor when Snake closes in', bigBoss.x!==bx0);
  // Aligned in X on the top corridor (within 0x30) with the player BELOW: BB_Shoot fires PERPENDICULAR
  // to the corridor (BBChkUpDownCorridors -> ID_BULLET_VERT via BBAimToPlayer's inward facing) — a
  // straight VERTICAL bullet down the column at the player, not an aimed diagonal. InitBulletVert: vy
  // is the full ±2.5 axis speed, vx is the small random drift (|vx| <= 0.125).
  bigBossDead=false; bigBossSpeechDone=true; buildBigBoss(119);
  bigBoss.status=1; bigBoss.wait=1;
  snake.x=bigBoss.x+0x10; snake.y=bigBoss.y+0x60;
  bullets.length=0;
  iter2(bigBossTick, 12);
  __check('he fires a STRAIGHT axis bullet across the room (|vy|=2.5, vx=drift)',
    bullets.length>0 && Math.abs(bullets[0].vy)===2.5 && Math.abs(bullets[0].vx) <= 0.125, 'n='+bullets.length);
  bigBoss.life=0; iter2(bigBossTick, 1);
  __check('his death opens the ESCAPE door and latches',
    bigBossDead===true && openBigBossDoor===true && bigBoss===null);
  __check('DoorOpenArray+6Ah: the ladders door 107 is permanently open', openedDoorIds.has(107));
  buildBigBoss(119);
  __check('he never returns', bigBoss===null);

  // ==== The escape: door 0x6B (107) into the ladders enters in LADDER-WALK mode ====
  // LocatePlayerEntry routes IdDoorEnter 0x6B -> SetLadderRoomEntry (nextroom.asm:307,581).
  currentRoom=119; activeDoors=[];
  setRoom = (n) => { currentRoom = n; activeDoors = []; };   // stub the heavy room rebuild
  snake.controlMod = 0; snake.x = 0; snake.y = 0; snake.dir = 'right';
  enterDoor({ id: 107, type: 1, lock: 14, dest: 224, x: 0, y: 0 });
  __check('escape door 107 enters room 224 in SetLadderRoomEntry ladder-walk (mode 6, 0xD8/0x9E, left)',
    currentRoom===224 && snake.controlMod===CONTROL_LADDER_WALK
    && snake.x===0xD8 && snake.y===0x9E && snake.dir==='left');

  // ==== Audit-gap fixes (Test 7) ====
  // 1. ChkDoors self-destruct lockout (enterdoor.asm:31-39): the CARD1 door 0x62 before
  //    Metal Gear can't be reopened once self-destruct (MetalGear_KO) is running.
  snake.anim = ANIM_NORMAL; snake.dir = 'down'; selectedItem = cardItemForLock(2);
  const card1Door = { id: 0x62, lock: 2, type: 2 };
  destructionOn = false;
  __check('door 0x62 opens normally with CARD1 + correct facing', canOpenDoor(card1Door)===true);
  destructionOn = true;
  __check('self-destruct (MetalGear_KO) locks door 0x62 — no going back', canOpenDoor(card1Door)===false);
  destructionOn = false;

  // 2. InitCameraLaser (camera.asm:7-14): destroyed Metal Gear dismisses room 118's laser cameras.
  camerasData = { 118: [ {x:0x40,y:0x20,dir:0,laser:true,path:[]},
                         {x:0x80,y:0x20,dir:0,laser:false,path:[]} ] };
  mgDestroyed = false; buildCameras(118);
  __check('before destruction both room-118 cameras spawn', cameras.length===2);
  mgDestroyed = true; buildCameras(118);
  __check('destroyed Metal Gear dismisses the laser cameras (any non-laser kept)',
    cameras.length===1 && cameras[0].laser===false);
  mgDestroyed = false; camerasData = null;

  // 4. ChkEnterDoor (enterdoor.asm:64-70): the hidden 0x40 (room 6) / 0x6C (room 5) doors to
  //    room 204 are never enterable; a normal door at the same spot still teleports.
  currentRoom = 6; snake.x = 0x80; snake.y = 0xA0;
  let entered = false; setRoom = (n) => { entered = true; currentRoom = n; };
  const enterAll = { x: 0, y: 0, w: 0xFF, h: 0xFF };
  activeDoors = [ { id: 0x40, type: 2, open: true, dest: 204, x: 0, y: 0, enterRect: enterAll, wasInside: false } ];
  maybeEnterDoor();
  __check('hidden door 0x40 (room 6 -> 204) is NOT enterable', entered===false && currentRoom===6);
  activeDoors = [ { id: 50, type: 2, open: true, dest: 99, x: 0, y: 0, enterRect: enterAll, wasInside: false } ];
  entered = false; maybeEnterDoor();
  __check('a normal open door at the same spot DOES teleport', entered===true);
})();
`;

vm.createContext(sandbox);
try { vm.runInContext(src + test, sandbox, { filename: 'game.js+test' }); }
catch (e) { console.error('HARNESS ERROR:', e); process.exit(2); }

let pass = 0;
for (const r of results) { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.extra ? '  ['+r.extra+']' : '')); if (r.ok) pass++; }
console.log(`\nmetalgear.headless: ${pass}/${results.length} checks passed`);
process.exit(pass === results.length ? 0 : 1);
