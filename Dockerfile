FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# node:22-slim already has a "node" user with UID 1000
USER node
ENV HOME=/home/node
WORKDIR $HOME/app

# Copy package files first for layer caching
COPY --chown=node package.json package-lock.json ./
COPY --chown=node packages/core/package.json packages/core/
COPY --chown=node packages/server/package.json packages/server/
COPY --chown=node packages/web/package.json packages/web/
COPY --chown=node packages/cli/package.json packages/cli/

RUN npm ci

# Copy source and demo manifest
COPY --chown=node tsconfig.json turbo.json ./
COPY --chown=node packages/ packages/
COPY --chown=node sample-files/ sample-files/

# Build all packages
RUN npm run build:web && npm run build

EXPOSE 7860

CMD ["node", "packages/cli/dist/bin/clawdrive.js", "serve", "--demo", "nasa", "--host", "0.0.0.0", "--port", "7860"]
