// Runornas kall – vertikal skiva. Modeller byggs i MODELS/LOOKS och kan bytas mot GLB senare.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLB } from './assets.js';
import { CHAR } from './chars.js';
import { TEX } from './tex.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';
import { createLoot, SLOTS } from './js/loot.js';
import { applyGear } from './js/gear.js';
import { createInventory } from './js/inventory.js';

const [CLS, FAM, PB, SPAWN, QUAL, BAS, AFX, SET, DROP, ATTR, MN] = await Promise.all(['klasser', 'monsterfamiljer', 'portal_by', 'spawnzoner', 'loot_kvaliteter', 'foremal_bas', 'affix', 'set', 'drop_tabeller', 'attribut', 'monster_niva'].map(n => fetch(`data/${n}.json`).then(r => r.json())));
const L = createLoot({ QUAL, BAS, AFX, SET, DROP, ATTR });
const FAMS = Object.fromEntries(FAM.families.map(f => [f.id, f]));
const P = { bg: 0x0d0f12, fog: 0x1c2128, stone: 0x3a3f45, grass: 0x3d4430, peat: 0x3b2f26, rust: 0x6e3b24, bone: 0xa8b0a0, gast: 0x4a6a7a, blood: 0x7a1018, portal: 0xc0182a, glow: 0xff3344, torch: 0xe08a2a, hope: 0xf2c46b };
const $ = id => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a), randi = (a, b) => Math.floor(rand(a, b + 1)), roll = r => randi(r[0], r[1]);
const TOUCH = matchMedia('(pointer:coarse)').matches;

// ---------- renderer / ljus enligt stilguide ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15; renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x141a17, 10, 42);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200);
scene.add(new THREE.HemisphereLight(0x4a5878, 0x241c16, 1.7));
const moon = new THREE.DirectionalLight(0x8fa6d6, 2.4); moon.castShadow = true; moon.shadow.mapSize.set(2048, 2048); moon.shadow.radius = 4; moon.shadow.bias = -0.0005; moon.shadow.normalBias = 0.02;
Object.assign(moon.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 }); scene.add(moon, moon.target);
const lantern = new THREE.PointLight(0x9aa4c0, 2.0, 10, 1.4); scene.add(lantern);
const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { h: { value: new THREE.Color(0x141a17) }, t: { value: new THREE.Color(P.bg) } },
  vertexShader: 'varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'uniform vec3 h; uniform vec3 t; varying vec3 p; void main(){ float k = smoothstep(-0.05, 0.5, p.y); vec3 c = mix(h, t, k) + vec3(0.06,0.02,0.03)*(1.0-abs(p.y*3.0-0.3)); gl_FragColor = vec4(c,1.0); }' });
const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 24, 12), skyMat); scene.add(sky);
const grad = new THREE.DataTexture(new Uint8Array([60, 140, 255]), 3, 1, THREE.RedFormat);
grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
const toon = (c, o = {}) => new THREE.MeshToonMaterial({ color: c, gradientMap: grad, ...o });
const box = (w, h, d, m, x, y, z, p) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; p.add(b); return b; };
const outlineMat = new THREE.MeshBasicMaterial({ color: 0x050608, side: THREE.BackSide });
function outline(g) { const ms = []; g.traverse(o => { if (o.isMesh && !o.userData.noOutline) ms.push(o); }); for (const m of ms) { const o = new THREE.Mesh(m.geometry, outlineMat); o.scale.setScalar(1.08); o.userData.noOutline = true; m.add(o); } }

// ---------- Kenney GLB (CC0), inbäddade som base64 ----------
const TPL = {};
await Promise.all(Object.entries(GLB).map(([n, b64]) => new Promise(res => {
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  new GLTFLoader().parse(bin.buffer, '', g => { TPL[n] = g.scene; res(); }, () => res());
})));
// colormap-texturer per Kenney-kit (UV finns kvar i GLB:erna)
const texLoader = new THREE.TextureLoader(), KIT_TEX = {};
for (const [k, b64] of Object.entries(TEX)) { const t = texLoader.load('data:image/png;base64,' + b64); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; KIT_TEX[k] = t; }
const KIT = { 'gravestone-cross': 'graveyard-kit', 'gravestone-round': 'graveyard-kit', 'gravestone-broken': 'graveyard-kit', 'fence-damaged': 'graveyard-kit', crypt: 'graveyard-kit', wall: 'castle-kit', 'wall-half': 'castle-kit', 'tower-square-base': 'castle-kit', gate: 'castle-kit', 'wall-broken': 'fantasy-town-kit', stall: 'fantasy-town-kit' };
// animerade figurer (Kenney Mini Dungeon / Graveyard Kit)
const CT = {};
await Promise.all(Object.entries(CHAR).map(([n, b64]) => new Promise(res => {
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  new GLTFLoader().parse(bin.buffer, '', g => { CT[n] = g; res(); }, () => res());
})));
function toonify(root, tint, transparent = false) {
  const mats = []; root.traverse(o => { if (o.isMesh) { const old = o.material; const map = old.map || null; if (map) map.colorSpace = THREE.SRGBColorSpace;
    o.material = toon(tint, { map, transparent }); mats.push(o.material); o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } }); return mats;
}
function findNode(root, name) { let f = null; root.traverse(o => { if (!f && o.name === name) f = o; }); return f; }
function setupAnim(root, clips) {
  const mixer = new THREE.AnimationMixer(root), A = {}; for (const c of clips) A[c.name] = mixer.clipAction(c);
  for (const n of ['attack-melee-right', 'die']) if (A[n]) { A[n].setLoop(THREE.LoopOnce); A[n].clampWhenFinished = true; }
  let cur = null;
  const play = (n, fade = 0.15, force = false, dur) => { const a = A[n]; if (!a || (cur === a && !force)) return; a.reset(); if (dur) a.timeScale = a.getClip().duration / dur; a.fadeIn(fade).play(); if (cur && cur !== a) cur.fadeOut(fade); cur = a; };
  play('idle'); return { mixer, A, play, get cur() { return cur; } };
}
function weapon(name, parent, s, pos, rot) { if (!CT[name]) return null; const w = CT[name].scene.clone(true); toonify(w, 0xb0b0b0); w.scale.setScalar(s); w.position.set(...pos); w.rotation.set(...rot); parent.add(w); return w; }
const matCache = {};
function place(parent, name, x, z, size, rot = 0, color = P.stone) {
  const t = TPL[name]; if (!t) return null;
  const o = t.clone(true); const bb = new THREE.Box3().setFromObject(o), s = bb.getSize(new THREE.Vector3());
  const k = size / Math.max(s.x, s.z); o.scale.setScalar(k); o.position.set(x, -bb.min.y * k, z); o.rotation.y = rot;
  const tx = KIT_TEX[KIT[name]], key = name + (tx ? 't' : color); const m = matCache[key] ||= (tx ? toon(0x8e8e96, { map: tx }) : toon(color));
  o.traverse(c => { if (c.isMesh) { c.material = m; c.castShadow = c.receiveShadow = true; } });
  parent.add(o); return o;
}

// ---------- procedurella texturer, dimlager ----------
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
const SOFT = canvasTex(64, 64, (x, w) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, '#ffffffff'); g.addColorStop(1, '#ffffff00'); x.fillStyle = g; x.fillRect(0, 0, w, w); });
const COBBLE = canvasTex(512, 512, (x, w) => { x.fillStyle = '#1e2024'; x.fillRect(0, 0, w, w); for (let y = 0; y < w; y += 32) for (let i = 0; i < w; i += 36) { const ox = (y / 32 % 2) * 18 + i + rand(-3, 3), oy = y + rand(-3, 3), v = randi(42, 70); x.fillStyle = `rgb(${v},${v + 2},${v + 6})`; x.beginPath(); x.moveTo(ox + 3, oy + 2); x.lineTo(ox + 32, oy + rand(0, 4)); x.lineTo(ox + 33, oy + 28); x.lineTo(ox + rand(0, 5), oy + 29); x.closePath(); x.fill(); } });
COBBLE.wrapS = COBBLE.wrapT = THREE.RepeatWrapping; COBBLE.repeat.set(10, 10);
const MIST = canvasTex(256, 256, (x, w) => { x.clearRect(0, 0, w, w); for (let i = 0; i < 70; i++) { const px = rand(0, w), py = rand(0, w), r = rand(15, 60), g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w); } });
MIST.wrapS = MIST.wrapT = THREE.RepeatWrapping;
const mistLayers = [0.35, 0.9, 1.6].map((y, i) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshBasicMaterial({ map: MIST.clone(), color: 0x8090a0, transparent: true, opacity: 0.13 - i * 0.03, depthWrite: false, fog: true })); m.material.map.wrapS = m.material.map.wrapT = THREE.RepeatWrapping; m.material.map.repeat.set(3, 3); m.rotation.x = -Math.PI / 2; m.position.y = y; m.renderOrder = 2; scene.add(m); return m; });
const dust = makeParticles(260, 0x9aa4b0, 0.9); dust.pts.material.map = SOFT; dust.pts.material.opacity = 0.07; for (let i = 0; i < 260; i++) { dust.pos[i * 3] = rand(-30, 30); dust.pos[i * 3 + 1] = rand(0.2, 4); dust.pos[i * 3 + 2] = rand(-30, 30); } scene.add(dust.pts);
// ---------- efterbehandling: bloom + vinjett, kvalitetsväxel ----------
const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.5, 0.86); composer.addPass(bloom);
const vig = new ShaderPass(VignetteShader); vig.uniforms.offset.value = 1.0; vig.uniforms.darkness.value = 1.0; composer.addPass(vig); composer.addPass(new OutputPass());
let quality = localStorage.getItem('rk_kvalitet') || (TOUCH || innerWidth < 900 || (navigator.hardwareConcurrency || 8) <= 4 ? 'lag' : 'hog');
function setQuality(q, note, save) { quality = q; if (save) localStorage.setItem('rk_kvalitet', q); renderer.setPixelRatio(q === 'hog' ? Math.min(devicePixelRatio, 2) : 1); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  const b = document.getElementById('qBtn'); if (b) b.textContent = 'Grafik: ' + (q === 'hog' ? 'Hög' : 'Låg'); if (note) flash(note); }
function render() { if (quality === 'hog') composer.render(); else renderer.render(scene, camera); }
let fpsAcc = 0, fpsN = 0, fpsChecked = !!localStorage.getItem('rk_kvalitet');

// ---------- spelläge ----------
const S = { cls: null, level: 1, xp: 0, gold: 0, hp: 100, st: 100, stDelay: 0, stage: 0, runes: 0, playing: false, god: false, inv: [], equip: {}, city: 'besatt', killed: {} };
let stats = {};
const need = n => Math.round(100 * Math.pow(n, 1.5));
function recalc() {
  stats = L.computeStats(S.cls, S.level, S.equip);
  S.hp = Math.min(S.hp, stats.maxHp); S.st = Math.min(S.st, stats.maxSt);
}
function spendSt(n) { if (S.st < n) { flash('För lite uthållighet…'); return false; } S.st -= n; S.stDelay = CLS.meta.resource.regen_delay_s; return true; }

// ---------- hjälte ----------
const HERO_LOOK = {
  amazonkrigare: { tunic: P.rust, pants: P.peat, arms: 0xd8b090, cape: null, hat: 0x2a1c14, weapon: 'spear' },
  barbar: { tunic: 0x5a4630, pants: P.peat, arms: 0xd8b090, cape: null, hat: 0x6e4a2a, weapon: 'club' },
  riddare: { tunic: 0x7a8088, pants: 0x3a3f45, arms: 0x7a8088, cape: 0x46588a, hat: 0x8a9098, weapon: 'sword' }
};
const hero = new THREE.Group(); scene.add(hero);
let H = {};
const HERO_TINT = { amazonkrigare: 0xb89070, barbar: 0xc08868, riddare: 0xa8aeb8 };
function buildHero(id) {
  hero.clear();
  if (CT.human) { // GLTF-hjälte med animationer
    const g = skClone(CT.human.scene); const bb = new THREE.Box3().setFromObject(g); const k = 1.95 / (bb.max.y - bb.min.y); g.scale.setScalar(k); g.rotation.y = 0; hero.add(g);
    toonify(g, HERO_TINT[id]);
    H = { anim: setupAnim(g, CT.human.animations), model: g }; refreshGear(); return;
  } const L = HERO_LOOK[id], skin = toon(0xe0b890);
  const torso = box(0.7, 0.8, 0.4, toon(L.tunic), 0, 1.2, 0, hero);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), skin); head.position.y = 1.85; head.castShadow = true; hero.add(head);
  box(0.6, 0.16, 0.6, toon(L.hat), 0, 2.06, -0.02, hero);
  const limb = (x, y, w, h, m) => { const p = new THREE.Group(); p.position.set(x, y, 0); hero.add(p); box(w, h, w, m, 0, -h / 2, 0, p); return p; };
  const armL = limb(-0.45, 1.55, 0.2, 0.7, toon(L.arms)), armR = limb(0.45, 1.55, 0.2, 0.7, toon(L.arms));
  const legL = limb(-0.17, 0.8, 0.24, 0.8, toon(L.pants)), legR = limb(0.17, 0.8, 0.24, 0.8, toon(L.pants));
  const wpn = new THREE.Group(); wpn.position.set(0, -0.68, 0.05); armR.add(wpn);
  const metal = toon(0xc8ccd0), wood = toon(P.peat);
  if (L.weapon === 'spear') { box(0.06, 0.06, 2.0, wood, 0, 0, 0.5, wpn); const tip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.35, 5), metal); tip.rotation.x = Math.PI / 2; tip.position.z = 1.65; wpn.add(tip); }
  if (L.weapon === 'club') { box(0.08, 0.08, 1.1, wood, 0, 0, 0.45, wpn); const h = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), toon(0x4a3a2a)); h.position.z = 1.0; h.castShadow = true; wpn.add(h); }
  if (L.weapon === 'sword') { box(0.06, 0.03, 0.95, metal, 0, 0, 0.6, wpn); box(0.3, 0.06, 0.06, toon(P.hope), 0, 0, 0.12, wpn);
    const sh = box(0.08, 0.7, 0.55, toon(0x5a4630), 0, -0.3, 0.2, armL); box(0.1, 0.15, 0.15, metal, 0.03, 0, 0, sh); sh.position.set(-0.12, -0.35, 0.15); }
  let capeP = null; if (L.cape) { capeP = new THREE.Group(); capeP.position.set(0, 1.6, -0.22); const c = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.2), toon(L.cape, { side: THREE.DoubleSide })); c.position.y = -0.6; c.castShadow = true; capeP.add(c); hero.add(capeP); }
  outline(hero);
  H = { torso, armL, armR, legL, legR, capeP };
}

