# Build dependencies from Helios' lockfile, including PGlite (a devDependency).
FROM oven/bun:1.4.2 AS dependencies
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Match the Node 22 runtime used in existing Fly releases.
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN node scripts/build-netlify.mjs
EXPOSE 8080
CMD ["node", "scripts/dev-server.js"]
