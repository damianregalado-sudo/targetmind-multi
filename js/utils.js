const $  = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
const rand    = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const choice  = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp   = (v, a, b) => Math.max(a, Math.min(b, v));
const nowMs   = () => performance.now();

// Full-screen color flash — used as a visual cue (green = "¡YA!"/orden de
// disparo, red = fin de sesión) on top of whatever panel is active. Fires
// on #screenFlash (see index.html / .screen-flash in css/style.css).
// `holdMs` is how long it stays fully visible before fading back out;
// pointer-events:none on the element means it never blocks a tap/shot
// underneath while it's showing.
let flashScreenTimer = null;
function flashScreen(color, holdMs = 220) {
  const el = $('#screenFlash');
  if (!el) return;
  if (flashScreenTimer) { clearTimeout(flashScreenTimer); flashScreenTimer = null; }
  el.style.background = color;
  el.classList.add('is-on');
  el.style.opacity = '0.55';
  flashScreenTimer = setTimeout(() => {
    el.classList.remove('is-on');
    el.style.opacity = '0';
    flashScreenTimer = null;
  }, holdMs);
}

const AppLog = (() => {
  const MAX = 500;
  const entries = [];
  function add(tag, msg) {
    const ts = new Date().toISOString().slice(11, 23);
    entries.push(`${ts} [${tag}] ${msg}`);
    if (entries.length > MAX) entries.splice(0, entries.length - MAX);
  }
  function header() {
    const ua = navigator.userAgent;
    const scr = `${screen.width}x${screen.height} @${devicePixelRatio}x`;
    const vp = `${innerWidth}x${innerHeight}`;
    const build = ($('#buildBadge') || {}).textContent || '?';
    return `TargetMind log — ${new Date().toISOString()}\n${build}\nUA: ${ua}\nScreen: ${scr}  Viewport: ${vp}\n${'─'.repeat(60)}`;
  }
  function dump() { return header() + '\n' + entries.join('\n'); }
  async function share() {
    const text = dump();
    if (navigator.share) {
      try {
        const blob = new Blob([text], { type: 'text/plain' });
        const file = new File([blob], 'targetmind-log.txt', { type: 'text/plain' });
        await navigator.share({ title: 'TargetMind Log', files: [file] });
        return;
      } catch (_) {}
    }
    try {
      await navigator.clipboard.writeText(text);
      alert('Diagnóstico copiado al portapapeles');
    } catch (_) {
      const w = window.open('', '_blank');
      if (w) { w.document.write('<pre>' + text.replace(/</g, '&lt;') + '</pre>'); }
    }
  }
  return { add, dump, share };
})();
