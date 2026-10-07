import { h, confirmDialog, toast, pickFiles, actionSheet } from '../ui.js';
import { state, setSetting, concerts, wishes, isPast, exportBackup, importBackup, deleteEverything } from '../store.js';

let root;

export function mount(el) {
  root = el;
  render();
}

export function show() {
  render();
}

export function refresh(change) {
  if (['item', 'delete', 'reload', 'settings', 'day'].includes(change.type) && !root.hidden) render();
}

function segmented(key, options) {
  return h('div.seg-group', { role: 'group' }, options.map(([value, label]) => h('button.seg', {
    type: 'button',
    'aria-pressed': String(state.settings[key] === value),
    onclick: () => setSetting(key, value),
  }, label)));
}

function toggle(key, label, sub) {
  const input = h('input', { type: 'checkbox', checked: !!state.settings[key], role: 'switch' });
  input.addEventListener('change', () => setSetting(key, input.checked));
  return h('label.set-row',
    h('span.set-text', h('span', label), sub && h('small', sub)),
    h('span.switch', input, h('span.switch-ui')));
}

const row = (label, control, sub) => h('div.set-row.stack', h('span.set-text', h('span', label), sub && h('small', sub)), control);
const group = (title, ...rows) => h('section.set-group', title && h('h2.set-title', title), h('div.set-card', rows));

function statsCard() {
  const past = concerts().filter(isPast);
  const artists = new Set(past.map((c) => c.artist.toLowerCase()));
  const countries = new Set(past.map((c) => c.venue?.countryCode || c.venue?.country).filter(Boolean));
  const songs = past.reduce((n, c) => n + c.setlist.length, 0);
  const photos = concerts().reduce((n, c) => n + c.photoIds.length, 0);
  const stat = (n, label) => h('div.stat', h('strong', String(n)), h('span', label));
  return h('div.stats-card',
    stat(past.length, past.length === 1 ? 'show' : 'shows'),
    stat(artists.size, artists.size === 1 ? 'artist' : 'artists'),
    stat(countries.size, countries.size === 1 ? 'country' : 'countries'),
    stat(songs, songs === 1 ? 'song filmed' : 'songs filmed'),
    stat(photos, photos === 1 ? 'photo' : 'photos'),
    stat(wishes().length, 'on wishlist'));
}

function download(blob, name) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

async function backup() {
  const choice = await actionSheet({
    title: 'Back up your concerts',
    actions: [
      { label: 'Tickets & setlists only (small file)', value: 'light' },
      { label: 'Everything incl. photos & videos', value: 'full' },
    ],
  });
  if (!choice) return;
  toast('Preparing backup…');
  try {
    const blob = await exportBackup({ includeMedia: choice === 'full' });
    const stamp = new Date().toISOString().slice(0, 10);
    const file = new File([blob], `stubs-backup-${stamp}.json`, { type: 'application/json' });
    // On phones the share sheet lets you save it to Files / iCloud Drive.
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Stubs backup' }).catch(() => {});
    } else {
      download(blob, file.name);
    }
  } catch (e) {
    toast(`Backup failed: ${e.message || e}`);
  }
}

async function restore() {
  const [file] = await pickFiles({ accept: 'application/json,.json', multiple: false });
  if (!file) return;
  try {
    const res = await importBackup(file);
    toast(`Restored ${res.items} ticket${res.items === 1 ? '' : 's'}${res.media ? ` and ${res.media} photos/videos` : ''}`);
  } catch (e) {
    toast(e.message || 'Couldn\'t read that backup');
  }
}

async function storageLine(el) {
  if (!navigator.storage?.estimate) return;
  const { usage = 0 } = await navigator.storage.estimate();
  const persisted = await navigator.storage.persisted?.();
  el.textContent = `${(usage / 1024 / 1024).toFixed(usage > 100 * 1024 * 1024 ? 0 : 1)} MB used on this phone${persisted ? ' · protected from auto-clear' : ''}`;
}

function render() {
  const storage = h('small');
  storageLine(storage);
  const scroll = root.scrollTop;
  root.replaceChildren(
    h('header.page-header', h('h1', 'Settings')),
    h('div.page-body',
      statsCard(),
      group('Appearance',
        row('Theme', segmented('theme', [['system', 'Auto'], ['light', 'Light'], ['dark', 'Dark']]), 'Auto follows your phone\'s setting')),
      group('Tickets',
        row('Open the app on', segmented('startTab', [['tickets', 'Tickets'], ['map', 'Map'], ['wishlist', 'Wishlist']])),
        row('Order of past tickets', segmented('pastOrder', [['newest', 'Newest first'], ['oldest', 'Oldest first']])),
        toggle('showCountdown', 'Countdown on upcoming tickets', '"In 12 days" badge on the ticket')),
      group('Map',
        toggle('mapUpcoming', 'Show upcoming shows on the map', 'They appear with a dashed border')),
      group('Internet lookups',
        toggle('autoLookup', 'Auto-fill details', 'Finds artist photos, tour names, venue locations and capacities online')),
      group('Your data',
        h('p.set-note', 'Everything is saved on this phone only. Back up now and then so you don\'t lose your tickets if you change phones.'),
        h('button.set-button', { type: 'button', onclick: backup }, 'Back up…'),
        h('button.set-button', { type: 'button', onclick: restore }, 'Restore from backup…'),
        h('div.set-row', h('span.set-text', h('span', 'Storage'), storage)),
        h('button.set-button.destructive', {
          type: 'button',
          onclick: async () => {
            if (await confirmDialog({ title: 'Delete everything?', message: 'All tickets, wishlist, setlists, photos and videos in this app will be removed. This can\'t be undone.', confirm: 'Delete all', destructive: true })) {
              await deleteEverything();
              toast('All data deleted');
            }
          },
        }, 'Delete all data')),
      group('About',
        h('div.set-row', h('span.set-text', h('span', 'Stubs'), h('small', 'Version 1.0'))),
        h('p.set-note', 'Artist photos from Deezer and Wikipedia. Maps, venues and capacities from OpenStreetMap, CARTO and Wikidata. Tours from Wikidata and Wikipedia.')),
    ),
  );
  root.scrollTop = scroll;
}
