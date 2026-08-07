# Versioning

The browser port carries a single, hand-maintained version so a player — and a bug report — can say
exactly which build they were running.

## Where it lives

`web/game.js`, at the top, is the **only** source of truth:

```js
const APP_VERSION = '0.9.0';
const APP_BUILD = '2026-08-07';
const APP_VERSION_FULL = `v${APP_VERSION} (${APP_BUILD})`;
```

## Where it surfaces

| Surface | How |
| --- | --- |
| The page | `showVersion()` stamps `#version` in `web/index.html`, under the "Source on GitHub" link. Deliberately **not** on the canvas — that is a faithful reproduction of the ROM screen and gets no port-only chrome. |
| Bug reports | `version` / `build` ride in the `X-MG-Meta` header, and `web/serve.js` renders a **Version** row in the GitHub issue table. Reports filed before 0.9.0 show `unknown (pre-0.9.0 build)`. |
| Console | One banner line on load: `Metal Gear browser port v0.9.0 (2026-08-07)`. |

## Why it is hand-maintained

The site deploys as **static files** — `web/deploy/DEPLOY.md` is "copy the `web/` folder to the
server". There is no build step to inject a git SHA or a timestamp, and the `/report` service is the
only dynamic piece. A committed constant is therefore the only thing guaranteed to match what is
actually being served.

## Bumping it

Change both constants in the same commit as the work they describe:

- **PATCH** (`0.9.0` → `0.9.1`) — fixes only, no new behaviour.
- **MINOR** (`0.9.0` → `0.10.0`) — new behaviour or systems.
- **MAJOR** — reserved for 1.0, when the playtest backlog is closed.

`APP_BUILD` is the date of the bump. It is what tells you whether the server has the newest copy:
if the footer date is older than your last deploy, the files did not land.

`web/hud.headless.mjs` asserts the shape of both constants and that `showVersion()` stamps the
element (and does not throw when it is absent), so a half-finished bump fails the suite.

## Current version

**0.9.0** — the port reproduces the full game (235 rooms, every system), with the
`ready-to-test` playtest backlog still open. 1.0 is for when that list is cleared.
