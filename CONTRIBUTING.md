# Contributing to ClawDrive

Thanks for your interest in contributing! This guide will help you get started.

## Getting Started

```bash
git clone https://github.com/hyper3labs/clawdrive.git
cd clawdrive
npm install
npm run dev
```

This starts all packages in watch mode via Turborepo:
- **Web UI** — `http://localhost:5173`
- **API server** — `http://localhost:7432`

## Project Structure

```
packages/
├── core/       # Storage, embedding, search, pots, shares
├── server/     # Express REST API
├── web/        # Vite + React 3D frontend
└── cli/        # CLI entry point
```

## How to Contribute

1. **Fork** the repository and create a branch from `main`
2. **Install** dependencies with `npm install` at the root
3. **Make your changes** — keep commits focused and descriptive
4. **Run tests** with `npm test`
5. **Open a pull request** against `main` with a clear description

## Code Style

- TypeScript throughout — avoid `any` where possible
- Follow existing patterns in each package
- No comments for self-explanatory code

## Reporting Issues

Use [GitHub Issues](https://github.com/hyper3labs/clawdrive/issues) to report bugs or request features. Please include:

- Steps to reproduce (for bugs)
- Expected vs. actual behavior
- Node.js version and OS

## Code of Conduct

Be kind, constructive, and respectful. We're all here to build something great.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

## Publishing the Skill to ClawHub

The skill lives in `skills/clawdrive/`. To publish or update it on [ClawHub](https://clawhub.ai):

```bash
npm i -g clawhub            # one-time
clawhub login               # GitHub OAuth (account must be ≥1 week old)
clawhub publish ./skills/clawdrive --slug clawdrive --name "ClawDrive" --version <semver> --tags latest
```

To sync all local changes at once:

```bash
clawhub sync --all
```

Once published, OpenClaw users install with `openclaw skills install clawdrive`.

Note: all skills on ClawHub are licensed MIT-0.
