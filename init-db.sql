CREATE DATABASE IF NOT EXISTS ciudad_inteligente;
USE ciudad_inteligente;

CREATE TABLE IF NOT EXISTS sensores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  habitacion VARCHAR(64) NOT NULL,
  `timestamp` DATETIME NOT NULL,
  recibido_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  contexto_hotel VARCHAR(32) NOT NULL,
  sistema_activo BOOLEAN NULL,
  intervalo_envio_ms INT NULL,
  fosfina_mq135 FLOAT NULL,
  co_mq7 FLOAT NULL,
  presencia_pir INT NULL,
  evento_pir VARCHAR(64) NULL,
  temperatura_C FLOAT NULL,
  humedad_pct FLOAT NULL,
  dht_ok BOOLEAN NULL,
  error VARCHAR(255) NULL,
  estado_riesgo VARCHAR(16) NULL,
  razon_riesgo VARCHAR(64) NULL,
  nivel_alerta VARCHAR(255) NULL,
  color_alerta VARCHAR(16) NULL,
  ph3_ppm FLOAT NULL,
  co_ppm FLOAT NULL,
  backend_ts BIGINT NULL,
  INDEX idx_timestamp (`timestamp`),
  INDEX idx_habitacion (habitacion),
  INDEX idx_estado_riesgo (estado_riesgo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Usuario para Node-RED (coincide con flows.json)
DROP USER IF EXISTS 'nodered_user'@'%';
CREATE USER 'nodered_user'@'%' IDENTIFIED WITH caching_sha2_password BY 'nodered_password_change_me';
GRANT ALL PRIVILEGES ON ciudad_inteligente.* TO 'nodered_user'@'%';
ALTER USER 'nodered_user'@'%' REQUIRE NONE;
FLUSH PRIVILEGES;
