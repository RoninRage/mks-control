# NFC Bridge

A lightweight NFC reader bridge that posts tag UID events to the backend (`POST /api/auth/tag`).
Every post carries the reader's key; the backend refuses scans without one.

## Configuration

Create a .env file (copy from .env.example):

GATEWAY_URL=http://localhost:3000
POST_PATH=/api/auth/tag
READER_POST_PATH=/api/auth/reader
DEVICE_ID=kiosk-01
SOURCE=acr122u
DEBOUNCE_MS=800
TERMINAL_TOKEN=
ENTRANCE_KEY=mke_dev-entrance-key

Set exactly one key:

- `ENTRANCE_KEY` for the reader at the entrance: the same value as in the backend's `.env`.
  Its scans reach only the entrance kiosk (the browser set up with the same key).
- `TERMINAL_TOKEN` for a machine terminal (one Raspberry Pi per machine). Create the terminal in
  the admin UI under "Terminals" and copy the key shown there. A scan then only logs in at that
  terminal. Setup of a terminal Pi: `docs/pi-setup.md`.

## Run (Windows)

1. Ensure the Windows Smart Card service is running.
2. Install dependencies:

npm install

3. Start the bridge from the monorepo root with `npm run dev` (it refuses to start without
   `MONOREPO_DEV=true`).

## Run (Raspberry Pi)

1. Install pcscd and tools:

sudo apt-get update
sudo apt-get install -y pcscd pcsc-tools
sudo systemctl enable pcscd
sudo systemctl start pcscd

2. Verify the reader:

pcsc_scan

3. For a machine terminal follow `docs/pi-setup.md` (installs the bridge as a systemd service).

## Troubleshooting

- If you see "Exclusive access" errors, close any other app using the reader.
- If no readers appear, confirm pcscd is running and the USB device is detected.
- On Linux, ensure the user has permissions to access the USB device.
- If the gateway is down, the bridge will log errors but keep running.
