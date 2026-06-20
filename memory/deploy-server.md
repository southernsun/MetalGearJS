---
name: deploy-server
description: Production server + hosting layout for deploying the web port to metal-gear.nl
metadata:
  type: project
---

The web port is deployed to **metal-gear.nl** (server IP 178.162.151.30), a **CentOS Stream 8**
box. SSH/sudo account is **metalgear** (root access available). Apache **httpd 2.4.37** already
serves the site from **`/home/metalgear/www/html`** via an existing (panel-managed) vhost;
`proxy_module`, `proxy_http_module`, `ssl_module` are loaded. **Node is `/usr/local/bin/node`
(v23)** — used only for the localhost `/report` bug-report service (`web/serve.js`).

Deploy model chosen: **clone the public repo** (`https://github.com/southernsun/MetalGearJS.git`)
to `/home/metalgear/www/MetalGearJS` and **symlink `…/www/html` → `MetalGearJS/web`** (Option B —
keeps the docroot path literal). Updates = `git pull` (no rsync); aim is a pull-based GitHub Action
later. The in-game **B** bug reporter is wanted, so the `/report` Node service + Apache reverse
proxy are part of the deploy. Public site, so `/report` needs an abuse guard (per-IP rate limit in
serve.js). Secrets (`web/.env`, `web/deploy/report.env`) are gitignored — never on the server in
the repo; the PAT lives only in `/etc/metalgear/report.env` (root, chmod 600).
