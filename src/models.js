/* Drowned Light FPS — the low-poly look: flat-shaded 3D models for everything the sprites draw, built from
   simple shapes in code (no model files). Each model is one or two meshes: its lit body, with a colour per
   face, and the parts that glow (drowned light, blooms, fire, amethyst), unlit so they burn in the dark.
   The knights and the Drowned are jointed figures that walk, wind up, strike and fall. */
import * as THREE from "../vendor/three.module.min.js";

// The chosen look, kept on this device: "models" (low-poly) or "sprites" (the original drawn art).
const STYLE_KEY = "drowned-light-fps-style";
export const Style = {
  mode: (() => { try { return localStorage.getItem(STYLE_KEY) === "sprites" ? "sprites" : "models"; } catch (e) { return "models"; } })(),
  get models() { return this.mode === "models"; },
  set(mode) { try { localStorage.setItem(STYLE_KEY, mode); } catch (e) { /* ignore */ } },
};

/* ---------------- building blocks ---------------- */
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), tmpC = new THREE.Color();
function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}
const hp = (x, y, z) => {
  let n = Math.imul(Math.round(x * 10) | 0, 374761393) ^ Math.imul(Math.round(y * 10) | 0, 668265263) ^ Math.imul(Math.round(z * 10) | 0, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};

// One shape, placed and coloured. o: x y z, rx ry rz, s or sx sy sz, jitter (lumpiness), vary (face shading).
function piece(geo, color, o = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.deleteAttribute("uv");
  if (o.jitter) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), j = o.jitter;
      p.setXYZ(i, x * (1 + (hp(x, y, z) - 0.5) * j), y * (1 + (hp(y, z, x) - 0.5) * j), z * (1 + (hp(z, x, y) - 0.5) * j));
    }
  }
  tmpE.set(o.rx || 0, o.ry || 0, o.rz || 0);
  tmpQ.setFromEuler(tmpE);
  const s = o.s ?? 1;
  tmpS.set(o.sx ?? s, o.sy ?? s, o.sz ?? s);
  tmpP.set(o.x || 0, o.y || 0, o.z || 0);
  tmpM.compose(tmpP, tmpQ, tmpS);
  g.applyMatrix4(tmpM);
  tmpC.set(color);
  const n = g.attributes.position.count, col = new Float32Array(n * 3), vary = o.vary ?? 0.14;
  const pos = g.attributes.position;
  for (let i = 0; i < n; i += 3) {
    const k = 1 + (hp(pos.getX(i), pos.getY(i) + 3, pos.getZ(i)) - 0.5) * vary;
    for (let j = 0; j < 3; j++) { col[(i + j) * 3] = tmpC.r * k; col[(i + j) * 3 + 1] = tmpC.g * k; col[(i + j) * 3 + 2] = tmpC.b * k; }
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}
function merge(pieces) {
  if (!pieces.length) return null;
  let n = 0;
  for (const p of pieces) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const p of pieces) {
    pos.set(p.attributes.position.array, o * 3);
    col.set(p.attributes.color.array, o * 3);
    o += p.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export const MAT = {
  lit: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  flash: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x8a8a8a }),
  burn: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x9a4410 }),
  self: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, color: 0x6fb6c4, emissive: 0x05181c }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
  dim: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x041214 }),
};

// Shapes, low in polygons on purpose.
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: (rt, rb, h, seg = 6) => new THREE.CylinderGeometry(rt, rb, h, seg, 1),
  cone: (r, h, seg = 6) => new THREE.ConeGeometry(r, h, seg, 1),
  ico: (r, d = 0) => new THREE.IcosahedronGeometry(r, d),
  dode: (r) => new THREE.DodecahedronGeometry(r, 0),
  oct: (r) => new THREE.OctahedronGeometry(r, 0),
  tet: (r) => new THREE.TetrahedronGeometry(r, 0),
};
const box = (c, w, h, d, o = {}) => piece(G.box, c, { ...o, sx: w, sy: h, sz: d });

function model(lit, glow, key) {
  const grp = new THREE.Group();
  if (lit) { const m = new THREE.Mesh(lit, MAT.lit); grp.add(m); grp.userData.lit = m; }
  if (glow) { const m = new THREE.Mesh(glow, MAT.glow); grp.add(m); grp.userData.glow = m; }
  grp.userData.model = true;
  grp.userData.key = key;
  return grp;
}
const cache = new Map();
function cached(key, build) {
  let v = cache.get(key);
  if (!v) { v = build(); cache.set(key, v); }
  return v;
}

/* ---------------- the marsh ---------------- */
const BARK = ["#4a3a28", "#3f3424", "#54402a"], MOSS = "#7d7a3c", LEAF = ["#465a2a", "#3e4f26", "#56602e"];

