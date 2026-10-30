/* Drowned Light FPS — the knight's own hands: the lantern swinging on its chain at the left, and the kit's weapon
   at the right (blade, pike or arbalest), drawn at low resolution and scaled up so it sits with the pixel art. */
import { clamp } from "./core.js";

const VW = 480; // drawing width in "pixels"

export const ViewModel = {
  cv: null, g: null, w: VW, h: 180,
  sway: 0, swayV: 0, bob: 0, swing: 0, swingDur: 0.25, kick: 0, flash: 0, lunge: 0, kind: "arc",
  swingSide: 1,

  init(canvas) {
    this.cv = canvas;
    this.g = canvas.getContext("2d");
    this.resize();
    addEventListener("resize", () => this.resize());
  },
  resize() {
    this.w = VW;
    this.h = Math.round(VW * (innerHeight / Math.max(1, innerWidth)));
    this.cv.width = this.w;
    this.cv.height = this.h;
  },
  attack(kind, dur) { this.kind = kind; this.swing = 1; this.swingDur = dur; this.swingSide *= -1; if (kind === "bolt") this.kick = 1; },
  mine() { this.kind = this.kind === "bolt" ? "bolt" : this.kind; this.swing = 1; this.swingDur = 0.3; this.mining = true; },

  // turn = yaw change this frame (sways the lantern), moving 0..1, light 0..1 (how lit the hands are), oil 0..1
  update(dt, turn, moving, kit, light, oil, t, dashing) {
    this.kind = kit;
    this.swayV += (-turn * 40 - this.sway * 9) * dt * 6;
    this.swayV *= Math.pow(0.04, dt);
    this.sway = clamp(this.sway + this.swayV * dt, -0.9, 0.9);
    this.bob += dt * (moving ? 9 : 2);
    this.swing = Math.max(0, this.swing - dt / this.swingDur);
    if (this.swing === 0) this.mining = false;
    this.kick = Math.max(0, this.kick - dt * 5);
    this.draw(moving, light, oil, t, dashing);
  },

  draw(moving, light, oil, t, dashing) {
    const g = this.g, W = this.w, H = this.h;
    g.clearRect(0, 0, W, H);
    const bobX = Math.sin(this.bob) * (moving ? 3 : 0.8), bobY = Math.abs(Math.cos(this.bob)) * (moving ? 4 : 1);
    const dy = dashing ? 18 : 0;
    this.drawLantern(g, 70 + bobX * 0.6, H - 34 + bobY + dy, oil, t);
    if (this.kind === "arc") this.drawBlade(g, W, H, bobX, bobY + dy);
    else if (this.kind === "thrust") this.drawPike(g, W, H, bobX, bobY + dy);
    else this.drawArbalest(g, W, H, bobX, bobY + dy);
    // the hands sink into shadow away from any light
    const dark = clamp(1 - light, 0, 0.82);
    if (dark > 0.01) {
      g.globalCompositeOperation = "source-atop";
      g.fillStyle = `rgba(4,10,14,${dark})`;
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = "source-over";
    }
    // and the lantern's flame is never dark
    this.drawFlame(g, oil, t);
  },

  drawLantern(g, x, y, oil, t) {
    const a = this.sway * 0.6 + Math.sin(t * 1.7) * 0.03;
    this.lx = x; this.ly = y; this.la = a;
    g.save();
    g.translate(x, y - 60);
    g.rotate(a);
    // chain
    g.fillStyle = "#4a4238";
    for (let i = 0; i < 9; i++) g.fillRect(-1, -60 + i * 7, 2, 5);
    g.translate(0, 8);
    // ring and cap
    g.fillStyle = "#2a2622"; g.fillRect(-4, -4, 8, 4);
    g.fillStyle = "#6b5232"; g.beginPath(); g.moveTo(-13, 10); g.lineTo(13, 10); g.lineTo(7, 0); g.lineTo(-7, 0); g.fill();
    g.fillStyle = "#3b2c1c"; g.fillRect(-15, 10, 30, 4);
    // glass
    const lit = oil > 0 ? 1 : 0.25;
    const grd = g.createLinearGradient(0, 14, 0, 50);
    grd.addColorStop(0, `rgba(255,${190 * lit + 40},${110 * lit + 30},${0.65 + 0.3 * lit})`);
    grd.addColorStop(1, `rgba(${200 * lit + 40},${110 * lit + 30},40,0.9)`);
    g.fillStyle = grd; g.fillRect(-12, 14, 24, 36);
    // cage bars
    g.fillStyle = "#2f251a";
    for (const bx of [-13, -5, 4, 12]) g.fillRect(bx, 14, 2, 36);
    g.fillRect(-14, 30, 28, 2);
    // base
    g.fillStyle = "#6b5232"; g.fillRect(-15, 50, 30, 4);
    g.fillStyle = "#3b2c1c"; g.fillRect(-11, 54, 22, 4);
    g.restore();
  },
  drawFlame(g, oil, t) {
    if (oil <= 0) return;
    g.save();
    g.translate(this.lx, this.ly - 52);
    g.rotate(this.la);
    const f = 1 + Math.sin(t * 17) * 0.12 + Math.sin(t * 7.3) * 0.08;
    g.globalCompositeOperation = "lighter";
    const halo = g.createRadialGradient(0, 30, 0, 0, 30, 46 * f);
    halo.addColorStop(0, "rgba(255,190,100,0.55)");
    halo.addColorStop(1, "rgba(255,140,60,0)");
    g.fillStyle = halo;
    g.fillRect(-50, -20, 100, 100);
    g.fillStyle = "rgba(255,240,190,0.95)";
    g.beginPath(); g.ellipse(0, 33, 3 * f, 7 * f, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  },

  gauntlet(g) {
    g.fillStyle = "#3a3d42"; g.fillRect(-12, -6, 24, 30);
    g.fillStyle = "#5c6168"; g.fillRect(-12, -6, 24, 6); g.fillRect(-12, 6, 24, 3);
    g.fillStyle = "#24272b"; g.fillRect(-12, 20, 24, 4);
  },

  drawBlade(g, W, H, bx, by) {
    const s = this.swing, side = this.swingSide;
    // rest: blade held up and to the right; swinging: a sweep across the view
    const p = 1 - s;
    const swingA = s > 0 ? (side > 0 ? -0.2 - Math.sin(p * Math.PI) * 1.6 + p * 0.4 : 0.9 - p * 2.2) : 0;
    const ox = s > 0 ? Math.sin(p * Math.PI) * -60 * side : 0;
    g.save();
    g.translate(W - 70 + bx + ox, H - 28 + by + (s > 0 ? -Math.sin(p * Math.PI) * 20 : 0));
    g.rotate(-0.5 + swingA);
    // blade
    const grd = g.createLinearGradient(-6, 0, 6, 0);
    grd.addColorStop(0, "#9aa7ad"); grd.addColorStop(0.5, "#e8f0f0"); grd.addColorStop(1, "#6f7c84");
    g.fillStyle = grd;
    g.beginPath(); g.moveTo(-6, -24); g.lineTo(6, -24); g.lineTo(4, -128); g.lineTo(0, -140); g.lineTo(-4, -128); g.fill();
    g.fillStyle = "rgba(255,210,140,0.5)"; g.fillRect(-1, -128, 2, 102);
    // crossguard and grip
    g.fillStyle = "#7a5a2c"; g.fillRect(-20, -26, 40, 6);
    g.fillStyle = "#c69a52"; g.fillRect(-20, -26, 40, 2);
    g.fillStyle = "#3a2716"; g.fillRect(-4, -20, 8, 20);
    this.gauntlet(g);
    g.restore();
  },

  drawPike(g, W, H, bx, by) {
    const s = this.swing;
    const thrust = s > 0 ? Math.sin((1 - s) * Math.PI) : 0;
    g.save();
    g.translate(W - 80 + bx - thrust * 40, H - 20 + by - thrust * 26);
    g.rotate(-0.95);
    const len = 190 + thrust * 30;
    g.fillStyle = "#5b4128"; g.fillRect(-4, -len, 8, len + 20);
    g.fillStyle = "#7c5a36"; g.fillRect(-4, -len, 2, len + 20);
    g.fillStyle = "#3a3d42"; g.fillRect(-6, -len - 4, 12, 8);
    const grd = g.createLinearGradient(-8, 0, 8, 0);
    grd.addColorStop(0, "#8d999f"); grd.addColorStop(0.5, "#eef4f4"); grd.addColorStop(1, "#66737a");
    g.fillStyle = grd;
    g.beginPath(); g.moveTo(-8, -len - 4); g.lineTo(8, -len - 4); g.lineTo(0, -len - 46); g.fill();
    g.fillStyle = "rgba(255,214,140,0.55)"; g.fillRect(-1, -len - 40, 2, 34);
    g.translate(0, -40); this.gauntlet(g);
    g.restore();
  },

  drawArbalest(g, W, H, bx, by) {
    const k = this.kick;
    const cx = W / 2 + 28 + bx, cy = H - 18 + by + k * 10;
    g.save();
    g.translate(cx, cy);
    // stock
    g.fillStyle = "#4b331f";
    g.beginPath(); g.moveTo(-10, 20); g.lineTo(10, 20); g.lineTo(6, -60); g.lineTo(-6, -60); g.fill();
    g.fillStyle = "#6a4a2c"; g.fillRect(-6, -60, 3, 76);
    // the prod (limbs) and string
    const pull = this.swing > 0.6 ? 0 : 1 - this.swing / 0.6;
    g.strokeStyle = "#2b2d31"; g.lineWidth = 6;
    g.beginPath(); g.moveTo(-70, -42); g.quadraticCurveTo(0, -78, 70, -42); g.stroke();
    g.strokeStyle = "#6c737a"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-70, -44); g.quadraticCurveTo(0, -80, 70, -44); g.stroke();
    g.strokeStyle = "#c9c0a8"; g.lineWidth = 1;
    const sy = -42 + 26 * pull;
    g.beginPath(); g.moveTo(-70, -42); g.lineTo(0, sy); g.lineTo(70, -42); g.stroke();
    // the loaded bolt
    if (pull > 0.95) {
      g.fillStyle = "#8a6a44"; g.fillRect(-2, -96, 4, 80 + sy + 42 - 26);
      g.fillStyle = "#c9d2d6"; g.beginPath(); g.moveTo(-4, -96); g.lineTo(4, -96); g.lineTo(0, -108); g.fill();
      g.fillStyle = "#b8512e"; g.fillRect(-4, sy - 10, 8, 6);
    }
    g.fillStyle = "#3a3d42"; g.fillRect(-8, -64, 16, 10);
    g.translate(-4, 22); this.gauntlet(g);
    g.restore();
    if (k > 0.7) {
      g.save();
      g.globalCompositeOperation = "lighter";
      g.fillStyle = `rgba(255,170,90,${(k - 0.7) * 1.5})`;
      g.beginPath(); g.arc(cx, cy - 100, 10, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  },
};
