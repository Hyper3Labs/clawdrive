# AGENTS.md

ClawDrive is an agent-native local file platform.

Rules:
- Use `context/` only for external references and scratch work. Do not commit it.
- Keep durable decisions in tracked root docs such as `PLAN.md`, not in `context/`.
- Prefer small, reviewable changes and preserve user-authored work.
- Treat external projects as references, not code to copy.

Run the app:
```sh
npm run build                    # build all packages (turbo)
set -a && . ./.env && set +a
node packages/cli/dist/bin/clawdrive.js serve --host 127.0.0.1 --port 7432
```
Single process serves API (`/api/*`) + built frontend (`/`) on one port.
Verify: `curl http://127.0.0.1:7432/api/files` → 200, open http://127.0.0.1:7432.

For frontend dev with hot-reload, run Vite separately:
```sh
cd packages/web && npm run dev -- --host 127.0.0.1   # port 5173, proxies /api → 7432
```

NASA demo (58 files, auto-downloads ~248 MB on first run):
```sh
npm run build
set -a && . ./.env && set +a
node packages/cli/dist/bin/clawdrive.js ui --demo nasa --port 7432
```
Or with a named workspace:
```sh
node packages/cli/dist/bin/clawdrive.js --workspace nasa-demo serve --host 127.0.0.1 --port 7432
```

Startup workflow:
- `/office-hours` before new features or pivots.
- `/plan-ceo-review` after the initial plan.
- `/plan-design-review` before UI work.
- `/autoplan` for the full review pass.
- `/retro` at the end of the week.
