// Synlig utrustning på hjälten. Platshållarformer per plats, viktklass och kvalitet.
// UI:s modulära modeller kan pluggas in genom att registrera en fabrik i GEAR_MODELS (nyckel = bastyp-id eller plats).
import * as THREE from 'three';
// Plats → ben i Kenney-skelettet. Värdet är en lista om delen syns på flera ben (t.ex. två handskar).
export const SLOT_BONES = { hjalm: ['head'], brost: ['torso'], balte: ['torso'], handskar: ['arm-left', 'arm-right'], stovlar: ['leg-left', 'leg-right'], vapen: ['arm-right'], offhand: ['arm-left'] };
export const WEIGHT_COLOR = { latt: 0x7a5434, lader: 0x8a9096, plate: 0xc9d1da }; // läderbrun, ringbrynjegrå, plåtstål
export const GLOW_QUALITIES = { rare: 0xffff64, set: 0x00c400, legendary: 0xc7a35a };
export const GEAR_MODELS = {}; // t.ex. GEAR_MODELS.langsvard = (item, base, mats) => Object3D

function mats(base, item) {
  const col = base.weight ? WEIGHT_COLOR[base.weight] : 0xb8bec6, glow = GLOW_QUALITIES[item.quality];
  const m = c => new THREE.MeshToonMaterial({ color: c, emissive: glow || 0x000000, emissiveIntensity: glow ? 0.35 : 0 });
  return { main: m(col), metal: m(0xc8ccd2), wood: m(0x5a3e26), dark: m(0x2a2a30), accent: m(glow || (base.weight === 'plate' ? 0xe0c070 : 0x4a3424)) };
}
const bx = (w, h, d, mat, x, y, z, p) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); o.position.set(x, y, z); o.castShadow = true; p.add(o); return o; };
// Vapen i höger hand, pekar framåt längs +z (handens lokala rum, världsenheter).
const WEAPON = {
  svard(g, M, b) { const L = b.tier === 3 ? 1.0 : b.tier === 2 ? 0.85 : 0.65; bx(0.05, 0.12, 0.2, M.wood, 0, 0, 0, g); bx(0.32, 0.06, 0.06, M.accent, 0, 0, 0.12, g); bx(0.04, 0.1, L, M.metal, 0, 0, 0.15 + L / 2, g); },
  yxa(g, M, b) { const L = b.two_handed ? 1.3 : 0.8; bx(0.06, 0.06, L, M.wood, 0, 0, L / 2 - 0.1, g); const h = bx(0.05, b.two_handed ? 0.45 : 0.3, 0.24, M.metal, 0, 0.12, L - 0.15, g); h.rotation.x = 0.1; },
  klubba(g, M, b) { const L = b.two_handed ? 1.2 : 0.75; bx(0.07, 0.07, L, M.wood, 0, 0, L / 2 - 0.1, g); const h = new THREE.Mesh(new THREE.DodecahedronGeometry(b.two_handed ? 0.22 : 0.15, 0), b.tier === 3 ? M.metal : M.dark); h.position.z = L - 0.1; g.add(h); },
  spjut(g, M) { bx(0.05, 0.05, 2.0, M.wood, 0, 0, 0.6, g); const t = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.35, 5), M.metal); t.rotation.x = Math.PI / 2; t.position.z = 1.75; g.add(t); },
  bage(g, M) { const a = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.03, 4, 12, Math.PI), M.wood); a.rotation.set(0, Math.PI / 2, Math.PI / 2); a.position.z = 0.1; g.add(a); },
  dolk(g, M) { bx(0.05, 0.1, 0.12, M.wood, 0, 0, 0, g); bx(0.18, 0.04, 0.04, M.accent, 0, 0, 0.07, g); bx(0.04, 0.07, 0.38, M.metal, 0, 0, 0.28, g); }
};
const ARMOR = {
  hjalm(g, M, b) { const r = 0.5; const d = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8, 0, Math.PI * 2, 0, Math.PI * (b.weight === 'latt' ? 0.38 : 0.5)), M.main); d.position.y = 0.5; d.castShadow = true; g.add(d);
    if (b.weight === 'plate') { bx(0.08, 0.3, 0.06, M.main, 0, 0.42, r - 0.02, g); const c = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.25, 4), M.accent); c.position.y = 1.05; g.add(c); }
    if (b.weight === 'lader') { for (const s of [-1, 1]) { const h = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.28, 5), M.metal); h.position.set(s * 0.42, 0.85, 0); h.rotation.z = -s * 0.7; g.add(h); } } },
  brost(g, M, b) { const t = bx(0.8, 0.5, 0.58, M.main, 0, 0.22, 0, g); if (b.weight === 'plate') { for (const s of [-1, 1]) bx(0.32, 0.14, 0.42, M.main, s * 0.44, 0.48, 0, g); bx(0.08, 0.36, 0.03, M.accent, 0, 0.24, 0.3, g); }
    if (b.weight === 'latt') bx(0.84, 0.1, 0.62, M.accent, 0, 0.44, 0, g); },
  balte(g, M) { bx(0.84, 0.1, 0.62, M.accent, 0, 0.0, 0, g); bx(0.12, 0.12, 0.04, M.metal, 0, 0.0, 0.32, g); },
  handskar(g, M, b) { bx(b.weight === 'plate' ? 0.3 : 0.26, 0.26, b.weight === 'plate' ? 0.3 : 0.26, M.main, 0, -0.52, 0, g); },
  stovlar(g, M, b) { bx(0.32, b.weight === 'latt' ? 0.1 : 0.3, 0.42, M.main, 0, b.weight === 'latt' ? -0.42 : -0.33, 0.05, g); },
  offhand(g, M, b) { const tall = b.id === 'tornskold', s = new THREE.Group(); s.position.set(-0.12, -0.45, 0.12); g.add(s);
    if (b.id === 'skold_ek') { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 12), M.wood); d.rotation.z = Math.PI / 2; s.add(d); bx(0.08, 0.1, 0.1, M.metal, -0.04, 0, 0, s); }
    else { bx(0.06, tall ? 0.85 : 0.6, tall ? 0.5 : 0.45, b.tier === 3 ? M.metal : M.main, 0, 0, 0, s); bx(0.08, 0.12, 0.12, M.accent, -0.03, 0, 0, s); } }
};
// Bygger om utrustningsdelarna på en Kenney-figur. ctx = { L (lootmodulen), findNode }.
export function applyGear(root, equip, ctx) {
  root.traverse(o => { if (o.userData.gearRoot) o.userData.dead = true; }); const old = []; root.traverse(o => { if (o.userData.dead) old.push(o); }); old.forEach(o => o.parent.remove(o));
  root.updateMatrixWorld(true);
  for (const [slot, it] of Object.entries(equip)) {
    if (!it) continue; const base = ctx.L.B[it.base], bones = SLOT_BONES[slot]; if (!bones) continue;
    for (const bn of bones) { const bone = ctx.findNode(root, bn); if (!bone) continue;
      const g = new THREE.Group(); g.userData.gearRoot = true; const ws = bone.getWorldScale(new THREE.Vector3()).x / root.getWorldScale(new THREE.Vector3()).x; g.scale.setScalar(1 / ws); bone.add(g);
      const M = mats(base, it), custom = GEAR_MODELS[base.id] || GEAR_MODELS[slot];
      if (custom) { g.add(custom(it, base, M)); continue; }
      if (slot === 'vapen') { const w = new THREE.Group(); w.position.set(0, -0.62, 0.3); g.add(w); (WEAPON[base.weapon_type] || WEAPON.svard)(w, M, base); }
      else if (ARMOR[slot]) ARMOR[slot](g, M, base); }
  }
}
