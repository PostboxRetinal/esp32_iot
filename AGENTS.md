# AGENTS.md

## Commands
- Full stack: `docker compose up --build -d`; verify with `bash scripts/verify-mysql.sh`. Web/API runs at `http://localhost:3001`, Node-RED at `http://localhost:1880`.
- API only: `npm --prefix api install` then `npm --prefix api start`; `api/server.js` loads env from root `.env`.
- JS syntax check: `for f in api/server.js api/lib/*.js api/routes/*.js api/public/app.js; do node --check "$f"; done`. There are no npm test/lint scripts.
- Firmware: `pio run -e wemos_d1_uno32`; upload with `pio run -e wemos_d1_uno32 -t upload`; monitor with `pio device monitor -e wemos_d1_uno32`.
- Simulator: `docker compose -f docker-compose.simulator.yml up -d --build`; logs with `docker compose -f docker-compose.simulator.yml logs -f mqtt-simulator`.

## Architecture
- ESP32 (`src/main.cpp`) or simulator publishes JSON to `TOPICO_DATOS`; Node-RED (`flows.json`) ingests, normalizes, computes risk, and writes MySQL.
- Express (`api/server.js`) reads MySQL, publishes commands to `TOPICO_COMANDOS`, and serves the static web UI from `api/public`.
- Node-RED tabs: `HTL-IOT-PROCESAMIENTO` for ingestion/risk/monthly analysis and `HTL-IOT-LIMPIEZA` for batch quality cleanup.
- MySQL schema/views/procedure live in `docker/mysql/init-db.sql`; changing it does not migrate an existing `mysql_data` volume.

## Gotchas
- `.env` and `include/config.h` are local/gitignored; use env vars and `include/config_template.h`, and do not expose credentials.
- Firmware depends on interval macros from local `include/config.h`; keep the template in sync if changing config constants.
- Docker Node-RED copies seed `flows.json` and `settings.js` into `/data` when `SYNC_FLOWS_FROM_SEED=true` (default), and generates `/data/flows_cred.json` from env.
- Root `flows_cred.json` is not mounted by `docker-compose.yml`; Docker credentials come from `MQTT_*`, `MYSQL_*`, and `NODE_RED_CREDENTIAL_SECRET`.
- Time handling is fixed to GMT-5; use `Etc/GMT+5` for `TZ` (IANA sign is reversed) and emit device timestamps with `-05:00`, not `Z`.
- `POST /api/analysis/clean` and `POST /api/analysis/monthly` only ask Node-RED to run async flows; verify results afterward.
- Do not use `sp_limpiar_datos_iot` for normal cleanup; it deletes all project data.

## Domain Conventions
- Valid contexts: `LIBRE`, `RESERVADA`, `FUMIGACION`. Valid risks: `NORMAL`, `ALERTA`, `EMERGENCIA`, `INVALIDO`.
- Device commands use JSON on `TOPICO_COMANDOS` with uppercase `estado`, optional `sample_interval_ms`/`intervalo_ms`, and optional target `id_habitacion`.
- MQTT payload uses `temperatura_C`; MySQL/API use `temperatura_c`. Preserve this mapping.
- `mediciones_limpias` must not contain zero values in measured columns; zeros are treated as outliers/imputed.
- API code is CommonJS on Node 18; web code is plain static HTML/CSS/JS with no bundler.
- Keep UI/docs/domain strings in Spanish unless asked otherwise.
