# NFC Bridge

A lightweight NFC reader bridge that posts tag UID events to the Auth Gateway.

## Configuration

Create a .env file (copy from .env.example):

GATEWAY_URL=http://localhost:3000
POST_PATH=/api/auth/tag
READER_POST_PATH=/api/auth/reader
DEVICE_ID=kiosk-01
SOURCE=acr122u
DEBOUNCE_MS=800

## Run (Windows)

1. Ensure the Windows Smart Card service is running.
2. Install dependencies:

npm install

3. Start the bridge:

npm run dev

## Run (Raspberry Pi)

1. Install pcscd and tools:

sudo apt-get update
sudo apt-get install -y pcscd pcsc-tools
sudo systemctl enable pcscd
sudo systemctl start pcscd

2. Verify the reader:

pcsc_scan

3. Install dependencies and run:

npm install
npm run dev

## Troubleshooting

- If you see "Exclusive access" errors, close any other app using the reader.
- If no readers appear, confirm pcscd is running and the USB device is detected.
- On Linux, ensure the user has permissions to access the USB device.
- If the gateway is down, the bridge will log errors but keep running.
