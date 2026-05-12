const { pool } = require('./db');

async function queryLatestNodes({ estado, contexto, limit, offset }) {
  const where = [];
  const params = [];

  if (estado) {
    where.push('v.estado_riesgo = ?');
    params.push(estado);
  }

  if (contexto) {
    where.push('v.contexto_hotel = ?');
    params.push(contexto);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const sql = `
    SELECT v.*, evt.motivo_activacion, evt.created_at AS motivo_created_at
    FROM vw_mediciones_estado v
    JOIN (
      SELECT id_habitacion, MAX(id) AS max_id
      FROM mediciones_brutas
      GROUP BY id_habitacion
    ) t ON v.id = t.max_id
    LEFT JOIN (
      SELECT id_habitacion, MAX(id) AS max_evt_id
      FROM eventos_actuadores
      GROUP BY id_habitacion
    ) te ON v.id_habitacion = te.id_habitacion
    LEFT JOIN eventos_actuadores evt ON evt.id = te.max_evt_id
    ${whereSql}
    ORDER BY v.id_habitacion
    LIMIT ? OFFSET ?
  `;

  params.push(limit, offset);

  const [rows] = await pool.query(sql, params);
  return rows;
}

module.exports = { queryLatestNodes };
