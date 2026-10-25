// Featured: a TikTok-style feed of every video in your setlists, in a random order.
// The order is shuffled once each time the app starts, so closing and reopening the app
// gives a fresh feed that starts from the top.
import { h, ICONS, formatDate, progressRing } from '../ui.js';
import { concerts, getItem, mediaURL } from '../store.js';
import { isNative, isLinked, linkTarget, photoLink, fileSrc } from '../native.js';
import { guestNotes, songLabel } from '../songs.js';

let root;
let feed;            // the scrolling element
let order = [];      // [{key, vid, concertId, songId}] in feed order
let slides = [];
let activeIndex = -1;
let visible = false;
let dirty = true;
let built = false;   // the feed has been shown this session (keep its order from now on)
let io;
// Videos that have been loaded stay loaded until the app is closed: vid -> Promise<src>.
const sources = new Map();
const ready = new Set();          // vids whose source has finished loading
const progress = new Map();       // Photos id -> how far its download has got (0…1)

const keyOf = (concertId, vid) => `${concertId}|${vid}`;

function allVideos() {
  const list = [];
  for (const c of concerts()) {
    for (const s of c.setlist || []) {
      for (const vid of s.videoIds || []) list.push({ key: keyOf(c.id, vid), vid, concertId: c.id, songId: s.id });
    }
  }
  return list;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Keep this session's order; drop deleted videos and add new ones at random spots after the current one. */
function updateOrder() {
  const current = allVideos();
  if (!built) { order = shuffle(current); return; }
  const byKey = new Map(current.map((v) => [v.key, v]));
  order = order.filter((v) => byKey.has(v.key)).map((v) => byKey.get(v.key));
  const known = new Set(order.map((v) => v.key));
  for (const v of shuffle(current.filter((x) => !known.has(x.key)))) {
    const from = Math.max(activeIndex + 1, 0);
    const at = from + Math.floor(Math.random() * (order.length - from + 1));
    order.splice(at, 0, v);
  }
}

export function mount(el) {
  root = el;
  root.classList.add('featured');
}

export function show() {
  visible = true;
  document.body.classList.add('feed-mode');
  if (dirty || !built) render();
  else playActive();
}

export function hide() {
  visible = false;
  document.body.classList.remove('feed-mode');
  pauseAll();
}

export function refresh(change) {
  if (['item', 'delete', 'reload'].includes(change.type)) {
    dirty = true;
    if (visible) render();
  }
}

// iPhone app: fill the ring on a video that's downloading from iCloud.
window.addEventListener('photolinkvideoprogress', (e) => {
  progress.set(e.id, Math.max(progress.get(e.id) || 0, e.progress));
  for (const s of slides) if (s._target === e.id) s._ring.set(e.progress);
});

/** Where a video plays from. Asked for once; after that it's ready instantly until the app closes. */
function sourceFor(vid) {
  if (!sources.has(vid)) {
    const p = (async () => {
      if (isLinked(vid)) {
        if (!isNative) throw new Error('This video lives in your camera roll – open the Setlistic iPhone app to watch it.');
        // Downloads in full first if it's in iCloud, so it plays smoothly (the ring shows how far it's got).
        const { path } = await photoLink.videoFile(linkTarget(vid));
        return fileSrc(path);
      }
      const src = await mediaURL(vid);
      if (!src) throw new Error('This video couldn\'t be found.');
      return src;
    })();
    sources.set(vid, p);
    p.then(() => ready.add(vid), () => sources.delete(vid)); // a failed one can be tried again later
  }
  return sources.get(vid);
}

/** When the app opens: pick this session's order and start loading the first two videos. */
export async function preload() {
  if (!built) { updateOrder(); built = true; dirty = true; }
  for (const item of order.slice(0, 2)) {
    try { await sourceFor(item.vid); } catch { /* shown when you get to it */ }
  }
}

// Pause when the app goes to the background.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseAll();
  else if (visible) playActive();
});