// ---------- zoner ----------
const zones = {}; let Z = null;
function newZone(name) { return { name, g: new THREE.Group(), colliders: [], monsters: [], drops: [], fades: [], projectiles: [], fx: [] }; }
function collide(p, rad, z = Z) {
  for (const k of z.colliders) { if (k.off) continue; const ox = p.x - k.x, oz = p.z - k.z, d = Math.hypot(ox, oz), m = k.r + rad; if (d < m && d > 0) { p.x = k.x + ox / d * m; p.z = k.z + oz / d * m; } }
  if (z.circle) { const d = Math.hypot(p.x, p.z); if (d > z.circle) { p.x *= z.circle / d; p.z *= z.circle / d; } }
  if (z.rect) { const [a, b] = z.rect; p.x = THREE.MathUtils.clamp(p.x, a, b); p.z = THREE.MathUtils.clamp(p.z, a, b); }
}
let seed = 7; const srnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
function pine(z, x, y, s, palette) {
  const t = new THREE.Group(), mats = [toon(palette[(srnd() * palette.length) | 0], { transparent: true }), toon(P.peat, { transparent: true })];
  const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1, 6), mats[1]); tr.position.y = 0.5; tr.castShadow = true; t.add(tr);
  for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(1.3 - i * 0.3, 1.6, 7), mats[0]); c.position.y = 1.4 + i * 0.9; c.castShadow = true; t.add(c); }
  t.scale.setScalar(s); t.position.set(x, 0, y); t.rotation.y = srnd() * 6; z.g.add(t); z.colliders.push({ x, z: y, r: 0.45 * s }); z.fades.push({ g: t, mats });
}
function rock(z, x, y, s) {
  const r = new THREE.Mesh(srnd() > 0.5 ? new THREE.DodecahedronGeometry(s, 0) : new THREE.IcosahedronGeometry(s, 0), toon(0x4a5058));
  r.position.set(x, s * 0.4, y); r.rotation.set(srnd() * 3, srnd() * 3, 0); r.castShadow = r.receiveShadow = true; z.g.add(r); z.colliders.push({ x, z: y, r: s * 0.9 });
}
function ground(z, size, color) { const g = new THREE.Mesh(new THREE.PlaneGeometry(size, size), toon(color)); g.rotation.x = -Math.PI / 2; g.receiveShadow = true; z.g.add(g); }
function makeParticles(n, color, size = 0.15) {
  const geo = new THREE.BufferGeometry(), pos = new Float32Array(n * 3); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); return { pts, pos, n };
}

// ----- skogen (fiender kommer från spawnsystemet) -----
const RUNE_POS = PB.meta.baseline_from_demo.rune_positions;
function buildForest() {
  seed = 7; const z = newZone('forest'); z.circle = 45; z.fog = [0x141a17, 10, 42]; z.entry = [0, 0];
  ground(z, 160, P.grass);
  const pal = [0x22362a, 0x2a4030, 0x1e3026];
  const free = (x, y, r) => Math.hypot(x, y) > 12 && RUNE_POS.every(([a, b]) => Math.hypot(x - a, y - b) > 4) && z.colliders.every(c => Math.hypot(x - c.x, y - c.z) > c.r + r);
  for (let n = 0; n < 120;) { const a = srnd() * 6.283, d = Math.sqrt(srnd()) * 57, x = Math.cos(a) * d, y = Math.sin(a) * d; if (free(x, y, 1)) { pine(z, x, y, 0.8 + srnd() * 0.9, pal); n++; } }
  for (let n = 0; n < 35;) { const a = srnd() * 6.283, d = Math.sqrt(srnd()) * 45, x = Math.cos(a) * d, y = Math.sin(a) * d; if (free(x, y, 1.2)) { rock(z, x, y, 0.5 + srnd() * 1.1); n++; } }
  z.runes = RUNE_POS.map(([x, y]) => {
    const g = new THREE.Group(); g.position.set(x, 0, y);
    const st = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.4, 0.5), toon(0x50565e)); st.position.y = 1.2; st.castShadow = true; g.add(st);
    const runeMat = new THREE.MeshStandardMaterial({ color: 0x1a2228, emissive: 0 });
    for (let i = 0; i < 3; i++) for (const s of [1, -1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.45, 0.05), runeMat); r.position.set(0, 0.7 + i * 0.6, 0.27 * s); r.rotation.z = (i - 1) * 0.5; g.add(r); }
    const light = new THREE.PointLight(0x7fb8d8, 0, 9); light.position.y = 2; g.add(light);
    const parts = makeParticles(40, 0x9fd0e8); g.add(parts.pts); z.g.add(g); z.colliders.push({ x, z: y, r: 0.8 });
    return { x, z: y, runeMat, light, parts, active: false };
  });
  torch(z, -3, 3); torch(z, 3, -3);
  initSpawner(z, 'startskogen');
  return z;
}
function makePortal(z, x, y, target, spawn) {
  const g = new THREE.Group(); g.position.set(x, 0, y);
  const mat = new THREE.MeshStandardMaterial({ color: P.portal, emissive: P.glow, emissiveIntensity: 1.5 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.16, 10, 32), mat); ring.position.y = 1.7; g.add(ring);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.3, 32), new THREE.MeshBasicMaterial({ color: P.portal, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })); disc.position.y = 1.7; g.add(disc);
  const base = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.1, 32), new THREE.MeshBasicMaterial({ color: P.glow, transparent: true, opacity: 0.5 })); base.rotation.x = -Math.PI / 2; base.position.y = 0.03; g.add(base);
  const light = new THREE.PointLight(P.glow, PB.portal.light_intensity, 16); light.position.y = 1.8; g.add(light);
  const parts = makeParticles(70, P.glow, 0.13); parts.pts.material.opacity = 0.9; g.add(parts.pts);
  const cloud = makeParticles(40, P.portal, 2.6); cloud.pts.material.map = SOFT; cloud.pts.material.opacity = 0.22; for (let i = 0; i < 40; i++) { const a = rand(0, 6.28), rr = rand(0.5, 4); cloud.pos[i * 3] = Math.cos(a) * rr; cloud.pos[i * 3 + 1] = rand(0.2, 2.5); cloud.pos[i * 3 + 2] = Math.sin(a) * rr; } g.add(cloud.pts);
  z.g.add(g); const p = { g, ring, disc, light, parts, mat, target, spawn, t: 0, x, z: y, cloud }; z.portals = (z.portals || []); z.portals.push(p); return p;
}

// ----- byn (32x32 rutor, 1 ruta = 2 enheter) -----
const T = (tx, ty) => [(tx - 15.5) * 2, (ty - 15.5) * 2];
const zoneRect = id => { const zz = PB.village.zones.find(q => q.id === id).tiles; const [x0, z0] = T(zz[0][0], zz[0][1]), [x1, z1] = T(zz[1][0], zz[1][1]); return [x0, z0, x1, z1]; };
function house(z, x, y, w, d, rot, ruined) {
  const g = new THREE.Group(); g.position.set(x, 0, y); g.rotation.y = rot; const mats = [toon(0x4a4e54, { transparent: true }), toon(P.peat, { transparent: true })];
  const walls = new THREE.Mesh(new THREE.BoxGeometry(w, ruined ? 1.8 : 2.6, d), mats[0]); walls.position.y = ruined ? 0.9 : 1.3; walls.castShadow = walls.receiveShadow = true; g.add(walls);
  box(0.9, 1.5, 0.05, toon(0x15100c), 0, 0.75, d / 2 + 0.01, g);
  if (!ruined) { const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, w * 0.62, 1.6, 4, 1), mats[1]); roof.rotation.y = Math.PI / 4; roof.scale.z = d / w; roof.position.y = 3.4; roof.castShadow = true; g.add(roof); }
  else place(g, 'wall-broken', w / 2 + 0.6, 0, 1.6, 0.4, 0x4a4e54);
  z.g.add(g); z.fades.push({ g, mats, house: true }); const r = Math.max(w, d) * 0.5; z.colliders.push({ x, z: y, r: r * 0.95 });
  const ax = Math.cos(rot) * w * 0.3, az = -Math.sin(rot) * w * 0.3; z.colliders.push({ x: x + ax, z: y + az, r: r * 0.75 }, { x: x - ax, z: y - az, r: r * 0.75 });
}
function deadTree(z, x, y) {
  const g = new THREE.Group(), m = toon(0x2a221c); g.position.set(x, 0, y);
  const branch = (p, len, rad, depth) => { const b = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.6, rad, len, 5), m); b.position.y = len / 2; b.castShadow = true; p.add(b);
    if (depth > 0) for (let i = 0; i < 3; i++) { const q = new THREE.Group(); q.position.y = len * (0.6 + i * 0.15); q.rotation.set(rand(0.4, 1.0), i * 2.1 + rand(0, 1), 0); p.add(q); branch(q, len * 0.62, rad * 0.55, depth - 1); } };
  branch(g, 2.4, 0.35, 3); z.g.add(g); z.colliders.push({ x, z: y, r: 0.5 });
}
function torch(z, x, y) {
  const g = new THREE.Group(); g.position.set(x, 0, y); box(0.12, 1.6, 0.12, toon(P.peat), 0, 0.8, 0, g);
  const f = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.35, 5), new THREE.MeshBasicMaterial({ color: P.torch })); f.position.y = 1.75; g.add(f);
  const l = new THREE.PointLight(P.torch, 1.2, 12); l.position.y = 1.9; g.add(l); z.g.add(g); z.torches = z.torches || []; z.torches.push(l);
}
function buildVillage() {
  seed = 99; const z = newZone('village'); z.rect = [-31, 31]; z.fog = [0x2a0e12, 6, 35];
  ground(z, 70, 0x363c2c); { const c = new THREE.Mesh(new THREE.PlaneGeometry(64, 64), toon(0x9a9aa4, { map: COBBLE })); c.rotation.x = -Math.PI / 2; c.position.y = 0.005; c.receiveShadow = true; z.g.add(c); }
  for (const [tx, ty] of [[14, 17], [9, 14], [22, 23]]) { const [x, y] = T(tx, ty); deadTree(z, x, y); }
  const road = toon(0x33373c); const r1 = new THREE.Mesh(new THREE.PlaneGeometry(4, 54), road); r1.rotation.x = -Math.PI / 2; r1.position.set(1, 0.01, 3); r1.receiveShadow = true; z.g.add(r1);
  const r2 = new THREE.Mesh(new THREE.PlaneGeometry(50, 3), road); r2.rotation.x = -Math.PI / 2; r2.position.set(0, 0.012, 4); r2.receiveShadow = true; z.g.add(r2);
  const pal = [0x1e2a24, 0x243028];
  for (let i = 0; i < 64; i++) { const t = i / 64 * 4, side = Math.floor(t), f = t - side, c = -30 + f * 60, e = 32 + srnd() * 3; const [x, y] = [[c, -e], [e, c], [-c, e], [-e, -c]][side]; pine(z, x, y, 1 + srnd() * 0.6, pal); }
  const [, gz] = T(16, 22);
  for (let x = -21; x <= 23; x += 4) if (Math.abs(x - 1) > 3) { place(z.g, 'wall', x, gz, 4, 0, 0x4a4e54); for (let k = -1.5; k <= 1.5; k += 1.5) z.colliders.push({ x: x + k, z: gz, r: 0.9 }); }
  place(z.g, 'tower-square-base', -2.5, gz, 2, 0, 0x50565e); place(z.g, 'tower-square-base', 4.5, gz, 2, 0, 0x50565e);
  z.colliders.push({ x: -2.5, z: gz, r: 1.1 }, { x: 4.5, z: gz, r: 1.1 });
  torch(z, -1, gz + 2); torch(z, 3, gz + 2);
  for (const [tx, ty, ru] of [[4, 11, 0], [4, 17, 1], [4, 22, 0], [8, 19, 1], [27, 11, 1], [27, 16, 0], [27, 21, 0], [23, 18, 1]]) { const [x, y] = T(tx, ty); house(z, x, y, 4.6 + srnd(), 3.8 + srnd(), Math.PI / 2 * (tx < 16 ? 1 : -1), ru); }
  for (const [tx, ty] of [[12, 15], [19, 15], [12, 20]]) { const [x, y] = T(tx, ty); place(z.g, 'stall', x, y, 2.6, srnd() * 6, P.peat); z.colliders.push({ x, z: y, r: 1.2 }); }
  { const [x0, y] = T(16, 18), x = x0 + 4; const w = new THREE.Group(); w.position.set(x, 0, y); const ring = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.1, 0.8, 10, 1, true), toon(0x50565e, { side: THREE.DoubleSide })); ring.position.y = 0.4; ring.castShadow = true; w.add(ring);
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.95, 10), toon(0x0a0c10)); water.rotation.x = -Math.PI / 2; water.position.y = 0.3; w.add(water);
    box(0.12, 1.8, 0.12, toon(P.peat), -0.9, 0.9, 0, w); box(0.12, 1.8, 0.12, toon(P.peat), 0.9, 0.9, 0, w); const rf = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.7, 4), toon(P.peat)); rf.position.y = 2.1; rf.rotation.y = Math.PI / 4; rf.castShadow = true; w.add(rf);
    z.g.add(w); z.colliders.push({ x, z: y, r: 1.2 }); }
  const [kx0, kz0, kx1, kz1] = zoneRect('kyrkogarden');
  for (let x = kx0 + 1; x < kx1; x += 2.6) for (let y = kz0 + 1; y < kz1; y += 3) { if (Math.abs(x - 1) < 3) continue; const n = ['gravestone-cross', 'gravestone-round', 'gravestone-broken'][(srnd() * 3) | 0];
    place(z.g, n, x + srnd() * 0.6, y, 0.9, (srnd() - 0.5) * 0.5, 0x6a7078); const mound = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.2, 1.6), toon(P.peat)); mound.position.set(x, 0.1, y + 1); mound.receiveShadow = true; z.g.add(mound); z.colliders.push({ x, z: y + 0.5, r: 0.5 }); }
  for (let x = kx0; x < kx1; x += 2.2) if (Math.abs(x - 1) > 3) place(z.g, 'fence-damaged', x, kz1 + 1.5, 2.2, 0, P.peat);
  const [ax0, az0, ax1, az1] = zoneRect('benkungens_kapell'); z.arena = [ax0, az0, ax1, az1 + 2];
  const af = new THREE.Mesh(new THREE.PlaneGeometry(ax1 - ax0 + 2, az1 - az0 + 2), toon(0x2e3236)); af.rotation.x = -Math.PI / 2; af.position.set((ax0 + ax1) / 2, 0.015, (az0 + az1) / 2); af.receiveShadow = true; z.g.add(af);
  place(z.g, 'crypt', (ax0 + ax1) / 2, az0 - 1.5, 7, Math.PI, 0x4a4e54); z.colliders.push({ x: (ax0 + ax1) / 2, z: az0 - 2, r: 3 });
  for (const [x, y] of [[ax0, az0], [ax1, az0], [ax0, az1], [ax1, az1]]) { place(z.g, 'tower-square-base', x, y, 1.6, 0, 0x50565e); z.colliders.push({ x, z: y, r: 0.9 }); }
  torch(z, ax0 + 1.5, az1 + 1); torch(z, ax1 - 1.5, az1 + 1);
  z.barrier = new THREE.Group(); const bm = toon(0x22262a);
  for (let x = ax0 + 1; x < ax1; x += 0.6) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5), bm); b.position.set(x, 1.2, az1 + 1.5); b.castShadow = true; z.barrier.add(b); }
  z.g.add(z.barrier); z.barrierCols = []; for (let x = ax0 + 1; x < ax1; x += 1) { const c = { x, z: az1 + 1.5, r: 0.6 }; z.colliders.push(c); z.barrierCols.push(c); }
  for (let x = ax0 - 8; x < ax0; x += 1) z.colliders.push({ x, z: az1 + 1.5, r: 0.6 }); for (let x = ax1 + 1; x < ax1 + 9; x += 1) z.colliders.push({ x, z: az1 + 1.5, r: 0.6 });
  for (let x = ax0 - 8; x < ax0 - 1; x += 2.2) place(z.g, 'fence-damaged', x, az1 + 1.5, 2.2, 0, P.peat); for (let x = ax1 + 2; x < ax1 + 9; x += 2.2) place(z.g, 'fence-damaged', x, az1 + 1.5, 2.2, 0, P.peat);
  const [ex, ez] = T(...PB.portal.village_entry_tile); z.entry = [ex, ez - 3];
  makePortal(z, ex, ez + 1, 'forest', [0, 4]);
  initSpawner(z, 'gamla_byn');
  return z;
}

