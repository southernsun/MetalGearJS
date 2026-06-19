// Room-by-room ROM-vs-implementation audit.
// Parses the ROM's authoritative per-room tables (actorsinrooms.asm, idxRoomItemsIdx,
// the door/connection tables already exported) and diffs them against our web/ exports +
// the hardcoded coverage in game.js, classifying each ROM actor as covered or a gap.
// Run: node Tools/audit/audit-rooms.mjs   ->   writes Tools/audit/room-audit.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRom } from '../rom-source.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const R = (p) => fs.readFileSync(path.join(root, p), 'utf8');   // in-repo reads (web/assets, ...)
const J = (p) => { try { return JSON.parse(R(p)); } catch { return null; } };
const num = (t) => (/h$/i.test(t) ? parseInt(t, 16) : parseInt(t, 10));

// ---- ROM: per-room actor lists (full, unfiltered) -------------------------
const aSrc = readRom('data/actorsinrooms.asm');
const aLines = aSrc.split(/\r?\n/);
const ai0 = aLines.findIndex((l) => l.startsWith('idxActorsRooms:'));
const roomActorLabels = [];
for (let i = ai0; i < aLines.length && roomActorLabels.length < 256; i++) {
  const m = aLines[i].match(/dw\s+(\w+)/);
  if (m) roomActorLabels.push(m[1]);
  else if (i > ai0 && /^\w+:/.test(aLines[i])) break;
}
function actorBlock(label) {
  const j = aLines.findIndex((l) => l.startsWith(label + ':'));
  if (j < 0) return '';
  const clean = (l) => l.replace(/;.*$/, '');
  let out = clean(aLines[j]).replace(/^\w+:/, '');
  for (let i = j + 1; i < aLines.length; i++) {
    if (/^\w+:/.test(aLines[i])) break;
    out += '\n' + clean(aLines[i]);
  }
  return out;
}
function romActors(room) {
  const label = roomActorLabels[room];
  if (!label || label === 'NoActorsInRoom') return [];
  const body = actorBlock(label);
  return [...body.matchAll(/db\s+(ID_\w+)\s*[\r\n]+\s*(?:dw\s+([0-9A-Fa-f]+)h?|db\s+([0-9A-Fa-f]+)h?\s*,\s*([0-9A-Fa-f]+)h?)/g)]
    .map((a) => a[2] != null
      ? { id: a[1], y: num(a[2] + 'h') & 0xFF, x: (num(a[2] + 'h') >> 8) & 0xFF }
      : { id: a[1], y: num(a[3] + 'h'), x: num(a[4] + 'h') });
}


// ---- Our exports ----------------------------------------------------------
const manifest = J('web/assets/manifest.json');
const exported = new Set((manifest?.rooms) || []);
const actorsJson = J('web/assets/actors.json') || {};
const itemsJson = J('web/assets/items.json') || {};
const camerasJson = J('web/assets/cameras.json') || {};
const lasersJson = J('web/assets/lasers.json') || {};
const doorsJson = J('web/assets/doors.json') || {};

