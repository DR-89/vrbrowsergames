# WebXR und TC2-Online auf dem eigenen Server

Das Paket enthält die Webseite (`site/`), einen Node-Webserver mit WebSocket-Transport (`server/`) und den vollständigen, fest versionierten Rust-Lobbyserver (`server/nmn-source/`). Alle Spielberechnungen und VR-Bilder entstehen beim Spieler. Der Server verwaltet Räume und leitet originale Kabinett- und Sprachpakete weiter. Ein öffentlicher Fremd-Lobbyserver wird nicht benutzt.

## Linux mit Docker Compose

1. Das komplette ZIP entpacken. `site/`, `server/` und `deploy/` bleiben nebeneinander.
2. `deploy/.env.example` nach `deploy/.env` kopieren. `PUBLIC_ORIGIN=https://deine-domain.de` exakt auf die spätere HTTPS-Origin setzen, ohne Pfad oder abschließenden Schrägstrich.
3. Im entpackten Hauptverzeichnis starten:

   ```sh
   docker compose -f deploy/compose.yaml --env-file deploy/.env up -d --build
   ```

4. Caddy oder einen vorhandenen HTTPS-Nginx auf `127.0.0.1:8094` weiterleiten. Vorlagen liegen in `deploy/Caddyfile` und `deploy/nginx.conf`. Domain und Zertifikat anpassen. Caddy unterstützt WebSockets automatisch; die Nginx-Vorlage enthält die Upgrade-Header.
5. `https://deine-domain.de/api/online` muss `tc2-nmn2-ws-v1` liefern. Webseite öffnen, TC2 laden und einen Raum hosten. Mit einem zweiten Browser denselben Server öffnen und den Code eingeben.

Nur der HTTPS-Webserver wird öffentlich erreichbar. Port 27750/UDP bleibt im internen Docker-Netz; Browser-Spieler brauchen keine UDP-Freigabe am Router. Beide Container starten automatisch neu. Diagnose: `docker compose -f deploy/compose.yaml logs --tail=100 web lobby`. Die Containerkonfiguration ist mitgeliefert; Docker wurde auf diesem Windows-Rechner nicht ausgeführt.

Die Domain-Wurzel wird unterstützt. Bei einem URL-Unterordner müssen zusätzlich `/online` und `/api/online` an denselben Backendserver weitergeleitet werden. Keinen zusätzlichen `Content-Encoding: gzip`-Header für `.gz`-Assets setzen: Die Anwendung dekomprimiert und prüft diese selbst.

## Ohne Docker

Node.js 22 oder neuer und Rust/Cargo installieren:

```sh
npm ci --prefix server
cargo build --release --locked --manifest-path server/nmn-source/Cargo.toml
server/nmn-source/target/release/nmn-server --bind 127.0.0.1 --port 27750 --name WebXR --max-per-ip 256 --max-session-min 180 --quiet
```

Den Lobbyprozess als Dienst betreiben. Ein zweiter Dienst startet den Webserver:

```sh
SITE_ROOT=/srv/time-crisis-webxr/site PUBLIC_ORIGIN=https://deine-domain.de node server/server.mjs
```

Standard: Webserver auf 127.0.0.1:8094, Lobby auf 127.0.0.1:27750. Einstellbar: `PORT`, `HOST`, `SITE_ROOT`, `PUBLIC_ORIGIN`, `NMN_HOST`, `NMN_PORT`, `MAX_CONNECTIONS`, `MAX_PER_IP`. `PUBLIC_ORIGIN` erlaubt eine genaue Origin oder eine kommaseparierte Liste. Hinter einem Reverse Proxy sieht die Verbindungsgrenze dessen IP; Compose setzt daher beide Grenzen auf 256 logische Sockets. Clientdaten können kein beliebiges UDP-Ziel auswählen.

## Lokales Windows-Quellprojekt

