const API_BASE = `${window.location.origin}/api`;
const MAX_POINTS = 50;
const ONLINE_WINDOW_MS = 60 * 1000;

const nodesList = document.getElementById('nodesList');
const nodeCount = document.getElementById('nodeCount');
const searchInput = document.getElementById('searchInput');
const contextFilter = document.getElementById('contextFilter');
const riskFilter = document.getElementById('riskFilter');
const refreshBtn = document.getElementById('refreshBtn');
const connectionStatus = document.getElementById('connectionStatus');
const detailTitle = document.getElementById('detailTitle');
const detailMeta = document.getElementById('detailMeta');
const detailRisk = document.getElementById('detailRisk');
const detailContext = document.getElementById('detailContext');
const actionStatus = document.getElementById('actionStatus');
const incidentsList = document.getElementById('incidentsList');
const motivoText = document.getElementById('motivoText');
const tabs = document.querySelectorAll('.tab');
const dashboardPage = document.getElementById('dashboardPage');
const analysisPage = document.getElementById('analysisPage');
const analysisRefresh = document.getElementById('analysisRefresh');
const cleanBtn = document.getElementById('cleanBtn');
const cleanStatus = document.getElementById('cleanStatus');
const countBrutas = document.getElementById('countBrutas');
const countPendientes = document.getElementById('countPendientes');
const countLimpias = document.getElementById('countLimpias');
const countIncidencias = document.getElementById('countIncidencias');
const countAnalisis = document.getElementById('countAnalisis');
const countEventos = document.getElementById('countEventos');
const ultimaBruta = document.getElementById('ultimaBruta');
const ultimaLimpia = document.getElementById('ultimaLimpia');
const ultimaIncidencia = document.getElementById('ultimaIncidencia');
const ultimaAnalisis = document.getElementById('ultimaAnalisis');
const ultimoEvento = document.getElementById('ultimoEvento');
const qualityBreakdown = document.getElementById('qualityBreakdown');
const riskBreakdown = document.getElementById('riskBreakdown');
const incidentTypeBreakdown = document.getElementById('incidentTypeBreakdown');
const pendingTable = document.getElementById('pendingTable');
const incidenciasTable = document.getElementById('incidenciasTable');
const limpiasTable = document.getElementById('limpiasTable');
const analisisTable = document.getElementById('analisisTable');
const eventosTable = document.getElementById('eventosTable');

let latestNodes = [];
let selectedId = null;
let currentContext = null;
let lastSeriesTs = null;
let envChart = null;
let gasChart = null;

function setConnection(ok, text) {
  const dot = connectionStatus.querySelector('.dot');
  const label = connectionStatus.querySelector('span:last-child');
  dot.style.background = ok ? '#0f766e' : '#f59e0b';
  label.textContent = text;
}

function getRiskColor(risk) {
  if (risk === 'EMERGENCIA') return '#e11d48';
  if (risk === 'ALERTA') return '#f59e0b';
  if (risk === 'INVALIDO') return '#6b7280';
  return '#0f766e';
}

function formatValue(value, suffix) {
  if (value === null || value === undefined) return '--';
  return `${value}${suffix || ''}`;
}

function parseTimestamp(value) {
  if (!value) return null;
  const ts = Date.parse(String(value).replace(' ', 'T'));
  return Number.isFinite(ts) ? ts : null;
}

