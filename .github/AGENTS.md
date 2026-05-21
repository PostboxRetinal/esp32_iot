# Repository Notes

## Shape
- Three runtimes live here: ESP32 Arduino firmware in `src/main.cpp` using PlatformIO env `esp32-s3-n16r8-uart`, Node-RED in `nodered/` for processing and REST, and React dashboard in `apps/dashboard`. MariaDB schema lives in `database/schema.sql`.
- Active firmware config is `include/app_config.h`; `src/main.cpp` includes that file, not `include/config.h`.
- Node-RED uses `nodered/flows.json` as a template. `nodered/seed-data.js` replaces `${...}` tokens and reads `CO_*` threshold defines from `include/app_config.h` during container seeding.
- MQTT topics must stay under `MQTT_TOPIC_BASE`, which must include the Maqiatto username prefix. Node-RED distinguishes hardware vs simulator by `device_id` only.

## Commands
- Firmware build: `pio run -e esp32-s3-n16r8-uart`
- Firmware upload: `pio run -e esp32-s3-n16r8-uart -t upload`
- Serial monitor uses `monitor_speed = 115200`: `pio device monitor -b 115200`
- Seed script syntax check: `node --check nodered/seed-data.js`
- Entrypoint shell syntax check: `sh -n nodered/auto-import-entrypoint.sh`
- Flow JSON syntax check: `node -e 'JSON.parse(require("fs").readFileSync("nodered/flows.json", "utf8"))'`
- Dashboard build: `cd apps/dashboard && bun install && bun run build`
- No root-level test, linter, formatter, CI, or pre-commit config was found; use targeted checks instead of inventing root `npm test` or lint commands.

## Deployment Gotchas
- Current files are root `.env.example` and `podman-compose.yml`, while several docs still mention `infrastructure/.env` and `infrastructure/docker-compose.yml`. Trust checked-in config over those stale prose paths.
- If working on compose deployment, keep compose location and bind mounts in sync. The root `podman-compose.yml` uses repo-root-relative mounts like `./database/schema.sql` and `./include/app_config.h`.
- Node-RED seeds `/data/flows.json` and `/data/flows_cred.json` only on first boot of the `nodered_data` volume. Use `NR_FORCE_IMPORT=true` or recreate the volume to reseed flow changes.
- MariaDB runs `database/schema.sql` only when `mariadb_data` is first initialized. Existing volumes need a manual migration or recreation for schema changes.
- `nodered/Dockerfile` installs extra Node-RED nodes from `nodered/package.json`; dependency changes require rebuilding the image.

## Secrets
- `.env` is ignored and should not be read, printed, or committed. Treat local headers such as `include/app_config.h` and ignored `include/config.h` as potentially sensitive when reporting findings.
