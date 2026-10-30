/* Drowned Light FPS — boot: load the art, light the scene, run the loop. */
import * as THREE from "../vendor/three.module.min.js";
import { Assets } from "./assets.js";
import { G } from "./game.js";
import { UI } from "./ui.js";
import { Input } from "./input.js";
import { ViewModel } from "./viewmodel.js";
import { Camp } from "./camp.js";
import { World } from "./world.js";

const canvas = document.getElementById("game");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
// a slightly low render resolution keeps the pixel art crisp and the frame rate up
const PIXEL = Math.min(window.devicePixelRatio || 1, 1.5) * 0.75;
renderer.setPixelRatio(PIXEL);
renderer.setSize(innerWidth, innerHeight, false);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 2, 3200);
addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

Input.init(canvas);
ViewModel.init(document.getElementById("vm"));

async function boot() {
  const fill = document.getElementById("loadFill");
  await Assets.load((f) => { fill.style.width = Math.round(f * 100) + "%"; });
  G.setup(renderer, scene, camera);
  UI.init();
  UI.show("title");
  let last = performance.now();
  const frame = (now) => {
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    Input.pollPad();
    G.update(dt);
    UI.update(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  // keep the save fresh: every so often, and when the page is hidden or closed
  setInterval(() => { if (G.state === "play" || G.state === "camp") G.persist(); }, 15000);
  addEventListener("pagehide", () => { if (G.save.started && G.state !== "title") G.persist(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden && G.save.started && G.state !== "title") G.persist(); });
  window.DLF = { G, THREE, scene, camera, renderer, Camp, World, UI }; // for debugging from the console
}
boot();

if ("serviceWorker" in navigator && location.protocol.startsWith("http") && location.hostname !== "localhost") {
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
