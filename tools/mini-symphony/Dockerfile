FROM oven/bun:1.3.0
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY tools/mini-symphony/queue.mjs tools/mini-symphony/pilot.mjs ./tools/mini-symphony/
USER bun
EXPOSE 8080
CMD ["bun", "tools/mini-symphony/pilot.mjs", "api"]
