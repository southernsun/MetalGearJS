// Decode the per-room actor lists (data/actorsinrooms.asm) + patrol paths (data/paths.asm)
// into web/assets/actors.json: { "<room>": { guards: [{y,x,fast,path:[[y,x]..]}],
// prisoners: [{y,x}] } }. Guards keep their actor-list order; the path index follows it
// (GetPathPoints is indexed by the actor's position among path-using actors — guards and
// cameras; prisoners/items don't consume path slots in these rooms).
// Run: node Tools/export-actors.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRom } from './rom-source.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const actorsSrc = readRom('data/actorsinrooms.asm');
const pathsSrc = readRom('data/paths.asm');
const num = (t) => (/h$/i.test(t) ? parseInt(t, 16) : parseInt(t, 10));

const pLines = pathsSrc.split(/\r?\n/);
const idx0 = pLines.findIndex((l) => l.startsWith('idxRoomPaths:'));
const roomPathLabels = [];
for (let i = idx0; i < pLines.length && roomPathLabels.length < 256; i++) {
  const m = pLines[i].match(/dw\s+(\w+)/);
  if (m) roomPathLabels.push(m[1]);
  else if (i > idx0 && /^\w+:/.test(pLines[i])) break;
}
function pathFor(room, idx) {
  const li = pLines.findIndex((l) => l.startsWith(roomPathLabels[room] + ':'));
  if (li < 0) return null;
  const ptrs = [];
  for (let i = li; i < pLines.length; i++) {
    const m = pLines[i].match(/dw\s+(\w+)/);
    if (m) ptrs.push(m[1]);
    else if (i > li && /^\w+:/.test(pLines[i])) break;
  }
  if (idx >= ptrs.length) return null;
  const pl = pLines.findIndex((l) => l.startsWith(ptrs[idx] + ':'));
  if (pl < 0) return null;
  const b = [];
  for (let i = pl; i < pLines.length; i++) {
    if (i > pl && /^\w+:/.test(pLines[i])) break;
    const m = pLines[i].replace(/;.*$/, '').match(/\bdb\s+(.+)$/i);
    if (m) for (const t of m[1].split(',').map((s) => s.trim()).filter(Boolean)) b.push(num(t));
  }
  const cnt = b[0], pts = [];
  for (let i = 0; i < cnt; i++) pts.push([b[1 + i * 2], b[2 + i * 2]]);   // (Y, X) pairs
  return pts;
}

// Resolve each room through idxActorsRooms (rooms can share blocks — e.g. `ActorPrisoner`
// serves every plain one-prisoner room at (X 0x80, Y 0x60)).
const aLines = actorsSrc.split(/\r?\n/);
const ai0 = aLines.findIndex((l) => l.startsWith('idxActorsRooms:'));
const roomActorLabels = [];
for (let i = ai0; i < aLines.length && roomActorLabels.length < 256; i++) {
  const m = aLines[i].match(/dw\s+(\w+)/);
  if (m) roomActorLabels.push(m[1]);
  else if (i > ai0 && /^\w+:/.test(aLines[i])) break;
}
// A sentinel's path entry is a LOOK-DIRECTION list: cnt, then cnt single direction bytes
// (1=Up 2=Down 3=Left 4=Right), not coordinate pairs.
function dirBytesFor(room, idx) {
  const li = pLines.findIndex((l) => l.startsWith(roomPathLabels[room] + ':'));
  if (li < 0) return null;
  const ptrs = [];
  for (let i = li; i < pLines.length; i++) {
    const m = pLines[i].match(/dw\s+(\w+)/);
    if (m) ptrs.push(m[1]);
    else if (i > li && /^\w+:/.test(pLines[i])) break;
  }
  if (idx >= ptrs.length) return null;
  const pl = pLines.findIndex((l) => l.startsWith(ptrs[idx] + ':'));
  if (pl < 0) return null;
  const b = [];
  for (let i = pl; i < pLines.length; i++) {
    if (i > pl && /^\w+:/.test(pLines[i])) break;
    const m = pLines[i].replace(/;.*$/, '').match(/\bdb\s+(.+)$/i);
    if (m) for (const t of m[1].split(',').map((s) => s.trim()).filter(Boolean)) b.push(num(t));
  }
  return b.slice(1, 1 + b[0]);
}

