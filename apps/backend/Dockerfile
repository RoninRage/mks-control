FROM node:20-slim

WORKDIR /app

# Alle workspace package.json kopieren (npm ci braucht vollständigen Workspace-Tree)
COPY package.json package-lock.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/
COPY nfc-bridge/package.json ./nfc-bridge/

# Remove prepare scripts that fail without full source (quasar prepare)
RUN node -e "const p=require('./apps/frontend/package.json'); delete p.scripts.prepare; require('fs').writeFileSync('./apps/frontend/package.json', JSON.stringify(p,null,2))"
RUN npm ci --ignore-scripts

# Source kopieren (nur was das Backend braucht)
COPY packages/shared-types/ ./packages/shared-types/
COPY apps/backend/ ./apps/backend/

ENV NODE_ENV=production
EXPOSE 3000

WORKDIR /app/apps/backend
CMD ["npx", "ts-node", "--transpile-only", "src/server.ts"]
