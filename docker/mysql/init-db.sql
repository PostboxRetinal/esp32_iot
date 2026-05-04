CREATE DATABASE IF NOT EXISTS ciudad_inteligente;
USE ciudad_inteligente;

DROP TABLE IF EXISTS sensores;
DROP TABLE IF EXISTS eventos_actuadores;
DROP TABLE IF EXISTS estados_medicion;
DROP TABLE IF EXISTS incidencias_medicion;
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
  intervalo_envio_ms INT NULL,
  timestamp_origen DATETIME NOT NULL,
  tiene_problema TINYINT(1) NOT NULL DEFAULT 0,
  estado_calidad VARCHAR(20) NOT NULL DEFAULT 'OK',
  motivo_calidad VARCHAR(255) NULL,
  firma_medicion VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_med_device_id (device_id),
  INDEX idx_med_habitacion (habitacion),
  INDEX idx_med_contexto (contexto_hotel),
  INDEX idx_med_timestamp_origen (timestamp_origen),
  INDEX idx_med_created_at (created_at),
  INDEX idx_med_estado_calidad (estado_calidad),
  INDEX idx_med_firma_medicion (firma_medicion),
  CONSTRAINT chk_med_estado_calidad
    CHECK (estado_calidad IN ('OK', 'OBSERVADO', 'ERROR', 'DUPLICADO', 'MULTIPLE', 'INCOMPLETO', 'TEMPORAL', 'FORMATO', 'ATIPICO'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS incidencias_medicion (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  medicion_id BIGINT UNSIGNED NOT NULL,
  device_id VARCHAR(100) NOT NULL,
  habitacion VARCHAR(120) NOT NULL,
  tipo_incidencia VARCHAR(20) NOT NULL,
  detalle_incidencia VARCHAR(255) NOT NULL,
  valor_detectado JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_inc_medicion (medicion_id),
  INDEX idx_inc_device_id (device_id),
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
  nivel_alerta VARCHAR(255) NULL,
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
  device_id VARCHAR(100) NOT NULL,
  habitacion VARCHAR(120) NOT NULL,
  estado_riesgo VARCHAR(20) NOT NULL,
  contexto_hotel VARCHAR(32) NOT NULL,
  motivo_activacion VARCHAR(255) NOT NULL,
  comando VARCHAR(32) NOT NULL,
  intervalo_objetivo_ms INT NULL,
  timestamp_origen DATETIME NULL,
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
  m.tiene_problema,
  m.estado_calidad,
  m.motivo_calidad,
  m.firma_medicion,
  e.estado_riesgo,
  e.razon_riesgo,
  e.nivel_alerta,
  e.color_alerta,
  m.timestamp_origen,
  m.created_at
FROM mediciones_brutas m
LEFT JOIN estados_medicion e ON e.medicion_id = m.id;

DROP VIEW IF EXISTS vw_incidencias_medicion;
CREATE VIEW vw_incidencias_medicion AS
SELECT
  i.id,
  i.medicion_id,
  i.device_id,
  i.habitacion,
  i.tipo_incidencia,
  i.detalle_incidencia,
  i.valor_detectado,
  i.created_at AS incidencia_created_at,
  m.timestamp_origen,
  m.created_at AS medicion_created_at
FROM incidencias_medicion i
INNER JOIN mediciones_brutas m ON m.id = i.medicion_id;

DROP PROCEDURE IF EXISTS sp_limpiar_datos_iot;
DELIMITER $$
CREATE PROCEDURE sp_limpiar_datos_iot()
BEGIN
  DELETE FROM eventos_actuadores;
  DELETE FROM estados_medicion;
  DELETE FROM mediciones_brutas;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_mediciones_brutas_bi_calidad;
DELIMITER $$
CREATE TRIGGER trg_mediciones_brutas_bi_calidad
BEFORE INSERT ON mediciones_brutas
FOR EACH ROW
BEGIN
  DECLARE duplicate_count INT DEFAULT 0;

  SET NEW.device_id = COALESCE(NULLIF(TRIM(NEW.device_id), ''), 'DESCONOCIDO');
  SET NEW.habitacion = COALESCE(NULLIF(TRIM(NEW.habitacion), ''), NEW.device_id);
  SET NEW.contexto_hotel = UPPER(COALESCE(NULLIF(TRIM(NEW.contexto_hotel), ''), 'LIBRE'));
  SET NEW.estado_calidad = UPPER(COALESCE(NULLIF(TRIM(NEW.estado_calidad), ''), 'OK'));
  SET NEW.motivo_calidad = NULLIF(TRIM(COALESCE(NEW.motivo_calidad, '')), '');

  IF NEW.tiene_problema IS NULL THEN
    SET NEW.tiene_problema = 0;
  END IF;

  IF NEW.firma_medicion IS NOT NULL THEN
    SELECT COUNT(*) INTO duplicate_count
    FROM mediciones_brutas m
    WHERE m.firma_medicion = NEW.firma_medicion;

    IF duplicate_count > 0 THEN
      SET NEW.tiene_problema = 1;
      IF NEW.estado_calidad = 'OK' THEN
        SET NEW.estado_calidad = 'DUPLICADO';
      ELSEIF NEW.estado_calidad NOT IN ('DUPLICADO', 'MULTIPLE') THEN
        SET NEW.estado_calidad = 'MULTIPLE';
      END IF;
      SET NEW.motivo_calidad = CONCAT_WS('; ', NEW.motivo_calidad, 'duplicado_detectado');
    END IF;
  END IF;

  IF NEW.estado_calidad NOT IN ('OK', 'OBSERVADO', 'ERROR', 'DUPLICADO', 'MULTIPLE', 'INCOMPLETO', 'TEMPORAL', 'FORMATO', 'ATIPICO') THEN
    SET NEW.estado_calidad = IF(NEW.tiene_problema = 1, 'ERROR', 'OK');
  END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_mediciones_brutas_ai_incidencia;
DELIMITER $$
CREATE TRIGGER trg_mediciones_brutas_ai_incidencia
AFTER INSERT ON mediciones_brutas
FOR EACH ROW
BEGIN
  IF NEW.tiene_problema = 1 THEN
    INSERT INTO incidencias_medicion (
      medicion_id,
      device_id,
      habitacion,
      tipo_incidencia,
      detalle_incidencia,
      valor_detectado
    ) VALUES (
      NEW.id,
      NEW.device_id,
      NEW.habitacion,
      NEW.estado_calidad,
      COALESCE(NULLIF(NEW.motivo_calidad, ''), 'incidencia_detectada'),
      JSON_OBJECT(
        'estado_calidad', NEW.estado_calidad,
        'motivo_calidad', NEW.motivo_calidad,
        'firma_medicion', NEW.firma_medicion
      )
    );
  END IF;
END$$
DELIMITER ;

DROP USER IF EXISTS 'nodered_user'@'%';
CREATE USER 'nodered_user'@'%' IDENTIFIED WITH caching_sha2_password BY 'nodered_password_change_me';
GRANT ALL PRIVILEGES ON ciudad_inteligente.* TO 'nodered_user'@'%';
ALTER USER 'nodered_user'@'%' REQUIRE NONE;
FLUSH PRIVILEGES;
