// Small DOM helpers shared by every screen.

/** h('div.class#id', {attrs}, ...children) */
export function h(tag, attrs, ...children) {
  const [, name = 'div', rest = ''] = tag.match(/^([a-z0-9-]*)(.*)$/i);
  const el = document.createElement(name || 'div');
  for (const part of rest.match(/[.#][^.#]+/g) || []) {
    if (part[0] === '.') el.classList.add(part.slice(1)); else el.id = part.slice(1);
  }
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs);
    attrs = null;
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') {
      for (const [prop, val] of Object.entries(v)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, val); else el.style[prop] = val;
      }
    }
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const ICONS = {
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/></svg>',
  grip: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="12" cy="9.5" r="2.5" fill="none" stroke="currentColor" stroke-width="1.9"/></svg>',
  globe: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z" fill="none" stroke="currentColor" stroke-width="1.9"/></svg>',
  calendar: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
  people: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.6.8 2.7 2.5 3 5.2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
  mic: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
  sound: '<svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="m16 9.5 5 5M21 9.5l-5 5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/></svg>',
  back10: '<svg viewBox="0 0 24 24"><path d="M11 5.2A7.5 7.5 0 1 1 4.6 9.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M11 2.2v6l-4-3z" fill="currentColor"/><text x="12.3" y="16.2" font-size="7" font-weight="700" text-anchor="middle" fill="currentColor" font-family="-apple-system,system-ui,sans-serif">10</text></svg>',
  fwd10: '<svg viewBox="0 0 24 24"><path d="M13 5.2a7.5 7.5 0 1 0 6.4 4.3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M13 2.2v6l4-3z" fill="currentColor"/><text x="11.7" y="16.2" font-size="7" font-weight="700" text-anchor="middle" fill="currentColor" font-family="-apple-system,system-ui,sans-serif">10</text></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>',
  photo: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="9" cy="10" r="1.8" fill="currentColor"/><path d="m4 17 5-4.5 3.5 3 3-2.5L20 17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>',
  ticket: '<svg viewBox="0 0 24 24"><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h15A1.5 1.5 0 0 1 21 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5V14a2 2 0 0 0 0-4V7.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
};

export function icon(name, cls = '') {
  return h(`span.icon${cls ? '.' + cls : ''}`, { html: ICONS[name], 'aria-hidden': 'true' });
}

/** The rounded "+ Add New" bar used on several screens. */
export function addBar(label, onClick, extraClass = '') {
  return h(`button.add-bar${extraClass ? '.' + extraClass : ''}`, { type: 'button', onclick: onClick },
    h('span.add-bar-plus', { html: ICONS.plus }),
    h('span.add-bar-label', label));
}

// ---------- formatting ----------
const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const longDateFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export function formatDate(iso, long = false) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return (long ? longDateFmt : dateFmt).format(new Date(y, m - 1, d));
}

export const formatNumber = (n) => (n == null ? '' : new Intl.NumberFormat('en-GB').format(n));

export function placeLine(venue) {
  return [venue?.city, venue?.country].filter(Boolean).join(', ');
}

// ---------- overlays ----------
const layer = () => document.getElementById('layer');

/**
 * Bottom sheet / modal. Returns {el, close}. `onClose` runs once when it closes.
 * variant: 'sheet' (slides up) | 'center' (blurred backdrop, centered card) | 'full'
 */
export function overlay(content, { variant = 'sheet', onClose, dismissable = true } = {}) {
  const backdrop = h(`div.overlay.overlay-${variant}`);
  const panel = h('div.overlay-panel', content);
  backdrop.append(panel);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    backdrop.classList.remove('open');
    backdrop.classList.add('closing');
    const done = () => { backdrop.remove(); onClose?.(); };
    backdrop.addEventListener('transitionend', done, { once: true });
    setTimeout(done, 400);
  };
  if (dismissable) backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  layer().append(backdrop);
  requestAnimationFrame(() => requestAnimationFrame(() => backdrop.classList.add('open')));
  return { el: panel, backdrop, close };
}

/** A ring that fills up as something downloads. set(0…1). */
export function progressRing() {
  const R = 22;
  const LEN = 2 * Math.PI * R;
  const el = h('div.progress-ring', {
    html: `<svg viewBox="0 0 52 52"><circle class="ring-track" cx="26" cy="26" r="${R}"/><circle class="ring-fill" cx="26" cy="26" r="${R}" stroke-dasharray="${LEN}" stroke-dashoffset="${LEN}"/></svg>`,
  });
  const fill = el.querySelector('.ring-fill');
  let shown = 0;
  return {
    el,
    set(p) {
      shown = Math.max(shown, Math.min(1, Math.max(0, p)));
      fill.setAttribute('stroke-dashoffset', String(LEN * (1 - shown)));
    },
    reset() { shown = 0; fill.setAttribute('stroke-dashoffset', String(LEN)); },
  };
}

/** iOS style list of actions. Resolves with the chosen value or null. */
export function actionSheet({ title, actions }) {
  return new Promise((resolve) => {
    let picked = null;
    const sheet = overlay(h('div.action-sheet',
      h('div.action-group',
        title && h('div.action-title', title),
        actions.map((a) => h(`button.action${a.destructive ? '.destructive' : ''}`, {
          type: 'button',
          onclick: () => { picked = a.value; sheet.close(); },
        }, a.label))),
      h('button.action.action-cancel', { type: 'button', onclick: () => sheet.close() }, 'Cancel'),
    ), { variant: 'actions', onClose: () => resolve(picked) });
  });
}

export function confirmDialog({ title, message, confirm = 'OK', destructive = false }) {
  return new Promise((resolve) => {
    let ok = false;
    const dlg = overlay(h('div.dialog',
      h('h3', title),
      message && h('p', message),
      h('div.dialog-buttons',
        h('button', { type: 'button', onclick: () => dlg.close() }, 'Cancel'),
        h(`button.strong${destructive ? '.destructive' : ''}`, { type: 'button', onclick: () => { ok = true; dlg.close(); } }, confirm)),
    ), { variant: 'dialog', onClose: () => resolve(ok) });
  });
}

export function promptDialog({ title, value = '', placeholder = '', confirm = 'Save' }) {
  return new Promise((resolve) => {
    let result = null;
    const input = h('input.text-input', { type: 'text', value, placeholder, autocapitalize: 'words' });
    const dlg = overlay(h('form.dialog', {
      onsubmit: (e) => { e.preventDefault(); result = input.value.trim(); dlg.close(); },
    },
    h('h3', title),
    input,
    h('div.dialog-buttons',
      h('button', { type: 'button', onclick: () => dlg.close() }, 'Cancel'),
      h('button.strong', { type: 'submit' }, confirm)),
    ), { variant: 'dialog', onClose: () => resolve(result) });
    setTimeout(() => input.focus(), 50);
  });
}

let toastTimer;
export function toast(message) {
  document.querySelector('.toast')?.remove();
  const t = h('div.toast', { role: 'status' }, message);
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
}

/** Opens the photo library / file picker. Resolves with an array of Files (empty if cancelled). */
export function pickFiles({ accept, multiple = true }) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, multiple, style: { position: 'fixed', left: '-9999px', opacity: '0' } });
    let settled = false;
    const finish = (files) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => finish([...(input.files || [])]));
    input.addEventListener('cancel', () => finish([]));
    document.body.append(input);
    input.click();
  });
}

/** Run fn once calls have stopped for `ms`, with the latest arguments. */
export function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
