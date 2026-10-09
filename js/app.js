const App = (() => {
  let selected = [1, 2, 4];
  let laserColor = 'red';
  let lastResults = null;
  let shotMarks = [];
  let showZones = true;
  try { showZones = localStorage.getItem('tm-show-zones') !== '0'; } catch (e) {}

  function setShowZones(on) {
    showZones = on;
    try { localStorage.setItem('tm-show-zones', on ? '1' : '0'); } catch (e) {}
    renderTargetsTab();
  }

  function printSelected(nums) { TargetDesign.printTargets(nums, { showZones }); }

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function init() {
    if (typeof AppLog !== 'undefined') AppLog.add('APP', 'init');
    $$('.nav-btn').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
    renderTargetsTab();
  }

  function setTab(tab) {
    if (tab !== 'drill' && VisionMulti.isRunning()) stopCamera();
    $$('.tab-panel').forEach(p => p.classList.toggle('hidden', p.id !== `tab-${tab}`));
    $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    if (tab === 'targets') renderTargetsTab();
    if (tab === 'drill' && !VisionMulti.isRunning()) renderDrillTab();
    if (tab === 'results') renderResultsTab();
  }

  function selectionProblem() {
    if (selected.length < 2) return 'Elegí al menos 2 blancos.';
    const shootable = DrillMulti.shootableOf(selected);
    if (!shootable.length) return 'Elegí al menos un blanco para disparar (el civil es solo de "no disparar").';
    return null;
  }

  function renderTargetsTab() {
    const container = $('#targetCards');
    container.innerHTML = '';
    for (let i = 1; i <= TARGETS_MAX; i++) {
      const info = TARGET_TYPES[i];
      const on = selected.includes(i);
      const card = document.createElement('div');
      card.className = `target-card ${on ? 'selected' : ''}`;
      card.style.borderColor = on ? info.color : '';
      card.innerHTML = `
        <div class="target-card-header" style="background:${info.color}">
          <span class="target-num">${i}</span>
          <span>${info.noShoot ? 'NO DISPARAR' : 'DISPARAR'}</span>
        </div>
        <div class="target-card-body">
          <div class="target-preview">${TargetDesign.generateTargetSVG(i, { showZones })}</div>
          <h3>${esc(info.name)}</h3>
          <div class="target-actions">
            <button class="btn btn-sm" data-act="toggle">${on ? '✓ Seleccionado' : 'Seleccionar'}</button>
            <button class="btn btn-sm btn-ghost" data-act="print">🖨 Imprimir</button>
          </div>
        </div>`;
      card.querySelector('[data-act="toggle"]').onclick = () => toggleTarget(i);
      card.querySelector('[data-act="print"]').onclick = () => printSelected([i]);
      container.appendChild(card);
    }
    const zt = $('#zonesToggle');
    zt.checked = showZones;
    zt.onchange = () => setShowZones(zt.checked);
    const problem = selectionProblem();
    $('#selectionHint').textContent = problem || `${selected.length} blancos seleccionados.`;
    $('#selectionHint').classList.toggle('warn', !!problem);
    $('#startDrillBtn').disabled = !!problem;
  }

  function toggleTarget(i) {
    const at = selected.indexOf(i);
    if (at >= 0) selected.splice(at, 1); else selected.push(i);
    selected.sort();
    renderTargetsTab();
  }

  function renderDrillTab() {
    const panel = $('#tab-drill');
    const problem = selectionProblem();
    panel.innerHTML = `
      <div class="drill-setup">
        <h2>Configurar drill</h2>
        ${problem ? `<p class="warn">${problem}</p>` : ''}
        <div class="drill-config">
          <label>Blancos: <strong>${selected.map(t => `${t} · ${esc(TARGET_TYPES[t].name)}`).join('<br>')}</strong></label>
          <label>Rondas <input type="number" id="drillRounds" value="${DRILL_DEFAULTS.rounds}" min="3" max="50" class="input-sm"></label>
          <label>Tiempo para disparar <input type="number" id="drillWindow" value="${DRILL_DEFAULTS.windowMs / 1000}" min="0.8" max="10" step="0.1" class="input-sm"> s</label>
          <label>Color láser
            <select id="laserColorSel" class="input-sm">
              <option value="red" ${laserColor === 'red' ? 'selected' : ''}>Rojo</option>
              <option value="green" ${laserColor === 'green' ? 'selected' : ''}>Verde</option>
            </select>
          </label>
          <label><input type="checkbox" id="voiceEnabled" checked> Anuncio por voz</label>
        </div>
        <p class="muted-sm">Poné el teléfono fijo (trípode) de forma que entren todos los blancos con sus 4 marcadores negros.</p>
        <button class="btn btn-primary btn-lg" id="camBtn" ${problem ? 'disabled' : ''}>ACTIVAR CÁMARA</button>
      </div>
      <div id="drillCamera" class="hidden">
        <div class="cam-wrap">
          <video id="drillVideo" autoplay playsinline muted></video>
          <div id="drillOverlay" class="drill-overlay"></div>
        </div>
        <div id="visionStatus" class="hud-status"></div>
        <div id="drillMsg" class="drill-msg"></div>
        <div class="drill-cta">
          <button class="btn btn-ghost" id="backBtn">← Volver</button>
          <button class="btn btn-primary" id="drillActionBtn" disabled>INICIAR DRILL</button>
        </div>
        <p class="muted-sm">Sin drill en curso, cada impacto muestra su zona: sirve para probar la detección.
          <button class="btn btn-ghost btn-sm" id="diagBtn">Compartir diagnóstico</button></p>
      </div>`;
    $('#diagBtn').onclick = () => AppLog.share();
    $('#camBtn').onclick = startCamera;
    $('#backBtn').onclick = () => { stopCamera(); renderDrillTab(); };
    $('#drillActionBtn').onclick = toggleDrill;
  }

  async function startCamera() {
    const config = {
      rounds: Math.max(1, parseInt($('#drillRounds').value) || DRILL_DEFAULTS.rounds),
      windowMs: Math.max(800, (parseFloat($('#drillWindow').value) || 3) * 1000),
      voiceEnabled: $('#voiceEnabled').checked,
    };
    laserColor = $('#laserColorSel').value;
    App._config = config;
    $('.drill-setup').classList.add('hidden');
    $('#drillCamera').classList.remove('hidden');
    const status = $('#visionStatus');
    try {
      status.textContent = 'Cargando motor de visión…';
      await VisionMulti.ready();
      status.textContent = 'Abriendo cámara…';
      await VisionMulti.start($('#drillVideo'));
    } catch (err) {
      const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      status.innerHTML = `<span class="warn">${denied ? 'Permiso de cámara denegado. Habilitalo en la configuración del navegador.' : esc(err.message || err)}</span>`;
      if (typeof AppLog !== 'undefined') AppLog.add('ERR', String(err && err.message || err));
      VisionMulti.stop();
      return;
    }
    shotMarks = [];
    VisionMulti.track(selected, { laserColor, onFrame: onVisionFrame, onShot });
  }

  function stopCamera() {
    DrillMulti.abort();
    VisionMulti.stop();
  }

  function toggleDrill() {
    if (DrillMulti.state === 'AWAIT' || DrillMulti.state === 'BETWEEN' || DrillMulti.state === 'READY') {
      DrillMulti.abort();
      $('#drillMsg').innerHTML = '<div class="drill-sub">Drill detenido</div>';
      $('#drillActionBtn').textContent = 'INICIAR DRILL';
      return;
    }
    if (VisionMulti.state !== 'LOCKED') return;
    shotMarks = [];
    DrillMulti.start({ targets: selected, ...App._config }, onDrillUpdate);
    $('#drillActionBtn').textContent = 'DETENER';
  }

  function onShot(shot) {
    shotMarks.push({ ...shot, until: performance.now() + 1500 });
    const st = DrillMulti.state;
    if (st === 'AWAIT' || st === 'BETWEEN' || st === 'READY') {
      if (DrillMulti.registerShot(shot) === 'early') {
        $('#drillMsg').innerHTML = `<div class="drill-hit miss">Impacto en blanco ${shot.target} antes de la orden · no cuenta</div>`;
      }
      return;
    }
    // no drill running: free practice, just report where it landed
    const h = Zones.hitTest(shot.target, shot.x, shot.y);
    $('#drillMsg').innerHTML = `<div class="drill-hit ${h && h.penalty ? 'penalty' : h ? '' : 'miss'}">Blanco ${shot.target}: ${h ? `${esc(h.label)} · ${h.points} pts` : 'fuera de zona'}</div>`;
  }

  function onVisionFrame(f) {
    const overlay = $('#drillOverlay');
    if (!overlay) return;
    const now = performance.now();
    shotMarks = shotMarks.filter(s => s.until > now);
    let html = '';
    for (const [t, info] of Object.entries(f.targets)) {
      if (info.fx == null) continue;
      const def = TARGET_TYPES[t];
      const active = DrillMulti.state === 'AWAIT' && App._active == t;
      html += `<div class="target-marker ${active ? 'active' : ''} ${info.markers < 2 ? 'dim' : ''}" style="left:${info.fx * 100}%;top:${info.fy * 100}%;border-color:${def.color};color:${def.color}">${t}</div>`;
    }
    for (const s of shotMarks) {
      const p = VisionMulti.mmToFrame(s.target, s.x, s.y);
      if (p) html += `<div class="shot-mark" style="left:${p.x / f.frameW * 100}%;top:${p.y / f.frameH * 100}%"></div>`;
    }
    overlay.innerHTML = html;

    const status = $('#visionStatus');
    if (f.state === 'SEARCHING') {
      const missing = Object.entries(f.targets).filter(([, i]) => i.markers < 3).map(([t, i]) => `${t} (${i.markers}/4)`);
      status.className = 'hud-status';
      status.textContent = missing.length
        ? `Buscando… faltan marcadores de: ${missing.join(', ')}`
        : `Estabilizando… ${Math.round(f.progress * 100)}%`;
    } else if (f.state === 'LOCKED') {
      const weak = Object.entries(f.targets).filter(([, i]) => i.markers < 2).map(([t]) => t);
      status.className = f.unstable ? 'hud-status warn' : 'hud-status locked';
      if (f.unstable) { status.textContent = '⚠ La cámara se mueve: apoyá el teléfono firme (los impactos pueden no registrarse)'; }
      else status.textContent = (weak.length ? `Fijado ✓ (sin ver ahora: blanco ${weak.join(', ')})` : `${Object.keys(f.targets).length} blancos fijados ✓`) + ` · ${Math.round(f.fps)} fps`;
    }
    const btn = $('#drillActionBtn');
    if (btn && DrillMulti.state === 'IDLE') btn.disabled = f.state !== 'LOCKED';
  }

  function onDrillUpdate(u) {
    App._active = u.activeTarget;
    const msg = $('#drillMsg');
    if (!msg) return;
    const last = u.last;
    if (u.type === 'ready') {
      msg.innerHTML = '<div class="drill-sub">Preparado…</div>';
    } else if (u.type === 'command') {
      const def = TARGET_TYPES[u.activeTarget];
      msg.innerHTML = `<div class="drill-round">Ronda ${u.round}/${u.totalRounds}</div>
        <div class="drill-target-name" style="color:${def.color}">¡BLANCO ${u.activeTarget}!</div>
        <div class="drill-sub">${esc(def.name)}</div>`;
    } else if (u.type === 'hit') {
      msg.innerHTML = `<div class="drill-hit">✓ ${esc(last.label)} · ${last.points} pts · ${last.time} ms</div>`;
    } else if (u.type === 'miss') {
      msg.innerHTML = `<div class="drill-hit miss">Impacto fuera de zona · 0 pts</div>`;
    } else if (u.type === 'timeout') {
      msg.innerHTML = `<div class="drill-hit miss">Sin impacto a tiempo</div>`;
    } else if (u.type === 'penalty') {
      msg.innerHTML = `<div class="drill-hit penalty">⚠ ${esc(last.label)} · ${last.points} pts</div>`;
    } else if (u.type === 'wrong') {
      msg.innerHTML = `<div class="drill-hit penalty">✗ Blanco equivocado (${esc(last.label)}) · ${last.points} pts</div>`;
    } else if (u.type === 'finished') {
      lastResults = u.results;
      setTab('results');
    }
  }

  function renderResultsTab() {
    const panel = $('#tab-results');
    const r = lastResults;
    if (!r) { panel.innerHTML = '<p class="muted">No hay resultados aún. Completá un drill primero.</p>'; return; }
    const kindClass = { penalty: 'penalty', wrong: 'penalty', timeout: 'miss', miss: 'miss', hit: '' };
    panel.innerHTML = `
      <div class="results-summary">
        <h2>Resultado del drill</h2>
        <div class="results-grid">
          <div class="result-card"><div class="result-value">${r.total}</div><div class="result-label">Puntos</div></div>
          <div class="result-card"><div class="result-value">${r.hits}/${r.rounds}</div><div class="result-label">Impactos (${r.alphas} A)</div></div>
          <div class="result-card"><div class="result-value">${r.avgTime != null ? Math.round(r.avgTime) + 'ms' : '-'}</div><div class="result-label">Reacción prom. (mejor ${r.bestTime != null ? r.bestTime + 'ms' : '-'})</div></div>
          <div class="result-card"><div class="result-value">${r.penalties + r.wrong}</div><div class="result-label">Penalidades (${r.penalties} no-disparar, ${r.wrong} equivocado)</div></div>
        </div>
        <table class="results-table">
          <thead><tr><th>#</th><th>Blanco</th><th>Zona</th><th>Pts</th><th>Tiempo</th></tr></thead>
          <tbody>${r.events.map(e => `
            <tr class="${kindClass[e.kind]}"><td>${e.round}</td><td>${e.target}</td><td>${esc(e.label)}</td><td>${e.points}</td><td>${e.time != null ? e.time + 'ms' : '-'}</td></tr>`).join('')}
          </tbody>
        </table>
        <button class="btn btn-primary btn-lg" id="againBtn">Nuevo drill</button>
      </div>`;
    $('#againBtn').onclick = () => setTab('drill');
  }

  return { init, setTab, printSelected };
})();

document.addEventListener('DOMContentLoaded', App.init);
