FROM node:22-bookworm-slim
WORKDIR /app

COPY package.json bun.lock ./
RUN npm install --include=dev

COPY . .

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0

EXPOSE 8080

CMD ["sh", "-c", "node scripts/build-netlify.mjs && node scripts/dev-server.js"]
