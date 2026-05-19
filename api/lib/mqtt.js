const mqtt = require('mqtt');

const MQTT_CONFIG = {
  host: process.env.MQTT_SERVER || 'localhost',
  port: Number(process.env.MQTT_PORT || 1883),
  username: process.env.MQTT_USER || undefined,
  password: process.env.MQTT_PASS || undefined
};

const client = mqtt.connect(MQTT_CONFIG);

client.on('connect', () => {
  console.log('[mqtt] connected');
});

client.on('reconnect', () => {
  console.log('[mqtt] reconnecting');
});

client.on('error', (err) => {
  console.error('[mqtt] error', err.message);
});

function publishCommand(topic, payload, callback) {
  if (!client.connected) {
    const err = new Error('mqtt_not_connected');
    err.code = 'MQTT_NOT_CONNECTED';
    callback(err);
    return;
  }

  client.publish(topic, JSON.stringify(payload), { qos: 1 }, callback);
}

module.exports = { client, publishCommand };
