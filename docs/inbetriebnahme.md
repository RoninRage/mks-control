# Inbetriebnahme der Maschinensteuerung

Diese Anleitung bringt die Maschinensteuerung (Shellys, Terminals an den Maschinen) in Betrieb.
Sie geht davon aus, dass MKS Control mit `docker-compose.prod.yml` schon auf dem Server läuft.

Weitere Anleitungen:

- [`pi-setup.md`](pi-setup.md): einen Raspberry Pi als Terminal an einer Maschine einrichten
- [`bedienung-maschinen.md`](bedienung-maschinen.md): Bedienung im Admin-Bereich
- [`shelly-plan.md`](shelly-plan.md): wie die Steuerung technisch funktioniert

Reihenfolge: **Server → Shellys → erste Maschine mit Lampe testen → Pi → echte Maschine.**

## 1. Release nach `master`

Der Server zieht die Images mit dem Tag `latest`. Die werden nur aus `master` gebaut
(`.github/workflows/deploy.yml`); `develop` erzeugt das Tag `develop`.

1. PR `develop` → `master` anlegen und mergen.
2. Unter _Actions_ warten, bis „Build and Push Docker Images" grün ist.

> Zum Ausprobieren vorab kann der Server auch `develop` ziehen: `TAG=develop` in
> `/opt/mks/.env`. Danach wieder entfernen.

## 2. Server

### 2.1 Neue Compose-Datei

Watchtower aktualisiert nur die Images vorhandener Container. Neue Dienste und neue
Einstellungen in der Compose-Datei übernimmt es **nicht**. Deshalb einmal von Hand:

```bash
cd /opt/mks
cp docker-compose.prod.yml docker-compose.prod.yml.bak
# neue Fassung aus dem Repository (Stand master) holen
curl -fsSL -o docker-compose.prod.yml \
  https://raw.githubusercontent.com/RoninRage/mks-control/master/docker-compose.prod.yml
```

Ist das Repository privat, die Datei stattdessen mit `scp` vom eigenen Rechner kopieren.

### 2.2 Einstellungen in `/opt/mks/.env`

Pflicht für die Maschinensteuerung:

```bash
# Passwort, das auf allen Shellys gesetzt ist (Abschnitt 3)
SHELLY_PASSWORD=…
# Adresse, unter der die Shellys den Server erreichen. Port 3000 = Backend direkt.
SHELLY_CALLBACK_URL=http://192.168.1.10:3000
# Schlüssel für die automatische Erkennung, z. B. erzeugt mit: openssl rand -hex 32
SHELLY_DISCOVERY_TOKEN=…
```

Prüfen, falls noch nicht geschehen:

```bash
COUCHDB_PASSWORD=…          # nicht "password" lassen
ADMIN_TAG_UIDS=…            # Notfall-Admin-Tags, durch Komma getrennt
GITHUB_OWNER=roninrage      # Besitzer der Images auf ghcr.io (klein geschrieben)
```

Optional (Standardwerte in Klammern):

| Einstellung                    | Bedeutung                                                        |
| ------------------------------ | ---------------------------------------------------------------- |
| `SHELLY_GEN1_USER` (`admin`)   | Benutzername auf Gen1-Shellys. Gen2+ verwenden immer `admin`.    |
| `TERMINAL_OFFLINE_AFTER_MS`    | Pi gilt als offline nach (60 000 ms = 1 min)                     |
| `TERMINAL_IDLE_TIMEOUT_MS`     | Abmelden am Pi ohne Berührung, wenn keine Maschine läuft (5 min) |
| `USAGE_RETENTION_DAYS` (365)   | Nutzungen werden nach so vielen Tagen gelöscht                   |
| `AUDIT_RETENTION_DAYS` (365)   | Audit-Log wird nach so vielen Tagen gelöscht                     |
| `SHELLY_HEALTH_INTERVAL_MS`    | Wie oft alle Shellys geprüft werden (30 000 ms)                  |
| `SHELLY_TIMEOUT_MS` (3000)     | Wartezeit je Anfrage an einen Shelly                             |
| `SHELLY_DISCOVERY_INTERVAL_MS` | Wie oft nach neuen Shellys gesucht wird (60 000 ms)              |

### 2.3 Starten

```bash
cd /opt/mks
docker compose -f docker-compose.prod.yml --env-file .env up -d
docker compose -f docker-compose.prod.yml ps        # alle "running", Backend "healthy"
docker logs mks-control-shelly-discovery --tail 20  # keine Meldung "token missing"
```

### 2.4 Netzwerk und Sicherheit

- **Shellys → Server Port 3000:** Die Shellys melden Sicherheits-Eingänge an
  `SHELLY_CALLBACK_URL`. Eine Firewall auf dem Server muss Port 3000 aus dem Netz der Shellys
  erlauben.
