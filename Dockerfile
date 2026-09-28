# Railway (or any Docker host): build the static site, then serve it with Caddy.

FROM node:22-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# OCR models and the ONNX Runtime WASM are not in git; fetch them before building.
RUN bash scripts/fetch_assets.sh && npm run build

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
