// Dev helper: list open 5x3-tile floor regions in exported rooms (for demo placement).
// Usage: node Tools/find-floor.mjs [room...]   (defaults to 1 2 4)
import fs from 'node:fs';
const roomsArg = process.argv.slice(2).map(Number).filter(Number.isFinite);
for (const n of (roomsArg.length ? roomsArg : [1, 2, 4])) {
  const c = JSON.parse(fs.readFileSync(`web/assets/rooms/${n}.collision.json`, 'utf8'));
  const free = (tx, ty) => tx >= 0 && ty >= 0 && tx < c.width && ty < c.height && c.solid[ty * c.width + tx] === 0;
  const spots = [];
  for (let ty = 4; ty < c.height - 3 && spots.length < 14; ty++)
    for (let tx = 3; tx < c.width - 5 && spots.length < 14; tx++) {
      let ok = true;
      for (let dy = 0; dy < 3 && ok; dy++) for (let dx = 0; dx < 5 && ok; dx++) if (!free(tx + dx, ty + dy)) ok = false;
      if (ok) { spots.push(`(x=${tx * 8},y=${ty * 8})`); tx += 5; }
    }
  console.log(`room ${n}: ${c.width}x${c.height} spots:`, spots.join(' '));
}
