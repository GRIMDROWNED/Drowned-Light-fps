/* Drowned Light FPS — the game itself: day and night, light and corruption, the knight's hands, the Drowned,
   the camp and its upgrades. The rules follow the top-down game (src/game.js there), seen from behind the visor. */
import * as THREE from "../vendor/three.module.min.js";
import { TAU, clamp, lerp, dist, rand, angleDiff, weighted, Sound } from "./core.js";
import {
  CYCLE, EYE, PLAYER_R, CAMP_RADIUS, ZONES, OBJ, ENEMIES, KITS, DIFFICULTIES, UPGRADES, RES_KEYS, RESOURCES,
  FLAME_NIGHTS, TORCH_COST, GARDEN_YIELD, campPool,
} from "./data.js";
import { World, WATER_LEVEL, sq } from "./world.js";
import { Camp } from "./camp.js";
import { billboard, setSprite, glowCard, fireCard, setFire } from "./assets.js";
import { Input } from "./input.js";
import { ViewModel } from "./viewmodel.js";

const SAVE_KEY = "drowned-light-fps-save";
const SOVEREIGN_SIEGE_DAY = 10, SOVEREIGN_ROAM_DAY = 7;
const LIGHT_POOL = 10;
const sfx = (n) => Sound.play(n);

export const G = {
  state: "title", time: 0, night: false, nightAmt: 0, t: 0,
  enemies: [], projectiles: [], pickups: [], torches: [], effects: [], sanctuaries: [], flares: [],
  lights: [], toasts: [], eid: 0,
  shake: 0, hurtFlash: 0, aim: null, aimEnemy: null,
};

/* ---------------- saves ---------------- */
G.defaultSave = () => ({
  v: 1, started: false, kit: "lanternBlade", difficulty: "dark", day: 1, nights: 0, time: 0,
  stash: Object.fromEntries(RES_KEYS.map((k) => [k, 0])),
  carried: Object.fromEntries(RES_KEYS.map((k) => [k, 0])),
  up: { flame: 1, forge: 0, armory: 0, workbench: 0, garden: 0 },
  torches: 2, self: null, deepest: 1, sens: 1, invertY: false, muted: false, view: "third",
});
G.load = function () {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && s.v === 1) {
      const d = G.defaultSave();
      return Object.assign(d, s, { stash: Object.assign(d.stash, s.stash), carried: Object.assign(d.carried, s.carried), up: Object.assign(d.up, s.up) });
    }
  } catch (e) { /* a broken save starts fresh */ }
  return G.defaultSave();
};
G.persist = function () {
  if (G.player) G.save.carried = { ...G.player.carried };
  G.save.time = G.time;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(G.save)); } catch (e) { /* storage full or blocked */ }
};

G.stats = function () {
  const u = G.save.up, D = G.diff();
  return {
    maxHp: 100 + 25 * u.armory,
    maxOil: 60 + 25 * u.workbench,
    lanternR: (70 + 14 * u.workbench) * D.light,
    dmgMult: 1 + 0.2 * u.forge,
    flameR: (180 + 40 * u.flame) * D.light,
    flameHp: 150 + 100 * u.flame,
    torchMax: 3 + u.workbench,
    torchDur: 50 + 15 * u.workbench,
  };
};
G.kit = () => KITS[G.save.kit] || KITS.lanternBlade;
G.diff = () => DIFFICULTIES[G.save.difficulty] || DIFFICULTIES.dark;
G.stage = (c) => (c < 25 ? 1 : c < 50 ? 2 : c < 75 ? 3 : 4);
G.siegeRadius = () => G.stats().flameR + 90;

/* ---------------- toasts ---------------- */
function say(text, kind = "") { G.toasts.push({ text, kind, t: 0 }); }
G.say = say;

/* ---------------- cycle ---------------- */
G.phase = function () {
  const t = G.time;
  if (t < CYCLE.day) return "day";
  if (t < CYCLE.day + CYCLE.dusk) return "dusk";
  if (t < CYCLE.day + CYCLE.dusk + CYCLE.night) return "night";
  return "dawn";
};
function nightAmount(t) {
  const a = CYCLE.day, b = a + CYCLE.dusk, c = b + CYCLE.night;
  if (t < a) return 0;
  if (t < b) return (t - a) / CYCLE.dusk;
  if (t < c) return 1;
  return 1 - (t - c) / CYCLE.dawn;
}
G.timeToNight = () => Math.max(0, CYCLE.day + CYCLE.dusk * 0.5 - G.time);
G.timeToDawn = () => Math.max(0, CYCLE.day + CYCLE.dusk + CYCLE.night + CYCLE.dawn * 0.5 - G.time);

/* ---------------- scene ---------------- */
G.setup = function (renderer, scene, camera) {
  G.renderer = renderer; G.scene = scene; G.camera = camera;
  World.init(scene);
  World.getDiff = () => G.diff();
  G.ambient = new THREE.AmbientLight(0xffffff, 1);
  G.sun = new THREE.DirectionalLight(0xfff0d0, 1);
  G.sun.position.set(-0.6, 1, 0.35);
  G.hemi = new THREE.HemisphereLight(0xbfd6d0, 0x2a2a1a, 0.5);
  scene.add(G.ambient, G.sun, G.hemi);
  scene.fog = new THREE.Fog(0x000000, 100, 1000);
  scene.background = new THREE.Color(0x000000);
  // a fixed pool of point lights handed to the nearest fires and blooms each frame (a fixed count keeps the shaders steady)
  G.pool = [];
  for (let i = 0; i < LIGHT_POOL; i++) {
    const l = new THREE.PointLight(0xffffff, 0, 100, 0);
    scene.add(l);
    G.pool.push(l);
  }
  G.lantern = new THREE.PointLight(0xffb060, 1, 300, 0);
  scene.add(G.lantern);
  G.save = G.load();
  Sound.muted = G.save.muted;
  Input.sens = G.save.sens;
  Input.invertY = G.save.invertY;
  G.time = CYCLE.day + CYCLE.dusk + 20; // the title screen shows the camp at night
  G.startLife(true);
};

G.newGame = function (kit, difficulty) {
  const keep = { sens: G.save.sens, invertY: G.save.invertY, muted: G.save.muted, view: G.save.view };
  G.save = Object.assign(G.defaultSave(), keep);
  G.save.kit = kit;
  G.save.difficulty = difficulty;
  G.save.started = true;
  World.mined.clear();
  for (const c of [...World.chunks.values()]) World.unload(c); // the land is regrown for the new difficulty
  G.time = 0;
  G.startLife(true);
  G.persist();
  setTimeout(() => say("Gather supplies by day. Return to the fire before nightfall."), 900);
  setTimeout(() => say("Deeper lands hold richer supplies — and deadlier Drowned."), 5200);
};
G.continueGame = function () {
  G.time = G.save.time || 0;
  G.startLife(true);
  for (const k of RES_KEYS) G.player.carried[k] = G.save.carried[k] || 0;
};

G.startLife = function (fresh) {
  const st = G.stats();
  const prevYaw = G.player ? G.player.yaw : 0;
  G.player = {
    x: 0, y: 170, yaw: fresh ? 0 : prevYaw, pitch: 0, vx: 0, vy: 0, kx: 0, ky: 0,
    hp: st.maxHp, corrupt: 0, oil: st.maxOil, stage: 1, protect: null, exposed: false,
    carried: Object.fromEntries(RES_KEYS.map((k) => [k, 0])),
    atkCd: 0, dashCd: 0, dashT: 0, dashDir: [0, 0], dashHit: new Set(), abiCd: 0, inv: 1.5, still: 0,
    bob: 0, stepT: 0, zi: 0, dead: false, face: fresh ? -Math.PI / 2 : prevYaw, animT: 0, swingT: 0, hurtT: 0,
  };
  if (!G.knight) { G.knight = billboard("lantern-knight/back", 1); G.scene.add(G.knight); }
  if (fresh) {
    for (const e of G.enemies) removeEnemy(e);
    G.enemies = [];
    for (const p of G.projectiles) G.scene.remove(p.mesh);
    for (const p of G.pickups) G.scene.remove(p.mesh);
    for (const t of G.torches) removeTorch(t);
    G.projectiles = []; G.pickups = []; G.torches = []; G.sanctuaries = []; G.flares = [];
    G.selfEnemy = null; G.champSpawned = false;
    G.flame = { x: 0, y: 0, hp: st.flameHp, lit: true, kind: "flame" };
    G.siegeT = 6; G.spawnT = 4;
    G.lastPhase = G.phase();
    if (G.save.self) spawnSelf(G.save.self);
  }
  Camp.build(G.scene, G.save.up, (x, y) => World.height(x, y));
  World.refreshCamp(Camp.tierNow);
};

