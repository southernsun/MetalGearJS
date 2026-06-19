// GLOBAL position-level reachability across the exported cluster.
//
// A per-room flood fill is not enough: a room region can border an edge whose other side is
// walled (the building is a maze), so reachability must be computed as a fixpoint over ALL
// rooms, starting from Snake's spawn. Footprint-aware: Snake spans a 2x2-tile block
// (BoxColliderDat shape 0: x-8..x+7, y-5..y+4), so 1-tile gaps are not passable.
//
// CLI: node Tools/check-graph.mjs            -> per-room "how it's reached" + spot lists
// API: import { computeGlobalMasks, pointReachable } from './check-graph.mjs'
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const J = (p) => JSON.parse(fs.readFileSync(path.join(repo, p), 'utf8'));

export function computeGlobalMasks() {
  const conns = J('web/assets/connections.json');
  const doors = J('web/assets/doors.json');
  const manifest = J('web/assets/manifest.json');
  const coll = {};
  for (const n of manifest.rooms) coll[n] = J(`web/assets/rooms/${n}.collision.json`);

  const standable = (c, tx, ty) => {
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const x = tx + dx, y = ty + dy;
      if (x < 0 || y < 0 || x >= c.width || y >= c.height) return false;
      if (c.solid[y * c.width + x] !== 0) return false;
    }
    return true;
  };
  const masks = {}, via = {};
  for (const n of manifest.rooms) masks[n] = new Uint8Array(coll[n].width * coll[n].height);

  // Grow a room's mask from seed positions; returns true if anything new was reached.
  function grow(n, seeds) {
    const c = coll[n], W = c.width, seen = masks[n];
    const queue = [];
    const push = (tx, ty) => {
      if (tx < 0 || ty < 0 || tx >= W || ty >= c.height) return;
      if (!standable(c, tx, ty) || seen[ty * W + tx]) return;
      seen[ty * W + tx] = 1; queue.push([tx, ty]);
    };
    for (const [tx, ty] of seeds) push(tx, ty);
    const grew = queue.length > 0;
    while (queue.length) {
      const [tx, ty] = queue.pop();
      push(tx + 1, ty); push(tx - 1, ty); push(tx, ty + 1); push(tx, ty - 1);
    }
    return grew;
  }

  // Seed the start room from Snake's spawn (game.js SPAWN_X/Y = 128,157).
  via[manifest.start] = 'start';
  grow(manifest.start, [[(128 >> 3) - 1, (157 >> 3) - 1], [128 >> 3, 157 >> 3]]);

  // Fixpoint: propagate across edges (aligned openings, both sides) and doors (same door id
  // in the destination room — enterDoor places Snake at the matching door).
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of manifest.rooms) {
      const c = coll[n], W = c.width, H = c.height, m = masks[n];
      const cn = conns[String(n)] || {};
      for (const [dir, nb] of Object.entries(cn)) {
        if (nb == null || !coll[nb]) continue;
        const seeds = [];
        if (dir === 'up' || dir === 'down') {
          const rowA = dir === 'up' ? 0 : H - 2, rowB = dir === 'up' ? coll[nb].height - 2 : 0;
          for (let tx = 0; tx < W - 1; tx++) if (m[rowA * W + tx]) seeds.push([tx, rowB]);
        } else {
          const colA = dir === 'left' ? 0 : W - 2, colB = dir === 'left' ? coll[nb].width - 2 : 0;
          for (let ty = 0; ty < H - 1; ty++) if (m[ty * W + colA]) seeds.push([colB, ty]);
        }
        if (seeds.length && grow(nb, seeds)) {
          changed = true;
          if (via[nb] === undefined) via[nb] = `walk ${dir} from ${n}`;
        }
      }
      for (const d of (doors[String(n)] || [])) {
        if (!coll[d.dest]) continue;
        // Door usable if any footprint adjacent to its tiles is reachable.
        const tx = d.x >> 3, ty = d.y >> 3;
        let usable = false;
        for (let dy = -2; dy <= 5 && !usable; dy++)
          for (let dx = -2; dx <= 4 && !usable; dx++)
            if (tx + dx >= 0 && ty + dy >= 0 && tx + dx < W && ty + dy < H && m[(ty + dy) * W + tx + dx]) usable = true;
        if (!usable) continue;
        const dest = (doors[String(d.dest)] || []).find((x) => x.id === d.id);
        if (!dest) continue;
        const sx = dest.x >> 3, sy = dest.y >> 3, seeds = [];
        for (let dy = -2; dy <= 5; dy++) for (let dx = -2; dx <= 4; dx++) seeds.push([sx + dx, sy + dy]);
        if (grow(d.dest, seeds)) {
          changed = true;
          if (via[d.dest] === undefined)
            via[d.dest] = `door from ${n}${d.lock ? ` (lock ${d.lock} = CARD${d.lock - 1})` : ''}`;
        }
      }
    }
  }
  return { masks, via, coll, manifest };
}

// A pixel point is reachable if some footprint position covering it is reachable.
export function pointReachable(c, mask, px, py) {
  for (let dy = -1; dy <= 0; dy++)
    for (let dx = -1; dx <= 0; dx++) {
      const tx = (px >> 3) + dx, ty = (py >> 3) + dy;
      if (tx >= 0 && ty >= 0 && mask[ty * c.width + tx]) return true;
    }
  return false;
}

if (process.argv[1] && process.argv[1].endsWith('check-graph.mjs')) {
  const { masks, via, coll, manifest } = computeGlobalMasks();
  for (const n of manifest.rooms.slice().sort((a, b) => a - b)) {
    const c = coll[n], W = c.width, m = masks[n];
    const spots = [];
    for (let ty = 4; ty < c.height - 4 && spots.length < 8; ty++)
      for (let tx = 3; tx < W - 5 && spots.length < 8; tx++) {
        let ok = true;
        for (let dy = 0; dy < 3 && ok; dy++)
          for (let dx = 0; dx < 4 && ok; dx++) if (!m[(ty + dy) * W + tx + dx]) ok = false;
        if (ok) { spots.push(`(${tx * 8},${ty * 8})`); tx += 5; }
      }
    console.log(`room ${String(n).padStart(3)}: ${via[n] !== undefined ? via[n] : '*** UNREACHABLE ***'}` +
      (via[n] !== undefined ? `  spots: ${spots.join(' ') || 'none'}` : ''));
  }
}
