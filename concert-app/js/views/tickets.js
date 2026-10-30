import { h, addBar, ICONS, placeLine } from '../ui.js';
import { pastConcerts, upcomingConcerts, state, todayISO, mediaURL, itemImage } from '../store.js';
import { isLinked } from '../native.js';
import { playLinked } from '../linked.js';
import { openSong } from './videoViewer.js';
import { restoreFlow } from '../backup.js';
import { ticketEl } from '../ticket.js';
import { nav } from '../nav.js';
import { openConcertForm } from './concertForm.js';

let root;

export function mount(el) {
  root = el;
  render();
}

export function refresh(change) {
  if (change.type === 'item' || change.type === 'delete' || change.type === 'reload' || change.type === 'day' || change.type === 'settings') render();
}

function render() {
  const past = pastConcerts();
  const upcoming = upcomingConcerts();
  const scroll = root.scrollTop;

  root.replaceChildren(
    h('header.page-header', h('h1', 'Tickets'),
      past.length ? h('p.page-sub', `${past.length} show${past.length === 1 ? '' : 's'} so far`) : null),

    h('div.page-body',
      onThisDay(past),
      addBar('Add New', () => openConcertForm({ mode: 'past' })),
      !state.items.length && h('button.restore-card', { type: 'button', onclick: restoreFlow },
        h('strong', 'Already have tickets saved somewhere else?'),
        h('span', 'The Home Screen app and Safari keep separate copies. Back up in the other one (Settings → Back up), then tap here to restore.')),
      h('div.ticket-list',
        past.length
          ? past.map((c) => ticketEl(c, { onClick: () => nav.openConcert(c.id) }))
          : h('p.empty', 'Concerts you\'ve been to show up here as tickets. Tap Add New to add your first one.')),

      h('h2.section-heading', 'Upcoming Shows'),
      h('div.ticket-list',
        upcoming.map((c) => ticketEl(c, { onClick: () => nav.openConcert(c.id) })),
        !upcoming.length && h('p.empty', 'Got tickets for something? Add it here. It moves up to your tickets once the date has passed.')),
      addBar('Add New', () => openConcertForm({ mode: 'upcoming' })),
    ),
  );
  root.scrollTop = scroll;
}

// ---------------- On This Day ----------------

/** Shows from this day in earlier years ("1 year ago today you saw…"), each with a video from that night. */
function onThisDay(past) {
  const today = todayISO();
  const [year, md] = [Number(today.slice(0, 4)), today.slice(5)];
  const leap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  // 29 February shows come round on the 28th in other years.
  const matches = past.filter((c) => {
    const cmd = c.date.slice(5);
    return Number(c.date.slice(0, 4)) < year && (cmd === md || (cmd === '02-29' && md === '02-28' && !leap(year)));
  }).sort((a, b) => b.date.localeCompare(a.date));
  if (!matches.length) return null;
  return h('section.otd', h('div.otd-row', matches.map((c) => memoryCard(c, year - Number(c.date.slice(0, 4)), today))));
}

function memoryCard(c, yearsAgo, today) {
  // The same video all day, a different one tomorrow.
  const songs = c.setlist.filter((s) => s.videoIds.length);
  let seed = 0;
  for (const ch of today + c.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const song = songs.length ? songs[seed % songs.length] : null;
  const vid = song ? song.videoIds[seed % song.videoIds.length] : null;

  const media = h('div.otd-media');
  if (vid && isLinked(vid)) {
    // iPhone app: preview picture, tap to play from Photos.
    const img = h('img', { alt: '' });
    mediaURL(vid).then((u) => { img.src = u; });
    media.append(img, h('span.otd-play', { html: ICONS.play }));
  } else if (vid) {
    const v = h('video', { muted: true, loop: true, playsinline: true, autoplay: true, preload: 'metadata' });
    v.setAttribute('playsinline', '');
    v.muted = true;
    mediaURL(vid).then((u) => { v.src = u; v.play().catch(() => {}); });
    media.append(v, h('span.otd-play', { html: ICONS.play }));
  } else {
    const img = h('img', { alt: '' });
    itemImage(c).then((u) => { if (u) img.src = u; });
    media.append(img);
  }

  return h('article.otd-card', { style: { '--tc': c.color } },
    h('button.otd-media-btn', {
      type: 'button',
      'aria-label': song ? `Play ${song.title}` : `Open ${c.artist}`,
      onclick: () => {
        if (!song) nav.openConcert(c.id);
        else if (isLinked(vid)) playLinked([vid]);
        else openSong(c.id, song.id);
      },
    }, media),
    h('button.otd-text', { type: 'button', onclick: () => nav.openConcert(c.id) },
      h('span.otd-kicker', `On this day · ${yearsAgo} year${yearsAgo === 1 ? '' : 's'} ago`),
      h('strong', `You saw ${c.artist}`),
      h('span', [c.venue?.name, placeLine(c.venue)].filter(Boolean).join(' · ')),
      song && h('small', `▶ ${song.title || 'Untitled'}`)));
}
