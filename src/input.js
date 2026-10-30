/* Drowned Light FPS — input: keyboard, mouse look under pointer lock, and an Xbox-style controller. */
export const Input = {
  keys: new Set(),
  pressed: new Set(),  // actions tapped since the last frame
  mouse: { dx: 0, dy: 0, left: false, right: false },
  locked: false,
  sens: 1,
  invertY: false,
  pad: { x: 0, y: 0, lx: 0, ly: 0, attack: false, mine: false, active: false },
  padPrev: [],

  BINDS: {
    KeyW: "fwd", ArrowUp: "fwd", KeyS: "back", ArrowDown: "back", KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right",
    Space: "dash", ShiftLeft: "dash", ShiftRight: "dash", KeyE: "ability", KeyQ: "ability", KeyF: "torch", KeyT: "torch",
    KeyC: "camp", Escape: "pause", KeyP: "pause", KeyG: "mine", KeyJ: "attack", KeyK: "attack", KeyM: "mute", KeyV: "view",
  },

  init(canvas) {
    addEventListener("keydown", (e) => {
      const a = this.BINDS[e.code];
      if (!a) return;
      if (a !== "pause") e.preventDefault();
      if (!e.repeat) this.pressed.add(a);
      this.keys.add(a);
    });
    addEventListener("keyup", (e) => { const a = this.BINDS[e.code]; if (a) this.keys.delete(a); });
    addEventListener("blur", () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; });
    canvas.addEventListener("mousedown", (e) => {
      if (!this.locked) return;
      if (e.button === 0) { this.mouse.left = true; this.pressed.add("attack"); }
      if (e.button === 2) { this.mouse.right = true; this.pressed.add("mine"); }
    });
    addEventListener("mouseup", (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    addEventListener("mousemove", (e) => {
      if (!this.locked) return;
      this.mouse.dx += e.movementX || 0;
      this.mouse.dy += e.movementY || 0;
    });
    document.addEventListener("pointerlockchange", () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (was && !this.locked && this.onUnlock) this.onUnlock();
    });
    this.canvas = canvas;
  },
  lock() {
    if (this.locked) return;
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { this.canvas.requestPointerLock(); } catch (e) { /* ignore */ } });
    } catch (e) { try { this.canvas.requestPointerLock(); } catch (e2) { /* ignore */ } }
  },
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); },

  take(a) { if (this.pressed.has(a)) { this.pressed.delete(a); return true; } return false; },
  held(a) { return this.keys.has(a); },
  clear() { this.pressed.clear(); this.mouse.dx = this.mouse.dy = 0; },

  // Movement axis in the knight's frame: x = strafe right, y = forward.
  axis() {
    let x = 0, y = 0;
    if (this.held("fwd")) y += 1;
    if (this.held("back")) y -= 1;
    if (this.held("right")) x += 1;
    if (this.held("left")) x -= 1;
    if (this.pad.active && (Math.abs(this.pad.x) > 0.01 || Math.abs(this.pad.y) > 0.01)) { x = this.pad.x; y = this.pad.y; }
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    return { x, y, m: Math.min(1, m) };
  },
  attackHeld() { return this.mouse.left || this.held("attack") || this.pad.attack; },
  mineHeld() { return this.mouse.right || this.held("mine") || this.pad.mine; },

  // Look delta in radians since the last frame (mouse and right stick).
  look(dt) {
    const k = 0.0022 * this.sens;
    let yaw = -this.mouse.dx * k, pitch = -this.mouse.dy * k * (this.invertY ? -1 : 1);
    this.mouse.dx = this.mouse.dy = 0;
    if (this.pad.active) {
      const curve = (v) => Math.sign(v) * v * v;
      yaw -= curve(this.pad.lx) * 2.8 * this.sens * dt;
      pitch -= curve(this.pad.ly) * 1.9 * this.sens * dt * (this.invertY ? -1 : 1);
    }
    return { yaw, pitch };
  },

  pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads) if (p && p.connected) { gp = p; break; }
    if (!gp) { this.pad.active = false; return; }
    const dz = (v) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
    const ax = gp.axes;
    this.pad.x = dz(ax[0] || 0); this.pad.y = -dz(ax[1] || 0);
    this.pad.lx = dz(ax[2] || 0); this.pad.ly = dz(ax[3] || 0);
    const b = (i) => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.4));
    const now = gp.buttons.map((_, i) => b(i));
    const tap = (i, a) => { if (now[i] && !this.padPrev[i]) this.pressed.add(a); };
    tap(0, "dash"); tap(1, "ability"); tap(2, "ability"); tap(4, "torch"); tap(3, "camp"); tap(9, "pause"); tap(8, "pause");
    tap(7, "attack"); tap(6, "mine"); tap(5, "ability"); tap(10, "view"); tap(11, "view");
    this.pad.attack = now[7]; this.pad.mine = now[6];
    if (now.some((x) => x) || this.pad.x || this.pad.y || this.pad.lx || this.pad.ly) this.pad.active = true;
    this.padPrev = now;
    this.padButtons = now;
  },
};