`Start-Server.cmd` startet beide Dienste im Hintergrund, nur auf localhost. Node-Abhängigkeiten und nativer Lobby-Build müssen vorhanden sein (Haupt-README). `Start-PCVR.cmd` startet zusätzlich Chrome mit eigenem Profil und leistungsstarker GPU. Eine alte Python-Instanz auf Port 8094 muss vorher beendet sein; der Starter beendet keine fremden Prozesse.

PC-Adresse: `http://localhost:8094/`. Ein direkt spielender Quest-Browser braucht HTTPS auf einer erreichbaren Adresse. Für Virtual Desktop die Seite im PC-Browser öffnen.

## Zusammen spielen

- **Load game**, dann **Host a room**. Host: Keith/P1.
- Freund öffnet dieselbe Webseite und tritt mit **Join room** bei. Joiner: Robert/P2.
- P1 startet **SOLO/LINKED**. P2 startet einmal für den Arcade-Handshake neu und wartet, bis P1 ungefähr 25 Sekunden gespielt hat. Danach Trigger für LINK PLAY; die automatische erste Münze ist einstellbar.
- **Browse rooms**, **Quick match**, **Leave / cancel** und **Rejoin** sind auch im VR-Menü unter ONLINE verfügbar.
- **Enable microphone** vor dem VR-Einstieg anklicken und Browserfreigabe erlauben. Ohne Freigabe kann man zuhören und spielen. Sprachmodi: offenes Mikrofon, Push-to-talk (V oder Stick-Klick), aus; außerdem Stummschaltung und Partnerlautstärke.
- Die Webseite benutzt immer ihren eigenen Server. LAN-Broadcast und die native IP-/Server-Tastatur entfallen im Browser.

## Steuerung und Tempo

Trigger: Start/Schuss. Grip halten: Deckung verlassen; loslassen: Nachladen. TC2 bietet alternativ echtes Ducken; im Stehen neu zentrieren. Untere Taste der bevorzugten Hand: Credits; obere Taste: Zielhilfe; untere Taste der anderen Hand: neu zentrieren. Linker Stick-Klick öffnet das Menü. Die obere Taste der anderen Hand öffnet in TC2 ebenfalls das Menü, auch bei Push-to-talk. Bei Push-to-talk dienen Stick-Klicks dem Sprechen. TC2-Menü: Einträge mit dem Waffenstrahl und Trigger oder mit Stick, A/B und Grips auswählen. TC1/Crisis Zone behalten ihre einfache Pause-Einstellung mit dem rechten Stick. Maus: zielen, links feuern, rechts/Leertaste Deckung verlassen, 5 Credits, Enter Start, Escape Menü.

Im TC2-Menü bleibt die Online-Partie aktiv, Eingaben werden neutralisiert. Browser und schlafende Headsets können trotzdem pausieren; dann greift die Wiederverbindung. Eine unterbrechungsfreie Hintergrundsimulation kann die Webseite nicht erzwingen.

**VR refresh target: 120 Hz** setzt ein Ziel. Adaptive Auflösung reagiert auf GPU-Zeit; die originale Spiellogik bleibt bei etwa 59,9 Hz. In Virtual Desktop auch die Streaming-Bildrate wählen. 120 tatsächlich gerenderte Bilder pro Sekunde auf einer verbundenen Quest sind noch nicht bestätigt. Zwei echte Headsets und Internet-Spiel müssen noch getestet werden; siehe `VALIDATION.md`.

## Updates und Speicher

Bei Bedarf **Export save backup** nutzen. Bei gleicher HTTPS-Origin bleiben Einstellungen und Arcade-NVRAM im Browser. Vollständiges Paket austauschen, Container neu bauen und Seite neu laden. Ein Serverneustart beendet laufende Räume. Projektlizenzen und Drittanbieterhinweise liegen bei; originale Spielassets behalten ihre jeweiligen Rechte. Dieses Paket wurde nur lokal vorbereitet; die Veröffentlichung übernimmt der Betreiber.
