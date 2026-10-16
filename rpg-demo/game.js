import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const FOG = 0x8a9aa8;
scene.background = new THREE.Color(FOG);
scene.fog = new THREE.FogExp2(FOG, 0.028);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 200);

scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x3a4a3a, 0.9));
const sun = new THREE.DirectionalLight(0xfff1dd, 1.2);
sun.position.set(20, 30, 10); sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 80 });
scene.add(sun, sun.target);

// toon gradient
const g = new Uint8Array([90, 160, 255]);
const grad = new THREE.DataTexture(g, 3, 1, THREE.RedFormat); grad.needsUpdate = true;
const toon = (c, o = {}) => new THREE.MeshToonMaterial({ color: c, gradientMap: grad, ...o });

const WORLD = 45;
const ground = new THREE.Mesh(new THREE.CircleGeometry(WORLD + 20, 48), toon(0x4d6b45));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

// seeded random
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const colliders = [];
const treeMats = [toon(0x2f5a3c), toon(0x3a6b46), toon(0x274d35)];
const trunkMat = toon(0x5a3f2a), rockMat = toon(0x8a8f96, { flatShading: true });
const coneGeo = new THREE.ConeGeometry(1, 1.6, 7), trunkGeo = new THREE.CylinderGeometry(0.15, 0.2, 1, 6);
const runePos = [[14, -10], [-16, -6], [4, 20]];
const free = (x, z, r) => Math.hypot(x, z) > 5 && runePos.every(([a, b]) => Math.hypot(x - a, z - b) > 4) && colliders.every(c => Math.hypot(x - c.x, z - c.z) > c.r + r);

function tree(x, z) {
  const s = 0.8 + rnd() * 0.9, t = new THREE.Group();
  const tr = new THREE.Mesh(trunkGeo, trunkMat); tr.position.y = 0.5; tr.castShadow = true; t.add(tr);
  const m = treeMats[(rnd() * 3) | 0];
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(coneGeo, m); const k = 1.3 - i * 0.3;
    c.scale.set(k, 1, k); c.position.y = 1.4 + i * 0.9; c.castShadow = true; t.add(c);
  }
  t.scale.setScalar(s); t.position.set(x, 0, z); t.rotation.y = rnd() * 6; scene.add(t);
  colliders.push({ x, z, r: 0.45 * s });
}
function rock(x, z) {
  const s = 0.5 + rnd() * 1.1;
  const geo = rnd() > 0.5 ? new THREE.DodecahedronGeometry(s, 0) : new THREE.IcosahedronGeometry(s, 0);
  const r = new THREE.Mesh(geo, rockMat); r.position.set(x, s * 0.4, z); r.rotation.set(rnd() * 3, rnd() * 3, 0);
  r.castShadow = r.receiveShadow = true; scene.add(r); colliders.push({ x, z, r: s * 0.9 });
}
for (let n = 0; n < 120;) { const a = rnd() * 6.283, d = Math.sqrt(rnd()) * (WORLD + 12), x = Math.cos(a) * d, z = Math.sin(a) * d; if (free(x, z, 1)) { tree(x, z); n++; } }
for (let n = 0; n < 35;) { const a = rnd() * 6.283, d = Math.sqrt(rnd()) * WORLD, x = Math.cos(a) * d, z = Math.sin(a) * d; if (free(x, z, 1.2)) { rock(x, z); n++; } }

// rune stones
const runes = runePos.map(([x, z]) => {
  const grp = new THREE.Group(); grp.position.set(x, 0, z);
  const stone = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.4, 0.5), toon(0x6f747c, { flatShading: true }));
  stone.position.y = 1.2; stone.rotation.z = 0.05; stone.castShadow = true; grp.add(stone);
  const runeMat = new THREE.MeshStandardMaterial({ color: 0x223344, emissive: 0x000000 });
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.45, 0.05), runeMat);
    r.position.set(0, 0.7 + i * 0.6, 0.27); r.rotation.z = (i - 1) * 0.5; grp.add(r);
    const r2 = r.clone(); r2.position.z = -0.27; grp.add(r2);
  }
  const light = new THREE.PointLight(0x55aaff, 0, 9); light.position.y = 2; grp.add(light);
  const pg = new THREE.BufferGeometry(); const pp = new Float32Array(40 * 3);
  pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  const parts = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0x88ccff, size: 0.15, transparent: true, opacity: 0, depthWrite: false }));
  grp.add(parts); scene.add(grp);
  colliders.push({ x, z, r: 0.8 });
  return { x, z, grp, runeMat, light, parts, pp, active: false, t: 0 };
});