function swampTree(v, stage) {
  const r = rng(v * 97 + 11), L = [];
  const lean = (r() - 0.5) * 0.25 + (stage === 3 ? 0.35 : 0);
  const bark = BARK[v % 3], leaf = LEAF[v % 3];
  // roots splay out from the foot
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + r();
    L.push(piece(G.cone(7, 46, 4), bark, { x: Math.cos(a) * 16, y: 8, z: Math.sin(a) * 16, rz: Math.cos(a) * 1.1, rx: -Math.sin(a) * 1.1 }));
  }
  if (stage === 4) {
    L.push(piece(G.cyl(15, 20, 30, 7), bark, { y: 15, jitter: 0.25 }));
    L.push(piece(G.cyl(14, 14, 2, 7), "#8a6a44", { y: 30.5 }));
    return [merge(L), null];
  }
  // a twisted trunk of stacked, offset segments
  let x = 0, y = 0, z = 0;
  const segs = 5, segH = 36;
  for (let i = 0; i < segs; i++) {
    const rb = 19 - i * 2.6, rt = rb - 2.6;
    const dx = (r() - 0.5) * 14 + lean * 12, dz = (r() - 0.5) * 14;
    L.push(piece(G.cyl(rt, rb, segH + 4, 7), bark, { x: x + dx / 2, y: y + segH / 2, z: z + dz / 2, rz: -dx / segH, rx: dz / segH, jitter: 0.12 }));
    x += dx; y += segH; z += dz;
  }
  // branches and the drooping crown, thinner as it is chopped
  const crowns = stage === 1 ? 6 : stage === 2 ? 4 : 2;
  for (let i = 0; i < crowns; i++) {
    const a = (i / crowns) * Math.PI * 2 + r() * 0.6, reach = 45 + r() * 40, up = 20 + r() * 40;
    const bx = x + Math.cos(a) * reach, bz = z + Math.sin(a) * reach, by = y - 30 + up;
    const mx = (x + bx) / 2, my = (y - 20 + by) / 2, mz = (z + bz) / 2;
    const len = Math.hypot(bx - x, by - y + 20, bz - z);
    const br = piece(G.cyl(3, 7, len, 5), bark, {});
    // point the branch from the trunk top to its end
    const dir = new THREE.Vector3(bx - x, by - (y - 20), bz - z).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    br.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(mx, my, mz), q, new THREE.Vector3(1, 1, 1)));
    L.push(br);
    const cr = 30 + r() * 22;
    L.push(piece(G.ico(cr), leaf, { x: bx, y: by + 6, z: bz, sy: 0.62, jitter: 0.35 }));
    // Spanish moss hanging under the crown
    for (let m = 0; m < 4; m++) {
      const ma = r() * Math.PI * 2, mr = r() * cr * 0.8, mh = 20 + r() * 36;
      L.push(piece(G.cone(3 + r() * 3, mh, 4), MOSS, { x: bx + Math.cos(ma) * mr, y: by - mh / 2 - 4, z: bz + Math.sin(ma) * mr, rx: Math.PI }));
    }
  }
  if (stage === 1) L.push(piece(G.ico(40), leaf, { x, y: y + 18, z, sy: 0.6, jitter: 0.35 }));
  return [merge(L), null];
}

