/* Drowned Light FPS — the base camp: the Central Flame in its brazier, tents and banners by tier, and the
   structures you build, each standing where it stands in the top-down game (src/camp.js there). */
import * as THREE from "../vendor/three.module.min.js";
import { billboard, setSprite, fireCard, setFire, glowCard } from "./assets.js";
import { Style, campModel, fireModel, animateFire } from "./models.js";

export const Camp = {
  group: null,
  key: "",
  solids: [],
  fire: null,
  fireGlow: null,

  tier: (up) => (up.flame >= 5 ? 3 : up.flame >= 3 ? 2 : 1),

  layout(up) {
    const tier = this.tier(up);
    const L = { tier, items: [] };
    const add = (name, x, y, scale, solid = 0, flip = false) => L.items.push({ name, x, y, scale, solid, flip });
    add("tent", -82, -70, 1.7, 34);
    if (tier >= 2) add("tent", 80, -78, 1.7, 34, true);
    if (tier >= 3) { add("tent", -34, -132, 1.7, 34); add("tent", 40, -128, 1.7, 34, true); }
    add("banner", -30, -34, 1.3, 6);
    if (tier >= 2) add("banner", 30, -34, 1.3, 6);
    if (tier >= 3) { add("banner", -58, 38, 1.3, 6); add("banner", 58, 38, 1.3, 6); }
    if (up.forge) add("forge" + up.forge, -138, 14, 1.5, 34);
    if (up.armory) add("armory" + up.armory, 136, 16, 1.5, 34);
    if (up.workbench) add("workbench" + up.workbench, -50, 150, 1.5, 30);
    if (up.garden) add("gardenBed" + up.garden, 66, 140, 1.4, 0);
    return L;
  },

  build(scene, up, groundH) {
    const key = JSON.stringify(up);
    if (key === this.key && this.group) return;
    this.key = key;
    if (this.group) scene.remove(this.group);
    const g = (this.group = new THREE.Group());
    this.solids = [{ x: 0, y: 0, r: 30 }];
    this.billboards = [];
    const L = this.layout(up);
    for (const it of L.items) {
      let m;
      if (Style.models) {
        m = campModel(it.name);
        m.rotation.y = Math.atan2(-it.x, -it.y); // turned to face the fire
        m.position.set(it.x, groundH(it.x, it.y) - 1, it.y);
      } else {
        m = billboard(it.name, it.scale);
        setSprite(m, it.name, it.scale, it.flip);
        m.position.set(it.x, groundH(it.x, it.y) - 2, it.y);
        this.billboards.push(m);
      }
      g.add(m);
      if (it.solid) this.solids.push({ x: it.x, y: it.y, r: it.solid });
    }
    // the Central Flame: an iron brazier with the drawn fire dancing in it
    const br = Style.models ? campModel("brazier") : billboard("brazier", 1.8);
    br.position.set(0, groundH(0, 0) - 1, 0);
    g.add(br);
    if (!Style.models) this.billboards.push(br);
    this.fire = Style.models ? fireModel(1.5) : fireCard("fire1", 1.5);
    this.fire.position.set(0, groundH(0, 0) + (Style.models ? 30 : 46), 0);
    g.add(this.fire);
    this.fireGlow = glowCard(0xffa040, 170, 0.4);
    this.fireGlow.position.set(0, groundH(0, 0) + 92, 0);
    g.add(this.fireGlow);
    scene.add(g);
    this.tierNow = L.tier;
  },

  update(t, yaw, lit, strength) {
    if (!this.group) return;
    for (const b of this.billboards) b.rotation.y = yaw;
    const f = this.fire;
    f.visible = lit;
    if (f.userData.flames) animateFire(f, t, 0.8 + 0.35 * strength);
    else {
      f.rotation.y = yaw;
      setFire(f, "fire" + (1 + (Math.floor(t * 9) % 6)), 1.2 + 0.5 * strength);
    }
    this.fireGlow.visible = lit;
    this.fireGlow.rotation.y = yaw;
    this.fireGlow.material.opacity = 0.3 + Math.sin(t * 11) * 0.05 + Math.sin(t * 3.7) * 0.04;
  },
};
