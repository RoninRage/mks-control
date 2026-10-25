# Plan: Sichere Anmeldung

**Stand:** 2026-10-25 · **Status:** Plan, noch nicht umgesetzt

## Problem

Das Backend kennt keine Anmeldung. Der Browser schickt Rolle und Mitglieds-ID als Header
(`X-User-Role`, `X-User-ID`) mit, und das Backend glaubt sie. Wer im Netz ist, kann deshalb mit
`X-User-Role: admin`:

- ein Terminal anlegen und mit dessen Schlüssel **jede Maschine freigeben**,
- Maschinen abschalten, Steuerung und Shellys umstellen,
- Mitglieder, Rollen und Berechtigungen ändern, alle Nutzungen und das Audit-Log lesen.

Manche Endpunkte prüfen gar nichts, auch ohne gefälschte Header: Bereiche, Ausstattung und
**Tags** (`POST /api/members/:id/tags`). Wer den eigenen Tag einem Admin-Mitglied zuordnet, ist
danach mit echtem Tag Admin.

Außerdem: Ein Scan am Eingang wird an **alle** Browser geschickt. Jeder Browser, der gerade die
Startseite zeigt, wird angemeldet, auch der Laptop von jemand anderem. Und `POST /api/auth/tag`
nimmt Scans von jedem an.

## Entscheidungen

- Angemeldet wird am **Kiosk am Eingang** (fester NFC-Leser) und am **eigenen Handy** per Web NFC.
  Laptops ohne NFC melden sich nicht an.
- Anmeldung am Kiosk endet nach **5 Minuten ohne Bedienung**, auf dem Handy nach höchstens
  **8 Stunden**. Erneuter Scan und „Abmelden" beenden sie sofort.
- Der Eingang bekommt einen Schlüssel **`ENTRANCE_KEY` in `/opt/mks/.env`**. Der
  `nfc-bridge`-Container am Server bekommt ihn automatisch, am Kiosk wird er einmal eingetippt.

## Lösung

### Sitzungen im Backend

- Nach einem gültigen Scan erzeugt das Backend eine **Sitzung**: zufälliges Token
  (`mks_…`, 32 Byte), gespeichert wird nur der SHA-256-Hash, wie bei den Terminal-Schlüsseln.
  Dokument `type: 'session'` in `mks_members` mit `memberId`, Rolle(n), `kind`
  (`entrance` | `webnfc`), `createdAt`, `lastSeenAt`, `expiresAt`. In CouchDB, damit ein Update
  per Watchtower nicht alle abmeldet.
- Der Browser schickt das Token bei jeder Anfrage als `Authorization: Bearer mks_…`.
- Eine Middleware liest das Token, prüft Ablauf und Leerlauf, lädt das Mitglied **frisch aus der
  Datenbank** (gesperrt oder Rolle entzogen → wirkt sofort) und setzt `req.auth` mit
  `memberId`, `roles` und höchster Rolle. `lastSeenAt` wird höchstens einmal pro Minute
  gespeichert.
- Die Header `X-User-Role`/`X-User-ID` werden **ignoriert**. Audit-Log nimmt Akteur und Rolle
  aus der Sitzung.
- `POST /api/auth/logout` beendet die Sitzung. Ein Aufräumer löscht abgelaufene Sitzungen.
- Admin-Tags aus `ADMIN_TAG_UIDS` (ohne Mitglied) bekommen eine Sitzung mit Rolle `admin` ohne
  `memberId`.

### Kiosk am Eingang

- `ENTRANCE_KEY` (`mke_…`) schützt den Eingang. `nfc-bridge` schickt ihn mit jedem Scan (wie
  `TERMINAL_TOKEN` an den Maschinen). Scans **ohne** gültigen Schlüssel werden abgelehnt (401),
  ebenso `heartbeat` und `reader-error`.
- Der Kiosk-Browser speichert den Schlüssel einmal (Einrichtungs-Dialog, wie bei den Pis) und
  meldet seine WebSocket-Verbindung damit an.
- Nach einem Scan geht das Ergebnis **nur an die Kiosk-Verbindungen**, mit dem Sitzungs-Token.
  Andere Browser bekommen nichts mehr. Erneuter Scan am Kiosk beendet die Sitzung im Backend.
- Leerlauf 5 Minuten: Das Backend lehnt die Sitzung danach ab; der Kiosk meldet sich zusätzlich
  selbst ab und geht zur Startseite.
- Tag-Zuweisung (Tag am Eingang scannen, um ihn einem Mitglied zuzuordnen) läuft weiter über den
  Kiosk: Der Scan kommt nur dort an.

### Handy (Web NFC)

- Das Handy liest den Tag und schickt `POST /api/auth/webnfc { uid }`. Die Antwort enthält das
  Token direkt, kein WebSocket nötig.
