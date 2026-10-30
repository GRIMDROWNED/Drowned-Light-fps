/* Drowned Light FPS — game data. Tune balance here.
   Distances are in the original game's world px (1 px ≈ 2.5 cm; the knight stands 82 px tall). Most numbers come
   straight from the top-down game's src/data.js; reaches are stretched where a first-person view needs it. */

// Seconds per phase of the day/night cycle.
export const CYCLE = { day: 80, dusk: 10, night: 75, dawn: 8 };
CYCLE.total = CYCLE.day + CYCLE.dusk + CYCLE.night + CYCLE.dawn;

export const EYE = 64;          // eye height above the ground
export const PLAYER_R = 12;     // the knight's body radius
export const CAMP_RADIUS = 205; // deposit + camp menu range
export const GARDEN_YIELD = [0, 4, 8, 14];
export const TIER_NAMES = ["", "A Place to Rest", "A Growing Bastion", "A Beacon in the Marsh"];

export const RESOURCES = {
  wood: { name: "Wood", color: "#a07a52", icon: "resWood" },
  stone: { name: "Stone", color: "#9a9d9e", icon: "resStone" },
  resin: { name: "Bloom Resin", color: "#43e6ee", icon: "resResin" },
  iron: { name: "Iron Scrap", color: "#c06a44", icon: "resIron" },
  pearl: { name: "Amethyst", color: "#bfa8ff", icon: "resPearl" },
  black: { name: "Black Pearl", color: "#5d6b8c", icon: "resBlack" },
};
export const RES_KEYS = Object.keys(RESOURCES);

// Zones are rings around the camp. Deeper = darker, deadlier, richer.
export const ZONES = [
  { name: "Camp Clearing", r: 0, corrupt: 1, hp: 1, dmg: 1, yield: 1, density: 0, dim: 0, pool: {} },
  { name: "The Shallows", r: 380, corrupt: 1, hp: 1, dmg: 1, yield: 1, density: 9, dim: 0,
    pool: { squire: 5, footman: 3, revenant: 1 } },
  { name: "The Mire", r: 1300, corrupt: 1.25, hp: 1.35, dmg: 1.2, yield: 1.6, density: 11, dim: 0.08,
    pool: { squire: 4, footman: 4, archer: 3, revenant: 2, defiler: 2, hexbearer: 1 } },
  { name: "Drowned Reaches", r: 2600, corrupt: 1.55, hp: 1.8, dmg: 1.45, yield: 2.3, density: 13, dim: 0.2,
    pool: { squire: 3, footman: 4, archer: 3, revenant: 3, defiler: 3, blackguard: 2, hexbearer: 2, champion: 0.15 } },
  { name: "The Abyss", r: 4000, corrupt: 2, hp: 2.4, dmg: 1.75, yield: 3.2, density: 14, dim: 0.5, abyss: true,
    pool: { footman: 3, archer: 3, revenant: 3, defiler: 3, blackguard: 3, hexbearer: 3, champion: 0.5 } },
];

// What grows where (weights), per zone index.
export const SPAWN_TABLE = [
  {},
  { tree: 4, gap: 11.6, stone: 2.5, sprout: 2, reeds: 4 },
  { tree: 3, gap: 11.1, stone: 2, iron: 2.5, sprout: 3, reeds: 3 },
  { tree: 2.5, gap: 11.1, stone: 1.5, iron: 4, pearl: 1.5, sprout: 3.5, reeds: 2 },
  { tree: 2, gap: 11, stone: 1.5, iron: 5, pearl: 2, black: 0.7, sprout: 4, reeds: 1 },
];

// Bloom groves: clumps of glowing plants, at most one per cell of the grove grid, with real darkness between them.
export const GROVE = {
  cell: 1280, margin: 400, chance: 0.8, spread: 150, clear: 190,
  zones: [
    null,
    { refuge: [4, 6], sentinel: [0, 0], sprout: [2, 3] },
    { refuge: [3, 5], sentinel: [1, 1], sprout: [2, 4] },
    { refuge: [3, 4], sentinel: [1, 2], sprout: [3, 4] },
    { refuge: [2, 3], sentinel: [2, 3], sprout: [3, 5] },
  ],
};

