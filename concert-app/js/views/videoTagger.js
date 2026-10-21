import { h, overlay, ICONS, confirmDialog } from '../ui.js';
import { mediaURL, concerts } from '../store.js';
import { isLinked } from '../native.js';
import { playLinked } from '../linked.js';

/**
 * After picking videos, show them one at a time so each can be given a song name.
 * Resolves with [{id, title}] in the order picked, or null if cancelled.
 */
export function tagVideos(videoIds) {
  return new Promise((resolve) => {
    const titles = videoIds.map(() => '');
    let index = 0;
    let result = null;

    const video = h('video.tag-video', { playsinline: true, loop: true, controls: true, preload: 'auto' });
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    const soundBtn = h('button.sound-btn', { type: 'button', hidden: true, 'aria-label': 'Turn sound on' });
    soundBtn.innerHTML = ICONS.mute + '<span>Tap for sound</span>';
    soundBtn.addEventListener('click', () => { video.muted = false; soundBtn.hidden = true; video.play().catch(() => {}); });

    // iPhone app: camera-roll videos show a preview and play full screen from Photos.
    const thumb = h('img.tag-thumb', { alt: '' });
    const linkedPlay = h('button.linked-play.tag-linked', {
      type: 'button',
      hidden: true,
      'aria-label': 'Play video',
      onclick: () => playCurrentLinked(),
    }, thumb, h('span.play-badge', { html: ICONS.play }));
    let playedIndex = -1;
    async function playCurrentLinked() {
      playedIndex = index;
      await playLinked([videoIds[index]]);
      input.focus();
    }

    // Suggest song names already used anywhere in the app.
    const known = [...new Set(concerts().flatMap((c) => c.setlist.map((s) => s.title)).filter(Boolean))];
    const listId = `songs-${Date.now()}`;
    const datalist = h('datalist', { id: listId }, known.map((t) => h('option', { value: t })));
    const input = h('input.text-input.song-input', {
      type: 'text', placeholder: 'Add song title', autocapitalize: 'words', autocomplete: 'off', enterkeyhint: 'next', list: listId,
    });
    input.addEventListener('input', () => { titles[index] = input.value; });

    const counter = h('span.tag-counter');
    const backBtn = h('button.nav-btn', { type: 'button' });
    const nextBtn = h('button.nav-btn.strong', { type: 'submit' });

    const form = h('form.tagger', {
      onsubmit: (e) => {
        e.preventDefault();
        titles[index] = input.value.trim();
        if (index < videoIds.length - 1) { index++; show(); }
        else {
          result = videoIds.map((id, i) => ({ id, title: titles[i] }));
          dlg.close();
        }
      },
    },
    h('div.tagger-bar', backBtn, counter, nextBtn),
    h('div.tag-video-wrap', video, linkedPlay, soundBtn),
    h('label.field.song-field', h('span.field-label', 'Song name'), input, datalist));

    backBtn.addEventListener('click', async () => {
      titles[index] = input.value.trim();
      if (index > 0) { index--; show(); return; }
      if (await confirmDialog({ title: 'Discard these videos?', message: 'None of them will be added.', confirm: 'Discard', destructive: true })) dlg.close();
    });

    async function show() {
      counter.textContent = `${index + 1} of ${videoIds.length}`;
      backBtn.textContent = index === 0 ? 'Cancel' : 'Back';
      nextBtn.textContent = index === videoIds.length - 1 ? 'Done' : 'Next';
      input.value = titles[index];
      const id = videoIds[index];
      if (isLinked(id)) {
        video.pause();
        video.hidden = true;
        soundBtn.hidden = true;
        linkedPlay.hidden = false;
        thumb.src = await mediaURL(id);
        // Auto-play each new video once (a short pause lets the photo picker finish closing).
        if (playedIndex !== index) setTimeout(() => { if (videoIds[index] === id && playedIndex !== index) playCurrentLinked(); }, 650);
        return;
      }
      linkedPlay.hidden = true;
      video.hidden = false;
      video.src = await mediaURL(id);
      autoplay(video, soundBtn);
    }

    const dlg = overlay(form, {
      variant: 'center',
      dismissable: false,
      onClose: () => { video.pause(); video.removeAttribute('src'); video.load(); resolve(result); },
    });
    show();
  });
}

/** Play with sound if the browser allows it, otherwise muted with a "tap for sound" button. */
export function autoplay(video, soundBtn) {
  video.muted = false;
  if (soundBtn) soundBtn.hidden = true;
  const p = video.play();
  if (p?.catch) {
    p.catch(() => {
      video.muted = true;
      if (soundBtn) soundBtn.hidden = false;
      video.play().catch(() => {});
    });
  }
}
