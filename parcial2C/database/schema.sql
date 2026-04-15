  -- Parcial2 - IoT Garage CO (MySQL / MariaDB)
  -- Tables for devices, sensor readings, derived states, and alerts.

  CREATE TABLE IF NOT EXISTS devices (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(64) NOT NULL UNIQUE,
    node_type ENUM('hardware', 'simulated') NOT NULL,
    description VARCHAR(128) DEFAULT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    last_seen_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB;

  CREATE TABLE IF NOT EXISTS sensor_readings (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(64) NOT NULL,
    device_timestamp VARCHAR(40) NOT NULL,
    co_ppm DECIMAL(6,2) NOT NULL,
    presencia TINYINT(1) NOT NULL,
    source_topic VARCHAR(160) NOT NULL,
    message_id BIGINT UNSIGNED DEFAULT NULL,
    ingested_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_sensor_device FOREIGN KEY (device_id)
      REFERENCES devices(device_id)
      ON UPDATE CASCADE
      ON DELETE RESTRICT,
    INDEX idx_sensor_device_ingested (device_id, ingested_at),
    INDEX idx_sensor_co (co_ppm)
  ) ENGINE=InnoDB;

  CREATE TABLE IF NOT EXISTS state_events (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(64) NOT NULL,
    device_timestamp VARCHAR(40) NOT NULL,
    estado VARCHAR(24) NOT NULL,
    urgente TINYINT(1) NOT NULL,
    co_ppm DECIMAL(6,2) NOT NULL,
    presencia TINYINT(1) NOT NULL,
    reason VARCHAR(255) DEFAULT NULL,
    ingested_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_state_device FOREIGN KEY (device_id)
      REFERENCES devices(device_id)
      ON UPDATE CASCADE
      ON DELETE RESTRICT,
    INDEX idx_state_device_ingested (device_id, ingested_at),
    INDEX idx_state_estado (estado),
    INDEX idx_state_urgente (urgente)
  ) ENGINE=InnoDB;

  CREATE TABLE IF NOT EXISTS alerts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(64) NOT NULL,
    device_timestamp VARCHAR(40) NOT NULL,
    alert_ts TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    severity ENUM('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL,
    alert_type VARCHAR(40) NOT NULL,
    message VARCHAR(255) NOT NULL,
    co_ppm DECIMAL(6,2) NOT NULL,
    presencia TINYINT(1) NOT NULL,
    urgente TINYINT(1) NOT NULL,
    ack_status ENUM('PENDING', 'ACKED', 'CLOSED') NOT NULL DEFAULT 'PENDING',
    acked_at TIMESTAMP(3) NULL,
    CONSTRAINT fk_alert_device FOREIGN KEY (device_id)
      REFERENCES devices(device_id)
      ON UPDATE CASCADE
      ON DELETE RESTRICT,
    INDEX idx_alert_device_time (device_id, alert_ts),
    INDEX idx_alert_severity (severity),
    INDEX idx_alert_status (ack_status)
  ) ENGINE=InnoDB;

  INSERT INTO devices (device_id, node_type, description)
  VALUES
    ('ESP32-GARAGE-CO-001', 'hardware', 'Wemos D1 R32 ESP32 hardware node'),
    ('SIM-GARAGE-CO-001', 'simulated', 'Node-RED simulated node')
  ON DUPLICATE KEY UPDATE
    node_type = VALUES(node_type),
    description = VALUES(description);