function boulder(v, stage) {
  const r = rng(v * 31 + 5), L = [];
  const s = [1, 0.82, 0.62][stage - 1] || 0.6;
  const grey = ["#7d7f78", "#6f726c", "#87877c", "#74766e"][v % 4];
  L.push(piece(G.dode(30 * s), grey, { y: 22 * s, sy: 1.15, jitter: 0.45, ry: r() * 6 }));
  L.push(piece(G.dode(17 * s), grey, { x: 24 * s, y: 10 * s, z: 8 * s, jitter: 0.4 }));
  if (stage < 3) L.push(piece(G.dode(13 * s), grey, { x: -22 * s, y: 8 * s, z: -10 * s, jitter: 0.4 }));
  L.push(piece(G.cone(26 * s, 6, 6), "#4c5a34", { y: 2 }));
  return [merge(L), null];
}
function ironPile(v, stage) {
  const r = rng(v * 13 + 7), L = [];
  const n = [7, 5, 3][stage - 1] || 3;
  const rust = ["#8a4a2e", "#6b3d28", "#a2603a", "#4a4a4e"];
  L.push(piece(G.dode(18), "#55524a", { y: 6, sy: 0.45, jitter: 0.4 }));
  for (let i = 0; i < n; i++) {
    const a = r() * 6.28, d = r() * 18;
    L.push(box(rust[i % 4], 6 + r() * 10, 3 + r() * 5, 4 + r() * 12, { x: Math.cos(a) * d, y: 8 + r() * 6, z: Math.sin(a) * d, ry: r() * 3, rz: (r() - 0.5) * 0.8, rx: (r() - 0.5) * 0.6 }));
  }
  L.push(box("#5a5d62", 20, 2, 12, { y: 12, rz: 0.5, ry: r() * 3 }));
  return [merge(L), null];
}
function amethyst(v, stage) {
  const r = rng(v * 17 + 3), L = [], Gl = [];
  L.push(piece(G.dode(20), "#4a4650", { y: 6, sy: 0.5, jitter: 0.4 }));
  const n = [6, 4, 2][stage - 1] || 2;
  for (let i = 0; i < n; i++) {
    const a = r() * 6.28, d = 4 + r() * 12, h = 22 + r() * 22;
    Gl.push(piece(G.oct(6 + r() * 3), i % 2 ? "#a77cf0" : "#c9a8ff", { x: Math.cos(a) * d, y: 8 + h / 2, z: Math.sin(a) * d, sy: h / 12, rz: (r() - 0.5) * 0.7, rx: (r() - 0.5) * 0.7, vary: 0.3 }));
  }
  return [merge(L), merge(Gl)];
}
function clam(v, stage) {
  const L = [], Gl = [];
  L.push(piece(G.ico(18, 1), "#2f3540", { y: 4, sy: 0.35, jitter: 0.2 }));
  L.push(piece(G.ico(17, 1), "#3c4452", { y: 12, z: -6, sy: 0.3, rx: 0.8 - stage * 0.15 }));
  if (stage < 3) Gl.push(piece(G.ico(5, 1), "#7d8fb8", { y: 9, z: 3 }));
  return [merge(L), merge(Gl)];
}
function sprout(v, stage) {
  const L = [], Gl = [];
  for (let i = 0; i < 4; i++) {
    const a = i * 1.57 + v;
    L.push(piece(G.cone(5, 22, 3), "#3f6a3a", { x: Math.cos(a) * 9, y: 6, z: Math.sin(a) * 9, rz: Math.cos(a) * 1.2, rx: -Math.sin(a) * 1.2, sy: 0.6 }));
  }
  if (stage === 1) {
    L.push(piece(G.cyl(1.6, 2.4, 40, 5), "#8a6a2c", { y: 20, rz: 0.15 }));
    L.push(piece(G.cyl(1.4, 1.6, 16, 5), "#8a6a2c", { x: -4, y: 44, rz: 0.9 }));
    Gl.push(piece(G.ico(7, 0), "#5fe6ee", { x: -10, y: 40, sy: 1.3 }));
    Gl.push(piece(G.oct(2), "#9ff5f7", { x: 6, y: 4, z: 6 }));
  }
  return [merge(L), merge(Gl)];
}
function reeds(v) {
  const r = rng(v * 41 + 9), L = [];
  const n = 7 + Math.floor(r() * 5);
  for (let i = 0; i < n; i++) {
    const a = r() * 6.28, d = r() * 16, h = 30 + r() * 34;
    L.push(piece(G.cone(2, h, 3), i % 3 ? "#5f6b34" : "#7a7a40", { x: Math.cos(a) * d, y: h / 2, z: Math.sin(a) * d, rz: (r() - 0.5) * 0.4, rx: (r() - 0.5) * 0.4 }));
    if (i % 3 === 0) L.push(piece(G.cyl(2.4, 2.4, 9, 5), "#5a3a22", { x: Math.cos(a) * d, y: h * 0.8, z: Math.sin(a) * d }));
  }
  return [merge(L), null];
}
function refugeBloom(v) {
  const L = [], Gl = [];
  L.push(piece(G.cyl(6, 10, 50, 6), "#5a4430", { y: 25, rz: 0.12, jitter: 0.15 }));
  L.push(piece(G.cyl(4, 6, 46, 6), "#5a4430", { x: 8, y: 66, rz: 0.5, jitter: 0.15 }));
  L.push(piece(G.cyl(3, 4, 40, 6), "#5a4430", { x: 18, y: 98, rz: -0.6 }));
  for (let i = 0; i < 5; i++) L.push(piece(G.cone(7, 16, 3), "#3e6a42", { x: Math.cos(i) * 18, y: 6, z: Math.sin(i) * 18, rz: Math.cos(i) * 1.1, rx: -Math.sin(i) * 1.1 }));
  // hanging lantern pods of bloomlight
  Gl.push(piece(G.ico(11, 0), "#5fe6ee", { x: 4, y: 92, sy: 1.4 }));
  Gl.push(piece(G.ico(7, 0), "#7ff0f2", { x: 30, y: 70, sy: 1.4 }));
  Gl.push(piece(G.ico(6, 0), "#5fe6ee", { x: -12, y: 58, sy: 1.4 }));
  for (let i = 0; i < 6; i++) Gl.push(piece(G.oct(2.5), "#9ff5f7", { x: Math.cos(i * 1.7) * 22, y: 3, z: Math.sin(i * 1.7) * 22 }));
  return [merge(L), merge(Gl)];
}
function sentinelBloom() {
  const L = [], Gl = [];
  L.push(piece(G.cyl(3, 6, 96, 6), "#3f6a3a", { y: 48 }));
  for (let i = 0; i < 4; i++) L.push(piece(G.cone(8, 30, 3), "#3e6a42", { x: Math.cos(i * 1.57) * 10, y: 30 + i * 12, z: Math.sin(i * 1.57) * 10, rz: Math.cos(i * 1.57) * 0.9, rx: -Math.sin(i * 1.57) * 0.9 }));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * 6.28;
    Gl.push(piece(G.cone(8, 30, 3), "#4fd8e4", { x: Math.cos(a) * 12, y: 106, z: Math.sin(a) * 12, rz: Math.cos(a) * 0.9, rx: -Math.sin(a) * 0.9 }));
  }
  Gl.push(piece(G.ico(8, 0), "#c8fbff", { y: 104 }));
  return [merge(L), merge(Gl)];
}