- **Pis → Server Port 80 (und 3000):** Kiosk-Browser auf Port 80, `nfc-bridge` auf Port 3000
  (oder ebenfalls Port 80, die Anfragen an `/api` leitet das Frontend weiter).
- **CouchDB Port 5984** ist nur vom Server selbst erreichbar (`127.0.0.1`). Fauxton daher per
  SSH-Tunnel öffnen: `ssh -L 5984:localhost:5984 <server>`, dann `http://localhost:5984/_utils`.
  In jedem Fall ein starkes `COUCHDB_PASSWORD`.
- Der Server sollte nicht aus dem Internet erreichbar sein. Wer im Netz der Shellys ist, kann
  sie mit dem Passwort direkt schalten.

### 2.5 Sicherung

Alle Daten liegen in CouchDB: Mitglieder, Tags, Shellys, Terminals, Nutzungen, Audit-Log. Der
Dienst `couchdb-backup` sichert jede Nacht alle Datenbanken als JSON nach
`/opt/mks/backup/<Datum>/` und löscht Sicherungen, die älter als `BACKUP_KEEP_DAYS` (30) Tage
sind. Uhrzeit: `BACKUP_HOUR` (2, in UTC).

```bash
mkdir -p /opt/mks/backup
# Sofort eine Sicherung machen (z. B. vor einem Update):
docker exec mks-control-couchdb-backup npx ts-node --transpile-only src/db/backup.ts --once
ls /opt/mks/backup
```

Die Sicherungen zusätzlich auf einen anderen Rechner kopieren (z. B. per `rsync` oder einem
NAS); ein Ausfall der Festplatte des Servers trifft sonst auch die Sicherung.

**Zurückspielen** (überschreibt nichts, was neuer ist, und legt fehlende Datenbanken an):

```bash
docker stop mks-control-backend
docker exec mks-control-couchdb-backup \
  npx ts-node --transpile-only src/db/restore.ts /backup/2026-10-25
docker start mks-control-backend
```

Für einen kompletten Neuanfang vorher die Datenbanken in Fauxton löschen.

## 3. Shellys vorbereiten

Für jeden Shelly, bevor er im Admin-Bereich angelegt wird:

1. **Ins Netz bringen:** Mit der Shelly-App oder über den eigenen WLAN-Zugang des Shelly
   (`http://192.168.33.1`) ins WLAN bzw. LAN des Servers einbinden.
2. **Feste IP:** Im Router eine DHCP-Reservierung für die MAC-Adresse des Shelly anlegen.
   **Wichtig:** MKS Control speichert den Shelly unter seiner IP. Bekommt er eine andere, ist er
   „offline", bis die IP unter „Shelly-Geräte → Bearbeiten" angepasst wird. Nur lokale Adressen
   (192.168.x.x, 10.x.x.x, 172.16–31.x.x) werden angenommen.
3. **Passwort:** In der Weboberfläche des Shelly die Anmeldung einschalten, mit dem Passwort aus
   `SHELLY_PASSWORD`. Gen2+ (Plus, Pro, Mini, Gen3/Gen4): Benutzer ist immer `admin`. Gen1:
   Benutzer `admin` (oder was in `SHELLY_GEN1_USER` steht).
4. **Firmware** aktuell halten. Das geht später auch aus MKS Control heraus (Wartungsmodus).
5. **Shelly Cloud** wird nicht gebraucht und kann aus bleiben.
6. **Ausgang nach Stromausfall:** In den Einstellungen des Ausgangs „Power on default" bzw.
   „Initial state" auf **Aus** stellen. Sonst läuft die Maschine nach einem Stromausfall wieder
   an, ohne dass jemand angemeldet ist.
7. Bei Gen2+-Geräten **keine eigenen Szenen, Skripte oder Timer** auf den Ausgang legen, den MKS
   Control schaltet. Eigene Webhooks dürfen bleiben; MKS Control legt nur Webhooks mit dem
   Namensanfang `mks_` an.

### Elektrik

Die Arbeiten an 230 V/400 V macht eine Elektrofachkraft.

- **Schütz statt Direktschaltung:** Ein Shelly-Relais verträgt je nach Modell 10–16 A ohmsche
  Last, Motoren und Netzteile mit hohem Anlaufstrom deutlich weniger. Größere Maschinen und alle
  Drehstrom-Maschinen schaltet der Shelly über ein Schütz (Steuerspannung über den Shelly).
- **Kein Not-Aus:** Der Shelly gibt die Maschine frei. Not-Aus, Schutzhauben-Schalter mit
  Sicherheitsfunktion und Wiederanlaufschutz bleiben Sache der Maschine und ihrer eigenen
  Verdrahtung. MKS Control ergänzt sie nur.
