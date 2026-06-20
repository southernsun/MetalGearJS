// Dev static server for the browser port + the in-game bug-report endpoint.
//   node web/serve.js   ->  http://localhost:8099
//
// POST /report (used by the in-game B key, see game.js initBugReporter): the body is a WebM clip
// of the last ~20s of gameplay, the X-MG-Meta header is URL-encoded JSON (room/state/etc.). The
// server uploads the clip as an asset on the `bug-clips` release and opens a GitHub issue linking
// it — all via the GitHub REST API, authenticated with a fine-grained PAT.
//
// Setup: create web/.env (gitignored) with
//   GITHUB_TOKEN=github_pat_xxx        # fine-grained PAT on the repo, Contents: R/W + Issues: R/W
//   GITHUB_REPO=southernsun/MetalGearJS  # optional, this is the default
const http = require('http'), https = require('https'), fs = require('fs'), path = require('path');
const root = __dirname;
const types = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.png':'image/png', '.svg':'image/svg+xml', '.jpg':'image/jpeg', '.jpeg':'image/jpeg',
  '.wav':'audio/wav', '.webm':'video/webm' };

const REPO = () => process.env.GITHUB_REPO || 'southernsun/MetalGearJS';
const RELEASE_TAG = 'bug-clips';

// --- Per-IP rate limit for POST /report. On the public site this is the only abuse-exposed
// endpoint (it files GitHub issues + uploads release assets with our PAT). It's reachable ONLY
// via the web server's localhost reverse proxy, which APPENDS the real client to X-Forwarded-For
// — so the LAST entry is the trustworthy client IP (a client-spoofed value lands earlier in the
// list and is ignored). Caps each IP to REPORT_MAX reports per REPORT_WINDOW_MS; override via env.
const REPORT_MAX = Number(process.env.REPORT_MAX || 5);
const REPORT_WINDOW_MS = Number(process.env.REPORT_WINDOW_MS || 60 * 1000);
const reportHits = new Map();   // ip -> [timestamps within the window]
function rateLimited(req) {
  const xff = (req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ip = xff[xff.length - 1] || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const hits = (reportHits.get(ip) || []).filter((t) => now - t < REPORT_WINDOW_MS);
  hits.push(now);
  reportHits.set(ip, hits);
  if (reportHits.size > 5000)   // bound the map: drop IPs whose hits have all aged out
    for (const [k, v] of reportHits) if (!v.some((t) => now - t < REPORT_WINDOW_MS)) reportHits.delete(k);
  return hits.length > REPORT_MAX;
}

// web/.env: simple KEY=VALUE lines; a value already in the real environment wins.
(function loadEnv() {
  try {
    for (const line of fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch (e) { /* no .env — fine, may be set in the environment */ }
})();

// One GitHub API call. Returns { status, json, raw }.
function gh(host, method, p, headers, body) {
  return new Promise((resolve, reject) => {
    const req = https.request({ host, method, path: p, headers: Object.assign({
      'User-Agent': 'metalgear-bug-reporter',
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Authorization': 'Bearer ' + (process.env.GITHUB_TOKEN || ''),
    }, headers || {}) }, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        let json = null; try { json = JSON.parse(raw.toString('utf8')); } catch (e) {}
        resolve({ status: res.statusCode, json, raw });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
const ghErr = (r) => r.status + ' ' + ((r.json && r.json.message) || r.raw.toString('utf8').slice(0, 200))
  // 403 on a Contents op (releases/assets) almost always = the PAT lacks Contents: Read and write.
  + (r.status === 403 ? ' — the fine-grained PAT also needs Contents: Read and write (releases host the clip); Issues alone is not enough' : '');

async function getOrCreateRelease() {
  let r = await gh('api.github.com', 'GET', `/repos/${REPO()}/releases/tags/${RELEASE_TAG}`);
  if (r.status === 200 && r.json && r.json.id) return r.json;
  if (r.status !== 404) throw new Error('release lookup failed: ' + ghErr(r));
  const body = JSON.stringify({ tag_name: RELEASE_TAG, name: 'Bug report clips',
    body: 'Auto-created to host gameplay recordings filed from the in-game B bug-report key.' });
  r = await gh('api.github.com', 'POST', `/repos/${REPO()}/releases`,
    { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, body);
  if (r.status === 201 && r.json) return r.json;
  throw new Error('release create failed: ' + ghErr(r));
}

async function uploadAsset(releaseId, name, buf) {
  const r = await gh('uploads.github.com', 'POST',
    `/repos/${REPO()}/releases/${releaseId}/assets?name=${encodeURIComponent(name)}`,
    { 'Content-Type': 'video/webm', 'Content-Length': buf.length }, buf);
  if ((r.status === 201 || r.status === 200) && r.json) return r.json;
  throw new Error('asset upload failed: ' + ghErr(r));
}

async function createIssue(title, body) {
  const payload = JSON.stringify({ title, body });
  const r = await gh('api.github.com', 'POST', `/repos/${REPO()}/issues`,
    { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, payload);
  if (r.status === 201 && r.json) return r.json;
  throw new Error('issue create failed: ' + ghErr(r));
}

const pad = (n) => (n < 10 ? '0' : '') + n;
function stamp() {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function issueBody(meta, name, url) {
  const pos = meta.pos || {};
  const desc = (meta.description || '').trim();
  return [
    '**Auto-filed from the in-game bug-report key (`B`).**',
    '',
    ...(desc ? ['### Description', desc, ''] : ['_No description provided._', '']),
    '| Field | Value |',
    '| --- | --- |',
    `| Room | ${meta.room} (from ${meta.previousRoom}) |`,
    `| State | ${meta.state}${meta.alert ? ' · ALERT' : ''} |`,
    `| Snake | life ${meta.life}/${meta.maxLife} · class ${meta.class} · facing ${meta.dir} @ (${pos.x}, ${pos.y}) |`,
    `| Captured | ${meta.when} |`,
    `| URL | ${meta.url || ''} |`,
    `| Browser | ${meta.ua || ''} |`,
    '',
    `**Gameplay recording (last ~20s):** [${name}](${url})`,
    '',
    '_Tip: download the clip and drag it into a comment to embed an inline player._',
  ].join('\n');
}

async function handleReport(req, res, buf) {
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  if (!process.env.GITHUB_TOKEN)
    return send(500, { ok: false, error: 'GITHUB_TOKEN not set — create web/.env with a fine-grained PAT (Contents + Issues: read/write)' });
  if (!buf.length) return send(400, { ok: false, error: 'empty recording' });
  let meta = {};
  try { meta = JSON.parse(decodeURIComponent(req.headers['x-mg-meta'] || '%7B%7D')); } catch (e) {}
  try {
    const release = await getOrCreateRelease();
    const name = `clip-${stamp()}.webm`;
    const asset = await uploadAsset(release.id, name, buf);
    const desc = String(meta.description || '').trim().replace(/\s+/g, ' ');
    const title = desc
      ? `Bug: ${desc.slice(0, 70)}${desc.length > 70 ? '…' : ''} (room ${meta.room})`
      : `Bug report — room ${meta.room != null ? meta.room : '?'} (${String(meta.when || '').slice(0, 19).replace('T', ' ')})`;
    const issue = await createIssue(title, issueBody(meta, name, asset.browser_download_url));
    console.log(`filed issue #${issue.number} (${(buf.length / 1024).toFixed(0)} KB clip)`);
    send(200, { ok: true, number: issue.number, url: issue.html_url, clip: asset.browser_download_url });
  } catch (e) {
    console.error('report failed:', e.message);
    send(502, { ok: false, error: String((e && e.message) || e) });
  }
}

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url.split('?')[0] === '/report') {
    if (rateLimited(req)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'rate limited — wait a minute and try again' }));
      return;
    }
    const chunks = []; let size = 0;
    req.on('data', (d) => { chunks.push(d); size += d.length; if (size > 64 * 1024 * 1024) req.destroy(); });
    req.on('end', () => handleReport(req, res, Buffer.concat(chunks)));
    req.on('error', () => { res.writeHead(400); res.end('bad request'); });
    return;
  }
  let p = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  if (p === '/favicon.ico') { res.writeHead(204); res.end(); return; }   // no icon: silence the 404
  if (p === '/') p = '/index.html';
  const f = path.join(root, p);
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); res.end('404'); }
    else { res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); res.end(d); }
  });
}).listen(process.env.PORT || 8099, process.env.HOST || undefined, function () {
  const a = this.address();
  console.log('serving on ' + (a.address === '::' ? '' : a.address + ':') + a.port);
});