// A world object (tree, rock, ore, bloom...) as a low-poly model. night: blooms and sprouts glow.
export function objectModel(type, v, stage, night) {
  const key = `${type}|${v}|${stage}`;
  const [lit, glow] = cached(key, () => {
    switch (type) {
      case "tree": return swampTree(v, stage);
      case "stone": return boulder(v, stage);
      case "iron": return ironPile(v, stage);
      case "pearl": return amethyst(v, stage);
      case "black": return clam(v, stage);
      case "sprout": return sprout(v, stage);
      case "reeds": return reeds(v);
      case "refuge": return refugeBloom(v);
      case "sentinel": return sentinelBloom(v);
    }
    return [merge([box("#f0f", 10, 10, 10)]), null];
  });
  const m = model(lit, glow, key);
  setNightGlow(m, type === "pearl" || night);
  m.rotation.y = (v * 2.39) % 6.28;
  return m;
}
export function setNightGlow(m, on) { if (m.userData.glow) m.userData.glow.material = on ? MAT.glow : MAT.dim; }

/* ---------------- the camp ---------------- */
export function campModel(name) {
  const [lit, glow] = cached("camp|" + name, () => {
    const L = [], Gl = [];
    const lvl = +(name.match(/\d+$/) || [1])[0];
    const base = name.replace(/\d+$/, "");
    if (base === "tent") {
      L.push(piece(G.cone(62, 76, 4), "#9c8460", { y: 38, ry: Math.PI / 4, sz: 0.8 }));
      L.push(box("#2a2018", 22, 40, 2, { y: 20, z: 40 }));
      L.push(piece(G.cyl(2, 2, 90, 4), "#5a4028", { y: 45 }));
    } else if (base === "banner") {
      L.push(piece(G.cyl(2.4, 3, 110, 5), "#5a4028", { y: 55 }));
      L.push(box("#5a4028", 40, 4, 4, { y: 104 }));
      L.push(box("#262a33", 34, 62, 1.5, { y: 70, z: 2 }));
      L.push(box("#c69a52", 10, 18, 2, { y: 76, z: 3 }));
      L.push(piece(G.cone(4, 10, 4), "#c69a52", { y: 116 }));
    } else if (base === "brazier") {
      for (let i = 0; i < 3; i++) L.push(piece(G.cyl(2.5, 3.5, 34, 4), "#2c2a2a", { x: Math.cos(i * 2.09) * 16, y: 15, z: Math.sin(i * 2.09) * 16, rz: Math.cos(i * 2.09) * -0.3, rx: Math.sin(i * 2.09) * 0.3 }));
      L.push(piece(G.cyl(30, 18, 20, 8), "#3a3532", { y: 38 }));
      L.push(piece(G.cyl(32, 30, 4, 8), "#4a4440", { y: 49 }));
      Gl.push(piece(G.dode(9), "#ff7a2a", { x: -10, y: 47, jitter: 0.3 }));
      Gl.push(piece(G.dode(10), "#ffa040", { x: 9, y: 47, z: 5, jitter: 0.3 }));
      Gl.push(piece(G.dode(8), "#d84a18", { y: 46, z: -10, jitter: 0.3 }));
    } else if (base === "forge") {
      const s = 0.8 + lvl * 0.12;
      L.push(box("#6f6a62", 80 * s, 46 * s, 54 * s, { y: 23 * s, jitter: 0.06 }));
      L.push(box("#5f5a54", 22 * s, 90 * s, 22 * s, { x: -26 * s, y: 45 * s, z: -12 * s }));
      L.push(box("#2a2420", 70 * s, 6, 60 * s, { y: 48 * s }));
      L.push(box("#3a3d42", 22, 14, 14, { x: 30 * s, y: 10, z: 34 * s }));
      Gl.push(box("#ff8a30", 26 * s, 20 * s, 2, { x: 8 * s, y: 18 * s, z: 27 * s + 1 }));
    } else if (base === "armory") {
      const s = 0.8 + lvl * 0.12;
      L.push(box("#5a4028", 4, 70 * s, 4, { x: -34 * s, y: 35 * s })); L.push(box("#5a4028", 4, 70 * s, 4, { x: 34 * s, y: 35 * s }));
      L.push(box("#5a4028", 76 * s, 5, 5, { y: 66 * s })); L.push(box("#5a4028", 76 * s, 5, 5, { y: 30 * s }));
      L.push(piece(G.cyl(16, 16, 4, 8), "#7a6a52", { x: -14 * s, y: 42 * s, z: 4, rx: Math.PI / 2 }));
      L.push(piece(G.cyl(5, 5, 5, 8), "#c69a52", { x: -14 * s, y: 42 * s, z: 7, rx: Math.PI / 2 }));
      for (let i = 0; i < lvl + 1; i++) L.push(piece(G.cyl(1.4, 1.4, 90 * s, 4), "#6a5030", { x: 10 * s + i * 8, y: 45 * s, z: 3, rz: 0.12 }));
      L.push(box("#8a9096", 14, 16, 14, { x: 20 * s, y: 8 }));
    } else if (base === "workbench") {
      const s = 0.85 + lvl * 0.1;
      L.push(box("#7a5a36", 80 * s, 6, 40 * s, { y: 32 }));
      for (const [x, z] of [[-34, -16], [34, -16], [-34, 16], [34, 16]]) L.push(box("#5a4028", 5, 32, 5, { x: x * s, y: 16, z: z * s }));
      L.push(box("#3a3d42", 14, 10, 8, { x: -20 * s, y: 40 }));
      L.push(box("#8a6a44", 26, 4, 6, { x: 12 * s, y: 37, ry: 0.4 }));
      Gl.push(piece(G.oct(4), "#ffb35a", { x: 30 * s, y: 42 }));
    } else if (base === "gardenBed") {
      L.push(box("#5a4028", 100, 10, 6, { y: 5, z: -36 })); L.push(box("#5a4028", 100, 10, 6, { y: 5, z: 36 }));
      L.push(box("#5a4028", 6, 10, 72, { x: -48, y: 5 })); L.push(box("#5a4028", 6, 10, 72, { x: 48, y: 5 }));
      L.push(box("#3a2c1e", 92, 6, 66, { y: 3 }));
      for (let i = 0; i < lvl * 5; i++) {
        const x = -38 + (i % 5) * 19, z = -22 + Math.floor(i / 5) * 22;
        L.push(piece(G.cone(5, 18, 3), "#3f6a3a", { x, y: 14, z }));
        Gl.push(piece(G.ico(4), "#5fe6ee", { x, y: 26, z }));
      }
    }
    return [merge(L), merge(Gl)];
  });
  return model(lit, glow, "camp|" + name);
}

