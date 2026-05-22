# Repository Notes

## Shape
- Three runtimes live here: ESP32 Arduino firmware in `src/main.cpp` using PlatformIO env `esp32-s3-n16r8-uart`, Node-RED in `nodered/` for processing and REST, and React dashboard in `apps/dashboard`. MariaDB schema lives in `database/schema.sql`.
- Active firmware config is `include/app_config.h`; `src/main.cpp` includes that file, not `include/config.h`.
- `include/app_shared_config.generated.h` is auto-generated from `.env` by `scripts/generate_firmware_shared_config.py` at build time via PlatformIO `extra_scripts`. It contains MQTT credentials, `DEVICE_ID`, and all `CO_*`/`MQ7_ADC_*` threshold macros. It is `.gitignore`d.
- Node-RED uses `nodered/flows.json` as a template. `nodered/seed-data.js` replaces `${...}` tokens from `process.env` (inherited from `.env` via `env_file` in compose). No firmware header is read or mounted inside the Node-RED container.
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
- If working on compose deployment, keep compose location and bind mounts in sync. The root `podman-compose.yml` uses repo-root-relative mounts like `./database/schema.sql`.
- Node-RED seeds `/data/flows.json` and `/data/flows_cred.json` cifrado solo en el primer arranque del volumen `nodered_data`. Las credenciales se cifran con `aes-256-ctr` usando `NODE_RED_CREDENTIAL_SECRET` de `.env`. Usa `NR_FORCE_IMPORT=true` o recrea el volumen para resembrar cambios en el flujo.
- All `/api/*` routes require `Authorization: Bearer <token>` via `httpNodeMiddleware` in `nodered/settings.js`. The token comes from `API_BEARER_TOKEN` in `.env`. OPTIONS requests are handled by the middleware (204 + CORS headers).
- MariaDB runs `database/schema.sql` only when `mariadb_data` is first initialized. Existing volumes need a manual migration or recreation for schema changes.
- `nodered/Dockerfile` installs extra Node-RED nodes from `nodered/package.json`; dependency changes require rebuilding the image.
- If `nodered/settings.js` is updated, existing `nodered_data` volumes keep the old copy. Delete `/data/settings.js` inside the container or recreate the volume to pick up changes.

## Secrets
- `.env` is ignored and should not be read, printed, or committed. Treat local headers such as `include/app_config.h` and ignored `include/config.h` as potentially sensitive when reporting findings.
