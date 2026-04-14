# Node-RED assets

- `flows.json`: ingestion, processing, simulation, and persistence flow.
- `package.json`: extra Node-RED nodes required by this flow (`node-red-node-mysql`).
- `Dockerfile`: custom Node-RED image that installs dependencies from `package.json`.
- `seed-data.js` + `auto-import-entrypoint.sh`: first-boot seeding of `flows.json` and `flows_cred.json` into `/data`.

When running with Podman Compose (`podman-compose`), this project follows the official Node-RED Docker approach:

- Node-RED runtime data lives in a named volume mounted at `/data`.
- Extra nodes are installed at image build time from `package.json`.
- On first boot, the container auto-imports flow + credentials into `/data` from project templates and env vars.
- Reseed control is available through `NR_AUTO_IMPORT` and `NR_FORCE_IMPORT` env vars.

MQTT connection values are provided by `infrastructure/.env` and target Maqiatto.