/* World objects. `solid` = collision radius, `hits` = strikes to mine it, `scale` = how big its sprite stands in the
   first-person world (the top-down art was drawn small to be seen from above). `stages` = sprite per damage stage. */
export const OBJ = {
  tree: { name: "Swamp Tree", verb: "Chop", res: "wood", base: 6, hits: 5, solid: 20, scale: 2.1, variants: 3,
    sprite: (v, s) => `swampTree${v}${s}`, stageCount: 4 },
  stone: { name: "Boulder", verb: "Break", res: "stone", base: 6, hits: 6, solid: 18, scale: 1.25, variants: 4,
    sprite: (v, s) => `boulder${v}${s}`, stageCount: 3 },
  iron: { name: "Iron Scrap", verb: "Pry", res: "iron", base: 2, hits: 5, solid: 0, scale: 1.1, variants: 3,
    sprite: (v, s) => `iron${v}${s}`, stageCount: 3 },
  pearl: { name: "Amethyst", verb: "Break", res: "pearl", base: 1, hits: 4, solid: 0, scale: 1.1, variants: 3, glow: "191,140,255",
    sprite: (v, s) => `amethyst${v}${s}`, stageCount: 3 },
  black: { name: "Black Pearl Clam", verb: "Pry", res: "black", base: 0.45, hits: 6, solid: 0, scale: 1.1, variants: 3,
    sprite: (v, s) => `blackPearl${v}${s}`, stageCount: 3 },
  sprout: { name: "Bloom Sprout", verb: "Harvest", res: "resin", base: 2, hits: 2, solid: 0, scale: 1.0, variants: 2,
    sprite: (v, s, night) => (s > 1 ? "sproutBare" : (night ? "sproutOn" : "sproutOff") + (v === 2 ? "2" : "")), stageCount: 2 },
  reeds: { name: "Reeds", solid: 0, scale: 1.2, variants: 6, sprite: (v) => `reeds${v}` },
  refuge: { name: "Refuge Bloom", bloom: true, light: 125, hp: 70, solid: 10, scale: 1.3, sprite: (v, s, night) => (night ? "refugeOn" : "refugeOff") },
  sentinel: { name: "Sentinel Bloom", bloom: true, light: 95, hp: 100, solid: 10, scale: 1.3, turret: true,
    sprite: (v, s, night) => (night ? "sentinelOn" : "sentinelOff") },
};

// Every Drowned Knight wears the player's armour, corrupted.
export const ENEMIES = {
  squire: { name: "Mire Stalker", hp: 16, speed: 92, dmg: 6, range: 34, windup: 0.32, cd: 1.0, scale: 0.78,
    radius: 10, zigzag: true, lunge: 380, drop: { iron: 0.15 } },
  footman: { name: "Drowned Wretch", hp: 34, speed: 58, dmg: 11, range: 40, windup: 0.45, cd: 1.4, scale: 1,
    radius: 13, corruptHit: 4, drop: { iron: 0.4 } },
  archer: { name: "Tide Archer", hp: 22, speed: 64, dmg: 9, range: 300, windup: 0.7, cd: 2.3, scale: 0.95,
    radius: 12, ranged: true, keep: 200, drop: { iron: 0.3 } },
  revenant: { name: "Swarming Revenant", hp: 9, speed: 104, dmg: 5, range: 28, windup: 0.25, cd: 0.9, scale: 0.85,
    radius: 8, crawl: true, drop: { resin: 0.1 } },
  defiler: { name: "Lantern Reaver", hp: 44, speed: 52, dmg: 12, range: 44, windup: 0.6, cd: 1.6, scale: 1.05,
    radius: 13, targetsLight: true, lightDmg: 26, snuff: 90, drop: { resin: 0.6, iron: 0.3 } },
  blackguard: { name: "Bone Bulwark", hp: 140, speed: 40, dmg: 20, range: 48, windup: 0.75, cd: 2.0, scale: 1.15,
    radius: 18, armor: 0.35, shield: 0.7, drop: { iron: 1 } },
  champion: { name: "Drowned Sovereign", hp: 520, speed: 56, dmg: 28, range: 74, windup: 0.8, cd: 2.2, scale: 1.5,
    radius: 24, armor: 0.2, boss: true, drop: { iron: 1, pearl: 1 } },
  hexbearer: { name: "Marsh Hexbearer", hp: 38, speed: 50, dmg: 8, range: 300, windup: 0.9, cd: 2.6, scale: 1.05,
    radius: 13, ranged: true, keep: 220, caster: true, drop: { resin: 0.7, pearl: 0.05 } },
  self: { name: "Your Drowned Self", hp: 200, speed: 70, dmg: 15, range: 48, windup: 0.5, cd: 1.3, scale: 1.05,
    radius: 14, boss: true, drop: {}, art: "lantern-knight" },
};
export const ENEMY_TYPES = ["squire", "footman", "archer", "revenant", "defiler", "blackguard", "champion", "hexbearer"];

