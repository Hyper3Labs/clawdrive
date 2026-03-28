FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first for layer caching
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
COPY packages/cli/package.json packages/cli/

RUN npm ci

# Copy source and demo manifest
COPY tsconfig.json turbo.json ./
COPY packages/ packages/
COPY sample-files/ sample-files/

# Build all packages (web first, then TypeScript)
RUN npm run build:web && npm run build

# Pre-download NASA demo files at build time so startup is fast
RUN node -e " \
  const {readFileSync,existsSync,mkdirSync,writeFileSync} = require('fs'); \
  const {join,dirname} = require('path'); \
  const manifest = JSON.parse(readFileSync('sample-files/sources.json','utf8')); \
  const cacheDir = join('context','demo-datasets','nasa'); \
  async function dl() { \
    for (const e of manifest.entries) { \
      if (!e.sourceUrl) continue; \
      const dest = join(cacheDir, e.fileName); \
      mkdirSync(dirname(dest), {recursive:true}); \
      console.log('Downloading', e.fileName); \
      const res = await fetch(e.sourceUrl); \
      if (!res.ok) { console.error('SKIP', e.fileName, res.status); continue; } \
      const buf = Buffer.from(await res.arrayBuffer()); \
      writeFileSync(dest, buf); \
    } \
  } \
  dl().catch(e => { console.error(e); process.exit(1); }); \
"

# HF Spaces expects port 7860
ENV PORT=7860
EXPOSE 7860

# GEMINI_API_KEY is set as HF Space secret
CMD ["node", "packages/cli/dist/bin/clawdrive.js", "serve", "--demo", "nasa", "--host", "0.0.0.0", "--port", "7860"]
