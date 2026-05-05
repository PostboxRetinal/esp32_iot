CREATE DATABASE IF NOT EXISTS ciudad_inteligente;
USE ciudad_inteligente;

DROP VIEW IF EXISTS vw_incidencias_medicion;
DROP VIEW IF EXISTS vw_mediciones_estado;
DROP PROCEDURE IF EXISTS sp_limpiar_datos_iot;

DROP TABLE IF EXISTS sensores;
DROP TABLE IF EXISTS analisis_mediciones;
DROP TABLE IF EXISTS eventos_actuadores;
DROP TABLE IF EXISTS estados_medicion;
DROP TABLE IF EXISTS incidencias;
DROP TABLE IF EXISTS mediciones_limpias;
DROP TABLE IF EXISTS mediciones_brutas;

CREATE TABLE IF NOT EXISTS mediciones_brutas (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_habitacion VARCHAR(120) NOT NULL,
  contexto_hotel VARCHAR(32) NOT NULL,
  temperatura_c DECIMAL(6,2) NULL,
  humedad_pct DECIMAL(6,2) NULL,
  fosfina_mq135 DECIMAL(10,2) NOT NULL,
  co_mq7 DECIMAL(10,2) NOT NULL,
  presencia_pir TINYINT(1) NOT NULL DEFAULT 0,
  intervalo_envio_ms INT NULL,
  timestamp_origen DATETIME NOT NULL,
  limpio TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_med_id_habitacion (id_habitacion),
  INDEX idx_med_contexto (contexto_hotel),
  INDEX idx_med_timestamp_origen (timestamp_origen),
  INDEX idx_med_created_at (created_at),
  INDEX idx_med_limpio (limpio),
  CONSTRAINT chk_med_contexto
    CHECK (contexto_hotel IN ('LIBRE', 'RESERVADA', 'FUMIGACION'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mediciones_limpias (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  medicion_id BIGINT UNSIGNED NOT NULL,
  temperatura_c DECIMAL(6,2) NULL,
  humedad_pct DECIMAL(6,2) NULL,
  fosfina_mq135 DECIMAL(10,2) NULL,
  co_mq7 DECIMAL(10,2) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_limpia_medicion (medicion_id),
  INDEX idx_limpia_medicion (medicion_id),
  CONSTRAINT fk_limpia_medicion
    FOREIGN KEY (medicion_id) REFERENCES mediciones_brutas(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS incidencias (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  medicion_id BIGINT UNSIGNED NOT NULL,
  id_habitacion VARCHAR(120) NOT NULL,
  tipo_incidencia VARCHAR(20) NOT NULL,
  detalle_incidencia VARCHAR(255) NOT NULL,
  valor_detectado JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_inc_medicion (medicion_id),
  INDEX idx_inc_id_habitacion (id_habitacion),
  INDEX idx_inc_tipo (tipo_incidencia),
  INDEX idx_inc_created_at (created_at),
  CONSTRAINT fk_incidencias_medicion
    FOREIGN KEY (medicion_id) REFERENCES mediciones_brutas(id)
    ON DELETE CASCADE,
  CONSTRAINT chk_incidencias_tipo
    CHECK (tipo_incidencia IN ('OK', 'OBSERVADO', 'ERROR', 'DUPLICADO', 'MULTIPLE', 'INCOMPLETO', 'TEMPORAL', 'FORMATO', 'ATIPICO'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS estados_medicion (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  medicion_id BIGINT UNSIGNED NOT NULL,
  estado_riesgo VARCHAR(20) NOT NULL,
  razon_riesgo VARCHAR(120) NULL,
  color_alerta VARCHAR(20) NULL,
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
  id_habitacion VARCHAR(120) NOT NULL,
  estado_riesgo VARCHAR(20) NOT NULL,
  contexto_hotel VARCHAR(32) NOT NULL,
  motivo_activacion VARCHAR(255) NOT NULL,
  intervalo_objetivo_ms INT NULL,
  timestamp_origen DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_evt_id_habitacion (id_habitacion),
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

CREATE VIEW vw_mediciones_estado AS
SELECT
  m.id,
  m.id_habitacion,
  m.contexto_hotel,
  m.temperatura_c,
  m.humedad_pct,
  m.fosfina_mq135,
  m.co_mq7,
  m.presencia_pir,
  m.intervalo_envio_ms,
  m.limpio,
  e.estado_riesgo,
  e.razon_riesgo,
  e.color_alerta,
  m.timestamp_origen,
  m.created_at
FROM mediciones_brutas m
LEFT JOIN estados_medicion e ON e.medicion_id = m.id;

CREATE VIEW vw_incidencias_medicion AS
SELECT
  i.id,
  i.medicion_id,
  i.id_habitacion,
  i.tipo_incidencia,
  i.detalle_incidencia,
  i.valor_detectado,
  i.created_at AS incidencia_created_at,
  m.timestamp_origen,
  m.created_at AS medicion_created_at
FROM incidencias i
INNER JOIN mediciones_brutas m ON m.id = i.medicion_id;

CREATE TABLE IF NOT EXISTS analisis_mediciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_habitacion VARCHAR(50),
  temp_promedio FLOAT,
  temp_minima FLOAT,
  temp_maxima FLOAT,
  hum_promedio FLOAT,
  hum_minima FLOAT,
  hum_maxima FLOAT,
  temp_fuera_rango INT,
  hum_fuera_rango INT,
  total_registros INT,
  fecha_inicio_analisis DATETIME,
  fecha_fin_analisis DATETIME,
  fecha_generacion DATETIME
);

DELIMITER $$
CREATE PROCEDURE sp_limpiar_datos_iot()
BEGIN
  DELETE FROM analisis_mediciones;
  DELETE FROM eventos_actuadores;
  DELETE FROM estados_medicion;
  DELETE FROM incidencias;
  DELETE FROM mediciones_limpias;
  DELETE FROM mediciones_brutas;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_mediciones_brutas_bi_calidad;
DROP TRIGGER IF EXISTS trg_mediciones_brutas_ai_incidencia;

DROP USER IF EXISTS 'nodered_user'@'%';
CREATE USER 'nodered_user'@'%' IDENTIFIED WITH caching_sha2_password BY 'nodered_password_change_me';
GRANT ALL PRIVILEGES ON ciudad_inteligente.* TO 'nodered_user'@'%';
ALTER USER 'nodered_user'@'%' REQUIRE NONE;
FLUSH PRIVILEGES;
