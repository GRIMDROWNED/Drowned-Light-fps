/* Drowned Light FPS — the endless wetland in 3D: chunked terrain with the original ground art painted onto it,
   pools of black water, and the same deterministic trees, rocks, ores and bloom groves as the top-down game. */
import * as THREE from "../vendor/three.module.min.js";
import { hash, fbm, weighted, smooth, lerp } from "./core.js";
import { ZONES, SPAWN_TABLE, GROVE, OBJ } from "./data.js";
import { Assets, billboard, setSprite } from "./assets.js";
import { Style, objectModel, setNightGlow } from "./models.js";

const CH = 256;          // chunk size in world px
const GS = 128;          // ground texture resolution per chunk (1 texel = 2 world px)
const SEG = 16;          // terrain mesh segments per chunk side
const VIEW = 6;          // chunks loaded out from the knight in each direction
const CAMP_CLEAR = 420;  // no trees or rocks this close (camp-square distance)
const CAMP_DRY = 380;    // and no water
const WATER = 0.31, SHORE = 0.345;
export const WATER_LEVEL = -6;

const groundMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const GRASS = [0x4a5a2c, 0x45542a, 0x50602f, 0x4d5a30];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const sq = (x, y) => Math.max(Math.abs(x), Math.abs(y)); // the camp is square