/* ---------------- main update ---------------- */
G.update = function (dt) {
  G.t += dt;
  const p = G.player;
  const playing = G.state === "play";
  if (G.state === "title") {
    // the title screen: a slow turn round the fire at night
    p.yaw += dt * 0.08;
    p.x = Math.sin(p.yaw) * 170; p.y = Math.cos(p.yaw) * 170;
    p.pitch = -0.08;
  }
  if (playing || G.state === "camp" || G.state === "dead") {
    G.time += dt;
    if (G.time >= CYCLE.total) { G.time -= CYCLE.total; dawnBreaks(); }
  }
  const phase = G.phase();
  if (phase !== G.lastPhase) {
    if (phase === "night" && playing) { sfx("night"); say("Night falls. The Drowned rise — stay in the light.", "danger"); }
    if (phase === "dusk" && playing) say("Dusk. Make for the fire, or a grove of blooms.", "warn");
    G.lastPhase = phase;
  }
  G.nightAmt = nightAmount(G.time);
  G.night = G.nightAmt > 0.5;
  World.setNight(G.nightAmt > 0.35);

  if (playing) {
    updatePlayer(dt);
    updateCorruption(dt);
    updateSpawning(dt);
  } else if (G.state === "dead") {
    p.deadT = (p.deadT || 0) + dt;
  }
  if (G.state !== "pause") {
    updateEnemies(dt);
    updateProjectiles(dt);
    updatePickups(dt);
    updateTorches(dt);
    updateEffects(dt);
  }
  World.update(p.x, p.y, dt);
  updateLights(dt);
  render(dt);
};

/* ---------------- dawn ---------------- */
function dawnBreaks() {
  const s = G.save;
  s.day += 1;
  if (G.state !== "dead") s.nights += 1;
  sfx("dawn");
  World.dawn();
  const st = G.stats();
  G.flame.lit = true;
  G.flame.hp = st.flameHp;
  G.champSpawned = false;
  say(`Dawn of day ${s.day}. The light returns, and the marsh grows back.`, "good");
  if (s.up.garden) {
    s.stash.resin += GARDEN_YIELD[s.up.garden];
    say(`The Cultivation Plot yields ${GARDEN_YIELD[s.up.garden]} Bloom Resin.`, "good");
  }
  // the Drowned burn away in the sun, save in the Abyss
  for (const e of G.enemies) if (e.type !== "self" && !ZONES[World.zoneIndex(e.x, e.y)].abyss) e.burning = 1.5;
  G.persist();
}

/* ---------------- player ---------------- */
function forward(yaw) { return [-Math.sin(yaw), -Math.cos(yaw)]; }
G.forward = forward;

function updatePlayer(dt) {
  const p = G.player, st = G.stats(), kit = G.kit();
  const look = Input.look(dt);
  const prevYaw = p.yaw;
  p.yaw += look.yaw;
  p.pitch = clamp(p.pitch + look.pitch, -1.35, 1.35);
  p.turn = angleDiff(prevYaw, p.yaw) / Math.max(dt, 1e-3);
  p.atkCd = Math.max(0, p.atkCd - dt);
  p.dashCd = Math.max(0, p.dashCd - dt);
  p.abiCd = Math.max(0, p.abiCd - dt);
  p.inv = Math.max(0, p.inv - dt);
  p.swingT = Math.max(0, p.swingT - dt);
  p.hurtT = Math.max(0, p.hurtT - dt);
  p.animT += dt;
  if (Input.take("view")) G.toggleView();

  const zi = World.zoneIndex(p.x, p.y);
  p.zi = zi;
  if (zi > G.save.deepest) {
    G.save.deepest = zi;
    say(`You enter ${ZONES[zi].name}. Richer supplies — and deadlier Drowned.`, "warn");
  }

  // movement in the frame of the view
  const inp = Input.axis();
  const [fx, fy] = forward(p.yaw);
  const rx = -fy, ry = fx; // right-hand vector
  let mx = fx * inp.y + rx * inp.x, my = fy * inp.y + ry * inp.x;
  const depth = World.depth(p.x, p.y);
  const wet = depth > 10 ? 0.62 : depth > 1 ? 0.82 : 1;
  const spd = 150 * wet * (p.corrupt >= 75 ? 0.9 : 1);
  p.moving = inp.m > 0.05;
  p.still = p.moving ? 0 : p.still + dt;

  if (Input.take("dash")) tryDash(mx, my);
  if (Input.take("ability")) useAbility();
  if (Input.take("torch")) placeTorch();

  let vx = mx * spd, vy = my * spd;
  if (p.dashT > 0) {
    p.dashT -= dt;
    vx = p.dashDir[0] * 560; vy = p.dashDir[1] * 560;
    if (kit.dash.type === "strike") for (const e of G.enemies) {
      if (e.dying || p.dashHit.has(e)) continue;
      if (dist(p.x, p.y, e.x, e.y) < e.def.radius + 34) {
        p.dashHit.add(e);
        hitEnemy(e, kit.dash.dmg * st.dmgMult, Math.atan2(e.y - p.y, e.x - p.x), 220);
      }
    }
  }
  p.kx *= Math.pow(0.002, dt); p.ky *= Math.pow(0.002, dt);
  moveBody(p, (vx + p.kx) * dt, (vy + p.ky) * dt, PLAYER_R);
  // the knight turns to where he walks, and to where you aim when he strikes
  const want = p.swingT > 0 || Input.attackHeld() ? Math.atan2(fy, fx) : p.dashT > 0 ? Math.atan2(p.dashDir[1], p.dashDir[0]) : p.moving ? Math.atan2(my, mx) : null;
  if (want !== null) p.face += angleDiff(p.face, want) * Math.min(1, dt * 14);

  // footsteps and head bob
  if (p.moving) {
    p.bob += dt * 9 * wet;
    p.stepT -= dt * wet;
    if (p.stepT <= 0) { p.stepT = 0.42; sfx(depth > 1 ? "splash" : "step"); }
  }

  // attacking and mining
  updateAim();
  const wantAttack = Input.take("attack") || Input.attackHeld();
  const wantMine = Input.take("mine") || Input.mineHeld();
  if (p.atkCd <= 0) {
    if (wantMine && G.aim) mineNode(G.aim);
    else if (wantAttack) attack();
    else if (wantMine) { p.atkCd = 0.3; ViewModel.attack(kit.attack.type, 0.25); sfx("swing"); }
  }

  // the camp: supplies are stored when you reach it
  p.atCamp = sq(p.x, p.y) < CAMP_RADIUS;
  if (p.atCamp) {
    let any = false;
    for (const k of RES_KEYS) if (p.carried[k] > 0) { G.save.stash[k] += p.carried[k]; p.carried[k] = 0; any = true; }
    if (any) { sfx("chime"); say("Supplies stored at camp.", "good"); G.persist(); }
    if (Input.take("camp")) G.openCamp();
  } else Input.take("camp");
}

// Slide a body along whatever stands in its way: trees, rocks, the camp's tents and forge.
function moveBody(b, dx, dy, r) {
  b.x += dx; b.y += dy;
  for (const o of World.objectsNear(b.x, b.y, 60)) {
    if (!o.solid) continue;
    const m = o.solid + r, ox = b.x - o.x, oy = b.y - o.y, d = Math.hypot(ox, oy);
    if (d < m && d > 0.01) { b.x = o.x + (ox / d) * m; b.y = o.y + (oy / d) * m; }
  }
  if (sq(b.x, b.y) < 260) for (const s of Camp.solids) {
    const m = s.r + r, ox = b.x - s.x, oy = b.y - s.y, d = Math.hypot(ox, oy);
    if (d < m && d > 0.01) { b.x = s.x + (ox / d) * m; b.y = s.y + (oy / d) * m; }
  }
}

