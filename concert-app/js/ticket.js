import { h, formatDate, formatNumber, placeLine } from './ui.js';
import { inkFor, itemImage, isPast, daysUntil, state } from './store.js';

// Seeded random numbers so each ticket's barcode / QR / seat numbers never change.
function rng(seedStr) {
  let s = 0;
  for (const ch of String(seedStr)) s = (Math.imul(s ^ ch.charCodeAt(0), 2654435761) >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

const SVG = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/** Vertical barcode (bars run across the narrow stub). */
function barcode(seed) {
  const r = rng(seed + 'bar');
  const svg = svgEl('svg', { viewBox: '0 0 20 100', preserveAspectRatio: 'none', class: 't-barcode', 'aria-hidden': 'true' });
  let y = 0;
  while (y < 100) {
    const w = 0.6 + r() * 2.2;
    if (r() > 0.35) svg.append(svgEl('rect', { x: 0, y, width: 20, height: Math.min(w, 100 - y), fill: 'currentColor' }));
    y += w + 0.5 + r() * 1.2;
  }
  return svg;
}

/** Decorative QR-style square like a real e-ticket. */
function qr(seed) {
  const r = rng(seed + 'qr');
  const n = 21;
  const svg = svgEl('svg', { viewBox: `-1 -1 ${n + 2} ${n + 2}`, class: 't-qr', 'aria-hidden': 'true', 'shape-rendering': 'crispEdges' });
  svg.append(svgEl('rect', { x: -1, y: -1, width: n + 2, height: n + 2, fill: '#fff' }));
  const finder = (x, y) => {
    svg.append(svgEl('rect', { x, y, width: 7, height: 7, fill: '#000' }));
    svg.append(svgEl('rect', { x: x + 1, y: y + 1, width: 5, height: 5, fill: '#fff' }));
    svg.append(svgEl('rect', { x: x + 2, y: y + 2, width: 3, height: 3, fill: '#000' }));
  };
  const inFinder = (x, y) => (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9);
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!inFinder(x, y) && r() > 0.52) d += `M${x} ${y}h1v1h-1z`;
  svg.append(svgEl('path', { d, fill: '#000' }));
  finder(0, 0); finder(n - 7, 0); finder(0, n - 7);
  return svg;
}

function initials(name) {
  return (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

/**
 * A digital concert ticket.
 * opts.wish: wishlist ticket (details shown as ??????)
 */
export function ticketEl(item, { wish = item.kind === 'wish', onClick } = {}) {
  const r = rng(item.id);
  const row = Math.floor(r() * 40) + 1;
  const seat = Math.floor(r() * 120) + 1;
  const block = Math.floor(r() * 200) + 100;
  const unknown = '??????';

  const upcoming = !wish && !isPast(item);
  const days = upcoming ? daysUntil(item.date) : null;
  const badge = upcoming && state.settings.showCountdown
    ? (days === 0 ? 'Tonight' : days === 1 ? 'Tomorrow' : `In ${days} days`)
    : null;

  const field = (label, value, sub) => h('div.t-field',
    h('span.t-label', label),
    h('span.t-value', value || '—'),
    sub && h('span.t-sub', sub));

  const img = h('img.t-img', { alt: '', loading: 'lazy', decoding: 'async' });
  const photo = h('div.t-photo',
    h('div.t-fallback', initials(item.artist)),
    img,
    h('div.t-shade'),
    badge && h('span.t-badge', badge),
    qr(item.id),
    h('div.t-title',
      h('span.t-artist', item.artist || 'Artist name'),
      h('span.t-tour', wish ? unknown : (item.tour ? `– ${item.tour}` : ''))),
  );
  itemImage(item).then((src) => {
    if (!src) return;
    img.onload = () => photo.classList.add('has-img');
    img.onerror = () => img.remove();
    img.src = src;
  });

  const ink = inkFor(item.color);
  const el = h(`article.ticket${wish ? '.is-wish' : ''}${upcoming ? '.is-upcoming' : ''}`, {
    style: { '--tc': item.color, '--tink': ink },
    tabindex: onClick ? '0' : null,
    role: onClick ? 'button' : null,
    'aria-label': `${item.artist}${item.tour ? ' – ' + item.tour : ''}`,
    'data-id': item.id,
  },
  h('div.t-stub.t-left', h('span.t-admit', 'ADMIT ONE')),
  h('div.t-info',
    field('Date', wish ? '??/??/????' : formatDate(item.date)),
    field('Venue', wish ? unknown : item.venue?.name, wish ? unknown : placeLine(item.venue)),
    field('Capacity', wish ? unknown : (item.capacity ? formatNumber(item.capacity) : '—')),
    h('div.t-seats',
      h('span', h('b', 'BLK'), wish ? '??' : block),
      h('span', h('b', 'ROW'), wish ? '??' : row),
      h('span', h('b', 'SEAT'), wish ? '??' : seat))),
  photo,
  h('div.t-stub.t-right',
    barcode(item.id),
    h('span.t-serial', `No. ${String(item.serial ?? 0).padStart(4, '0')}`)),
  );

  if (onClick) {
    el.addEventListener('click', () => onClick(item));
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(item); } });
  }
  return el;
}
