// Wrapped: a Spotify-Wrapped-style story of your year at gigs, plus all-time stats underneath.
import { h, overlay, ICONS, formatNumber, formatDate, toast, debounce, icon } from '../ui.js';
import { state, setSetting, itemImage, todayISO } from '../store.js';
import { pastShows, wrappedYear, yearStats, topArtists, topVenues, showsPerYear, spots, travel } from '../stats.js';
import { searchPlaces } from '../lookup.js';
import { nav } from '../nav.js';
import { drawSlide, loadImage, shareImages } from '../storyImage.js';

let root;

export function mount(el) {
  root = el;
  render();
}

export function show() {
  render();
}

export function refresh(change) {
  if (['item', 'delete', 'reload', 'settings', 'day'].includes(change.type) && !root.hidden) render();
}

const plural = (n, one, many = `${one}s`) => `${formatNumber(n)} ${n === 1 ? one : many}`;

// ---------------- the story ----------------

const THEMES = [
  ['#ff375f', '#5b10c8'],
  ['#ff8a00', '#c2003d'],
  ['#12b886', '#0b4057'],
  ['#7048e8', '#e03182'],
  ['#1c7ed6', '#2b0b5e'],
  ['#f59f00', '#d6336c'],
  ['#0ca678', '#5c2bd6'],
  ['#e8590c', '#311b92'],
  ['#c2255c', '#1b1b3a'],
];

/** The year's slides, skipping any with nothing to say. Each one is drawn on screen and as a picture. */
async function buildSlides(stats) {
  const y = stats.year;
  const slides = [];
  const add = (s) => slides.push({ year: y, ...s, bg: THEMES[slides.length % THEMES.length] });

  add({ kicker: 'Setlistic Wrapped', big: y, title: 'Your year of live music', sub: 'Tap to see how it went' });

  const sp = stats.spots;
  add({
    kicker: 'This year you went to',
    big: formatNumber(stats.shows.length),
    title: stats.shows.length === 1 ? 'show' : 'shows',
    sub: [plural(stats.artists.length, 'artist'), sp.seated + sp.standing ? `${sp.seated} seated · ${sp.standing} standing` : ''].filter(Boolean).join(' · '),
  });

  const top = stats.artists[0];
  if (top) {
    const latest = top.items[top.items.length - 1];
    add({
      kicker: top.count > 1 ? 'Your most-seen artist' : 'Your year kicked off with',
      image: await itemImage(top.count > 1 ? latest : stats.shows[0]),
      title: top.count > 1 ? top.label : stats.shows[0].artist,
      sub: top.count > 1 ? `You saw them ${top.count} times` : `${formatDate(stats.shows[0].date)} · ${stats.shows[0].venue?.name || ''}`,
      list: stats.artists.length > 2 ? stats.artists.slice(0, 5).map((a, i) => `${i + 1}. ${a.label}${a.count > 1 ? ` (${a.count})` : ''}`) : null,
    });
  }

  const song = stats.songs[0];
  if (song && song.count > 1) {
    add({ kicker: 'Your most-heard live song', title: `"${song.label}"`, sub: `by ${song.items[0].artist} · heard live ${song.count} times` });
  } else if (stats.songsHeard) {
    add({ kicker: 'You filmed', big: formatNumber(stats.songsHeard), title: stats.songsHeard === 1 ? 'song live' : 'songs live', sub: 'Every one of them is in your setlists' });
  }

  if (stats.newVenues.length) {
    add({
      kicker: 'New places',
      big: formatNumber(stats.newVenues.length),
      title: stats.newVenues.length === 1 ? 'new venue' : 'new venues',
      sub: stats.newCountries.length ? `and ${plural(stats.newCountries.length, 'new country', 'new countries')}: ${stats.newCountries.join(', ')}` : '',
      list: stats.newVenues.slice(0, 5).map((v) => v.name),
    });
  }

  if (stats.guests.length) {
    add({ kicker: 'Surprise!', big: formatNumber(stats.guests.length), title: stats.guests.length === 1 ? 'special guest came out' : 'special guests came out', list: stats.guests.slice(0, 6) });
  }

  if (stats.crowd) {
    add({ kicker: 'You\'ve been in crowds of', big: formatNumber(stats.crowd), title: 'people', sub: `across ${plural(stats.crowdKnown, 'show')}` });
  }

  if (stats.travel?.miles) {
    const f = stats.travel.furthest;
    add({
      kicker: 'You travelled',
      big: formatNumber(stats.travel.miles),
      title: 'miles for live music',
      sub: f ? `Furthest: ${f.concert.venue.name}, ${formatNumber(Math.round(f.miles))} miles from home` : '',
    });
  }

  add({
    kicker: `My ${y} in live music`,
    title: `Setlistic Wrapped ${y}`,
    tiles: [
      { label: 'Shows', value: formatNumber(stats.shows.length) },
      { label: 'Artists', value: formatNumber(stats.artists.length) },
      { label: 'Top artist', value: top ? top.label : '—' },
      { label: 'Top song', value: song && song.count > 1 ? song.label : (stats.songsHeard ? `${stats.songsHeard} filmed` : '—') },
      { label: 'New venues', value: formatNumber(stats.newVenues.length) },
      { label: stats.crowd ? 'Crowds' : 'Guests', value: stats.crowd ? compact(stats.crowd) : formatNumber(stats.guests.length) },
    ],
    last: true,
  });
  return slides;
}