function formatTimestamp(value) {
  const ts = parseTimestamp(value);
  if (!ts) return '--';
  const dt = new Date(ts);
  return dt.toLocaleString('es-CO', {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

function formatNumber(value) {
  if (value === null || value === undefined) return '--';
  const num = Number(value);
  return Number.isFinite(num) ? num.toLocaleString('es-CO') : '--';
}

function formatInterval(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return '--';
  if (num >= 1000) return `${(num / 1000).toLocaleString('es-CO')} s`;
  return `${num.toLocaleString('es-CO')} ms`;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'request_failed');
  }
  return data;
}

function setActionStatus(text) {
  if (!actionStatus) return;
  const value = actionStatus.querySelector('.value');
  if (value) {
    value.textContent = text;
  } else {
    actionStatus.textContent = text;
  }
}

function setCleanStatus(text) {
  if (!cleanStatus) return;
  const value = cleanStatus.querySelector('.value');
  if (value) {
    value.textContent = text;
  } else {
    cleanStatus.textContent = text;
  }
}

function applyFilters() {
  const search = searchInput.value.trim().toLowerCase();
  const context = contextFilter.value;
  const risk = riskFilter.value;

  const filtered = latestNodes.filter((node) => {
    if (context && node.contexto_hotel !== context) return false;
    if (risk && node.estado_riesgo !== risk) return false;
    if (search && !String(node.id_habitacion).toLowerCase().includes(search)) return false;
    return true;
  });

  renderNodes(filtered);
}

function renderNodes(nodes) {
  nodesList.innerHTML = '';
  nodeCount.textContent = nodes.length;

  if (!nodes.length) {
    nodesList.innerHTML = '<div class="meta">Sin nodos con esos filtros.</div>';
    return;
  }

  nodes.forEach((node) => {
    const card = document.createElement('div');
    card.className = 'node-card';
    if (node.id_habitacion === selectedId) {
      card.classList.add('active');
    }

    const lastSeenTs = parseTimestamp(node.timestamp_origen);
    const isOnline = lastSeenTs ? (Date.now() - lastSeenTs) <= ONLINE_WINDOW_MS : false;
    const statusClass = isOnline ? 'online' : 'offline';
    const statusText = isOnline ? 'En linea' : 'Sin datos';

    card.innerHTML = `
      <div class="node-title">
        <h3>${node.id_habitacion}</h3>
        <span class="status-pill ${statusClass}">${statusText}</span>
      </div>
      <div class="node-meta">
        <span>Contexto: ${node.contexto_hotel}</span>
        <span>Riesgo: ${node.estado_riesgo || '--'}</span>
      </div>
      <div class="node-meta">
        <span>Temp: ${formatValue(node.temperatura_c, 'C')}</span>
        <span>Hum: ${formatValue(node.humedad_pct, '%')}</span>
      </div>
      <div class="node-meta">
        <span>PH3: ${formatValue(node.fosfina_mq135)}</span>
        <span>CO: ${formatValue(node.co_mq7)}</span>
      </div>
      <div class="node-meta">
        <span>Ultimo: ${formatTimestamp(node.timestamp_origen)}</span>
      </div>
    `;

    card.style.borderLeft = `4px solid ${getRiskColor(node.estado_riesgo)}`;

    card.addEventListener('click', () => {
      selectNode(node.id_habitacion);
    });

    nodesList.appendChild(card);
  });
}

function buildCharts() {
  const envCtx = document.getElementById('envChart').getContext('2d');
  const gasCtx = document.getElementById('gasChart').getContext('2d');

  envChart = new Chart(envCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Temp C',
          data: [],
          borderColor: '#0f766e',
          backgroundColor: 'rgba(15, 118, 110, 0.2)',
          tension: 0.3
        },
        {
          label: 'Humedad %',
          data: [],
          borderColor: '#c2410c',
          backgroundColor: 'rgba(194, 65, 12, 0.2)',
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          ticks: { color: '#5a4f42' }
        },
        x: {
          ticks: { color: '#5a4f42' }
        }
      },
      plugins: {
        legend: { labels: { color: '#1c1b18' } }
      }
    }
  });

  gasChart = new Chart(gasCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Fosfina MQ135',
          data: [],
          borderColor: '#4f46e5',
          backgroundColor: 'rgba(79, 70, 229, 0.2)',
          tension: 0.3
        },
        {
          label: 'CO MQ7',
          data: [],
          borderColor: '#0ea5e9',
          backgroundColor: 'rgba(14, 165, 233, 0.2)',
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          ticks: { color: '#5a4f42' }
        },
        x: {
          ticks: { color: '#5a4f42' }
        }
      },
      plugins: {
        legend: { labels: { color: '#1c1b18' } }
      }
    }
  });
}

function updateCharts(series) {
  if (!envChart || !gasChart) buildCharts();

  const trimmed = series.length > MAX_POINTS ? series.slice(-MAX_POINTS) : series;
  const labels = trimmed.map((row) => row.timestamp_origen);

  envChart.data.labels = labels;
  envChart.data.datasets[0].data = trimmed.map((row) => row.temperatura_c ?? null);
  envChart.data.datasets[1].data = trimmed.map((row) => row.humedad_pct ?? null);
  envChart.update();

  gasChart.data.labels = labels;
  gasChart.data.datasets[0].data = trimmed.map((row) => row.fosfina_mq135 ?? null);
  gasChart.data.datasets[1].data = trimmed.map((row) => row.co_mq7 ?? null);
  gasChart.update();

  if (trimmed.length) {
    lastSeriesTs = parseTimestamp(trimmed[trimmed.length - 1].timestamp_origen);
  } else {
    lastSeriesTs = null;
  }
}