// Fire: layered flame cones that flicker (Fire.update scales them).
export function fireModel(size = 1) {
  const g = new THREE.Group();
  const flame = (c, r, h, y) => {
    const m = new THREE.Mesh(merge([piece(G.cone(r, h, 5), c, { y: h / 2, vary: 0.3 })]), MAT.glow);
    m.position.y = y;
    g.add(m);
    return m;
  };
  g.userData.flames = [flame("#d8401a", 15 * size, 46 * size, 0), flame("#ff8a28", 10 * size, 36 * size, 2), flame("#ffe08a", 5 * size, 22 * size, 3)];
  g.userData.model = true;
  return g;
}
export function animateFire(g, t, k = 1) {
  const f = g.userData.flames;
  for (let i = 0; i < f.length; i++) {
    const s = k * (1 + Math.sin(t * (11 + i * 3) + i) * 0.12 + Math.sin(t * 5.3 + i * 2) * 0.08);
    f[i].scale.set(k * (1 + Math.sin(t * 7 + i) * 0.08), s, k * (1 + Math.cos(t * 6 + i) * 0.08));
    f[i].rotation.y = t * (0.8 + i * 0.5);
  }
}
export function torchModel() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(merge([piece(G.cyl(2, 3, 62, 5), "#5a4028", { y: 31 }), piece(G.cyl(4.5, 3.5, 10, 6), "#3a2a1a", { y: 62 })]), MAT.lit));
  const f = fireModel(0.42);
  f.position.y = 64;
  g.add(f);
  g.userData.fire = f;
  g.userData.model = true;
  return g;
}

