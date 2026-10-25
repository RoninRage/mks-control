# E2E tests

There are no unit tests; everything is covered by Playwright end-to-end tests in `tests/e2e/`
(Chromium only, one worker, run serially). CI runs them on every push and pull request
(`.github/workflows/e2e.yml`), after typecheck and lint.

## Running

CouchDB must be running (`docker compose up -d couchdb`, or `npm run dev` once).

```bash
npm run test:e2e                         # all tests (runs scripts/setup-test-env.js first)
npm run test:e2e:ui                      # interactive
npm run test:e2e:headed                  # visible browser
npx playwright test -g "test name"       # one test (after node scripts/setup-test-env.js)
```

In cloud sessions the frontend needs the API address:
`API_BASE_URL=http://localhost:3000/api npm run test:e2e`.

Playwright starts backend and frontend through `scripts/dev-e2e.js`, or reuses servers already
running on ports 3000 and 9000. A reused backend must have been started with the current
`.env.test`, otherwise it uses other databases.

## Test environment

- `scripts/setup-test-env.js` writes `.env.test` in the repository root: uniquely named test
  databases, `ADMIN_TAG_UIDS=test-admin-tag-001`, fast timings for machines and terminals, the
  fake Shelly password and the entrance key. While `.env.test` exists, the backend runs in test
  mode; `tests/global-teardown.ts` deletes the databases and the file.
- `tests/global-setup.ts` seeds members (admin, member, inactive member, board member), tags and
  areas, and creates login sessions for API requests.
- Tags in tests start with `test-`. The backend refuses such tags when `NODE_ENV=production`.

## Login in tests

The backend ignores role headers; every request needs a session (`docs/auth-plan.md`).

- API requests: `ADMIN_HEADERS`, `MEMBER_HEADERS`, `VORSTAND_HEADERS` from
  `tests/helpers/machines.ts` (sessions from the global setup). For other members:
  `headersForTag(uid)` from `tests/helpers/session.ts` (Web NFC login, cached).
- Browser: `loginAsAdmin(page)`, `loginAsMember(page)`, `loginAs(page, role, uid)` from
  `tests/helpers/auth.ts`. They make the browser the entrance kiosk (store the entrance key),
  post a scan with `ENTRANCE_HEADERS` and wait for the dashboard. `logout(page)` scans again.
- Kiosk sessions end after 30 s without activity in tests (`SESSION_IDLE_TIMEOUT_MS`); tests that
  wait longer on one page have to interact or log in again.

## Machines and Shellys

- `tests/helpers/mockShelly.ts` starts fake Gen1/Gen2 Shellys on `127.0.0.1` (relays, metering,
  inputs, dimmers, covers, firmware, webhooks, offline).
- `tests/helpers/machines.ts`: `setupMachine` (Shelly, equipment control, terminal),
  `keepPiOnline`, `scanAt`, `releaseAt`, `terminalState`, `usagesAt`, `cleanupMachines`.
  Call `cleanupMachines` in `afterEach`; it deletes terminals through the API so running
  releases end in the backend.

## Writing tests

- Quasar puts the `data-testid` of a `q-input` on the native `<input>`: fill it directly.
- Use `expect.poll` or `toHaveURL`/`toBeVisible` instead of fixed waits where possible.
- Clean up what a spec creates (`deleteDocumentsByType` in `tests/helpers/database.ts`).
