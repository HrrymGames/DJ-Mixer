import { h, overlay, ICONS, actionSheet, confirmDialog, promptDialog } from '../ui.js';
import { getItem, saveItem, mediaURL, deleteMedia } from '../store.js';
import { autoplay } from './videoTagger.js';

/**
 * Plays the video(s) for one setlist song. If a song has several videos
 * (same title entered more than once) you can scroll through all of them.
 */
export function openSongVideos(concertId, songId) {
  const c = getItem(concertId);
  const song = c?.setlist.find((s) => s.id === songId);
  if (!song) return;

  const title = h('h3.viewer-title', song.title || 'Untitled');
  const counter = h('span.viewer-counter', song.videoIds.length > 1 ? `1 of ${song.videoIds.length}` : '');
  const soundBtn = h('button.sound-btn', { type: 'button', hidden: true, 'aria-label': 'Turn sound on' });
  soundBtn.innerHTML = ICONS.mute + '<span>Tap for sound</span>';

  const videos = song.videoIds.map((vid) => {
    const v = h('video.viewer-video', { playsinline: true, loop: true, controls: true, preload: 'metadata' });
    v.setAttribute('playsinline', '');
    mediaURL(vid).then((u) => { v.src = u; if (v === active) autoplay(v, soundBtn); });
    return v;
  });
  let active = videos[0];

  const track = h('div.viewer-track', videos.map((v) => h('div.viewer-slide', v)));
  soundBtn.addEventListener('click', () => { active.muted = false; soundBtn.hidden = true; active.play().catch(() => {}); });

  // Play whichever video is in view and pause the others.
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      const v = en.target.querySelector('video');
      if (en.isIntersecting && en.intersectionRatio > 0.6) {
        active = v;
        counter.textContent = videos.length > 1 ? `${videos.indexOf(v) + 1} of ${videos.length}` : '';
        if (v.src) autoplay(v, soundBtn);
      } else {
        v.pause();
      }
    }
  }, { root: track, threshold: [0, 0.6, 1] });
  track.querySelectorAll('.viewer-slide').forEach((s) => io.observe(s));

  const dlg = overlay(h('div.viewer',
    h('div.viewer-bar',
      h('button.round-btn.light', { type: 'button', 'aria-label': 'Close', html: ICONS.close, onclick: () => dlg.close() }),
      h('div.viewer-heading', title, counter),
      h('button.round-btn.light', { type: 'button', 'aria-label': 'Options', html: ICONS.more, onclick: options })),
    h('div.viewer-stage', track, soundBtn),
    videos.length > 1 && h('p.viewer-hint', 'Scroll for more videos of this song'),
  ), {
    variant: 'center',
    onClose: () => {
      io.disconnect();
      videos.forEach((v) => { v.pause(); v.removeAttribute('src'); v.load(); });
    },
  });

  async function options() {
    const choice = await actionSheet({
      title: song.title || 'Untitled',
      actions: [
        { label: 'Rename song', value: 'rename' },
        { label: videos.length > 1 ? 'Delete this video' : 'Delete video', value: 'delete', destructive: true },
      ],
    });
    const fresh = getItem(concertId);
    const s = fresh?.setlist.find((x) => x.id === songId);
    if (!s) return;
    if (choice === 'rename') {
      const name = await promptDialog({ title: 'Song name', value: s.title, placeholder: 'Add song title' });
      if (name == null) return;
      const key = (t) => t.trim().toLowerCase().replace(/\s+/g, ' ');
      const twin = name && fresh.setlist.find((x) => x.id !== songId && key(x.title) === key(name));
      // Renaming to a song that's already in the setlist joins their videos together.
      const setlist = twin
        ? fresh.setlist.filter((x) => x.id !== songId).map((x) => (x === twin ? { ...x, videoIds: [...x.videoIds, ...s.videoIds] } : x))
        : fresh.setlist.map((x) => (x.id === songId ? { ...x, title: name } : x));
      await saveItem({ ...fresh, setlist });
      if (twin) dlg.close(); else title.textContent = name || 'Untitled';
    } else if (choice === 'delete') {
      if (!await confirmDialog({ title: 'Delete this video?', message: 'It will be removed from the app (not from your camera roll).', confirm: 'Delete', destructive: true })) return;
      const vid = s.videoIds[videos.indexOf(active)];
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