const compact = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : formatNumber(n));

function slideEl(s) {
  const img = s.image ? h('img.ws-img', { alt: '', src: s.image }) : null;
  return h('div.ws-slide', { style: { '--a': s.bg[0], '--b': s.bg[1] } },
    h('div.ws-content',
      h('p.ws-kicker', s.kicker),
      img,
      s.big && h('p.ws-big', s.big),
      h('h2.ws-title', s.title),
      s.sub && h('p.ws-sub', s.sub),
      s.list && h('ol.ws-list', s.list.map((t) => h('li', t))),
      s.tiles && h('div.ws-tiles', s.tiles.map((t) => h('div.ws-tile', h('span', t.label), h('strong', t.value))))),
    h('p.ws-footer', `SETLISTIC WRAPPED ${s.year}`));
}

async function openStory(year) {
  const stats = yearStats(year);
  const slides = await buildSlides(stats);
  // Load photos up front so the share pictures can be made instantly when you tap Share.
  const images = await Promise.all(slides.map((s) => loadImage(s.image)));
  const pictures = slides.map((s, i) => drawSlide(s, images[i]));

  let index = 0;
  let timer = null;
  const DURATION = 7000;
  const bars = slides.map(() => h('span.ws-bar', h('i')));
  const stage = h('div.ws-stage');
  const shareBtn = h('button.ws-share', { type: 'button', onclick: (e) => { e.stopPropagation(); shareOne(); } }, h('span', { html: ICONS.share }), 'Share');
  const allBtn = h('button.ws-share.ws-all', { type: 'button', onclick: (e) => { e.stopPropagation(); shareAll(); } }, 'Save all pictures');
  const view = h('div.wrapped-story',
    h('div.ws-bars', bars),
    h('button.round-btn.light.ws-close', { type: 'button', 'aria-label': 'Close', html: ICONS.close, onclick: (e) => { e.stopPropagation(); dlg.close(); } }),
    stage,
    h('div.ws-actions', shareBtn, allBtn));

  const go = (i) => {
    if (i < 0) i = 0;
    if (i >= slides.length) { dlg.close(); return; }
    index = i;
    const el = slideEl(slides[i]);
    stage.replaceChildren(el);
    countUp(el.querySelector('.ws-big'));
    bars.forEach((b, j) => { b.className = `ws-bar${j < i ? ' done' : j === i ? ' now' : ''}`; });
    allBtn.hidden = !slides[i].last;
    clearTimeout(timer);
    // The last slide stays up so you can share it.
    if (!slides[i].last) timer = setTimeout(() => go(index + 1), DURATION);
  };

  // Tap the left side to go back, anywhere else to go forward. Hold to pause.
  let downAt = 0;
  view.addEventListener('pointerdown', () => { downAt = Date.now(); view.classList.add('paused'); clearTimeout(timer); });
  view.addEventListener('pointerup', (e) => {
    view.classList.remove('paused');
    if (Date.now() - downAt > 350) { if (!slides[index].last) timer = setTimeout(() => go(index + 1), 2500); return; }
    if (e.target.closest('button')) return;
    go(e.clientX < innerWidth * 0.3 ? index - 1 : index + 1);
  });

  async function shareOne() {
    try { await shareImages([pictures[index]], `setlistic-wrapped-${year}-${index + 1}`); } catch (e) { if (!/cancel/i.test(e.message || '')) toast('Couldn\'t share this picture'); }
  }
  async function shareAll() {
    try { await shareImages(pictures, `setlistic-wrapped-${year}`); } catch (e) { if (!/cancel/i.test(e.message || '')) toast('Couldn\'t share the pictures'); }
  }

  const dlg = overlay(view, { variant: 'full', dismissable: false, onClose: () => clearTimeout(timer) });
  go(0);
}