// ---------------- rendering ----------------

function render() {
  dirty = false;
  const keepKey = order[activeIndex]?.key;
  updateOrder();
  built = true;
  io?.disconnect();
  slides.forEach(unloadSlide);

  if (!order.length) {
    root.replaceChildren(h('div.feed-empty',
      h('span.feed-empty-icon', { html: ICONS.play }),
      h('h2', 'No videos yet'),
      h('p', 'Add videos to your setlists and they\'ll show up here in a random order.')));
    slides = [];
    activeIndex = -1;
    return;
  }

  slides = order.map((item, i) => slideEl(item, i));
  const end = h('section.feed-slide.feed-end',
    h('div',
      h('p.feed-end-emoji', '👀'),
      h('h2', 'Oops… you scrolled too far'),
      h('p', 'Nothing to see here. Swipe back up for more videos.')));
  feed = h('div.feed', slides, end);
  root.replaceChildren(feed);

  io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (en.isIntersecting && en.intersectionRatio >= 0.6) {
        const i = slides.indexOf(en.target);
        setActive(i);
      }
    }
  }, { root: feed, threshold: [0.6] });
  slides.forEach((s) => io.observe(s));
  io.observe(end);

  // Stay on the same video after a re-render (e.g. a ticket was edited elsewhere).
  const keep = keepKey ? order.findIndex((v) => v.key === keepKey) : -1;
  activeIndex = -1;
  requestAnimationFrame(() => {
    if (keep > 0) feed.scrollTop = keep * feed.clientHeight;
    setActive(Math.max(keep, 0));
  });
}

function slideEl(item, index) {
  const video = h('video.feed-video', { playsinline: true, loop: true, preload: 'auto', 'webkit-playsinline': true });
  video.setAttribute('playsinline', '');
  video.addEventListener('loadedmetadata', () => {
    slide.classList.toggle('landscape', video.videoWidth > video.videoHeight);
  });

  const poster = h('img.feed-poster', { alt: '' });
  mediaURL(item.vid).then((u) => { if (isLinked(item.vid)) poster.src = u; });

  const playBtn = h('button.feed-btn.feed-btn-main', { type: 'button', 'aria-label': 'Play or pause', html: ICONS.pause });
  const back = h('button.feed-btn', { type: 'button', 'aria-label': 'Back 10 seconds' }, h('span', { html: ICONS.back10 }));
  const fwd = h('button.feed-btn', { type: 'button', 'aria-label': 'Forward 10 seconds' }, h('span', { html: ICONS.fwd10 }));
  const caption = h('div.feed-caption');
  const controls = h('div.feed-controls', h('div.feed-row', back, playBtn, fwd), caption);
  const muteBtn = h('button.feed-mute', { type: 'button', hidden: true, 'aria-label': 'Turn sound on', html: ICONS.mute });
  const note = h('p.feed-note', { hidden: true });

  const ring = progressRing();
  const slide = h('section.feed-slide', { 'data-index': index },
    poster, video, ring.el, note, muteBtn, controls);
  slide._item = item;
  slide._ring = ring;
  slide._target = isLinked(item.vid) ? linkTarget(item.vid) : null;
  if (slide._target) ring.set(progress.get(slide._target) || 0);
  slide._video = video;

  let hideTimer;
  const showControls = () => {
    fillCaption(caption, item);
    slide.classList.add('show-controls');
    playBtn.innerHTML = video.paused ? ICONS.play : ICONS.pause;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => slide.classList.remove('show-controls'), 3000);
  };
  // Tap the video: show the controls (or hide them if they're already showing).
  slide.addEventListener('click', (e) => {
    if (e.target.closest('.feed-btn, .feed-mute')) return;
    if (slide.classList.contains('show-controls')) { slide.classList.remove('show-controls'); clearTimeout(hideTimer); }
    else showControls();
  });
  playBtn.addEventListener('click', () => {
    if (video.paused) { slide._userPaused = false; video.play().catch(() => {}); }
    else { slide._userPaused = true; video.pause(); }
    showControls();
  });
  back.addEventListener('click', () => { video.currentTime = Math.max(0, video.currentTime - 10); showControls(); });
  fwd.addEventListener('click', () => {
    video.currentTime = Math.min((video.duration || 0) - 0.1, video.currentTime + 10);
    showControls();
  });
  muteBtn.addEventListener('click', () => { video.muted = false; muteBtn.hidden = true; video.play().catch(() => {}); });
  slide._muteBtn = muteBtn;
  slide._note = note;
  return slide;
}

