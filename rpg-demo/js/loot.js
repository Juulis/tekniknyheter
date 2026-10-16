// Lootsystem enligt speldesign (loot_design.md): kvaliteter, affix, set, legendariska, dropalgoritm och attribut.
export const SLOTS = ['hjalm', 'amulett', 'brost', 'vapen', 'offhand', 'handskar', 'balte', 'stovlar', 'ring1', 'ring2'];
export const SLOT_NAME = { hjalm: 'Hjälm', amulett: 'Amulett', brost: 'Bröst', vapen: 'Vapen', offhand: 'Sköld / offhand', handskar: 'Handskar', balte: 'Bälte', stovlar: 'Stövlar', ring1: 'Ring', ring2: 'Ring' };
export const STAT_LABEL = {
  damage_pct: ['% skada', 1], damage_flat: ['skada', 0], attack_rating: ['träffvärde (AR)', 0], defense_pct: ['% försvar', 1], defense: ['försvar', 0], block_chance: ['% block', 1],
  magic_find: ['% Magic Find', 1], lifesteal: ['% livsstöld', 1], vs_demoner_damage_pct: ['% skada mot demoner', 1], vs_ododa_damage_pct: ['% skada mot odöda', 1], vs_bestar_damage_pct: ['% skada mot bestar', 1],
  life: ['liv', 0], stamina: ['uthållighet', 0], stamina_regen_pct: ['% uthållighetsregen', 1], attack_speed_pct: ['% attackfart', 1], move_speed_pct: ['% rörelsefart', 1], strong_hit_chance: ['% krosslag', 1],
  bleed_dps: ['blödning/s', 0], thorns: ['taggar (skada tillbaka)', 0], gold_find: ['% mer guld', 1], life_regen: ['liv/s', 0], crit_chance: ['% krit', 1], damage_reduction_flat: ['skadereduktion', 0],
  life_on_hit: ['liv per träff', 0], range_bonus: ['räckvidd', 0], resist_dark_magic: ['% skydd mot mörk magi', 1], max_hp_bonus: ['liv', 0], speed_bonus: ['% rörelsefart', 1]
};
export function fmtStat(k, v) { const l = STAT_LABEL[k]; if (!l) return null; const n = l[1] ? Math.round(v * 1000) / 10 : Math.round(v * 10) / 10; return `${n >= 0 ? '+' : ''}${n}${l[1] ? '' : ' '}${l[0]}`; }

// Seedat slumptal (mulberry32) per drop för att kunna återskapa buggar.
export function rng(seed) { let a = seed >>> 0; const f = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  f.range = (lo, hi) => lo + f() * (hi - lo); f.int = (lo, hi) => Math.floor(lo + f() * (hi - lo + 1)); f.pick = arr => arr[Math.floor(f() * arr.length)];
  f.weighted = obj => { const e = Object.entries(obj).filter(([, w]) => w > 0), tot = e.reduce((s, [, w]) => s + w, 0); let r = f() * tot; for (const [k, w] of e) if ((r -= w) < 0) return k; return e.length ? e[e.length - 1][0] : null; }; return f; }
let seedCounter = 1; export const newSeed = () => ((Date.now() & 0xffffff) * 977 + (seedCounter++) * 2654435761) >>> 0;

