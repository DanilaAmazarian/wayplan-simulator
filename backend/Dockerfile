# Сборка из корня монорепозитория: docker build -f backend/Dockerfile .

FROM node:24-bookworm-slim AS deps
WORKDIR /app
# python3/make/g++ — на случай, если для better-sqlite3 нет готовой сборки под платформу;
# openssl — по нему Prisma выбирает версию schema engine, который скачивается при установке
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN --mount=type=cache,target=/root/.npm,id=wayplan-npm \
  npm ci --workspace backend --workspace @travel/shared --include-workspace-root \
    --prefer-offline --no-audit --no-fund --fetch-timeout=900000 --fetch-retries=5

FROM deps AS build
COPY shared shared
COPY backend backend
WORKDIR /app/backend
RUN npx prisma generate && npx tsc

FROM node:24-bookworm-slim AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=4000 \
    DATABASE_URL=file:/data/wayplan.db
WORKDIR /app
# prisma CLI (devDependency) нужен для применения миграций при старте
COPY --from=deps /app/node_modules node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/shared shared
COPY --from=build /app/backend/package.json /app/backend/prisma.config.ts backend/
COPY --from=build /app/backend/prisma backend/prisma
COPY --from=build /app/backend/dist backend/dist
RUN mkdir -p /data && chown node:node /data
USER node
WORKDIR /app/backend
EXPOSE 4000
VOLUME ["/data"]
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "../node_modules/.bin/prisma migrate deploy && node dist/src/index.js"]