/* ---------------- supplies ---------------- */
export function pickupModel(res) {
  const [lit, glow] = cached("res|" + res, () => {
    switch (res) {
      case "wood": return [merge([piece(G.cyl(4, 4, 18, 6), "#8a643c", { rz: Math.PI / 2, y: 5 }), piece(G.cyl(3.5, 3.5, 14, 6), "#a07a52", { rz: Math.PI / 2, y: 11, ry: 0.6 })]), null];
      case "stone": return [merge([piece(G.dode(7), "#9a9d9e", { y: 6, jitter: 0.4 })]), null];
      case "iron": return [merge([box("#c06a44", 12, 5, 7, { y: 4, ry: 0.4 }), box("#7a4a30", 8, 4, 9, { y: 8, ry: -0.5 })]), null];
      case "resin": return [null, merge([piece(G.oct(6), "#43e6ee", { y: 8, sy: 1.5 })])];
      case "pearl": return [null, merge([piece(G.oct(6), "#bfa8ff", { y: 8, sy: 1.6 })])];
      case "black": return [merge([piece(G.ico(6, 1), "#2a3346", { y: 6 })]), null];
    }
    return [merge([box("#fff", 6, 6, 6)]), null];
  });
  return model(lit, glow, "res|" + res);
}

/* ---------------- figures: the knights and the Drowned ----------------
   A figure stands about 80 px tall facing +z, built from a body (torso, cloak, hood), two legs and two arms
   on pivots so they can swing, a weapon in the right hand, and a lantern or shield in the left. */
export const FIGURES = {
  lanternBlade: { cloth: "#5a3f2a", cloth2: "#3e2c1e", armor: "#9aa0a6", face: "#1a1410", eye: "#ffd08a", weapon: "sword", lantern: "#ffb050" },
  pikeWarden: { cloth: "#6a5238", cloth2: "#4a3826", armor: "#a8a49a", face: "#1a1410", eye: "#ffd08a", weapon: "pike", lantern: "#ffc070" },
  ashenArbalist: { cloth: "#5c5448", cloth2: "#3f3a32", armor: "#8a8478", face: "#1a1410", eye: "#ffb070", weapon: "crossbow", lantern: "#ff9a50", lanternBelt: true },
  squire: { cloth: "#8c7a62", cloth2: "#6a5c48", armor: "#5b5f66", face: "#0c1416", eye: "#5fe6ee", weapon: "sword", scale: 0.82, rags: true },
  footman: { cloth: "#a8957a", cloth2: "#7c6c56", armor: "#50545b", face: "#0c1416", eye: "#5fe6ee", weapon: "sword", lantern: "#5fe6ee", rags: true },
  archer: { cloth: "#7f8a86", cloth2: "#5e6864", armor: "#4c5056", face: "#0c1416", eye: "#5fe6ee", weapon: "bow", scale: 0.95, rags: true },
  revenant: { cloth: "#6c7a80", cloth2: "#4e5a60", armor: "#6c7a80", face: "#0c1416", eye: "#5fe6ee", weapon: "claws", scale: 0.85, hunch: 0.9, rags: true },
  defiler: { cloth: "#7a5048", cloth2: "#5a3832", armor: "#4a4446", face: "#0c1416", eye: "#ff8a6a", weapon: "sword", lantern: "#5fe6ee", scale: 1.05, rags: true },
  blackguard: { cloth: "#5a5650", cloth2: "#3f3c38", armor: "#c9c0a8", face: "#0c1416", eye: "#5fe6ee", weapon: "sword", shield: "#bdb49a", scale: 1.15 },
  champion: { cloth: "#2e3240", cloth2: "#1f222c", armor: "#3a3d48", face: "#0c1416", eye: "#5fe6ee", weapon: "greatsword", lantern: "#5fe6ee", crown: true, scale: 1.45 },
  hexbearer: { cloth: "#4f6a70", cloth2: "#384c52", armor: "#3e4a50", face: "#0c1416", eye: "#5fe6ee", weapon: "staff", scale: 1.05, rags: true },
  self: { cloth: "#5a3f2a", cloth2: "#3e2c1e", armor: "#9aa0a6", face: "#0c1416", eye: "#5fe6ee", weapon: "sword", lantern: "#5fe6ee", scale: 1.05 },
};