// ---------- fiendedata: monsterfamiljer.json + detaljer från portal_by.json ----------
const DEFS = {};
for (const m of FAM.monsters) DEFS[m.id] = { attack_range: 1.8, ...m };
for (const e of PB.enemies) DEFS[e.id] = { ...(DEFS[e.id] || {}), ...e };
DEFS.benkungen_valdemar = { ...(DEFS.benkungen_valdemar || {}), ...PB.boss, damage: [18, 24], attack_cd: 1.4, attack_range: 2.6 };
const MODELS = {
  quad(color, o = {}) { // vargar, benhund, taggsvin
    const s = o.scale || 1, g = new THREE.Group(), body = new THREE.Group(); body.scale.setScalar(s); g.add(body); const m = toon(color, { transparent: true }), d = toon(o.dark || 0x2a2218, { transparent: true }), mats = [m, d]; const w = o.thin ? 0.32 : o.stocky ? 0.7 : 0.5;
    box(w, o.thin ? 0.3 : o.stocky ? 0.6 : 0.45, 1.1, m, 0, 0.75, 0, body); box(0.4, 0.38, 0.45, m, 0, 0.98, 0.7, body); box(0.22, 0.18, 0.32, d, 0, 0.9, 1.05, body);
    if (o.stocky) { for (let i = 0; i < 9; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.45, 4), d); c.position.set(rand(-0.25, 0.25), 1.15, rand(-0.45, 0.4)); c.rotation.set(rand(-0.5, 0.5), 0, rand(-0.5, 0.5)); body.add(c); }
      for (const sx of [-0.14, 0.14]) { const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.2, 4), toon(P.bone)); tusk.position.set(sx, 0.86, 1.2); tusk.rotation.x = 1.2; body.add(tusk); } }
    else { box(0.1, 0.18, 0.08, d, -0.13, 1.25, 0.62, body); box(0.1, 0.18, 0.08, d, 0.13, 1.25, 0.62, body); const tl = box(0.1, 0.1, 0.55, d, 0, 0.9, -0.75, body); tl.rotation.x = 0.5; }
    const eye = new THREE.MeshBasicMaterial({ color: P.glow }); box(0.07, 0.05, 0.02, eye, -0.11, 1.03, 0.93, body); box(0.07, 0.05, 0.02, eye, 0.11, 1.03, 0.93, body);
    const legs = [[-0.15, 0.38], [0.15, 0.38], [-0.15, -0.38], [0.15, -0.38]].map(([x, z]) => { const p = new THREE.Group(); p.position.set(x, 0.6, z); body.add(p); box(0.12, 0.6, 0.12, d, 0, -0.3, 0, p); return p; });
    return { g, body, legs, arms: [], mats, h: 1.6 * s };
  },
  skeleton(o = {}) {
    const s = o.scale || 1, g = new THREE.Group(), body = new THREE.Group(); body.scale.setScalar(s); g.add(body); const m = toon(o.color || P.bone, { transparent: true }), mats = [m];
    box(0.4, 0.14, 0.22, m, 0, 0.95, 0, body); box(0.09, 0.45, 0.09, m, 0, 1.2, 0, body);
    for (let i = 0; i < 3; i++) box(0.5 - i * 0.06, 0.06, 0.28, m, 0, 1.25 + i * 0.13, 0, body);
    const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), m); skull.position.y = 1.78; skull.castShadow = true; body.add(skull); box(0.2, 0.08, 0.16, m, 0, 1.6, 0.04, body);
    const eye = new THREE.MeshBasicMaterial({ color: P.glow }); box(0.06, 0.05, 0.02, eye, -0.08, 1.8, 0.2, body); box(0.06, 0.05, 0.02, eye, 0.08, 1.8, 0.2, body);
    if (o.crown) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.14, 6, 1, true), toon(P.hope, { side: THREE.DoubleSide })); c.position.y = 2.0; body.add(c); for (let i = 0; i < 6; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 4), toon(P.hope)); sp.position.set(Math.cos(i) * 0.2, 2.12, Math.sin(i) * 0.2); body.add(sp); } }
    const limb = (x, y, h) => { const q = new THREE.Group(); q.position.set(x, y, 0); body.add(q); box(0.08, h, 0.08, m, 0, -h / 2, 0, q); return q; };
    const arms = [limb(-0.3, 1.55, 0.65), limb(0.3, 1.55, 0.65)], legs = [limb(-0.12, 0.9, 0.85), limb(0.12, 0.9, 0.85)];
    const w = new THREE.Group(); w.position.set(0, -0.6, 0.05); arms[1].add(w); const rust = toon(0x5a4a3a);
    if (o.weapon === 'sword' || o.weapon === 'shield') box(0.05, 0.03, 0.8, toon(0x8a8a80), 0, 0, 0.4, w);
    if (o.weapon === 'bow') { const b = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.03, 4, 10, Math.PI), rust); b.rotation.y = Math.PI / 2; b.position.y = -0.6; arms[0].add(b); }
    if (o.weapon === 'staff') { box(0.05, 1.6, 0.05, rust, 0, 0.3, 0.1, w); const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), new THREE.MeshBasicMaterial({ color: P.glow })); orb.position.set(0, 1.15, 0.1); w.add(orb); }
    if (o.weapon === 'shield') { const sh = box(0.08, 0.75, 0.6, toon(0x3a3f45), 0, 0, 0, arms[0]); sh.position.set(-0.1, -0.4, 0.15); }
    if (o.weapon === 'scythe') { box(0.06, 0.06, 2.2, rust, 0, 0, 0.5, w); const bl = box(0.04, 0.9, 0.12, toon(0x9a9a90), 0, -0.4, 1.55, w); bl.rotation.x = -0.3; }
    return { g, body, legs, arms, mats, h: 2.2 * s };
  }
};
// Familjens utseende: Bestar = fyrbenta djur, Odöda = skelett.
function glbSkeleton(o = {}) {
  if (!CT.skeleton) return MODELS.skeleton(o);
  const s = o.scale || 1, g = new THREE.Group(), body = skClone(CT.skeleton.scene); const bb = new THREE.Box3().setFromObject(body); body.scale.setScalar(2.0 * s / (bb.max.y - bb.min.y)); g.add(body);
  const mats = toonify(body, o.color || 0xc8d0d4, true); const armR = findNode(body, 'arm-right'), armL = findNode(body, 'arm-left'), head = findNode(body, 'head'); const rust = toon(0x5a4a3a);
  if (armR && (o.weapon === 'sword' || o.weapon === 'shield')) weapon('weapon-sword', armR, 1.0, [0, -0.2, 0.1], [Math.PI / 2, 0, 0]);
  if (armL && o.weapon === 'shield') weapon('shield-round', armL, 0.9, [-0.1, -0.15, 0.05], [0, -Math.PI / 2, 0]);
  if (armL && o.weapon === 'bow') { const b = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.02, 4, 10, Math.PI), rust); b.position.set(0, -0.2, 0.05); b.rotation.y = Math.PI / 2; armL.add(b); }
  if (armR && o.weapon === 'staff') { const st = new THREE.Group(); st.position.set(0, -0.2, 0.06); armR.add(st); box(0.03, 1.0, 0.03, rust, 0, 0.2, 0, st); const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), new THREE.MeshBasicMaterial({ color: P.glow })); orb.position.y = 0.72; st.add(orb); }
  if (armR && o.weapon === 'scythe') { const sc = new THREE.Group(); sc.position.set(0, -0.2, 0.06); sc.rotation.x = Math.PI / 2; armR.add(sc); box(0.03, 1.3, 0.03, rust, 0, 0.3, 0, sc); const bl = box(0.02, 0.08, 0.55, toon(0x9a9a90), 0, 0.92, 0.25, sc); }
  if (head && o.crown) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.08, 6, 1, true), toon(P.hope, { side: THREE.DoubleSide })); c.position.y = 0.32; head.add(c); }
  return { g, body: new THREE.Group(), legs: [], arms: [], mats, h: 2.2 * s, anim: setupAnim(body, CT.skeleton.animations), glb: true };
}
const LOOKS = {
  skogsvarg: () => MODELS.quad(0x6a5640), skuggvarg: () => MODELS.quad(0x2c2830, { scale: 1.15, dark: 0x151215 }), taggsvin: () => MODELS.quad(0x4a3a2a, { stocky: true, dark: 0x201810 }),
  skelett_hund: () => MODELS.quad(P.bone, { thin: true, dark: 0x7a8070 }), skelett_krigare: () => glbSkeleton({ weapon: 'sword' }), skelett_bagskytt: () => glbSkeleton({ weapon: 'bow' }),
  skelett_vakt: () => glbSkeleton({ weapon: 'shield', scale: 1.2, color: 0xa8aca0 }), skelett_runprast: () => glbSkeleton({ weapon: 'staff', color: 0xb8b0b8 }),
  benkungen_valdemar: () => glbSkeleton({ weapon: 'scythe', scale: 1.6, crown: true })
};
const hitGeo = new THREE.CylinderGeometry(0.8, 0.8, 2.4, 8), hitMat = new THREE.MeshBasicMaterial({ visible: false });
// Statiska monsternivåer (monster_niva.json): skalas efter områdets nivå, aldrig efter hjälten.
function monsterScale(id, lvl) { const d = lvl - (MN.ref_levels[id] ?? lvl); return { hp: Math.pow(1.10, d), dmg: Math.pow(1.07, d), defAdd: 0.4 * d }; }
function spawnMonster(z, id, x, y, lvl) {
  lvl = lvl ?? MN.boss_levels[id] ?? L.monsterLevel(id);
  const def = DEFS[id], v = LOOKS[id](); if (!v.glb) outline(v.g);
  const c = document.createElement('canvas'); c.width = 64; c.height = 8; const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false })); sp.scale.set(1.2, 0.15, 1); sp.position.y = v.h + 0.2; sp.renderOrder = 10; v.g.add(sp);
  const hit = new THREE.Mesh(hitGeo, hitMat); hit.position.y = 1.2; if (id === 'benkungen_valdemar') hit.scale.setScalar(1.5); v.g.add(hit);
  v.g.position.set(x, 0, y); v.g.rotation.y = rand(0, 6.28); z.g.add(v.g);
  const fam = FAMS[def.family] || { weak: [], resist: [] };
  const sc = monsterScale(id, lvl), mhp = Math.round(def.hp * sc.hp);
  const m = { id, lvl, dmgMult: sc.dmg, defense: Math.max(0, (def.defense || 0) + sc.defAdd), def, fam, ...v, c, tex, sp, hit, hp: mhp, max: mhp, cd: rand(0, 1), wt: 0, tx: x, tz: y, kb: new THREE.Vector3(), flash: 0, dead: 0, walk: 0, stun: 0, t: {}, home: [x, y] };
  hit.userData.m = m; if (id === 'benkungen_valdemar') { sp.visible = false; m.boss = true; m.phase = 0; m.active = false; }
  drawHp(m); z.monsters.push(m); return m;
}
function drawHp(m) { const x = m.c.getContext('2d'); x.fillStyle = '#000b'; x.fillRect(0, 0, 64, 8); x.fillStyle = '#b8323c'; x.fillRect(1, 1, 62 * Math.max(0, m.hp) / m.max, 6); m.tex.needsUpdate = true; }

