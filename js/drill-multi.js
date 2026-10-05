const DrillMulti = (() => {
  let config = null;
  let roundIdx = 0;
  let sequence = [];
  let drillState = 'IDLE';
  let activeTargets = [];
  let scores = [];
  let roundTimer = null;
  let onUpdateCb = null;

  function generateSequence(targets, rounds) {
    const seq = [];
    for (let i = 0; i < rounds; i++) {
      let next;
      do { next = targets[Math.floor(Math.random() * targets.length)]; }
      while (seq.length > 0 && next === seq[seq.length - 1] && targets.length > 1);
      seq.push(next);
    }
    return seq;
  }

  function start(cfg, onUpdate) {
    config = { ...DRILL_DEFAULTS, ...cfg };
    activeTargets = cfg.targets || [1, 2];
    onUpdateCb = onUpdate;
    sequence = generateSequence(activeTargets, config.rounds);
    scores = [];
    roundIdx = 0;
    drillState = 'READY';
    notify();
    setTimeout(() => nextRound(), 1500);
  }

  function nextRound() {
    if (roundIdx >= sequence.length) { finish(); return; }
    const targetNum = sequence[roundIdx];
    VisionMulti.setActiveTarget(targetNum);
    drillState = 'COMMAND';
    notify();
    announce(targetNum);
    setTimeout(() => {
      drillState = 'AWAIT';
      notify();
      roundTimer = setTimeout(() => {
        scores.push({ round: roundIdx + 1, target: targetNum, hit: null, zone: null, points: 0, time: null, miss: true });
        roundIdx++;
        nextRound();
      }, config.transitionTimeMs);
    }, 600);
  }

  function registerHit(zone, points, timeMs) {
    if (drillState !== 'AWAIT') return;
    if (roundTimer) { clearTimeout(roundTimer); roundTimer = null; }
    const targetNum = sequence[roundIdx];
    const info = TARGET_TYPES[targetNum];
    let finalPoints = points;
    if (info.penalty) finalPoints = -10;

    scores.push({
      round: roundIdx + 1,
      target: targetNum,
      hit: true,
      zone,
      points: finalPoints,
      time: timeMs,
      penalty: info.penalty,
    });

    drillState = 'HIT';
    notify();
    roundIdx++;
    setTimeout(() => nextRound(), 800);
  }

  function announce(targetNum) {
    if (!config.voiceEnabled || typeof speechSynthesis === 'undefined') return;
    const info = TARGET_TYPES[targetNum];
    const utterance = new SpeechSynthesisUtterance(`¡Blanco ${targetNum}!`);
    utterance.lang = config.voiceLang || 'es-AR';
    utterance.rate = 1.2;
    speechSynthesis.speak(utterance);
  }

  function finish() {
    drillState = 'FINISHED';
    VisionMulti.setActiveTarget(null);
    notify();
  }

  function abort() {
    if (roundTimer) { clearTimeout(roundTimer); roundTimer = null; }
    drillState = 'IDLE';
    VisionMulti.setActiveTarget(null);
    notify();
  }

  function getResults() {
    const total = scores.reduce((s, r) => s + (r.points || 0), 0);
    const hits = scores.filter(s => s.hit && !s.penalty).length;
    const penalties = scores.filter(s => s.penalty).length;
    const misses = scores.filter(s => s.miss).length;
    const avgTime = scores.filter(s => s.time).reduce((a, s) => a + s.time, 0) / Math.max(1, scores.filter(s => s.time).length);
    return { scores, total, hits, penalties, misses, avgTime, rounds: sequence.length };
  }

  function notify() {
    if (onUpdateCb) onUpdateCb({
      state: drillState,
      round: roundIdx + 1,
      totalRounds: sequence.length,
      activeTarget: drillState === 'AWAIT' || drillState === 'COMMAND' ? sequence[roundIdx] : null,
      scores,
      results: drillState === 'FINISHED' ? getResults() : null,
    });
  }

  return { start, registerHit, abort, getResults, get state() { return drillState; } };
})();
