FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-noto-cjk libreoffice-writer && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production BROWSER_PATH=/usr/bin/chromium LIBREOFFICE_PATH=/usr/bin/libreoffice PORT=4317 HOST=0.0.0.0
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/package.json ./package.json
USER node
EXPOSE 4317
CMD ["node", "server/index.mjs"]
