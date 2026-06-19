// Dev helper: footprint-aware reachability for demo placement.
//
// Snake's collision box spans ~16px wide x ~10px tall (BoxColliderDat shape 0 probes:
// x-8..x+7, y-5..y+4) — i.e. a 2x2 TILE footprint. A 1-tile gap is NOT passable, so a plain
// tile flood-fill overcounts. This fill works on footprint positions: (tx,ty) is standable
// iff tiles (tx..tx+1, ty..ty+1) are all free; moves are 4-way. Seeds are the room's REAL
// entries: boundary footprints on edges with a connection, plus door footprints.
// Usage: node Tools/check-reach.mjs <room...>
import fs from 'node:fs';

const doors = JSON.parse(fs.readFileSync('web/assets/doors.json', 'utf8'));
const conns = JSON.parse(fs.readFileSync('web/assets/connections.json', 'utf8'));

function standable(c, tx, ty) {
  const W = c.width, H = c.height;
  for (let dy = 0; dy < 2; dy++)
    for (let dx = 0; dx < 2; dx++) {
      const x = tx + dx, y = ty + dy;
      if (x < 0 || y < 0 || x >= W || y >= H) return false;
      if (c.solid[y * W + x] !== 0) return false;
    }
  return true;
}

export function reachMask(c, room) {
  const W = c.width, H = c.height;
  const seen = new Uint8Array(W * H);          // indexed by footprint top-left (tx,ty)
  const queue = [];
  const push = (tx, ty) => {
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return;
    if (!standable(c, tx, ty) || seen[ty * W + tx]) return;
    seen[ty * W + tx] = 1; queue.push([tx, ty]);
  };
  const cn = conns[String(room)] || {};
  // Edge entries only where a connected neighbor exists.
  if (cn.up != null) for (let tx = 0; tx < W; tx++) push(tx, 0);
  if (cn.down != null) for (let tx = 0; tx < W; tx++) push(tx, H - 2);
  if (cn.left != null) for (let ty = 0; ty < H; ty++) push(0, ty);
  if (cn.right != null) for (let ty = 0; ty < H; ty++) push(W - 2, ty);
  // Door entries: the tiles under the (open) door footprint and just inside it.
  for (const d of (doors[String(room)] || [])) {
    const tx = d.x >> 3, ty = d.y >> 3;
    for (let dy = -1; dy <= 5; dy++) for (let dx = -1; dx <= 4; dx++) push(tx + dx, ty + dy);
  }
  while (queue.length) {
    const [tx, ty] = queue.pop();
    push(tx + 1, ty); push(tx - 1, ty); push(tx, ty + 1); push(tx, ty - 1);
  }
  return seen;
}

// A point (px,py) is reachable if some footprint position covering that point is reachable.
export function pointReachable(c, seen, px, py) {
  const W = c.width;
  for (let dy = -1; dy <= 0; dy++)
    for (let dx = -1; dx <= 0; dx++) {
      const tx = (px >> 3) + dx, ty = (py >> 3) + dy;
      if (tx >= 0 && ty >= 0 && seen[ty * W + tx]) return true;
    }
  return false;
}

const rooms = process.argv.slice(2).map(Number).filter(Number.isFinite);
for (const n of rooms) {
  const c = JSON.parse(fs.readFileSync(`web/assets/rooms/${n}.collision.json`, 'utf8'));
  const seen = reachMask(c, n);
  const W = c.width;
  const spots = [];
  for (let ty = 4; ty < c.height - 4 && spots.length < 10; ty++)
    for (let tx = 3; tx < W - 5 && spots.length < 10; tx++) {
      let ok = true;   // 4x3 footprint-reachable block (room for a sprite + Snake beside it)
      for (let dy = 0; dy < 3 && ok; dy++)
        for (let dx = 0; dx < 4 && ok; dx++)
          if (!seen[(ty + dy) * W + tx + dx]) ok = false;
      if (ok) { spots.push(`(x=${tx * 8},y=${ty * 8})`); tx += 5; }
    }
  console.log(`room ${n}: footprint-reachable spots:`, spots.join(' ') || 'NONE');
}