- Risiko: Wer eine UID kennt, kann sich ohne Tag anmelden (UIDs sind nicht geheim, jedes Handy
  kann sie lesen). Gegenmaßnahmen:
  - **Notfall-Admin-Tags** aus `ADMIN_TAG_UIDS` gehen hier **nicht**, nur am Kiosk.
  - Begrenzung: höchstens 10 Versuche pro Minute und IP, unbekannte UIDs werden im Audit-Log
    vermerkt.
  - Einstellung `WEBNFC_LOGIN=false` schaltet die Handy-Anmeldung ganz ab.
- Tag-Zuweisung per Handy (EditMemberPage) bleibt; sie setzt eine Sitzung mit passender Rolle
  voraus.

### Rechte je Endpunkt

Grundsatz: Alle `/api`-Endpunkte brauchen eine Sitzung. Ausnahmen: `/api/auth/*` (mit
Eingangs-Schlüssel bzw. Web NFC), `/api/terminal/*` (Terminal-Schlüssel),
`/api/shelly/events` (Geräteschlüssel), `/api/shelly/discovered` (Erkennungs-Schlüssel),
`/health`.

Die Rechte entsprechen dem, was das Frontend heute schon anzeigt (`user-store.ts`):

| Bereich                                         | Wer                                                         |
| ----------------------------------------------- | ----------------------------------------------------------- |
| Mitglieder lesen                                | angemeldet (Mitglied: nur sich selbst)                      |
| Mitglied anlegen, löschen, importieren          | admin, vorstand (löschen wie heute nur admin für Admins)    |
| Mitglied bearbeiten                             | admin, vorstand, bereichsleitung; jeder sein eigenes Profil |
| Rollen ändern                                   | admin, vorstand (wie heute, nicht die eigenen)              |
| Ausstattungsberechtigung setzen                 | admin, vorstand; bereichsleitung im eigenen Bereich         |
| Tags zuordnen, entfernen                        | admin, vorstand, bereichsleitung                            |
| Bereiche anlegen, ändern, löschen               | admin, vorstand                                             |
| Ausstattung anlegen, ändern, löschen, Steuerung | admin                                                       |
| Bereiche und Ausstattung lesen                  | angemeldet                                                  |
| Shellys, Terminals, Fernabschaltung             | admin                                                       |
| Nutzungen, Audit-Log                            | wie heute, aber Rolle aus der Sitzung                       |

### Frontend

- `user-store` speichert das Token und die Daten aus der Antwort; die Rolle kommt vom Backend.
  `fetch-headers.ts` setzt nur noch `Authorization`. Antwortet das Backend mit 401, meldet das
  Frontend ab und geht zur Startseite.
- Kiosk-Einrichtung: Dialog „Eingang einrichten" (Schlüssel eintippen), erreichbar über einen
  Link auf der Startseite.
- Startseite ohne Kiosk-Schlüssel und ohne Web NFC: Hinweis „Bitte am Eingang oder mit dem Handy
  anmelden".

### Tests

- `setup-test-env.js` setzt `ENTRANCE_KEY`. Neuer Helfer `loginApi(uid)` liefert ein Token für
  API-Tests (über `POST /api/auth/webnfc`, bzw. für Admin-Tags über den Eingang).
  `ADMIN_HEADERS` wird zu Headern mit Token eines Admin-Mitglieds.
- `loginAsAdmin(page)` richtet den Kiosk-Schlüssel im Browser ein und scannt mit Schlüssel.
- Neue Tests: gefälschte Header wirken nicht; ohne Sitzung 401; jede Zeile der Rechte-Tabelle;
  Leerlauf und Ablauf; Scan erreicht nur den Kiosk; Web NFC ohne Admin-Tags; Rate-Limit;
  gesperrtes Mitglied verliert die Sitzung sofort.

## Teil B: Betrieb (eigener kleiner PR, zuerst)

- `docker-compose.prod.yml`: CouchDB nur noch auf `127.0.0.1:5984`.
- Sicherung: Dienst `couchdb-backup` (nächtlich, behält 30 Tage) in `docker-compose.prod.yml`.
- CI: Schritte für Typecheck (Backend, Frontend) und Lint vor den E2E-Tests.

## Umsetzung

1. **Teil B** (klein).
2. **Sitzungen und Middleware** im Backend, Rechte-Tabelle, Eingangs-Schlüssel, Web-NFC-Endpunkt;
   Frontend auf Token umstellen; Tests umstellen und neue Tests. Ein PR, weil Backend und
   Frontend nur zusammen funktionieren.
3. Doku: `inbetriebnahme.md` (`ENTRANCE_KEY`, Kiosk einrichten), CLAUDE.md (Auth-Modell).

## Inbetriebnahme danach

1. `ENTRANCE_KEY` in `/opt/mks/.env` setzen (`openssl rand -hex 32`, mit Präfix `mke_`).
2. Neue Compose-Datei, `docker compose up -d` (nfc-bridge bekommt den Schlüssel).
3. Am Kiosk „Eingang einrichten" und Schlüssel eintippen.
4. Alle sind abgemeldet und melden sich neu an.

## Offene Fragen

Keine.
