# AGENTS.md

ClawDrive is an agent-native local file platform.

Rules:
- Use `context/` only for external references and scratch work. Do not commit it.
- Keep durable decisions in tracked root docs such as `PLAN.md`, not in `context/`.
- Prefer small, reviewable changes and preserve user-authored work.
- Treat external projects as references, not code to copy.

Develop (VS Code tasks — run both):
- **Frontend** task: `cd packages/web && npm run dev` (Vite on :5173)
- **Backend** task: `node packages/cli/dist/bin/clawdrive.js serve --port 7432`

Vite proxies `/api` → `localhost:7432`. Open http://127.0.0.1:5173.

NASA demo: run the **Backend (NASA demo)** task instead of Backend.

Startup workflow:
- `/office-hours` before new features or pivots.
- `/plan-ceo-review` after the initial plan.
- `/plan-design-review` before UI work.
- `/autoplan` for the full review pass.
- `/retro` at the end of the week.
