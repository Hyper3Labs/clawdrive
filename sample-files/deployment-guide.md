# Deployment Guide

## Local Development
```bash
pnpm install
pnpm dev        # starts web + API on localhost:5173
```

## Self-Hosted (Docker)
```bash
docker compose up -d
# Access at http://localhost:8080
# Data stored in ./data volume
```

## Environment Variables
- `GEMINI_API_KEY` — Required for real embeddings
- `CLAWDRIVE_DATA_DIR` — Override default data directory
- `CLAWDRIVE_PORT` — API port (default: 3000)
- `CLAWDRIVE_LOG_LEVEL` — debug, info, warn, error

## Production Checklist
- [ ] Set strong API keys
- [ ] Enable HTTPS
- [ ] Configure backup schedule
- [ ] Set up monitoring alerts
- [ ] Rate limit the search endpoint
