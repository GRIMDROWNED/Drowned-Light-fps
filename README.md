# Drowned Light FPS

**Will you thrive in the light or drown in the darkness?** Now through the visor.

A first-person and third-person (2.5D) take on [Drowned Light](https://github.com/GRIMDROWNED/Drowned-Light), the top-down dark-fantasy survival game. You are the lantern-bearing knight, walking the same endless marsh, either through his eyes or from just behind and above him. By day you range out from the camp to gather supplies. By night the darkness corrupts anyone outside the light, and the Drowned Knights come for you and your fire.

It runs in the browser with no build step, like the original. The 3D world is drawn with [three.js](https://threejs.org) (vendored in `vendor/`, MIT).

There are two art styles, switched from the pause menu (the choice is kept on your device):

- **Low-poly 3D** (the default): every tree, rock, ore, bloom, camp building, torch and supply is a flat-shaded model built from simple shapes in code (`src/models.js`, no model files). The knight and the Drowned are jointed figures that walk, wind up, strike and topple when slain. The ground and water are faceted, with a colour per face. The drowned light in their eyes, lanterns and blades, the blooms and the amethyst stay unlit, so they still burn in the dark. In the third-person view, anything standing between the camera and the knight is hidden so it never blocks the view.
- **Drawn sprites**: the original game's sprites standing in the world as billboards that turn to face you, the way classic first-person games drew their monsters, seen from the front, back or side with their walk, wind-up and strike frames.

## Play

- **Online:** enable GitHub Pages for this repo (Settings → Pages → deploy from `main`, root) and open the Pages URL in a desktop browser.
- **Locally:** run `python3 -m http.server 8000` in this folder and open `http://localhost:8000`. It has to be served over http (ES modules don't load from `file://`).
- Click **New game**, pick a kit and a darkness, then click into the view to take up the lantern (the mouse is captured; Esc lets it go and pauses).

### Controls

| | Keyboard and mouse | Controller |
|---|---|---|
| Move | WASD / arrows | Left stick |
| Look | Mouse | Right stick |
| Attack | Left mouse (hold to keep striking) · J / K | RT |
| Mine | Right mouse · G, looking at a tree, rock, ore or sprout | LT |
| Dash | Space / Shift | A |
| Kit ability | E / Q | B / X / RB |
| Plant a torch | F / T | LB |
| Camp menu | C (at camp) | Y |
| Pause | Esc / P | Menu / View |
| Third / first person | V (or the pause menu) | Stick click |
| Sound | M | |

**Third person** (the default) puts the camera behind and above the knight. Looking up and down swings it between a low chase view and a high, almost top-down one. The knight walks where you steer, turns to the camera's aim when he strikes, and shows his walk, strike, dash, hurt and death frames, seen from the front, back or side. Melee kits also chop or mine whatever the crosshair rests on when no Drowned is in reach. The pause menu has look sensitivity and invert look.

## What came over from the top-down game

The rules and numbers are the original's (`src/data.js` and `src/game.js` say where they differ):

- **Day and night**: the same 80 s day, dusk, 75 s night and dawn. Felled trees and mined supplies grow back at dawn, and the Drowned burn away in the sun (save in the Abyss).
- **Light and corruption**: firelight (the Central Flame, torches, Illuminate) reverses corruption, heals you and refills your lantern; bloomlight (Refuge and Sentinel Blooms, in groves) only halts it; lantern oil halves it in the dark. Four stages, and at 100% you become one of the Drowned. Corruption shows as a cyan murk closing in on the edges of your view.
- **The marsh**: the same deterministic world, rings and all: *The Shallows → The Mire → Drowned Reaches → The Abyss*, darker, richer and deadlier the farther you go, with black pools you wade through slowly and bloom groves with real darkness between them.
- **Mining**: trees (5 hits, felled in drawn stages to a stump), boulders, iron scrap, bloom sprouts, amethyst and black pearl clams; supplies spill out and fly to you, and are stored when you reach camp.
- **The Drowned**: Mire Stalkers, Drowned Wretches, Tide Archers, Swarming Revenants, Lantern Reavers (who hunt your lights), Bone Bulwarks (shields turn blows from the front), Marsh Hexbearers and the Drowned Sovereign, with the original's zone pools, scaling by zone, day and difficulty, and siege waves on the Central Flame at night. If the flame goes out the camp is dark until dawn.
- **Your drowned self**: fall, and it rises where you fell holding everything you carried. Slay it to take it back (the compass marks it with ☠).
- **Kits**: Lantern Blade (Blade Arc, Lantern Strike dash, Illuminate), Pike Warden (Pike Thrust along a line, Stable Form, Warding Sweep) and Ashen Arbalist (Piercing Bolt with Quiet Light's long-range bonus, Scatter Shot with flares).
- **Difficulty**: Dim, Dark, Pitch Black and Abyss.
- **The camp**: Central Flame (gated by nights survived, grows the camp through its three tiers), Forge, Armory, Workbench and Cultivation Plot at the original's costs, and torch crafting.

### Not here yet

The companions (Bone Hound, Kindle, Derek, Abigail, Fred, David), the bosses and their lairs (the Starved Bell, the Deadly Rose, the Colossus and Derek's Hollow, the mother wyvern), the finale, kits 04 to 07, kit training and milestones, watchtowers, pylons and walls, co-op, and touch controls. The structure is set up so they can come over one at a time.

## Layout

| File | What it holds |
|---|---|
| `src/data.js` | Balance and content, mostly copied from the original |
| `src/core.js` | Math, deterministic noise and the WebAudio sound synth (from the original) |
| `src/assets.js` | Sprite loading, glow maps, billboard and fire cards |
| `src/models.js` | The low-poly look: models, jointed figures and their poses, and the art-style setting |
| `src/world.js` | Chunked terrain painted with the original ground art, water, objects and groves |
| `src/camp.js` | The camp's layout by tier and structure level |
| `src/game.js` | Cycle, light, corruption, the knight, combat, the Drowned, the camp's upgrades, lights and rendering |
| `src/viewmodel.js` | The knight's hands: lantern and weapon, drawn as pixel art |
| `src/input.js` | Keyboard, mouse look and controller |
| `src/ui.js` | HUD, compass and menus |
| `assets/` | The original game's sprites that this version uses |

The save lives in the browser (`localStorage`, key `drowned-light-fps-save`). `window.DLF` exposes the game for debugging in the console.