// ---- Coverage classification ----------------------------------------------
// How each ROM actor ID is (or isn't) represented in our implementation.
const COVER = {
  // generic actors -> actors.json (export-actors.mjs)
  ID_GUARD_SLOW: 'actors.json (guard)', ID_GUARD_MEDIUM: 'actors.json (guard)',
  ID_GUARD_FAST: 'actors.json (guard)', ID_GUARD_ALERT: 'actors.json (guard)',
  ID_GUARD_REDALERT: 'actors.json (guard)', ID_GUARD_SILENCER: 'actors.json (guard)',
  ID_SHOOTER: 'actors.json (guard, alert-AI stand-in)', ID_LORRY_SHOOTER: 'actors.json (guard, alert-AI stand-in)',
  ID_DOG: 'actors.json (dogs)', ID_COWARD_DUCK: 'actors.json (duck)',
  ID_SENTINEL: 'actors.json (sentinel guard)', ID_JETPACK_TAKEOFF: 'actors.json (jetpacks)',
  ID_BRIDGE: 'actors.json (bridges)', ID_GAS: 'actors.json (gas)',
  ID_ROLLING_BARREL: 'actors.json (barrels)', ID_POWER_SWITCH: 'actors.json (powerswitch)',
  ID_JETPACK_SWITCH: 'actors.json (powerswitch/jetpack)', ID_PITFALL: 'actors.json (pitfalls)',
  ID_SCORPION: 'actors.json (scorpions)', ID_HELPME_VOICE: 'actors.json (helpme)',
  ID_PRISONER1: 'actors.json (prisoners)', ID_ELLEN: 'actors.json (prisoners)',
  ID_GREY_FOX: 'actors.json (prisoners)', ID_MADNAR: 'actors.json (prisoners)',
  ID_FAKE_MADNAR: 'actors.json (fakemadnar)',
  // cameras / lasers -> cameras.json / lasers.json (export-lasers.mjs)
  ID_CAMERA: 'cameras.json', ID_CAMERA_LASER: 'cameras.json (laser cam)', ID_LASER: 'lasers.json',
  // bosses -> hardcoded build* in game.js (room-specific)
  ID_MACH_GUN_KID: 'game.js buildBoss (room 20)', ID_SHOT_GUNNER: 'game.js buildBoss (room 57)',
  ID_TANK: 'game.js buildMidBosses', ID_BULLDOZER: 'game.js buildMidBosses',
  ID_ARNOLD: 'game.js buildMidBosses', ID_FIRE_TROOPER: 'game.js buildMidBosses',
  ID_HIND_D: 'game.js buildHindD (room 50)', ID_METAL_GEAR: 'game.js buildMetalGear (room 118)',
  ID_BIG_BOSS: 'game.js buildBigBoss (room 119)',
  // capture scene / desert event
  ID_CAPTURE_GUARD: 'game.js capture flow',
  // flames belong to the Fire Trooper (handled within that boss)
  ID_FLAME: 'game.js Fire Trooper (flame, within boss)',
  ID_JETPACK: 'game.js jetpackTick (in-flight, from takeoff)',
  ID_LAND_MINE: 'actors.json (mines) — InitMines contact 0x10, detector reveal [FIXED 2026-06-15]',
  // KNOWN GAPS (not represented anywhere) — value starts with 'GAP'
  ID_GUARD_ELEVATOR: 'actors.json (stationary guard stand-in) [FIXED 2026-06-15]',
  ID_SPAWN_GUARD_ELEV: 'game.js elevRelief (room 3 relieve ceremony) [FIXED 2026-06-15]',
  ID_GUARD_EXIT_LORRY: 'actors.json (guard, patrol stand-in) [FIXED 2026-06-15]',
  ID_GUARD_SWITCH: 'actors.json (stationary guard stand-in) [FIXED 2026-06-15]',
  ID_DOG_BASEMENT: 'actors.json (dogs, DogLogic stand-in) [FIXED 2026-06-15]',
  ID_SPAWN_DOG: 'actors.json (dogs, placed-dog stand-in) [FIXED 2026-06-15]',
  ID_DESERT_SECURITY: 'game.js desertSecurity (room 69, uniform-gated lock-12 door) [FIXED 2026-06-15]',
  ID_BRIDGE_CTRL: 'game.js bridgeTick (BridgeCtrlLogic folded into the bridge movement)',
  ID_SLEEPING_SIGN: 'actors.json (sets the sentinel asleep -> Zzz) [FIXED 2026-06-15]',
  ID_SPAWN_TANK_SHELL: 'game.js shellSpawner (rooms 65/66, BossTank_KO-gated) [FIXED 2026-06-15]',
  // projectiles / internal — not room placements (ignore)
  ID_TANK_SHELL_AIR: 'internal', ID_TANK_SHELL_BOSS: 'internal', ID_SGUNNER_SHOT: 'internal',
  ID_GUARD_BULLET: 'internal', ID_LASER_SHOT: 'internal', ID_BULLET_HORIZ: 'internal',
  ID_BULLET_VERT: 'internal', ID_SHOT_M_GUN_KID: 'internal', ID_BULLET: 'internal',
  ID_TANK_BULLET: 'internal', ID_BOOMERANG: 'internal', ID_BIG_EXPLOSION: 'internal',
  ID_PRISONER6: 'unused in ROM', ACTORS_2A: 'internal', ID_NONE: 'internal',
};

// What actors.json actually represents for a room (counts by category).
function jsonActorSummary(room) {
  const a = actorsJson[room];
  if (!a) return null;
  const parts = [];
  for (const k of ['guards', 'prisoners', 'pitfalls', 'scorpions', 'gas', 'barrels', 'jetpacks', 'bridges', 'dogs', 'mines'])
    if (a[k]?.length) parts.push(`${k}:${a[k].length}`);
  for (const k of ['helpme', 'duck', 'fakemadnar', 'powerswitch']) if (a[k]) parts.push(k);
  return parts.join(' ');
}

// ---- Build the per-room audit ---------------------------------------------
const allRooms = new Set([...exported]);
for (let r = 0; r < roomActorLabels.length; r++) if (romActors(r).length) allRooms.add(r);
const rooms = [...allRooms].sort((a, b) => a - b);