function tryDash(mx, my) {
  const p = G.player;
  if (p.dashCd > 0 || p.dashT > 0) return;
  let [dx, dy] = Math.hypot(mx, my) > 0.1 ? [mx, my] : forward(p.yaw);
  const m = Math.hypot(dx, dy);
  p.dashDir = [dx / m, dy / m];
  p.dashT = 0.18;
  p.dashCd = 1.1;
  p.inv = Math.max(p.inv, 0.25);
  p.dashHit = new Set();
  sfx("dash");
}

// What the crosshair rests on: a node in reach to mine, and the Drowned in front of you.
function updateAim() {
  const p = G.player;
  const [fx, fy] = forward(p.yaw);
  let best = null, bs = 1e9;
  for (const o of World.objectsNear(p.x, p.y, 140)) {
    if (o.dead || !o.def.hits) continue;
    const dx = o.x - p.x, dy = o.y - p.y, d = Math.hypot(dx, dy);
    if (d > 120 + (o.solid || 0)) continue;
    const a = Math.abs(angleDiff(Math.atan2(fy, fx), Math.atan2(dy, dx)));
    if (a > 0.32 + 12 / Math.max(d, 1)) continue;
    const score = a * 120 + d;
    if (score < bs) { bs = score; best = o; }
  }
  G.aim = best;
  let ae = null, ab = 1e9;
  for (const e of G.enemies) {
    if (e.dying || e.rise > 0) continue;
    const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
    if (d > 900) continue;
    const a = Math.abs(angleDiff(Math.atan2(fy, fx), Math.atan2(dy, dx)));
    if (a > Math.atan2(e.def.radius + 8, d) + 0.03) continue;
    if (d < ab) { ab = d; ae = e; }
  }
  G.aimEnemy = ae;
}

function attack() {
  const p = G.player, kit = G.kit(), A = kit.attack, st = G.stats();
  p.atkCd = A.cd;
  p.swingT = 0.3;
  const [fx, fy] = forward(p.yaw);
  const fa = Math.atan2(fy, fx);
  let mult = st.dmgMult;
  if (kit.passive && kit.passive.stance && p.still >= kit.passive.stance.after) mult *= kit.passive.stance.dmg;
  if (A.type === "bolt") {
    ViewModel.attack("bolt", A.cd);
    sfx("bolt");
    fireBolt(fa, p.pitch, A.dmg * mult, A.pierce, false);
    return;
  }
  ViewModel.attack(A.type, A.type === "thrust" ? 0.3 : 0.25);
  sfx("swing");
  let hit = 0;
  for (const e of G.enemies) {
    if (e.dying || e.rise > 0.3) continue;
    const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
    if (A.type === "arc") {
      if (d > A.range + e.def.radius) continue;
      if (Math.abs(angleDiff(fa, Math.atan2(dy, dx))) > A.arc / 2 && d > e.def.radius + 10) continue;
    } else {
      // thrust: everything along a line
      const along = dx * fx + dy * fy, across = Math.abs(-dx * fy + dy * fx);
      if (along < -10 || along > A.range + e.def.radius || across > A.width / 2 + e.def.radius) continue;
    }
    hitEnemy(e, A.dmg * mult, Math.atan2(dy, dx), A.kb);
    hit++;
  }
  if (hit) { sfx("hit"); G.shake = Math.max(G.shake, 0.12); }
  else if (G.aim && A.type !== "bolt") mineNode(G.aim, true);
}

function mineNode(o, fromSwing) {
  const p = G.player, def = o.def;
  if (!fromSwing) {
    p.atkCd = 0.38;
    p.swingT = 0.3;
    ViewModel.attack(G.kit().attack.type === "bolt" ? "bolt" : G.kit().attack.type, 0.28);
  }
  o.hits += 1;
  o.shake = 0.18;
  sfx(o.type === "tree" || o.type === "sprout" ? "chop" : "clink");
  spark(o.x, o.h + 30, o.y, o.type === "pearl" ? 0xbfa8ff : o.type === "tree" ? 0xa07a52 : 0xd0d0c0, 6);
  if (o.hits >= def.hits) {
    // shattered: the supplies spill out and fly to you
    sfx("shatter");
    const Z = ZONES[Math.max(1, o.zi)];
    let n = def.base * Z.yield * G.diff().yield * rand(0.8, 1.25);
    n = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
    if (def.res === "pearl" || def.res === "black") n = Math.max(def.res === "black" ? 0 : 1, n);
    for (let i = 0; i < n; i++) dropPickup(def.res, o.x + rand(-20, 20), o.y + rand(-20, 20));
    World.mined.add(o.id);
    World.fell(o);
    World.refreshMesh(o);
    G.aim = null;
  } else if (def.stageCount && o.type !== "sprout") {
    const last = o.type === "tree" ? 3 : def.stageCount;
    o.stage = 1 + Math.floor((o.hits / def.hits) * last);
    o.stage = Math.min(o.stage, last);
    World.refreshMesh(o);
  }
}

/* ---------------- abilities ---------------- */
function useAbility() {
  const p = G.player, kit = G.kit(), ab = kit.ability, st = G.stats();
  if (p.abiCd > 0) { sfx("deny"); return; }
  if (p.oil < ab.oil) { say("Not enough lantern oil.", "warn"); sfx("deny"); return; }
  p.oil -= ab.oil;
  p.abiCd = ab.cd;
  sfx("ability");
  const [fx, fy] = forward(p.yaw);
  if (ab.id === "illuminate") {
    for (const e of G.enemies) {
      const d = dist(p.x, p.y, e.x, e.y);
      if (d < ab.radius && !e.dying) { hitEnemy(e, ab.dmg * st.dmgMult, Math.atan2(e.y - p.y, e.x - p.x), 320); e.burn = 3; }
    }
    G.sanctuaries.push({ x: p.x, y: p.y, r: ab.radius, t: ab.dur, max: ab.dur });
    ring(p.x, p.y, ab.radius, 0xffc56a);
    say("Illuminate!", "good");
  } else if (ab.id === "sweep") {
    for (const e of G.enemies) {
      const d = dist(p.x, p.y, e.x, e.y);
      if (d < ab.radius + e.def.radius && !e.dying) hitEnemy(e, ab.dmg * st.dmgMult, Math.atan2(e.y - p.y, e.x - p.x), 460);
    }
    for (const pr of G.projectiles) if (pr.hostile && dist(p.x, p.y, pr.x, pr.y) < ab.radius + 40) pr.life = 0;
    ring(p.x, p.y, ab.radius, 0xffd68c);
    ViewModel.attack("thrust", 0.4);
  } else if (ab.id === "scatter") {
    const fa = Math.atan2(fy, fx);
    for (let i = 0; i < ab.count; i++) fireBolt(fa + (i - (ab.count - 1) / 2) * 0.12, p.pitch, ab.dmg * st.dmgMult, 1, true);
    ViewModel.attack("bolt", 0.5);
  }
}

