FROM node:24-slim

RUN apt-get update && apt-get install -y python3 make g++ sqlite3 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsup.config.ts ./
COPY src ./src
COPY drizzle ./drizzle

ENV DATA_DIR=/app
RUN npm run build && npm prune --omit=dev

EXPOSE 3000
ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
