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

# Copy source
COPY tsconfig.json turbo.json ./
COPY packages/ packages/

# Build all packages (web first, then TypeScript)
RUN npm run build:web && npm run build

# HF Spaces expects port 7860
ENV PORT=7860
EXPOSE 7860

# GEMINI_API_KEY is set as HF Space secret
CMD ["node", "packages/cli/dist/bin/clawdrive.js", "serve", "--demo", "nasa", "--host", "0.0.0.0", "--port", "7860"]
