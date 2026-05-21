# Node-RED assets

- `flows.json`: ingestion, processing, simulation, persistence, and REST API flow.
- `package.json`: extra Node-RED nodes required by this flow (`node-red-node-mysql`).
- `Dockerfile`: custom Node-RED image that installs dependencies from `package.json`.
- `seed-data.js` + `auto-import-entrypoint.sh`: first-boot seeding of `flows.json` and `flows_cred.json` into `/data`.

When running with Podman Compose (`podman-compose`), this project follows the official Node-RED Docker approach:

- Node-RED runtime data lives in a named volume mounted at `/data`.
- Extra nodes are installed at image build time from `package.json`.
- On first boot, the container auto-imports flow + credentials into `/data` from project templates and env vars.
- Reseed control is available through `NR_AUTO_IMPORT` and `NR_FORCE_IMPORT` env vars.

MQTT, MariaDB, CORS, and node identifier values are provided by the root `.env` file and target Maqiatto/MariaDB.

The REST API is served directly by Node-RED on `http://localhost:1880/api/*`.