export function createLoot({ QUAL, BAS, AFX, SET, DROP, ATTR }) {
  const Q = Object.fromEntries(QUAL.qualities.map(q => [q.id, q]));
  const all = [...BAS.weapons, ...BAS.armor, ...BAS.jewelry, ...BAS.potions, ...BAS.gems, ...BAS.materials];
  const B = Object.fromEntries(all.map(b => [b.id, b]));
  const LEG = Object.fromEntries(BAS.legendary.map(l => [l.id, l]));
  const SETS = Object.fromEntries(SET.sets.map(s => [s.id, s]));
  const SETPIECE = {}; for (const s of SET.sets) for (const p of s.pieces) SETPIECE[s.id + ':' + p.base] = { set: s, piece: p };
  const qualityOf = cat => ['vapen', 'rustning', 'amulett', 'ring'].includes(cat);

  // ----- bastyp-information -----
  const slotOf = b => b.category === 'vapen' ? (b.weapon_type === 'skold' ? 'offhand' : 'vapen') : b.category === 'rustning' ? b.slot : b.category === 'amulett' ? 'amulett' : b.category === 'ring' ? 'ring' : null;
  const equipable = b => !!slotOf(b) && !b.subtype && !b.stack;
  const affixGroups = b => { const s = slotOf(b); if (s === 'vapen') return ['vapen_ej_skold']; if (s === 'offhand') return ['skold']; if (b.category === 'rustning') return ['rustning', b.slot]; return [s]; };
  // Storlek i väskan: foremal_bas saknar storlek, så typiska D2-storlekar används.
  const SIZE = { svard: [1, 3], yxa: [2, 3], klubba: [1, 3], spjut: [2, 4], bage: [2, 3], dolk: [1, 2], skold: [2, 2], hjalm: [2, 2], brost: [2, 3], handskar: [2, 2], balte: [2, 1], stovlar: [2, 2] };
  function sizeOf(b) { if (b.size) return b.size; if (b.id === 'handyxa' || b.id === 'knotpak') return [1, 3]; if (b.id === 'tornskold') return [2, 3]; if (b.two_handed && b.weapon_type === 'klubba') return [2, 4];
    return SIZE[b.weapon_type] || SIZE[b.slot] || [1, 1]; }

  // ----- föremål -----
  function makeItem(baseId, o = {}) {
    const b = B[baseId]; const it = { uid: Math.random().toString(36).slice(2, 10), base: baseId, quality: o.quality || 'normal', affixes: o.affixes || [], sockets: o.sockets || [], ilvl: o.ilvl || b.item_level || 1, seed: o.seed };
    if (o.set) it.set = o.set; if (o.leg) it.leg = o.leg; if (o.rareName) it.rareName = o.rareName; if (b.stack) it.n = o.n || 1; return it;
  }
  const baseOf = it => B[it.base];
  function nameOf(it) {
    const b = B[it.base]; if (it.leg) return LEG[it.leg].name; if (it.set) return SETPIECE[it.set + ':' + it.base].piece.name; if (it.rareName) return it.rareName;
    if (it.quality === 'magic') { const pre = it.affixes.find(a => a.kind === 'prefix'), suf = it.affixes.find(a => a.kind === 'suffix'); return [pre?.name, pre ? b.name.toLowerCase() : b.name, suf?.name].filter(Boolean).join(' '); }
    return b.name;
  }
  function colorOf(it) { const b = B[it.base]; if (b.category === 'adelsten') return b.color; if (b.category === 'dryck') return b.heal || b.heal_pct ? '#e05a5a' : '#e0b24a'; if (b.category === 'material') return '#b0a890';
    return it.quality === 'normal' && it.sockets.length ? Q.normal.socketed_color : Q[it.quality].color; }
  // Alla egna attribut på ett föremål (bas, affix, fasta värden, hylsor). Skada och försvar räknas ut per föremål.
  function itemStats(it) {
    const b = B[it.base], s = {}, add = (k, v) => { s[k] = (s[k] || 0) + v; };
    for (const a of it.affixes) add(a.stat, a.value);
    const fixed = it.leg ? LEG[it.leg].fixed : it.set ? SETPIECE[it.set + ':' + it.base].piece.fixed : null;
    if (fixed) for (const [k, v] of Object.entries(fixed)) if (typeof v === 'number') add(k, v);
    const ctx = slotOf(b) === 'vapen' ? 'vapen' : slotOf(b) === 'offhand' ? 'skold' : 'rustning';
    for (const g of it.sockets) if (g && B[g]) { const e = B[g].socket_effect[ctx]; if (e) add(e.stat, e.value); }
    if (b.damage) { const pct = s.damage_pct || 0; s.wdmg = [Math.round((b.damage[0]) * (1 + pct)), Math.round((b.damage[1]) * (1 + pct))]; }
    if (b.defense != null || s.defense || s.defense_pct) { s.def = Math.round(((b.defense || 0) + (s.defense || 0)) * (1 + (s.defense_pct || 0))); }
    if (b.block_chance) add('block_chance', b.block_chance); if (b.max_hp_bonus) add('life', b.max_hp_bonus); if (b.speed_bonus) add('move_speed_pct', b.speed_bonus);
    return s;
  }
  // ----- affix -----
  function rollAffixes(b, ilvl, q, R, maxVals) {
    const groups = affixGroups(b), out = [], used = new Set();
    const cfg = Q[q].affixes; let total = R.int(cfg.total[0], cfg.total[1]), np = 0, ns = 0;
    for (let i = 0; i < total * 4 && out.length < total; i++) {
      const pool = AFX.affixes.filter(a => !used.has(a.id) && a.slots.some(sl => groups.includes(sl)) && a.tiers.some(t => t.min_ilvl <= ilvl) && (a.kind === 'prefix' ? np < cfg.prefix[1] : ns < cfg.suffix[1]));
      if (!pool.length) break; const a = R.pick(pool), tiers = a.tiers.filter(t => t.min_ilvl <= ilvl), t = maxVals ? tiers[tiers.length - 1] : R.pick(tiers);
      let v = maxVals ? t.value[1] : R.range(t.value[0], t.value[1]); v = Number.isInteger(t.value[0]) && Number.isInteger(t.value[1]) ? Math.round(v) : Math.round(v * 100) / 100;
      used.add(a.id); a.kind === 'prefix' ? np++ : ns++; out.push({ id: a.id, name: a.name, kind: a.kind, stat: a.stat, value: v, tier: t.tier });
    }
    return out;
  }
  function rollSockets(b, q, R) { const r = DROP.socket_rule[q]; if (!r || !b.sockets_max || R() >= r.chance) return []; const n = Math.min(+R.weighted(r.count_weights), b.sockets_max, Q[q].sockets_max); return Array(n).fill(null); }
  // ----- kvalitet med Magic Find (attribut.json) -----
  const effMf = (q, mf) => { const k = ATTR.magic_find.k[q]; return k ? mf * k / (mf + k) : mf; };
  function qualityChance(q, mlvl, mf, bossBonus) { return Q[q].base_chance * (1 + effMf(q, mf) / 100) * (1 + (mlvl - 1) * 0.03) * ((bossBonus && bossBonus[q]) || 1); }
  function finishQuality(b, q, ilvl, R, forceSet, forceLeg) {
    const o = { ilvl, seed: undefined };
    if (q === 'legendary') { const c = forceLeg ? [LEG[forceLeg]] : BAS.legendary.filter(l => l.base === b.id && (l.item_level || l.level) <= ilvl); if (c.length) return makeItem(b.id, { ...o, quality: 'legendary', leg: R.pick(c).id });
      q = 'rare'; o.extra = true; }
    if (q === 'set') { const c = SET.sets.filter(s => (forceSet ? s.id === forceSet : (s.item_level || s.level) <= ilvl) && s.pieces.some(p => p.base === b.id)); if (c.length) return makeItem(b.id, { ...o, quality: 'set', set: R.pick(c).id });
      q = 'magic'; o.maxVals = true; }
    if (q === 'magic' || q === 'rare') { let affixes = rollAffixes(b, ilvl, q, R, o.maxVals); if (o.extra) { const more = rollAffixes(b, ilvl, 'rare', R, true).filter(a => !affixes.some(x => x.id === a.id)); affixes = affixes.concat(more).slice(0, 6); }
      const it = makeItem(b.id, { ilvl, quality: q, affixes, sockets: rollSockets(b, q, R) }); if (q === 'rare') it.rareName = R.pick(QUAL.rare_names.forsta) + ' ' + R.pick(QUAL.rare_names.andra); return it; }
    return makeItem(b.id, { ilvl, quality: 'normal', sockets: rollSockets(b, 'normal', R) });
  }
  function rollQuality(mlvl, mf, bossBonus, R, minQ) {
    const order = QUAL.roll_order; for (const q of order) { if (q === 'normal') break; if (R() < qualityChance(q, mlvl, mf, bossBonus)) return q; }
    if (minQ) return minQ; return 'normal';
  }
  // ----- bastyp efter nivå (steg 4) -----
  function pickBase(pool, ilvl, R) { // steg 4: item_level ≤ ilvl, högsta tillåtna tier väger 3, lägre 1
    const ok = pool.filter(b => (b.item_level || 1) <= ilvl && !b.subtype && b.id !== 'pilar' && !(ilvl >= 20 && (b.tier || 1) === 1 && b.tier)); if (!ok.length) return null;
    const top = Math.max(...ok.map(b => b.tier || 1)); const w = {}; for (const b of ok) w[b.id] = (b.tier || 1) === top ? 3 : 1; return B[R.weighted(w)];
  }
  function tierOf(ilvl) { for (const [t, r] of Object.entries(BAS.meta.tiers)) if (ilvl >= r.ilvl[0] && ilvl <= r.ilvl[1]) return t; return '3'; }
  function rollCategory(cat, mlvl, ilvl, mf, bossBonus, R, minQ) {
    const tier = tierOf(ilvl);
    if (cat === 'dryck') return makeItem(R.weighted(DROP.potion_weights_by_tier[tier]));
    if (cat === 'adelsten') { const grade = R.weighted(DROP.gem_grade_weights_by_tier[tier]), gem = R.pick([...new Set(BAS.gems.map(g => g.gem))]); return makeItem(BAS.gems.find(g => g.gem === gem && g.grade === grade).id); }
    if (cat === 'material') return makeItem(R.pick(BAS.materials).id);
    const pool = cat === 'vapen' ? BAS.weapons : cat === 'rustning' ? BAS.armor : BAS.jewelry.filter(j => j.category === cat);
    const b = pickBase(pool, ilvl, R); if (!b) return null;
    return finishQuality(b, rollQuality(mlvl, mf, bossBonus, R, minQ), ilvl, R);
  }
  // ----- dropalgoritmen (loot_design.md, Notis till Utvecklare) -----
  function rollDrops({ id, mlvl, ilvl, mf = 0, goldFind = 0, firstKill = false }) {
    const seed = newSeed(), R = rng(seed), out = [];
    const boss = DROP.bosses[id], mon = DROP.monsters[id], fam = DROP.family_tables[(boss || mon)?.table || (boss || mon)?.family || 'bestar'];
    mlvl = mlvl || (boss ? boss.monster_level : 1); ilvl = ilvl || mlvl; // ilvl styr bastyp och affixtier, mlvl kvalitetens nivåfaktor och guld
    const weights = { ...fam.category_weights, ...(mon?.table_override?.category_weights ? {} : {}) }; if (mon?.table_override?.category_weights) Object.assign(weights, mon.table_override.category_weights, Object.fromEntries(Object.keys(fam.category_weights).filter(k => !(k in mon.table_override.category_weights)).map(k => [k, 0])));
    delete weights.guld;
    const goldMult = boss ? boss.gold_mult : fam.gold_mult, gold = () => Math.max(1, Math.round(mlvl * R.range(BAS.gold.gold_min_per_lvl, BAS.gold.gold_max_per_lvl) * goldMult * (1 + goldFind)));
    const one = (bossBonus, minQ) => { // steg 2 till 7 för ett föremål
      const wd = (boss || mon)?.weapon_drop; if (wd && R() < wd.chance) { const b = pickBase(BAS.weapons.filter(w => w.weapon_type === wd.weapon_type), ilvl, R); if (b) return finishQuality(b, rollQuality(mlvl, mf, bossBonus, R, minQ), ilvl, R); }
      if (mon?.shield_drop && R() < mon.shield_drop.chance) { const b = pickBase(BAS.weapons.filter(w => w.weapon_type === 'skold'), ilvl, R); if (b) return finishQuality(b, rollQuality(mlvl, mf, bossBonus, R, minQ), ilvl, R); }
      let cat = R.weighted(weights); if (minQ) cat = R.pick(['vapen', 'rustning', 'amulett', 'ring']); return cat ? rollCategory(cat, mlvl, ilvl, mf, bossBonus, R, minQ) : null;
    };
    if (boss) {
      const n = R.int(boss.drops[0], boss.drops[1]);
      for (const g of boss.guaranteed || []) for (let i = 0; i < g.count; i++) out.push({ item: makeItem(g.item) });
      for (const nd of boss.named_drops || []) if (R() < nd.chance) { // namngivna droppar ignorerar ilvl
        if (nd.legendary) { const l = LEG[nd.legendary]; out.push({ item: makeItem(l.base, { quality: 'legendary', leg: l.id, ilvl }) }); }
        if (nd.set) { const s = SETS[nd.set], p = R.pick(s.pieces); out.push({ item: makeItem(p.base, { quality: 'set', set: s.id, ilvl }) }); }
      }
      if (firstKill && boss.first_kill_bonus) for (let i = 0; i < boss.first_kill_bonus.count; i++) { const it = one(boss.quality_bonus, boss.first_kill_bonus.min_quality); if (it) out.push({ item: it }); }
      while (out.length < n + (boss.guaranteed || []).reduce((s, g) => s + g.count, 0)) { const it = one(boss.quality_bonus); if (it) out.push({ item: it }); else break; }
      out.push({ gold: gold() });
    } else {
      if (R() < (mon?.drop_chance_override ?? fam.drop_chance)) { const it = one(null); if (it) out.push({ item: it }); }
      if (R() < fam.gold_chance) out.push({ gold: gold() });
      for (const e of fam.extra || []) if (R() < e.chance) out.push({ item: makeItem(e.item) });
    }
    for (const o of out) if (o.item) o.item.seed = seed;
    return { seed, drops: out };
  }
  function monsterLevel(id, R = Math.random) { const d = DROP.bosses[id] || DROP.monsters[id]; if (!d) return 1; const l = d.monster_level; return Array.isArray(l) ? l[0] + Math.floor(R() * (l[1] - l[0] + 1)) : l; }
  function monsterFamily(id) { return (DROP.bosses[id] || DROP.monsters[id])?.family; }

  // ----- samlade attribut och formler (attribut.json) -----
  function setCounts(equip) { const c = {}; for (const it of Object.values(equip)) if (it?.set) c[it.set] = (c[it.set] || 0) + 1; return c; }
  function computeStats(cls, level, equip) {
    const b = cls.base, g = cls.growth, L = level - 1, t = {}, add = (k, v) => { if (typeof v === 'number') t[k] = (t[k] || 0) + v; };
    let wdmg = null, itemDef = 0, block = 0, movePen = 0, regenPen = 0, shield = false;
    for (const [slot, it] of Object.entries(equip)) { if (!it) continue; const s = itemStats(it), base = B[it.base];
      for (const [k, v] of Object.entries(s)) if (!['defense', 'defense_pct', 'damage_pct', 'block_chance', 'wdmg', 'def'].includes(k)) add(k, v);
      if (s.wdmg && slot === 'vapen') wdmg = s.wdmg; if (s.def) itemDef += s.def; if (slot === 'offhand' && base.weapon_type === 'skold') { shield = true; block += s.block_chance || 0; }
      if (slot === 'vapen') t._weapon = base; if (s.damage_pct && slot !== 'vapen') add('damage_pct', s.damage_pct);
      let mp = base.move_penalty || 0; if (base.weight === 'plate' && cls.id === 'riddare') mp /= 2; movePen += mp; regenPen = Math.max(regenPen, base.stamina_regen_penalty || 0); }
    const sets = setCounts(equip), setActive = [];
    for (const [sid, n] of Object.entries(sets)) { const s = SETS[sid]; if (s.class && s.class !== 'alla' && s.class !== cls.id) continue;
      for (const [k, bon] of Object.entries(s.bonuses)) if (n >= +k) { setActive.push(sid + ':' + k); for (const [bk, bv] of Object.entries(bon)) { if (bk === 'block_chance') block += bv; else if (bk === 'defense') itemDef += bv; else if (bk === 'magic_unlock_preview') add('stamina', bv.mana); else add(bk, bv); } } }
    const defTotal = (b.defense + g.defense * L + itemDef) * (1 + (t.defense_pct || 0));
    const maxHp = Math.round((b.hp + g.hp * L + (t.life || 0)) * (1 + (t.life_pct || 0)));
    const maxSt = Math.round((b.stamina + g.stamina * L + (t.stamina || 0)) * (1 + (t.stamina_pct || 0)));
    const AR = 20 + 5 * level + (t.attack_rating || 0), dmgPct = t.damage_pct || 0, w = t._weapon;
    const dMin = (b.damage + g.damage * L + (wdmg ? wdmg[0] : 0) + (t.damage_flat || 0)) * (1 + dmgPct), dMax = (b.damage + g.damage * L + (wdmg ? wdmg[1] : 0) + (t.damage_flat || 0)) * (1 + dmgPct);
    const pen = Math.min(ATTR.move_speed.penalty_cap, movePen);
    return {
      maxHp, maxSt, defense: defTotal, defReduce: defTotal * 0.5 + (t.damage_reduction_flat || 0), defRating: defTotal * 10, AR,
      block: shield ? Math.min(ATTR.block_chance.cap, block) : 0, strong: Math.min(ATTR.strong_hit.chance_cap, t.strong_hit_chance || 0),
      crit: Math.min(ATTR.crit.cap, b.crit_chance + g.crit_chance * L + (t.crit_chance || 0)), mf: (t.magic_find || 0) * 100, goldFind: t.gold_find || 0,
      dmgMin: Math.round(dMin), dmgMax: Math.round(dMax), damage: (dMin + dMax) / 2,
      speed: b.speed * (1 + (t.move_speed_pct || 0) - pen), regen: Math.max(ATTR.stamina.regen_floor, 8 * (1 + (t.stamina_regen_pct || 0) - regenPen)),
      atkSpeed: (w?.attack_speed || 1) * (1 + (t.attack_speed_pct || 0)), reach: Math.max(2.0, (w?.range && w.range < 5 ? w.range + 0.3 : 2.2)) + (t.range_bonus || 0),
      ranged: !!(w && w.range > 5), type: w?.damage_type || cls.main_damage_type, lifesteal: t.lifesteal || 0, lifeOnHit: t.life_on_hit || 0, lifeRegen: t.life_regen || 0, thorns: t.thorns || 0,
      bleed: t.bleed_dps || 0, vs: { ododa: t.vs_ododa_damage_pct || 0, bestar: t.vs_bestar_damage_pct || 0, demoner: t.vs_demoner_damage_pct || 0 }, setActive, twoHanded: !!w?.two_handed
    };
  }
  // Träffchans: 2 × AR/(AR+DR) × alvl/(alvl+dlvl), golv 5 %, tak 95 %.
  const hitChance = (AR, DR, alvl, dlvl) => Math.min(ATTR.hit_chance.cap, Math.max(ATTR.hit_chance.floor, 2 * AR / (AR + DR) * alvl / (alvl + dlvl)));
  return { Q, B, LEG, SETS, SETPIECE, slotOf, equipable, sizeOf, makeItem, baseOf, nameOf, colorOf, itemStats, rollDrops, monsterLevel, monsterFamily, computeStats, hitChance, setCounts, effMf, qualityOf };
}
