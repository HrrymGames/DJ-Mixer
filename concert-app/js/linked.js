// iPhone app: camera-roll links instead of copies (videos and photos stay in Photos).
import { photoLink, isLinked, linkTarget } from './native.js';
import { confirmDialog, toast, overlay, h } from './ui.js';
import { addLinked } from './store.js';

async function ensureAccess() {
  const { status } = await photoLink.access(true);
  if (status === 'authorized') return true;
  const limited = status === 'limited';
  const go = await confirmDialog({
    title: limited ? 'Setlistic needs Full Access' : 'Allow access to your photos',
    message: limited
      ? 'With "Limited" access Setlistic can\'t play your videos from your camera roll. In Settings, set Photos to "Full Access".'
      : 'Setlistic plays your videos and photos straight from your camera roll instead of copying them, so it needs access to Photos.',
    confirm: 'Open Settings',
  });
  if (go) await photoLink.openSettings();
  return false;
}

/** Opens the photo picker. Returns media ids for the picked items (links + small previews). */
export async function pickLinked(type) {
  if (!await ensureAccess()) return [];
  // Sits behind the photo picker, so it shows as soon as you tap the tick.
  // (Older videos stored in iCloud can take a few seconds to get previews for.)
  const what = type === 'video' ? 'videos' : 'photos';
  const fill = h('div.busy-fill');
  const count = h('p.busy-count', 'Starting…');
  const bar = h('div.busy-bar.indeterminate', fill);
  const busy = overlay(h('div.dialog.busy-dialog',
    h('h3', `Getting your ${what} ready…`),
    bar,
    count,
    h('p', 'Older ones stored in iCloud can take a few seconds each.')), { variant: 'dialog', dismissable: false });
  // Progress messages from the iPhone app as each preview is made.
  const onProgress = (e) => {
    if (!e.total) return;
    bar.classList.remove('indeterminate');
    fill.style.width = `${Math.round((e.done / e.total) * 100)}%`;
    count.textContent = `${e.done} of ${e.total}`;
  };
  window.addEventListener('photolinkprogress', onProgress);
  let res;
  try {
    res = await photoLink.pick(type);
  } catch (e) {
    toast(e.message || 'Couldn\'t open your photos');
    return [];
  } finally {
    window.removeEventListener('photolinkprogress', onProgress);
    busy.close();
  }
  if (res.missing) toast(`${res.missing} item${res.missing === 1 ? '' : 's'} couldn't be linked`);
  return res.items?.length ? addLinked(res.items) : [];
}

/** Plays camera-roll videos full screen. Resolves when the player is closed. */
export async function playLinked(mediaIds) {
  const targets = mediaIds.filter(isLinked).map(linkTarget);
  if (!targets.length) return;
  try {
    const res = await photoLink.play(targets);
    if (res?.missing) toast(`${res.missing} video${res.missing === 1 ? ' is' : 's are'} no longer in your camera roll`);
  } catch (e) {
    toast(e.message || 'Couldn\'t play this video');
  }
}

/** Full-size version of a linked photo, as a data: URL. */
export async function linkedImageURL(mediaId) {
  const { data } = await photoLink.image(linkTarget(mediaId));
  return `data:image/jpeg;base64,${data}`;
}