export const campPool = function (day) {
  const p = { squire: 5, footman: 3 };
  if (day >= 2) p.archer = 2;
  if (day >= 3) { p.defiler = 2; p.revenant = 2; }
  if (day >= 4) p.blackguard = 1;
  if (day >= 5) p.hexbearer = 1;
  return p;
};

/* Kits. A kit = weapon + dash + signature ability, chosen when a game starts and kept for that save.
   Three of the original seven made the trip to first person so far. Reaches are longer than top-down. */
export const KITS = {
  lanternBlade: {
    name: "Lantern Blade", tag: "Kit 01", motto: "A light still endures.", color: "255,197,106",
    desc: "A faithful blade and a lantern that holds back the dark. Quick sword arcs; your dash is a Lantern Strike that cuts through the Drowned.",
    attack: { type: "arc", name: "Blade Arc", dmg: 12, range: 105, arc: 1.5, cd: 0.42, kb: 150 },
    dash: { type: "strike", dmg: 9 },
    ability: { id: "illuminate", name: "Illuminate", oil: 15, cd: 14, radius: 170, dmg: 22, dur: 5,
      desc: "A burst of firelight that burns and repels the Drowned and leaves a short-lived sanctuary." },
  },
  pikeWarden: {
    name: "Pike Warden", tag: "Kit 02", motto: "Reach keeps the dark away.", color: "255,214,140",
    desc: "Extended reach and a stable form. Pike Thrust strikes everything along a line and drives it back. Stand still a moment and your thrusts hit 15% harder.",
    attack: { type: "thrust", name: "Pike Thrust", dmg: 15, range: 150, width: 30, cd: 0.6, kb: 240 },
    dash: { type: "plain" },
    passive: { stance: { after: 0.35, dmg: 1.15, guard: 0.25 } },
    ability: { id: "sweep", name: "Warding Sweep", oil: 12, cd: 11, radius: 130, dmg: 18,
      desc: "A full circle of the pike: hurls the Drowned back and knocks arrows from the air." },
  },
  ashenArbalist: {
    name: "Ashen Arbalist", tag: "Kit 03", motto: "Quiet light. Farther truths.", color: "255,160,80",
    desc: "Piercing shots and a steady aim. Bolts strike up to 35% harder the farther they fly.",
    attack: { type: "bolt", name: "Piercing Bolt", dmg: 14, range: 700, cd: 0.75, pierce: 1, speed: 1400 },
    dash: { type: "plain" },
    passive: { farShot: { from: 100, to: 420, bonus: 0.35 } },
    ability: { id: "scatter", name: "Scatter Shot", oil: 12, cd: 10, count: 7, dmg: 12,
      desc: "A fan of bolts. Where each one lands, light flares and reveals the dark." },
  },
};
export const KIT_ORDER = ["lanternBlade", "pikeWarden", "ashenArbalist"];

export const COST_SCALE = 2;
export const FLAME_NIGHTS = [0, 0, 1, 3, 6, 10]; // nights survived to build Central Flame level i