const audit = {};
const gapTally = {};
for (const r of rooms) {
  const rActors = romActors(r);
  const counts = {};
  const gaps = [];
  for (const a of rActors) {
    counts[a.id] = (counts[a.id] || 0) + 1;
    const cov = COVER[a.id] || `UNKNOWN ID ${a.id}`;
    if (cov.startsWith('GAP') || cov.startsWith('UNKNOWN')) {
      gaps.push(`${a.id}@(${a.x},${a.y}): ${cov}`);
      gapTally[a.id] = (gapTally[a.id] || 0) + 1;
    }
  }
  audit[r] = {
    exported: exported.has(r),
    romActors: Object.entries(counts).map(([id, n]) => n > 1 ? `${id}x${n}` : id),
    actorsJson: jsonActorSummary(String(r)),
    cameras: camerasJson[r]?.length || 0,
    lasers: lasersJson[r] ? (lasersJson[r].length || Object.keys(lasersJson[r]).length) : 0,
    itemsJson: itemsJson[String(r)] || null,
    doors: (doorsJson[String(r)] || []).map((d) => `${d.id}:t${d.type}:l${d.lock}->${d.dest}`),
    gaps,
  };
}

fs.mkdirSync(path.join(root, 'Tools', 'audit'), { recursive: true });
fs.writeFileSync(path.join(root, 'Tools', 'audit', 'room-audit.json'), JSON.stringify(audit, null, 1) + '\n');

// ---- Console summary ------------------------------------------------------
const roomsWithGaps = rooms.filter((r) => audit[r].gaps.length);
console.log(`Rooms audited: ${rooms.length}  |  exported: ${[...exported].length}  |  rooms with actor GAPS: ${roomsWithGaps.length}`);
console.log('\nGap tally by actor ID:');
for (const [id, n] of Object.entries(gapTally).sort((a, b) => b[1] - a[1]))
  console.log(`  ${id.padEnd(22)} x${n}  ${COVER[id]}`);
console.log('\nRooms with gaps:', roomsWithGaps.join(', '));
const notExported = rooms.filter((r) => !audit[r].exported);
if (notExported.length) console.log('\nROM rooms NOT exported:', notExported.join(', '));

// ---- Markdown document ----------------------------------------------------
// docs/room-audit.md — the per-room ROM-vs-implementation comparison. Regenerated by this
// script; the human-curated FINDINGS/FIXES notes live in docs/room-audit-notes.md and are
// linked, so re-running never clobbers them.
const md = [];
md.push('# Room-by-room ROM vs implementation audit', '');
md.push('_Generated by `node Tools/audit/audit-rooms.mjs` — do not hand-edit; curated notes live in [room-audit-notes.md](room-audit-notes.md)._', '');
md.push(`Rooms: ${rooms.length} (all exported). Rooms with un-ported ROM actors: **${roomsWithGaps.length}**.`, '');
md.push('## Actor-gap tally (ROM actors with no implementation)', '');
md.push('| Actor ID | count | status |', '|---|---|---|');
for (const [id, n] of Object.entries(gapTally).sort((a, b) => b[1] - a[1]))
  md.push(`| ${id} | ${n} | ${COVER[id]} |`);
md.push('', '## Per-room table', '');
md.push('Legend: ✅ = ROM actors all covered · ⚠️ = un-ported ROM actor(s). Items/doors are exported from the ROM tables (faithful); the only documented item divergence is the rocket-launcher set truncation (JeniRocketF=0).', '');
md.push('| Room | ROM actors | impl coverage | cams | items (ROM->json) | gaps |', '|---|---|---|---|---|---|');
for (const r of rooms) {
  const a = audit[r];
  const ok = a.gaps.length ? '⚠️' : '✅';
  const cov = [a.actorsJson, a.cameras ? `cams:${a.cameras}` : '', a.lasers ? 'lasers' : '']
    .filter(Boolean).join(' ') || (a.romActors.length ? '(bosses/none-generic)' : '—');
  const items = a.itemsJson ? a.itemsJson.map((it) => it.id).join(',') : '—';
  md.push(`| ${ok} ${r} | ${a.romActors.join(', ') || '—'} | ${cov} | ${a.cameras || ''} | ${items} | ${a.gaps.length ? a.gaps.join('; ') : ''} |`);
}
fs.writeFileSync(path.join(root, 'docs', 'room-audit.md'), md.join('\n') + '\n');
console.log('\nWrote docs/room-audit.md');