function fillCaption(el, item) {
  const c = getItem(item.concertId);
  if (!c) return;
  const idx = c.setlist.findIndex((s) => s.id === item.songId);
  const song = c.setlist[idx];
  const label = song ? songLabel(song, guestNotes(c.setlist)[idx]) : '';
  el.replaceChildren(
    h('strong', label),
    h('span', `${c.artist}${c.tour ? ' – ' + c.tour : ''}`),
    h('small', [c.venue?.name, formatDate(c.date)].filter(Boolean).join(' · ')));
}

// ---------------- playback ----------------

async function loadSlide(slide) {
  if (!slide || slide._loading || slide._video.src) return;
  slide._loading = true;
  const { vid } = slide._item;
  // Only show the ring while it's actually downloading (not for ones that are already loaded).
  if (slide._target && !ready.has(vid)) slide.classList.add('downloading');
  try {
    const src = await sourceFor(vid);
    if (!slides.includes(slide)) return;
    slide._video.src = src;
    if (slides[activeIndex] === slide) startPlaying(slide);
  } catch (e) {
    slide._failed = true;
    slide._note.textContent = e?.message || 'This video couldn\'t be loaded.';
    slide._note.hidden = false;
  } finally {
    slide._loading = false;
    slide.classList.remove('downloading');
  }
}

function unloadSlide(slide) {
  const v = slide?._video;
  if (!v || !v.src) return;
  v.pause();
  v.removeAttribute('src');
  v.load();
}

function startPlaying(slide) {
  const v = slide._video;
  if (!v.src || slide._userPaused || !visible || document.hidden) return;
  v.muted = false;
  const p = v.play();
  p?.catch(() => {
    // Browsers (not the iPhone app) may block sound until you've tapped: play muted instead.
    v.muted = true;
    slide._muteBtn.hidden = false;
    v.play().catch(() => {});
  });
}

function setActive(index) {
  if (index === activeIndex && index >= 0) { playActive(); return; }
  activeIndex = index;
  slides.forEach((s, i) => {
    if (i === index) return;
    s._video.pause();
    s._userPaused = false;
    s.classList.remove('show-controls');
    if (i < index - 3 || i > index + 3) unloadSlide(s);
  });
  playActive();
  loadNext();
}

// Load one video at a time: the one on screen first, then the next two, so the video
// you're watching never waits behind the others.
let loadingNext = false;
async function loadNext() {
  if (loadingNext) return;
  loadingNext = true;
  try {
    for (;;) {
      // Already-loaded videos nearby go straight back in; otherwise the one on screen, then the next two.
      const near = [activeIndex, activeIndex + 1, activeIndex + 2, activeIndex - 1, activeIndex + 3, activeIndex - 2, activeIndex - 3];
      const slide = near.map((i) => slides[i]).find((s) => s && !s._video.src && !s._failed
        && (ready.has(s._item.vid) || near.indexOf(slides.indexOf(s)) <= 2));
      if (!slide) break;
      await loadSlide(slide);
    }
  } finally {
    loadingNext = false;
  }
}

function playActive() {
  const s = slides[activeIndex];
  if (!s) return;
  if (s._video.currentTime && s._video.ended) s._video.currentTime = 0;
  startPlaying(s);
}

function pauseAll() {
  slides.forEach((s) => s._video.pause());
}
