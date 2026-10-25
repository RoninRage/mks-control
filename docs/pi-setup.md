# Einrichtung: Raspberry Pi an einer Maschine

Diese Anleitung richtet ein **Terminal** ein: einen Raspberry Pi mit Touchscreen und NFC-Leser
an einer Maschine. Mitglieder melden sich dort per Tag an und geben die Maschine frei. Wie das
Ganze funktioniert, steht in [`shelly-plan.md`](shelly-plan.md).

Pro Maschine braucht es:

- Raspberry Pi 4 oder 5 mit Netzteil, Touchscreen (z. B. offizielles 7"-Display)
- NFC-Leser ACR122U (USB)
- Einen Shelly, der die Maschine schaltet (in der Admin-Oberfläche unter „Shelly-Geräte" angelegt)

> Den Pi **nicht** über den Shelly der Maschine mit Strom versorgen. Sonst geht der Pi aus, sobald
> die Maschine abgeschaltet wird.

## 1. Im Admin-Bereich vorbereiten

1. **Shelly-Geräte:** Shelly hinzufügen (IP eintippen oder unter „Im Netz gefunden" anklicken).
2. **Ausstattung → Maschine bearbeiten → Steuerung:** Shelly und Ausgang wählen, ggf.
   Leistungsmessung, Abschaltmodus, Sicherheits-Eingänge und Zusatzfunktionen. Speichern.
3. **Terminals → Terminal anlegen:** Name (z. B. „Pi Lasercutter") und Maschine wählen,
   Höchstdauer und Antwortzeit für „Noch da?" festlegen. Den angezeigten **Schlüssel**
   (`mkt_…`) kopieren. Er wird nur einmal angezeigt; verloren → „Neuer Schlüssel".

## 2. Raspberry Pi OS installieren

1. Mit dem Raspberry Pi Imager **Raspberry Pi OS (64-bit) mit Desktop** auf die SD-Karte
   schreiben. Im Imager Hostname (z. B. `pi-laser`), Benutzer, WLAN/LAN und SSH einstellen.
2. Pi starten, per SSH anmelden und aktualisieren:

   ```bash
   sudo apt-get update && sudo apt-get full-upgrade -y
   ```

3. Dem Pi im Router eine **feste IP** geben (DHCP-Reservierung). Das ist nicht zwingend, macht
   die Fehlersuche aber leichter.

## 3. NFC-Leser und nfc-bridge

Die `nfc-bridge` liest den NFC-Leser und schickt jeden Scan mit dem Terminal-Schlüssel an den
Server. Die Docker-Images werden nur für x86 gebaut, deshalb läuft sie auf dem Pi direkt mit
Node.js.

1. Treiber für den Leser und Werkzeuge:

   ```bash
   sudo apt-get install -y pcscd pcsc-tools git build-essential python3
   sudo systemctl enable --now pcscd
   pcsc_scan   # Tag auflegen: die UID muss erscheinen. Mit Strg+C beenden.
   ```

   Erscheint der Leser nicht, das Kernel-Modul sperren, das ihn belegt:

   ```bash
   echo -e "blacklist pn533_usb\nblacklist pn533\nblacklist nfc" | sudo tee /etc/modprobe.d/blacklist-nfc.conf
   sudo reboot
   ```

2. Node.js 22:

   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
   sudo apt-get install -y nodejs
   node --version   # v22.x
   ```

3. Nur den Ordner `nfc-bridge` aus dem Repository holen und installieren:

   ```bash
   git clone --depth 1 https://github.com/RoninRage/mks-control.git /tmp/mks-control
   cp -r /tmp/mks-control/nfc-bridge ~/nfc-bridge
   rm -rf /tmp/mks-control
   cd ~/nfc-bridge
   npm install
   ```

4. Konfiguration `~/nfc-bridge/.env` (Server-Adresse und Schlüssel anpassen):

   ```bash
   GATEWAY_URL=http://192.168.1.10:3000
   POST_PATH=/api/auth/tag
   DEVICE_ID=pi-laser
   SOURCE=acr122u
   DEBOUNCE_MS=800
   TERMINAL_TOKEN=mkt_…
   ```

   Mit `TERMINAL_TOKEN` wirkt ein Scan **nur an diesem Terminal**. Ohne Schlüssel würde der Pi
   wie der Leser am Eingang arbeiten.

5. Als Dienst einrichten, damit die Bridge beim Start läuft und nach Fehlern neu startet:

   ```bash
   sudo tee /etc/systemd/system/nfc-bridge.service > /dev/null <<EOF
   [Unit]
   Description=MKS Control NFC bridge
   After=network-online.target pcscd.service
   Wants=network-online.target

   [Service]
   User=$USER
   WorkingDirectory=/home/$USER/nfc-bridge
   Environment=MONOREPO_DEV=true
   ExecStart=/usr/bin/npx tsx src/index.ts
   Restart=always
   RestartSec=5

   [Install]
   WantedBy=multi-user.target
   EOF
   sudo systemctl daemon-reload
   sudo systemctl enable --now nfc-bridge
   journalctl -u nfc-bridge -f   # Tag auflegen: "tag posted uid=…"
   ```

   `MONOREPO_DEV=true` ist hier gewollt: Die Bridge verweigert sonst den Start.

## 4. Kiosk-Browser auf `/terminal`

1. Bildschirmschoner und Abschalten des Displays aus:
   `sudo raspi-config` → _Display Options_ → _Screen Blanking_ → **No**.
2. Chromium beim Anmelden im Kiosk-Modus starten. Bei Raspberry Pi OS Bookworm mit Wayland
   (labwc):

   ```bash
   mkdir -p ~/.config/labwc
   echo 'chromium-browser --kiosk --noerrdialogs --disable-session-crashed-bubble --check-for-update-interval=31536000 http://192.168.1.10/terminal &' >> ~/.config/labwc/autostart
   ```

   Heißt der Befehl auf deinem System `chromium` statt `chromium-browser`, den Namen
   entsprechend anpassen (`which chromium chromium-browser`).

   Bei älteren Installationen mit X11 stattdessen eine Datei
   `~/.config/autostart/kiosk.desktop` mit `Exec=chromium-browser --kiosk … http://…/terminal`.

   **Kein** `--incognito`: Der Terminal-Schlüssel wird im Browser gespeichert und wäre nach jedem
   Neustart weg.

3. Automatische Anmeldung am Desktop einschalten: `sudo raspi-config` → _System Options_ →
   _Boot / Auto Login_ → **Desktop Autologin**.
4. Neu starten. Der Pi zeigt „Terminal einrichten": den **gleichen Schlüssel** wie in der
   `.env` einfügen und „Verbinden" tippen. Danach zeigt er nur noch die Terminal-Seite.

## 5. Prüfen

- [ ] Pi zeigt den Namen der Maschine und „Tag scannen zum Anmelden".
- [ ] Admin-Bereich → Terminals: Das Terminal steht auf **Pi online**.
- [ ] Tag eines berechtigten Mitglieds scannen: Name und „Berechtigt" erscheinen.
- [ ] „Maschine freigeben": Die Maschine (zuerst mit einer **Lampe** statt der Maschine testen!)
      geht an. In der Terminal-Übersicht steht „Maschine läuft".
- [ ] Erneut scannen oder „Abmelden": Die Maschine geht aus (oder läuft bis Jobende, je nach
      Abschaltmodus).
- [ ] Netzwerkkabel des Pi ziehen: Nach spätestens Offline-Zeit plus Sicherheits-Timer (Standard
      1 + 3 Minuten) geht die Maschine von selbst aus.
- [ ] Sicherheits-Eingang (falls eingerichtet) öffnen: Die Maschine geht sofort aus.
- [ ] Scan am Eingangs-Leser meldet den Pi **nicht** an.

## 6. Server (einmalig)

In `/opt/mks/.env` auf dem Server:

```bash
# Passwort, das auf allen Shellys gesetzt ist
SHELLY_PASSWORD=…
# Adresse, unter der die Shellys den Server erreichen (für Push der Sicherheits-Eingänge)
SHELLY_CALLBACK_URL=http://192.168.1.10:3000
# Gemeinsamer Schlüssel für die automatische Erkennung (beliebige lange Zufallsfolge)
SHELLY_DISCOVERY_TOKEN=…
```

Die automatische Erkennung läuft als eigener Container `shelly-discovery` im Host-Netz (siehe
`docker-compose.prod.yml`), weil mDNS nicht ins Docker-Netz des Backends gelangt.

## Wenn etwas nicht geht

| Problem                                    | Prüfen                                                                                                                |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Pi zeigt „Keine Verbindung"                | Server-Adresse im Kiosk-URL, Netzwerk des Pi                                                                          |
| Pi springt zurück zu „Terminal einrichten" | Schlüssel wurde erneuert oder Terminal gelöscht: neuen Schlüssel in `.env` **und** im Browser eintragen               |
| Scan tut nichts                            | `journalctl -u nfc-bridge -f`: Kommt `tag posted`? Bei `gateway responded 401` ist der Schlüssel in der `.env` falsch |
| Leser wird nicht erkannt                   | `pcsc_scan`, Kernel-Module sperren (Schritt 3.1), anderes USB-Kabel                                                   |
| „Shelly nicht erreichbar"                  | Shelly-IP, `SHELLY_PASSWORD`, Shelly-Seite im Admin-Bereich                                                           |
| Maschine geht nach wenigen Minuten aus     | Pi meldet sich nicht (Browser abgestürzt, Bildschirm aus): Terminal-Übersicht → „Pi offline"?                         |
