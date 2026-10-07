import { h, overlay, debounce, icon, toast, pickFiles, placeLine, formatNumber, confirmDialog } from '../ui.js';
import { newConcert, saveItem, addMedia, deleteMedia, deleteItem, isPast, state } from '../store.js';
import { searchArtists, findArtistImage, searchVenues, findVenueCapacity, findTour } from '../lookup.js';
import { ticketEl } from '../ticket.js';

/**
 * Add / edit a concert.
 *   mode: 'past' | 'upcoming' (only changes the wording)
 *   concert: existing concert to edit
 *   prefill: {artist, artistImage} e.g. from the wishlist
 *   onSaved(concert)
 */
export function openConcertForm({ mode = 'past', concert, prefill, onSaved } = {}) {
  const editing = !!concert;
  const draft = editing
    ? structuredClone(concert)
    : newConcert({ date: '', ...(prefill || {}) });
  const auto = state.settings.autoLookup;

  // Which fields the user typed themselves (so lookups don't overwrite them).
  const touched = { tour: editing && !!draft.tour, capacity: editing && draft.capacity != null };
  let pendingOwnImage = null;   // File chosen this session, saved on Save
  let removeOwnImage = false;

  // ---------- preview ----------
  const preview = h('div.form-preview');
  const renderPreview = () => {
    const shown = { ...draft, artist: draft.artist || 'Artist name', date: draft.date || '' };
    if (pendingOwnImage) { shown.ownImageId = null; shown.artistImage = pendingOwnImage.url; }
    else if (removeOwnImage) shown.ownImageId = null;
    preview.replaceChildren(ticketEl(shown));
  };

  // ---------- artist ----------
  const artistInput = h('input.text-input', {
    type: 'text', value: draft.artist, placeholder: 'e.g. Fred again..', autocomplete: 'off', autocapitalize: 'words', enterkeyhint: 'next',
  });
  const artistList = h('ul.suggestions', { hidden: true });
  let artistToken = 0;
  const suggestArtists = debounce(async (q) => {
    const token = ++artistToken;
    const res = auto ? await searchArtists(q) : [];
    if (token !== artistToken || document.activeElement !== artistInput) return;
    showSuggestions(artistList, res.map((a) => ({
      main: a.name,
      sub: a.fans ? `${formatNumber(a.fans)} fans` : '',
      img: a.thumb,
      pick: () => setArtist(a.name, a.image),
    })));
  }, 250);
  artistInput.addEventListener('input', () => {
    draft.artist = artistInput.value;
    renderPreview();
    if (artistInput.value.trim()) suggestArtists(artistInput.value); else hide(artistList);
  });
  artistInput.addEventListener('blur', () => {
    setTimeout(() => hide(artistList), 150);
    if (draft.artist.trim() && draft.artist !== lastArtistLookup) setArtist(draft.artist.trim(), null);
  });

  let lastArtistLookup = editing ? draft.artist : '';
  async function setArtist(name, image) {
    draft.artist = name;
    artistInput.value = name;
    lastArtistLookup = name;
    hide(artistList);
    renderPreview();
    if (auto) {
      if (image) draft.artistImage = image;
      else {
        photoStatus.textContent = 'Finding a photo…';
        const img = await findArtistImage(name);
        if (draft.artist !== name) return;
        draft.artistImage = img;
        photoStatus.textContent = img ? '' : 'No photo found online – pick one from your camera roll.';
      }
      renderPreview();
      renderPhotoRow();
      lookupTour();
    }
  }

  // ---------- venue ----------
  const venueInput = h('input.text-input', {
    type: 'text', value: draft.venue.name, placeholder: 'e.g. O2 Victoria Warehouse', autocomplete: 'off', autocapitalize: 'words',
  });
  const venueList = h('ul.suggestions', { hidden: true });
  const venuePicked = h('div.venue-picked');
  const cityInput = h('input.text-input', { type: 'text', value: draft.venue.city, placeholder: 'City', autocapitalize: 'words' });
  const countryInput = h('input.text-input', { type: 'text', value: draft.venue.country, placeholder: 'Country', autocapitalize: 'words' });
  const manualVenue = h('div.manual-venue', { hidden: !(draft.venue.name && draft.venue.lat == null) }, cityInput, countryInput,
    h('p.hint', 'Without a map location this show won\'t get a pin on the map.'));
  const manualLink = h('button.link-btn', { type: 'button', onclick: () => { manualVenue.hidden = false; cityInput.focus(); } }, 'Can\'t find it? Type the city and country');

  const renderVenuePicked = () => {
    const v = draft.venue;
    venuePicked.replaceChildren(v.name && v.lat != null
      ? h('div.venue-card', icon('pin'), h('div', h('strong', v.name), h('span', placeLine(v))))
      : '');
  };

  let venueToken = 0;
  const suggestVenues = debounce(async (q) => {
    const token = ++venueToken;
    const res = auto ? await searchVenues(q) : [];
    if (token !== venueToken || document.activeElement !== venueInput) return;
    showSuggestions(venueList, res.map((v) => ({
      main: v.name,
      sub: placeLine(v),
      iconName: 'pin',
      pick: () => setVenue(v),
    })));
  }, 300);
  venueInput.addEventListener('input', () => {
    // Typing again means the earlier map location no longer applies.
    draft.venue = { ...draft.venue, name: venueInput.value, lat: null, lon: null, countryCode: '' };
    renderVenuePicked();
    renderPreview();
    if (venueInput.value.trim()) suggestVenues(venueInput.value); else hide(venueList);
  });
  venueInput.addEventListener('blur', () => setTimeout(() => hide(venueList), 150));
  cityInput.addEventListener('input', () => { draft.venue.city = cityInput.value; renderPreview(); });
  countryInput.addEventListener('input', () => { draft.venue.country = countryInput.value; renderPreview(); });

  async function setVenue(v) {
    draft.venue = { name: v.name, city: v.city, country: v.country, countryCode: v.countryCode, lat: v.lat, lon: v.lon };
    venueInput.value = v.name;
    cityInput.value = v.city;
    countryInput.value = v.country;
    manualVenue.hidden = true;
    hide(venueList);
    renderVenuePicked();
    renderPreview();
    if (!auto || touched.capacity) return;
    capacityStatus.textContent = 'Looking up capacity…';
    const cap = await findVenueCapacity(v);
    if (draft.venue.name !== v.name || touched.capacity) return;
    draft.capacity = cap;
    capacityInput.value = cap ?? '';
    capacityStatus.textContent = cap ? 'Found online – change it if it\'s wrong.' : 'Couldn\'t find the capacity – type it in if you know it.';
    renderPreview();
  }

  // ---------- date ----------
  const dateInput = h('input.text-input', { type: 'date', value: draft.date });
  dateInput.addEventListener('change', () => {
    draft.date = dateInput.value;
    renderPreview();
    lookupTour();
  });

  // ---------- tour / festival ----------
  const typeButtons = ['tour', 'festival'].map((t) => h('button.seg', {
    type: 'button',
    'aria-pressed': String(draft.eventType === t),
    onclick: () => {
      draft.eventType = t;
      typeButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.type === t)));
      tourLabel.textContent = t === 'festival' ? 'Festival name' : 'Tour name';
      tourInput.placeholder = t === 'festival' ? 'e.g. Glastonbury 2025' : 'e.g. The Eras Tour';
    },
    'data-type': t,
  }, t === 'tour' ? 'Tour' : 'Festival'));
  const tourLabel = h('span.field-label', draft.eventType === 'festival' ? 'Festival name' : 'Tour name');
  const tourInput = h('input.text-input', { type: 'text', value: draft.tour, placeholder: draft.eventType === 'festival' ? 'e.g. Glastonbury 2025' : 'e.g. The Eras Tour', autocapitalize: 'words' });
  const tourStatus = h('p.hint');
  tourInput.addEventListener('input', () => {
    draft.tour = tourInput.value;
    touched.tour = !!tourInput.value.trim();
    tourStatus.textContent = '';
    renderPreview();
  });

  let tourToken = 0;
  async function lookupTour() {
    if (!auto || touched.tour || !draft.artist.trim() || !draft.date) return;
    const token = ++tourToken;
    tourStatus.textContent = 'Searching for the tour…';
    const res = await findTour(draft.artist, draft.date);
    if (token !== tourToken || touched.tour) return;
    if (res) {
      draft.tour = res.name;
      tourInput.value = res.name;
      typeButtons.find((b) => b.dataset.type === res.type)?.click();
      tourStatus.textContent = 'Found online – change it if it\'s wrong.';
    } else {
      draft.tour = '';
      tourInput.value = '';
      tourStatus.textContent = 'Couldn\'t find a tour for that date – type it in.';
    }
    renderPreview();
  }

  // ---------- capacity ----------
  const capacityInput = h('input.text-input', { type: 'number', inputmode: 'numeric', min: '0', value: draft.capacity ?? '', placeholder: 'e.g. 3500' });
  const capacityStatus = h('p.hint');
  capacityInput.addEventListener('input', () => {
    const n = parseInt(capacityInput.value, 10);
    draft.capacity = Number.isFinite(n) && n > 0 ? n : null;
    touched.capacity = capacityInput.value !== '';
    capacityStatus.textContent = '';
    renderPreview();
  });

  // ---------- photo ----------
  const photoRow = h('div.photo-row');
  const photoStatus = h('p.hint');
  const renderPhotoRow = () => {
    const hasOwn = pendingOwnImage || (draft.ownImageId && !removeOwnImage);
    photoRow.replaceChildren(
      h('button.pill-btn', {
        type: 'button',
        onclick: async () => {
          const [file] = await pickFiles({ accept: 'image/*', multiple: false });
          if (!file) return;
          if (pendingOwnImage) URL.revokeObjectURL(pendingOwnImage.url);
          pendingOwnImage = { file, url: URL.createObjectURL(file) };
          renderPreview();
          renderPhotoRow();
        },
      }, icon('photo'), hasOwn ? 'Change photo' : 'Use my own photo'),
      hasOwn && h('button.pill-btn.subtle', {
        type: 'button',
        onclick: () => {
          if (pendingOwnImage) { URL.revokeObjectURL(pendingOwnImage.url); pendingOwnImage = null; }
          if (draft.ownImageId) removeOwnImage = true;
          renderPreview();
          renderPhotoRow();
        },
      }, 'Use online photo'),
    );
  };

  // ---------- save ----------
  const saveBtn = h('button.nav-btn.strong', { type: 'submit' }, editing ? 'Save' : 'Add');
  const errorLine = h('p.form-error', { role: 'alert' });

  async function save(e) {
    e.preventDefault();
    draft.artist = artistInput.value.trim();
    draft.venue.name = venueInput.value.trim();
    draft.tour = tourInput.value.trim();
    if (!draft.artist) return fail('Add the artist.', artistInput);
    if (!draft.venue.name) return fail('Add the venue.', venueInput);
    if (!draft.date) return fail('Add the date.', dateInput);
    saveBtn.disabled = true;
    try {
      if (pendingOwnImage) {
        const [id] = await addMedia([pendingOwnImage.file]);
        if (draft.ownImageId) await deleteMedia([draft.ownImageId]);
        draft.ownImageId = id;
        URL.revokeObjectURL(pendingOwnImage.url);
        pendingOwnImage = null;
      } else if (removeOwnImage && draft.ownImageId) {
        await deleteMedia([draft.ownImageId]);
        draft.ownImageId = null;
      }
      if (!draft.artistImage && auto && !draft.ownImageId) draft.artistImage = await findArtistImage(draft.artist);
      const saved = await saveItem(draft);
      sheet.close();
      if (!editing) toast(isPast(saved) ? 'Added to your tickets' : 'Added to upcoming shows');
      onSaved?.(saved);
    } catch (err) {
      saveBtn.disabled = false;
      fail(`Couldn't save: ${err.message || err}`);
    }
  }
  function fail(msg, focusEl) {
    errorLine.textContent = msg;
    focusEl?.focus();
  }

  const title = editing ? 'Edit concert' : mode === 'upcoming' ? 'New upcoming show' : 'New concert';
  const form = h('form.form-sheet', { onsubmit: save, novalidate: true },
    h('div.sheet-bar',
      h('button.nav-btn', { type: 'button', onclick: () => sheet.close() }, 'Cancel'),
      h('h2', title),
      saveBtn),
    h('div.sheet-scroll',
      preview,
      errorLine,
      h('div.field', h('span.field-label', 'Artist'), h('div.suggest-wrap', artistInput, artistList)),
      h('div.field', h('span.field-label', 'Venue'), h('div.suggest-wrap', venueInput, venueList), venuePicked),
      manualLink,
      manualVenue,
      h('label.field', h('span.field-label', 'Date'), dateInput),
      h('div.field',
        h('div.seg-group', { role: 'group', 'aria-label': 'Tour or festival' }, typeButtons),
        h('label', tourLabel, tourInput),
        tourStatus),
      h('label.field', h('span.field-label', 'Venue capacity'), capacityInput, capacityStatus),
      h('div.field', h('span.field-label', 'Photo'), photoRow, photoStatus),
      editing && h('button.danger-btn', {
        type: 'button',
        onclick: async () => {
          if (await confirmDialog({ title: 'Delete this concert?', message: 'Its ticket, setlist, videos and photos will be removed from this phone.', confirm: 'Delete', destructive: true })) {
            sheet.close();
            await deleteItem(draft.id);
            onSaved?.(null);
          }
        },
      }, icon('trash'), 'Delete concert'),
      !auto && h('p.hint.center', 'Auto-fill from the internet is turned off in Settings.'),
    ),
  );

  const sheet = overlay(form, {
    variant: 'sheet',
    dismissable: false,
    onClose: () => { if (pendingOwnImage) URL.revokeObjectURL(pendingOwnImage.url); },
  });
  renderPreview();
  renderVenuePicked();
  renderPhotoRow();
  if (!editing) {
    const first = draft.artist ? venueInput : artistInput;
    setTimeout(() => { if (!sheet.el.contains(document.activeElement)) first.focus(); }, 350);
  }
  if (prefill?.artist && !prefill.artistImage && auto) setArtist(prefill.artist, null);
  return sheet;
}

function showSuggestions(list, items) {
  if (!items.length) { hide(list); return; }
  list.replaceChildren(...items.map((it) => h('li',
    h('button.suggestion', {
      type: 'button',
      // pointerdown + preventDefault keeps the keyboard open and beats the input's blur.
      onpointerdown: (e) => e.preventDefault(),
      onclick: it.pick,
    },
    it.img ? h('img', { src: it.img, alt: '' }) : icon(it.iconName || 'mic'),
    h('span', h('strong', it.main), it.sub && h('small', it.sub))))));
  list.hidden = false;
}

function hide(list) { list.hidden = true; }
