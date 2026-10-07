import { h, addBar, overlay, debounce, actionSheet, toast, formatNumber, icon } from '../ui.js';
import { wishes, newWish, saveItem, deleteItem, state } from '../store.js';
import { searchArtists, findArtistImage } from '../lookup.js';
import { ticketEl } from '../ticket.js';
import { openConcertForm } from './concertForm.js';

let root;

export function mount(el) {
  root = el;
  render();
}

export function refresh(change) {
  if (['item', 'delete', 'reload', 'settings'].includes(change.type)) render();
}

function render() {
  const list = wishes();
  root.replaceChildren(
    h('header.page-header', h('h1', 'Wishlist'), h('p.page-sub', 'Artists you want to see live')),
    h('div.page-body',
      addBar('Add New', openWishForm),
      h('div.ticket-list',
        list.length
          ? list.map((w) => ticketEl(w, { wish: true, onClick: () => wishActions(w) }))
          : h('p.empty', 'Add artists you\'d love to see. When you get tickets, tap the ticket to move it to your upcoming shows.')),
    ),
  );
}

async function wishActions(wish) {
  const choice = await actionSheet({
    title: wish.artist,
    actions: [
      { label: 'I\'ve got tickets!', value: 'got' },
      { label: 'Remove from wishlist', value: 'remove', destructive: true },
    ],
  });
  if (choice === 'remove') {
    await deleteItem(wish.id);
    toast(`Removed ${wish.artist}`);
  } else if (choice === 'got') {
    openConcertForm({
      mode: 'upcoming',
      prefill: { artist: wish.artist, artistImage: wish.artistImage, color: wish.color },
      onSaved: (saved) => { if (saved) deleteItem(wish.id); },
    });
  }
}

function openWishForm() {
  const draft = newWish();
  const input = h('input.text-input', { type: 'text', placeholder: 'Artist name', autocomplete: 'off', autocapitalize: 'words', enterkeyhint: 'done' });
  const list = h('ul.suggestions', { hidden: true });
  const preview = h('div.form-preview');
  const saveBtn = h('button.nav-btn.strong', { type: 'submit' }, 'Add');
  const renderPreview = () => preview.replaceChildren(ticketEl({ ...draft, artist: draft.artist || 'Artist name' }, { wish: true }));

  let token = 0;
  const suggest = debounce(async (q) => {
    const t = ++token;
    const res = state.settings.autoLookup ? await searchArtists(q) : [];
    if (t !== token || document.activeElement !== input) return;
    list.replaceChildren(...res.map((a) => h('li', h('button.suggestion', {
      type: 'button',
      onpointerdown: (e) => e.preventDefault(),
      onclick: () => {
        draft.artist = a.name;
        draft.artistImage = a.image;
        input.value = a.name;
        list.hidden = true;
        renderPreview();
      },
    }, a.thumb ? h('img', { src: a.thumb, alt: '' }) : icon('mic'),
    h('span', h('strong', a.name), a.fans ? h('small', `${formatNumber(a.fans)} fans`) : null)))));
    list.hidden = !res.length;
  }, 250);

  input.addEventListener('input', () => {
    draft.artist = input.value;
    draft.artistImage = '';
    renderPreview();
    if (input.value.trim()) suggest(input.value); else list.hidden = true;
  });
  input.addEventListener('blur', () => setTimeout(() => { list.hidden = true; }, 150));

  const sheet = overlay(h('form.form-sheet.short', {
    novalidate: true,
    onsubmit: async (e) => {
      e.preventDefault();
      draft.artist = input.value.trim();
      if (!draft.artist) { input.focus(); return; }
      saveBtn.disabled = true;
      if (!draft.artistImage && state.settings.autoLookup) draft.artistImage = await findArtistImage(draft.artist);
      await saveItem(draft);
      sheet.close();
      toast(`${draft.artist} added to your wishlist`);
    },
  },
  h('div.sheet-bar',
    h('button.nav-btn', { type: 'button', onclick: () => sheet.close() }, 'Cancel'),
    h('h2', 'Add to wishlist'),
    saveBtn),
  h('div.sheet-scroll',
    preview,
    h('div.field', h('span.field-label', 'Artist'), h('div.suggest-wrap', input, list))),
  ), { variant: 'sheet', dismissable: false });

  renderPreview();
  setTimeout(() => input.focus(), 350);
}