// ---------- spawnsystem enligt spawnzoner.json / "Spawnalgoritm" ----------
function weighted(table) { const sum = table.reduce((a, r) => a + r.weight, 0), r = Math.random() * sum; let acc = 0; for (const row of table) { acc += row.weight; if (acc > r) return row; } return table[table.length - 1]; }
function initSpawner(z, areaId) {
  const A = SPAWN.areas.find(a => a.id === areaId), city = !!A.city_id, conv = city ? p => T(p[0], p[1]) : p => p, sc = city ? 2 : 1;
  const mk = (pts, table, resp, out) => pts.map(p => ({ ...p, pos: conv(p.pos), radius: p.radius * sc, timer: rand(0, 1.5), first: true, alive: [], table: (A.zone_tables && p.zone && A.zone_tables[p.zone]) || table, resp, outskirts: out }));
  z.sp = { A, points: [...mk(A.spawn_points, A.enemy_table, A.respawn_s, false), ...(A.outskirts ? mk(A.outskirts.spawn_points, A.outskirts.enemy_table, A.outskirts.respawn_s, true) : [])] };
  z.zoneIds = [...new Set(A.spawn_points.map(p => p.zone).filter(Boolean))]; z.cleared = {};
  if (A.boss && S.city === 'besatt') { const [x, y] = conv(A.boss.pos); spawnMonster(z, A.boss.enemy, x, y); }
}
const frustum = new THREE.Frustum(), projM = new THREE.Matrix4();
function visible(x, y) {
  const to = new THREE.Vector3(x - camera.position.x, 0, y - camera.position.z).normalize(), f = new THREE.Vector3(); camera.getWorldDirection(f); f.y = 0; f.normalize();
  if (Math.acos(THREE.MathUtils.clamp(f.dot(to), -1, 1)) > 70 * Math.PI / 180) return false;
  projM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(projM);
  if (!frustum.containsPoint(new THREE.Vector3(x, 1, y))) return false;
  const from = camera.position.clone(), dir = new THREE.Vector3(x, 1, y).sub(from), len = dir.length(); ray.set(from, dir.normalize()); ray.far = len;
  const hs = Z.fades.filter(f => f.house).map(f => f.g); const blocked = hs.length && ray.intersectObjects(hs, true).length > 0; ray.far = Infinity;
  return !blocked;
}
function okSpawn(z, x, y, minD, ignoreSight) {
  if (Math.hypot(x - hero.position.x, y - hero.position.z) < minD) return false;
  if (z.sp.A.center_safe_radius && Math.hypot(x, y) < z.sp.A.center_safe_radius) return false;
  if (z.circle && Math.hypot(x, y) > z.circle - 1) return false; if (z.rect && (Math.abs(x) > z.rect[1] - 1 || Math.abs(y) > z.rect[1] - 1)) return false;
  if (!z.colliders.every(c => c.off || Math.hypot(x - c.x, y - c.z) > c.r + 0.8)) return false;
  return ignoreSight || !visible(x, y);
}
const zoneAlive = (z, id) => z.monsters.filter(m => !m.dead && m.zoneId === id).length;
function updateSpawner(z, dt) {
  const sp = z.sp; if (!sp || !S.playing) return; const A = sp.A, st = A.city_id ? S.city : 'alltid';
  if (!A.state_spawn_multiplier) { // spawnzoner v2 (D2-spawn): allt slumpas en gång när området laddas, ingen respawn. Full session_roll med seed kommer nästa runda.
    if (!sp.rolled) { sp.rolled = true; if (!A.city_id || S.city === 'besatt') for (const p of sp.points) { const gr = p.groups || [1, 1]; for (let gi = randi(gr[0], gr[1]); gi > 0; gi--) {
      const row = weighted(p.table || A.enemy_table), g = row.group || p.group_size || [1, 1], lvl = roll(p.level_range || A.level_range || [1, 1]);
      for (let i = randi(g[0], g[1]); i > 0; i--) { const a = rand(0, 6.283), r = Math.sqrt(Math.random()) * p.radius, m = spawnMonster(z, row.enemy, p.pos[0] + Math.cos(a) * r, p.pos[1] + Math.sin(a) * r, lvl); m.point = p; m.zoneId = p.zone; p.alive.push(m); } } p.spawned = true; } }
    for (const zid of z.zoneIds) if (!z.cleared[zid] && zoneAlive(z, zid) === 0) { z.cleared[zid] = true; flash(`Område rensat: ${zid.replace('_', ' ')}`); checkVillage(); }
    return; }
  const mult = A.state_spawn_multiplier[st] ?? 0, outMult = A.outskirts?.state_spawn_multiplier[st] ?? 0, rs = A.runes_scaling ? (A.runes_scaling[String(S.runes)] || 1) : 1;
  let areaAlive = z.monsters.filter(m => !m.dead && m.point && !m.point.outskirts).length;
  for (const zid of z.zoneIds) if (!z.cleared[zid]) { const pts = sp.points.filter(p => p.zone === zid); if (pts.every(p => p.spawned) && zoneAlive(z, zid) === 0) { z.cleared[zid] = true; flash(`Område rensat: ${PB.village.zones.find(q => q.id === zid)?.id.replace('_', ' ') || zid}`); checkVillage(); } }
  for (const p of sp.points) {
    p.alive = p.alive.filter(m => !m.dead);
    if (p.zone && z.cleared[p.zone]) continue;
    if ((p.timer -= dt) > 0) continue;
    const k = p.outskirts ? outMult : mult, cap = Math.floor(p.max_alive * k), areaCap = Math.floor(A.max_alive_area * k * rs);
    if (cap <= 0 || p.alive.length >= cap || (!p.outskirts && areaAlive >= areaCap)) { p.timer = 2; continue; }
    const row = weighted(p.table), g = row.group || A.group_size; let n = Math.min(randi(g[0], g[1]), cap - p.alive.length, p.outskirts ? 99 : areaCap - areaAlive), placed = 0;
    for (let i = 0; i < n; i++) for (let tries = 0; tries < 10; tries++) { const a = rand(0, 6.283), r = Math.sqrt(Math.random()) * p.radius, x = p.pos[0] + Math.cos(a) * r, y = p.pos[1] + Math.sin(a) * r;
      if (okSpawn(z, x, y, A.min_player_distance, p.first)) { const m = spawnMonster(z, row.enemy, x, y, roll(p.level_range || A.level_range || [1, 1])); m.point = p; m.zoneId = p.zone; p.alive.push(m); placed++; areaAlive++; break; } }
    if (placed) { p.spawned = true; p.first = false; p.timer = p.resp ? rand(p.resp[0], p.resp[1]) : Infinity; } else p.timer = 5; // utan respawn_s: ingen respawn
  }
  for (const m of z.monsters) if (!m.dead && !m.boss && m.g.position.distanceTo(hero.position) > 60 && !visible(m.g.position.x, m.g.position.z)) { z.g.remove(m.g); m.gone = true; }
}

// ---------- skada ----------
function floatText(pos, text, cls = '') { const el = document.createElement('div'); el.className = 'dmg ' + cls; el.textContent = text; document.body.appendChild(el); Z.fx.push({ el, p: pos.clone(), life: 0.9, kind: 'txt' }); }
const sparkGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
function sparks(pos, color = 0xffd890, n = 14) { const mat = new THREE.MeshBasicMaterial({ color }); for (let i = 0; i < n; i++) { const s = new THREE.Mesh(sparkGeo, mat); s.position.copy(pos); s.userData = { v: new THREE.Vector3(rand(-0.5, 0.5), rand(0.2, 1), rand(-0.5, 0.5)).multiplyScalar(6), life: 0.4 }; Z.g.add(s); Z.fx.push({ mesh: s, kind: 'spark' }); } }
function damageMonster(m, mult = 1, opts = {}) {
  if (m.dead) return;
  // Träffchans enligt attribut.json: AR mot monstrets DR och nivåer.
  if (!(m.immune > 0)) { const hc = L.hitChance(stats.AR, m.defense * 10 + 5 * m.lvl, S.level, m.lvl); if (Math.random() > hc) { m.aggroed = true; floatText(m.g.position.clone().setY(m.h + 0.3), 'Miss', 'res'); return; } }
  const t = stats.type, fm = m.fam.weak.includes(t) ? FAM.multiplier_rules.svag : m.fam.resist.includes(t) ? FAM.multiplier_rules.resistent : 1, crit = Math.random() < stats.crit;
  let dmg = rand(stats.dmgMin, stats.dmgMax) * mult * fm * (1 + (stats.vs[L.monsterFamily(m.id) || m.def.family] || 0)) * (crit ? CLS.meta.crit_multiplier : 1);
  if (m.id === 'skelett_vakt') { const f = new THREE.Vector3(Math.sin(m.g.rotation.y), 0, Math.cos(m.g.rotation.y)), to = hero.position.clone().sub(m.g.position).normalize(); if (f.dot(to) > 0.3) dmg *= 0.5; }
  dmg = m.immune > 0 ? 0 : Math.max(1, Math.round(dmg - (m.vuln > 0 ? 0 : m.defense)));
  // Krosslag (Strong hit): 25 % av nuvarande HP, mot boss 10 % men högst 3 % av max HP.
  let strong = 0; if (dmg > 0 && Math.random() < stats.strong) { strong = Math.round(m.boss ? Math.min(m.hp * 0.10, m.max * 0.03) : m.hp * 0.25); dmg += strong; }
  m.hp -= dmg; m.flash = 0.15; if (dmg > 0 && stats.lifeOnHit) S.hp = Math.min(stats.maxHp, S.hp + stats.lifeOnHit); if (!m.boss) m.sp.visible = true; drawHp(m);
  const o = m.g.position.clone().sub(hero.position).setY(0).normalize(); m.kb.copy(o.multiplyScalar((opts.kb || 8) * (1 - (m.def.knockback_resist || 0)) * (m.boss ? 0.15 : 1)));
  if (opts.stun) m.stun = opts.stun; m.aggroed = true;
  const hp = m.g.position.clone(); hp.y = 1.2; sparks(hp);
  floatText(hp.clone().setY(m.h + 0.3), m.immune > 0 ? 'Immun' : (crit ? dmg + '!' : '' + dmg) + (strong ? ' Krosslag' : ''), (fm > 1 ? 'weak ' : fm < 1 ? 'res ' : '') + (crit ? 'crit' : ''));
  if (stats.lifesteal) S.hp = Math.min(stats.maxHp, S.hp + dmg * stats.lifesteal);
  if (m.id === 'skelett_runprast' && !(m.t.tp > 0) && m.hp > 0) { m.t.tp = 6; const a = rand(0, 6.28); m.g.position.x += Math.cos(a) * 5; m.g.position.z += Math.sin(a) * 5; collide(m.g.position, 0.5); }
  if (m.hp <= 0) killMonster(m);
}
// XP(L) = round(xp_ref/10 × 3 × L^1,5) × avdrag efter nivåskillnad (bossar golv 0,25).
function monsterXp(m) { const diff = S.level - m.lvl, row = MN.xp_penalty.table.find(r => r.hjalte_minus_monster === Math.max(-8, Math.min(12, diff))); let k = row ? row.xp_mult : 1; if (m.boss) k = Math.max(0.25, k);
  return Math.round((m.def.xp || 10) / 10 * 3 * Math.pow(m.lvl, 1.5) * k); }
