// iPhone app: camera-roll links instead of copies (videos and photos stay in Photos).
import { photoLink, isLinked, linkTarget } from './native.js';
import { confirmDialog, toast } from './ui.js';
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
  let res;
  try {
    res = await photoLink.pick(type);
  } catch (e) {
    toast(e.message || 'Couldn\'t open your photos');
    return [];
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
