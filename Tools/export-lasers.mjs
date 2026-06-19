// Decode the laser-beam tables (data/laserconfig.asm) into web/assets/lasers.json.
// Per room (LasersRoom24/25/72): a count byte, then 7 bytes per beam:
//   status (0=off 1=on), Y, X, vramDY, vramDX, length, axis
// The VRAM pair is the ROM's name-table draw address — meaningless on canvas, dropped.
// Axis semantics follow ChkTouchLaser's MATH (logic/laserbeams.asm — the asm comments are
// swapped): axis 0 = a COLUMN beam at X spanning Y+8..Y+8+len; axis 1 = a ROW beam at Y
// spanning X..X+len. Also exports the five LasersOnOff room-72 cycling patterns
// (idxLaserOnOff, data/laserconfig.asm:41-51). Run: node Tools/export-lasers.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRom } from './rom-source.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = readRom('data/laserconfig.asm');

const num = (t) => (/h$/i.test(t) ? parseInt(t, 16) : parseInt(t, 10));
function bytesAfter(label) {
  const lines = src.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith(label));
  if (start < 0) throw new Error('label not found: ' + label);
  const out = [];
  for (let i = start; i < lines.length; i++) {
    let line = lines[i].replace(/;.*$/, '');
    if (i > start && /^\w+:/.test(lines[i])) break;   // next label
    const m = line.match(/\bdb\s+(.+)$/i);
    if (!m) continue;
    for (const t of m[1].split(',').map((s) => s.trim()).filter(Boolean)) out.push(num(t));
  }
  return out;
}

const rooms = {};
for (const room of [24, 25, 72]) {
  const b = bytesAfter(`LasersRoom${room}:`);
  const n = b[0];
  const beams = [];
  for (let i = 0; i < n; i++) {
    const o = 1 + i * 7;
    beams.push({ on: b[o], y: b[o + 1], x: b[o + 2], len: b[o + 5], axis: b[o + 6] });
  }
  rooms[room] = beams;
}
const seq = [1, 2, 3, 4, 5].map((i) => bytesAfter(`LasersOnOff${i}:`).slice(0, 10));

// sanity: the ROM tables hold 6 / 5 / 10 beams; the sequences are 10 wide
if (rooms[24].length !== 6 || rooms[25].length !== 5 || rooms[72].length !== 10)
  throw new Error('unexpected beam counts');
if (seq.some((s) => s.length !== 10)) throw new Error('bad on/off sequence width');

const out = { ...rooms, seq };
fs.writeFileSync(path.join(root, 'web', 'assets', 'lasers.json'), JSON.stringify(out) + '\n');
console.log('lasers.json:', Object.entries(rooms).map(([r, b]) => `room ${r}: ${b.length} beams`).join(', '));

// ---- cameras.json -------------------------------------------------------------------------
// Surveillance cameras (ID_CAMERA) + laser cameras (ID_CAMERA_LASER):
// - rooms + facings: RoomsWithCamera / RoomCamTypes / CamDirs* (logic/actors/camera.asm:76-120;
//   the cpir leaves index c so room 14 -> CamDirs7 ... room 149 -> CamDirs1)
// - positions: the room actor lists (data/actorsinrooms.asm; `dw` = Y low byte, X high byte —
//   confirmed against the rooms' path columns/rows)
// - patrols: idxRoomPaths (data/paths.asm:788) -> per-actor pointer -> count + (Y,X) points
const CAM_DIRS = {   // room -> per-camera facing (0=Up 1=Down 2=Left 3=Right), camera.asm
  14: [3, 2, 2], 21: [1], 27: [0, 3], 28: [3], 31: [3, 0], 36: [1, 1],
  111: [1, 1], 115: [1, 1], 118: [1, 1], 149: [1, 1],
};
const actorsSrc = readRom('data/actorsinrooms.asm');
const pathsSrc = readRom('data/paths.asm');
const pLines = pathsSrc.split(/\r?\n/);
const idx0 = pLines.findIndex((l) => l.startsWith('idxRoomPaths:'));
const roomPathLabels = [];
for (let i = idx0; i < pLines.length && roomPathLabels.length < 256; i++) {
  const m = pLines[i].match(/dw\s+(\w+)/);
  if (m) roomPathLabels.push(m[1]);
  else if (i > idx0 && /^\w+:/.test(pLines[i])) break;
}
function pathFor(room, camIdx) {           // GetPathPoints (Banks0123.asm:6924)
  const li = pLines.findIndex((l) => l.startsWith(roomPathLabels[room] + ':'));
  const ptrs = [];
  for (let i = li; i < pLines.length; i++) {
    const m = pLines[i].match(/dw\s+(\w+)/);
    if (m) ptrs.push(m[1]);
    else if (i > li && /^\w+:/.test(pLines[i]) && !/^\s*dw/.test(pLines[i])) break;
    if (ptrs.length > camIdx) break;
  }
  const pl = pLines.findIndex((l) => l.startsWith(ptrs[camIdx] + ':'));
  const b = [];
  for (let i = pl; i < pLines.length; i++) {
    if (i > pl && /^\w+:/.test(pLines[i])) break;
    const m = pLines[i].replace(/;.*$/, '').match(/\bdb\s+(.+)$/i);
    if (m) for (const t of m[1].split(',').map((s) => s.trim()).filter(Boolean)) b.push(num(t));
  }
  const cnt = b[0], pts = [];
  for (let i = 0; i < cnt; i++) pts.push({ y: b[1 + i * 2], x: b[2 + i * 2] });
  return pts;
}
const cameras = {};
for (const [roomStr, dirs] of Object.entries(CAM_DIRS)) {
  const room = +roomStr;
  const re = new RegExp(`^ActorsRoom${String(room).padStart(3, '0')}:[\\s\\S]*?(?=^ActorsRoom|\\Z)`, 'm');
  const block = (actorsSrc.match(re) || [''])[0];
  const cams = [];
  for (const m of block.matchAll(/db\s+(ID_CAMERA_LASER|ID_CAMERA)\s*[\r\n]+\s*dw\s+([0-9A-Fa-f]+)h?/g)) {
    const v = parseInt(m[2], 16);
    cams.push({ y: v & 0xFF, x: (v >> 8) & 0xFF, laser: m[1] === 'ID_CAMERA_LASER' });
  }
  cameras[room] = cams.map((c, i) => ({ ...c, dir: dirs[i], path: pathFor(room, i) }));
}
if (cameras[31].length !== 2 || cameras[14].length !== 3 || cameras[111].length !== 2)
  throw new Error('unexpected camera counts');
if (!cameras[111].every((c) => c.laser) || cameras[31].some((c) => c.laser))
  throw new Error('laser flags wrong');
fs.writeFileSync(path.join(root, 'web', 'assets', 'cameras.json'), JSON.stringify(cameras) + '\n');
console.log('cameras.json:', Object.entries(cameras).map(([r, c]) => `room ${r}: ${c.length}`).join(', '));