// hero
const hero = new THREE.Group(); scene.add(hero);
const skin = toon(0xf0c8a0), tunic = toon(0x3e5f8a), pants = toon(0x4a3a2a), cape = toon(0x8a2a2a, { side: THREE.DoubleSide });
const box = (w, h, d, m, x, y, z, p = hero) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; p.add(b); return b; };
box(0.7, 0.8, 0.4, tunic, 0, 1.2, 0);
const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), skin); head.position.y = 1.85; head.castShadow = true; hero.add(head);
box(0.62, 0.15, 0.62, toon(0x6b4a2b), 0, 2.05, 0);
const limb = (x, y, w, h, m) => { const p = new THREE.Group(); p.position.set(x, y, 0); hero.add(p); box(w, h, w, m, 0, -h / 2, 0, p); return p; };
const armL = limb(-0.45, 1.55, 0.2, 0.7, tunic), armR = limb(0.45, 1.55, 0.2, 0.7, tunic);
const legL = limb(-0.17, 0.8, 0.24, 0.8, pants), legR = limb(0.17, 0.8, 0.24, 0.8, pants);
const sword = box(0.08, 0.9, 0.04, toon(0xcfd8e0), 0, -0.9, 0.15, armR); sword.rotation.x = Math.PI / 2;
box(0.25, 0.06, 0.06, toon(0x8a6a2a), 0, -0.68, 0.0, armR);
const capeM = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.2), cape); capeM.position.set(0, 1.0, -0.23); capeM.castShadow = true;
const capePivot = new THREE.Group(); capePivot.position.set(0, 1.6, -0.22); capeM.position.set(0, -0.6, 0); capePivot.add(capeM); hero.add(capePivot);

// state
const S = { hp: 100, mana: 100, count: 0, playing: false, won: false };
const keys = {}; let yaw = 0, pitch = 0.35, walkT = 0;
const joy = { x: 0, y: 0 };
const $ = id => document.getElementById(id);

function reset() {
  S.hp = 100; S.mana = 100; S.count = 0; S.won = false; S.playing = true;
  hero.position.set(0, 0, 0); hero.rotation.y = 0; yaw = 0;
  runes.forEach(r => { r.active = false; r.runeMat.emissive.setHex(0); r.light.intensity = 0; r.parts.material.opacity = 0; });
  $('win').classList.add('hidden'); $('hud').classList.remove('hidden');
}
$('startBtn').onclick = () => { $('start').classList.add('hidden'); reset(); };
$('againBtn').onclick = reset;

let msgT;
function flash(t) { const m = $('msg'); m.textContent = t; m.classList.remove('hidden'); clearTimeout(msgT); msgT = setTimeout(() => m.classList.add('hidden'), 1800); }

const COST = 20;
function nearRune() { return runes.find(r => !r.active && Math.hypot(r.x - hero.position.x, r.z - hero.position.z) < 2.6); }
function activate(r = nearRune()) {
  if (!S.playing || !r || r.active) return false;
  if (S.mana < COST) { flash('För lite mana…'); return false; }
  S.mana -= COST; r.active = true; S.count++;
  r.runeMat.emissive.setHex(0x3399ff); r.runeMat.emissiveIntensity = 2;
  flash(`Runan vaknar! (${S.count}/3)`);
  if (S.count >= 3) { S.won = true; S.playing = false; setTimeout(() => $('win').classList.remove('hidden'), 900); }
  return true;
}
window.__rpg = { activateAll() { runes.forEach(r => { S.mana = 100; activate(r); }); }, state: S, hero };

addEventListener('keydown', e => { keys[e.code] = true; if (e.code === 'KeyE') activate(); });
addEventListener('keyup', e => keys[e.code] = false);
// mouse camera
let drag = false;
renderer.domElement.addEventListener('mousedown', () => drag = true);
addEventListener('mouseup', () => drag = false);
addEventListener('mousemove', e => { if (drag) { yaw -= e.movementX * 0.005; pitch = THREE.MathUtils.clamp(pitch + e.movementY * 0.004, 0.05, 1.2); } });
// touch
const touches = {}; const knob = $('knob'), joyEl = $('joy');
joyEl.addEventListener('touchstart', e => { e.preventDefault(); for (const t of e.changedTouches) touches[t.identifier] = { type: 'joy' }; }, { passive: false });
renderer.domElement.addEventListener('touchstart', e => { for (const t of e.changedTouches) if (t.clientX > innerWidth / 2) touches[t.identifier] = { type: 'cam', x: t.clientX, y: t.clientY }; }, { passive: true });
addEventListener('touchmove', e => {
  for (const t of e.changedTouches) {
    const o = touches[t.identifier]; if (!o) continue;
    if (o.type === 'joy') {
      const b = joyEl.getBoundingClientRect(); let dx = t.clientX - (b.left + b.width / 2), dy = t.clientY - (b.top + b.height / 2);
      const l = Math.hypot(dx, dy), m = 40; if (l > m) { dx *= m / l; dy *= m / l; }
      joy.x = dx / m; joy.y = dy / m; knob.style.transform = `translate(${dx}px,${dy}px)`;
    } else { yaw -= (t.clientX - o.x) * 0.008; pitch = THREE.MathUtils.clamp(pitch + (t.clientY - o.y) * 0.005, 0.05, 1.2); o.x = t.clientX; o.y = t.clientY; }
  }
}, { passive: true });
addEventListener('touchend', e => { for (const t of e.changedTouches) { if (touches[t.identifier]?.type === 'joy') { joy.x = joy.y = 0; knob.style.transform = ''; } delete touches[t.identifier]; } });
$('actBtn').addEventListener('touchstart', e => { e.preventDefault(); activate(); }, { passive: false });
$('actBtn').onclick = () => activate();

addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

const clock = new THREE.Clock(); const camPos = new THREE.Vector3(0, 5, 8);
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  let ix = 0, iz = 0;
  if (S.playing) {
    if (keys.KeyW || keys.ArrowUp) iz -= 1; if (keys.KeyS || keys.ArrowDown) iz += 1;
    if (keys.KeyA || keys.ArrowLeft) ix -= 1; if (keys.KeyD || keys.ArrowRight) ix += 1;
    ix += joy.x; iz += joy.y;
  }
  const len = Math.hypot(ix, iz); let moving = false;
  if (len > 0.1) {
    ix /= Math.max(len, 1); iz /= Math.max(len, 1);
    const s = Math.sin(yaw), c = Math.cos(yaw);
    const dx = ix * c + iz * s, dz = -ix * s + iz * c, sp = 5.5 * dt;
    const p = hero.position; p.x += dx * sp; p.z += dz * sp;
    for (const k of colliders) { const ox = p.x - k.x, oz = p.z - k.z, d = Math.hypot(ox, oz), m = k.r + 0.4; if (d < m && d > 0) { p.x = k.x + ox / d * m; p.z = k.z + oz / d * m; } }
    const d = Math.hypot(p.x, p.z); if (d > WORLD) { p.x *= WORLD / d; p.z *= WORLD / d; }
    const target = Math.atan2(dx, dz); let diff = target - hero.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    hero.rotation.y += diff * Math.min(1, dt * 12); moving = true;
  }
  walkT += dt * (moving ? 10 : 0);
  const sw = moving ? Math.sin(walkT) * 0.7 : 0, k = Math.min(1, dt * 10);
  legL.rotation.x += (sw - legL.rotation.x) * k; legR.rotation.x += (-sw - legR.rotation.x) * k;
  armL.rotation.x += (-sw - armL.rotation.x) * k; armR.rotation.x += (sw * 0.6 - armR.rotation.x) * k;
  hero.children[0].position.y = 1.2 + (moving ? Math.abs(Math.sin(walkT)) * 0.06 : Math.sin(t * 2) * 0.015);
  capePivot.rotation.x = (moving ? 0.4 : 0.08) + Math.sin(t * 3) * 0.05;

  S.mana = Math.min(100, S.mana + dt * 3);
  $('hp').style.width = S.hp + '%'; $('mana').style.width = S.mana + '%'; $('qc').textContent = `${S.count}/3`;
  $('prompt').classList.toggle('hidden', !(S.playing && nearRune()));

  for (const r of runes) {
    if (!r.active) continue; r.t += dt;
    r.light.intensity = 3 + Math.sin(t * 4) * 0.8; r.parts.material.opacity = 0.9;
    for (let i = 0; i < 40; i++) {
      const ph = (t * 0.4 + i / 40) % 1, a = i * 2.4 + t;
      r.pp[i * 3] = Math.cos(a) * (0.8 + ph * 0.5); r.pp[i * 3 + 1] = ph * 3.5; r.pp[i * 3 + 2] = Math.sin(a) * (0.8 + ph * 0.5);
    }
    r.parts.geometry.attributes.position.needsUpdate = true;
  }

  const want = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(7.5).add(hero.position).add(new THREE.Vector3(0, 1.2, 0));
  camPos.lerp(want, Math.min(1, dt * 8)); camera.position.copy(camPos);
  camera.lookAt(hero.position.x, hero.position.y + 1.5, hero.position.z);
  sun.position.set(hero.position.x + 20, 30, hero.position.z + 10); sun.target.position.copy(hero.position);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