/* Difficulty: chosen with the kit when a game starts. */
export const DIFFICULTIES = {
  dim: { name: "Dim", motto: "A pale light still lingers.",
    yield: 1.35, density: 1.15, enemyHp: 0.7, enemyDmg: 0.65, spawn: 0.75, light: 1.15, corrupt: 0.65, dayDim: 0,
    notes: ["Plentiful supplies", "Weaker, fewer Drowned", "Wider firelight", "Corruption creeps slowly"] },
  dark: { name: "Dark", motto: "The night as it was meant to be.",
    yield: 1, density: 1, enemyHp: 1, enemyDmg: 1, spawn: 1, light: 1, corrupt: 1, dayDim: 0,
    notes: ["Standard supplies", "Standard Drowned", "Standard light", "The intended challenge"] },
  pitch: { name: "Pitch Black", motto: "The light grows thin.",
    yield: 0.8, density: 0.9, enemyHp: 1.35, enemyDmg: 1.25, spawn: 1.25, light: 0.88, corrupt: 1.3, dayDim: 0.08,
    notes: ["Scarcer supplies", "Stronger, more numerous Drowned", "Shorter firelight", "Corruption bites faster"] },
  abyss: { name: "Abyss", motto: "Nothing here remembers the sun.",
    yield: 0.65, density: 0.8, enemyHp: 1.75, enemyDmg: 1.5, spawn: 1.5, light: 0.78, corrupt: 1.65, dayDim: 0.25, dayCorrupt: true,
    notes: ["Scarce supplies", "Brutal Drowned in great numbers", "Feeble firelight, dim days", "The Mire and deeper corrupt even by day"] },
};
export const DIFF_ORDER = ["dim", "dark", "pitch", "abyss"];

export const TORCH_COST = { wood: 3, resin: 1 };

const scaleCost = (c) => {
  const out = {};
  for (const k in c) out[k] = Math.max(1, Math.round(c[k] * COST_SCALE));
  return out;
};

export const UPGRADES = [
  { id: "flame", name: "Central Flame", max: 5,
    info: "The heart of the camp. A bigger light and a sturdier flame. Levels 3 and 5 grow the camp into a Bastion, then a Beacon.",
    effect: (l) => `Light radius ${180 + 40 * l} · flame strength ${150 + 100 * l}`,
    costs: [null, { wood: 10, stone: 6 }, { wood: 22, stone: 16, resin: 5 }, { wood: 34, stone: 30, iron: 10, resin: 10 },
      { wood: 48, stone: 42, iron: 22, pearl: 3, black: 2 }],
    reqFlame: () => 0 },
  { id: "forge", name: "Forge", max: 4, info: "Hone your weapon.",
    effect: (l) => `Weapon damage +${20 * l}%`,
    costs: [{ stone: 8, iron: 4 }, { stone: 16, iron: 10 }, { stone: 26, iron: 20, pearl: 2 }, { stone: 38, iron: 30, pearl: 5, black: 2 }],
    reqFlame: (t) => t },
  { id: "armory", name: "Armory", max: 4, info: "Reinforce your armour.",
    effect: (l) => `Max health ${100 + 25 * l}`,
    costs: [{ wood: 10, iron: 4 }, { wood: 20, iron: 12 }, { wood: 30, iron: 22, resin: 8 }, { wood: 44, iron: 32, pearl: 4, black: 2 }],
    reqFlame: (t) => t },
  { id: "workbench", name: "Workbench", max: 4, info: "Craft lanterns and tools. A longer-burning lantern halves corruption in the dark for longer.",
    effect: (l) => `Lantern oil ${60 + 25 * l} · torch satchel ${3 + l} · torches burn ${50 + 15 * l}s`,
    costs: [{ resin: 6, stone: 6 }, { resin: 12, iron: 6 }, { resin: 20, iron: 12, pearl: 2 }, { resin: 30, iron: 20, pearl: 5, black: 2 }],
    reqFlame: (t) => t },
  { id: "garden", name: "Cultivation Plot", max: 3, info: "Grow bioluminescent flora inside the camp. Light from the living.",
    effect: (l) => (l ? `Harvest ${GARDEN_YIELD[l]} Bloom Resin each dawn` : "Nothing planted"),
    costs: [{ wood: 12, resin: 6 }, { wood: 20, stone: 10, resin: 12 }, { wood: 30, resin: 20, pearl: 2, black: 1 }],
    reqFlame: (t) => t + 1 },
];
for (const u of UPGRADES) u.costs = u.costs.map((c) => (c ? scaleCost(c) : c));
