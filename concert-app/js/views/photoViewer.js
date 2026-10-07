import { h, overlay, ICONS, confirmDialog } from '../ui.js';
import { getItem, saveItem, mediaURL, deleteMedia } from '../store.js';

/** Full-screen photo viewer: swipe left/right, delete. */
export function openPhotoViewer(concertId, startIndex) {
  const c = getItem(concertId);
  if (!c?.photoIds.length) return;
  const ids = [...c.photoIds];

  const counter = h('span.viewer-counter');
  const slides = ids.map((pid) => {
    const img = h('img', { alt: '', decoding: 'async' });
    mediaURL(pid).then((u) => { img.src = u; });
    return h('div.photo-slide', img);
  });
  const track = h('div.photo-track', slides);
  const current = () => Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
  const updateCounter = () => { counter.textContent = `${current() + 1} of ${ids.length}`; };
  track.addEventListener('scroll', updateCounter, { passive: true });

  const dlg = overlay(h('div.photo-viewer',
    h('div.viewer-bar',
      h('button.round-btn.light', { type: 'button', 'aria-label': 'Close', html: ICONS.close, onclick: () => dlg.close() }),
      counter,
      h('button.round-btn.light', {
        type: 'button',
        'aria-label': 'Delete photo',
        html: ICONS.trash,
        onclick: async () => {
          if (!await confirmDialog({ title: 'Delete this photo?', message: 'It will be removed from the app (not from your camera roll).', confirm: 'Delete', destructive: true })) return;
          const pid = ids[current()];
          const fresh = getItem(concertId);
          await saveItem({ ...fresh, photoIds: fresh.photoIds.filter((x) => x !== pid) });
          await deleteMedia([pid]);
          dlg.close();
        },
      })),
    track,
  ), { variant: 'full' });

  requestAnimationFrame(() => {
    track.scrollLeft = startIndex * track.clientWidth;
    updateCounter();
  });
}