function appendLatest(latest) {
  if (!latest || !envChart || !gasChart) return;
  const label = latest.timestamp_origen;
  if (!label) return;

  const latestTs = parseTimestamp(label);
  if (latestTs !== null && lastSeriesTs !== null && latestTs <= lastSeriesTs) {
    return;
  }

  const lastLabel = envChart.data.labels[envChart.data.labels.length - 1];
  if (lastLabel === label) return;

  envChart.data.labels.push(label);
  envChart.data.datasets[0].data.push(latest.temperatura_c ?? null);
  envChart.data.datasets[1].data.push(latest.humedad_pct ?? null);

  gasChart.data.labels.push(label);
  gasChart.data.datasets[0].data.push(latest.fosfina_mq135 ?? null);
  gasChart.data.datasets[1].data.push(latest.co_mq7 ?? null);

  if (envChart.data.labels.length > MAX_POINTS) {
    envChart.data.labels.shift();
    envChart.data.datasets.forEach((ds) => ds.data.shift());
  }
  if (gasChart.data.labels.length > MAX_POINTS) {
    gasChart.data.labels.shift();
    gasChart.data.datasets.forEach((ds) => ds.data.shift());
  }

  envChart.update('none');
  gasChart.update('none');

  if (latestTs !== null) {
    lastSeriesTs = latestTs;
  }
}

function updateDetail(latest) {
  if (!latest) return;
  detailTitle.textContent = `Nodo ${latest.id_habitacion}`;
  detailMeta.textContent = `Ultima medicion: ${formatTimestamp(latest.timestamp_origen)} | Registro: ${latest.id || '--'}`;
  if (detailContext) {
    detailContext.textContent = latest.contexto_hotel || '-';
  }
  detailRisk.textContent = latest.estado_riesgo || '-';
  detailRisk.style.background = `${getRiskColor(latest.estado_riesgo)}22`;
  detailRisk.style.color = getRiskColor(latest.estado_riesgo);
  currentContext = latest.contexto_hotel || null;
  if (motivoText) {
    motivoText.textContent = latest.motivo_activacion || latest.razon_riesgo || 'Sin eventos recientes.';
  }
}

async function loadNodesOnce() {
  try {
    const response = await fetch(`${API_BASE}/nodes?limit=200`);
    const data = await response.json();
    latestNodes = data.items || [];
    applyFilters();
  } catch (err) {
    console.error(err);
  }
}

async function loadSeries(id) {
  try {
    const response = await fetch(`${API_BASE}/nodes/${encodeURIComponent(id)}/series?limit=${MAX_POINTS}`);
    const data = await response.json();
    updateCharts(data.items || []);
  } catch (err) {
    console.error(err);
  }
}

async function loadIncidencias(id) {
  try {
    const response = await fetch(`${API_BASE}/nodes/${encodeURIComponent(id)}/incidencias?limit=10`);
    const data = await response.json();
    const items = data.items || [];

    if (!items.length) {
      incidentsList.textContent = 'Sin incidencias.';
      return;
    }

    incidentsList.innerHTML = '';
    items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'incident-item';
      row.textContent = `${item.tipo_incidencia}: ${item.detalle_incidencia}`;
      incidentsList.appendChild(row);
    });
  } catch (err) {
    console.error(err);
  }
}

function selectNode(id) {
  selectedId = id;
  lastSeriesTs = null;
  const latest = latestNodes.find((node) => node.id_habitacion === id);
  updateDetail(latest);
  applyFilters();
  loadSeries(id);
  loadIncidencias(id);
}