function killMonster(m) { m.dead = 0.001; m.sp.visible = false; gainXp(monsterXp(m)); dropLoot(m); if (m.boss) bossDefeated(); }
function hurt(raw, from, m) {
  if (!S.playing || S.god) return; raw *= m?.dmgMult || 1;
  const alvl = m?.lvl || S.level;
  // Fiendens träffchans mot spelarens försvarsvärde (försvar × 10).
  if (Math.random() > L.hitChance(20 + 8 * alvl, stats.defRating, alvl, S.level)) { floatText(hero.position.clone().setY(2.4), 'Undvek', 'weak'); return; }
  const front = from ? fwd().dot(from.clone().sub(hero.position).setY(0).normalize()) > 0.2 : true;
  // Block: sköldens chans, halverad när man springer, tak 75 %, aldrig bakifrån. Kostar 5 uthållighet.
  if (stats.block > 0 && front && S.st >= 5 && Math.random() < stats.block * (heroMoving ? 0.5 : 1)) { S.st -= 5; S.stDelay = 1; floatText(hero.position.clone().setY(2.4), 'Block', 'weak'); sparks(hero.position.clone().setY(1.2), 0xc8d0d8, 8); return; }
  let d = raw;
  if (blocking && from && front && S.st >= 5) { d *= 0.3; S.st -= 5; S.stDelay = 1; }
  d = Math.max(1, Math.round(d - stats.defReduce)); S.hp = Math.max(0, S.hp - d);
  if (stats.thorns && m && !m.dead) { m.hp -= stats.thorns; drawHp(m); if (m.hp <= 0) killMonster(m); }
  floatText(hero.position.clone().setY(2.4), '-' + d, 'hurt');
  const f = $('flash'); f.classList.add('on'); setTimeout(() => f.classList.remove('on'), 90);
  if (S.hp <= 0) { S.playing = false; setTimeout(() => $('lose').classList.remove('hidden'), 600); }
}

// ---------- loot / XP ----------
// Dropalgoritmen i js/loot.js (loot_design.md, 7 steg). Här läggs resultatet på marken.
function dropLoot(m) {
  const first = m.boss && !S.killed[m.id]; if (m.boss) S.killed[m.id] = true;
  const { seed, drops } = L.rollDrops({ id: m.id, mlvl: m.lvl, ilvl: Math.min(MN.item_level.cap, m.lvl + (m.boss ? MN.item_level.bonus.boss : 0)), mf: stats.mf, goldFind: stats.goldFind, firstKill: first }); lastSeeds.push(seed); if (lastSeeds.length > 20) lastSeeds.shift();
  const p = m.g.position; drops.forEach((o, i) => { const a = i / drops.length * 6.28 + rand(0, 1), r = drops.length > 1 ? 0.6 + rand(0, 0.6) : rand(0, 0.3); spawnDrop(Z, p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, o); });
}
const lastSeeds = [];
const QRANK = { legendary: 0, set: 1, rare: 2, magic: 3, normal: 4 };
const dropColor = o => o.gold ? '#f2c46b' : L.colorOf(o.item);
const dropName = o => o.gold ? `${o.gold} guld` : L.nameOf(o.item) + (o.item.n > 1 ? ` (${o.item.n})` : '');
function spawnDrop(z, x, y, o) {
  const col = new THREE.Color(dropColor(o)), b = o.item && L.baseOf(o.item);
  const geo = o.gold ? new THREE.CylinderGeometry(0.18, 0.18, 0.05, 8) : b.category === 'dryck' ? new THREE.CylinderGeometry(0.1, 0.14, 0.3, 8) : new THREE.OctahedronGeometry(b.category === 'adelsten' || b.category === 'ring' || b.category === 'amulett' ? 0.14 : 0.22);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.8 })); mesh.position.set(x, 0.4, y);
  const pts = makeParticles(10, col.getHex(), 0.08); pts.pts.material.opacity = 0.9; mesh.add(pts.pts);
  const d = { mesh, pts, o, t: rand(0, 6) };
  if (!o.gold) { const hit = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), hitMat); hit.userData.drop = d; mesh.add(hit); d.hit = hit; }
  if (o.item && (o.item.quality === 'set' || o.item.quality === 'legendary')) { // ljuspelare i kvalitetens färg
    const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, 8, 10, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    pil.position.set(x, 4, y); z.g.add(pil); d.pillar = pil; flash(`${L.nameOf(o.item)} föll!`, dropColor(o)); }
  z.g.add(mesh); z.drops.push(d);
}
function removeDrop(d) { Z.g.remove(d.mesh); if (d.pillar) Z.g.remove(d.pillar); d.el?.remove(); const i = Z.drops.indexOf(d); if (i >= 0) Z.drops.splice(i, 1); if (pickTarget === d) pickTarget = null; }
// Bara guld plockas automatiskt. Föremål plockas med klick på föremålet eller etiketten. Returnerar false om väskan är full.
// Första upplock per föremåls-id (legendarisk id, setdelens id eller bastyp) sparas i localStorage för lorebokens skull.
function recordFound(it) { const id = it.leg || (it.set && L.SETPIECE[it.set + ':' + it.base]?.piece.id) || it.base; try { const f = JSON.parse(localStorage.getItem('rpg_found') || '{}'); if (!f[id]) { f[id] = { first: new Date().toISOString(), quality: it.quality, base: it.base, ilvl: it.ilvl }; localStorage.setItem('rpg_found', JSON.stringify(f)); } } catch {} }
function pickup(d) {
  if (d.o.gold) { S.gold += d.o.gold; floatText(hero.position.clone().setY(2.2), `+${d.o.gold} guld`, 'weak'); inv.save(); removeDrop(d); return true; }
  const it = d.o.item, name = dropName(d.o);
  if (!inv.addToBag(it)) { flash('Väskan är full'); return false; }
  recordFound(it); flash(`Hittade: ${name}`, dropColor(d.o)); removeDrop(d); renderSlots(); return true;
}
function gainXp(n) {
  if (S.level >= PB.progression.max_level) return; S.xp += n;
  while (S.level < PB.progression.max_level && S.xp >= need(S.level)) { S.xp -= need(S.level); S.level++; recalc(); S.hp = stats.maxHp; S.st = stats.maxSt; flash(`Nivå ${S.level}!`); }
  if (S.level >= PB.progression.max_level) S.xp = 0;
}
function useItem(it) {
  const b = L.baseOf(it); if (b.category !== 'dryck') return;
  if (b.heal) S.hp = Math.min(stats.maxHp, S.hp + b.heal); if (b.heal_pct) S.hp = Math.min(stats.maxHp, S.hp + stats.maxHp * b.heal_pct);
  if (b.stamina) S.st = Math.min(stats.maxSt, S.st + b.stamina); if (b.stamina_pct) S.st = Math.min(stats.maxSt, S.st + stats.maxSt * b.stamina_pct);
  if (--it.n <= 0) S.inv.splice(S.inv.indexOf(it), 1); inv.save(); if (inv.isOpen()) inv.render(); renderSlots();
}
function quaff(kind) { const it = S.inv.find(i => { const b = L.baseOf(i); return b.category === 'dryck' && (kind === 'hp' ? b.heal || b.heal_pct : b.stamina || b.stamina_pct); }); if (it) useItem(it); else flash('Inga drycker kvar'); }
// Inventory (js/inventory.js) och synlig utrustning (js/gear.js)
const inv = createInventory({ L, S, statsFor: eq => L.computeStats(S.cls, S.level, eq), onChange: () => { recalc(); refreshGear(); renderSlots(); }, onUse: it => useItem(it), flash });
// Liten Three.js-vy av hjälten på gubben i inventoryn (egen renderare), roterar långsamt och byggs om vid utrustningsbyte.
const doll = { dirty: true, r: null, scene: null, cam: null, fig: null, t: 0,
  render(dt) {
    if (!this.r) { this.r = new THREE.WebGLRenderer({ canvas: inv.canvas, alpha: true, antialias: true }); this.r.setPixelRatio(Math.min(devicePixelRatio, 2)); this.r.setSize(300, 330, false); this.r.outputColorSpace = THREE.SRGBColorSpace;
      this.scene = new THREE.Scene(); this.scene.add(new THREE.HemisphereLight(0xc8d0e0, 0x302820, 1.6)); const dl = new THREE.DirectionalLight(0xfff0d8, 2.2); dl.position.set(2, 4, 3); this.scene.add(dl);
      this.cam = new THREE.PerspectiveCamera(30, 300 / 330, 0.1, 50); this.cam.position.set(0, 1.2, 5.4); this.cam.lookAt(0, 1.05, 0); }
    if (this.dirty && CT.human && S.cls) { this.dirty = false; if (this.fig) this.scene.remove(this.fig); const root = new THREE.Group(), g = skClone(CT.human.scene); const bb = new THREE.Box3().setFromObject(g); g.scale.setScalar(1.95 / (bb.max.y - bb.min.y)); root.add(g); toonify(g, HERO_TINT[S.cls.id]);
      applyGear(root, S.equip, { L, findNode }); this.fig = root; this.scene.add(root); }
    this.t += dt; if (this.fig) this.fig.rotation.y = Math.sin(this.t * 0.4) * 0.9; this.r.render(this.scene, this.cam);
  } };
function refreshGear() { if (H.model) applyGear(hero, S.equip, { L, findNode }); doll.dirty = true; }
function startGear() {
  S.inv.length = 0; for (const s of SLOTS) S.equip[s] = null;
  for (const g of S.cls.start_gear) { const [id, n] = g.split('_x'); if (!L.B[id] || L.B[id].subtype) continue; const it = L.makeItem(id, { n: +n || 1 }); const sl = L.slotOf(L.B[id]);
    if (L.equipable(L.B[id]) && sl && !S.equip[sl]) S.equip[sl] = it; else inv.addToBag(it); }
}
// ---------- uppdrag ----------
function quest() {
  const v = zones.village;
  const q = [['Runornas kall', 'Väck de tre runstenarna i skogen.', `Runstenar: ${S.runes}/3`], ['Runornas kall', 'Gå genom den röda portalen.', 'Gå genom portalen'],
    ['Rensa byn', 'Driv ut de odöda ur byns områden.', v ? `Områden rensade: ${Object.keys(v.cleared).length}/${v.zoneIds.length}` : ''],
    ['Besegra Benkungen Valdemar', 'Kapellets port är öppen. Möt Benkungen.', ''], ['Byn är rensad', 'Människor kan flytta tillbaka.', '✔']][S.stage];
  $('qTitle').textContent = q[0]; $('qText').textContent = q[1]; $('qCount').textContent = q[2];
}
function checkVillage() {
  const v = zones.village; if (!v || S.stage !== 2 || v.zoneIds.some(id => !v.cleared[id])) { quest(); return; }
  S.stage = 3; v.barrier.visible = false; v.barrierCols.forEach(c => c.off = true); flash('Kapellets port öppnas…'); quest();
}
function bossDefeated() {
  S.stage = 4; S.city = 'rensad'; $('bossbar').classList.add('hidden'); localStorage.setItem('rk_stad_gamla_byn', 'rensad'); quest();
  const v = zones.village; v.fog = [0x1c2128, 12, 55]; for (const p of v.portals) { [p.mat.color, p.mat.emissive, p.light.color, p.parts.pts.material.color, p.disc.material.color].forEach(c => c.setHex(P.torch)); }
  setTimeout(() => { S.playing = false; $('win').classList.remove('hidden'); }, 2500);
}