function figureParts(key) {
  return cached("fig|" + key, () => {
    const F = FIGURES[key];
    const body = [], bodyGl = [], legL = [], legR = [], armR = [], armRGl = [], armL = [], armLGl = [];
    // body: torso, belt, cloak, hood
    body.push(piece(G.cyl(10, 12, 28, 7), F.armor, { y: 44 }));
    body.push(box(F.cloth2, 22, 4, 16, { y: 31 }));
    body.push(piece(G.cone(19, 50, 7), F.cloth, { y: 36, z: -3, jitter: F.rags ? 0.22 : 0.08 }));
    body.push(box(F.armor, 30, 7, 14, { y: 56 })); // shoulders
    if (F.rags) body.push(piece(G.cone(10.5, 22, 6), F.cloth, { y: 70, jitter: 0.15 }));
    else { // a knight's helm with a crest
      body.push(piece(G.cyl(8.5, 9.5, 15, 7), F.armor, { y: 66, vary: 0.08 }));
      body.push(piece(G.cone(9.5, 7, 7), F.armor, { y: 77 }));
      body.push(box(F.cloth, 2.5, 7, 14, { y: 80, z: -2 }));
      body.push(box(F.face, 12, 2, 2, { y: 66, z: 8.6 }));
    }
    body.push(piece(G.ico(7.5, 0), F.face, { y: 62, z: 1.5 }));
    if (F.rags) for (let i = 0; i < 6; i++) body.push(piece(G.cone(4, 16, 3), F.cloth2, { x: Math.cos(i) * 16, y: 12, z: Math.sin(i) * 12 - 3, rx: Math.PI }));
    if (F.crown) for (let i = 0; i < 5; i++) body.push(piece(G.cone(2, 10, 4), "#c69a52", { x: Math.cos(i * 1.256) * 8, y: 78, z: Math.sin(i * 1.256) * 8 }));
    const ey = F.rags ? 63 : 66, ez = F.rags ? 8.5 : 9.4; // eyes in the hood, or glinting through the visor
    bodyGl.push(box(F.eye, 2.6, 1.8, 1.5, { x: -3, y: ey, z: ez }), box(F.eye, 2.6, 1.8, 1.5, { x: 3, y: ey, z: ez }));
    // legs (pivot at the hip)
    for (const [L, x] of [[legL, -5], [legR, 5]]) {
      L.push(box(F.armor, 7, 26, 8, { x: 0, y: -13 }));
      L.push(box(F.cloth2, 8, 5, 11, { x: 0, y: -27, z: 2 }));
      void x;
    }
    // arms (pivot at the shoulder)
    for (const A of [armL, armR]) {
      A.push(box(F.armor, 6, 24, 6, { y: -12 }));
      A.push(box(F.cloth2, 7, 6, 7, { y: -24 }));
    }
    // the weapon, held in the right hand (the hand is at y -24; +z is forward)
    const W = F.weapon;
    if (W === "sword" || W === "greatsword") {
      const k = W === "greatsword" ? 1.6 : 1;
      armR.push(box("#3a2716", 3, 3, 10, { y: -26, z: 2 }));
      armR.push(box("#7a5a2c", 16, 3, 3, { y: -26, z: 7 }));
      armR.push(box("#c8d0d4", 2, 5 * k, 44 * k, { y: -26, z: 8 + 22 * k, vary: 0.05 }));
      if (F.eye === "#5fe6ee") armRGl.push(box("#5fe6ee", 0.8, 1.4, 40 * k, { y: -24, z: 8 + 22 * k }));
    } else if (W === "pike") {
      armR.push(piece(G.cyl(1.8, 1.8, 150, 5), "#6a4a2c", { y: -26, z: 40, rx: Math.PI / 2 }));
      armR.push(piece(G.cone(4, 20, 4), "#d0d6da", { y: -26, z: 125, rx: Math.PI / 2 }));
    } else if (W === "crossbow") {
      armR.push(box("#4b331f", 5, 6, 36, { y: -26, z: 14 }));
      armR.push(box("#3a3d42", 46, 3, 4, { y: -24, z: 28 }));
      armR.push(box("#c9c0a8", 40, 0.8, 0.8, { y: -24, z: 24 }));
    } else if (W === "bow") {
      armL.push(piece(new THREE.TorusGeometry(22, 1.6, 3, 8, Math.PI), "#5a4028", { y: -24, z: 4, rz: Math.PI / 2 }));
      armL.push(box("#c9c0a8", 0.6, 44, 0.6, { y: -24, z: 4 }));
    } else if (W === "staff") {
      armR.push(piece(G.cyl(1.8, 2.2, 90, 5), "#3a2c22", { y: -10 }));
      armRGl.push(piece(G.ico(6, 0), "#5fe6ee", { y: 38 }));
    } else if (W === "claws") {
      for (let i = -1; i <= 1; i++) armR.push(piece(G.cone(1.4, 12, 3), "#d8d2c0", { x: i * 2.5, y: -30, z: 5, rx: Math.PI / 2.4 }));
      for (let i = -1; i <= 1; i++) armL.push(piece(G.cone(1.4, 12, 3), "#d8d2c0", { x: i * 2.5, y: -30, z: 5, rx: Math.PI / 2.4 }));
    }
    // the left hand: a lantern, or a shield
    if (F.shield) {
      armL.push(piece(G.cyl(18, 18, 4, 7), F.shield, { y: -16, z: 7, rx: Math.PI / 2, sx: 0.9, sz: 1.2 }));
      armL.push(piece(G.cone(4, 6, 5), "#7a705c", { y: -16, z: 11, rx: Math.PI / 2 }));
    } else if (F.lantern && !F.lanternBelt) {
      armL.push(piece(G.cyl(1, 1, 8, 3), "#2a2622", { y: -30 }));
      armL.push(box("#3b2c1c", 10, 2, 10, { y: -34 }), box("#3b2c1c", 10, 2, 10, { y: -48 }));
      armLGl.push(box(F.lantern, 7, 12, 7, { y: -41, vary: 0.1 }));
    }
    if (F.lanternBelt) {
      body.push(box("#3b2c1c", 8, 2, 8, { x: -13, y: 32, z: 4 }), box("#3b2c1c", 8, 2, 8, { x: -13, y: 21, z: 4 }));
      bodyGl.push(box(F.lantern, 6, 9, 6, { x: -13, y: 26.5, z: 4 }));
    }
    return { body: merge(body), bodyGl: merge(bodyGl), legL: merge(legL), legR: merge(legR), armL: merge(armL), armLGl: merge(armLGl), armR: merge(armR), armRGl: merge(armRGl) };
  });
}

