CREATE DATABASE IF NOT EXISTS ciudad_inteligente;
USE ciudad_inteligente;

DROP TABLE IF EXISTS sensores;
DROP TABLE IF EXISTS eventos_actuadores;
DROP TABLE IF EXISTS estados_medicion;
DROP TABLE IF EXISTS mediciones_brutas;

CREATE TABLE IF NOT EXISTS mediciones_brutas (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  device_id VARCHAR(100) NOT NULL,
  habitacion VARCHAR(120) NOT NULL,
  contexto_hotel VARCHAR(32) NOT NULL,
  temperatura_c DECIMAL(6,2) NULL,
  humedad_pct DECIMAL(6,2) NULL,
  fosfina_mq135 DECIMAL(10,2) NOT NULL,
  co_mq7 DECIMAL(10,2) NOT NULL,
  ph3_ppm DECIMAL(10,2) NULL,
  co_ppm DECIMAL(10,2) NULL,
  presencia_pir TINYINT(1) NOT NULL DEFAULT 0,
  evento_pir VARCHAR(64) NULL,
  sistema_activo TINYINT(1) NULL,
  intervalo_envio_ms INT NULL,
  dht_ok TINYINT(1) NULL,
  error VARCHAR(255) NULL,
  timestamp_origen DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_med_device_id (device_id),
  INDEX idx_med_habitacion (habitacion),
  INDEX idx_med_contexto (contexto_hotel),
  INDEX idx_med_timestamp_origen (timestamp_origen),
  INDEX idx_med_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS estados_medicion (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  medicion_id BIGINT UNSIGNED NOT NULL,
  estado_riesgo VARCHAR(20) NOT NULL,
  razon_riesgo VARCHAR(120) NULL,
  nivel_alerta VARCHAR(255) NULL,
  color_alerta VARCHAR(20) NULL,
  backend_ts BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_estado_por_medicion (medicion_id),
  INDEX idx_estado_riesgo (estado_riesgo),
  INDEX idx_estado_created_at (created_at),
  CONSTRAINT fk_estados_medicion
    FOREIGN KEY (medicion_id) REFERENCES mediciones_brutas(id)
    ON DELETE CASCADE,
  CONSTRAINT chk_estado_riesgo
    CHECK (estado_riesgo IN ('NORMAL', 'ALERTA', 'EMERGENCIA', 'INVALIDO'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS eventos_actuadores (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  medicion_id BIGINT UNSIGNED NULL,
  device_id VARCHAR(100) NOT NULL,
  habitacion VARCHAR(120) NOT NULL,
  estado_riesgo VARCHAR(20) NOT NULL,
  contexto_hotel VARCHAR(32) NOT NULL,
  motivo_activacion VARCHAR(255) NOT NULL,
  comando VARCHAR(32) NOT NULL,
  intervalo_objetivo_ms INT NULL,
  timestamp_origen DATETIME NULL,
  backend_ts BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_evt_device_id (device_id),
  INDEX idx_evt_habitacion (habitacion),
  INDEX idx_evt_estado (estado_riesgo),
  INDEX idx_evt_created_at (created_at),
  CONSTRAINT fk_eventos_medicion
    FOREIGN KEY (medicion_id) REFERENCES mediciones_brutas(id)
    ON DELETE SET NULL,
  CONSTRAINT chk_eventos_estado
    CHECK (estado_riesgo IN ('NORMAL', 'ALERTA', 'EMERGENCIA', 'INVALIDO')),
  CONSTRAINT chk_eventos_contexto
    CHECK (contexto_hotel IN ('LIBRE', 'RESERVADA', 'FUMIGACION'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP VIEW IF EXISTS vw_mediciones_estado;
CREATE VIEW vw_mediciones_estado AS
SELECT
  m.id,
  m.device_id,
  m.habitacion,
  m.contexto_hotel,
  m.temperatura_c,
  m.humedad_pct,
  m.fosfina_mq135,
  m.co_mq7,
  m.ph3_ppm,
  m.co_ppm,
  e.estado_riesgo,
  e.razon_riesgo,
  e.nivel_alerta,
  e.color_alerta,
  m.timestamp_origen,
  m.created_at
FROM mediciones_brutas m
INNER JOIN estados_medicion e ON e.medicion_id = m.id;

DROP PROCEDURE IF EXISTS sp_limpiar_datos_iot;
DELIMITER $$
CREATE PROCEDURE sp_limpiar_datos_iot()
BEGIN
  DELETE FROM eventos_actuadores;
  DELETE FROM estados_medicion;
  DELETE FROM mediciones_brutas;
END$$
DELIMITER ;

DROP USER IF EXISTS 'nodered_user'@'%';
CREATE USER 'nodered_user'@'%' IDENTIFIED WITH caching_sha2_password BY 'nodered_password_change_me';
GRANT ALL PRIVILEGES ON ciudad_inteligente.* TO 'nodered_user'@'%';
ALTER USER 'nodered_user'@'%' REQUIRE NONE;
FLUSH PRIVILEGES;
