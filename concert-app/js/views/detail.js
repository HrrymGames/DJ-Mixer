import { h, icon, addBar, formatDate, formatNumber, placeLine, pickFiles, actionSheet, confirmDialog, toast, ICONS } from '../ui.js';
import { getItem, saveItem, deleteItem, addMedia, deleteMedia, itemImage, mediaURL, isPast, daysUntil, uid, inkFor } from '../store.js';
import { nav } from '../nav.js';
import { openConcertForm } from './concertForm.js';
import { tagVideos } from './videoTagger.js';
import { openSong, songActions } from './videoViewer.js';
import { isNative } from '../native.js';
import { pickLinked } from '../linked.js';
import { openPhotoViewer } from './photoViewer.js';
import { makeSortable } from '../sortable.js';

let root;
let concertId;
let parts = null;
let onScroll = null;

export function open(el, id) {
  root = el;
  concertId = id;
  render();
}

export function close() {
  if (onScroll) root?.removeEventListener('scroll', onScroll);
  onScroll = null;
  parts = null;
  concertId = null;
}

export function refresh(change) {
  if (!concertId) return;
  if (change.type === 'delete' && change.id === concertId) { nav.goBack(); return; }
  if (change.type === 'reload' && !getItem(concertId)) { nav.goBack(); return; }
  if ((change.type === 'item' && change.id === concertId) || change.type === 'reload' || change.type === 'settings') {
    const scroll = root.scrollTop;
    render();
    root.scrollTop = scroll;
  }
}

const titleText = (c) => `${c.artist}${c.tour ? ' – ' + c.tour : ''}`;

function render() {
  const c = getItem(concertId);
  if (!c) return;
  if (onScroll) root.removeEventListener('scroll', onScroll);

  const ink = inkFor(c.color);
  const heroImg = h('div.hero-img');
  itemImage(c).then((src) => { if (src) heroImg.style.backgroundImage = `url("${src.replace(/"/g, '%22')}")`; });

  const hero = h('div.hero', { style: { '--tc': c.color } },
    heroImg,
    h('div.hero-shade'),
    h('div.hero-text',
      h('div.hero-chips',
        h('span.hero-chip', c.eventType === 'festival' ? 'Festival' : 'Tour'),
        !isPast(c) && h('span.hero-chip', countdownText(c.date))),
      h('h1.hero-title', c.artist),
      c.tour && h('p.hero-tour', `– ${c.tour}`)));

  const barTitle = h('span.topbar-title', titleText(c));
  const topbar = h('div.topbar', { style: { '--tc': c.color, '--tink': ink } },
    h('button.round-btn', { type: 'button', 'aria-label': 'Back', onclick: () => nav.goBack(), html: ICONS.back }),
    barTitle,
    h('button.round-btn', { type: 'button', 'aria-label': 'More options', onclick: () => moreActions(c), html: ICONS.more }));

  const detailRow = (iconName, label, value, sub) => h('div.detail-row',
    icon(iconName),
    h('div', h('span.detail-label', label), h('span.detail-value', value), sub && h('span.detail-sub', sub)));

  const setlistEl = h('ol.setlist');
  const photosEl = h('div.photo-grid');

  const body = h('div.detail-body', { style: { '--tc': c.color, '--tink': ink } },
    h('div.detail-rows',
      detailRow('pin', 'Venue', c.venue?.name || '—', placeLine(c.venue)),
      detailRow('calendar', 'Date', formatDate(c.date, true)),
      detailRow('people', 'Capacity', c.capacity ? formatNumber(c.capacity) : 'Unknown')),

    addBar('Add videos', () => addVideos(c.id)),
    setlistEl,
    h('h2.section-heading', 'Photos'),
    addBar('Add photos', () => addPhotos(c.id)),
    photosEl,
  );

  root.replaceChildren(h('div.detail', hero, topbar, body));
  parts = { setlistEl, photosEl };
  renderSetlist(c);
  renderPhotos(c);

  // Spotify-style: the photo fades and the title moves into the top bar as you scroll.
  onScroll = () => {
    const y = root.scrollTop;
    const heroH = hero.offsetHeight;
    const p = Math.min(1, Math.max(0, y / (heroH * 0.75)));
    heroImg.style.opacity = String(1 - p);
    heroImg.style.transform = `scale(${1 + Math.max(0, -y) / 400})`;
    hero.querySelector('.hero-text').style.opacity = String(1 - Math.min(1, y / (heroH * 0.45)));
    const solid = y > heroH - topbar.offsetHeight - 10;
    topbar.classList.toggle('solid', solid);
  };
  root.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

function countdownText(date) {
  const d = daysUntil(date);
  return d === 0 ? 'Tonight' : d === 1 ? 'Tomorrow' : `In ${d} days`;
}

async function moreActions(c) {
  const choice = await actionSheet({
    title: titleText(c),
    actions: [
      { label: 'Edit details', value: 'edit' },
      { label: 'Delete concert', value: 'delete', destructive: true },
    ],
  });
  if (choice === 'edit') openConcertForm({ concert: c });
  if (choice === 'delete' && await confirmDialog({
    title: 'Delete this concert?',
    message: 'Its ticket, setlist, videos and photos will be removed from this phone.',
    confirm: 'Delete',
    destructive: true,
  })) await deleteItem(c.id);
}

// ---------------- setlist ----------------

function renderSetlist(c) {
  const el = parts.setlistEl;
  el.replaceChildren(...c.setlist.map((song, i) => h('li.song', { 'data-id': song.id },
    h('button.song-main', { type: 'button', onclick: (e) => { if (!e.currentTarget.longPressed) openSong(c.id, song.id); } },
      h('span.song-num', `${i + 1}.`),
      h('span.song-text',
        h('span.song-title', song.title || 'Untitled'),
        song.videoIds.length > 1 && h('span.song-meta', `${song.videoIds.length} videos`))),
    h('button.drag-handle', { type: 'button', 'aria-label': `Move ${song.title || 'song'}`, html: ICONS.grip }))));
  el.hidden = !c.setlist.length;
  el.querySelectorAll('.song-main').forEach((btn) => onLongPress(btn, () => songActions(c.id, btn.closest('.song').dataset.id)));

  makeSortable(el, {
    handle: '.drag-handle',
    onMove: (el2, idx) => { el2.querySelector('.song-num').textContent = `${idx + 1}.`; },
    onEnd: async (from, to) => {
      if (from === to) return;
      const fresh = getItem(c.id);
      const list = [...fresh.setlist];
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved);
      await saveItem({ ...fresh, setlist: list });
    },
  });
}

