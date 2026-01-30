# CouchDB Integration Implementation Summary

## What Was Implemented

### 1. Docker Infrastructure

- **File**: `docker-compose.yml`
- CouchDB 3.3 container on port 5984
- Persistent volumes for data and config
- Health check endpoint monitoring
- Admin credentials: `admin` / `password`

### 2. Development Orchestrator Updates

- **File**: `scripts/dev.js`
- Added Docker service management
- Automatic CouchDB startup before other services
- Health check for port 5984
- Graceful shutdown handling (Ctrl+C stops Docker containers)
- `--reset` flag now resets database volumes

### 3. Preflight Checks

- **File**: `scripts/preflight.js`
- Added port 5984 availability check
- Added CouchDB connectivity check via `http://localhost:5984/_up`
- Fails fast with clear error message if database unreachable

### 4. Environment Configuration

- **Files**: `apps/backend/.env`, `apps/backend/.env.example`
- Added CouchDB connection settings:
  - `COUCHDB_URL=http://localhost:5984`
  - `COUCHDB_USER=admin`
  - `COUCHDB_PASSWORD=password`
  - `COUCHDB_DB_NAME=mks_members`

### 5. Database Client & Schema

- **File**: `apps/backend/src/db/couchdb.ts`
  - Database connection initialization
  - Automatic database creation
  - Index creation for `tagUid` and `isActive` fields
  - MONOREPO_DEV guardrail enforcement

- **File**: `apps/backend/src/types/member.ts`
  - Extended Member interface with:
    - `tagUid`: RFID tag identifier
    - `email`, `phone`: Contact information
    - `roles[]`: Array of roles (admin, vorstand, bereichsleitung, mitglied)
    - `joinDate`: ISO date string
    - `isActive`: Soft delete flag

### 6. Automatic Database Seeding

- **File**: `apps/backend/src/db/seedMembers.ts`
- Seeds 8 members on first startup:
  - **Admin** (tag: 2659423e, all roles)
  - **BackupAdmin** (tag: ab9c423e, all roles)
  - 6 regular members with sample tag UIDs and roles
- Only runs if database is empty (idempotent)

### 7. Members API - Full CRUD

- **File**: `apps/backend/src/routes/memberRoutes.ts`
- **GET /api/members** - List all members
- **GET /api/members/:id** - Get member by ID
- **GET /api/members/by-tag/:tagUid** - Find member by tag UID
- **POST /api/members** - Create new member
- **PUT /api/members/:id** - Update member
- **DELETE /api/members/:id** - Soft delete (sets isActive=false)

### 8. Auth Integration with Members

- **File**: `apps/backend/src/routes/authRoutes.ts`
- Tag events now query members database by `tagUid`
- Enriched tag events include member info:
  ```typescript
  {
    type: 'tag',
    uid: '2659423e',
    isAdmin: true,
    member: {
      id: '1',
      firstName: 'Admin',
      lastName: 'System',
      roles: ['admin', 'vorstand', 'bereichsleitung', 'mitglied']
    }
  }
  ```
- Admin status determined by both:
  1. Environment variable `ADMIN_TAG_UIDS` (fallback)
  2. Member roles containing 'admin'

### 9. Server Initialization

- **File**: `apps/backend/src/server.ts`
- Database initialization runs on startup
- Automatic seeding if database empty
- Async startup with error handling

## How to Test

### 1. Start the Full Stack

```bash
npm run dev
```

This will:

1. Check if Docker is running (fails if not)
2. Start CouchDB container
3. Wait for database health check
4. Start Backend (initializes DB, seeds members)
5. Start Frontend
6. Start NFC Bridge

**Expected Output:**

```
🐳 Starting Docker services...
[+] Running 1/1
✅ CouchDB ready on port 5984
[couchdb] Database created: mks_members
[seed] Seeding default members...
[seed] Inserted member: Admin System (2659423e)
[seed] Inserted member: BackupAdmin System (ab9c423e)
...
✨ MKS Control development environment started!

🗄️  Database:  http://localhost:5984/_utils
🌐 Frontend:  http://localhost:9000
🔌 Backend:   http://localhost:3000
📡 WebSocket: ws://localhost:3000/ws/auth
```

### 2. Access CouchDB Fauxton UI

- Open browser: `http://localhost:5984/_utils`
- Login: `admin` / `password`
- Navigate to `mks_members` database
- Verify 8 member documents exist

### 3. Test Members API

```bash
# List all members
curl http://localhost:3000/api/members

# Get member by ID
curl http://localhost:3000/api/members/1

# Get member by tag UID
curl http://localhost:3000/api/members/by-tag/2659423e

# Create new member
curl -X POST http://localhost:3000/api/members \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Test","lastName":"User","tagUid":"testuid123","roles":["mitglied"]}'

# Update member
curl -X PUT http://localhost:3000/api/members/9 \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Updated","lastName":"Name"}'

# Delete member (soft delete)
curl -X DELETE http://localhost:3000/api/members/9
```

### 4. Test Tag Login with Member Data

