# AGENTS.md

ClawDrive is an agent-native local file platform.

Rules:
- Use `context/` only for external references and scratch work. Do not commit it.
- Keep durable decisions in tracked root docs such as `PLAN.md`, not in `context/`.
- Prefer small, reviewable changes and preserve user-authored work.
- Treat external projects as references, not code to copy.

Develop (two terminals):
```sh
npm run dev                      # turbo: tsc --watch (core/server/cli) + Vite on :5173
node packages/cli/dist/bin/clawdrive.js serve   # API on :7432 (.env loaded automatically)
```
Vite proxies `/api` → `localhost:7432`. Open http://127.0.0.1:5173.

Production build:
```sh
npm run build
node packages/cli/dist/bin/clawdrive.js serve --host 127.0.0.1 --port 7432
```
Single process serves API + built frontend on one port.

NASA demo (auto-downloads ~248 MB on first run):
```sh
node packages/cli/dist/bin/clawdrive.js ui --demo nasa --port 7432
```

Startup workflow:
- `/office-hours` before new features or pivots.
- `/plan-ceo-review` after the initial plan.
- `/plan-design-review` before UI work.
- `/autoplan` for the full review pass.
- `/retro` at the end of the week.
