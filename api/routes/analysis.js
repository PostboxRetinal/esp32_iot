const express = require('express');
const { pool } = require('../lib/db');
const { toInt, clamp } = require('../lib/validators');

const router = express.Router();
const NODE_RED_BASE_URL = (process.env.NODE_RED_BASE_URL || 'http://localhost:1880').replace(/\/$/, '');
const NODE_RED_CLEAN_URL = process.env.NODE_RED_CLEAN_URL || `${NODE_RED_BASE_URL}/api/limpieza/lote`;
const NODE_RED_MONTHLY_ANALYSIS_URL = process.env.NODE_RED_MONTHLY_ANALYSIS_URL || `${NODE_RED_BASE_URL}/api/analisis/mensual`;
const NODE_RED_TIMEOUT_MS = Number(process.env.NODE_RED_TIMEOUT_MS || 5000);

function queryLimit(value, fallback = 20, max = 200) {
  return clamp(toInt(value, fallback), 1, max);
}

function byHabitacion(req) {
  const id = String(req.query.id_habitacion || '').trim();
  return id || null;
}

function parseJsonField(value) {
  if (!value || typeof value !== 'string') return value || null;
  try {
    return JSON.parse(value);
  } catch (_err) {
    return value;
  }
}

async function postNodeRedAction(url, action) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NODE_RED_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'web-api', action }),
      signal: controller.signal
    });

    const text = await response.text();
    let payload = text;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch (_err) {
      payload = text;
    }

    if (!response.ok) {
      const err = new Error(`node_red_${action.toLowerCase()}_failed`);
      err.status = response.status;
      err.payload = payload;
      throw err;
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function postNodeRedClean() {
  return postNodeRedAction(NODE_RED_CLEAN_URL, 'LIMPIAR_100');
}

function postNodeRedMonthlyAnalysis() {
  return postNodeRedAction(NODE_RED_MONTHLY_ANALYSIS_URL, 'ANALISIS_MENSUAL');
}

router.get('/analysis/summary', async (_req, res) => {
  try {
    const [totalsRows, calidadRows, riesgoRows, incidenciaRows, pendientesRows] = await Promise.all([
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM mediciones_brutas) AS total_brutas,
          (SELECT COUNT(*) FROM mediciones_brutas WHERE limpio = 0) AS total_pendientes,
          (SELECT COUNT(*) FROM mediciones_limpias) AS total_limpias,
          (SELECT COUNT(*) FROM incidencias) AS total_incidencias,
          (SELECT COUNT(*) FROM analisis_mediciones) AS total_analisis,
          (SELECT COUNT(*) FROM eventos_actuadores) AS total_eventos,
          (SELECT MAX(timestamp_origen) FROM mediciones_brutas) AS ultima_medicion,
          (SELECT MAX(created_at) FROM mediciones_limpias) AS ultima_limpia,
          (SELECT MAX(created_at) FROM incidencias) AS ultima_incidencia,
          (SELECT MAX(fecha_generacion) FROM analisis_mediciones) AS ultima_analisis,
          (SELECT MAX(created_at) FROM eventos_actuadores) AS ultimo_evento
      `),
      pool.query('SELECT limpio, COUNT(*) AS total, MAX(created_at) AS ultimo_registro FROM mediciones_brutas GROUP BY limpio ORDER BY limpio'),
      pool.query('SELECT estado_riesgo, COUNT(*) AS total, MAX(created_at) AS ultima_medicion FROM estados_medicion GROUP BY estado_riesgo ORDER BY total DESC'),
      pool.query('SELECT tipo_incidencia, COUNT(*) AS total, MAX(created_at) AS ultima_incidencia FROM incidencias GROUP BY tipo_incidencia ORDER BY total DESC'),
      pool.query(`
        SELECT id, id_habitacion, contexto_hotel, temperatura_c, humedad_pct,
               fosfina_mq135, co_mq7, timestamp_origen, created_at
        FROM mediciones_brutas
        WHERE limpio = 0
        ORDER BY id ASC
        LIMIT 5
      `)
    ]);

    res.json({
      ...(totalsRows[0][0] || {}),
      calidad: calidadRows[0],
      riesgos: riesgoRows[0],
      incidencias_por_tipo: incidenciaRows[0],
      pendientes_muestra: pendientesRows[0]
    });
  } catch (err) {
    console.error('[api] /analysis/summary error', err.message);
    res.status(500).json({ error: 'error consultando resumen de analisis' });
  }
});

router.get('/analysis/brutas', async (req, res) => {
  try {
    const limit = queryLimit(req.query.limit, 20);
    const habitacion = byHabitacion(req);
    const limpioParam = req.query.limpio;
    const where = [];
    const params = [];

    if (habitacion) {
      where.push('id_habitacion = ?');
      params.push(habitacion);
    }

    if (limpioParam !== undefined) {
      const limpio = Number(limpioParam);
      if (limpio !== 0 && limpio !== 1) {
        return res.status(400).json({ error: 'limpio debe ser 0 o 1' });
      }
      where.push('limpio = ?');
      params.push(limpio);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(limit);

    const [rows] = await pool.query(
      `
        SELECT id, id_habitacion, contexto_hotel, temperatura_c, humedad_pct,
               fosfina_mq135, co_mq7, presencia_pir, intervalo_envio_ms,
               limpio, timestamp_origen, created_at
        FROM mediciones_brutas
        ${whereSql}
        ORDER BY id DESC
        LIMIT ?
      `,
      params
    );

    res.json({ items: rows, limit });
  } catch (err) {
    console.error('[api] /analysis/brutas error', err.message);
    res.status(500).json({ error: 'error consultando mediciones brutas' });
  }
});

router.get('/analysis/limpias', async (req, res) => {
  try {
    const limit = queryLimit(req.query.limit, 20);
    const habitacion = byHabitacion(req);
    const params = [];
    const whereSql = habitacion ? 'WHERE b.id_habitacion = ?' : '';
    if (habitacion) params.push(habitacion);
    params.push(limit);

    const [rows] = await pool.query(
      `
        SELECT l.id, l.medicion_id, b.id_habitacion, b.contexto_hotel,
               e.estado_riesgo, l.temperatura_c, l.humedad_pct,
               l.fosfina_mq135, l.co_mq7, b.timestamp_origen, l.created_at
        FROM mediciones_limpias l
        INNER JOIN mediciones_brutas b ON b.id = l.medicion_id
        LEFT JOIN estados_medicion e ON e.medicion_id = b.id
        ${whereSql}
        ORDER BY l.id DESC
        LIMIT ?
      `,
      params
    );

    res.json({ items: rows, limit });
  } catch (err) {
    console.error('[api] /analysis/limpias error', err.message);
    res.status(500).json({ error: 'error consultando mediciones limpias' });
  }
});

router.get('/analysis/incidencias', async (req, res) => {
  try {
    const limit = queryLimit(req.query.limit, 20);
    const habitacion = byHabitacion(req);
    const params = [];
    const whereSql = habitacion ? 'WHERE id_habitacion = ?' : '';
    if (habitacion) params.push(habitacion);
    params.push(limit);

    const [rows] = await pool.query(
      `
        SELECT id, medicion_id, id_habitacion, tipo_incidencia,
               detalle_incidencia, valor_detectado, incidencia_created_at,
               timestamp_origen, medicion_created_at
        FROM vw_incidencias_medicion
        ${whereSql}
        ORDER BY incidencia_created_at DESC
        LIMIT ?
      `,
      params
    );

    res.json({
      items: rows.map((row) => ({
        ...row,
        valor_detectado: parseJsonField(row.valor_detectado)
      })),
      limit
    });
  } catch (err) {
    console.error('[api] /analysis/incidencias error', err.message);
    res.status(500).json({ error: 'error consultando incidencias' });
  }
});

router.get('/analysis/eventos', async (req, res) => {
  try {
    const limit = queryLimit(req.query.limit, 20);
    const habitacion = byHabitacion(req);
    const params = [];
    const whereSql = habitacion ? 'WHERE id_habitacion = ?' : '';
    if (habitacion) params.push(habitacion);
    params.push(limit);

    const [rows] = await pool.query(
      `
        SELECT id, medicion_id, id_habitacion, estado_riesgo,
               contexto_hotel, motivo_activacion, intervalo_objetivo_ms,
               timestamp_origen, created_at
        FROM eventos_actuadores
        ${whereSql}
        ORDER BY id DESC
        LIMIT ?
      `,
      params
    );

    res.json({ items: rows, limit });
  } catch (err) {
    console.error('[api] /analysis/eventos error', err.message);
    res.status(500).json({ error: 'error consultando eventos de actuadores' });
  }
});

router.get('/analysis/analisis', async (req, res) => {
  try {
    const limit = queryLimit(req.query.limit, 20);
    const habitacion = byHabitacion(req);
    const params = [];
    const whereSql = habitacion ? 'WHERE id_habitacion = ?' : '';
    if (habitacion) params.push(habitacion);
    params.push(limit);

    const [rows] = await pool.query(
      `
        SELECT id, id_habitacion, periodo_dias, total_registros,
               fecha_inicio_analisis, fecha_fin_analisis, fecha_generacion,
               temp_promedio, temp_mediana, temp_moda, temp_minima, temp_maxima,
               temp_rango, temp_stddev, temp_varianza, temp_fuera_rango, temp_anomalias,
               hum_promedio, hum_mediana, hum_moda, hum_minima, hum_maxima,
               hum_rango, hum_stddev, hum_varianza, hum_fuera_rango, hum_anomalias,
               fosfina_promedio, fosfina_mediana, fosfina_moda, fosfina_minima,
               fosfina_maxima, fosfina_rango, fosfina_stddev, fosfina_varianza,
               fosfina_fuera_rango, fosfina_anomalias,
               co_promedio, co_mediana, co_moda, co_minima, co_maxima,
               co_rango, co_stddev, co_varianza, co_fuera_rango, co_anomalias,
               corr_temp_hum, corr_fosfina_co, distribucion_categorias,
               patrones_temporales, relaciones_variables, comparacion_periodos,
               justificacion_analisis, limitaciones
        FROM analisis_mediciones
        ${whereSql}
        ORDER BY fecha_generacion DESC, id DESC
        LIMIT ?
      `,
      params
    );

    res.json({
      items: rows.map((row) => ({
        ...row,
        distribucion_categorias: parseJsonField(row.distribucion_categorias),
        patrones_temporales: parseJsonField(row.patrones_temporales),
        relaciones_variables: parseJsonField(row.relaciones_variables),
        comparacion_periodos: parseJsonField(row.comparacion_periodos),
        justificacion_analisis: parseJsonField(row.justificacion_analisis),
        limitaciones: parseJsonField(row.limitaciones)
      })),
      limit
    });
  } catch (err) {
    console.error('[api] /analysis/analisis error', err.message);
    res.status(500).json({ error: 'error consultando analisis de mediciones' });
  }
});

router.post('/analysis/clean', async (_req, res) => {
  try {
    const nodeRed = await postNodeRedClean();
    res.status(202).json({
      ok: true,
      action: 'LIMPIAR_100',
      message: 'limpieza de lote solicitada en Node-RED',
      node_red: nodeRed
    });
  } catch (err) {
    const isAbort = err.name === 'AbortError';
    console.error('[api] /analysis/clean error', isAbort ? 'node_red_timeout' : err.message);
    res.status(isAbort ? 504 : 502).json({
      error: isAbort ? 'timeout conectando con node-red' : 'no se pudo iniciar limpieza en node-red',
      detail: err.payload || null
    });
  }
});

router.post('/analysis/monthly', async (_req, res) => {
  try {
    const nodeRed = await postNodeRedMonthlyAnalysis();
    res.status(202).json({
      ok: true,
      action: 'ANALISIS_MENSUAL',
      message: 'analisis mensual solicitado en Node-RED',
      node_red: nodeRed
    });
  } catch (err) {
    const isAbort = err.name === 'AbortError';
    console.error('[api] /analysis/monthly error', isAbort ? 'node_red_timeout' : err.message);
    res.status(isAbort ? 504 : 502).json({
      error: isAbort ? 'timeout conectando con node-red' : 'no se pudo iniciar analisis mensual en node-red',
      detail: err.payload || null
    });
  }
});

module.exports = router;
