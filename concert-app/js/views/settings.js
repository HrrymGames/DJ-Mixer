import { h, confirmDialog, toast } from '../ui.js';
import { backupFlow, restoreFlow } from '../backup.js';
import { checkServices } from '../lookup.js';
import { isNative } from '../native.js';
import { concertGuests } from '../songs.js';
import { pickHome } from './wrapped.js';
import { state, setSetting, concerts, isPast, deleteEverything } from '../store.js';

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
  // A guest who came out for several songs at one show counts once for that show.
  const guests = past.reduce((n, c) => n + concertGuests(c).size, 0);
  const stat = (n, label) => h('div.stat', h('strong', String(n)), h('span', label));
  return h('div.stats-card',
    stat(past.length, past.length === 1 ? 'show' : 'shows'),
    stat(artists.size, artists.size === 1 ? 'artist' : 'artists'),
    stat(countries.size, countries.size === 1 ? 'country' : 'countries'),
    stat(songs, songs === 1 ? 'song filmed' : 'songs filmed'),
    stat(photos, photos === 1 ? 'photo' : 'photos'),
    stat(guests, guests === 1 ? 'special guest' : 'special guests'));
}

async function storageLine(el) {
  if (!navigator.storage?.estimate) return;
  const { usage = 0 } = await navigator.storage.estimate();
  const persisted = await navigator.storage.persisted?.();
  el.textContent = `${(usage / 1024 / 1024).toFixed(usage > 100 * 1024 * 1024 ? 0 : 1)} MB used on this phone${persisted ? ' · protected from auto-clear' : ''}`;
}

// Kept between renders so the results stay visible.
const checkList = h('ul.check-list', { hidden: true });

async function runCheck(e) {
  const btn = e.currentTarget;
  btn.disabled = true;
  btn.textContent = 'Checking…';
  checkList.hidden = false;
  checkList.replaceChildren(h('li', h('span', 'Testing each online service…')));
  const results = await checkServices();
  checkList.replaceChildren(...results.map((r) => h('li',
    h('span', r.name),
    r.ok ? h('span.ok', '✓ Working') : h('span.bad', '✗ Not reachable'))));
  btn.disabled = false;
  btn.textContent = 'Check again';
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
        row('Open the app on', segmented('startTab', [['tickets', 'Tickets'], ['map', 'Map'], ['featured', 'Featured'], ['wishlist', 'Wishlist']])),
        row('Order of past tickets', segmented('pastOrder', [['newest', 'Newest first'], ['oldest', 'Oldest first']])),
        toggle('showCountdown', 'Countdown on upcoming tickets', '"In 12 days" badge on the ticket')),
      group('Stats',
        h('button.set-row.tap', { type: 'button', onclick: pickHome },
          h('span.set-text', h('span', 'Home town'), h('small', state.settings.home ? `${state.settings.home.name}${state.settings.home.area ? ', ' + state.settings.home.area : ''}` : 'Not set – used for miles travelled to gigs')),
          h('span.set-chevron', '›'))),
      group('Map',
        row('Map style', segmented('mapStyle', [['detailed', 'Detailed'], ['simple', 'Simple']]), 'Simple shows just countries and works with no signal'),
        toggle('mapUpcoming', 'Show upcoming shows on the map', 'They appear with a dashed border')),
      group('Internet lookups',
        toggle('autoLookup', 'Auto-fill details', 'Finds artist photos, tour names, venue locations and capacities online'),
        checkList,
        h('button.set-button', { type: 'button', onclick: runCheck }, 'Check connection')),
      group('Your data',
        h('p.set-note', 'Everything is saved on this phone only, and the Home Screen app keeps its own copy separate from Safari. To move your concerts: Back up here, then Restore in the other one. Back up now and then in case you change phones.'),
        h('button.set-button', { type: 'button', onclick: backupFlow }, 'Back up / export…'),
        h('button.set-button', { type: 'button', onclick: restoreFlow }, 'Restore / import…'),
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
        h('div.set-row', h('span.set-text', h('span', 'Setlistic'), h('small', isNative ? 'Version 2.0 · iPhone app' : 'Version 2.0'))),
        h('p.set-note', 'Artist photos from Deezer and Wikipedia. Venues and capacities from OpenStreetMap and Wikidata. Tours from Wikidata and Wikipedia. Map from Natural Earth (built in), with OpenStreetMap, Esri or CARTO street tiles.')),
    ),
  );
  root.scrollTop = scroll;
}
