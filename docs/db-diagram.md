# MKS Control Database Diagram

This diagram represents the CouchDB database structure for the MKS Control system.

```mermaid
erDiagram
    MEMBER {
        string _id PK
        string _rev
        string id UK
        string firstName
        string lastName
        string tagUid FK
        string email
        string phone
        string[] roles
        string joinDate
        boolean isActive
        string preferredTheme
        object equipmentPermissions
        string createdAt
        string updatedAt
    }

    TAG {
        string _id PK
        string _rev
        string id UK
        string tagUid UK
        string memberId FK
        string createdAt
        string updatedAt
        boolean isActive
    }

    EQUIPMENT {
        string _id PK
        string _rev
        string type
        string id UK
        string name
        string configuration
        string areaId FK
        boolean isAvailable
        object control "Shelly output, interlocks, extras"

        string createdAt
        string updatedAt
    }

    AREA {
        string _id PK
        string _rev
        string type
        string id UK
        string name
        string description
        string[] bereichsleiterIds FK
        string createdAt
        string updatedAt
    }

    AUDITLOG {
        string _id PK
        string _rev
        string id UK
        string action
        string actorId
        string actorRole
        string targetType
        string targetId
        string timestamp
        string ip
        string userAgent
        string deviceId
    }

    SHELLYDEVICE {
        string _id PK
        string type "shellyDevice"
        string id UK
        string shellyId
        string mac
        string model
        number gen
        string host
        string name
        object[] components
        string health
        string eventKey "never sent to the frontend"
        boolean maintenance
        boolean isActive
    }

    TERMINAL {
        string _id PK
        string type "terminal"
        string id UK
        string name
        string equipmentId FK
        string tokenHash "SHA-256 of the mkt_ key"
        number maxSessionMinutes
        number stillThereTimeoutMinutes
        string lastSeenAt
        boolean isActive
    }

    SESSION {
        string _id PK "session:sha256 of the mks_ token"
        string type "session"
        string kind "entrance or webnfc"
        string memberId FK
        string adminTagUid
        string createdAt
        string lastSeenAt
        string expiresAt
    }

    EQUIPMENTUSAGE {
        string _id PK
        string type "equipmentUsage"
        string id UK
        string equipmentId FK
        string terminalId FK
        string memberId FK
        string memberName
        boolean adminOverride
        string startedAt
        string endedAt
        number durationSec
        string endReason
        number energyWh
    }

    MEMBER ||--o{ TAG : "has"
    MEMBER ||--o{ EQUIPMENT : "has permissions for"
    AREA ||--o{ EQUIPMENT : "contains"
    AREA }o--o{ MEMBER : "managed by (bereichsleiter)"
    MEMBER ||--o{ AUDITLOG : "creates"
    AUDITLOG }o--|| MEMBER : "may reference"
    AUDITLOG }o--|| EQUIPMENT : "may reference"
    AUDITLOG }o--|| TAG : "may reference"
    AUDITLOG }o--|| AREA : "may reference"
    EQUIPMENT }o--o| SHELLYDEVICE : "switched by (control)"
    TERMINAL }o--|| EQUIPMENT : "sits at"
    MEMBER ||--o{ SESSION : "logged in with"
    EQUIPMENT ||--o{ EQUIPMENTUSAGE : "released in"
    MEMBER ||--o{ EQUIPMENTUSAGE : "used"
```

## Database Structure Overview

### Collections

The system uses four CouchDB databases:

1. **mks_members** - Members, areas, equipment, Shelly devices (`shellyDevice`), machine
   terminals (`terminal`) and login sessions (`session`), told apart by `type`
2. **mks_tags** - RFID tag mappings
3. **mks_audit** - Audit logs for user actions and system changes
4. **mks_usage** - Machine releases (`EquipmentUsage`), open while a machine runs

### Entities

#### Member

- Primary user entity in the system
- Contains personal information (name, email, phone)
- Manages roles and permissions
- Links to RFID tags via `tagUid`
- Has equipment-specific permissions stored in `equipmentPermissions` object
- Theme preference for UI customization
- Tracks creation and last update timestamps