// ---------- strid ----------
let atkT = 0, atkCd = 0, skillCd = 0, blocking = false, heroMoving = false;
const fwd = () => new THREE.Vector3(Math.sin(hero.rotation.y), 0, Math.cos(hero.rotation.y));
function arcHit(range, dot, mult, opts = {}, max = 99) {
  const f = fwd(); let n = 0;
  for (const m of Z.monsters) { if (m.dead || n >= max) continue; const o = m.g.position.clone().sub(hero.position).setY(0), d = o.length(), r = range + (m.boss ? 0.8 : 0.4);
    if (d < r && (d < 0.01 || o.dot(f) / d > dot)) { damageMonster(m, mult, opts); n++; } }
  return n;
}
function attack() { if (!S.playing || atkCd > 0) return; atkCd = 0.5 / stats.atkSpeed; atkT = 0.3; H.anim?.play('attack-melee-right', 0.05, true, 0.35); arcHit(stats.reach, 0.3, 1); }
function skill(down = true) {
  if (!S.playing) return; const c = S.cls, sk = c.skills[0];
  if (c.id === 'riddare') { blocking = down && S.st > 0; return; }
  if (!down || skillCd > 0 || !spendSt(sk.stamina_cost)) return; skillCd = sk.cooldown_s; atkT = 0.3; atkCd = 0.5; H.anim?.play('attack-melee-right', 0.05, true, 0.35);
  if (c.id === 'amazonkrigare') arcHit(3.5, 0.85, 1.5, { kb: 5 }, 2);
  if (c.id === 'barbar') { arcHit(2.4, 0.2, 2.0, { kb: 10, stun: 1 }); sparks(hero.position.clone().add(fwd().multiplyScalar(1.5)).setY(0.2), 0xc8b090, 20); }
  flash(sk.name);
}
function projectile(from, to, speed, dmg, kind) {
  const mesh = kind === 'fire' ? new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: P.glow })) : new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.7), new THREE.MeshBasicMaterial({ color: P.bone }));
  mesh.position.copy(from); const v = to.clone().sub(from).setY(0).normalize().multiplyScalar(speed); mesh.lookAt(from.clone().add(v)); Z.g.add(mesh); Z.projectiles.push({ mesh, v, dmg, life: 3 });
}
const inArena = p => Z.arena && p.x > Z.arena[0] - 1 && p.x < Z.arena[2] + 1 && p.z > Z.arena[1] - 1 && p.z < Z.arena[3];
function updateMonsters(dt) {
  const hp = hero.position; let near = false;
  for (const m of Z.monsters) {
    if (m.dead) { m.dead += dt; if (m.anim) { m.anim.play('die', 0.1); m.anim.mixer.update(dt); } if (!m.anim || m.dead > 0.7) m.g.position.y -= dt * 0.8; m.mats.forEach(x => x.opacity = Math.max(0, 1 - m.dead)); if (m.dead > 1.2) { Z.g.remove(m.g); m.gone = true; } continue; }
    const p = m.g.position, hx = hp.x - p.x, hz = hp.z - p.z, d = Math.hypot(hx, hz) || 0.01, D = m.def;
    for (const k in m.t) m.t[k] -= dt; m.cd -= dt; m.immune = (m.immune || 0) - dt; m.vuln = (m.vuln || 0) - dt; m.stun -= dt;
    let vx = 0, vz = 0, sp = 0, face = null; const aggro = S.playing && (d < D.aggro_range || (m.aggroed && d < D.aggro_range * 2)) && (!m.boss || m.active);
    if (m.boss && !m.active && S.stage === 3 && inArena(hp)) { m.active = true; $('bossbar').classList.remove('hidden'); flash('Benkungen Valdemar vaknar!'); }
    if (m.stun > 0) { }
    else if (m.boss && m.active && S.playing) { const r = bossAI(m, d, hx, hz, dt); vx = r[0]; vz = r[1]; sp = r[2]; near = true; face = Math.atan2(hx, hz); }
    else if (m.charge > 0) { // taggsvin: laddning i fart 7
      m.charge -= dt; vx = m.cdir.x; vz = m.cdir.z; sp = 7; face = Math.atan2(vx, vz); near = true;
      if (!m.chit && d < 1.3) { m.chit = true; hurt(roll(D.damage), p, m); }
    } else if (aggro) {
      near = true; const ranged = D.attack_range > 5; face = Math.atan2(hx, hz);
      if (m.id === 'skelett_hund' && m.hp < m.max * 0.3 && !m.fled) m.fled = 2;
      if (m.fled > 0) { m.fled -= dt; vx = -hx / d; vz = -hz / d; sp = D.speed; face = Math.atan2(vx, vz); if (m.fled <= 0) m.fled = -1; }
      else if (m.id === 'taggsvin') {
        if (m.warn > 0) { m.warn -= dt; m.flash = 0.05; if (m.warn <= 0) { m.charge = 1; m.chit = false; m.cdir = new THREE.Vector3(hx / d, 0, hz / d); m.cd = D.attack_cd; } }
        else if (d < 8 && m.cd <= 0) m.warn = 1; else if (d > 2) { vx = hx / d; vz = hz / d; sp = D.speed; }
      }
      else if (ranged) {
        if (d < 5) { vx = -hx / d; vz = -hz / d; sp = D.speed * 0.8; } else if (d > 10) { vx = hx / d; vz = hz / d; sp = D.speed; }
        if (d <= D.attack_range && m.cd <= 0) { m.cd = D.attack_cd; const a = D.attacks[0]; projectile(p.clone().setY(1.4), hp.clone().setY(1.2), a.projectile_speed, roll(a.damage) * m.dmgMult, m.id === 'skelett_runprast' ? 'fire' : 'arrow'); m.atk = 0.3; }
      } else { if (d > D.attack_range * 0.75) { vx = hx / d; vz = hz / d; sp = D.speed; } if (d < D.attack_range && m.cd <= 0) { m.cd = D.attack_cd; m.atk = 0.3; hurt(roll(D.damage), p, m); } }
    } else {
      m.wt -= dt; if (m.wt <= 0) { m.wt = rand(2, 5); const a = rand(0, 6.28); m.tx = m.home[0] + Math.cos(a) * 5; m.tz = m.home[1] + Math.sin(a) * 5; }
      const ox = m.tx - p.x, oz = m.tz - p.z, od = Math.hypot(ox, oz); if (od > 0.5) { vx = ox / od; vz = oz / od; sp = D.speed * 0.4; face = Math.atan2(vx, vz); }
    }
    p.x += (vx * sp + m.kb.x) * dt; p.z += (vz * sp + m.kb.z) * dt; m.kb.multiplyScalar(Math.max(0, 1 - dt * 7)); collide(p, m.boss ? 0.9 : 0.5);
    if (Z.name === 'forest' && !aggro) { const r = Math.hypot(p.x, p.z); if (r < 12 && r > 0) { p.x *= 12 / r; p.z *= 12 / r; } }
    if (m.boss && !m.active) { p.x = m.home[0]; p.z = m.home[1]; }
    if (face !== null) { let df = face - m.g.rotation.y; df = Math.atan2(Math.sin(df), Math.cos(df)); m.g.rotation.y += df * Math.min(1, dt * 10); }
    m.walk += dt * sp * 3; const s = Math.sin(m.walk) * 0.6;
    if (m.anim) { m.atk = (m.atk || 0) - dt; if (m.atk > 0.25 || (m.wind > 0 && m.anim.cur !== m.anim.A['attack-melee-right'])) m.anim.play('attack-melee-right', 0.05, m.atk > 0.25, m.boss ? 0.6 : 0.4); else if (!(m.atk > 0) && !(m.wind > 0)) m.anim.play(sp > 0.3 ? 'walk' : 'idle'); if (m.anim.A.walk) m.anim.A.walk.timeScale = Math.max(0.6, sp / 2.5); m.anim.mixer.update(dt); }
    else if (m.legs.length === 4) m.legs.forEach((l, i) => l.rotation.x = (i === 0 || i === 3) ? s : -s); else { m.legs[0].rotation.x = s; m.legs[1].rotation.x = -s; }
    if (!m.anim && m.arms.length) { m.arms[0].rotation.x = -s * 0.6; m.atk = (m.atk || 0) - dt; m.arms[1].rotation.x = m.atk > 0 ? -2.2 + (0.3 - m.atk) * 7 : (m.wind > 0 ? -2.4 : s * 0.6); }
    m.body.position.y = Math.abs(Math.sin(m.walk)) * 0.07;
    m.flash = Math.max(0, m.flash - dt); const e = m.flash > 0 ? 0.9 : m.immune > 0 ? 0.25 : 0; m.mats.forEach(x => x.emissive.setRGB(e, e * 0.4, e * 0.4));
  }
  Z.monsters = Z.monsters.filter(m => !m.gone);
  return near;
}
function bossAI(m, d, hx, hz, dt) {
  const ratio = m.hp / m.max, ph = ratio > 0.6 ? 0 : ratio > 0.3 ? 1 : 2;
  if (ph !== m.phase) { m.phase = ph; m.immune = 2; flash(PB.boss.phases[ph].name); }
  const F = PB.boss.phases[ph], A = Object.fromEntries(F.attacks.map(a => [a.id, a])), mult = F.damage_mult || 1, speed = F.speed || PB.boss.speed, lie = A.liehugg, p = m.g.position;
  $('bossFill').style.width = Math.max(0, ratio * 100) + '%'; $('bossPhase').textContent = `Fas ${ph + 1}: ${F.name}`;
  if (m.wind > 0) { m.wind -= dt; if (m.wind <= 0) { m.atk = 0.3; const f = new THREE.Vector3(Math.sin(m.g.rotation.y), 0, Math.cos(m.g.rotation.y)), to = new THREE.Vector3(hx, 0, hz).normalize(); if (d <= lie.range + 0.6 && f.dot(to) >= Math.cos(lie.arc_deg / 2 * Math.PI / 180)) hurt(roll(lie.damage) * mult, p, m); } return [0, 0, 0]; }
  if (d <= lie.range && !(m.t.lie > 0)) { m.t.lie = lie.cd; m.wind = 0.35; return [0, 0, 0]; }
  if (A.benstorm && !(m.t.storm > 0) && (ph === 2 || d > 4)) { m.t.storm = A.benstorm.cd; for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; projectile(p.clone().setY(1.3), p.clone().add(new THREE.Vector3(Math.cos(a), 0, Math.sin(a))), 10, roll(A.benstorm.damage) * mult, 'arrow'); } }
  if (A.kalla_hovet && !(m.t.court > 0)) { m.t.court = A.kalla_hovet.cd; for (const [id, n] of Object.entries(A.kalla_hovet.summon)) for (let i = 0; i < n; i++) spawnMonster(Z, id, p.x + rand(-4, 4), p.z + rand(2, 4)).aggroed = true; flash('De dödas hov kallas!'); }
  if (A.gravslag && !(m.t.slam > 0)) { m.t.slam = A.gravslag.cd; const c = hero.position.clone(); const ring = new THREE.Mesh(new THREE.RingGeometry(A.gravslag.radius - 0.3, A.gravslag.radius, 40), new THREE.MeshBasicMaterial({ color: P.portal, transparent: true, opacity: 0.8 })); ring.rotation.x = -Math.PI / 2; ring.position.copy(c).setY(0.05); Z.g.add(ring);
    Z.fx.push({ kind: 'slam', mesh: ring, life: A.gravslag.telegraph_s, onEnd: () => { Z.g.remove(ring); sparks(c.clone().setY(0.3), P.bone, 30); if (hero.position.distanceTo(c) < A.gravslag.radius) hurt(roll(A.gravslag.damage) * mult, c, m); else { m.vuln = 3; flash('Benkungen är sårbar!'); } } }); }
  return d > lie.range * 0.8 ? [hx / d, hz / d, speed] : [0, 0, 0];
}

// ---------- input (Diablo-stil + WASD + touch) ----------
const keys = {}; let yaw = 0, yawVel = 0, pitch = 0.7, walkT = 0; const joy = { x: 0, y: 0 };
let mx = innerWidth / 2, my = innerHeight / 2, mouseIn = false, leftDown = false, rightDrag = false, moveTarget = null, enemyTarget = null, holdT = 0;
const ray = new THREE.Raycaster(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const markRing = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.5, 24), new THREE.MeshBasicMaterial({ color: P.hope, transparent: true, opacity: 0, depthWrite: false })); markRing.rotation.x = -Math.PI / 2; scene.add(markRing);
const targetRing = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.0, 32), new THREE.MeshBasicMaterial({ color: P.portal, transparent: true, opacity: 0.9, depthWrite: false })); targetRing.rotation.x = -Math.PI / 2; targetRing.visible = false; scene.add(targetRing);
function pick() {
  ray.setFromCamera(new THREE.Vector2(mx / innerWidth * 2 - 1, -(my / innerHeight) * 2 + 1), camera);
  const hits = ray.intersectObjects(Z.monsters.filter(m => !m.dead).map(m => m.hit), false);
  if (hits.length) return { m: hits[0].object.userData.m };
  const dh = ray.intersectObjects(Z.drops.filter(d => d.hit).map(d => d.hit), false); if (dh.length) return { d: dh[0].object.userData.drop };
  const pt = new THREE.Vector3(); return ray.ray.intersectPlane(groundPlane, pt) ? { p: pt } : null;
}
function clickAt(allowEnemy = true) {
  const r = pick(); if (!r) return;
  if (r.d) { if (allowEnemy) grabDrop(r.d); return; }
  if (r.m && allowEnemy) { enemyTarget = r.m; moveTarget = null; pickTarget = null; }
  else if (r.p) { enemyTarget = null; pickTarget = null; moveTarget = r.p; markRing.position.set(r.p.x, 0.04, r.p.z); if (allowEnemy) { markRing.material.opacity = 1; markRing.scale.setScalar(1.4); } }
}
addEventListener('keydown', e => {
  if (e.repeat) return; keys[e.code] = true;
  if (e.code === 'KeyE') activate(); if (e.code === 'Space') { e.preventDefault(); attack(); }
  if (e.code === 'KeyQ' || e.code === 'Digit2') skill(true); if (e.code === 'Digit1') attack();
  if (e.code === 'Digit3') quaff('hp'); if (e.code === 'Digit4') quaff('st'); if (e.code === 'Digit5') flash('Magi är låst – runorna bär på hemligheten');
  if ((e.code === 'KeyI' || e.code === 'KeyB') && S.cls) { inv.toggle(); moveTarget = enemyTarget = pickTarget = null; leftDown = false; } if (e.code === 'Escape') inv.close(); if (e.code === 'KeyG') setQuality(quality === 'hog' ? 'lag' : 'hog', null, true);
});
addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'KeyQ' || e.code === 'Digit2') skill(false); });
const cv = renderer.domElement;
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('mouseenter', () => mouseIn = true); cv.addEventListener('mouseleave', () => mouseIn = false);
cv.addEventListener('mousedown', e => { mx = e.clientX; my = e.clientY; mouseIn = true; if (!S.playing || !Z || inv.isOpen()) return; if (e.button === 0) { leftDown = true; holdT = 0; clickAt(); } if (e.button === 2) rightDrag = true; });
addEventListener('mouseup', e => { if (e.button === 0) leftDown = false; if (e.button === 2) rightDrag = false; });
addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; if (e.target === cv) mouseIn = true; if (rightDrag) { yaw -= e.movementX * 0.005; pitch = THREE.MathUtils.clamp(pitch + e.movementY * 0.004, 0.45, 1.15); } });
const touches = {}; const knob = $('knob'), joyEl = $('joy');
joyEl.addEventListener('touchstart', e => { e.preventDefault(); for (const t of e.changedTouches) touches[t.identifier] = { type: 'joy' }; }, { passive: false });
cv.addEventListener('touchstart', e => { for (const t of e.changedTouches) if (t.clientX > innerWidth / 2) touches[t.identifier] = { type: 'cam', x: t.clientX, y: t.clientY }; }, { passive: true });
addEventListener('touchmove', e => { for (const t of e.changedTouches) { const o = touches[t.identifier]; if (!o) continue;
  if (o.type === 'joy') { const b = joyEl.getBoundingClientRect(); let dx = t.clientX - (b.left + b.width / 2), dy = t.clientY - (b.top + b.height / 2); const l = Math.hypot(dx, dy), M = 40; if (l > M) { dx *= M / l; dy *= M / l; } joy.x = dx / M; joy.y = dy / M; knob.style.transform = `translate(${dx}px,${dy}px)`; }
  else { yaw -= (t.clientX - o.x) * 0.008; pitch = THREE.MathUtils.clamp(pitch + (t.clientY - o.y) * 0.005, 0.45, 1.15); o.x = t.clientX; o.y = t.clientY; } } }, { passive: true });
