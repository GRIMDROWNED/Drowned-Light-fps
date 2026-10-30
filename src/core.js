/* Drowned Light FPS — core helpers: math, deterministic noise, sound. Ported from the top-down game's src/core.js. */
export const TAU = Math.PI * 2;
export const SEED = 1937;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d < -Math.PI) d += TAU;
  return d;
}
export function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}
// Weighted pick from {key: weight}; r in [0,1).
export function weighted(table, r = Math.random()) {
  let total = 0;
  for (const k in table) total += table[k];
  let x = r * total;
  for (const k in table) {
    x -= table[k];
    if (x < 0) return k;
  }
  return Object.keys(table)[0];
}

// Deterministic hash in [0,1) so the world is the same every visit.
export function hash(x, y, s = 0) {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul((s + SEED) | 0, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}
export function noise(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export const fbm = (x, y, s = 0) =>
  noise(x, y, s) * 0.55 + noise(x * 2.1, y * 2.1, s + 7) * 0.3 + noise(x * 4.3, y * 4.3, s + 13) * 0.15;

/* ---------------- Sound (tiny WebAudio synth, no files) ---------------- */
export const Sound = {
  ctx: null,
  muted: false,
  last: {},
  init() {
    if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; }
  },
  tone(f, d = 0.1, type = "sine", v = 0.12, slide = 0, delay = 0) {
    const c = this.ctx;
    if (!c || this.muted) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f + slide), t + d);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + d + 0.05);
  },
  noise(d = 0.15, v = 0.15, freq = 1200, delay = 0) {
    const c = this.ctx;
    if (!c || this.muted) return;
    const t = c.currentTime + delay;
    const len = Math.ceil(c.sampleRate * d);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf;
    f.type = "bandpass";
    f.frequency.value = freq;
    g.gain.value = v;
    src.connect(f).connect(g).connect(c.destination);
    src.start(t);
  },
  play(name) {
    const now = performance.now();
    if (this.last[name] && now - this.last[name] < 45) return;
    this.last[name] = now;
    switch (name) {
      case "swing": this.noise(0.09, 0.1, 2600); break;
      case "hit": this.noise(0.07, 0.16, 700); this.tone(150, 0.08, "square", 0.05, -60); break;
      case "kill": this.noise(0.25, 0.12, 500); this.tone(320, 0.3, "sine", 0.05, -220); break;
      case "hurt": this.tone(200, 0.22, "sawtooth", 0.09, -110); break;
      case "pickup": this.tone(660, 0.07, "triangle", 0.08); this.tone(990, 0.1, "triangle", 0.07, 0, 0.06); break;
      case "dash": this.noise(0.18, 0.12, 900); break;
      case "ability": this.tone(330, 0.5, "triangle", 0.1, 500); this.noise(0.4, 0.08, 3000); break;
      case "build": this.tone(220, 0.12, "square", 0.06); this.tone(330, 0.15, "square", 0.06, 0, 0.1); this.tone(440, 0.25, "triangle", 0.07, 0, 0.2); break;
      case "night": this.tone(98, 2.2, "sine", 0.16); this.tone(147, 1.8, "sine", 0.07, 0, 0.05); break;
      case "dawn": [523, 659, 784].forEach((f, i) => this.tone(f, 0.6, "triangle", 0.06, 0, i * 0.15)); break;
      case "whisper": this.noise(0.8, 0.05, 400); this.tone(70, 0.9, "sine", 0.08, -20); break;
      case "death": this.tone(130, 2.2, "sawtooth", 0.08, -90); this.noise(1.6, 0.08, 300); break;
      case "arrow": this.noise(0.12, 0.07, 3500); break;
      case "bolt": this.noise(0.08, 0.12, 1800); this.tone(420, 0.06, "square", 0.04, -200); break;
      case "torch": this.noise(0.3, 0.1, 1500); this.tone(500, 0.2, "triangle", 0.04); break;
      case "flameHit": this.noise(0.2, 0.12, 400); break;
      case "chop": this.noise(0.08, 0.16, 900); this.tone(160, 0.06, "square", 0.04, -40); break;
      case "clink": this.tone(1100, 0.07, "square", 0.04, -300); this.noise(0.06, 0.12, 3200); break;
      case "chime": this.tone(1250, 0.18, "triangle", 0.06); this.tone(1870, 0.14, "sine", 0.03, 0, 0.04); break;
      case "shatter": this.noise(0.32, 0.18, 600); this.tone(170, 0.25, "triangle", 0.06, -80); break;
      case "deny": this.tone(140, 0.12, "square", 0.05); break;
      case "rise": this.noise(0.45, 0.14, 260); this.tone(85, 0.45, "sawtooth", 0.05, -30); break;
      case "step": this.noise(0.05, 0.035, 500); break;
      case "splash": this.noise(0.12, 0.05, 1400); break;
    }
  },
};