#### Tag

- Represents RFID tags assigned to members
- Links to members via `memberId`
- Can be active or inactive
- Unique constraint on `tagUid`
- Tracks creation and last update timestamps

#### Equipment

- Represents machines and tools in the makerspace
- Can be assigned to an area via `areaId`
- Has availability status
- Optional configuration data
- Tracks creation and last update timestamps

#### Area

- Represents physical or logical areas in the makerspace
- Contains equipment
- Has area managers (Bereichsleiter) via `bereichsleiterIds` array

#### ShellyDevice

- A Shelly relay, dimmer, cover or meter (Gen1 or Gen2+) found by IP or mDNS
- `components` lists outputs, inputs and meters; `health` is kept up to date by the health monitor
- `eventKey` authenticates its webhooks; `maintenance` blocks releases and firmware is only installed then

#### Terminal

- One Raspberry Pi per machine; authenticates with an `mkt_` key of which only the hash is stored
- Logins at a terminal live in the backend's memory, not in the database

#### Session

- Login of a browser (`docs/auth-plan.md`), stored as `session:<sha256 of the token>`
- `entrance` sessions end after `SESSION_IDLE_TIMEOUT_MS` without activity, `webnfc` sessions after
  `SESSION_WEBNFC_MAX_MS`; expired ones are deleted by a sweeper

#### EquipmentUsage

- One machine release, from release to switch-off, with duration, end reason and kWh when metered
- Deleted after `USAGE_RETENTION_DAYS` (365)

#### AuditLog

- Records all user actions and system changes for security and compliance
- Captures who performed an action (`actorId`, `actorRole`), what action was performed (`action`), and what entity was affected (`targetType`, `targetId`)
- Includes network metadata: `ip`, `userAgent`, `deviceId` for additional security context
- All timestamps are in ISO 8601 format
- Actions include:
  - **Authentication**: `auth.login`, `auth.login.invalid`, `auth.login.inactive`, `auth.login.admin-tag`, `auth.logout`
  - **Member Management**: `member.create`, `member.update`, `member.roles.update`, `member.activate`, `member.deactivate`, `member.permissions.update`
  - **Area Management**: `area.create`, `area.update`, `area.delete`
  - **Equipment Management**: `equipment.create`, `equipment.update`, `equipment.delete`
  - **Tag Management**: `tag.add`, `tag.remove`
  - **Machines and devices**: `terminal.*`, `machine.*`, `shelly.device.*` (see the routes)
- Automatic retention policy: Logs older than 1 year (365 days) are purged automatically via scheduled cleanup
- Indexes: `timestamp`, `action`, `actorId`, `targetId` for efficient querying and filtering

### Relationships

- **Member ↔ Tag**: One member can have multiple tags (one-to-many)
- **Member ↔ Equipment**: Members have permission records for equipment (many-to-many via equipmentPermissions object)
- **Area ↔ Equipment**: One area contains multiple equipment items (one-to-many)
- **Area ↔ Member**: Areas have multiple managers (Bereichsleiter), members can manage multiple areas (many-to-many)

### Indexes

#### mks_members database:

- `tagUid` - Fast lookup of members by RFID tag
- `isActive` - Filter active/inactive members

#### mks_tags database:

- `tagUid` - Fast lookup of tags by UID
- `memberId` - Find all tags for a specific member

#### mks_audit database:

- `timestamp` - Query logs by creation time
- `action` - Filter audit logs by action type
- `actorId` - Find all actions performed by a specific user
- `targetId` - Find all actions affecting a specific entity

### Audit Logging Configuration

**Environment Variables:**

- `AUDIT_RETENTION_DAYS` (default: 365) - Number of days to retain audit logs before automatic purge
- `AUDIT_CLEANUP_INTERVAL_MS` (default: 86400000 / 24 hours) - How frequently to run the audit retention cleanup job

**Retention Policy:**

The system automatically purges audit logs older than the configured retention period. The cleanup job runs at the specified interval in the background without blocking request processing. This ensures the audit database remains manageable while maintaining compliance with retention requirements.
