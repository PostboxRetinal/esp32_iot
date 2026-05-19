const VALID_CONTEXTS = new Set(['LIBRE', 'RESERVADA', 'FUMIGACION']);
const VALID_RISKS = new Set(['NORMAL', 'ALERTA', 'EMERGENCIA', 'INVALIDO']);

function normalizeContext(value) {
  if (!value) return null;
  const upper = String(value).toUpperCase();
  return VALID_CONTEXTS.has(upper) ? upper : null;
}

function normalizeRisk(value) {
  if (!value) return null;
  const upper = String(value).toUpperCase();
  return VALID_RISKS.has(upper) ? upper : null;
}

function toInt(value, fallback) {
  const num = Number.parseInt(value, 10);
  return Number.isFinite(num) ? num : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

module.exports = {
  normalizeContext,
  normalizeRisk,
  toInt,
  clamp
};