export const World = {
  CH,
  chunks: new Map(),
  scene: null,
  water: null,
  mined: new Set(),      // ids of nodes mined (and blooms torn down) since dawn
  campTier: 1,
  pending: [],

  init(scene) {
    this.scene = scene;
    const n = Style.models ? (VIEW * 2 + 3) * 4 : 1;
    const wg = new THREE.PlaneGeometry(CH * (VIEW * 2 + 3), CH * (VIEW * 2 + 3), n, n);
    wg.rotateX(-Math.PI / 2);
    this.waterMat = Style.models
      ? new THREE.MeshPhongMaterial({ color: 0x123a3e, transparent: true, opacity: 0.8, emissive: 0x03100f, specular: 0x4a7a78, shininess: 40, flatShading: true })
      : new THREE.MeshLambertMaterial({ color: 0x0d2a2c, transparent: true, opacity: 0.72, emissive: 0x020809 });
    if (Style.models) { // a gentle faceted swell on the water
      const p = wg.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, (hash(Math.round(p.getX(i)), Math.round(p.getZ(i)), 77) - 0.5) * 3);
      wg.computeVertexNormals();
    }
    this.water = new THREE.Mesh(wg, this.waterMat);
    this.water.position.y = WATER_LEVEL;
    this.water.renderOrder = 1;
    scene.add(this.water);
  },

  zoneIndex(x, y) {
    const d = Math.hypot(x, y);
    let z = 0;
    for (let i = 0; i < ZONES.length; i++) if (d >= ZONES[i].r) z = i;
    return z;
  },
  zone(x, y) { return ZONES[this.zoneIndex(x, y)]; },

  waterVal(x, y) { return fbm(x / 260, y / 260, 11); },
  isWaterCell(x, y) { return sq(x, y) > CAMP_DRY && this.waterVal(x, y) < WATER; },
  isShore(x, y) { const w = this.waterVal(x, y); return sq(x, y) > CAMP_DRY && w >= WATER && w < SHORE; },

  // Ground height: low rolling land, flattened round the camp, dipping into pools where the water is.
  height(x, y) {
    const s = sq(x, y);
    const flat = smooth(260, 560, s);
    let land = 2 + Math.max(0, fbm(x / 700, y / 700, 21) - 0.42) * 120 * flat + (fbm(x / 150, y / 150, 23) - 0.5) * 10 * flat;
    if (s <= CAMP_DRY) return land;
    const wv = this.waterVal(x, y);
    const t = smooth(WATER - 0.045, SHORE, wv);
    const dry = smooth(CAMP_DRY, CAMP_DRY + 120, s);
    return lerp(land, lerp(-26, land, t), dry);
  },
  depth(x, y) { return Math.max(0, WATER_LEVEL - this.height(x, y)); },

  /* ---------------- chunks ---------------- */
  update(px, py, dt) {
    const cx0 = Math.floor(px / CH), cy0 = Math.floor(py / CH);
    const want = new Set();
    for (let dy = -VIEW; dy <= VIEW; dy++) {
      for (let dx = -VIEW; dx <= VIEW; dx++) {
        if (dx * dx + dy * dy > (VIEW + 0.5) * (VIEW + 0.5)) continue;
        const key = (cx0 + dx) + "," + (cy0 + dy);
        want.add(key);
        if (!this.chunks.has(key)) this.pending.push([cx0 + dx, cy0 + dy, dx * dx + dy * dy]);
      }
    }
    for (const [key, c] of this.chunks) if (!want.has(key)) this.unload(c);
    // build the nearest missing chunks first, a few per frame so the march never hitches
    this.pending = this.pending.filter(([x, y]) => want.has(x + "," + y) && !this.chunks.has(x + "," + y));
    this.pending.sort((a, b) => a[2] - b[2]);
    const seen = new Set();
    let built = 0;
    while (this.pending.length && built < (this.chunks.size < 20 ? 200 : 1)) {
      const [x, y] = this.pending.shift();
      const key = x + "," + y;
      if (seen.has(key)) continue;
      seen.add(key);
      this.build(x, y);
      built++;
    }
    this.water.position.x = Math.round(px / 64) * 64;
    this.water.position.z = Math.round(py / 64) * 64;
  },

  build(cx, cy) {
    const key = cx + "," + cy;
    let geo = new THREE.PlaneGeometry(CH, CH, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const ox = (cx + 0.5) * CH, oy = (cy + 0.5) * CH;
    let pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, this.height(ox + pos.getX(i), oy + pos.getZ(i)));
    let mesh;
    if (Style.models) {
      geo = geo.toNonIndexed();
      geo.deleteAttribute("uv");
      geo.setAttribute("color", new THREE.BufferAttribute(this.groundColours(geo.attributes.position, ox, oy), 3));
      geo.computeVertexNormals();
      mesh = new THREE.Mesh(geo, groundMat);
    } else {
      geo.computeVertexNormals();
      mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: this.groundTexture(cx, cy) }));
    }
    mesh.position.set(ox, 0, oy);
    this.scene.add(mesh);
    const objects = this.gen(cx, cy);
    for (const o of objects) this.spawnMesh(o);
    this.chunks.set(key, { cx, cy, key, mesh, objects });
  },
  unload(c) {
    this.scene.remove(c.mesh);
    c.mesh.geometry.dispose();
    if (c.mesh.material !== groundMat) { c.mesh.material.map.dispose(); c.mesh.material.dispose(); }
    for (const o of c.objects) if (o.mesh) this.scene.remove(o.mesh);
    this.chunks.delete(c.key);
  },
  // The camp ground changes with its tier: repaint the chunks round the camp.
  refreshCamp(tier) {
    if (tier === this.campTier) return;
    this.campTier = tier;
    for (const c of [...this.chunks.values()]) if (Math.abs(c.cx + 0.5) < 2 && Math.abs(c.cy + 0.5) < 2) this.unload(c);
  },

  // The low-poly ground: one flat colour per triangle, from the same water, shore, dirt and camp rules as the tiles.
  groundColours(pos, ox, oy) {
    const n = pos.count, col = new Float32Array(n * 3), c = new THREE.Color();
    const pave = this.campTier >= 2 ? 92 : 0;
    for (let i = 0; i < n; i += 3) {
      const x = ox + (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, y = oy + (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
      const h = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
      const s = sq(x, y), r = hash(Math.round(x), Math.round(y), 91);
      if (s < 245) c.set(Math.hypot(x, y) < pave ? (r < 0.5 ? 0x6e6458 : 0x625a50) : 0x5a4630);
      else if (h < WATER_LEVEL - 2) c.set(0x24302a);
      else if (h < WATER_LEVEL + 3 || this.isShore(x, y)) c.set(0x5e5a3a);
      else if (fbm(x / 340, y / 340, 41) > 0.62) c.set(0x5a4a32);
      else c.set(GRASS[(r * GRASS.length) | 0]);
      const dim = this.zone(x, y).dim, k = (0.92 + r * 0.16) * (1 - dim * 0.6);
      for (let j = 0; j < 3; j++) { col[(i + j) * 3] = c.r * k * (1 - dim * 0.25); col[(i + j) * 3 + 1] = c.g * k; col[(i + j) * 3 + 2] = c.b * k * (1 + dim * 0.2); }
    }
    return col;
  },

  groundTexture(cx, cy) {
    const cv = document.createElement("canvas");
    cv.width = cv.height = GS;
    const g = cv.getContext("2d");
    const img = g.createImageData(GS, GS);
    const out = img.data;
    const P = Assets.pixels;
    const k = CH / GS;
    const pave = this.campTier >= 2 ? 92 : 0;
    // the zone's dimming is the same over most chunks: only look it up per texel on a zone's edge
    const zs = [[0, 0], [CH, 0], [0, CH], [CH, CH]].map(([a, b]) => this.zoneIndex(cx * CH + a, cy * CH + b));
    const oneZone = zs.every((z) => z === zs[0]) ? zs[0] : -1;
    // the noise is sampled every 4 texels and blended between, which is ten times cheaper than per texel
    const STEP = 4, N = GS / STEP + 1;
    const wvG = new Float32Array(N * N), dirtG = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = cx * CH + i * STEP * k, y = cy * CH + j * STEP * k;
      wvG[j * N + i] = this.waterVal(x, y);
      dirtG[j * N + i] = fbm(x / 340, y / 340, 41);
    }
    const sample = (G, tx, ty) => {
      const fx = tx / STEP, fy = ty / STEP, i = fx | 0, j = fy | 0, u = fx - i, v = fy - j;
      const a = G[j * N + i], b = G[j * N + i + 1], c = G[(j + 1) * N + i], d = G[(j + 1) * N + i + 1];
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
    for (let ty = 0; ty < GS; ty++) {
      for (let tx = 0; tx < GS; tx++) {
        const x = cx * CH + tx * k, y = cy * CH + ty * k;
        const s = sq(x, y);
        let hh = Math.imul((x | 0) ^ 0x2c1b3c6d, 0x297a2d39) ^ Math.imul((y | 0) ^ 0x5bd1e995, 0x68e31da4);
        hh = Math.imul(hh ^ (hh >>> 15), 0x2c1b3c6d);
        const jitter = (((hh >>> 8) & 0xffff) / 65536 - 0.5) * 0.012;
        let tile;
        if (s < 245 + jitter * 900) tile = Math.hypot(x, y) < pave ? P.campPaving : P.campEarth;
        else {
          const wv = s > CAMP_DRY ? sample(wvG, tx, ty) + jitter : 1;
          if (wv < WATER - 0.03) tile = P.deep;
          else if (wv < WATER + 0.004) tile = P.shallow;
          else if (wv < SHORE) tile = P.shore;
          else tile = sample(dirtG, tx, ty) > 0.62 ? P.dirt : P.grass;
        }
        if (!tile) continue;
        const sx = ((x % tile.width) + tile.width) % tile.width | 0, sy = ((y % tile.height) + tile.height) % tile.height | 0;
        const si = (sy * tile.width + sx) * 4, di = (ty * GS + tx) * 4;
        const dim = ZONES[oneZone >= 0 ? oneZone : this.zoneIndex(x, y)].dim;
        const kk = 0.92 * (1 - dim * 0.7);
        out[di] = tile.data[si] * kk * (1 - dim * 0.25);
        out[di + 1] = tile.data[si + 1] * kk;
        out[di + 2] = tile.data[si + 2] * kk * (1 + dim * 0.2);
        out[di + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv);
    t.magFilter = THREE.NearestFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  },

  /* ---------------- objects ---------------- */
  gen(cx, cy) {
    const objs = [];
    const mx = (cx + 0.5) * CH, my = (cy + 0.5) * CH;
    const zi = Math.max(1, this.zoneIndex(mx, my));
    const D = this.diff();
    const grove = this.grove(Math.floor(mx / GROVE.cell), Math.floor(my / GROVE.cell));
    const n = Math.round(ZONES[zi].density * D.density * (0.7 + hash(cx, cy, 5) * 0.6));
    for (let i = 0; i < n; i++) {
      const x = (cx + hash(cx, cy, i * 3 + 1)) * CH, y = (cy + hash(cx, cy, i * 3 + 2)) * CH;
      if (sq(x, y) < CAMP_CLEAR) continue;
      const ozi = Math.max(1, this.zoneIndex(x, y));
      let type = weighted(SPAWN_TABLE[ozi], hash(cx, cy, i * 3 + 3));
      if (type === "gap") continue;
      const h = this.height(x, y);
      if (h < WATER_LEVEL - 3) continue;
      if (this.isShore(x, y) && h < WATER_LEVEL + 6) { if (hash(cx, cy, i * 7 + 9) < 0.5) type = "reeds"; }
      else if (type === "reeds") continue;
      if (grove && OBJ[type].solid && Math.hypot(x - grove.x, y - grove.y) < GROVE.clear) continue;
      objs.push(this.makeObj(type, x, y, `${cx},${cy},${i}`, ozi, hash(cx, cy, i * 5 + 4)));
    }
    // the grove's own blooms, if its heart lies in this chunk's ground
    if (grove) for (const b of grove.blooms) {
      if (Math.floor(b.x / CH) === cx && Math.floor(b.y / CH) === cy) objs.push(this.makeObj(b.type, b.x, b.y, b.id, zi, b.r));
    }
    return objs;
  },
  diff() { return this.getDiff ? this.getDiff() : { density: 1 }; },

  // A grove of Refuge and Sentinel Blooms in this cell of the grove grid, or null.
  grove(gx, gy) {
    const c = GROVE.cell;
    if (hash(gx, gy, 301) > GROVE.chance) return null;
    const x = gx * c + GROVE.margin + hash(gx, gy, 302) * (c - 2 * GROVE.margin);
    const y = gy * c + GROVE.margin + hash(gx, gy, 303) * (c - 2 * GROVE.margin);
    if (sq(x, y) < CAMP_CLEAR + 200) return null;
    const zi = this.zoneIndex(x, y);
    const Z = GROVE.zones[Math.max(1, zi)];
    if (this.height(x, y) < WATER_LEVEL + 2) return null;
    const blooms = [];
    const span = (r, s) => r[0] + Math.floor(hash(gx, gy, s) * (r[1] - r[0] + 1));
    const add = (type, n, s0) => {
      for (let i = 0; i < n; i++) {
        const a = hash(gx, gy, s0 + i * 2) * Math.PI * 2, r = 30 + hash(gx, gy, s0 + i * 2 + 1) * GROVE.spread;
        const bx = x + Math.cos(a) * r, by = y + Math.sin(a) * r;
        if (this.height(bx, by) < WATER_LEVEL + 1) continue;
        blooms.push({ type, x: bx, y: by, id: `g${gx},${gy},${type},${i}`, r: hash(gx, gy, s0 + i * 7 + 3) });
      }
    };
    add("refuge", span(Z.refuge, 310), 400);
    add("sentinel", span(Z.sentinel, 311), 500);
    add("sprout", span(Z.sprout, 312), 600);
    return { x, y, blooms };
  },

  makeObj(type, x, y, id, zi, r) {
    const def = OBJ[type];
    const o = { type, def, x, y, id, zi, h: this.height(x, y), v: 1 + Math.floor(r * (def.variants || 1)), stage: 1, hits: 0,
      hp: def.hp || 0, maxHp: def.hp || 0, solid: def.solid || 0, dead: false, shake: 0 };
    if (this.mined.has(id)) this.fell(o);
    return o;
  },
  // Mined out (or torn down) until dawn: trees leave a stump, the rest is gone.
  fell(o) {
    o.dead = true;
    if (o.type === "tree") { o.stage = 4; o.solid = 8; }
    else if (o.type === "sprout") { o.stage = 2; }
    else o.solid = 0;
  },
  spriteFor(o, night) {
    const d = o.def;
    if (o.type === "tree") return d.sprite(o.v, o.stage);
    if (d.stageCount) return d.sprite(o.v, o.stage, night);
    return d.sprite(o.v, 1, night);
  },
  spawnMesh(o) {
    const gone = o.dead && o.type !== "tree" && o.type !== "sprout";
    if (gone) { o.mesh = null; return; }
    if (Style.models) {
      o.mesh = objectModel(o.type, o.v, o.stage, this.night);
      o.sprite = o.mesh.userData.key;
      o.mesh.position.set(o.x, o.h - 1, o.y);
    } else {
      const name = this.spriteFor(o, this.night);
      o.mesh = billboard(name, o.def.scale);
      o.mesh.position.set(o.x, o.h - 3, o.y);
      o.sprite = name;
    }
    this.scene.add(o.mesh);
  },
  refreshMesh(o) {
    if (o.dead && o.type !== "tree" && o.type !== "sprout") {
      if (o.mesh) this.scene.remove(o.mesh);
      o.mesh = null;
      return;
    }
    if (!o.mesh) { this.spawnMesh(o); return; }
    if (Style.models) {
      if (o.mesh.userData.key !== `${o.type}|${o.v}|${o.stage}`) { this.scene.remove(o.mesh); this.spawnMesh(o); }
      else setNightGlow(o.mesh, o.type === "pearl" || this.night);
      return;
    }
    const name = this.spriteFor(o, this.night);
    if (name !== o.sprite) { setSprite(o.mesh, name, o.def.scale); o.sprite = name; }
  },
  setNight(night) {
    if (night === this.night) return;
    this.night = night;
    for (const c of this.chunks.values()) for (const o of c.objects) if (o.def.bloom || o.type === "sprout") this.refreshMesh(o);
  },
  // Dawn: everything mined or torn down grows back.
  dawn() {
    this.mined.clear();
    for (const c of this.chunks.values()) for (const o of c.objects) {
      if (!o.dead && !o.hits && o.hp === o.maxHp) continue;
      o.dead = false; o.hits = 0; o.stage = 1; o.hp = o.maxHp; o.solid = o.def.solid || 0;
      this.refreshMesh(o);
    }
  },

  // Everything loaded within r of (x, y).
  objectsNear(x, y, r, out = []) {
    const c0x = Math.floor((x - r) / CH), c1x = Math.floor((x + r) / CH);
    const c0y = Math.floor((y - r) / CH), c1y = Math.floor((y + r) / CH);
    for (let cy = c0y; cy <= c1y; cy++) for (let cx = c0x; cx <= c1x; cx++) {
      const c = this.chunks.get(cx + "," + cy);
      if (!c) continue;
      for (const o of c.objects) if (Math.abs(o.x - x) < r && Math.abs(o.y - y) < r) out.push(o);
    }
    return out;
  },
  *allObjects() { for (const c of this.chunks.values()) yield* c.objects; },

  // Every card turns to face the view. A wide card (a tree's crown) you stand right beside is eased back
  // so it never fills the whole view.
  // knight: in the third-person view, models standing between the camera and the knight are hidden.
  faceCamera(yaw, dt, t, cx, cy, knight) {
    const sx = knight ? knight.x - cx : 0, sy = knight ? knight.y - cy : 0, sl = sx * sx + sy * sy || 1;
    for (const c of this.chunks.values()) for (const o of c.objects) {
      if (!o.mesh) continue;
      if (o.mesh.userData.model) {
        if (knight) {
          const raw = ((o.x - cx) * sx + (o.y - cy) * sy) / sl, u = clamp01(raw);
          const ex = cx + sx * u - o.x, ey = cy + sy * u - o.y, r = (o.solid || 6) + (o.type === "tree" ? 48 : 14);
          o.mesh.visible = !(raw > -0.25 && raw < 0.9 && ex * ex + ey * ey < r * r);
        } else o.mesh.visible = true;
        if (o.shake > 0) {
          o.shake = Math.max(0, o.shake - dt);
          o.mesh.position.x = o.x + Math.sin(t * 70) * o.shake * 6;
        } else o.mesh.position.x = o.x;
        continue;
      }
      o.mesh.rotation.y = yaw;
      let x = o.x, y = o.y;
      const keep = Math.abs(o.mesh.scale.x) * 0.42, dx = o.x - cx, dy = o.y - cy, d = Math.hypot(dx, dy);
      if (d < keep && d > 0.1) { x = cx + (dx / d) * keep; y = cy + (dy / d) * keep; }
      if (o.shake > 0) {
        o.shake = Math.max(0, o.shake - dt);
        x += Math.sin(t * 70) * o.shake * 10;
      }
      o.mesh.position.x = x;
      o.mesh.position.z = y;
    }
  },
};
