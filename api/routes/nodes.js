const express = require('express');
const { pool } = require('../lib/db');
const { publishCommand } = require('../lib/mqtt');
const { normalizeContext, normalizeRisk, toInt, clamp } = require('../lib/validators');
const { toMysqlDateTime, parseDateParam } = require('../lib/time');
const { queryLatestNodes } = require('../lib/queries');

const router = express.Router();
const TOPICO_COMANDOS = process.env.TOPICO_COMANDOS || 'comandos';

router.get('/nodes', async (req, res) => {
  try {
    const estado = normalizeRisk(req.query.estado);
    const contexto = normalizeContext(req.query.contexto);
    const limit = clamp(toInt(req.query.limit, 50), 1, 200);
    const offset = Math.max(toInt(req.query.offset, 0), 0);

    if (req.query.estado && !estado) {
      return res.status(400).json({ error: 'estado_riesgo invalido' });
    }

    if (req.query.contexto && !contexto) {
      return res.status(400).json({ error: 'contexto_hotel invalido' });
    }

    const items = await queryLatestNodes({ estado, contexto, limit, offset });
    res.json({ items, limit, offset });
  } catch (err) {
    console.error('[api] /nodes error', err.message);
    res.status(500).json({ error: 'error consultando nodos' });
  }
});

router.get('/nodes/:id/latest', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) {
      return res.status(400).json({ error: 'id_habitacion requerido' });
    }

    const sql = `
      SELECT v.*, evt.motivo_activacion, evt.created_at AS motivo_created_at
      FROM vw_mediciones_estado v
      LEFT JOIN (
        SELECT id_habitacion, MAX(id) AS max_evt_id
        FROM eventos_actuadores
        WHERE id_habitacion = ?
      ) te ON v.id_habitacion = te.id_habitacion
      LEFT JOIN eventos_actuadores evt ON evt.id = te.max_evt_id
      WHERE v.id_habitacion = ?
      ORDER BY v.timestamp_origen DESC, v.id DESC
      LIMIT 1
    `;

    const [rows] = await pool.query(sql, [id, id]);
    res.json({ item: rows[0] || null });
  } catch (err) {
    console.error('[api] /nodes/:id/latest error', err.message);
    res.status(500).json({ error: 'error consultando nodo' });
  }
});

router.get('/nodes/:id/series', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) {
      return res.status(400).json({ error: 'id_habitacion requerido' });
    }

    const now = new Date();
    const fromDefault = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const limit = clamp(toInt(req.query.limit, 50), 1, 2000);
    const recentOnly = req.query.recent === '1' || req.query.recent === 'true' || (req.query.from === undefined && req.query.to === undefined);

    if (recentOnly) {
      const sql = `
        SELECT * FROM (
          SELECT timestamp_origen, temperatura_c, humedad_pct, fosfina_mq135, co_mq7, presencia_pir,
                 estado_riesgo, contexto_hotel
          FROM vw_mediciones_estado
          WHERE id_habitacion = ?
          ORDER BY timestamp_origen DESC, id DESC
          LIMIT ?
        ) t
        ORDER BY timestamp_origen ASC
      `;

      const [rows] = await pool.query(sql, [id, limit]);
      res.json({ items: rows, limit, mode: 'recent' });
      return;
    }

    const fromDate = parseDateParam(req.query.from) || fromDefault;
    const toDate = parseDateParam(req.query.to) || now;

    const start = fromDate <= toDate ? fromDate : toDate;
    const end = fromDate <= toDate ? toDate : fromDate;

    const sql = `
      SELECT * FROM (
        SELECT timestamp_origen, temperatura_c, humedad_pct, fosfina_mq135, co_mq7, presencia_pir,
               estado_riesgo, contexto_hotel
        FROM vw_mediciones_estado
        WHERE id_habitacion = ? AND timestamp_origen BETWEEN ? AND ?
        ORDER BY timestamp_origen DESC, id DESC
        LIMIT ?
      ) t
      ORDER BY timestamp_origen ASC
    `;

    const [rows] = await pool.query(sql, [
      id,
      toMysqlDateTime(start),
      toMysqlDateTime(end),
      limit
    ]);

    res.json({ items: rows, from: toMysqlDateTime(start), to: toMysqlDateTime(end), mode: 'range' });
  } catch (err) {
    console.error('[api] /nodes/:id/series error', err.message);
    res.status(500).json({ error: 'error consultando series' });
  }
});

router.get('/nodes/:id/incidencias', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) {
      return res.status(400).json({ error: 'id_habitacion requerido' });
    }

    const limit = clamp(toInt(req.query.limit, 20), 1, 200);

    const sql = `
      SELECT id, medicion_id, tipo_incidencia, detalle_incidencia, valor_detectado,
             incidencia_created_at, timestamp_origen
      FROM vw_incidencias_medicion
      WHERE id_habitacion = ?
        AND detalle_incidencia NOT LIKE '%intervalo_irregular_%'
        AND detalle_incidencia NOT LIKE '%hueco_temporal_%'
        AND detalle_incidencia NOT LIKE '%intervalo_fuera_rango%'
      ORDER BY incidencia_created_at DESC
      LIMIT ?
    `;

    const [rows] = await pool.query(sql, [id, limit]);
    res.json({ items: rows });
  } catch (err) {
    console.error('[api] /nodes/:id/incidencias error', err.message);
    res.status(500).json({ error: 'error consultando incidencias' });
  }
});

router.post('/nodes/:id/state', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) {
      return res.status(400).json({ error: 'id_habitacion requerido' });
    }

    const estado = normalizeContext(req.body.estado);
    if (!estado) {
      return res.status(400).json({ error: 'estado invalido' });
    }

    const payload = {
      estado,
      id_habitacion: id
    };

    publishCommand(TOPICO_COMANDOS, payload, (err) => {
      if (err) {
        const status = err.code === 'MQTT_NOT_CONNECTED' ? 503 : 500;
        return res.status(status).json({ error: 'no se pudo enviar comando mqtt' });
      }
      res.json({ ok: true, payload });
    });
  } catch (err) {
    console.error('[api] /nodes/:id/state error', err.message);
    res.status(500).json({ error: 'error enviando comando' });
  }
});

module.exports = router;
