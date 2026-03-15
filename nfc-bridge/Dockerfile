FROM node:20-alpine

# Native build tools + pcsc-lite für nfc-pcsc
RUN apk add --no-cache python3 make g++ pcsc-lite-dev pcsc-lite pcsc-lite-libs

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/
COPY nfc-bridge/package.json ./nfc-bridge/

# Remove prepare scripts that fail without full source (quasar prepare)
RUN node -e "const p=require('./apps/frontend/package.json'); delete p.scripts.prepare; require('fs').writeFileSync('./apps/frontend/package.json', JSON.stringify(p,null,2))"
RUN npm ci --ignore-scripts && npm rebuild @pokusew/pcsclite

COPY nfc-bridge/ ./nfc-bridge/
WORKDIR /app/nfc-bridge
RUN npx tsc -p tsconfig.json

ENV MONOREPO_DEV=true
CMD ["node", "dist/index.js"]
