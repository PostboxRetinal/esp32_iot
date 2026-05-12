function toMysqlDateTime(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function parseDateParam(value) {
  if (!value) return null;
  if (typeof value === 'number') {
    const dt = new Date(value);
    return Number.isFinite(dt.getTime()) ? dt : null;
  }
  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) {
    const dt = new Date(asNumber);
    return Number.isFinite(dt.getTime()) ? dt : null;
  }
  const dt = new Date(String(value));
  return Number.isFinite(dt.getTime()) ? dt : null;
}

module.exports = { toMysqlDateTime, parseDateParam };
