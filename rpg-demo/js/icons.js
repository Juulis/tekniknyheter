// Ikoner från UI (sprite-atlas i assets/ikoner.js). Saknas en ikon används en emoji-platshållare.
// Byt ikoner genom att generera om assets/ikoner.js; den här modulen är fri från Three.js och kan återanvändas i 2D.
import { ATLAS, ICON_INDEX, ICON_SIZE, ATLAS_COLS, ATLAS_ROWS, FRAME, GLOW } from '../assets/ikoner.js';
export { FRAME, GLOW };
const FALLBACK = { pilar: '🏹', benflisa: '🦴', timmer: '🪵', jarn: '⛓️', sten: '🪨' };
export function iconKey(it) { if (it.leg && ICON_INDEX[it.leg] != null) return it.leg; if (it.set && ICON_INDEX[it.set + '.' + it.base] != null) return it.set + '.' + it.base; return it.base; }
// HTML för ikonen i en ruta på w×h px. Smala, långa föremål (t.ex. svärd 1x3) vrids upprätt eftersom ikonerna är ritade diagonalt.
export function iconHTML(it, w, h) {
  const i = ICON_INDEX[iconKey(it)]; if (i == null) return `<i class="ico emo">${FALLBACK[it.base] || '❔'}</i>`;
  const tall = h >= w * 1.9, s = tall ? Math.min(h / 1.3, w * 2.1) : Math.min(w, h) * 0.92, k = s / ICON_SIZE;
  return `<i class="ico" style="width:${s}px;height:${s}px;background-image:url(${ATLAS});background-size:${ATLAS_COLS * ICON_SIZE * k}px ${ATLAS_ROWS * ICON_SIZE * k}px;background-position:${-(i % ATLAS_COLS) * s}px ${-Math.floor(i / ATLAS_COLS) * s}px${tall ? ';transform:rotate(-45deg)' : ''}"></i>`;
}
export const frameKey = (it, L) => it.quality === 'normal' && it.sockets?.length ? 'hylsad' : (L.Q[it.quality] ? it.quality : 'normal');
export const SLOT_ICON = { hjalm: 'Hjälm', amulett: 'Amulett', brost: 'Bröst', vapen: 'Vapen', offhand: 'Offhand', handskar: 'Handskar', balte: 'Bälte', stovlar: 'Stövlar', ring1: 'Ring', ring2: 'Ring' };