addEventListener('touchend', e => { for (const t of e.changedTouches) { if (touches[t.identifier]?.type === 'joy') { joy.x = joy.y = 0; knob.style.transform = ''; } delete touches[t.identifier]; } });
const tb = (id, f, up) => { $(id).addEventListener('touchstart', e => { e.preventDefault(); f(); }, { passive: false }); if (up) $(id).addEventListener('touchend', up); $(id).onclick = f; };
tb('actBtn', () => activate()); tb('atkBtn', () => attack()); tb('skBtn', () => skill(true), () => skill(false));
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); });
$('qBtn').onclick = () => setQuality(quality === 'hog' ? 'lag' : 'hog', null, true);

// ---------- Alt: etiketter för loot ----------
let altDown = false;
document.addEventListener('contextmenu', e => e.preventDefault());
const isAlt = e => e.key === 'Alt' || e.code === 'AltLeft' || e.code === 'AltRight';
addEventListener('keydown', e => { if (isAlt(e)) { e.preventDefault(); altDown = true; } }, true);
addEventListener('keyup', e => { if (isAlt(e)) { e.preventDefault(); altDown = false; } }, true);
addEventListener('blur', () => { altDown = false; for (const k in keys) keys[k] = false; });
const lblBox = document.createElement('div'); lblBox.id = 'lootLabels'; document.body.appendChild(lblBox);
let pickTarget = null;
// Klick på etikett eller föremål: plocka direkt inom 2 enheter, annars gå dit och plocka vid framkomst.
function grabDrop(d) {
  if (!Z.drops.includes(d)) return;
  if (Math.hypot(d.mesh.position.x - hero.position.x, d.mesh.position.z - hero.position.z) <= 2) { pickTarget = null; moveTarget = null; pickup(d); }
  else { enemyTarget = null; pickTarget = d; moveTarget = d.mesh.position.clone().setY(0); }
}
function updateLootLabels() {
  for (const el of lblBox.children) el.style.display = 'none';
  if (!altDown || !S.playing || inv.isOpen()) return;
  const items = [];
  for (const d of Z.drops) {
    if (!d.el) { const el = document.createElement('div'); el.className = 'lootLbl'; el.innerHTML = `<span></span><i></i>`; el.firstChild.textContent = dropName(d.o); el.style.color = dropColor(d.o);
      el.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); grabDrop(d); }); el.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); grabDrop(d); }, { passive: false }); lblBox.appendChild(el); d.el = el; }
    const v = d.mesh.position.clone().setY(0.9).project(camera); if (v.z > 1) continue;
    items.push({ d, x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, q: d.o.gold ? 5 : QRANK[d.o.item.quality] ?? 4 });
  }
  items.sort((a, b) => a.q - b.q || b.y - a.y); const placed = [];
  for (const it of items.slice(0, 12)) { it.d.el.style.display = 'block'; const w = it.d.el.offsetWidth, h = 20; let y = it.y;
    for (let moved = true; moved;) { moved = false; for (const p of placed) if (Math.abs(p.x - it.x) < (p.w + w) / 2 + 4 && Math.abs(p.y - y) < h) { y = p.y - h; moved = true; } }
    placed.push({ x: it.x, y, w }); it.d.el.style.left = it.x + 'px'; it.d.el.style.top = y + 'px'; it.d.el.lastChild.style.height = Math.max(0, it.y - y) + 'px'; }
}

// ---------- runor / portal / zonbyte ----------
function nearRune() { return Z?.runes?.find(r => !r.active && Math.hypot(r.x - hero.position.x, r.z - hero.position.z) < 2.6); }
function activate(r = nearRune(), free = false) {
  if (!S.playing || !r || r.active) return false; if (!free && !spendSt(20)) return false;
  r.active = true; S.runes++; r.runeMat.emissive.setHex(0x7fb8d8); r.runeMat.emissiveIntensity = 2; flash(`Runan vaknar! (${S.runes}/3)`); quest();
  if (S.runes >= 3) setTimeout(() => { makePortal(zones.forest, ...PB.portal.forest_position, 'village'); S.stage = Math.max(S.stage, 1); quest(); flash('En röd portal öppnar sig i gläntan…'); }, PB.portal.trigger.delay_s * 1000);
  return true;
}
let switching = false;
function enterZone(name, spawn) {
  if (switching) return; switching = true; $('fade').classList.add('on'); moveTarget = enemyTarget = null;
  setTimeout(() => {
    if (Z) scene.remove(Z.g); if (!zones[name]) zones[name] = name === 'village' ? buildVillage() : buildForest();
    Z = zones[name]; scene.add(Z.g); const sp = spawn || Z.entry; hero.position.set(sp[0], 0, sp[1]); hero.rotation.y = Math.PI; yaw = 0; yawVel = 0; camPos.set(sp[0], 8, sp[1] + 8);
    if (name === 'village' && S.stage < 2) S.stage = 2; quest(); setFog(true);
    flash(name === 'village' ? 'Den gamla byn' : 'Den dimmiga skogen'); $('fade').classList.remove('on'); setTimeout(() => switching = false, 800);
  }, 420);
}
function setFog(snap) { let f = Z.fog; if (Z.name === 'village' && inArena(hero.position) && S.stage < 4) f = [0x1f0d10, 10, 45];
  const c = new THREE.Color(f[0]), k = snap ? 1 : 0.03; scene.fog.color.lerp(c, k); scene.fog.near += (f[1] - scene.fog.near) * k; scene.fog.far += (f[2] - scene.fog.far) * k; skyMat.uniforms.h.value.copy(scene.fog.color); }

// ---------- UI ----------
let msgT; function flash(t, color) { const m = $('msg'); m.textContent = t; m.style.color = color || ''; m.classList.remove('hidden'); clearTimeout(msgT); msgT = setTimeout(() => m.classList.add('hidden'), 2000); }
const SKILL_ICON = { amazonkrigare: '🔱', barbar: '💥', riddare: '🛡️' };
function renderSlots() {
  if (!S.cls) return; const cnt = f => S.inv.filter(i => f(L.baseOf(i))).reduce((a, b) => a + (b.n || 1), 0), hpN = cnt(b => b.category === 'dryck' && (b.heal || b.heal_pct)), stN = cnt(b => b.category === 'dryck' && (b.stamina || b.stamina_pct));
  $('slots').innerHTML = [['⚔️', 1, '', 'active'], [SKILL_ICON[S.cls.id], 2, 'Q', ''], ['🧪', 3, hpN, ''], ['🍶', 4, stN, ''], ['🔒', 5, '', 'locked']]
    .map(([i, k, n, c]) => `<div class="slot ${c}"><i>${i}</i><small>${k}</small><em>${n}</em>${k === 2 ? '<div class="cd" id="skcd"></div>' : ''}</div>`).join('');
}
$('help').textContent = 'Vänsterklick: gå / anfall · Musen mot kanten: vrid kameran · Högerdrag: kamera · WASD: gå · Mellanslag: hugg · Q: färdighet · E: aktivera · 3/4: drycker · B / I: utrustning · Alt: visa föremål';
let chosen = 'riddare';
$('classes').innerHTML = CLS.classes.map(c => `<div class="card${c.id === chosen ? ' sel' : ''}" data-id="${c.id}"><h2>${c.name}</h2><i>${c.role}</i><br>HP ${c.base.hp} · Uthållighet ${c.base.stamina}<br>Skada ${c.base.damage} (${c.main_damage_type}) · Försvar ${c.base.defense}<br>Fart ${c.base.speed} · Krit ${Math.round(c.base.crit_chance * 100)} %<br><i>Färdighet: ${c.skills[0].name}</i></div>`).join('');
document.querySelectorAll('.card').forEach(el => el.onclick = () => { chosen = el.dataset.id; document.querySelectorAll('.card').forEach(x => x.classList.toggle('sel', x === el)); });
function newGame(id) {
  S.cls = CLS.classes.find(c => c.id === id); Object.assign(S, { level: 1, xp: 0, gold: 0, stage: 0, runes: 0, inv: [], equip: {}, city: 'besatt' }); localStorage.removeItem('rk_stad_gamla_byn');
  S.killed = {}; if (!inv.load()) startGear(); inv.save(); recalc(); S.hp = stats.maxHp; S.st = stats.maxSt; renderSlots(); buildHero(id);
  for (const k in zones) { zones[k].fx.forEach(f => f.el?.remove()); delete zones[k]; } if (Z) scene.remove(Z.g); Z = null;
  $('bossbar').classList.add('hidden'); ['win', 'lose', 'start'].forEach(i => $(i).classList.add('hidden')); $('hud').classList.remove('hidden');
  S.playing = true; enterZone('forest', [0, 0]);
}
$('startBtn').onclick = () => newGame(chosen);
$('againBtn').onclick = () => { $('win').classList.add('hidden'); $('start').classList.remove('hidden'); $('hud').classList.add('hidden'); };
$('retryBtn').onclick = () => {
  $('lose').classList.add('hidden'); S.hp = stats.maxHp; S.st = stats.maxSt; S.playing = true; moveTarget = enemyTarget = null;
  const b = Z.monsters.find(m => m.boss); if (b) { b.hp = b.max; b.active = false; b.phase = 0; b.t = {}; drawHp(b); $('bossbar').classList.add('hidden'); }
  hero.position.set(Z.entry[0], 0, Z.entry[1]);
};