export function figure(key) {
  const F = FIGURES[key] || FIGURES.footman, P = figureParts(key);
  const root = new THREE.Group(), pivot = new THREE.Group(), upper = new THREE.Group();
  root.add(pivot);
  pivot.add(upper);
  const lit = [];
  const add = (geo, parent, mat, x = 0, y = 0, z = 0) => {
    if (!geo) return null;
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    if (mat === MAT.lit) lit.push(m);
    return m;
  };
  add(P.body, upper, MAT.lit);
  add(P.bodyGl, upper, MAT.glow);
  const legL = new THREE.Group(), legR = new THREE.Group(), armL = new THREE.Group(), armR = new THREE.Group();
  legL.position.set(-5, 30, 0); legR.position.set(5, 30, 0);
  armL.position.set(-15, 56, 0); armR.position.set(15, 56, 0);
  pivot.add(legL, legR);
  upper.add(armL, armR);
  add(P.legL, legL, MAT.lit); add(P.legR, legR, MAT.lit);
  add(P.armL, armL, MAT.lit); add(P.armLGl, armL, MAT.glow);
  add(P.armR, armR, MAT.lit); add(P.armRGl, armR, MAT.glow);
  const s = F.scale || 1;
  root.scale.setScalar(s);
  root.userData = { model: true, figure: true, F, pivot, upper, legL, legR, armL, armR, lit, look: "" };
  if (F.hunch) { upper.rotation.x = F.hunch * 0.6; upper.position.z = 8; }
  if (F.lantern && !F.shield && !F.lanternBelt) armL.rotation.x = -0.35; // the lantern held out a little
  return root;
}

/* Pose a figure. s: { t, moving, state ("move" | "windup" | "strike"), stT (strike time left), dead (0..1),
   look ("" | "flash" | "burn" | "self"), angle (the way it faces, in the game's ground angle) }. */
export function poseFigure(m, s) {
  const u = m.userData, F = u.F;
  m.rotation.y = Math.PI / 2 - s.angle;
  const look = s.look || "";
  if (look !== u.look) {
    const mat = look === "flash" ? MAT.flash : look === "burn" ? MAT.burn : look === "self" ? MAT.self : MAT.lit;
    for (const l of u.lit) l.material = mat;
    u.look = look;
  }
  const w = s.moving ? Math.sin(s.t * 9) : 0;
  u.legL.rotation.x = w * 0.6;
  u.legR.rotation.x = -w * 0.6;
  const hold = F.lantern && !F.shield && !F.lanternBelt ? -0.35 : F.weapon === "bow" ? -0.2 : 0;
  u.armL.rotation.x = hold - w * 0.3;
  let ar = w * 0.35, al = u.armL.rotation.x;
  if (F.weapon === "pike" || F.weapon === "crossbow") ar = -1.25 + w * 0.08; // carried levelled
  if (F.weapon === "staff") ar = -0.3;
  if (s.state === "windup") {
    if (F.weapon === "bow") { al = -1.5; ar = -1.2; }
    else if (F.weapon === "staff") ar = -2.4;
    else if (F.weapon === "pike" || F.weapon === "crossbow") ar = -1.0;
    else ar = -2.7;
  } else if (s.state === "strike") {
    const k = Math.max(0, Math.min(1, (0.22 - (s.stT || 0)) / 0.12));
    if (F.weapon === "bow") { al = -1.5; ar = -1.5 + k * 0.4; }
    else if (F.weapon === "staff") ar = -2.4 + k * 1.2;
    else if (F.weapon === "pike") { ar = -1.45; u.armR.position.z = 10 * Math.sin(k * Math.PI); }
    else if (F.weapon === "crossbow") ar = -1.25 - Math.sin(k * Math.PI) * 0.3;
    else ar = -2.7 + k * 2.2;
  } else u.armR.position.z = 0;
  u.armR.rotation.x = ar;
  u.armL.rotation.x = al;
  // the body sways as it walks, and leans into a blow
  u.pivot.position.y = s.moving ? Math.abs(Math.cos(s.t * 9)) * 2 : 0;
  u.upper.rotation.z = s.moving ? Math.sin(s.t * 9) * 0.04 : 0;
  // slain: it topples backwards
  const d = s.dead || 0;
  u.pivot.rotation.x = -d * 1.45;
  u.pivot.position.z = -d * 20;
}