function actorBlock(label) {
  const j = aLines.findIndex((l) => l.startsWith(label + ':'));
  if (j < 0) return '';
  // Strip trailing comments — room 104's lorry shooters carry one on every actor line,
  // which broke the id/position matcher.
  const clean = (l) => l.replace(/;.*$/, '');
  let out = clean(aLines[j]).replace(/^\w+:/, '');
  for (let i = j + 1; i < aLines.length; i++) {
    if (/^\w+:/.test(aLines[i])) break;
    out += '\n' + clean(aLines[i]);
  }
  return out;
}

const out = {};
// InitGuard sleepy-by-ROOM (Banks0123.asm:6816-6826): the single regular guard in rooms 26/85/138
// is SLEEPY (cycles awake<->asleep) — set by room number, NOT an actor id, so no ID_SLEEPING_SIGN
// exists in their data. (Room 140's sentinels are flagged separately by their ID_SLEEPING_SIGN
// actor and start asleep.) These three start AWAKE and doze on the AwakeTime timer.
const SLEEPY_ROOMS = new Set([26, 85, 138]);
for (let room = 0; room < roomActorLabels.length; room++) {
  const label = roomActorLabels[room];
  if (!label || label === 'NoActorsInRoom') continue;
  const body = actorBlock(label);
  // positions appear as `dw YXh` or as `db Y, X` pairs (e.g. ActorsRoom193)
  const actors = [...body.matchAll(/db\s+(ID_\w+)\s*[\r\n]+\s*(?:dw\s+([0-9A-Fa-f]+)h?|db\s+([0-9A-Fa-f]+)h?\s*,\s*([0-9A-Fa-f]+)h?)/g)]
    .map((a) => a[2] != null
      ? { id: a[1], y: num(a[2] + 'h') & 0xFF, x: (num(a[2] + 'h') >> 8) & 0xFF }
      : { id: a[1], y: num(a[3] + 'h'), x: num(a[4] + 'h') });
  const guards = [], prisoners = [], pitfalls = [], scorpions = [], gas = [], barrels = [],
        jetpacks = [], bridges = [], dogs = [], mines = [];
  let helpme = false, powerswitch = null, duck = null, fakemadnar = null;
  let pathIdx = 0, lorryGuardN = 0;
  for (const a of actors) {
    if (a.id === 'ID_GUARD_SLOW' || a.id === 'ID_GUARD_FAST' || a.id === 'ID_GUARD_MEDIUM' ||
        a.id === 'ID_GUARD_SILENCER' || a.id === 'ID_GUARD_ALERT' || a.id === 'ID_GUARD_REDALERT') {
      // Patrol speed = WalkSpeeds (Banks0123.asm:7039-7046, 8.8 fixed) indexed by IdxGuardSpeed
      // (InitGuardSlow/Medium/Fast set 0/4/8): SLOW 1.00 / MEDIUM 1.25 / FAST 1.50 px per ROM
      // ITERATION. Port convention = ROM px/iter / 2 (1 px/frame@60Hz == 2 px/iter@30Hz) -> 0.5 /
      // 0.625 / 0.75 px/frame. ALERT/REDALERT spawn already chasing; SILENCER (slow) counts toward
      // the room-150 suppressor drop (DismissActor8).
      guards.push({
        y: a.y, x: a.x,
        fast: a.id === 'ID_GUARD_FAST',
        speed: a.id === 'ID_GUARD_SLOW' || a.id === 'ID_GUARD_SILENCER' ? 0.5
             : a.id === 'ID_GUARD_MEDIUM' ? 0.625 : 0.75,
        alert: a.id === 'ID_GUARD_ALERT' || a.id === 'ID_GUARD_REDALERT' || undefined,
        silencer: a.id === 'ID_GUARD_SILENCER' || undefined,
        path: pathFor(room, pathIdx),
      });
      pathIdx++;
    } else if (a.id === 'ID_GUARD_EXIT_LORRY') {
      // InitGuardLorry (logic/actors/guardlorry.asm; rooms 5/7): a slow guard that emerges from
      // a parked lorry, patrols its InitGuardPath2 path, then returns. Ported as a patrol guard
      // on that path (the lorry emerge/return animation is a documented cosmetic divergence). It
      // CONSUMES a path slot like any path guard — so it must bump pathIdx (the ROM counts it),
      // else later path-using actors in the room would read the wrong path.
      // Guard1/2/3ExitedLorry index: room 5's lorry guard is Guard1 (0); room 7's two are
      // Guard2 (1) and Guard3 (2), in actor-list order.
      const lorryIdx = room === 5 ? 0 : (1 + lorryGuardN++);
      guards.push({ y: a.y, x: a.x, speed: 0.5, lorry: true, lorryIdx, path: pathFor(room, pathIdx) });
      pathIdx++;
    } else if (a.id === 'ID_LORRY_SHOOTER') {
      // The desert lorry ambush (room 104, lorryshooter.asm): a HIDDEN guard that pops out of the
      // lorry to shoot (aimed ID_BULLET) — think/show/walk-out/wait/walk-in — not an alert chaser.
      guards.push({ y: a.y, x: a.x, lorryShooter: true, speed: 1.0 });
    } else if (a.id === 'ID_SHOOTER') {
      // Ambush shooters (shooter.asm; rooms 88/90/91 force the alarm, 206 does not): a pop-out
      // guard that strafes sideways, fires VERTICAL bullets, returns to its start, and transforms
      // into an alert chaser after 3 cycles or when the player closes in vertically.
      guards.push({ y: a.y, x: a.x, shooter: true, speed: 1.0 });
    } else if (a.id === 'ID_GUARD_ELEVATOR') {
      // ID_GUARD_ELEVATOR (room 3 relieve ceremony): a stationary guard stand-in (LOS + alert +
      // touch); the ceremony is the room-3 elevRelief overlay. No path slot consumed.
      guards.push({ y: a.y, x: a.x, speed: 0.5 });
    } else if (a.id === 'ID_GUARD_SWITCH') {
      // ID_GUARD_SWITCH (room 16): the floor-switch operator — patrols, raises the alarm on
      // sighting, runs to the switch to power the electric floor, then guards it (GuardSwitchLogic).
      guards.push({ y: a.y, x: a.x, switch: true });
    } else if (a.id === 'ID_DOG') {
      dogs.push({ y: a.y, x: a.x });               // DogLogic (room 207)
    } else if (a.id === 'ID_DOG_BASEMENT' || a.id === 'ID_SPAWN_DOG') {
      // InitDogBasement / InitSpawnDog (dogbasement.asm, dogspawner.asm; basement rooms 6/10/55/56/
      // 58-63): free-roaming sleep -> run -> chase dogs (DogBasementLogic). The spawner's running-
      // dog-from-the-edge entry + the NumBasementDogs cross-room carry-over count are approximated
      // by a placed dog (documented divergence); a spawned dog (ID_SPAWN_DOG) starts running.
      dogs.push({ y: a.y, x: a.x, basement: true, spawn: a.id === 'ID_SPAWN_DOG' });
    } else if (a.id === 'ID_COWARD_DUCK') {
      duck = { y: a.y, x: a.x };                   // Coward Duck (room 193, CARD8)
    } else if (a.id === 'ID_SENTINEL') {
      // Stationary look-cycling guards (SentinelLogic) — their "path" is a list of LOOK
      // DIRECTIONS (single bytes), not (Y,X) pairs.
      guards.push({ y: a.y, x: a.x, sentinel: true, dirs: dirBytesFor(room, pathIdx), speed: 0 });
      pathIdx++;
    } else if (a.id === 'ID_JETPACK_TAKEOFF') {
      jetpacks.push({ y: a.y, x: a.x, mode: 'takeoff' });   // rooms 44/48
    } else if (a.id === 'ID_BRIDGE') {
      bridges.push({ y: a.y, x: a.x });            // the moving walkway segments (45/46)
    } else if (a.id === 'ID_GAS') {
      gas.push({ y: a.y, x: a.x });                // GasLogic cloud spots
    } else if (a.id === 'ID_ROLLING_BARREL') {
      barrels.push({ y: a.y, x: a.x });            // RollingBarrelLogic
    } else if (a.id === 'ID_POWER_SWITCH' || a.id === 'ID_JETPACK_SWITCH') {
      powerswitch = { y: a.y, x: a.x, jetpack: a.id === 'ID_JETPACK_SWITCH' };
    } else if (a.id === 'ID_CAMERA' || a.id === 'ID_CAMERA_LASER') {
      pathIdx++;                                   // cameras consume a path slot
    } else if (/^ID_PRISONER/.test(a.id) || a.id === 'ID_GREY_FOX' || a.id === 'ID_ELLEN' ||
               a.id === 'ID_MADNAR') {
      prisoners.push({ y: a.y, x: a.x });          // Madnar rescues like a prisoner (182)
    } else if (a.id === 'ID_FAKE_MADNAR') {
      fakemadnar = { y: a.y, x: a.x };             // the room-189 trap
    } else if (a.id === 'ID_LAND_MINE') {
      // InitMines (logic/actors/mine.asm): a buried mine — invisible unless the MINE DETECTOR
      // item is selected; player contact destroys it (LIFE=0) for ActorTouchDamage 0x10.
      mines.push({ y: a.y, x: a.x });
    } else if (a.id === 'ID_PITFALL') {
      pitfalls.push({ y: a.y, x: a.x });
    } else if (a.id === 'ID_SCORPION') {
      scorpions.push({ y: a.y, x: a.x });          // desert wildlife (ScorpionLogic)
    } else if (a.id === 'ID_SLEEPING_SIGN') {
      // ID_SLEEPING_SIGN (room 140): the Zzz drawn over the preceding sentinel — it marks that
      // guard ASLEEP. The engine draws the Zzz for any asleep guard, so flag the last guard.
      if (guards.length) guards[guards.length - 1].sleeping = true;
    } else if (a.id === 'ID_HELPME_VOICE') {
      helpme = true;                               // Ellen's cry through the wall (ChkSayHelpMe)
    }
  }
  // InitGuard sleepy-by-room (Banks0123.asm:6816-6826): flag the regular guard(s) in 26/85/138 to
  // doze. sleepAwake = start AWAKE then cycle — unlike room 140's start-asleep ID_SLEEPING_SIGN guard.
  if (SLEEPY_ROOMS.has(room)) for (const g of guards) { g.sleeping = true; g.sleepAwake = true; }
  if (guards.length || prisoners.length || pitfalls.length || helpme || scorpions.length ||
      gas.length || barrels.length || powerswitch || jetpacks.length || bridges.length ||
      dogs.length || duck || fakemadnar || mines.length)
    out[room] = { guards, prisoners, pitfalls, helpme, scorpions, gas, barrels, powerswitch,
                  jetpacks, bridges, dogs, duck, fakemadnar, mines };
}
fs.writeFileSync(path.join(root, 'web', 'assets', 'actors.json'), JSON.stringify(out) + '\n');
const rooms = Object.keys(out);
console.log('actors.json:', rooms.length, 'rooms;',
  rooms.filter((r) => out[r].prisoners.length).length, 'with prisoners');