async function sendState(state) {
  if (!selectedId) {
    setActionStatus('Selecciona un nodo primero.');
    return;
  }

  const payload = { estado: state };

  setActionStatus('Enviando comando...');

  try {
    const response = await fetch(`${API_BASE}/nodes/${encodeURIComponent(selectedId)}/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      setActionStatus(data.error || 'Error enviando comando.');
      return;
    }
    const stamp = formatTimestamp(new Date().toISOString());
    setActionStatus(`${state} · ${stamp}`);
  } catch (err) {
    setActionStatus('Error enviando comando.');
  }
}

function renderTable(container, headers, rows, columnCount) {
  if (!container) return;
  container.innerHTML = '';

  if (!rows.length) {
    container.innerHTML = '<div class="table-empty">Sin datos.</div>';
    return;
  }

  const headerRow = document.createElement('div');
  headerRow.className = `table-row header cols-${columnCount}`;
  headerRow.style.gridTemplateColumns = `repeat(${columnCount}, minmax(110px, 1fr))`;
  headers.forEach((title) => {
    const cell = document.createElement('span');
    cell.textContent = title;
    headerRow.appendChild(cell);
  });
  container.appendChild(headerRow);

  rows.forEach((row) => {
    const rowEl = document.createElement('div');
    rowEl.className = `table-row cols-${columnCount}`;
    rowEl.style.gridTemplateColumns = `repeat(${columnCount}, minmax(110px, 1fr))`;
    row.forEach((cellValue) => {
      const cell = document.createElement('span');
      cell.textContent = cellValue;
      rowEl.appendChild(cell);
    });
    container.appendChild(rowEl);
  });
}

function renderBreakdown(container, rows, labelFn) {
  if (!container) return;
  container.innerHTML = '';

  if (!rows.length) {
    container.textContent = 'Sin datos.';
    return;
  }

  rows.forEach((row) => {
    const item = document.createElement('div');
    item.className = 'breakdown-item';

    const label = document.createElement('span');
    label.textContent = labelFn(row);

    const value = document.createElement('strong');
    value.textContent = formatNumber(row.total);

    item.appendChild(label);
    item.appendChild(value);
    container.appendChild(item);
  });
}

async function loadAnalysis() {
  try {
    const [summary, incData, limpiasData, brutasData, analData, eventosData] = await Promise.all([
      fetchJson(`${API_BASE}/analysis/summary`),
      fetchJson(`${API_BASE}/analysis/incidencias?limit=20`),
      fetchJson(`${API_BASE}/analysis/limpias?limit=20`),
      fetchJson(`${API_BASE}/analysis/brutas?limpio=0&limit=12`),
      fetchJson(`${API_BASE}/analysis/analisis?limit=20`),
      fetchJson(`${API_BASE}/analysis/eventos?limit=20`)
    ]);

    if (countBrutas) countBrutas.textContent = formatNumber(summary.total_brutas);
    if (countPendientes) countPendientes.textContent = formatNumber(summary.total_pendientes);
    if (countLimpias) countLimpias.textContent = formatNumber(summary.total_limpias);
    if (countIncidencias) countIncidencias.textContent = formatNumber(summary.total_incidencias);
    if (countAnalisis) countAnalisis.textContent = formatNumber(summary.total_analisis);
    if (countEventos) countEventos.textContent = formatNumber(summary.total_eventos);
    if (ultimaBruta) ultimaBruta.textContent = formatTimestamp(summary.ultima_medicion);
    if (ultimaLimpia) ultimaLimpia.textContent = formatTimestamp(summary.ultima_limpia);
    if (ultimaIncidencia) ultimaIncidencia.textContent = formatTimestamp(summary.ultima_incidencia);
    if (ultimaAnalisis) ultimaAnalisis.textContent = formatTimestamp(summary.ultima_analisis);
    if (ultimoEvento) ultimoEvento.textContent = formatTimestamp(summary.ultimo_evento);

    renderBreakdown(qualityBreakdown, summary.calidad || [], (row) => (
      Number(row.limpio) === 1 ? 'Procesadas' : 'Pendientes'
    ));
    renderBreakdown(riskBreakdown, summary.riesgos || [], (row) => row.estado_riesgo || 'SIN ESTADO');
    renderBreakdown(
      incidentTypeBreakdown,
      summary.incidencias_por_tipo || [],
      (row) => row.tipo_incidencia || 'SIN TIPO'
    );

    const pendingRows = (brutasData.items || []).map((item) => [
      item.id,
      item.id_habitacion,
      item.contexto_hotel,
      formatValue(item.temperatura_c, 'C'),
      formatValue(item.humedad_pct, '%'),
      formatTimestamp(item.timestamp_origen || item.created_at)
    ]);
    renderTable(pendingTable, ['ID', 'Habitacion', 'Contexto', 'Temp', 'Hum', 'Fecha'], pendingRows, 6);

    const incRows = (incData.items || []).map((item) => [
      item.id_habitacion,
      item.tipo_incidencia,
      item.detalle_incidencia,
      formatTimestamp(item.incidencia_created_at || item.timestamp_origen)
    ]);
    renderTable(incidenciasTable, ['Habitacion', 'Tipo', 'Detalle', 'Fecha'], incRows, 4);

    const limpiasRows = (limpiasData.items || []).map((item) => [
      item.id_habitacion,
      item.estado_riesgo || '--',
      formatValue(item.temperatura_c, 'C'),
      formatValue(item.humedad_pct, '%'),
      formatValue(item.fosfina_mq135),
      formatValue(item.co_mq7),
      formatTimestamp(item.timestamp_origen || item.created_at)
    ]);
    renderTable(limpiasTable, ['Habitacion', 'Riesgo', 'Temp', 'Hum', 'PH3', 'CO', 'Fecha'], limpiasRows, 7);

    const analRows = (analData.items || []).map((item) => [
      item.id_habitacion || '--',
      formatNumber(item.total_registros),
      `${formatNumber(item.temp_promedio)} / ${formatNumber(item.temp_rango)}`,
      `${formatNumber(item.hum_promedio)} / ${formatNumber(item.hum_rango)}`,
      formatNumber(item.fosfina_promedio),
      formatNumber(item.co_promedio),
      formatTimestamp(item.fecha_generacion)
    ]);
    renderTable(
      analisisTable,
      ['Habitacion', 'Registros', 'Temp prom/rango', 'Hum prom/rango', 'PH3 prom', 'CO prom', 'Generado'],
      analRows,
      7
    );

    const eventRows = (eventosData.items || []).map((item) => [
      item.id_habitacion,
      item.estado_riesgo,
      item.contexto_hotel,
      item.motivo_activacion,
      formatInterval(item.intervalo_objetivo_ms),
      formatTimestamp(item.created_at || item.timestamp_origen)
    ]);
    renderTable(eventosTable, ['Habitacion', 'Riesgo', 'Contexto', 'Motivo', 'Intervalo', 'Fecha'], eventRows, 6);
  } catch (err) {
    console.error(err);
  }
}

async function triggerClean() {
  setCleanStatus('Lanzando limpieza...');
  try {
    const data = await fetchJson(`${API_BASE}/analysis/clean`, { method: 'POST' });
    const stamp = formatTimestamp(new Date().toISOString());
    setCleanStatus(`${data.message || 'Solicitada'} · ${stamp}`);
    loadAnalysis();
    setTimeout(loadAnalysis, 2500);
  } catch (err) {
    setCleanStatus('No se pudo iniciar limpieza.');
  }
}

function showPage(target) {
  const isDashboard = target === 'dashboard';
  if (dashboardPage) dashboardPage.classList.toggle('active', isDashboard);
  if (analysisPage) analysisPage.classList.toggle('active', !isDashboard);
  tabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.page === target);
  });

  if (!isDashboard) {
    loadAnalysis();
  }
}

function initSse() {
  const sse = new EventSource(`${API_BASE}/stream/latest`);

  sse.addEventListener('latest', (event) => {
    setConnection(true, 'Conectado');
    const data = JSON.parse(event.data);
    latestNodes = data.items || [];
    applyFilters();

    if (selectedId) {
      const latest = latestNodes.find((node) => node.id_habitacion === selectedId);
      if (latest) {
        updateDetail(latest);
        appendLatest(latest);
      }
    }
  });

  sse.addEventListener('error', () => {
    setConnection(false, 'Reconectando...');
  });
}

refreshBtn.addEventListener('click', loadNodesOnce);
searchInput.addEventListener('input', applyFilters);
contextFilter.addEventListener('change', applyFilters);
riskFilter.addEventListener('change', applyFilters);

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    showPage(tab.dataset.page);
  });
});

if (analysisRefresh) {
  analysisRefresh.addEventListener('click', loadAnalysis);
}

if (cleanBtn) {
  cleanBtn.addEventListener('click', triggerClean);
}

document.querySelectorAll('[data-state]').forEach((btn) => {
  btn.addEventListener('click', () => sendState(btn.dataset.state));
});

buildCharts();
loadNodesOnce();
initSse();
showPage('dashboard');