function placeTorch() {
  const p = G.player, st = G.stats();
  if (G.save.torches <= 0) { say("No torches left. Craft more at camp.", "warn"); sfx("deny"); return; }
  G.save.torches -= 1;
  const [fx, fy] = forward(p.yaw);
  const x = p.x + fx * 40, y = p.y + fy * 40;
  const h = World.height(x, y);
  const t = { type: "torch", x, y, h, t: st.torchDur, max: st.torchDur, r: 125 * G.diff().light, hp: 40, rad: 8 };
  t.stick = billboard("torch", 1.5);
  t.stick.position.set(x, h - 2, y);
  t.fire = fireCard("fire1", 0.55);
  t.fire.position.set(x, h + 62, y);
  t.glow = glowCard(0xff9a40, 110, 0.5);
  t.glow.position.set(x, h + 76, y);
  G.scene.add(t.stick, t.fire, t.glow);
  G.torches.push(t);
  sfx("torch");
}
function removeTorch(t) { G.scene.remove(t.stick, t.fire, t.glow); }
function updateTorches(dt) {
  for (const t of G.torches) {
    t.t -= dt;
    const fade = clamp(t.t / 6, 0, 1);
    t.glow.material.opacity = 0.45 * fade + Math.sin(G.t * 13 + t.x) * 0.04;
    setFire(t.fire, "fire" + (1 + (Math.floor(G.t * 10 + Math.abs(t.x)) % 6)), 0.55 * (0.4 + 0.6 * fade));
  }
  const gone = G.torches.filter((t) => t.t <= 0 || t.hp <= 0);
  for (const t of gone) removeTorch(t);
  if (gone.length) G.torches = G.torches.filter((t) => !gone.includes(t));
  for (const s of G.sanctuaries) s.t -= dt;
  G.sanctuaries = G.sanctuaries.filter((s) => s.t > 0);
  for (const f of G.flares) f.t -= dt;
  G.flares = G.flares.filter((f) => f.t > 0);
}

/* ---------------- light and corruption ---------------- */
function gatherLights() {
  const L = [];
  const st = G.stats();
  if (G.flame.lit) L.push({ x: 0, y: 0, h: World.height(0, 0) + 60, r: st.flameR, kind: "human", col: 0xffa050, i: 2.6, flicker: 1 });
  for (const t of G.torches) L.push({ x: t.x, y: t.y, h: t.h + 70, r: t.r * clamp(t.t / 6, 0.2, 1), kind: "human", col: 0xff9a48, i: 2.2, flicker: 1 });
  for (const s of G.sanctuaries) L.push({ x: s.x, y: s.y, h: World.height(s.x, s.y) + 50, r: s.r, kind: "human", col: 0xffd080, i: 2.4 * clamp(s.t, 0, 1) });
  if (G.nightAmt > 0.35) for (const o of World.allObjects()) {
    if (!o.def.bloom || o.dead) continue;
    L.push({ x: o.x, y: o.y, h: o.h + 60, r: o.def.light * G.diff().light, kind: "bloom", col: 0x50e0ea, i: 1.6, obj: o });
  }
  for (const f of G.flares) L.push({ x: f.x, y: f.y, h: f.h, r: 150, kind: null, col: 0xffb070, i: 2 * clamp(f.t, 0, 1) });
  for (const pr of G.projectiles) if (pr.kind === "orb") L.push({ x: pr.x, y: pr.y, h: pr.z, r: 70, kind: null, col: 0x50e0f0, i: 1.4 });
  for (const o of World.allObjects()) if (o.type === "pearl" && !o.dead) L.push({ x: o.x, y: o.y, h: o.h + 30, r: 70, kind: null, col: 0xa070ff, i: 0.9 * G.nightAmt });
  G.lights = L;
}
G.protectionAt = function (x, y) {
  let best = null;
  for (const l of G.lights) {
    if (!l.kind) continue;
    if (dist(x, y, l.x, l.y) < l.r * 0.82) {
      if (l.kind === "human") return "human";
      best = "bloom";
    }
  }
  return best;
};
function humanLightAt(x, y) {
  for (const l of G.lights) if (l.kind === "human" && dist(x, y, l.x, l.y) < l.r * 0.82) return true;
  return false;
}
function bloomShelter(x, y) {
  for (const l of G.lights) if (l.kind === "bloom" && dist(x, y, l.x, l.y) < l.r * 0.82) return l.obj;
  return null;
}

function updateCorruption(dt) {
  const p = G.player, st = G.stats(), Z = ZONES[p.zi];
  const prot = G.protectionAt(p.x, p.y);
  p.protect = prot;
  const D = G.diff();
  const darkness = G.night ? 1 : Z.abyss ? 0.45 : D.dayCorrupt && p.zi >= 2 ? 0.35 : 0;
  p.exposed = false;
  if (prot === "human") {
    p.corrupt -= 10 * dt;
    p.oil = Math.min(st.maxOil, p.oil + 14 * dt);
    p.hp = Math.min(st.maxHp, p.hp + 3 * dt);
  } else if (prot === "bloom") {
    p.hp = Math.min(st.maxHp, p.hp + 0.6 * dt);
  } else if (darkness > 0) {
    let rate = 2.3 * Z.corrupt * darkness * D.corrupt;
    if (p.oil > 0) { rate *= 0.5; p.oil = Math.max(0, p.oil - 1.1 * dt); }
    p.corrupt += rate * dt;
    p.exposed = true;
  } else {
    p.corrupt -= 0.7 * dt;
  }
  p.corrupt = clamp(p.corrupt, 0, 100);
  const stage = G.stage(p.corrupt);
  if (stage > p.stage) {
    sfx("whisper");
    say(["", "", "The darkness seeps into your armour…", "You are near drowning. Find light!", "The deep is calling you home. FIND LIGHT NOW."][stage], "danger");
  }
  p.stage = stage;
  if (p.corrupt >= 100) die("corruption");
}

/* ---------------- the Drowned ---------------- */
function pickType(pool) {
  const t = weighted(pool);
  return t === "champion" && G.save.day < SOVEREIGN_ROAM_DAY ? "blackguard" : t;
}

function updateSpawning(dt) {
  const p = G.player;
  const Z = ZONES[Math.max(1, p.zi)], dCamp = Math.hypot(p.x, p.y);
  const active = G.night || (Z.abyss && G.nightAmt < 0.5);
  if (!active) return;
  const cap = G.night ? 40 : 12;
  if (G.enemies.length >= cap) return;

  // Siege: the Drowned come for the Central Flame.
  if (G.night && dCamp < G.siegeRadius() + 150) {
    G.siegeT -= dt;
    if (G.siegeT <= 0) {
      G.siegeT = 11;
      const n = Math.round((3 + Math.floor(G.save.day * 1.3)) * G.diff().spawn);
      const base = rand(0, TAU);
      for (let i = 0; i < n; i++) {
        const a = base + rand(-0.9, 0.9), r = 540 + rand(0, 80);
        G.enemies.push(makeEnemy(pickType(campPool(G.save.day)), Math.cos(a) * r, Math.sin(a) * r, 1, { goal: G.flame }));
      }
      const dirs = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"];
      say(`The Drowned march on the fire from the ${dirs[Math.round(((base % TAU) + TAU) % TAU / (TAU / 8)) % 8]}!`, "danger");
      if (G.save.day >= SOVEREIGN_SIEGE_DAY && !G.champSpawned && G.phase() === "night") {
        G.champSpawned = true;
        const a = rand(0, TAU);
        G.enemies.push(makeEnemy("champion", Math.cos(a) * 560, Math.sin(a) * 560, 2, { goal: G.flame }));
        say("The Drowned Sovereign marches on your camp!", "danger");
      }
    }
    return;
  }
  G.spawnT -= dt;
  if (G.spawnT > 0) return;
  G.spawnT = Math.max(0.8, (G.night ? 3.2 : 6.5) - p.zi * 0.35 - G.save.day * 0.06) / G.diff().spawn;
  const shelter = bloomShelter(p.x, p.y);
  const type = pickType(Z.pool);
  const count = type === "revenant" ? 4 + ((Math.random() * 3) | 0) : type === "squire" ? 2 + ((Math.random() * 2) | 0) : 1;
  let x, y;
  for (let tries = 0; tries < 6; tries++) {
    // they come out of the dark: behind you more often than not
    const back = Math.atan2(-forward(p.yaw)[1], -forward(p.yaw)[0]);
    const a = Math.random() < 0.6 ? back + rand(-1.2, 1.2) : rand(0, TAU);
    const r = type === "revenant" ? rand(200, 320) : rand(460, 620);
    x = p.x + Math.cos(a) * r; y = p.y + Math.sin(a) * r;
    if (!humanLightAt(x, y) && World.depth(x, y) < 12) break;
  }
  for (let i = 0; i < count; i++) {
    const e = makeEnemy(type, x + rand(-30, 30), y + rand(-30, 30), Math.max(1, p.zi));
    if (shelter && Math.random() < 0.5) e.goal = shelter;
    G.enemies.push(e);
  }
}

