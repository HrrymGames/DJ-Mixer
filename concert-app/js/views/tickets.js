import { h, addBar } from '../ui.js';
import { pastConcerts, upcomingConcerts } from '../store.js';
import { ticketEl } from '../ticket.js';
import { nav } from '../nav.js';
import { openConcertForm } from './concertForm.js';

let root;

export function mount(el) {
  root = el;
  render();
}

export function refresh(change) {
  if (change.type === 'item' || change.type === 'delete' || change.type === 'reload' || change.type === 'day' || change.type === 'settings') render();
}

function render() {
  const past = pastConcerts();
  const upcoming = upcomingConcerts();
  const scroll = root.scrollTop;

  root.replaceChildren(
    h('header.page-header', h('h1', 'Tickets'),
      past.length ? h('p.page-sub', `${past.length} show${past.length === 1 ? '' : 's'} so far`) : null),

    h('div.page-body',
      addBar('Add New', () => openConcertForm({ mode: 'past' })),
      h('div.ticket-list',
        past.length
          ? past.map((c) => ticketEl(c, { onClick: () => nav.openConcert(c.id) }))
          : h('p.empty', 'Concerts you\'ve been to show up here as tickets. Tap Add New to add your first one.')),

      h('h2.section-heading', 'Upcoming Shows'),
      h('div.ticket-list',
        upcoming.map((c) => ticketEl(c, { onClick: () => nav.openConcert(c.id) })),
        !upcoming.length && h('p.empty', 'Got tickets for something? Add it here. It moves up to your tickets once the date has passed.')),
      addBar('Add New', () => openConcertForm({ mode: 'upcoming' })),
    ),
  );
  root.scrollTop = scroll;
}