/** Big numbers count up when their slide appears. */
function countUp(el) {
  if (!el) return;
  const target = Number(el.textContent.replace(/,/g, ''));
  if (!Number.isFinite(target) || target < 2 || /^\d{4}$/.test(el.textContent)) return;
  const start = performance.now();
  const ms = 1100;
  const step = (t) => {
    const p = Math.min(1, (t - start) / ms);
    el.textContent = formatNumber(Math.round(target * (1 - (1 - p) ** 3)));
    if (p < 1 && el.isConnected) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---------------- home town (for distances) ----------------

export function pickHome() {
  const input = h('input.text-input', { type: 'text', placeholder: 'e.g. Leeds', autocapitalize: 'words', autocomplete: 'off', value: state.settings.home?.name || '' });
  const list = h('ul.suggestions.static');
  const status = h('p.hint');
  const search = debounce(async (q) => {
    status.textContent = q.trim() ? 'Searching…' : '';
    const places = await searchPlaces(q);
    if (input.value !== q) return;
    status.textContent = q.trim() && !places.length ? (navigator.onLine ? 'No towns found' : 'Needs an internet connection') : '';
    list.replaceChildren(...places.map((p) => h('li', h('button.suggestion', {
      type: 'button',
      onclick: () => { setSetting('home', { name: p.name, area: p.area, lat: p.lat, lon: p.lon }); dlg.close(); toast(`Home town set to ${p.name}`); },
    }, icon('pin'), h('span', h('strong', p.name), h('small', p.area))))));
  }, 300);
  input.addEventListener('input', () => search(input.value));
  const dlg = overlay(h('div.form-sheet',
    h('div.sheet-bar',
      h('button.nav-btn', { type: 'button', onclick: () => dlg.close() }, 'Cancel'),
      h('h2', 'Home town'),
      state.settings.home ? h('button.nav-btn', { type: 'button', onclick: () => { setSetting('home', null); dlg.close(); } }, 'Remove') : h('span')),
    h('div.sheet-scroll',
      h('p.hint', 'Used to work out how far you\'ve travelled for gigs. It stays on this phone.'),
      h('div.field', input, status),
      list)));
  setTimeout(() => input.focus(), 350);
}

// ---------------- page ----------------

function bars(rows, { max = Math.max(1, ...rows.map((r) => r.count)), onClick } = {}) {
  return h('ol.rank-list', rows.map((r, i) => h('li', h(onClick ? 'button.rank-row' : 'div.rank-row', onClick ? { type: 'button', onclick: () => onClick(r) } : {},
    h('span.rank-num', String(i + 1)),
    h('span.rank-main',
      h('span.rank-label', r.label),
      h('span.rank-track', h('span.rank-fill', { style: { width: `${Math.max(4, (r.count / max) * 100)}%` } }))),
    h('span.rank-count', String(r.count))))));
}

function yearChart(rows) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const current = todayISO().slice(0, 4);
  return h('div.year-chart', { role: 'img', 'aria-label': rows.map((r) => `${r.year}: ${r.count}`).join(', ') },
    rows.map((r) => h('div.yc-col', { title: `${r.year}: ${plural(r.count, 'show')}` },
      h('span.yc-value', String(r.count)),
      h(r.year === current ? 'span.yc-bar.now' : 'span.yc-bar', { style: { height: `${(r.count / max) * 100}%` } }),
      h('span.yc-year', `'${r.year.slice(2)}`))));
}

function render() {
  const year = wrappedYear();
  const ys = yearStats(year);
  const past = pastShows();
  const scroll = root.scrollTop;

  const hero = h('button.wrapped-hero', {
    type: 'button',
    disabled: !ys.shows.length,
    onclick: () => openStory(year),
  },
  h('span.wh-kicker', 'Setlistic Wrapped'),
  h('strong.wh-year', String(year)),
  h('span.wh-sub', ys.shows.length
    ? `${plural(ys.shows.length, 'show')} · ${plural(ys.artists.length, 'artist')} · tap to play`
    : `No shows in ${year} yet – your Wrapped fills up as you go`),
  ys.shows.length ? h('span.wh-play', { html: ICONS.play }) : null,
  h('span.wh-note', `Here until Christmas Day ${Number(year) + 1}`));

  const sp = spots(past);
  const artists = topArtists(past);
  const venues = topVenues(past);
  const perYear = showsPerYear(past);
  const tr = travel(past);
  const countries = new Set(past.map((c) => (c.venue?.countryCode || c.venue?.country || '').toUpperCase()).filter(Boolean));
  const tile = (value, label) => h('div.stat', h('strong', value), h('span', label));

  root.replaceChildren(
    h('header.page-header', h('h1', 'Wrapped')),
    h('div.page-body',
      hero,
      h('h2.section-heading', 'All-time stats'),
      past.length ? [
        h('div.stats-card',
          tile(formatNumber(past.length), past.length === 1 ? 'show' : 'shows'),
          tile(formatNumber(artists.length), artists.length === 1 ? 'artist' : 'artists'),
          tile(formatNumber(venues.length), venues.length === 1 ? 'venue' : 'venues'),
          tile(formatNumber(countries.size), countries.size === 1 ? 'country' : 'countries'),
          tile(formatNumber(sp.seated), 'seated'),
          tile(formatNumber(sp.standing), 'standing')),
        !(sp.seated + sp.standing) && h('p.hint.stat-hint', 'Mark tickets as seated or standing (Edit details) to fill in those two.'),

        h('h3.stats-heading', 'Shows per year'),
        h('div.stats-panel', yearChart(perYear)),

        h('h3.stats-heading', 'Top artists'),
        h('div.stats-panel', bars(artists.slice(0, 5), { onClick: (r) => nav.openConcert(r.items[r.items.length - 1].id) })),

        h('h3.stats-heading', 'Top venues'),
        h('div.stats-panel', bars(venues.slice(0, 5), { onClick: (r) => nav.openConcert(r.items[r.items.length - 1].id) })),

        h('h3.stats-heading', 'Travelled for gigs'),
        h('div.stats-panel.travel',
          tr ? [
            h('p.travel-miles', h('strong', formatNumber(tr.miles)), ' miles'),
            h('p.hint', `There and back from ${state.settings.home.name}${tr.missing ? ` · ${plural(tr.missing, 'show')} without a map location not counted` : ''}`),
            tr.furthest && h('p.travel-far', 'Furthest: ', h('strong', tr.furthest.concert.venue.name), ` – ${formatNumber(Math.round(tr.furthest.miles))} miles away`),
            h('button.link-btn', { type: 'button', onclick: pickHome }, 'Change home town'),
          ] : [
            h('p.hint', 'Set your home town to see how far you\'ve travelled.'),
            h('button.set-button', { type: 'button', onclick: pickHome }, 'Set home town'),
          ]),
      ] : h('p.empty', 'Your stats show up here once you\'ve added some concerts.'),
    ),
  );
  root.scrollTop = scroll;
}