// ---------- huvudloop ----------
const clock = new THREE.Clock(), camPos = new THREE.Vector3(0, 8, 8), tmpV = new THREE.Vector3();
function tick() {
  requestAnimationFrame(tick);
  const rawDt = Math.min(clock.getDelta(), 0.05), dt = rawDt * (inv.isOpen() ? 0.05 : 1), t = clock.elapsedTime; // inventory öppet: världen nästan pausad
  if (inv.isOpen()) doll.render(rawDt);
  if (!Z) { render(); return; }
  if (!fpsChecked && S.playing) { fpsAcc += dt; fpsN++; if (fpsAcc > 4) { fpsChecked = true; if (quality === 'hog' && fpsN / fpsAcc < 24) setQuality('lag', 'Grafik: låg (automatiskt, låg bildfrekvens)'); } }
  // kamera: musens X-offset styr vridhastighet, dödzon 15 %, låg maxfart + dämpning
  let want = 0; if (!TOUCH && mouseIn && S.playing && !rightDrag) { const off = (mx / innerWidth - 0.5) * 2, dz = 0.15; if (Math.abs(off) > dz) want = -Math.sign(off) * (Math.abs(off) - dz) / (1 - dz) * 0.9; }
  yawVel += (want - yawVel) * Math.min(1, dt * 3); yaw += yawVel * dt;
  let ix = 0, iz = 0;
  if (S.playing) { if (keys.KeyW || keys.ArrowUp) iz -= 1; if (keys.KeyS || keys.ArrowDown) iz += 1; if (keys.KeyA || keys.ArrowLeft) ix -= 1; if (keys.KeyD || keys.ArrowRight) ix += 1; ix += joy.x; iz += joy.y; }
  let dx = 0, dz = 0, moving = false;
  if (Math.hypot(ix, iz) > 0.1) { moveTarget = enemyTarget = null; const l = Math.max(1, Math.hypot(ix, iz)); ix /= l; iz /= l; const s = Math.sin(yaw), c = Math.cos(yaw); dx = ix * c + iz * s; dz = -ix * s + iz * c; }
  else if (S.playing) {
    if (leftDown && !enemyTarget) { holdT += dt; if (holdT > 0.2) clickAt(false); }
    if (enemyTarget && (enemyTarget.dead || !Z.monsters.includes(enemyTarget))) enemyTarget = null;
    if (enemyTarget) { const o = enemyTarget.g.position.clone().sub(hero.position).setY(0), d = o.length(), reach = stats.reach + (enemyTarget.boss ? 0.6 : 0.2);
      if (d > reach) { dx = o.x / d; dz = o.z / d; } else { hero.rotation.y = Math.atan2(o.x, o.z); attack(); } }
    else if (moveTarget) { const o = moveTarget.clone().sub(hero.position).setY(0), d = o.length(); if (d < 0.3) moveTarget = null; else { dx = o.x / d; dz = o.z / d; } }
  }
  if (dx || dz) {
    const sp = stats.speed * dt * (blocking ? 0.5 : 1), p = hero.position, ox = p.x, oz = p.z; p.x += dx * sp; p.z += dz * sp; collide(p, 0.4);
    if (moveTarget && !leftDown && Math.hypot(p.x - ox, p.z - oz) < sp * 0.1) moveTarget = null;
    let diff = Math.atan2(dx, dz) - hero.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff)); hero.rotation.y += diff * Math.min(1, dt * 12); moving = true;
  }
  heroMoving = moving; {
  }
  walkT += dt * (moving ? 10 : 0); const sw = moving ? Math.sin(walkT) * 0.7 : 0, k = Math.min(1, dt * 10);
  if (H.anim) { if (atkT > 0) atkT -= dt; if (!S.playing && S.hp <= 0) H.anim.play('die', 0.1); else if (atkT > 0) { } else H.anim.play(moving ? 'walk' : 'idle'); if (H.anim.A.walk) H.anim.A.walk.timeScale = stats.speed / 4; H.anim.mixer.update(dt); }
  else { H.legL.rotation.x += (sw - H.legL.rotation.x) * k; H.legR.rotation.x += (-sw - H.legR.rotation.x) * k;
  H.armL.rotation.x += ((blocking ? -1.4 : -sw) - H.armL.rotation.x) * k;
  if (atkT > 0) { atkT -= dt; const q = 1 - Math.max(0, atkT) / 0.3, e2 = q * q * (3 - 2 * q); H.armR.rotation.x = -2.8 + e2 * 2.6; H.armR.rotation.z = Math.sin(q * Math.PI) * 0.5; } else { H.armR.rotation.x += (sw * 0.6 - H.armR.rotation.x) * k; H.armR.rotation.z *= 0.8; }
  H.torso.position.y = 1.2 + (moving ? Math.abs(Math.sin(walkT)) * 0.06 : Math.sin(t * 2) * 0.015); if (H.capeP) H.capeP.rotation.x = (moving ? 0.4 : 0.08) + Math.sin(t * 3) * 0.05; }
  atkCd -= dt; skillCd -= dt; if (blocking && S.st <= 0) blocking = false;
  updateSpawner(Z, dt);
  const near = updateMonsters(dt);
  for (let i = Z.projectiles.length - 1; i >= 0; i--) { const pr = Z.projectiles[i]; pr.life -= dt; pr.mesh.position.addScaledVector(pr.v, dt);
    if (pr.mesh.position.distanceTo(tmpV.copy(hero.position).setY(1.2)) < 0.7) { hurt(pr.dmg, pr.mesh.position.clone()); pr.life = 0; }
    if (pr.life <= 0) { Z.g.remove(pr.mesh); Z.projectiles.splice(i, 1); } }
  for (let i = Z.fx.length - 1; i >= 0; i--) { const f = Z.fx[i];
    if (f.kind === 'spark') { const u = f.mesh.userData; u.life -= dt; u.v.y -= 12 * dt; f.mesh.position.addScaledVector(u.v, dt); if (u.life <= 0) { Z.g.remove(f.mesh); Z.fx.splice(i, 1); } }
    else if (f.kind === 'txt') { f.life -= dt; f.p.y += dt * 1.2; const v = f.p.clone().project(camera); f.el.style.left = (v.x + 1) / 2 * innerWidth + 'px'; f.el.style.top = (1 - v.y) / 2 * innerHeight + 'px'; f.el.style.opacity = Math.min(1, f.life * 2); if (f.life <= 0) { f.el.remove(); Z.fx.splice(i, 1); } }
    else if (f.kind === 'slam') { f.life -= dt; f.mesh.material.opacity = 0.4 + Math.sin(t * 20) * 0.3; if (f.life <= 0) { f.onEnd(); Z.fx.splice(i, 1); } } }
  for (let i = Z.drops.length - 1; i >= 0; i--) { const d = Z.drops[i]; d.t += dt; d.mesh.position.y = 0.4 + Math.sin(d.t * 3) * 0.1; d.mesh.rotation.y += dt * 2;
    for (let j = 0; j < d.pts.n; j++) { const a = j * 2.4 + d.t * 2, ph = (d.t * 0.7 + j / d.pts.n) % 1; d.pts.pos[j * 3] = Math.cos(a) * 0.3; d.pts.pos[j * 3 + 1] = ph * 0.8 - 0.2; d.pts.pos[j * 3 + 2] = Math.sin(a) * 0.3; } d.pts.pts.geometry.attributes.position.needsUpdate = true;
    const dd = Math.hypot(d.mesh.position.x - hero.position.x, d.mesh.position.z - hero.position.z);
    if (S.playing && d.o.gold && dd < 1.2) pickup(d); else if (S.playing && pickTarget === d && dd < 1.4) { pickTarget = null; moveTarget = null; pickup(d); } }
  updateLootLabels();
  if (S.stDelay > 0) S.stDelay -= dt; else S.st = Math.min(stats.maxSt, S.st + stats.regen * dt);
  if (S.playing) S.hp = Math.min(stats.maxHp, S.hp + dt * ((near ? 0 : 2) + stats.lifeRegen));
  if (Z.runes) for (const r of Z.runes) { if (!r.active) continue; r.light.intensity = 3 + Math.sin(t * 4) * 0.6; r.parts.pts.material.opacity = 0.9;
    for (let i = 0; i < r.parts.n; i++) { const ph = (t * 0.4 + i / r.parts.n) % 1, a = i * 2.4 + t; r.parts.pos[i * 3] = Math.cos(a) * (0.8 + ph * 0.5); r.parts.pos[i * 3 + 1] = ph * 3.5; r.parts.pos[i * 3 + 2] = Math.sin(a) * (0.8 + ph * 0.5); } r.parts.pts.geometry.attributes.position.needsUpdate = true; }
  for (const pt of Z.portals || []) { pt.t += dt; pt.ring.rotation.z += dt * 0.6; pt.light.intensity = PB.portal.light_intensity * (1 + Math.sin(t * 9) * 0.15); pt.disc.material.opacity = 0.3 + Math.sin(t * 3) * 0.1;
    for (let i = 0; i < pt.parts.n; i++) { const ph = (t * 0.5 + i / pt.parts.n) % 1, a = i * 2.39 + t * 1.5, r = (1.4 + Math.sin(i) * 0.15) * (1 - ph * 0.6); pt.parts.pos[i * 3] = Math.cos(a) * r; pt.parts.pos[i * 3 + 1] = 1.7 + Math.sin(a) * r; pt.parts.pos[i * 3 + 2] = (ph - 0.5) * 0.6; } pt.parts.pts.geometry.attributes.position.needsUpdate = true;
    if (S.playing && pt.t > 0.5 && Math.hypot(pt.x - hero.position.x, pt.z - hero.position.z) < PB.portal.interaction_radius) enterZone(pt.target, pt.spawn); }
  for (const l of Z.torches || []) l.intensity = 1.2 * (1 + (Math.random() - 0.5) * 0.3);
  $('hp').style.height = S.hp / stats.maxHp * 100 + '%'; $('hpT').textContent = `${Math.ceil(S.hp)}/${stats.maxHp}`;
  $('st').style.height = S.st / stats.maxSt * 100 + '%'; $('stT').textContent = `${Math.floor(S.st)}/${stats.maxSt}`;
  $('xp').style.width = (S.level >= 10 ? 100 : S.xp / need(S.level) * 100) + '%'; $('lvl').textContent = `Nivå ${S.level}`; $('gold').textContent = `🪙 ${S.gold}`;
  const sc = $('skcd'); if (sc) sc.style.transform = `scaleY(${Math.max(0, skillCd / S.cls.skills[0].cooldown_s)})`;
  const nr = S.playing && nearRune(); $('prompt').classList.toggle('hidden', !nr); if (nr) $('prompt').textContent = 'Tryck E för att aktivera (20 uthållighet)';
  markRing.material.opacity = Math.max(0, markRing.material.opacity - dt * 1.4); markRing.scale.multiplyScalar(1 - dt * 0.8);
  targetRing.visible = !!enemyTarget; if (enemyTarget) { targetRing.position.set(enemyTarget.g.position.x, 0.05, enemyTarget.g.position.z); targetRing.scale.setScalar(enemyTarget.boss ? 1.7 : 1); }
  const off = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(10);
  camPos.lerp(off.add(hero.position).add(new THREE.Vector3(0, 1, 0)), Math.min(1, dt * 6)); camera.position.copy(camPos); camera.lookAt(hero.position.x, 1.3, hero.position.z); camera.updateMatrixWorld();
  sky.position.copy(camera.position); setFog(false);
  moon.position.set(hero.position.x - 20 + Math.sin(yaw) * 15, 50, hero.position.z + Math.cos(yaw) * 25); moon.target.position.copy(hero.position); lantern.position.set(hero.position.x, 2.6, hero.position.z);
  const head = new THREE.Vector3(hero.position.x, 1.4, hero.position.z), dir = head.clone().sub(camera.position);
  ray.set(camera.position, dir.clone().normalize()); ray.far = dir.length();
  const hit = new Set(); for (const h of ray.intersectObjects(Z.fades.map(o => o.g), true)) { let o = h.object; while (o && !Z.fades.some(f => f.g === o)) o = o.parent; if (o) hit.add(o); }
  ray.far = Infinity;
  for (const o of Z.fades) { const f = hit.has(o.g); for (const mt of o.mats) { mt.opacity += ((f ? 0.3 : 1) - mt.opacity) * Math.min(1, dt * 10); mt.depthWrite = mt.opacity > 0.95; } }
  // dimlager och damm följer hjälten
  for (const [i, m] of mistLayers.entries()) { m.position.x = hero.position.x; m.position.z = hero.position.z; m.material.map.offset.set(hero.position.x / 30 + t * 0.006 * (i + 1), -hero.position.z / 30 + t * 0.004); m.material.color.copy(scene.fog.color).multiplyScalar(1.6 + i * 0.2); }
  dust.pts.position.set(hero.position.x, 0, hero.position.z); for (let i = 0; i < dust.n; i++) { dust.pos[i * 3] += Math.sin(t * 0.3 + i) * dt * 0.3; dust.pos[i * 3 + 1] += Math.cos(t * 0.2 + i) * dt * 0.1; } dust.pts.geometry.attributes.position.needsUpdate = true;
  for (const pt of Z.portals || []) pt.cloud.pts.rotation.y += dt * 0.15;
  render();
}
setQuality(quality);
tick();

// ---------- debug ----------
window.__rpg = {
  state: S, hero, get zone() { return Z; }, get stats() { return stats; }, attack, skill, newGame, DEFS,
  setCamera(y, p) { yaw = y; yawVel = 0; if (p !== undefined) pitch = p; },
  activateAll() { hero.position.set(0, 0, 6); hero.rotation.y = Math.PI; yaw = 0; zones.forest.runes.forEach(r => activate(r, true)); },
  enterPortal() { enterZone('village'); },
  killAll() { Z.monsters.filter(m => !m.dead && !m.boss).forEach(m => { m.hp = 0; killMonster(m); }); },
  clearVillage() { const v = zones.village; v.zoneIds.forEach(id => v.cleared[id] = true); this.killAll(); checkVillage(); },
  spawnBoss() { const go = () => { this.clearVillage(); hero.position.set(1, 0, Z.arena[3] - 3); hero.rotation.y = Math.PI; yaw = 0; }; if (Z.name !== 'village') { enterZone('village'); setTimeout(go, 700); } else go(); },
  boss() { return Z.monsters.find(m => m.boss); },
  setBossHp(f) { const b = this.boss(); b.hp = b.max * f; drawHp(b); },
  setLevel(n) { S.level = Math.max(1, Math.min(PB.progression.max_level, n)); S.xp = 0; recalc(); S.hp = stats.maxHp; S.st = stats.maxSt; },
  spawnNear(dist = 3, id = Z.name === 'village' ? 'skelett_krigare' : 'skogsvarg') { return spawnMonster(Z, id, hero.position.x + Math.sin(hero.rotation.y) * dist, hero.position.z + Math.cos(hero.rotation.y) * dist); },
  screenOf(m) { const v = m.g.position.clone().setY(1).project(camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; },
  spawnInfo() { return { area: Z.sp?.A.id, points: Z.sp?.points.length, alive: Z.monsters.filter(m => !m.dead).map(m => m.id) }; },
  killBoss() { const b = this.boss(); b.immune = 0; b.hp = 0; drawHp(b); killMonster(b); },
  L, inv, camera, get lastSeeds() { return lastSeeds; },
  dropDemo() { const mk = (b, o) => ({ item: L.makeItem(b, o) }), list = [mk('stor_halsodryck'), mk('jarnyxa', { quality: 'magic', affixes: [{ id: 'vass', name: 'Vass', kind: 'prefix', stat: 'damage_pct', value: 0.18 }] }), mk('langsvard', { quality: 'legendary', leg: 'runsmidd_klinga' }), mk('ringbrynja', { quality: 'set', set: 'gravvaktarens_arv' }), mk('benhjalm', { quality: 'rare', rareName: 'Gravens Klo', affixes: [{ id: 'livets', name: 'Livets', kind: 'suffix', stat: 'life', value: 10 }] }), mk('laderharnesk'), mk('silverring', { quality: 'magic', affixes: [{ id: 'lyckosam', name: 'Lyckosam', kind: 'prefix', stat: 'magic_find', value: 0.08 }] }), { gold: 37 }];
    list.forEach((o, i) => { const a = i / list.length * 6.28; spawnDrop(Z, hero.position.x + Math.cos(a) * 2.5, hero.position.z + Math.sin(a) * 2.5, o); }); },
  give(base, o = {}) { const it = L.makeItem(base, o); return inv.addToBag(it) ? it : null; },
  spawnDropAt(dx, dz, o) { spawnDrop(Z, hero.position.x + dx, hero.position.z + dz, o); return Z.drops[Z.drops.length - 1]; },
  sim(id, n = 1000, mf = 0) { const c = {}; for (let i = 0; i < n; i++) for (const d of L.rollDrops({ id, mlvl: L.monsterLevel(id), mf }).drops) { const k = d.gold ? 'guld' : d.item.quality; c[k] = (c[k] || 0) + 1; } return c; },
  get alt() { return altDown; },
  god(on = true) { S.god = on; }
};
