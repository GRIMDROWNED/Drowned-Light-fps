/* Drowned Light FPS — the original game's drawn sprites, loaded as textures for billboards in the 3D marsh.
   Every image is kept for pixel access too: the cyan glow of the Drowned (eyes, lanterns, blades) and of the blooms
   is lifted into a glow map so it still burns in the dark, where the rest of the sprite falls into shadow. */
import * as THREE from "../vendor/three.module.min.js";
import { ENEMY_TYPES } from "./data.js";

export const VERSION = "0.1.0";
const v = (url) => url + "?v=" + VERSION;

const FRAMES = ["attackA", "attackB", "attackC", "back", "front", "right", "walkB1", "walkB2", "walkB3", "walkB4", "walkF1", "walkF2", "walkF3", "walkF4"];
const SIDE = ["death", "hurt", "walk1", "walk2", "walk3", "walk4"];
const PROPS = [
  ...[1, 2, 3].flatMap((a) => [1, 2, 3, 4].map((b) => `swampTree${a}${b}`)),
  ...[1, 2, 3, 4].flatMap((a) => [1, 2, 3].map((b) => `boulder${a}${b}`)),
  ...[1, 2, 3].flatMap((a) => [1, 2, 3].map((b) => `iron${a}${b}`)),
  ...[1, 2, 3].flatMap((a) => [1, 2, 3].map((b) => `amethyst${a}${b}`)),
  ...[1, 2, 3].flatMap((a) => [1, 2, 3].map((b) => `blackPearl${a}${b}`)),
  "sproutOn", "sproutOn2", "sproutOff", "sproutOff2", "sproutBare",
  "reeds1", "reeds2", "reeds3", "reeds4", "reeds5", "reeds6",
  "refugeOn", "refugeOff", "sentinelOn", "sentinelOff",
  "fire1", "fire2", "fire3", "fire4", "fire5", "fire6", "torch", "burnt", "tent", "banner", "brazier",
  "forge1", "forge2", "forge3", "forge4", "armory1", "armory2", "armory3", "armory4",
  "workbench1", "workbench2", "workbench3", "workbench4", "gardenBed1", "gardenBed2", "gardenBed3",
  "resWood", "resStone", "resResin", "resIron", "resPearl", "resBlack", "soulOrb",
];
const GROUND = ["grass", "dirt", "shallow", "deep", "shore", "campEarth", "campPaving"];

export const Assets = {
  images: {},   // name -> HTMLImageElement
  tex: {},      // name -> THREE.Texture
  glow: {},     // name -> THREE.Texture of its glowing pixels (or null)
  pixels: {},   // ground tile name -> ImageData
  list() {
    const out = [];
    for (const t of ENEMY_TYPES) {
      for (const f of FRAMES) out.push([`${t}/${f}`, `assets/sprites/drowned/${t}/${f}.png`]);
      for (const f of SIDE) out.push([`${t}/side/${f}`, `assets/sprites/drowned/${t}/side/${f}.png`]);
    }
    for (const f of FRAMES) out.push([`lantern-knight/${f}`, `assets/sprites/lantern-knight/${f}.png`]);
    for (const f of SIDE) out.push([`lantern-knight/side/${f}`, `assets/sprites/lantern-knight/side/${f}.png`]);
    for (const p of PROPS) out.push([p, `assets/sprites/props/${p}.png`]);
    for (const g of GROUND) out.push(["ground/" + g, `assets/sprites/ground/${g}.png`]);
    return out;
  },
  async load(onProgress) {
    const list = this.list();
    let done = 0;
    await Promise.all(list.map(([name, url]) => new Promise((res) => {
      const img = new Image();
      img.onload = () => { this.images[name] = img; done++; onProgress && onProgress(done / list.length); res(); };
      img.onerror = () => { console.warn("missing sprite", url); done++; res(); };
      img.src = v(url);
    })));
    for (const name in this.images) {
      const img = this.images[name];
      if (name.startsWith("ground/")) {
        const c = document.createElement("canvas");
        c.width = img.width; c.height = img.height;
        const g = c.getContext("2d");
        g.drawImage(img, 0, 0);
        this.pixels[name.slice(7)] = g.getImageData(0, 0, c.width, c.height);
        continue;
      }
      this.tex[name] = makeTex(img);
      this.glow[name] = glowMap(img, name);
    }
  },
  size(name) { const i = this.images[name]; return i ? [i.width, i.height] : [32, 32]; },
};

