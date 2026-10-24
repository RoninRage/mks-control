# Plan: Shelly-Steuerung

**Stand:** 2026-10-24 · **Status:** Entwurf, noch nicht umgesetzt

Ziel: Maschinen (Ausstattung) werden über Shelly-Relais freigeschaltet. Ein Mitglied meldet sich per
NFC-Tag an und kann nur die Ausstattung einschalten, für die es eine Berechtigung hat
(`member.equipmentPermissions`). Admins verwalten die Shelly-Geräte und ordnen sie der Ausstattung zu.

Grundlage ist das Konzept in [`ShellyFlow.md`](../ShellyFlow.md). Dieser Plan weicht an einer
Stelle bewusst davon ab (siehe „Architektur-Entscheidung").

## Architektur-Entscheidung: Das Backend schaltet, nicht die Touch-Clients

`ShellyFlow.md` sieht vor, dass der Server eine JSON-Konfiguration erzeugt und die
Raspberry-Pi-Clients sich damit **direkt** mit den Shellys verbinden. Vorschlag stattdessen:

```
Touch-Client (Frontend)  --POST /api/equipment/:id/power-->  Backend  --HTTP RPC-->  Shelly
                         <--WebSocket: Status-Updates-------  Backend  <--Polling---
```

Gründe:

- **Berechtigung wird an einer Stelle geprüft.** Würde der Client direkt schalten, könnte jeder im
  Netz die Shelly-API aufrufen und die Berechtigungsprüfung umgehen.
- **Lückenloses Audit-Log** über das bestehende `logAuditEvent`.
- **Shelly-Zugangsdaten bleiben auf dem Server**, nicht auf jedem Pi.
- **Weniger Teile:** Konfiguration erzeugen, versionieren und verteilen (S9, S10, P1–P3 im Konzept)
  entfällt. Die Clients zeigen nur Status an und senden Schaltwünsche.

Die Zustände aus dem State-Diagramm (Discovered → Unassigned → Assigned → Active/Offline/Retired)
bleiben erhalten.

## Wichtige Voraussetzung: Anmeldung serverseitig absichern

Heute vertraut das Backend den Headern `X-User-ID` und `X-User-Role`, die der Client selbst setzt.
Für Listen und Formulare ist das tragbar. Für das **physische Einschalten von Maschinen** reicht es
nicht: Mit einem `curl` und gefälschten Headern ließe sich jede Maschine einschalten.

Vorschlag (kleiner Schritt, kein komplettes Token-System):

- `authRoutes` merkt sich beim Tag-Scan pro Gerät (`x-device-id`) eine **Sitzung**:
  `deviceId → { memberId, roles, loginAt, expiresAt }` (im Speicher, mit Ablauf, z. B. 15 Min.
  Inaktivität). Ein Logout-Scan löscht sie.
- Der Schalt-Endpunkt nimmt das Mitglied **aus dieser Sitzung**, nicht aus den Headern.
- Später optional: ein geheimer Schlüssel pro Touch-Client, damit auch `x-device-id` nicht gefälscht
  werden kann.

## Datenmodell

Neuer Dokumenttyp `shellyDevice` in `mks_members` (wie Bereiche und Ausstattung, über das Feld
`type` unterschieden). Typen kommen nach `packages/shared-types/src/index.ts`.

```ts
export type ShellyDeviceState = 'unassigned' | 'assigned' | 'retired';
export type ShellyHealth = 'online' | 'degraded' | 'offline' | 'unknown';

export interface ShellyChannel {
  channel: number; // Relais-Index (Switch id)
  equipmentId?: string; // zugeordnete Ausstattung
  autoOffMinutes?: number; // Sicherheits-Timer, wird auf dem Shelly gesetzt
}

export interface ShellyDevice {
  _id?: string;
  _rev?: string;
  type?: 'shellyDevice';
  id: string;
  shellyId: string; // aus GET /shelly, z. B. "shellyplus1pm-a8032ab12345"
  mac: string;
  model: string;
  gen: number;
  host: string; // IP oder Hostname
  name: string; // Anzeigename
  firmware?: string;
  state: ShellyDeviceState;
  health: ShellyHealth;
  lastSeenAt?: string;
  channels: ShellyChannel[];
  createdAt?: string;
  updatedAt?: string;
}

export interface EquipmentPowerStatus {
  equipmentId: string;
  on: boolean;
  health: ShellyHealth;
  powerW?: number; // nur bei Geräten mit Leistungsmessung (PM)
  autoOffAt?: string;
  switchedBy?: string; // memberId
}
```

Eine Ausstattung hängt an höchstens einem Kanal. Shelly-Passwort zunächst als **eine** Umgebungsvariable
`SHELLY_PASSWORD` für alle Geräte, nicht in CouchDB.

## Shelly-API (nur Gen2+ in der ersten Version)

Gen2+ (Plus, Pro, Gen3/Gen4) haben eine einheitliche JSON-RPC-API über HTTP:

| Zweck                    | Aufruf                                                                     |
| ------------------------ | -------------------------------------------------------------------------- |
| Gerät erkennen           | `GET http://<host>/shelly` → `id`, `mac`, `model`, `gen`, `ver`, `auth_en` |
| Einschalten mit Auto-Aus | `GET /rpc/Switch.Set?id=0&on=true&toggle_after=<sek>`                      |
| Ausschalten              | `GET /rpc/Switch.Set?id=0&on=false`                                        |
| Status                   | `GET /rpc/Switch.GetStatus?id=0` → `output`, `apower`, …                   |
| Konfiguration            | `GET /rpc/Shelly.GetConfig`                                                |

Authentifizierung: HTTP Digest (SHA-256, Benutzer `admin`), wenn `auth_en` gesetzt ist.

Der **Auto-Aus-Timer läuft auf dem Shelly selbst** (`toggle_after`). Damit schaltet die Maschine
auch ab, wenn das Backend abstürzt oder das Netz ausfällt.

Gen1-Geräte (andere API: `/relay/0?turn=on&timer=`) erst unterstützen, wenn sie tatsächlich im
Einsatz sind.

## Backend

Neue Dateien:

- `src/shelly/shellyClient.ts`: dünne RPC-Hülle (Probe, Switch.Set, GetStatus, Digest-Auth, Timeout ~3 s)
- `src/shelly/healthMonitor.ts`: fragt alle zugeordneten Geräte alle ~15 s ab, setzt
  `online/degraded/offline` (offline nach 3 Fehlversuchen), sendet Änderungen per WebSocket
- `src/shelly/sessions.ts`: Sitzungen pro Touch-Client (siehe oben)
- `src/routes/shellyRoutes.ts`: Geräteverwaltung (nur `admin`)
- Erweiterung `equipmentRoutes.ts`: Schalten und Status

Endpunkte:

| Methode | Pfad                                | Wer                    | Zweck                                 |
| ------- | ----------------------------------- | ---------------------- | ------------------------------------- |
| GET     | `/api/shelly/devices`               | admin                  | Liste mit Status                      |
| POST    | `/api/shelly/devices` `{ host }`    | admin                  | Gerät per IP prüfen und anlegen       |
| PUT     | `/api/shelly/devices/:id`           | admin                  | Name, Kanal → Ausstattung, Auto-Aus   |
| POST    | `/api/shelly/devices/:id/identify`  | admin                  | kurz an/aus schalten zum Wiederfinden |
| DELETE  | `/api/shelly/devices/:id`           | admin                  | auf `retired` setzen                  |
| GET     | `/api/equipment/:id/power`          | angemeldet             | aktueller Status                      |
| POST    | `/api/equipment/:id/power` `{ on }` | Sitzung + Berechtigung | Ein/Aus                               |

WebSocket: neuer Ereignistyp `equipment-power` über den bestehenden `/ws/auth`. Das Frontend
ignoriert unbekannte Typen schon heute (Type Guards in `authEventSource.ts`), das ist also
rückwärtskompatibel.

Audit-Aktionen: `shelly.device.create`, `shelly.device.assign`, `shelly.device.retire`,
`equipment.power.on`, `equipment.power.off`, `equipment.power.denied`.

## Frontend

- **Neue Seite `/devices` „Geräte"** (nur admin): Liste mit Modell, IP, Status-Chip, zugeordneter
  Ausstattung. Dialog „Gerät hinzufügen" (IP eingeben → Prüfung → Anlegen), Buttons „Identifizieren"
  und „Zuordnen".
- **`EditEquipmentPage`:** zeigt den zugeordneten Shelly-Kanal und den Online-Status an.
- **Schalten für Mitglieder:** Auf dem Dashboard die Karte „Meine Ausstattung" mit großem
  Ein/Aus-Button (mind. 44×44 px), Restzeit bis Auto-Aus und Leistungsanzeige (falls PM-Gerät).
  Ist das Gerät offline: Button deaktiviert, Warnhinweis.
- `services/shellyService.ts` und die Erweiterung von `equipmentService.ts`.

## Netzwerk und Betrieb

- Das Backend muss die Shellys per HTTP erreichen. Im Docker-Bridge-Netz geht das, solange sie im
  selben LAN liegen.
- **mDNS-Erkennung funktioniert im Bridge-Netz nicht** (Multicast kommt nicht in den Container).
  Darum zuerst **IP manuell eintragen** und automatische Erkennung später als eigener kleiner Dienst
  mit `network_mode: host` (wie die `nfc-bridge`), der gefundene Geräte an das Backend meldet.
- Den Shellys feste IPs per DHCP-Reservierung geben.
- Neue Variablen in `.env.example` und `docker-compose.prod.yml`: `SHELLY_PASSWORD`,
  `SHELLY_POLL_INTERVAL_MS`.

## Testen ohne Hardware

In der Cloud und in der CI gibt es keine Shellys. Darum:

- `tests/helpers/mockShelly.ts`: kleiner HTTP-Server, der `/shelly` und `/rpc/Switch.*` nachbildet
  (Zustand im Speicher, Timer, abschaltbar für „offline").
- E2E-Specs `devices.spec.ts` (Gerät anlegen, zuordnen) und `equipment-power.spec.ts`
  (mit Berechtigung schalten, ohne Berechtigung abgelehnt, offline-Anzeige, Logout-Verhalten).

## Umsetzung in Phasen

Jede Phase ist ein eigener PR und für sich lauffähig.

1. **Grundlagen:** Typen, `shellyClient`, Mock-Shelly, Gerät per IP anlegen, Liste, Identifizieren.
2. **Zuordnung:** Kanal → Ausstattung, Anzeige in `EditEquipmentPage`.
3. **Serverseitige Sitzung:** Sitzung pro Touch-Client in `authRoutes`, inklusive Logout und Ablauf.
4. **Schalten:** Power-Endpunkte mit Berechtigungsprüfung, Auto-Aus, Audit, UI auf dem Dashboard.
5. **Überwachung:** Health-Monitor, WebSocket-Updates, Offline-Anzeige.
6. **Später/optional:** mDNS-Erkennung, Gen1-Support, Shelly-Outbound-WebSocket statt Polling,
   Leistungsmessung („Maschine läuft noch"), Wartungsmodus, Firmware-Updates.

## Risiken

- **Abschalten unter Last:** Eine Maschine mitten im Job abzuschalten (Laser, CNC, 3D-Drucker) kann
  Werkstücke oder Maschinen beschädigen. Auto-Aus und Logout-Verhalten müssen pro Ausstattung
  einstellbar sein. Bei PM-Geräten vor dem Abschalten prüfen, ob noch Leistung fließt.
- **„Identifizieren" schaltet das Relais:** Nur erlauben, solange das Gerät `unassigned` ist oder
  der Admin ausdrücklich bestätigt.
- **Relais ist keine Sicherheitsabschaltung:** Not-Aus bleibt Sache der Maschine selbst.

## Offene Fragen

1. **Welche Shelly-Modelle** sind im Einsatz oder geplant (Plus 1PM, Pro, Gen1)? Mit Leistungsmessung?
2. **Wo stehen die Touch-Clients?** Ein zentrales Terminal am Eingang oder ein Pi pro Maschine bzw.
   Bereich? Das bestimmt, ob man am Terminal eine Maschine auswählt oder automatisch „seine" schaltet.
3. **Was passiert beim Abmelden?** Maschine sofort aus, oder läuft sie bis zum Auto-Aus weiter?
4. **Wer darf schalten?** Nur Mitglieder mit Berechtigung? Bereichsleitung für ihren Bereich?
   Admin immer?
5. **Netzwerk:** Liegen die Shellys im selben Subnetz wie der Server oder in einem eigenen VLAN?
