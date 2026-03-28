FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# HF Spaces runs as user ID 1000
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user
WORKDIR $HOME/app

# Copy package files first for layer caching
COPY --chown=user package.json package-lock.json ./
COPY --chown=user packages/core/package.json packages/core/
COPY --chown=user packages/server/package.json packages/server/
COPY --chown=user packages/web/package.json packages/web/
COPY --chown=user packages/cli/package.json packages/cli/

RUN npm ci

# Copy source and demo manifest
COPY --chown=user tsconfig.json turbo.json ./
COPY --chown=user packages/ packages/
COPY --chown=user sample-files/ sample-files/

# Build all packages
RUN npm run build:web && npm run build

EXPOSE 7860

CMD ["node", "packages/cli/dist/bin/clawdrive.js", "serve", "--demo", "nasa", "--host", "0.0.0.0", "--port", "7860"]