function makeTex(src) {
  const t = new THREE.Texture(src);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

// The cyan of the drowned light (and the purple of amethyst) glows on its own in the dark.
function glowMap(img, name) {
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  let d;
  try { d = g.getImageData(0, 0, c.width, c.height); } catch (e) { return null; } // file:// blocks pixel access
  const px = d.data;
  const fire = /^(fire|torch)/.test(name);
  let any = 0;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], gg = px[i + 1], b = px[i + 2], a = px[i + 3];
    const cyan = b > 140 && gg > 130 && r < 150 && b - r > 50;
    const violet = name.startsWith("amethyst") && b > 150 && r > 120 && gg < 140;
    const warm = fire && r > 200 && gg > 90;
    if (a > 100 && (cyan || violet || warm)) { any++; continue; }
    px[i] = px[i + 1] = px[i + 2] = 0;
  }
  if (!any) return null;
  g.putImageData(d, 0, 0);
  return makeTex(c);
}

/* ---------------- billboards ----------------
   A billboard is a flat card standing on its bottom edge that turns to face the camera (World.faceCamera).
   Every sprite has its own shared material (one per look: plain, struck, burning, or your drowned self), and a
   card changes sprite by changing material: swapping the texture on a live material isn't reliable everywhere. */
const unitPlane = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
const matCache = new Map();
// Sprites that glow nowhere get this black glow map, so every sprite material is built alike.
const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
black.needsUpdate = true;
const LOOKS = {
  "": { color: [1, 1, 1], emissive: [1, 1, 1], glow: true },
  flash: { color: [1, 1, 1], emissive: [0.8, 0.8, 0.8], whole: true },
  burn: { color: [1, 0.8, 0.6], emissive: [0.9, 0.45, 0.12], whole: true },
  self: { color: [0.45, 0.75, 0.8], emissive: [0.6, 1, 1], glow: true },
};

export function spriteMaterial(name, look = "") {
  const key = name + "|" + look;
  let m = matCache.get(key);
  if (m) return m;
  const L = LOOKS[look];
  const map = Assets.tex[name] || null;
  m = new THREE.MeshLambertMaterial({
    map, alphaTest: 0.5, side: THREE.DoubleSide,
    color: new THREE.Color(...L.color), emissive: new THREE.Color(...L.emissive),
    emissiveMap: L.whole ? map : (Assets.glow[name] || black),
  });
  matCache.set(key, m);
  return m;
}
export function setSprite(mesh, name, scale, flip = false, look = "") {
  const [w, h] = Assets.size(name);
  const mat = spriteMaterial(name, look);
  if (mesh.material !== mat) mesh.material = mat;
  mesh.userData.sprite = name;
  mesh.scale.set(w * scale * (flip ? -1 : 1), h * scale, 1);
}
export function billboard(name, scale = 1) {
  const mesh = new THREE.Mesh(unitPlane, spriteMaterial(name));
  setSprite(mesh, name, scale);
  return mesh;
}

// Unlit, additive glow cards for fire, blooms and spells.
let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.25, "rgba(255,255,255,0.45)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}
const centrePlane = new THREE.PlaneGeometry(1, 1);
export function glowCard(color, size, opacity = 1) {
  const m = new THREE.MeshBasicMaterial({ map: glowTexture(), color: new THREE.Color(color), transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const mesh = new THREE.Mesh(centrePlane, m);
  mesh.scale.set(size, size, 1);
  return mesh;
}
// Unlit sprite (fire): always full bright. Animate it with setFire.
const fireMats = new Map();
function fireMat(name) {
  let m = fireMats.get(name);
  if (!m) { m = new THREE.MeshBasicMaterial({ map: Assets.tex[name], alphaTest: 0.4, side: THREE.DoubleSide }); fireMats.set(name, m); }
  return m;
}
export function setFire(mesh, name, scale) {
  const [w, h] = Assets.size(name);
  mesh.material = fireMat(name);
  mesh.scale.set(w * scale, h * scale, 1);
}
export function fireCard(name, scale) {
  const mesh = new THREE.Mesh(unitPlane, fireMat(name));
  setFire(mesh, name, scale);
  return mesh;
}