function makeEnemy(type, x, y, zi, extra) {
  const def = ENEMIES[type], Z = ZONES[Math.max(1, zi)], day = G.save.day, D = G.diff();
  const hp = def.hp * Z.hp * (1 + 0.08 * (day - 1)) * D.enemyHp;
  const art = def.art || type;
  const e = Object.assign({
    id: ++G.eid, type, def, art, x, y, kx: 0, ky: 0, hp, maxHp: hp,
    dmg: def.dmg * Z.dmg * (1 + 0.05 * (day - 1)) * D.enemyDmg,
    speed: def.speed * rand(0.9, 1.1), angle: 0, moving: false, animT: rand(0, 1),
    state: "move", stT: 0, cd: rand(0.3, 1), flash: 0, burn: 0, slow: 0, zz: rand(0, TAU),
    rise: def.crawl ? 0.9 : 0.6, goal: null, zi,
  }, extra || {});
  e.mesh = billboard(`${art}/front`, def.scale);
  G.scene.add(e.mesh);
  return e;
}
G.makeEnemy = makeEnemy;
function removeEnemy(e) { G.scene.remove(e.mesh); }

function spawnSelf(s) {
  const e = makeEnemy("self", s.x, s.y, s.zi || 1, { loot: s.carried });
  G.enemies.push(e);
  G.selfEnemy = e;
}

function goalValid(g) {
  if (!g) return false;
  if (g.kind === "flame") return g.lit;
  if (g.type === "torch") return G.torches.includes(g);
  return !g.dead;
}
function nearestLightTarget(x, y, R) {
  let best = null, bd = R;
  const consider = (o) => { const d = dist(x, y, o.x, o.y); if (d < bd) { bd = d; best = o; } };
  if (G.flame.lit) consider(G.flame);
  for (const t of G.torches) consider(t);
  if (G.night) for (const o of World.objectsNear(x, y, R)) if (o.def.bloom && !o.dead) consider(o);
  return best;
}

function hitEnemy(e, dmg, ang, kb) {
  if (e.dying) return;
  const p = G.player;
  if (e.def.armor) dmg *= 1 - e.def.armor;
  if (e.def.shield) {
    // the Bone Bulwark's shield turns blows that come from in front of it
    const toPlayer = Math.atan2(p.y - e.y, p.x - e.x);
    if (Math.abs(angleDiff(e.angle, toPlayer)) < 0.9 && e.state !== "strike") { dmg *= 0.5; sfx("clink"); }
  }
  e.hp -= dmg;
  e.flash = 0.14;
  const m = e.def.boss ? 0.25 : e.def.shield ? 0.5 : 1;
  e.kx += Math.cos(ang) * kb * m;
  e.ky += Math.sin(ang) * kb * m;
  if (e.state === "windup" && !e.def.boss) { e.state = "move"; e.cd = 0.5; } // a solid blow breaks a windup
  spark(e.x, World.height(e.x, e.y) + 50 * e.def.scale, e.y, 0x7fe9f0, 4);
  if (e.hp <= 0) killEnemy(e);
}
function killEnemy(e) {
  e.dying = 1;
  sfx("kill");
  if (e.type === "self") {
    for (const k of RES_KEYS) for (let i = 0; i < (e.loot[k] || 0); i++) dropPickup(k, e.x + rand(-30, 30), e.y + rand(-30, 30));
    G.save.self = null;
    G.selfEnemy = null;
    say("Your drowned self is laid to rest. Your supplies are yours again.", "good");
    G.persist();
    return;
  }
  for (const k in e.def.drop) {
    const c = e.def.drop[k];
    let n = Math.floor(c) + (Math.random() < c % 1 ? 1 : 0);
    for (let i = 0; i < n; i++) dropPickup(k, e.x + rand(-15, 15), e.y + rand(-15, 15));
  }
}

function updateEnemies(dt) {
  const p = G.player, alive = G.state === "play";
  for (const e of G.enemies) {
    e.animT += dt;
    e.flash = Math.max(0, e.flash - dt);
    if (e.dying) { e.dying -= dt * 0.8; continue; }
    if (e.burning) {
      e.burning -= dt;
      e.flash = 0.05;
      if (e.burning <= 0) { e.dying = 1; continue; }
    }
    if (e.burn > 0) { e.burn -= dt; e.hp -= 4 * dt; if (e.hp <= 0) { killEnemy(e); continue; } }
    if (e.rise > 0) { e.rise -= dt; continue; }
    const d = e.def;
    // who it hunts: the knight, or the fire, or a light to snuff
    let tx = p.x, ty = p.y, target = alive ? p : null;
    const dp = dist(e.x, e.y, p.x, p.y);
    if (d.targetsLight && (!e.goal || !goalValid(e.goal))) e.goal = nearestLightTarget(e.x, e.y, 520);
    if (e.goal && !goalValid(e.goal)) e.goal = null;
    if (e.goal && (!alive || dp > 170)) { target = e.goal; tx = e.goal.x; ty = e.goal.y; }
    if (!target) { tx = e.x + Math.cos(e.angle) * 50; ty = e.y + Math.sin(e.angle) * 50; }
    const dx = tx - e.x, dy = ty - e.y, dd = Math.hypot(dx, dy);
    const want = Math.atan2(dy, dx);
    e.cd -= dt;
    e.stT -= dt;
    const reach = (target === p ? d.radius + PLAYER_R : target && target.kind === "flame" ? 40 : 14) + d.range;
    let mvx = 0, mvy = 0;
    if (e.state === "move") {
      e.angle = want;
      let sp = e.speed * (e.slow > 0 ? 0.6 : 1) * (World.depth(e.x, e.y) > 10 ? 0.7 : 1);
      if (!target) sp *= 0.3;
      if (d.ranged && target === p) {
        // keep their distance and shoot
        if (dd < d.keep - 30) { mvx = -Math.cos(want) * sp; mvy = -Math.sin(want) * sp; }
        else if (dd > d.keep + 40) { mvx = Math.cos(want) * sp; mvy = Math.sin(want) * sp; }
        else { const s = Math.sin(e.animT * 0.8 + e.id) > 0 ? 1 : -1; mvx = -Math.sin(want) * sp * 0.5 * s; mvy = Math.cos(want) * sp * 0.5 * s; }
        if (dd < d.range && e.cd <= 0) { e.state = "windup"; e.stT = d.windup; }
      } else if (target && dd > reach) {
        let a = want;
        if (d.zigzag && dd > 90) a += Math.sin(e.animT * 4 + e.zz) * 0.7;
        mvx = Math.cos(a) * sp; mvy = Math.sin(a) * sp;
      } else if (target && e.cd <= 0) { e.state = "windup"; e.stT = d.windup; }
      e.moving = Math.hypot(mvx, mvy) > 5;
    } else if (e.state === "windup") {
      e.angle = want;
      e.moving = false;
      if (e.stT <= 0) {
        e.state = "strike"; e.stT = 0.22;
        strike(e, target, dd, reach);
      }
    } else if (e.state === "strike") {
      if (e.stT <= 0) { e.state = "move"; e.cd = d.cd * rand(0.85, 1.15); }
    }
    if (e.lungeT > 0) { e.lungeT -= dt; mvx += Math.cos(e.angle) * d.lunge; mvy += Math.sin(e.angle) * d.lunge; }
    e.kx *= Math.pow(0.004, dt); e.ky *= Math.pow(0.004, dt);
    const ox = e.x, oy = e.y;
    moveBody(e, (mvx + e.kx) * dt, (mvy + e.ky) * dt, d.radius * 0.6);
    // the Drowned don't stand inside each other or the knight
    if (dp < d.radius + PLAYER_R && dp > 0.1) {
      const m = d.radius + PLAYER_R;
      e.x = p.x + ((e.x - p.x) / dp) * m; e.y = p.y + ((e.y - p.y) / dp) * m;
    }
    e.vel = Math.hypot(e.x - ox, e.y - oy) / Math.max(dt, 1e-3);
    if (dp > 1700 && e.type !== "self") e.dying = 0.01; // left far behind in the dark
  }
  // separation
  for (let i = 0; i < G.enemies.length; i++) {
    const a = G.enemies[i];
    if (a.dying) continue;
    for (let j = i + 1; j < G.enemies.length; j++) {
      const b = G.enemies[j];
      if (b.dying) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = (a.def.radius + b.def.radius) * 0.9;
      if (d < m && d > 0.01) { const push = (m - d) / 2; a.x -= (dx / d) * push; a.y -= (dy / d) * push; b.x += (dx / d) * push; b.y += (dy / d) * push; }
    }
  }
  const dead = G.enemies.filter((e) => e.dying !== undefined && e.dying <= 0 && e.dying !== false);
  for (const e of dead) removeEnemy(e);
  if (dead.length) G.enemies = G.enemies.filter((e) => !dead.includes(e));
}

