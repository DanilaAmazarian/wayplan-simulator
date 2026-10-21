# Сборка из корня монорепозитория: docker build -f frontend/Dockerfile .

FROM node:24.22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN --mount=type=cache,target=/root/.npm,id=wayplan-npm \
  npm ci --workspace frontend --workspace @travel/shared --include-workspace-root \
    --prefer-offline --no-audit --no-fund --fetch-timeout=900000 --fetch-retries=5

FROM deps AS build
ARG API_URL=http://localhost:4000
ENV API_URL=$API_URL
COPY shared shared
COPY frontend frontend
WORKDIR /app/frontend
RUN node scripts/write-api-url.mjs
RUN npm run build

FROM nginx:1.27-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist/frontend/browser /usr/share/nginx/html
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null || exit 1