1. Open frontend: `http://localhost:9000`
2. Scan admin tag `2659423e` or `ab9c423e`
3. **Expected**: Auto-login to dashboard with full admin access
4. Check browser console - WebSocket should receive:

   ```json
   {
     "type": "tag",
     "uid": "2659423e",
     "isAdmin": true,
     "member": {
       "id": "1",
       "firstName": "Admin",
       "lastName": "System",
       "roles": ["admin", "vorstand", "bereichsleitung", "mitglied"]
     }
   }
   ```

5. Navigate to "Mitglieder verwalten" page
6. Verify 8 members displayed with names from database

### 5. Test Regular Member Tag

1. Scan tag `11223344` (Max Mustermann)
2. **Expected**: Role selection page appears
3. Backend logs should show:
   ```
   [auth-routes] Member found: Max Mustermann, roles: mitglied
   [auth-routes] Tag received: 11223344, isAdmin: false, member: Max Mustermann
   ```

### 6. Test Database Reset

```bash
npm run dev -- --reset
```

- Stops all services
- Removes Docker volumes (deletes all database data)
- Restarts with fresh database
- Re-seeds default 8 members

### 7. Test Error Handling

**Docker Not Running:**

```bash
# Stop Docker Desktop
npm run dev
# Expected: "❌ ERROR: Docker is not running. Please start Docker Desktop."
```

**Database Not Reachable:**

- If CouchDB fails health check, preflight will fail with clear error

## Member Seeded Data

| ID  | Name               | Tag UID  | Roles                                      | Email                        |
| --- | ------------------ | -------- | ------------------------------------------ | ---------------------------- |
| 1   | Admin System       | 2659423e | admin, vorstand, bereichsleitung, mitglied | admin@makerspace.local       |
| 2   | BackupAdmin System | ab9c423e | admin, vorstand, bereichsleitung, mitglied | backup@makerspace.local      |
| 3   | Max Mustermann     | 11223344 | mitglied                                   | max.mustermann@example.com   |
| 4   | Erika Musterfrau   | 55667788 | bereichsleitung, mitglied                  | erika.musterfrau@example.com |
| 5   | Hans Schmidt       | 99aabbcc | mitglied                                   | hans.schmidt@example.com     |
| 6   | Maria Müller       | ddeeff00 | vorstand, mitglied                         | maria.mueller@example.com    |
| 7   | Klaus Weber        | 1a2b3c4d | mitglied                                   | klaus.weber@example.com      |
| 8   | Anna Meyer         | 5e6f7g8h | mitglied (inactive)                        | anna.meyer@example.com       |

## Architecture Changes

### Before (Mock Data)

```
Frontend → Backend (Mock Array) → Response
```

### After (CouchDB)

```
Frontend → Backend → CouchDB → Response
                    ↓
                Tag Scan → Member Lookup → WebSocket Broadcast
```

### Data Flow

1. **Tag Scanned**: NFC Bridge posts to `/api/auth/tag`
2. **Member Lookup**: Backend queries CouchDB by `tagUid`
3. **Enrichment**: Tag event enriched with member data
4. **Broadcast**: WebSocket sends enriched event to frontend
5. **Frontend**: Displays member name, auto-routes based on roles

## Docker Compose Commands

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# Stop and remove volumes (reset database)
docker-compose down -v

# View logs
docker-compose logs -f couchdb

# Check status
docker-compose ps
```

## Troubleshooting

### Port 5984 Already in Use

```bash
# Find process using port
netstat -ano | findstr :5984

# Kill process
taskkill /PID <PID> /F

# Or stop existing Docker container
docker stop mks-control-couchdb
```

### Database Connection Errors

- Check Docker container is running: `docker ps`
- Check CouchDB health: `curl http://localhost:5984/_up`
- Verify credentials in `.env` match `docker-compose.yml`

### Members Not Seeding

- Check backend logs for seeding errors
- Manually inspect database: `http://localhost:5984/_utils`
- Reset database: `npm run dev -- --reset`

## Next Steps

1. **Frontend Member Display**: Update MembersPage.vue to show additional fields (email, phone, roles, joinDate)
2. **Member Edit Form**: Implement actual edit functionality (currently shows "not implemented")
3. **Role Management**: Add UI for assigning/removing roles
4. **Tag Assignment**: Add UI for linking tags to members
5. **Member Photos**: Add profile photo upload and display
6. **Audit Log**: Track member changes (CouchDB revisions support this)
7. **Backup Strategy**: Implement database backup/restore scripts
8. **Production Deployment**: Move credentials to secure secrets management

## Files Modified/Created

### Created

- `docker-compose.yml`
- `apps/backend/src/types/member.ts`
- `apps/backend/src/db/couchdb.ts`
- `apps/backend/src/db/seedMembers.ts`
- `COUCHDB_INTEGRATION.md` (this file)

### Modified

- `scripts/dev.js`
- `scripts/preflight.js`
- `apps/backend/.env`
- `apps/backend/.env.example`
- `apps/backend/package.json` (added nano dependency)
- `apps/backend/src/server.ts`
- `apps/backend/src/routes/memberRoutes.ts`
- `apps/backend/src/routes/authRoutes.ts`