- **Wiederanlauf:** Maschinen, die nach Spannungswiederkehr von selbst anlaufen würden, brauchen
  einen Wiederanlaufschutz (z. B. Schütz mit Selbsthaltung und Taster). Das ist auch wichtig,
  weil der Sicherheits-Timer die Maschine abschalten kann, während sie läuft.
- **Sicherheits-Eingänge** (z. B. Absaugung läuft, Haube zu): potentialfreie Kontakte am Eingang
  des Shelly, so wie es die Anleitung des Modells vorsieht. Möglichst so wählen, dass ein
  Kabelbruch als „nicht sicher" gilt („Sicher, wenn: Kontakt geschlossen").
- **Leistungsmessung** (für „Erst im Leerlauf ausschalten" und kWh): ein Shelly mit Messung
  (z. B. Plus 1PM, Pro 1PM, Pro 3EM) oder ein zusätzlicher Messer, der die Maschine misst.

## 4. Erste Maschine: mit einer Lampe testen

Bevor eine echte Maschine angeschlossen wird, den ganzen Ablauf mit einer Lampe am Ausgang
prüfen. Einrichtung im Admin-Bereich siehe [`bedienung-maschinen.md`](bedienung-maschinen.md),
der Pi siehe [`pi-setup.md`](pi-setup.md).

- [ ] Shelly-Geräte: Shelly erscheint unter „Im Netz gefunden" (oder per IP) und lässt sich
      anlegen. Status **online**, „Identifizieren" lässt die Lampe kurz blinken.
- [ ] Bei Gen2+: Auf der Karte steht nicht „Nur Abfrage". Wenn Sicherheits-Eingänge eingerichtet
      sind, wird der Push eingerichtet (dafür muss `SHELLY_CALLBACK_URL` stimmen).
- [ ] Terminals: Pi steht auf **Pi online**.
- [ ] Mitglied **ohne** Berechtigung scannt: roter Hinweis statt „Berechtigt für diese Maschine",
      kein Freigabe-Knopf.
- [ ] Mitglied **mit** Berechtigung scannt und gibt frei: Lampe geht an, Terminal-Übersicht zeigt
      „Maschine läuft".
- [ ] Abmelden (Knopf oder erneut scannen): Lampe geht aus (Modus „Sofort ausschalten").
- [ ] Freigeben, dann **Netzwerkkabel des Pi ziehen**: Nach Offline-Zeit plus Sicherheits-Timer
      (Standard 1 + 3 Minuten) geht die Lampe aus.
- [ ] Freigeben, dann **Backend stoppen** (`docker stop mks-control-backend`): Nach dem
      Sicherheits-Timer geht die Lampe aus. Danach `docker start mks-control-backend`.
- [ ] Sicherheits-Eingang öffnen (falls eingerichtet): Lampe geht sofort aus, Freigabe nicht
      möglich, solange er offen ist.
- [ ] Terminals → „Maschine abschalten": Lampe geht aus, Mitglied bleibt angemeldet.
- [ ] „Noch da?" erscheint nach der Höchstdauer; ohne Antwort geht die Lampe aus.
- [ ] Nutzungen: Die Freigaben stehen mit Dauer (und kWh bei Messung) in der Liste.
- [ ] Scan am Eingangs-Leser meldet den Pi **nicht** an; Scan am Pi meldet am Eingang niemanden
      an.
- [ ] Stromausfall simulieren (Shelly kurz vom Strom): Ausgang bleibt danach aus.

Erst wenn alles passt, die Lampe gegen die Maschine tauschen und mit der Maschine die
wichtigsten Punkte wiederholen (Freigabe, Abmelden, bei „Erst im Leerlauf" das Ende eines Jobs).

## 5. Bekannte Grenzen

- **Gen1-Shellys** melden Sicherheits-Eingänge nicht sofort. Sie werden während einer Freigabe
  abgefragt (Reaktion nach etwa 1–2 Sekunden); Gen2+ melden per Push.
- **Rollen beim Lesen:** Wer welche Nutzungen sieht, richtet sich (wie beim Audit-Log) nach
  Angaben, die der Browser mitschickt. Wer das Netz und die API kennt, kann sie fälschen und
  fremde Nutzungen lesen. Das **Schalten** der Maschinen ist davon nicht betroffen: Es geht nur
  mit dem Schlüssel eines Terminals.
- Die automatische Erkennung findet nur Shellys im selben Netzsegment wie der Server (mDNS geht
  nicht über Router hinweg).
- Ohne Pi läuft eine freigegebene Maschine bis zum Ende des Sicherheits-Timers weiter. Den Timer
  pro Maschine darum nicht länger einstellen als nötig.