function strike(e, target, dd, reach) {
  const d = e.def, p = G.player;
  if (d.ranged) {
    const ang = Math.atan2(p.y - e.y, p.x - e.x);
    const from = World.height(e.x, e.y) + 55 * d.scale;
    if (d.caster) fireHostile(e.x, e.y, from, ang, 190, e.dmg, "orb", 6);
    else fireHostile(e.x, e.y, from, ang + rand(-0.03, 0.03), 520, e.dmg, "arrow", 0);
    sfx("arrow");
    return;
  }
  if (d.lunge && target === G.player && dd < reach + 60) e.lungeT = 0.12;
  if (!target || dd > reach + 18) return;
  if (target === p) {
    hurtPlayer(e.dmg, Math.atan2(p.y - e.y, p.x - e.x));
    if (d.corruptHit && G.state === "play") p.corrupt = clamp(p.corrupt + d.corruptHit, 0, 100);
  } else if (target.kind === "flame") {
    target.hp -= e.dmg;
    sfx("flameHit");
    if (target.hp <= 0 && target.lit) {
      target.lit = false;
      say("The Central Flame has gone out! The camp is dark until dawn.", "danger");
    }
  } else if (target.type === "torch") {
    target.hp -= d.lightDmg || e.dmg;
  } else if (target.def && target.def.bloom) {
    target.hp -= d.lightDmg || e.dmg;
    target.shake = 0.2;
    if (target.hp <= 0) { World.mined.add(target.id); World.fell(target); World.refreshMesh(target); sfx("shatter"); }
  }
}

function hurtPlayer(dmg, ang) {
  const p = G.player, kit = G.kit();
  if (G.state !== "play" || p.inv > 0) return;
  if (kit.passive && kit.passive.stance && p.still >= kit.passive.stance.after) dmg *= 1 - kit.passive.stance.guard;
  p.hp -= dmg;
  p.inv = 0.35;
  p.hurtT = 0.25;
  p.kx += Math.cos(ang) * 160; p.ky += Math.sin(ang) * 160;
  G.hurtFlash = 0.5;
  G.shake = Math.max(G.shake, 0.25);
  G.hurtFrom = ang;
  sfx("hurt");
  if (p.hp <= 0) die("wounds");
}

/* ---------------- projectiles ---------------- */
const boltGeo = new THREE.BoxGeometry(2, 2, 26);
const arrowGeo = new THREE.BoxGeometry(1.6, 1.6, 22);
function fireBolt(ang, pitch, dmg, pierce, flare) {
  const p = G.player, A = G.kit().attack;
  const z = World.height(p.x, p.y) + EYE - 10;
  const mesh = new THREE.Mesh(boltGeo, new THREE.MeshBasicMaterial({ color: flare ? 0xffc070 : 0xe8d0a0 }));
  G.scene.add(mesh);
  const sp = A.speed || 1400;
  G.projectiles.push({
    x: p.x + Math.cos(ang) * 14, y: p.y + Math.sin(ang) * 14, z, vx: Math.cos(ang) * sp * Math.cos(pitch), vy: Math.sin(ang) * sp * Math.cos(pitch),
    vz: Math.sin(pitch) * sp, life: (A.range || 700) / sp, dmg, pierce, hit: new Set(), mesh, kind: "bolt", flare, ox: p.x, oy: p.y,
  });
}
function fireHostile(x, y, z, ang, sp, dmg, kind, corrupt) {
  const p = G.player;
  const tz = World.height(p.x, p.y) + EYE - 18;
  const d = Math.max(1, dist(x, y, p.x, p.y));
  let mesh;
  if (kind === "orb") mesh = glowCard(0x50e8f0, 40, 0.9);
  else mesh = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: 0x8a7a5a }));
  G.scene.add(mesh);
  G.projectiles.push({ x, y, z, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, vz: ((tz - z) / d) * sp, life: 2.6, dmg, hostile: true, corrupt, kind, mesh });
}
function updateProjectiles(dt) {
  const p = G.player, kit = G.kit();
  for (const pr of G.projectiles) {
    pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.z += pr.vz * dt;
    pr.life -= dt;
    const gh = World.height(pr.x, pr.y);
    if (pr.z < gh) pr.life = 0;
    if (pr.hostile) {
      if (dist(pr.x, pr.y, p.x, p.y) < PLAYER_R + 8 && G.state === "play") {
        hurtPlayer(pr.dmg, Math.atan2(pr.vy, pr.vx));
        if (pr.corrupt && G.player.inv > 0) p.corrupt = clamp(p.corrupt + pr.corrupt, 0, 100);
        pr.life = 0;
      }
    } else {
      for (const e of G.enemies) {
        if (e.dying || e.rise > 0.3 || pr.hit.has(e)) continue;
        if (dist(pr.x, pr.y, e.x, e.y) > e.def.radius + 6) continue;
        const eh = World.height(e.x, e.y);
        if (pr.z < eh - 10 || pr.z > eh + 90 * e.def.scale) continue;
        pr.hit.add(e);
        let dmg = pr.dmg;
        const fs = kit.passive && kit.passive.farShot;
        if (fs) dmg *= 1 + fs.bonus * clamp((dist(pr.ox, pr.oy, e.x, e.y) - fs.from) / (fs.to - fs.from), 0, 1);
        hitEnemy(e, dmg, Math.atan2(pr.vy, pr.vx), 90);
        sfx("hit");
        pr.pierce -= 1;
        if (pr.pierce < 0) { pr.life = 0; break; }
      }
      // a bolt that hits a tree or a rock stops in it
      for (const o of World.objectsNear(pr.x, pr.y, 30)) if (o.solid && dist(pr.x, pr.y, o.x, o.y) < o.solid && pr.z < o.h + 120) pr.life = 0;
    }
    pr.mesh.position.set(pr.x, pr.z, pr.y);
    if (pr.kind === "orb") pr.mesh.rotation.y = p.yaw;
    else pr.mesh.lookAt(pr.x + pr.vx, pr.z + pr.vz, pr.y + pr.vy);
    if (pr.life <= 0 && pr.flare) G.flares.push({ x: pr.x, y: pr.y, h: pr.z + 20, t: 3 });
  }
  const gone = G.projectiles.filter((pr) => pr.life <= 0);
  for (const pr of gone) G.scene.remove(pr.mesh);
  if (gone.length) G.projectiles = G.projectiles.filter((pr) => pr.life > 0);
}

