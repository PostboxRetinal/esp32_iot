FROM nodered/node-red:4.1.8-22

USER root

# Install extra Node-RED nodes defined by this project.
# Following the official custom-image approach, install project nodes
# using /data as the userDir package location.
WORKDIR /data
COPY package.json /data/package.json
RUN npm install --omit=dev --no-update-notifier --no-fund --only=production
RUN chown -R node-red:root /data

# Seed assets used to auto-import flow + credentials on first boot.
COPY --chown=node-red:root flows.json /opt/fiot-seed/flows.template.json
COPY --chown=node-red:root seed-data.js /opt/fiot-seed/seed-data.js
COPY --chown=node-red:root auto-import-entrypoint.sh /usr/local/bin/auto-import-entrypoint.sh
RUN chmod +x /usr/local/bin/auto-import-entrypoint.sh

WORKDIR /usr/src/node-red

USER node-red

ENTRYPOINT ["/usr/local/bin/auto-import-entrypoint.sh"]