/** Hold a song for half a second to get its options (rename, remove…). */
function onLongPress(el, fn) {
  let timer = null;
  let start = null;
  el.addEventListener('pointerdown', (e) => {
    el.longPressed = false;
    start = [e.clientX, e.clientY];
    timer = setTimeout(() => { el.longPressed = true; navigator.vibrate?.(10); fn(); }, 500);
  });
  el.addEventListener('pointermove', (e) => {
    if (timer && start && Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 10) { clearTimeout(timer); timer = null; }
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => el.addEventListener(t, () => { clearTimeout(timer); timer = null; }));
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

const songKey = (t) => t.trim().toLowerCase().replace(/\s+/g, ' ');

async function addVideos(id) {
  let videoIds;
  if (isNative) {
    // iPhone app: link to the videos in the camera roll (no copies, no waiting).
    videoIds = await pickLinked('video');
  } else {
    const files = await pickFiles({ accept: 'video/*', multiple: true });
    if (!files.length) return;
    videoIds = await addMedia(files);
  }
  if (!videoIds.length) return;
  const tagged = await tagVideos(videoIds);
  if (!tagged) { await deleteMedia(videoIds); return; }

  const c = getItem(id);
  const setlist = c.setlist.map((s) => ({ ...s, videoIds: [...s.videoIds] }));
  for (const { id: vid, title } of tagged) {
    const key = songKey(title);
    // Same song name again (e.g. two clips of the chorus) = one setlist entry with both videos.
    const existing = key && setlist.find((s) => songKey(s.title) === key);
    if (existing) existing.videoIds.push(vid);
    else setlist.push({ id: uid(), title: title.trim(), videoIds: [vid] });
  }
  await saveItem({ ...c, setlist });
  toast(`${tagged.length} video${tagged.length === 1 ? '' : 's'} added to the setlist`);
}

// ---------------- photos ----------------

function renderPhotos(c) {
  const el = parts.photosEl;
  el.replaceChildren(...c.photoIds.map((pid, i) => {
    const img = h('img', { alt: `Photo ${i + 1}`, loading: 'lazy', decoding: 'async' });
    mediaURL(pid).then((u) => { img.src = u; });
    return h('button.photo-cell', { type: 'button', onclick: () => openPhotoViewer(c.id, i) }, img);
  }));
  el.hidden = !c.photoIds.length;
}

async function addPhotos(id) {
  let ids;
  if (isNative) {
    ids = await pickLinked('image');
  } else {
    const files = await pickFiles({ accept: 'image/*', multiple: true });
    if (!files.length) return;
    ids = await addMedia(files);
  }
  if (!ids.length) return;
  const c = getItem(id);
  await saveItem({ ...c, photoIds: [...c.photoIds, ...ids] });
  toast(`${ids.length} photo${ids.length === 1 ? '' : 's'} added`);
}