/* ---------------- pickups ---------------- */
function dropPickup(res, x, y) {
  const icon = RESOURCES[res].icon;
  const mesh = billboard(icon, 1.3);
  G.scene.add(mesh);
  const a = rand(0, TAU);
  G.pickups.push({ res, x, y, z: World.height(x, y) + 20, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60, vz: 140, t: 0, mesh });
}
function updatePickups(dt) {
  const p = G.player;
  for (const k of G.pickups) {
    k.t += dt;
    const gh = World.height(k.x, k.y);
    const d = dist(k.x, k.y, p.x, p.y);
    if (k.t > 0.5 && d < 140 && G.state === "play") {
      // drawn to the knight
      const s = 360 + (140 - d) * 4;
      k.x += ((p.x - k.x) / d) * s * dt; k.y += ((p.y - k.y) / d) * s * dt;
      k.z = lerp(k.z, gh + 30, dt * 6);
      if (d < 16) { p.carried[k.res] += 1; k.taken = true; sfx("pickup"); }
    } else {
      k.vz -= 520 * dt;
      k.x += k.vx * dt; k.y += k.vy * dt; k.z += k.vz * dt;
      k.vx *= Math.pow(0.1, dt); k.vy *= Math.pow(0.1, dt);
      if (k.z < gh + 2) { k.z = gh + 2; k.vz = Math.abs(k.vz) > 60 ? -k.vz * 0.35 : 0; }
    }
    k.mesh.position.set(k.x, k.z + Math.sin(G.t * 3 + k.x) * 2, k.y);
    k.mesh.rotation.y = p.yaw;
    if (k.t > 120) k.taken = true;
  }
  const gone = G.pickups.filter((k) => k.taken);
  for (const k of gone) G.scene.remove(k.mesh);
  if (gone.length) G.pickups = G.pickups.filter((k) => !k.taken);
}

/* ---------------- effects ---------------- */
const sparkGeo = new THREE.PlaneGeometry(3, 3);
function spark(x, z, y, color, n) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    m.position.set(x, z, y);
    G.scene.add(m);
    const a = rand(0, TAU);
    G.effects.push({ m, vx: Math.cos(a) * rand(40, 140), vy: Math.sin(a) * rand(40, 140), vz: rand(60, 200), t: rand(0.3, 0.6) });
  }
}
function ring(x, y, r, color) {
  const geo = new THREE.RingGeometry(r * 0.92, r, 48);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.position.set(x, World.height(x, y) + 4, y);
  G.scene.add(m);
  G.effects.push({ m, ring: true, t: 0.6, max: 0.6 });
}
function updateEffects(dt) {
  for (const f of G.effects) {
    f.t -= dt;
    if (f.ring) { f.m.material.opacity = clamp(f.t / f.max, 0, 1) * 0.8; const s = 1 + (1 - f.t / f.max) * 0.25; f.m.scale.set(s, 1, s); continue; }
    f.vz -= 500 * dt;
    f.m.position.x += f.vx * dt; f.m.position.z += f.vy * dt; f.m.position.y += f.vz * dt;
    f.m.rotation.y += dt * 9;
  }
  const gone = G.effects.filter((f) => f.t <= 0);
  for (const f of gone) { G.scene.remove(f.m); if (f.ring) f.m.geometry.dispose(); f.m.material.dispose(); }
  if (gone.length) G.effects = G.effects.filter((f) => f.t > 0);
}

/* ---------------- death ---------------- */
function die(cause) {
  const p = G.player;
  if (G.state !== "play") return;
  G.state = "dead";
  G.deathCause = cause;
  p.deadT = 0;
  sfx("death");
  Input.unlock();
  // your drowned self rises where you fell, with everything you carried
  const carried = { ...p.carried };
  const any = RES_KEYS.some((k) => carried[k] > 0);
  if (G.selfEnemy) { G.selfEnemy.dying = 1; G.selfEnemy = null; }
  G.save.self = any ? { x: p.x, y: p.y, zi: p.zi, carried } : null;
  for (const k of RES_KEYS) p.carried[k] = 0;
  G.persist();
  if (G.onDeath) G.onDeath(cause, any);
}
G.rise = function () {
  G.startLife(false);
  if (G.save.self && !G.selfEnemy) spawnSelf(G.save.self);
  G.state = "play";
  if (G.save.self) setTimeout(() => say("Your drowned self keeps what you carried. Slay it to take it back.", "warn"), 800);
};

/* ---------------- view ---------------- */
G.thirdPerson = () => G.save.view !== "first";
G.toggleView = function () {
  G.save.view = G.thirdPerson() ? "first" : "third";
  say(G.thirdPerson() ? "Third-person view" : "First-person view");
  G.persist();
};

/* ---------------- camp ---------------- */
G.openCamp = function () { G.state = "camp"; Input.unlock(); if (G.onCamp) G.onCamp(); };
G.canAfford = (cost) => Object.keys(cost).every((k) => G.save.stash[k] >= cost[k]);
G.upgradeInfo = function (u) {
  const lvl = G.save.up[u.id];
  if (lvl >= u.max) return { lvl, maxed: true };
  const cost = u.costs[u.id === "flame" ? lvl : lvl];
  const tier = Camp.tier(G.save.up);
  let lock = null;
  if (u.id === "flame") {
    const need = FLAME_NIGHTS[lvl + 1];
    if (G.save.nights < need) lock = `Survive ${need} night${need > 1 ? "s" : ""} (${G.save.nights} so far)`;
  } else if (G.save.up.flame < u.reqFlame(lvl + 1)) lock = `Needs Central Flame ${u.reqFlame(lvl + 1)}`;
  return { lvl, cost, lock, tier };
};
G.buy = function (id) {
  const u = UPGRADES.find((x) => x.id === id);
  const info = G.upgradeInfo(u);
  if (info.maxed || info.lock || !G.canAfford(info.cost)) { sfx("deny"); return false; }
  for (const k in info.cost) G.save.stash[k] -= info.cost[k];
  G.save.up[id] += 1;
  sfx("build");
  if (id === "flame") { G.flame.hp = G.stats().flameHp; G.flame.lit = true; }
  Camp.build(G.scene, G.save.up, (x, y) => World.height(x, y));
  World.refreshCamp(Camp.tierNow);
  G.persist();
  return true;
};
G.craftTorch = function () {
  if (G.save.torches >= G.stats().torchMax || !G.canAfford(TORCH_COST)) { sfx("deny"); return false; }
  for (const k in TORCH_COST) G.save.stash[k] -= TORCH_COST[k];
  G.save.torches += 1;
  sfx("torch");
  G.persist();
  return true;
};

/* ---------------- lights and render ---------------- */
function updateLights(dt) {
  gatherLights();
  const p = G.player;
  const ph = World.height(p.x, p.y) + EYE;
  const sorted = G.lights.map((l) => [l, dist(l.x, l.y, p.x, p.y) - l.r]).filter(([, d]) => d < 1100).sort((a, b) => a[1] - b[1]);
  for (let i = 0; i < LIGHT_POOL; i++) {
    const L = G.pool[i];
    const s = sorted[i];
    if (!s) { L.intensity = 0; continue; }
    const l = s[0];
    const fl = l.flicker ? 1 + Math.sin(G.t * 13 + l.x) * 0.06 + Math.sin(G.t * 7.1 + l.y) * 0.05 : 1;
    L.position.set(l.x, l.h, l.y);
    L.color.setHex(l.col);
    L.distance = l.r * 1.9;
    // fires are faint by day, blooms only wake at night
    const dayK = l.kind === "bloom" ? clamp((G.nightAmt - 0.3) * 2, 0, 1) : lerp(0.35, 1, G.nightAmt);
    L.intensity = l.i * fl * dayK;
  }
  const st = G.stats();
  // first person: the lantern hangs just ahead of you; third person: at the knight's side, toward the camera, so he is lit
  const lk = G.thirdPerson() ? -22 : 10;
  G.lantern.position.set(p.x + forward(p.yaw)[0] * lk, ph - 14, p.y + forward(p.yaw)[1] * lk);
  G.lantern.distance = st.lanternR * (p.oil > 0 ? 4 : 2.2);
  G.lantern.intensity = (p.oil > 0 ? 1.15 : 0.45) * lerp(0.3, 1, G.nightAmt) * (1 + Math.sin(G.t * 15) * 0.04);
}

