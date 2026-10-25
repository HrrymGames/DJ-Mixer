// Bridges to the iPhone app (Capacitor). In the website / Home Screen web app none of this
// is available and `isNative` is false, so everything falls back to copying files in.

const cap = window.Capacitor;
export const isNative = !!cap?.isNativePlatform?.();

const call = (plugin, method, options = {}) => cap.nativePromise(plugin, method, options);

/** Links to camera-roll videos/photos instead of copies (see PhotoLinkPlugin.swift). */
export const photoLink = {
  access: (request = false) => call('PhotoLink', 'access', { request }),
  openSettings: () => call('PhotoLink', 'openSettings'),
  pick: (type) => call('PhotoLink', 'pick', { type, thumbSize: type === 'video' ? 540 : 420 }),
  image: (id, maxSize = 2048) => call('PhotoLink', 'image', { id, maxSize }),
  play: (ids) => call('PhotoLink', 'play', { ids }),
  cancelPlay: () => call('PhotoLink', 'cancelPlay'),
  /** A file path for playing a camera-roll video inside the app (Featured feed). */
  videoFile: (id) => call('PhotoLink', 'videoFile', { id }),
};

/** Turns a file path on the phone into a URL a <video> can play. */
export const fileSrc = (path) => cap.convertFileSrc(path);

export const filesystem = {
  write: (path, data, append = false) => call('Filesystem', append ? 'appendFile' : 'writeFile', { path, data, directory: 'CACHE' }),
  uri: (path) => call('Filesystem', 'getUri', { path, directory: 'CACHE' }),
  remove: (path) => call('Filesystem', 'deleteFile', { path, directory: 'CACHE' }),
};

export const share = (options) => call('Share', 'share', options);

// ---- media ids for linked items: "ph:<random>:<Photos identifier>" ----
export const LINK_PREFIX = 'ph:';
export const isLinked = (mediaId) => typeof mediaId === 'string' && mediaId.startsWith(LINK_PREFIX);
export const linkTarget = (mediaId) => mediaId.split(':').slice(2).join(':');

export function base64ToBlob(b64, type = 'image/jpeg') {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}
