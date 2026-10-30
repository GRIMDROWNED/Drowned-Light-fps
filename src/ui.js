/* Drowned Light FPS — HUD and menus: vitals, compass, crosshair prompts, the camp, title, pause and death. */
import { clamp, angleDiff, fmtTime, dist, Sound } from "./core.js";
import { RESOURCES, RES_KEYS, ZONES, KITS, KIT_ORDER, DIFFICULTIES, DIFF_ORDER, UPGRADES, TORCH_COST, TIER_NAMES, ENEMIES } from "./data.js";
import { G } from "./game.js";
import { Input } from "./input.js";
import { Camp } from "./camp.js";

const $ = (id) => document.getElementById(id);
const icon = (k) => `<img src="assets/sprites/props/${RESOURCES[k].icon}.png" alt="">`;
const costChips = (cost, have) => Object.keys(cost).map((k) =>
  `<span class="chip ${have && have[k] < cost[k] ? "no" : ""}" title="${RESOURCES[k].name}">${icon(k)}${cost[k]}</span>`).join("");

export const UI = {
  screen: "loading",
  pick: { kit: "lanternBlade", diff: "dark" },

  init() {
    $("btnNew").onclick = () => this.show("newgame");
    $("btnContinue").onclick = () => { G.continueGame(); this.play(); };
    $("btnControls").onclick = () => { this.back = "title"; this.show("controls"); };
    $("btnControls2").onclick = () => { this.back = "pause"; this.show("controls"); };
    $("btnControlsBack").onclick = () => this.show(this.back || "title");
    $("btnBack").onclick = () => this.show("title");
    $("btnBegin").onclick = () => { G.newGame(this.pick.kit, this.pick.diff); this.play(); };
    $("btnResume").onclick = () => this.play();
    $("btnQuit").onclick = () => { G.persist(); G.state = "title"; G.startLife(true); this.toTitle(); };
    $("btnRise").onclick = () => { G.rise(); this.play(); };
    $("btnCampClose").onclick = () => this.play();
    $("btnTorch").onclick = () => { G.craftTorch(); this.renderCamp(); };
    for (const id of ["btnMute", "btnMute2"]) $(id).onclick = () => this.toggleMute();
    $("btnView").onclick = () => { G.toggleView(); this.syncSettings(); };
    $("btnInvert").onclick = () => { Input.invertY = G.save.invertY = !G.save.invertY; G.persist(); this.syncSettings(); };
    $("sens").oninput = (e) => { Input.sens = G.save.sens = +e.target.value; G.persist(); };
    $("clickToPlay").onclick = () => this.play();
    $("game").addEventListener("click", () => { if (G.state === "play" && !Input.locked && !Input.pad.active) Input.lock(); });
    Input.onUnlock = () => { if (G.state === "play" && !Input.pad.active) this.pause(); };
    G.onDeath = (cause, any) => {
      $("deathTitle").textContent = cause === "corruption" ? "The dark has claimed you" : "You have fallen";
      $("deathText").textContent = (cause === "corruption" ? "You became one of the Drowned. " : "The marsh takes you under. ") +
        (any ? "Your drowned self walks where you fell, carrying all you held. Slay it to take your supplies back." : "You carried nothing, so nothing is lost.");
      setTimeout(() => this.show("death"), 1600);
    };
    G.onCamp = () => { this.renderCamp(); this.show("camp"); };
    this.buildCards();
    this.syncSettings();
    this.lastToast = 0;
  },

  syncSettings() {
    const m = G.save.muted ? "Sound: off" : "Sound: on";
    $("btnMute").textContent = $("btnMute2").textContent = m;
    $("btnInvert").textContent = "Invert look: " + (G.save.invertY ? "on" : "off");
    $("btnView").textContent = "View: " + (G.thirdPerson() ? "third person" : "first person");
    $("sens").value = G.save.sens;
  },
  toggleMute() { Sound.muted = G.save.muted = !G.save.muted; G.persist(); this.syncSettings(); },

  show(name) {
    for (const id of ["loading", "title", "newgame", "pause", "controls", "camp", "death"]) $(id).classList.toggle("hidden", id !== name);
    $("hud").classList.toggle("hidden", !(name === null || name === "camp" || name === "pause"));
    this.screen = name;
    if (name) $("clickToPlay").classList.add("hidden");
    if (name === "title") this.renderTitle();
  },
  toTitle() { this.show("title"); },
  renderTitle() {
    const s = G.save;
    $("btnContinue").classList.toggle("hidden", !s.started);
    $("continueInfo").textContent = s.started ? `${KITS[s.kit].name} · ${DIFFICULTIES[s.difficulty].name} · Day ${s.day}` : "";
  },
  play() {
    Sound.init();
    G.state = "play";
    this.show(null);
    Input.clear();
    Input.lock();
    // if the browser refuses the lock (it wants a fresh click), ask for one
    setTimeout(() => { if (G.state === "play" && !Input.locked && !Input.pad.active) $("clickToPlay").classList.remove("hidden"); }, 250);
  },
  pause() {
    if (G.state !== "play") return;
    G.state = "pause";
    Input.unlock();
    this.show("pause");
  },

  buildCards() {
    const kl = $("kitList");
    kl.innerHTML = KIT_ORDER.map((k) => {
      const K = KITS[k];
      return `<div class="card" data-kit="${k}"><div class="t">${K.name}</div><div class="m">${K.tag} · ${K.motto}</div><p>${K.desc}</p><p style="margin-top:6px"><b style="color:var(--gold)">${K.ability.name}:</b> ${K.ability.desc}</p></div>`;
    }).join("");
    const dl = $("diffList");
    dl.innerHTML = DIFF_ORDER.map((d) => {
      const D = DIFFICULTIES[d];
      return `<div class="card" data-diff="${d}"><div class="t">${D.name}</div><div class="m">${D.motto}</div><ul>${D.notes.map((n) => `<li>${n}</li>`).join("")}</ul></div>`;
    }).join("");
    const sync = () => {
      for (const c of kl.children) c.classList.toggle("sel", c.dataset.kit === this.pick.kit);
      for (const c of dl.children) c.classList.toggle("sel", c.dataset.diff === this.pick.diff);
    };
    kl.onclick = (e) => { const c = e.target.closest("[data-kit]"); if (c) { this.pick.kit = c.dataset.kit; sync(); } };
    dl.onclick = (e) => { const c = e.target.closest("[data-diff]"); if (c) { this.pick.diff = c.dataset.diff; sync(); } };
    sync();
  },

  renderCamp() {
    const s = G.save, up = s.up;
    const tier = Camp.tier(up);
    $("campTitle").textContent = `The Camp · Tier ${["", "I", "II", "III"][tier]}`;
    $("campTier").textContent = `${TIER_NAMES[tier]} · ${s.nights} night${s.nights === 1 ? "" : "s"} survived`;
    $("stash").innerHTML = RES_KEYS.map((k) => `<span class="chip" title="${RESOURCES[k].name}">${icon(k)}${s.stash[k]}</span>`).join("");
    $("upgrades").innerHTML = UPGRADES.map((u) => {
      const info = G.upgradeInfo(u);
      const lvl = info.lvl;
      let foot;
      if (info.maxed) foot = `<div class="e">Fully built</div>`;
      else {
        const ok = !info.lock && G.canAfford(info.cost);
        foot = `<div class="cost">${costChips(info.cost, s.stash)}</div>${info.lock ? `<div class="lock">${info.lock}</div>` : ""}
          <button data-up="${u.id}" ${ok ? "" : "disabled"}>${lvl ? "Upgrade" : "Build"} to level ${lvl + 1}</button>`;
      }
      return `<div class="up"><div class="t">${u.name}<span>Level ${lvl}/${u.max}</span></div><div class="i">${u.info}</div>
        <div class="e">${u.effect(lvl)}${info.maxed ? "" : ` → <b>${u.effect(lvl + 1)}</b>`}</div>${foot}</div>`;
    }).join("");
    $("upgrades").onclick = (e) => { const b = e.target.closest("[data-up]"); if (b && G.buy(b.dataset.up)) this.renderCamp(); };
    const st = G.stats();
    const full = s.torches >= st.torchMax;
    $("btnTorch").innerHTML = full ? `Torch satchel full (${s.torches}/${st.torchMax})` : `Craft a torch (${s.torches}/${st.torchMax}) ${costChips(TORCH_COST, s.stash)}`;
    $("btnTorch").disabled = full || !G.canAfford(TORCH_COST);
  },

  /* ---------------- the HUD, every frame ---------------- */
  update(dt) {
    if (G.state === "camp" && Input.take("camp")) { this.play(); return; }
    if (Input.take("mute")) this.toggleMute();
    if (Input.take("pause")) {
      if (G.state === "play") this.pause();
      else if (G.state === "pause") this.play();
      else if (G.state === "camp") this.play();
    }
    if (this.screen !== null && this.screen !== "camp" && this.screen !== "pause") return;
    const p = G.player, st = G.stats(), s = G.save;
    $("hpFill").style.width = (100 * clamp(p.hp / st.maxHp, 0, 1)) + "%";
    $("hpText").textContent = `${Math.ceil(Math.max(0, p.hp))} / ${st.maxHp}`;
    $("corFill").style.width = p.corrupt + "%";
    $("corText").textContent = `${Math.floor(p.corrupt)}%`;
    $("oilFill").style.width = (100 * p.oil / st.maxOil) + "%";
    $("oilText").textContent = `${Math.ceil(p.oil)} / ${st.maxOil}`;
    const v = $("vitals");
    v.classList.toggle("stage3", p.stage === 3);
    v.classList.toggle("stage4", p.stage === 4);
    const ls = $("lightState");
    if (p.protect === "human") { ls.textContent = "In firelight · corruption burns away"; ls.className = "warm"; }
    else if (p.protect === "bloom") { ls.textContent = "In bloomlight · corruption held at bay"; ls.className = "cold"; }
    else if (p.exposed) { ls.textContent = p.oil > 0 ? "In the dark · your lantern slows the corruption" : "In the dark · your lantern is dry"; ls.className = "danger"; }
    else { ls.textContent = "Daylight"; ls.className = "day"; }

    const carried = RES_KEYS.filter((k) => p.carried[k] > 0);
    $("carried").innerHTML = carried.length ? `<span class="lbl">Carrying</span>` + carried.map((k) => `<span class="chip">${icon(k)}${p.carried[k]}</span>`).join("") : "";

    const ph = G.phase();
    $("phaseIcon").className = ph === "night" || ph === "dusk" ? "moon" : "sun";
    $("dayText").textContent = `Day ${s.day}`;
    $("phaseText").textContent = ph === "day" ? `Night in ${fmtTime(G.timeToNight())}` : ph === "dusk" ? "Dusk" : ph === "night" ? `Dawn in ${fmtTime(G.timeToDawn())}` : "Dawn";
    $("zoneText").textContent = ZONES[p.zi].name;
    const dHome = Math.hypot(p.x, p.y);
    $("homeDist").textContent = p.atCamp ? "At camp" : `Camp ${Math.round(dHome / 40)} m`;

    this.compass(p);

    // crosshair: what it rests on
    const xh = $("xhair"), pr = $("prompt");
    const o = G.aim, foe = G.aimEnemy;
    xh.className = o ? "on" : foe ? "foe" : "";
    if (G.state === "play" && o) {
      const melee = G.kit().attack.type !== "bolt";
      pr.innerHTML = `<kbd>${melee ? "LMB" : "RMB"}</kbd>${o.def.verb} ${o.def.name} <span class="muted">${o.hits}/${o.def.hits}</span>`;
    } else if (G.state === "play" && p.atCamp) pr.innerHTML = `<kbd>C</kbd>Camp`;
    else pr.innerHTML = "";

    const tgt = $("target");
    if (foe && G.state === "play") {
      tgt.classList.remove("hidden");
      tgt.classList.toggle("boss", !!foe.def.boss);
      $("targetName").textContent = foe.def.name;
      $("targetFill").style.width = (100 * clamp(foe.hp / foe.maxHp, 0, 1)) + "%";
    } else tgt.classList.add("hidden");

    // actions
    const kit = G.kit();
    $("abilityName").textContent = `${kit.ability.name}`;
    this.act("actDash", p.dashCd / 1.1);
    this.act("actAbility", p.abiCd / kit.ability.cd, p.oil < kit.ability.oil);
    this.act("actTorch", 0, s.torches <= 0);
    $("torchCount").textContent = `×${s.torches}`;

    // screen effects
    $("fxHurt").style.opacity = clamp(G.hurtFlash * 1.6 + (p.hp / st.maxHp < 0.3 ? 0.25 + Math.sin(G.t * 5) * 0.1 : 0), 0, 1);
    $("fxCorrupt").style.opacity = clamp((p.corrupt - 15) / 85, 0, 1) * (0.85 + Math.sin(G.t * (p.stage >= 4 ? 6 : 2)) * 0.15);

    this.toasts(dt);
  },
  act(id, frac, empty) {
    const el = $(id);
    el.querySelector(".cd").style.height = (100 * clamp(frac, 0, 1)) + "%";
    el.classList.toggle("ready", frac <= 0 && !empty);
    el.classList.toggle("empty", !!empty);
  },

  compass(p) {
    const strip = $("compassStrip");
    const w = strip.clientWidth || 400, fov = Math.PI * 0.9;
    const heading = (wx, wy) => Math.atan2(wx, -wy); // 0 = north (−y), clockwise
    const view = heading(-Math.sin(p.yaw), -Math.cos(p.yaw));
    const marks = [];
    const names = { 0: "N", 45: "NE", 90: "E", 135: "SE", 180: "S", 225: "SW", 270: "W", 315: "NW" };
    for (let deg = 0; deg < 360; deg += 15) {
      const a = (deg * Math.PI) / 180;
      const d = angleDiff(view, a);
      if (Math.abs(d) > fov / 2) continue;
      const x = w / 2 + (d / (fov / 2)) * (w / 2);
      marks.push(names[deg] ? `<span style="left:${x}px">${names[deg]}</span>` : `<span class="tick" style="left:${x}px">|</span>`);
    }
    const mark = (wx, wy, cls, ch) => {
      const d = angleDiff(view, heading(wx - p.x, wy - p.y));
      const x = w / 2 + clamp(d / (fov / 2), -1, 1) * (w / 2);
      marks.push(`<span class="${cls}" style="left:${x}px">${ch}</span>`);
    };
    if (!p.atCamp) mark(0, 0, "home", "🔥");
    if (G.selfEnemy) mark(G.selfEnemy.x, G.selfEnemy.y, "self", "☠");
    strip.innerHTML = marks.join("");
  },

  toasts(dt) {
    const box = $("toasts");
    while (G.toasts.length) {
      const t = G.toasts.shift();
      const el = document.createElement("div");
      el.className = "toast " + t.kind;
      el.textContent = t.text;
      box.appendChild(el);
      setTimeout(() => { el.style.opacity = "0"; }, 3600);
      setTimeout(() => el.remove(), 4300);
      while (box.children.length > 4) box.firstChild.remove();
    }
  },
};
