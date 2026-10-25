# MKS Control

Management system for a maker space: NFC login at the entrance, members, areas and equipment
with permissions, an audit log, and machine control with Shelly devices and one Raspberry Pi
terminal per machine.

## Structure

```
apps/backend/          Express REST API and WebSocket (port 3000), CouchDB
apps/frontend/         Quasar / Vue 3 web app (port 9000 in development)
nfc-bridge/            Reads the NFC reader (ACR122U) and posts scans to the backend
packages/shared-types/ TypeScript types shared by all parts
docs/                  Plans and guides
tests/                 Playwright E2E tests
```

## Development

Requirements: Node 22 (`.nvmrc`), Docker (CouchDB).

```bash
npm ci --workspaces --include-workspace-root
cp apps/backend/.env.example apps/backend/.env
cp nfc-bridge/.env.example nfc-bridge/.env
npm run dev        # starts CouchDB, backend, frontend and (with a reader) the nfc-bridge
```

Always start through `npm run dev` from the root; the services refuse to start without
`MONOREPO_DEV=true`. Open http://localhost:9000, tap **"Eingang einrichten"** and enter the
`ENTRANCE_KEY` from `apps/backend/.env` (`mke_dev-entrance-key`): this browser is then the
entrance kiosk and logs in with scans.

Simulate a scan without a reader:

```bash
curl -X POST http://localhost:3000/api/auth/tag \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer mke_dev-entrance-key" \
  -d '{"type":"tag","uid":"04A224B1C8","source":"manual"}'
```

Checks (the same as CI):

```bash
npx tsc --noEmit -p apps/backend
cd apps/frontend && ../../node_modules/.bin/vue-tsc --noEmit -p tsconfig.typecheck.json
npm run lint
npm run test:e2e   # see docs/testing.md
```

More for developers and AI agents: [`CLAUDE.md`](CLAUDE.md).

## Production

Docker images are built on every push to `master` (`latest`) and `develop` (`develop`) and run
with `docker-compose.prod.yml` under `/opt/mks`; Watchtower updates them. Never push to `master`
directly: every push there goes to production.

## Documentation

| Document                                                     | Content                                                     |
| ------------------------------------------------------------ | ----------------------------------------------------------- |
| [`docs/inbetriebnahme.md`](docs/inbetriebnahme.md)           | Server, `.env`, kiosk, backup, Shellys, test checklist      |
| [`docs/pi-setup.md`](docs/pi-setup.md)                       | Setting up a Raspberry Pi terminal at a machine             |
| [`docs/bedienung-maschinen.md`](docs/bedienung-maschinen.md) | Guide for admins: machines, terminals, usages               |
| [`docs/auth-plan.md`](docs/auth-plan.md)                     | Login: sessions, entrance key, Web NFC, rights per endpoint |
| [`docs/shelly-plan.md`](docs/shelly-plan.md)                 | Machine control with Shellys (phases 1–7)                   |
| [`docs/shelly-flow.md`](docs/shelly-flow.md)                 | Original concept of the Shelly workflow                     |
| [`docs/db-diagram.md`](docs/db-diagram.md)                   | Database documents                                          |
| [`docs/testing.md`](docs/testing.md)                         | E2E tests                                                   |
