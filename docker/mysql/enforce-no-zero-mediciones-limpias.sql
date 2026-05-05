USE ciudad_inteligente;

START TRANSACTION;

UPDATE mediciones_brutas b
INNER JOIN mediciones_limpias l ON l.medicion_id = b.id
SET b.limpio = 0
WHERE l.temperatura_c = 0
   OR l.humedad_pct = 0
   OR l.fosfina_mq135 = 0
   OR l.co_mq7 = 0;

DELETE FROM mediciones_limpias
WHERE temperatura_c = 0
   OR humedad_pct = 0
   OR fosfina_mq135 = 0
   OR co_mq7 = 0;

ALTER TABLE mediciones_limpias
  ADD CONSTRAINT chk_limpia_temperatura_no_cero
    CHECK (temperatura_c IS NULL OR temperatura_c <> 0),
  ADD CONSTRAINT chk_limpia_humedad_no_cero
    CHECK (humedad_pct IS NULL OR humedad_pct <> 0),
  ADD CONSTRAINT chk_limpia_fosfina_no_cero
    CHECK (fosfina_mq135 IS NULL OR fosfina_mq135 <> 0),
  ADD CONSTRAINT chk_limpia_co_no_cero
    CHECK (co_mq7 IS NULL OR co_mq7 <> 0);

COMMIT;
