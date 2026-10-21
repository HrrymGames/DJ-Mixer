import { h, overlay, ICONS, actionSheet, confirmDialog, promptDialog } from '../ui.js';
import { getItem, saveItem, mediaURL, deleteMedia } from '../store.js';
import { isLinked } from '../native.js';
import { playLinked } from '../linked.js';
import { autoplay } from './videoTagger.js';

/**
 * Tapping a song in the setlist. In the iPhone app, songs whose videos are linked from the
 * camera roll play straight away from Photos; otherwise the in-app viewer opens.
 */
export function openSong(concertId, songId) {
  const song = getItem(concertId)?.setlist.find((s) => s.id === songId);
  if (!song) return;
  if (song.videoIds.length && song.videoIds.every(isLinked)) playLinked(song.videoIds);
  else openSongVideos(concertId, songId);
}

/** Long-press on a song: watch / rename / remove. */
export async function songActions(concertId, songId) {
  const song = getItem(concertId)?.setlist.find((s) => s.id === songId);
  if (!song) return;
  const many = song.videoIds.length > 1;
  const choice = await actionSheet({
    title: song.title || 'Untitled',
    actions: [
      { label: many ? 'Watch videos' : 'Watch video', value: 'play' },
      many && song.videoIds.some(isLinked) && { label: 'Pick one of the videos', value: 'list' },
      { label: 'Rename song', value: 'rename' },
      { label: 'Remove from setlist', value: 'remove', destructive: true },
    ].filter(Boolean),
  });
  if (choice === 'play') openSong(concertId, songId);
  else if (choice === 'list') openSongVideos(concertId, songId);
  else if (choice === 'rename') await renameSong(concertId, songId);
  else if (choice === 'remove') await removeSong(concertId, songId);
}

const songKey = (t) => t.trim().toLowerCase().replace(/\s+/g, ' ');

/** Returns the new name, or null if cancelled. Renaming to a song already in the setlist merges them. */
export async function renameSong(concertId, songId) {
  const fresh = getItem(concertId);
  const s = fresh?.setlist.find((x) => x.id === songId);
  if (!s) return null;
  const name = await promptDialog({ title: 'Song name', value: s.title, placeholder: 'Add song title' });
  if (name == null) return null;
  const twin = name && fresh.setlist.find((x) => x.id !== songId && songKey(x.title) === songKey(name));
  const setlist = twin
    ? fresh.setlist.filter((x) => x.id !== songId).map((x) => (x === twin ? { ...x, videoIds: [...x.videoIds, ...s.videoIds] } : x))
    : fresh.setlist.map((x) => (x.id === songId ? { ...x, title: name } : x));
  await saveItem({ ...fresh, setlist });
  return { name, merged: !!twin };
}

async function removeSong(concertId, songId) {
  const fresh = getItem(concertId);
  const s = fresh?.setlist.find((x) => x.id === songId);
  if (!s) return;
  if (!await confirmDialog({
    title: `Remove "${s.title || 'Untitled'}"?`,
    message: 'It comes off the setlist. Videos in your camera roll are never touched.',
    confirm: 'Remove',
    destructive: true,
  })) return;
  await saveItem({ ...fresh, setlist: fresh.setlist.filter((x) => x.id !== songId) });
  await deleteMedia(s.videoIds);
}

/**
 * In-app viewer for one song's videos. With several videos (same title entered more than
 * once) you can scroll through them all. Linked camera-roll videos show a preview to tap.
 */
export function openSongVideos(concertId, songId) {
  const c = getItem(concertId);
  const song = c?.setlist.find((s) => s.id === songId);
  if (!song) return;

  const title = h('h3.viewer-title', song.title || 'Untitled');
  const counter = h('span.viewer-counter', song.videoIds.length > 1 ? `1 of ${song.videoIds.length}` : '');
  const soundBtn = h('button.sound-btn', { type: 'button', hidden: true, 'aria-label': 'Turn sound on' });
  soundBtn.innerHTML = ICONS.mute + '<span>Tap for sound</span>';

  let activeIndex = 0;
  const slides = song.videoIds.map((vid, i) => {
    if (isLinked(vid)) {
      const img = h('img.viewer-thumb', { alt: '' });
      mediaURL(vid).then((u) => { img.src = u; });
      return h('div.viewer-slide', { 'data-index': i },
        h('button.linked-play', { type: 'button', 'aria-label': 'Play from camera roll', onclick: () => playLinked([vid]) },
          img, h('span.play-badge', { html: ICONS.play })));
    }
    const v = h('video.viewer-video', { playsinline: true, loop: true, controls: true, preload: 'metadata' });
    v.setAttribute('playsinline', '');
    mediaURL(vid).then((u) => { v.src = u; if (i === activeIndex) autoplay(v, soundBtn); });
    return h('div.viewer-slide', { 'data-index': i }, v);
  });

  const track = h('div.viewer-track', slides);
  const activeVideo = () => slides[activeIndex]?.querySelector('video');
  soundBtn.addEventListener('click', () => {
    const v = activeVideo();
    if (!v) return;
    v.muted = false; soundBtn.hidden = true; v.play().catch(() => {});
  });

  // Play whichever video is in view and pause the others.
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      const index = Number(en.target.dataset.index);
      const v = en.target.querySelector('video');
      if (en.isIntersecting && en.intersectionRatio > 0.6) {
        activeIndex = index;
        counter.textContent = slides.length > 1 ? `${index + 1} of ${slides.length}` : '';
        if (v?.src) autoplay(v, soundBtn); else soundBtn.hidden = true;
      } else {
        v?.pause();
      }
    }
  }, { root: track, threshold: [0, 0.6, 1] });
  slides.forEach((s) => io.observe(s));

  const dlg = overlay(h('div.viewer',
    h('div.viewer-bar',
      h('button.round-btn.light', { type: 'button', 'aria-label': 'Close', html: ICONS.close, onclick: () => dlg.close() }),
      h('div.viewer-heading', title, counter),
      h('button.round-btn.light', { type: 'button', 'aria-label': 'Options', html: ICONS.more, onclick: options })),
    h('div.viewer-stage', track, soundBtn),
    slides.length > 1 && h('p.viewer-hint', 'Scroll for more videos of this song'),
  ), {
    variant: 'center',
    onClose: () => {
      io.disconnect();
      track.querySelectorAll('video').forEach((v) => { v.pause(); v.removeAttribute('src'); v.load(); });
    },
  });

  async function options() {
    const choice = await actionSheet({
      title: song.title || 'Untitled',
      actions: [
        { label: 'Rename song', value: 'rename' },
        { label: slides.length > 1 ? 'Remove this video' : 'Remove video', value: 'delete', destructive: true },
      ],
    });
    if (choice === 'rename') {
      const res = await renameSong(concertId, songId);
      if (!res) return;
      if (res.merged) dlg.close(); else title.textContent = res.name || 'Untitled';
    } else if (choice === 'delete') {
      const fresh = getItem(concertId);
      const s = fresh?.setlist.find((x) => x.id === songId);
      if (!s) return;
      if (!await confirmDialog({ title: 'Remove this video?', message: 'It comes off the setlist. Your camera roll is never touched.', confirm: 'Remove', destructive: true })) return;
      const vid = s.videoIds[activeIndex];
      const remaining = s.videoIds.filter((x) => x !== vid);
      const setlist = remaining.length
        ? fresh.setlist.map((x) => (x.id === songId ? { ...x, videoIds: remaining } : x))
        : fresh.setlist.filter((x) => x.id !== songId);
      await saveItem({ ...fresh, setlist });
      await deleteMedia([vid]);
      dlg.close();
    }
  }
}
