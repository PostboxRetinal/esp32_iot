FROM docker.io/nodered/node-red:4.1.8-22

USER root

WORKDIR /data
COPY package.json /data/package.json
RUN npm install --omit=dev --no-update-notifier --no-fund --only=production
RUN chown -R node-red:root /data

COPY --chown=node-red:root flow_parcial3.json /opt/fiot-seed/flows.template.json
COPY --chown=node-red:root seed-data.js /opt/fiot-seed/seed-data.js
COPY --chown=node-red:root settings.js /opt/fiot-seed/settings.js
COPY --chown=node-red:root auto-import-entrypoint.sh /usr/local/bin/auto-import-entrypoint.sh
RUN chmod +x /usr/local/bin/auto-import-entrypoint.sh

WORKDIR /usr/src/node-red

USER node-red

ENTRYPOINT ["/usr/local/bin/auto-import-entrypoint.sh"]
