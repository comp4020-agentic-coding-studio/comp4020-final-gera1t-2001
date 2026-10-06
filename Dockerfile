# syntax = docker/dockerfile:1

FROM node:24-alpine

WORKDIR /app

RUN npm install --global pnpm@11

# Separate from the app source so this layer only rebuilds when a dependency
# changes. pnpm-workspace.yaml's allowBuilds is what lets better-sqlite3's
# install script run (pnpm blocks install scripts by default).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY src ./src
COPY migrations ./migrations
COPY README.md ./README.md

ENV NODE_ENV=production
# fly.toml mounts the app's one persistent volume here.
ENV DB_PATH=/data/app.sqlite3

EXPOSE 8080
CMD ["node", "src/server.ts"]
