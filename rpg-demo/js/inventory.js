// Inventory i Diablo 2-stil: gubbe med platser, väska som rutnät, drag and drop, tooltips med jämförelse och statistikruta.
import { SLOTS, SLOT_NAME, fmtStat } from './loot.js';
import { iconHTML, frameKey, FRAME, GLOW, SLOT_ICON } from './icons.js';
export const BAG_W = 10, BAG_H = 4, CELL = 34;
const SLOT_POS = { hjalm: [8, 6, 2, 2], brost: [8, 80, 2, 3], handskar: [8, 188, 2, 2], stovlar: [8, 262, 2, 2], amulett: [84, 6, 1, 1], vapen: [224, 6, 2, 4], offhand: [224, 148, 2, 3], ring1: [80, 262, 1, 1], balte: [116, 262, 2, 1], ring2: [186, 262, 1, 1] };
const pct = v => (Math.round(v * 1000) / 10) + ' %';

export function createInventory({ L, S, statsFor, onChange, onUse, flash }) {
  const $ = id => document.getElementById(id);
  const win = document.createElement('div'); win.id = 'invWin'; win.className = 'hidden';
  win.innerHTML = `<div class="iwHead">Utrustning <small>B / I öppnar · Esc stänger</small><button id="iwClose">✕</button></div>
  <div class="iwBody"><div class="iwLeft"><div id="doll"><canvas id="dollCv" width="300" height="330"></canvas></div><div id="bag"></div></div><div id="statBox"></div></div>`;
  document.body.appendChild(win);
  const tip = document.createElement('div'); tip.id = 'itTip'; tip.className = 'hidden'; document.body.appendChild(tip);
  const doll = $('doll'), bag = $('bag'), statBox = $('statBox');
  bag.style.width = BAG_W * CELL + 'px'; bag.style.height = BAG_H * CELL + 'px';
  const slotEl = {}; for (const s of SLOTS) { const [x, y, w, h] = SLOT_POS[s], e = document.createElement('div'); e.className = 'eqSlot'; e.dataset.slot = s; Object.assign(e.style, { left: x + 'px', top: y + 'px', width: w * CELL + 'px', height: h * CELL + 'px' }); e.innerHTML = `<span class="ph">${SLOT_ICON[s]}</span>`; e.title = SLOT_NAME[s]; doll.appendChild(e); slotEl[s] = e; }
  const hl = document.createElement('div'); hl.className = 'bagHl hidden'; bag.appendChild(hl);
  $('iwClose').onclick = () => close();

  // ----- logik -----
  const size = it => L.sizeOf(L.baseOf(it));
  const overlaps = (x, y, w, h, ignore) => S.inv.filter(o => o !== ignore && o !== ignore?.other && o.x < x + w && x < o.x + size(o)[0] && o.y < y + h && y < o.y + size(o)[1]);
  const fits = (x, y, w, h, ignore) => x >= 0 && y >= 0 && x + w <= BAG_W && y + h <= BAG_H && overlaps(x, y, w, h, ignore).length === 0;
  function findSpot(it, ignore) { const [w, h] = size(it); for (let x = 0; x <= BAG_W - w; x++) for (let y = 0; y <= BAG_H - h; y++) if (fits(x, y, w, h, ignore)) return [x, y]; return null; }
  function addToBag(it) {
    const b = L.baseOf(it); if (b.stack) { const st = S.inv.find(o => o.base === it.base && o.n < b.stack); if (st) { const m = Math.min(b.stack - st.n, it.n); st.n += m; it.n -= m; if (it.n <= 0) { changed(); return true; } } }
    const p = findSpot(it); if (!p) return false; it.x = p[0]; it.y = p[1]; S.inv.push(it); changed(); return true;
  }
  const slotKind = s => s === 'ring1' || s === 'ring2' ? 'ring' : s;
  function reqOk(it) { const r = L.baseOf(it).requirements; return !r || !r.level || r.level <= S.level; }
  function canEquip(it, slot) { const b = L.baseOf(it); if (!L.equipable(b) || L.slotOf(b) !== slotKind(slot) || !reqOk(it)) return false;
    if (slot === 'offhand' && S.equip.vapen && L.baseOf(S.equip.vapen).two_handed && S.equip.vapen !== it) return false; return true; }
  function bestSlot(it) { const k = L.slotOf(L.baseOf(it)); if (k === 'ring') return !S.equip.ring1 ? 'ring1' : !S.equip.ring2 ? 'ring2' : 'ring1'; return k; }
  const removeFrom = (it) => { const i = S.inv.indexOf(it); if (i >= 0) S.inv.splice(i, 1); for (const s of SLOTS) if (S.equip[s] === it) S.equip[s] = null; };
  // Tar på ett föremål. Det gamla (och offhand vid tvåhandsvapen) läggs i väskan, gärna där det nya låg.
  function equipTo(it, slot) {
    if (!canEquip(it, slot)) return false; const snapInv = S.inv.slice(), snapEq = { ...S.equip }, from = { x: it.x, y: it.y, inBag: S.inv.includes(it) };
    removeFrom(it); const old = S.equip[slot]; S.equip[slot] = it; delete it.x; delete it.y;
    const out = [old]; if (slot === 'vapen' && L.baseOf(it).two_handed && S.equip.offhand) { out.push(S.equip.offhand); S.equip.offhand = null; }
    for (const o of out) { if (!o) continue; let p = from.inBag && fits(from.x, from.y, ...size(o)) ? [from.x, from.y] : findSpot(o); if (!p) { for (const s of SLOTS) S.equip[s] = snapEq[s] || null; S.inv.length = 0; S.inv.push(...snapInv); it.x = from.x; it.y = from.y; flash('Väskan är full'); return false; } o.x = p[0]; o.y = p[1]; S.inv.push(o); from.inBag = false; }
    changed(); return true;
  }
  function unequip(slot, pos) { const it = S.equip[slot]; if (!it) return false; const p = pos && fits(pos[0], pos[1], ...size(it)) ? pos : findSpot(it); if (!p) { flash('Väskan är full'); return false; }
    S.equip[slot] = null; it.x = p[0]; it.y = p[1]; S.inv.push(it); changed(); return true; }
  function moveInBag(it, x, y) { const [w, h] = size(it); if (x < 0 || y < 0 || x + w > BAG_W || y + h > BAG_H) return false; const ov = overlaps(x, y, w, h, it);
    if (ov.length > 1) return false; const fromBag = S.inv.includes(it), fromSlot = SLOTS.find(s => S.equip[s] === it);
    if (ov.length === 1) { // byte: det andra föremålet tar källans plats
      const o = ov[0];
      if (fromSlot) { if (!canEquip(o, fromSlot)) return false; S.inv.splice(S.inv.indexOf(o), 1); S.equip[fromSlot] = o; delete o.x; delete o.y; it.x = x; it.y = y; S.inv.push(it); changed(); return true; }
      const ox = it.x, oy = it.y; it.x = x; it.y = y; o.x = -99; let p = fits(ox, oy, ...size(o), o) ? [ox, oy] : findSpot(o, o); if (!p) { it.x = ox; it.y = oy; o.x = ox; return false; }
      o.x = p[0]; o.y = p[1]; changed(); return true; }
    if (fromSlot) return unequip(fromSlot, [x, y]); if (fromBag) { it.x = x; it.y = y; changed(); return true; } return false;
  }
  function socket(gem, target) { const b = L.baseOf(gem); if (b.category !== 'adelsten') return false; const i = target.sockets?.indexOf(null); if (i == null || i < 0) return false;
    target.sockets[i] = gem.base; if (--gem.n > 0) {} else removeFrom(gem); changed(); flash(`${b.name} sitter nu i ${L.nameOf(target)}`); return true; }
  function changed() { save(); onChange(); if (isOpen()) render(); }

  // ----- rendering -----
  function itemEl(it, w, h) { const e = document.createElement('div'), fk = frameKey(it, L); e.className = 'itm q-' + fk; e.style.width = w * CELL - 2 + 'px'; e.style.height = h * CELL - 2 + 'px'; e.style.setProperty('--qc', L.colorOf(it));
    e.style.setProperty('--ram', `url(${FRAME[fk]})`); if (fk !== 'normal' && fk !== 'hylsad') e.style.setProperty('--glod', `url(${GLOW[fk]})`);
    e.innerHTML = `${iconHTML(it, w * CELL - 2, h * CELL - 2)}${it.n > 1 ? `<em>${it.n}</em>` : ''}${it.sockets?.length ? `<span class="sk">${it.sockets.map(s => `<b style="background:${s ? L.B[s].color : '#000'}"></b>`).join('')}</span>` : ''}`;
    e._it = it; return e; }
  function render() {
    for (const s of SLOTS) { const e = slotEl[s]; e.querySelectorAll('.itm').forEach(x => x.remove()); const it = S.equip[s]; e.classList.toggle('filled', !!it);
      e.classList.toggle('blocked', s === 'offhand' && !!S.equip.vapen && L.baseOf(S.equip.vapen).two_handed);
      if (it) { const [, , w, h] = SLOT_POS[s], el = itemEl(it, w, h); el.style.position = 'absolute'; el.style.inset = '1px'; el.style.width = el.style.height = 'auto'; el.dataset.slot = s; el.innerHTML = el.innerHTML.replace(/<i class="ico"[^>]*><\/i>/, iconHTML(it, w * CELL - 2, h * CELL - 2)); e.appendChild(el); } }
    bag.querySelectorAll('.itm').forEach(x => x.remove());
    for (const it of S.inv) { const [w, h] = size(it), el = itemEl(it, w, h); el.style.left = it.x * CELL + 1 + 'px'; el.style.top = it.y * CELL + 1 + 'px'; bag.appendChild(el); }
    renderStats();
  }
  function renderStats() { const st = statsFor(S.equip), lv = S.level, hit = L.hitChance(st.AR, 2 * 10 + 5 * lv, lv, lv);
    const row = (k, v, t = '') => `<div title="${t}"><span>${k}</span><b>${v}</b></div>`;
    statBox.innerHTML = `<h4>${S.cls?.name || ''} · Nivå ${lv}</h4>` + row('Life', st.maxHp) + row('Uthållighet', st.maxSt) + row('Skada', `${st.dmgMin}–${st.dmgMax}`, st.type) + row('Defence', Math.round(st.defense), `−${st.defReduce.toFixed(1)} per träff, försvarsvärde ${Math.round(st.defRating)}`)
      + row('Block', pct(st.block)) + row('Hit chance', pct(hit), `AR ${st.AR} mot jämnårig fiende`) + row('Strong hit', pct(st.strong)) + row('Krit', pct(st.crit)) + row('MF', Math.round(st.mf) + ' %') + row('Fart', st.speed.toFixed(2))
      + `<div class="gold"><span>Guld</span><b>🪙 ${S.gold}</b></div>`; }

  // ----- tooltip med jämförelse -----
  const CMP = [['maxHp', 'Life', 0], ['maxSt', 'Uthållighet', 0], ['damage', 'Skada (snitt)', 0], ['defense', 'Defence', 0], ['block', 'Block', 1], ['AR', 'Träffvärde', 0], ['strong', 'Strong hit', 1], ['crit', 'Krit', 1], ['mf', 'MF', 2], ['speed', 'Fart', 3]];
  function tipHTML(it, inBag) {
    const b = L.baseOf(it), s = L.itemStats(it), q = L.Q[it.quality], col = L.colorOf(it); let h = `<div class="tn" style="color:${col}">${L.nameOf(it)}</div>`;
    const qn = b.category === 'dryck' || b.category === 'adelsten' || b.category === 'material' ? '' : ` · ${q.name}`; h += `<div class="tb">${L.nameOf(it) !== b.name ? b.name : ''}${qn}</div>`;
    if (s.wdmg) h += `<div>Skada: ${s.wdmg[0]}–${s.wdmg[1]} <small>(${b.damage_type || ''}${b.two_handed ? ', tvåhand' : ''})</small></div>`;
    if (s.def) h += `<div>Försvar: ${s.def}</div>`; if (b.block_chance) h += `<div>Block: ${pct(s.block_chance)}</div>`;
    if (b.heal) h += `<div>Läker ${b.heal} liv</div>`; if (b.stamina) h += `<div>Ger ${b.stamina} uthållighet</div>`; if (b.heal_pct) h += `<div>Läker ${pct(b.heal_pct)} liv och uthållighet</div>`;
    if (b.socket_effect) h += Object.entries(b.socket_effect).map(([k, e]) => `<div class="tb">I ${k}: ${fmtStat(e.stat, e.value)}</div>`).join('');
    if (b.move_penalty) h += `<div class="bad">Fartstraff ${pct(b.move_penalty)}</div>`; if (b.potion_slots) h += `<div class="tb">Dryckesplatser: ${b.potion_slots}</div>`;
    if (b.requirements?.level > 1) h += `<div class="${reqOk(it) ? 'tb' : 'bad'}">Kräver nivå ${b.requirements.level}</div>`;
    const fixed = it.leg ? L.LEG[it.leg].fixed : it.set ? L.SETPIECE[it.set + ':' + it.base].piece.fixed : null;
    for (const a of it.affixes) h += `<div class="af">${fmtStat(a.stat, a.value)}</div>`;
    if (fixed) for (const [k, v] of Object.entries(fixed)) { if (k === 'note') h += `<div class="tb"><i>${v}</i></div>`; else { const f = fmtStat(k, v); if (f) h += `<div class="af" style="color:${col}">${f}</div>`; } }
    if (it.sockets?.length) h += `<div class="tb">Hylsor: ${it.sockets.map(g => g ? L.B[g].name : 'tom').join(', ')}</div>`;
    if (it.set) { const set = L.SETS[it.set], n = L.setCounts(S.equip)[it.set] || 0, wrongCls = set.class && set.class !== 'alla' && set.class !== S.cls?.id;
      h += `<div class="setH">${set.name} (${n}/5)${wrongCls ? ' <span class="bad">– bonusar bara för ' + set.class + '</span>' : ''}</div>`;
      h += set.pieces.map(p => `<div class="setP ${Object.values(S.equip).some(e => e?.set === set.id && e.base === p.base) ? 'on' : ''}">${p.name}</div>`).join('');
      for (const [k, bon] of Object.entries(set.bonuses)) h += `<div class="setB ${n >= +k && !wrongCls ? 'on' : ''}">${k} delar: ${Object.entries(bon).map(([bk, bv]) => typeof bv === 'number' ? fmtStat(bk, bv) : bk === 'skill_bonus' ? 'färdighetsbonus: ' + Object.keys(bv).join(', ') : bk === 'magic_unlock_preview' ? '+30 uthållighet (mana när magi låses upp)' : bk.replace(/_/g, ' ')).filter(Boolean).join(', ')}</div>`; }
    if (inBag && L.equipable(b)) { const slot = bestSlot(it), cur = S.equip[slot], a = statsFor(S.equip), eq2 = { ...S.equip, [slot]: it }; if (slot === 'vapen' && b.two_handed) eq2.offhand = null; const c = statsFor(eq2);
      h += `<div class="cmpH">Jämfört med ${cur ? `<span style="color:${L.colorOf(cur)}">${L.nameOf(cur)}</span>` : 'tom plats'}</div>`; let any = false;
      for (const [k, lab, f] of CMP) { const d = c[k] - a[k]; if (Math.abs(d) < 1e-6) continue; any = true; const v = f === 1 ? (Math.round(d * 1000) / 10) + ' %' : f === 2 ? Math.round(d) + ' %' : f === 3 ? d.toFixed(2) : Math.round(d * 10) / 10;
        h += `<div class="${d > 0 ? 'good' : 'bad'}">${d > 0 ? '+' : '−'}${String(v).replace('-', '')} ${lab}</div>`; }
      if (!any) h += '<div class="tb">Ingen skillnad</div>'; if (!reqOk(it)) h += '<div class="bad">Kan inte bäras ännu</div>'; }
    if (b.category === 'dryck') h += '<div class="tb">Högerklick: drick</div>'; else if (L.equipable(b)) h += `<div class="tb">Högerklick: ${inBag ? 'ta på' : 'ta av'}</div>`;
    return h;
  }
  function showTip(it, inBag, x, y) { tip.innerHTML = tipHTML(it, inBag); tip.dataset.q = frameKey(it, L); tip.classList.remove('hidden'); const r = tip.getBoundingClientRect(); tip.style.left = Math.min(innerWidth - r.width - 8, x + 16) + 'px'; tip.style.top = Math.max(8, Math.min(innerHeight - r.height - 8, y - 10)) + 'px'; }
  win.addEventListener('mousemove', e => { if (drag) return; const el = e.target.closest('.itm'); if (el) showTip(el._it, !el.dataset.slot, e.clientX, e.clientY); else tip.classList.add('hidden'); });
  win.addEventListener('mouseleave', () => tip.classList.add('hidden'));

  // ----- drag and drop -----
  let drag = null;
  win.addEventListener('contextmenu', e => { e.preventDefault(); const el = e.target.closest('.itm'); if (!el) return; const it = el._it, b = L.baseOf(it); tip.classList.add('hidden');
    if (el.dataset.slot) unequip(el.dataset.slot); else if (b.category === 'dryck') { onUse(it); changed(); } else if (L.equipable(b)) { if (!equipTo(it, bestSlot(it)) && !reqOk(it)) flash('Kräver högre nivå'); } });
  win.addEventListener('mousedown', e => { if (e.button !== 0) return; const el = e.target.closest('.itm'); if (!el) return; e.preventDefault(); const it = el._it, r = el.getBoundingClientRect();
    const [w, h] = size(it); drag = { it, el, cx: Math.min(w - 1, Math.floor((e.clientX - r.left) / CELL)), cy: Math.min(h - 1, Math.floor((e.clientY - r.top) / CELL)), w, h };
    const g = itemEl(it, w, h); g.id = 'dragGhost'; document.body.appendChild(g); drag.g = g; el.classList.add('dragging'); tip.classList.add('hidden');
    for (const s of SLOTS) slotEl[s].classList.toggle('can', canEquip(it, s)); moveDrag(e); });
  function target(e) {
    drag.g.style.display = 'none'; const under = document.elementFromPoint(e.clientX, e.clientY); drag.g.style.display = '';
    const it = drag.it, tItem = under?.closest('.itm'); if (tItem && tItem._it !== it && L.baseOf(it).category === 'adelsten' && tItem._it.sockets?.includes(null)) return { kind: 'socket', ok: true, el: tItem };
    const sl = under?.closest('.eqSlot'); if (sl) return { kind: 'slot', slot: sl.dataset.slot, ok: canEquip(it, sl.dataset.slot), el: sl };
    const br = bag.getBoundingClientRect(); if (e.clientX >= br.left && e.clientX < br.right && e.clientY >= br.top && e.clientY < br.bottom) {
      const x = Math.floor((e.clientX - br.left) / CELL) - drag.cx, y = Math.floor((e.clientY - br.top) / CELL) - drag.cy, ov = (x >= 0 && y >= 0 && x + drag.w <= BAG_W && y + drag.h <= BAG_H) ? overlaps(x, y, drag.w, drag.h, it) : null;
      let ok = !!ov && ov.length <= 1; if (ok && ov.length === 1) { const fs = SLOTS.find(s => S.equip[s] === it); if (fs) ok = canEquip(ov[0], fs); }
      return { kind: 'bag', x, y, ok }; }
    return null;
  }
  function moveDrag(e) { if (!drag) return; drag.g.style.left = e.clientX - drag.cx * CELL - CELL / 2 + 'px'; drag.g.style.top = e.clientY - drag.cy * CELL - CELL / 2 + 'px';
    const t = target(e); win.querySelectorAll('.ok,.bad').forEach(x => x.classList.remove('ok', 'bad')); hl.classList.add('hidden');
    if (!t) return; if (t.kind === 'bag') { hl.classList.remove('hidden'); hl.className = 'bagHl ' + (t.ok ? 'ok' : 'bad'); Object.assign(hl.style, { left: Math.max(0, t.x) * CELL + 'px', top: Math.max(0, t.y) * CELL + 'px', width: drag.w * CELL + 'px', height: drag.h * CELL + 'px' }); }
    else t.el.classList.add(t.ok ? 'ok' : 'bad'); }
  addEventListener('mousemove', moveDrag);
  addEventListener('mouseup', e => { if (!drag) return; const t = target(e), d = drag; drag = null; d.g.remove(); d.el.classList.remove('dragging'); hl.classList.add('hidden');
    win.querySelectorAll('.ok,.bad,.can').forEach(x => x.classList.remove('ok', 'bad', 'can'));
    if (t?.ok) { if (t.kind === 'slot') { if (SLOTS.find(s => S.equip[s] === d.it) !== t.slot) equipTo(d.it, t.slot); } else if (t.kind === 'bag') moveInBag(d.it, t.x, t.y); else if (t.kind === 'socket') socket(d.it, t.el._it); }
    else if (t && !t.ok && t.kind === 'slot' && !reqOk(d.it) && L.slotOf(L.baseOf(d.it)) === slotKind(t.slot)) flash('Kräver högre nivå');
    render(); });

  // ----- öppna/stänga, spara -----
  const isOpen = () => !win.classList.contains('hidden');
  function open() { win.classList.remove('hidden'); render(); }
  function close() { win.classList.add('hidden'); tip.classList.add('hidden'); if (drag) { drag.g.remove(); drag = null; render(); } }
  const key = () => 'rk_inv_' + S.cls?.id;
  function save() { if (S.cls) localStorage.setItem(key(), JSON.stringify({ inv: S.inv, equip: S.equip, gold: S.gold })); }
  function load() { try { const d = JSON.parse(localStorage.getItem(key()) || 'null'); if (!d || !Array.isArray(d.inv)) return false; const okIt = it => it && L.B[it.base];
    S.inv.length = 0; S.inv.push(...d.inv.filter(okIt)); for (const s of SLOTS) S.equip[s] = okIt(d.equip?.[s]) ? d.equip[s] : null; S.gold = d.gold || 0; return true; } catch { return false; } }
  return { open, close, toggle: () => isOpen() ? close() : open(), isOpen, render, addToBag, equipTo, unequip, findSpot, save, load, canEquip, el: win, canvas: $('dollCv') };
}
