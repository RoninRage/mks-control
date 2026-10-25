# Bedienung: Maschinen freigeben

Kurzanleitung für Admins, Vorstand und Bereichsleitungen. Die technische Einrichtung steht in
[`inbetriebnahme.md`](inbetriebnahme.md) und [`pi-setup.md`](pi-setup.md).

## So funktioniert es für Mitglieder

1. Tag an den Leser am Pi der Maschine halten.
2. Der Pi zeigt den Namen und ob das Mitglied die Maschine benutzen darf.
3. **„Maschine freigeben"** tippen. Die Maschine bekommt Strom.
4. Fertig: **„Abmelden"** tippen oder den Tag erneut auflegen. Je nach Einstellung geht die
   Maschine sofort aus oder erst, wenn der laufende Job fertig ist.

Nach der eingestellten Höchstdauer fragt der Pi **„Noch da?"**. Ohne Antwort geht die Maschine
aus. Ohne Bedienung und ohne Freigabe meldet sich der Pi nach 5 Minuten von selbst ab.

Wer eine Maschine benutzen darf, richtet sich nach den bestehenden **Ausstattungsberechtigungen**
(Dashboard → „Ausstattungsberechtigungen"). Admins dürfen jede Maschine freigeben.

## Anmelden im Admin-Bereich

- **Am Eingang:** Tag an den Leser neben dem Bildschirm halten. Erneut scannen oder „Abmelden"
  meldet ab; nach 5 Minuten ohne Bedienung meldet der Bildschirm von selbst ab.
- **Mit dem Handy** (Android, Chrome): Startseite öffnen, „Per Handy anmelden" und den Tag an das
  Handy halten. Die Anmeldung gilt höchstens 8 Stunden.
- Wer was darf, richtet sich nach der Rolle (Admin, Vorstand, Bereichsleitung, Mitglied).
  Niemand kann ein Mitglied mit höherer Rolle bearbeiten oder ihm einen Tag geben, und nur
  Admins vergeben die Rolle Admin.

## Eine Maschine einrichten (Admin)

Die Einrichtung erfolgt in drei Schritten: Shelly anlegen, Maschine mit dem Shelly verbinden,
Terminal anlegen.

### 1. Shelly anlegen

Dashboard → **„Shelly-Geräte"** → „Shelly hinzufügen". Den Shelly unter **„Im Netz gefunden"**
antippen oder die IP eintippen. MKS Control erkennt Modell und Funktionen. Einen Namen vergeben,
der zur Maschine passt (z. B. „Shelly Lasercutter").

Auf der Karte des Shellys:

- **Identifizieren:** schaltet den Ausgang kurz, um den richtigen Shelly zu finden. Vorsicht bei
  angeschlossener Maschine.
- **Wartung:** sperrt den Shelly für Freigaben, z. B. für Arbeiten an der Maschine oder ein
  Firmware-Update. Geht nicht, solange die Maschine freigegeben ist.
- **Firmware prüfen / Firmware installieren:** installieren nur im Wartungsmodus. Der Shelly
  startet danach neu. Anschließend „Wartung beenden".
- **Ausmustern:** entfernt den Shelly. Geht nicht, solange er einer Maschine zugeordnet ist.

### 2. Maschine mit dem Shelly verbinden

Dashboard → „Ausstattung verwalten" → Maschine bearbeiten → Abschnitt **„Steuerung"**:

| Feld                        | Bedeutung                                                                                                                                                                                    |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shelly-Gerät, Ausgang       | Welcher Ausgang die Maschine schaltet.                                                                                                                                                       |
| Sicherheits-Timer (Minuten) | Der Shelly schaltet von selbst ab, wenn er so lange nichts vom Server hört (Server oder Netz weg). Standard 3. Kurz halten.                                                                  |
| Leistungsmessung            | Wo die Leistung gemessen wird. Nötig für kWh und „Erst im Leerlauf ausschalten".                                                                                                             |
| Beim Abmelden               | **Sofort ausschalten** oder **Erst im Leerlauf ausschalten**: läuft weiter, bis die Leistung „unter X W" für „Y Sekunden" bleibt, „spätestens nach Z Minuten". Gut für Laser und 3D-Drucker. |
| Sicherheits-Eingänge        | Z. B. „Absaugung läuft". Freigabe nur, wenn alle sicher sind; geht ein Eingang auf „nicht sicher", schaltet die Maschine sofort ab.                                                          |
| Zusatzfunktionen am Pi      | Weitere Ausgänge (Licht, Absaugung, Rollladen), die Mitglieder während der Freigabe am Pi bedienen. „Mit Maschine ausschalten" schaltet sie beim Ende mit ab.                                |

„Steuerung speichern". „Zuordnung entfernen" trennt die Maschine vom Shelly.

### 3. Terminal anlegen

Dashboard → **„Terminals"** → „Terminal anlegen": Name, Maschine, **Höchstdauer je Freigabe**
(danach „Noch da?") und **Antwortzeit für „Noch da?"**. Den Schlüssel kopieren und am Pi
eintragen ([`pi-setup.md`](pi-setup.md)). Er wird nur einmal angezeigt; „Neuer Schlüssel" macht
den alten ungültig.

Die Terminal-Übersicht zeigt live je Pi: online/offline, wer angemeldet ist und ob die Maschine
läuft. **„Maschine abschalten"** schaltet eine laufende Maschine aus der Ferne ab.

## Nutzungen

Dashboard → **„Nutzungen"**: jede Freigabe mit Mitglied, Maschine, Beginn, Dauer, Grund des
Endes und (mit Messung) Energie in kWh. Filter nach Maschine, Mitglied und Zeitraum.

Wer was sieht:

- **Admin, Vorstand:** alle Nutzungen
- **Bereichsleitung:** Nutzungen der Maschinen in den eigenen Bereichen und die eigenen
- **Mitglied:** nur die eigenen

Nutzungen werden nach 365 Tagen automatisch gelöscht (einstellbar). Alle Änderungen an Shellys,
Terminals und Steuerung stehen im **Audit Log**.

## Wenn eine Maschine nicht freigegeben werden kann

Der Pi zeigt den Grund an:

| Meldung am Pi                                     | Was tun                                                                |
| ------------------------------------------------- | ---------------------------------------------------------------------- |
| Diese Maschine ist noch keinem Shelly zugeordnet. | Abschnitt „Steuerung" der Maschine ausfüllen.                          |
| Der Shelly dieser Maschine ist nicht erreichbar.  | Strom und Netz des Shellys, „Shelly-Geräte" → Status, IP noch richtig? |
| Sicherheits-Eingang nicht in Ordnung: …           | Den genannten Eingang prüfen (z. B. Absaugung an?).                    |
| Die Maschine ist gerade in Wartung.               | „Shelly-Geräte" → „Wartung beenden", wenn die Arbeiten fertig sind.    |
| Roter Hinweis statt „Berechtigt"                  | Ausstattungsberechtigung für das Mitglied fehlt.                       |
