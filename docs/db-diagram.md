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

    MEMBER ||--o{ TAG : "has"
    MEMBER ||--o{ EQUIPMENT : "has permissions for"
    AREA ||--o{ EQUIPMENT : "contains"
    AREA }o--o{ MEMBER : "managed by (bereichsleiter)"
```

## Database Structure Overview

### Collections

The system uses two main CouchDB databases:

1. **mks_members** - Stores members, equipment, and areas
2. **mks_tags** - Stores RFID tag mappings

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
