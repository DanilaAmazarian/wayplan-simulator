# Сборка из корня монорепозитория: docker build -f frontend/Dockerfile .

FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN --mount=type=cache,target=/root/.npm,id=wayplan-npm \
  npm ci --workspace frontend --workspace @travel/shared --include-workspace-root \
    --prefer-offline --no-audit --no-fund --fetch-timeout=900000 --fetch-retries=5

FROM deps AS build
# Адрес API встраивается в клиентский бандл при сборке — это адрес, по которому API видит браузер
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_TELEMETRY_DISABLED=1
COPY shared shared
COPY frontend frontend
WORKDIR /app/frontend
RUN npx next build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/frontend/.next/standalone ./
COPY --from=build --chown=node:node /app/frontend/.next/static frontend/.next/static
COPY --from=build --chown=node:node /app/frontend/public frontend/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:'+process.env.PORT+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "frontend/server.js"]
