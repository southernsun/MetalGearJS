# Deploying the browser port (static + one proxied `/report`)

The port is a static site **except** for `POST /report` (the bug reporter), which holds the
GitHub PAT and calls the GitHub API. So the deploy is: serve `web/` statically, and reverse-proxy
just `/report` to a tiny localhost Node service. Because the whole site is access-restricted to your
selected viewers, that same restriction protects `/report` — no extra abuse guard, and the PAT
never leaves the server.

There is **no temp file**: the ~20s clip is recorded in the browser's memory, POSTed as the request
body, and streamed straight through `serve.js` to GitHub. No writable disk is required.

> **Just want to host the playable game?** It's pure static files — point any web server
> (Apache, nginx, Caddy, …) at the `web/` folder and you're done. **No Node, no reverse proxy,
> no nginx required.** The steps below only add the optional in-game **B** bug reporter, which
> needs the localhost Node `/report` service proxied through your web server. Sample configs for
> both **Apache** ([`apache.conf`](apache.conf)) and **nginx** ([`nginx.conf`](nginx.conf)) are
> in this folder — use whichever you already run.

## 1. Get the files on the server
Copy the exported `web/` folder (`index.html`, `game.js`, `serve.js`, `assets/`, `deploy/`) to e.g.
`/var/www/metalgear/web`. Node 18+ must be installed (only for the `/report` service).

## 2. Create the secret (off-repo, root-only)
```sh
sudo mkdir -p /etc/metalgear
sudo cp /var/www/metalgear/web/deploy/report.env.example /etc/metalgear/report.env
sudo $EDITOR /etc/metalgear/report.env          # paste the fine-grained PAT (Contents R/W + Issues R/W)
sudo chown root:root /etc/metalgear/report.env && sudo chmod 600 /etc/metalgear/report.env
```
Do **not** create a `web/.env` on the server — production reads `GITHUB_TOKEN` from the environment.

## 3. Run the `/report` service (localhost only)
```sh
sudo cp /var/www/metalgear/web/deploy/metalgear-report.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now metalgear-report
systemctl status metalgear-report           # should be listening on 127.0.0.1:8099
```
(`serve.js` honors `HOST`/`PORT`; the unit sets `HOST=127.0.0.1` so the API is not exposed directly.)

## 4. Web server: static + proxy `/report` + access control
Use the sample for whatever you already run:

- **Apache** — [`deploy/apache.conf`](apache.conf): `DocumentRoot` on `web/` + a `/report`
  `ProxyPass` to `127.0.0.1:8099` + `auth_basic`. Needs `mod_proxy`/`mod_proxy_http`/`mod_ssl`
  (`a2enmod ssl proxy proxy_http auth_basic authn_file authz_core`).
- **nginx** — [`deploy/nginx.conf`](nginx.conf): static `root` + `location = /report` proxy +
  `auth_basic`.
- **Caddy** — the equivalent:
```caddy
metalgear.example.com {
    root * /var/www/metalgear/web
    basic_auth { someuser <bcrypt-hash> }     # restrict to your selected viewers
    @report path /report
    reverse_proxy @report 127.0.0.1:8099
    file_server
}
```
Reload the web server. The site and `/report` are now same-origin (no CORS) behind one access gate.

## 5. Verify
- Load the site (you'll be prompted for the access credential), play, press **B**, add a note, Submit.
- The toast should report `Issue #N filed ✓`; check the repo's Issues + the `bug-clips` release.
- No `GITHUB_TOKEN`? the API returns a clear 500 and the toast shows it.

## Notes
- The first report auto-creates a `bug-clips` **release** to host the clips (a git tag on the
  default branch). Prefer no release? switch `serve.js` to commit clips to a branch instead.
- `client_max_body_size 64m` (nginx) must be ≥ the clip size; `serve.js` already caps the body at 64 MB.
- To make the build **fully static** (no `/report` at all), skip steps 2–3 and the proxy block; the
  `B` key will just show a "report failed" toast. Keeping a local `serve.js + web/.env` still lets
  you file reports while developing.
