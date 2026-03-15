FROM node:20-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/
COPY nfc-bridge/package.json ./nfc-bridge/

# Remove prepare scripts that fail without full source (quasar prepare)
RUN node -e "const p=require('./apps/frontend/package.json'); delete p.scripts.prepare; require('fs').writeFileSync('./apps/frontend/package.json', JSON.stringify(p,null,2))"
RUN npm ci --ignore-scripts

COPY packages/shared-types/ ./packages/shared-types/
COPY apps/frontend/ ./apps/frontend/

ARG AUTH_WS_URL
ARG API_BASE_URL
ENV AUTH_WS_URL=$AUTH_WS_URL
ENV API_BASE_URL=$API_BASE_URL
ENV MONOREPO_DEV=true

WORKDIR /app/apps/frontend
RUN npx quasar build

FROM nginx:alpine
COPY --from=build /app/apps/frontend/dist/spa /usr/share/nginx/html
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
