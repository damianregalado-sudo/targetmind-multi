// Transition drill. Only shootable targets are ever called out; hitting a
// no-shoot target (or a hostage zone) is penalised whenever it happens, and
// hitting a shootable target that wasn't called is a wrong-target penalty.
const DrillMulti = (() => {
  let cfg = null, seq = [], idx = 0;
  let state = 'IDLE';
  let events = [];
  let roundStart = 0, roundTimer = null, timedOutAt = 0;
  const DETECTION_GRACE_MS = 400;
  const LATE_WINDOW_MS = 1500;
  let onUpdate = null;
  const timers = new Set();

  function later(fn, ms) {
    const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
    return id;
  }
  function clearTimers() { timers.forEach(clearTimeout); timers.clear(); roundTimer = null; }

  function generateSequence(targets, rounds) {
    const out = [];
    for (let i = 0; i < rounds; i++) {
      let next;
      do { next = targets[Math.floor(Math.random() * targets.length)]; }
      while (targets.length > 1 && next === out[out.length - 1]);
      out.push(next);
    }
    return out;
  }

  function shootableOf(targets) { return targets.filter(t => !TARGET_TYPES[t].noShoot); }

  function start(options, cb) {
    abort();
    cfg = { ...DRILL_DEFAULTS, ...options };
    const shootable = shootableOf(cfg.targets);
    if (!shootable.length) throw new Error('Elegí al menos un blanco para disparar.');
    onUpdate = cb;
    seq = generateSequence(shootable, cfg.rounds);
    idx = 0; events = [];
    state = 'READY';
    notify({ type: 'ready' });
    speak('Atención');
    later(nextRound, randDelay() + 800);
  }

  function randDelay() {
    const [a, b] = cfg.delayMs;
    return a + Math.random() * (b - a);
  }

  function nextRound() {
    if (idx >= seq.length) return finish();
    state = 'AWAIT';
    roundStart = performance.now();
    speak(`¡Blanco ${seq[idx]}!`);
    notify({ type: 'command' });
    // Shots are timed by camera capture time, but get detected a few tenths
    // later; wait that long before declaring the round lost so an in-time
    // shot isn't cut off by processing latency.
    roundTimer = later(() => {
      events.push({ round: idx + 1, target: seq[idx], kind: 'timeout', label: 'SIN IMPACTO', points: 0, time: null });
      timedOutAt = performance.now();
      endRound({ type: 'timeout' });
    }, cfg.windowMs + DETECTION_GRACE_MS);
  }

  function endRound(evt) {
    if (roundTimer) { clearTimeout(roundTimer); timers.delete(roundTimer); roundTimer = null; }
    idx++;
    state = 'BETWEEN';
    notify(evt);
    later(nextRound, randDelay());
  }

  // Returns 'early' when a scoring hit landed before the call-out, or 'late'
  // when it came just after the window closed (neither is counted).
  function registerShot(shot) {
    if (state !== 'AWAIT' && state !== 'BETWEEN' && state !== 'READY') return;
    const def = TARGET_TYPES[shot.target];
    const hit = Zones.hitTest(shot.target, shot.x, shot.y);
    const time = state === 'AWAIT' ? Math.round(shot.at - roundStart) : null;
    const base = { round: Math.min(idx + 1, seq.length), target: shot.target, x: shot.x, y: shot.y, time };

    if (def.noShoot || (hit && hit.penalty)) {
      events.push({ ...base, kind: 'penalty', label: hit ? hit.label : 'NO DISPARAR', points: PENALTY_POINTS });
      notify({ type: 'penalty' });
      return;
    }
    if (state === 'AWAIT' && time > cfg.windowMs) {
      events.push({ ...base, kind: 'late', label: 'TARDE', points: 0 });
      endRound({ type: 'late' });
      return 'late';
    }
    // a shot right after a timed-out round is a late shot, not an early one
    const last = events[events.length - 1];
    if (state === 'BETWEEN' && last && last.kind === 'timeout' && performance.now() - timedOutAt < LATE_WINDOW_MS) {
      Object.assign(last, { kind: 'late', label: 'TARDE', time: Math.round(shot.at - roundStart), x: shot.x, y: shot.y });
      notify({ type: 'late' });
      return 'late';
    }
    if (state !== 'AWAIT') return 'early';
    if (shot.target !== seq[idx]) {
      events.push({ ...base, kind: 'wrong', label: `BLANCO ${shot.target}`, points: WRONG_TARGET_POINTS });
      notify({ type: 'wrong' });
      return;
    }
    events.push({ ...base, kind: hit ? 'hit' : 'miss', label: hit ? hit.label : 'M', points: hit ? hit.points : 0 });
    endRound({ type: hit ? 'hit' : 'miss' });
  }

  function speak(text) {
    if (!cfg || !cfg.voiceEnabled || typeof speechSynthesis === 'undefined') return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = cfg.voiceLang;
    u.rate = 1.25;
    speechSynthesis.speak(u);
  }

  function finish() {
    clearTimers();
    state = 'FINISHED';
    notify({ type: 'finished', results: getResults() });
  }

  function abort() {
    clearTimers();
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    state = 'IDLE';
  }

  function getResults() {
    const hits = events.filter(e => e.kind === 'hit');
    const times = hits.map(e => e.time).filter(t => t != null);
    return {
      events: events.slice(),
      rounds: seq.length,
      total: events.reduce((s, e) => s + e.points, 0),
      hits: hits.length,
      alphas: hits.filter(e => e.points === 5).length,
      penalties: events.filter(e => e.kind === 'penalty').length,
      wrong: events.filter(e => e.kind === 'wrong').length,
      misses: events.filter(e => e.kind === 'miss' || e.kind === 'timeout' || e.kind === 'late').length,
      avgTime: times.length ? times.reduce((a, b) => a + b, 0) / times.length : null,
      bestTime: times.length ? Math.min(...times) : null,
    };
  }

  function notify(evt) {
    if (!onUpdate) return;
    onUpdate({
      ...evt,
      state,
      round: Math.min(idx + 1, seq.length),
      totalRounds: seq.length,
      activeTarget: state === 'AWAIT' ? seq[idx] : null,
      last: events[events.length - 1] || null,
    });
  }

  return { start, registerShot, abort, getResults, shootableOf, get state() { return state; } };
})();
