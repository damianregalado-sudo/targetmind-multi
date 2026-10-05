const App = (() => {
  let currentTab = 'targets';
  let selectedTargets = [1, 2];
  let laserColor = 'red';

  function init() {
    if (typeof AppLog !== 'undefined') AppLog.add('APP', 'init');
    renderTargetsTab();
    setupNav();
  }

  function setTab(tab) {
    currentTab = tab;
    $$('.tab-panel').forEach(p => p.classList.toggle('hidden', p.id !== `tab-${tab}`));
    $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    if (tab === 'targets') renderTargetsTab();
    if (tab === 'drill') renderDrillTab();
    if (tab === 'results') renderResultsTab();
  }

  function setupNav() {
    $$('.nav-btn').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
  }

  function renderTargetsTab() {
    const container = $('#targetCards');
    if (!container) return;
    container.innerHTML = '';
    for (let i = 1; i <= TARGETS_MAX; i++) {
      const info = TARGET_TYPES[i];
      const selected = selectedTargets.includes(i);
      const card = document.createElement('div');
      card.className = `target-card ${selected ? 'selected' : ''}`;
      card.style.borderColor = info.color;
      card.innerHTML = `
        <div class="target-card-header" style="background:${info.color}">
          <span class="target-num">${i}</span>
          <span class="target-type">${info.type === 'no-shoot' ? 'NO DISPARAR' : 'DISPARAR'}</span>
        </div>
        <div class="target-card-body">
          <div class="target-preview" id="preview-${i}"></div>
          <h3>${info.name}</h3>
          <div class="target-actions">
            <button class="btn btn-sm" onclick="App.toggleTarget(${i})">${selected ? '✓ Seleccionado' : 'Seleccionar'}</button>
            <button class="btn btn-sm btn-ghost" onclick="TargetDesign.downloadTarget(${i})">⬇ Imprimir</button>
          </div>
        </div>
      `;
      container.appendChild(card);

      const preview = card.querySelector(`#preview-${i}`);
      if (preview) {
        const svg = TargetDesign.generateTargetSVG(i);
        if (svg) preview.innerHTML = svg;
      }
    }

    const startBtn = $('#startDrillBtn');
    if (startBtn) startBtn.disabled = selectedTargets.length < 2;
  }

  function toggleTarget(i) {
    const idx = selectedTargets.indexOf(i);
    if (idx >= 0) { if (selectedTargets.length > 1) selectedTargets.splice(idx, 1); }
    else selectedTargets.push(i);
    renderTargetsTab();
  }

  function renderDrillTab() {
    const panel = $('#tab-drill');
    if (!panel) return;
    panel.innerHTML = `
      <div class="drill-setup">
        <h2>Configurar drill</h2>
        <div class="drill-config">
          <label>Blancos activos: <strong>${selectedTargets.map(t => TARGET_TYPES[t].name).join(', ')}</strong></label>
          <label>Rondas: <input type="number" id="drillRounds" value="10" min="3" max="30" class="input-sm"></label>
          <label>Tiempo transición: <input type="number" id="drillTime" value="2" min="1" max="10" step="0.5" class="input-sm"> seg</label>
          <label>Color láser:
            <select id="laserColorSel" class="input-sm">
              <option value="red" ${laserColor === 'red' ? 'selected' : ''}>Rojo</option>
              <option value="green" ${laserColor === 'green' ? 'selected' : ''}>Verde</option>
            </select>
          </label>
          <label><input type="checkbox" id="voiceEnabled" checked> Anuncio por voz</label>
        </div>
        <button class="btn btn-primary btn-lg" onclick="App.startDrill()">ACTIVAR CÁMARA</button>
      </div>
      <div id="drillCamera" class="hidden">
        <video id="drillVideo" autoplay playsinline muted></video>
        <canvas id="drillPreview"></canvas>
        <div id="drillOverlay" class="drill-overlay"></div>
        <div id="drillHud" class="drill-hud"></div>
        <div class="drill-cta">
          <button class="btn btn-ghost" onclick="App.stopDrill()">← Volver</button>
          <button class="btn btn-primary" id="drillActionBtn" onclick="App.beginDrill()">INICIAR DRILL</button>
        </div>
      </div>
    `;
  }

  async function startDrill() {
    laserColor = ($('#laserColorSel') || {}).value || 'red';
    const cameraDiv = $('#drillCamera');
    const setupDiv = $('.drill-setup');
    if (setupDiv) setupDiv.classList.add('hidden');
    if (cameraDiv) cameraDiv.classList.remove('hidden');

    const video = $('#drillVideo');
    await VisionMulti.start(video);
    VisionMulti.startSearch(onVisionFrame, onVisionState);
  }

  function beginDrill() {
    if (VisionMulti.state !== 'LOCKED') return;
    const rounds = parseInt(($('#drillRounds') || {}).value) || 10;
    const time = parseFloat(($('#drillTime') || {}).value) || 2;
    const voice = ($('#voiceEnabled') || {}).checked !== false;
    DrillMulti.start({
      targets: selectedTargets,
      rounds,
      transitionTimeMs: time * 1000,
      voiceEnabled: voice,
    }, onDrillUpdate);
  }

  function stopDrill() {
    DrillMulti.abort();
    VisionMulti.stop();
    renderDrillTab();
  }

  function onVisionFrame(frame) {
    const preview = $('#drillPreview');
    if (preview && frame.previewCanvas) {
      preview.width = frame.previewCanvas.width;
      preview.height = frame.previewCanvas.height;
      preview.getContext('2d').drawImage(frame.previewCanvas, 0, 0);
    }

    const overlay = $('#drillOverlay');
    if (overlay && frame.targets) {
      let html = '';
      for (const [tNum, t] of Object.entries(frame.targets)) {
        const info = TARGET_TYPES[tNum];
        const isActive = VisionMulti.getActiveTarget() == tNum;
        const cx = t.corners.reduce((a, c) => a + c.x, 0) / 4;
        const cy = t.corners.reduce((a, c) => a + c.y, 0) / 4;
        const px = (cx / frame.previewCanvas.width) * 100;
        const py = (cy / frame.previewCanvas.height) * 100;
        html += `<div class="target-marker ${isActive ? 'active' : ''}" style="left:${px}%;top:${py}%;border-color:${info.color}">
          <span>${tNum}</span>
        </div>`;
      }
      overlay.innerHTML = html;
    }

    const hud = $('#drillHud');
    if (hud) {
      if (frame.state === 'SEARCHING') {
        const n = Object.keys(frame.targets || {}).length;
        hud.innerHTML = `<div class="hud-status">Buscando blancos... ${n} detectados (necesita ≥2)<br>Marcadores: ${frame.markerCount || 0}<br>Progreso: ${Math.round((frame.progress || 0) * 100)}%</div>`;
      } else if (frame.state === 'LOCKED') {
        const n = Object.keys(frame.targets || {}).length;
        hud.innerHTML = `<div class="hud-status locked">${n} blancos lockeados ✓</div>`;
      }
    }

    const actionBtn = $('#drillActionBtn');
    if (actionBtn) actionBtn.disabled = frame.state !== 'LOCKED';
  }

  function onVisionState(s) {
    if (typeof AppLog !== 'undefined') AppLog.add('VISION', s);
  }

  function onDrillUpdate(update) {
    const hud = $('#drillHud');
    if (!hud) return;

    if (update.state === 'COMMAND' || update.state === 'AWAIT') {
      const info = TARGET_TYPES[update.activeTarget];
      hud.innerHTML = `
        <div class="drill-command" style="color:${info.color}">
          <div class="drill-round">Ronda ${update.round}/${update.totalRounds}</div>
          <div class="drill-target-name">¡BLANCO ${update.activeTarget}!</div>
          <div class="drill-target-type">${info.name}</div>
        </div>
      `;
    } else if (update.state === 'HIT') {
      const last = update.scores[update.scores.length - 1];
      hud.innerHTML = `<div class="drill-hit ${last.penalty ? 'penalty' : ''}">${last.penalty ? '⚠ PENALIDAD' : '✓ IMPACTO'} ${last.points}pts</div>`;
    } else if (update.state === 'FINISHED') {
      showResults(update.results);
    }
  }

  function showResults(results) {
    setTab('results');
    renderResultsTab(results);
  }

  function renderResultsTab(results) {
    const panel = $('#tab-results');
    if (!panel) return;
    if (!results) { panel.innerHTML = '<p class="muted">No hay resultados aún. Completá un drill primero.</p>'; return; }
    panel.innerHTML = `
      <div class="results-summary">
        <h2>Resultado del drill</h2>
        <div class="results-grid">
          <div class="result-card"><div class="result-value">${results.total}</div><div class="result-label">Puntos</div></div>
          <div class="result-card"><div class="result-value">${results.hits}/${results.rounds}</div><div class="result-label">Impactos</div></div>
          <div class="result-card"><div class="result-value">${results.penalties}</div><div class="result-label">Penalidades</div></div>
          <div class="result-card"><div class="result-value">${results.avgTime ? Math.round(results.avgTime) + 'ms' : '-'}</div><div class="result-label">Tiempo prom.</div></div>
        </div>
        <div class="results-detail">
          <h3>Detalle por ronda</h3>
          <table class="results-table">
            <thead><tr><th>#</th><th>Blanco</th><th>Zona</th><th>Puntos</th><th>Tiempo</th></tr></thead>
            <tbody>
              ${results.scores.map(s => `
                <tr class="${s.penalty ? 'penalty' : s.miss ? 'miss' : ''}">
                  <td>${s.round}</td>
                  <td>${TARGET_TYPES[s.target]?.name || s.target}</td>
                  <td>${s.miss ? 'FALLO' : s.zone || '-'}</td>
                  <td>${s.points}</td>
                  <td>${s.time ? s.time + 'ms' : '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <button class="btn btn-primary btn-lg" onclick="App.setTab('drill')">Nuevo drill</button>
      </div>
    `;
  }

  return { init, setTab, toggleTarget, startDrill, beginDrill, stopDrill, showResults };
})();

document.addEventListener('DOMContentLoaded', App.init);