const FOG_DAY = new THREE.Color(0x7d8a80), FOG_DUSK = new THREE.Color(0x4a3a3a), FOG_NIGHT = new THREE.Color(0x03070a), FOG_CORRUPT = new THREE.Color(0x0b3a40);
const tmpC = new THREE.Color();
function render(dt) {
  const p = G.player, cam = G.camera, n = G.nightAmt;
  const zi = World.zoneIndex(p.x, p.y), Z = ZONES[zi];
  const dim = clamp(Z.dim + G.diff().dayDim, 0, 0.9);
  const dark = clamp(n + (1 - n) * dim, 0, 1);
  // fog and sky: marsh haze by day, a black murk by night, sickly cyan as corruption takes you
  tmpC.copy(FOG_DAY).lerp(FOG_DUSK, clamp(n * 2, 0, 1) * (1 - clamp(n * 2 - 1, 0, 1))).lerp(FOG_NIGHT, clamp(n * 1.4 - 0.2, 0, 1));
  tmpC.lerp(FOG_NIGHT, dim * 0.7);
  if (G.state === "play") tmpC.lerp(FOG_CORRUPT, clamp((p.corrupt - 40) / 120, 0, 0.35));
  G.scene.fog.color.copy(tmpC);
  G.scene.background.copy(tmpC);
  G.scene.fog.near = lerp(260, 30, dark);
  G.scene.fog.far = lerp(1500, 620, dark);
  G.ambient.intensity = lerp(1.6, 0.16, dark);
  G.ambient.color.setHex(n > 0.5 ? 0x8aa6c0 : 0xd8d2c0);
  G.sun.intensity = lerp(1.5, 0.08, dark);
  G.sun.color.setHex(n > 0.5 ? 0x8fb0d0 : 0xfff0d0);
  G.hemi.intensity = lerp(0.6, 0.05, dark);
  G.dark = dark;

  // the camera: eyes, bob, shake
  G.shake = Math.max(0, G.shake - dt);
  G.hurtFlash = Math.max(0, G.hurtFlash - dt);
  const gh = World.height(p.x, p.y);
  const bob = G.state === "play" && p.moving ? Math.sin(p.bob * 2) * 2.2 : 0;
  const deadDrop = G.state === "dead" ? Math.min(1, (p.deadT || 0) * 0.8) * (EYE - 14) : 0;
  const shx = (Math.random() - 0.5) * G.shake * 8, shy = (Math.random() - 0.5) * G.shake * 8;
  const third = G.thirdPerson() && G.state !== "title";
  cam.rotation.order = "YXZ";
  if (third) {
    // 2.5D: the camera rides behind and above the knight, looking down past his shoulder;
    // looking up and down tilts it between a low chase view and a high, almost top-down one
    const [fx, fy] = forward(p.yaw);
    const elev = clamp(0.42 - p.pitch * 0.8, 0.12, 1.15);
    const D = 185;
    const tx = p.x + fx * 50, ty = p.y + fy * 50, th = gh + 50;
    let cx = tx - fx * D * Math.cos(elev), cy = ty - fy * D * Math.cos(elev), ch = th + D * Math.sin(elev);
    ch = Math.max(ch, World.height(cx, cy) + 24, WATER_LEVEL + 20);
    cam.position.set(cx + shx, ch + shy - deadDrop * 0.3, cy);
    cam.rotation.y = p.yaw;
    cam.rotation.x = -Math.atan2(ch - th, Math.hypot(cx - tx, cy - ty)) + 0.05;
    cam.rotation.z = 0;
  } else {
    cam.position.set(p.x + shx, gh + EYE + bob - deadDrop + shy, p.y);
    cam.rotation.y = p.yaw;
    cam.rotation.x = p.pitch;
    cam.rotation.z = G.state === "dead" ? Math.min(0.5, (p.deadT || 0) * 0.4) : p.dashT > 0 ? 0.02 : 0;
  }
  G.camX = cam.position.x; G.camY = cam.position.z;
  renderKnight(third);

  World.faceCamera(p.yaw, dt, G.t, G.camX, G.camY);
  Camp.update(G.t, p.yaw, G.flame.lit, G.save.up.flame / 5);
  renderEnemies();

  // the hands (none on the title screen)
  ViewModel.cv.style.display = G.state === "title" || third ? "none" : "";
  const lightHere = G.protectionAt(p.x, p.y) === "human" ? 1 : lerp(1, 0.55, dark);
  ViewModel.update(dt, G.state === "play" ? (p.turn || 0) * 0.02 : 0, G.state === "play" && p.moving, G.kit().attack.type, lightHere, p.oil > 0 ? 1 : 0, G.t, p.dashT > 0);
}

// The knight himself, in the third-person view: his own drawn frames, seen from wherever the camera is.
function renderKnight(show) {
  const p = G.player, k = G.knight, art = G.kit().art;
  k.visible = show;
  if (!show) return;
  const yaw = p.yaw, rx = Math.cos(yaw), ry = -Math.sin(yaw);
  const toCam = Math.atan2(G.camY - p.y, G.camX - p.x);
  const rel = Math.abs(angleDiff(p.face, toCam));
  const facesRight = Math.cos(p.face) * rx + Math.sin(p.face) * ry > 0;
  const f = 1 + (Math.floor(p.animT * 8) % 4);
  const moving = G.state === "play" && p.moving;
  let name, flip = false;
  if (G.state === "dead") { name = `${art}/side/death`; flip = !facesRight; }
  else if (p.hurtT > 0) { name = `${art}/side/hurt`; flip = !facesRight; }
  else if (p.dashT > 0 && art !== "pike-warden") { name = `${art}/side/dash`; flip = !facesRight; }
  else if (p.swingT > 0) { name = `${art}/${p.swingT > 0.2 ? "attackA" : p.swingT > 0.1 ? "attackB" : "attackC"}`; flip = !facesRight; }
  else if (rel < 0.8) name = moving ? `${art}/walkF${f}` : `${art}/front`;
  else if (rel > 2.35) name = moving ? `${art}/walkB${f}` : `${art}/back`;
  else { name = moving ? `${art}/side/walk${f}` : `${art}/right`; flip = !facesRight; }
  setSprite(k, name, 1, flip, p.hurtT > 0 ? "flash" : "");
  k.position.set(p.x, World.height(p.x, p.y) - 3, p.y);
  k.rotation.y = yaw;
}

function renderEnemies() {
  const p = G.player, yaw = p.yaw;
  const rx = Math.cos(yaw), ry = -Math.sin(yaw); // the view's right-hand vector on the ground
  for (const e of G.enemies) {
    const m = e.mesh, d = e.def;
    const gh = World.height(e.x, e.y);
    // which way it faces, seen from the camera: front, back or side
    const toCam = Math.atan2(G.camY - e.y, G.camX - e.x);
    const rel = Math.abs(angleDiff(e.angle, toCam));
    const facesRight = Math.cos(e.angle) * rx + Math.sin(e.angle) * ry > 0;
    const walkF = 1 + (Math.floor(e.animT * 7) % 4);
    let name, flip = false;
    if (e.dying !== undefined && e.dying !== false) { name = `${e.art}/side/death`; flip = !facesRight; }
    else if (e.state === "windup") { name = `${e.art}/attackA`; flip = !facesRight; }
    else if (e.state === "strike") { name = `${e.art}/${e.stT > 0.11 ? "attackB" : "attackC"}`; flip = !facesRight; }
    else if (rel < 0.8) name = e.moving ? `${e.art}/walkF${walkF}` : `${e.art}/front`;
    else if (rel > 2.35) name = e.moving ? `${e.art}/walkB${walkF}` : `${e.art}/back`;
    else { name = e.moving ? `${e.art}/side/walk${walkF}` : `${e.art}/right`; flip = !facesRight; }
    // struck: the whole sprite flashes pale (or burns orange in the dawn); otherwise only its drowned light glows
    const look = e.flash > 0 ? (e.burning || e.burn > 0 ? "burn" : "flash") : e.type === "self" ? "self" : "";
    setSprite(m, name, d.scale, flip, look);
    // rising out of the mud, sinking when slain
    let sink = 0;
    if (e.rise > 0) sink = (e.rise / (d.crawl ? 0.9 : 0.6)) * 80 * d.scale;
    if (e.dying !== undefined && e.dying !== false) sink = (1 - clamp(e.dying, 0, 1)) * 60;
    m.position.set(e.x, gh - 3 - sink, e.y);
    m.rotation.y = yaw;
  }
}
