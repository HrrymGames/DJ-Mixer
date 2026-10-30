// Setlist song labels with special guests.
//   The first song a guest appears on:  "Timeless (Playboi Carti Comes Out)"
//   Any later song with the same guest:  "Sky (With Playboi Carti)"
// Worked out from the current order, so reordering the setlist updates the labels.

export const guestKey = (name) => (name || '').trim().toLowerCase().replace(/\s+/g, ' ');

/** One note per song in the setlist: '' (no guest), 'X Comes Out' or 'With X'. */
export function guestNotes(setlist) {
  // If the same guest was typed differently ("playboi carti" / "Playboi Carti"),
  // show the best-capitalised version everywhere.
  const display = new Map();
  const caps = (t) => (t.match(/[A-Z]/g) || []).length;
  for (const song of setlist) {
    const name = (song.guest || '').trim().replace(/\s+/g, ' ');
    if (!name) continue;
    const key = guestKey(name);
    if (!display.has(key) || caps(name) > caps(display.get(key))) display.set(key, name);
  }
  const seen = new Set();
  return setlist.map((song) => {
    const key = guestKey(song.guest);
    if (!key) return '';
    const name = display.get(key);
    if (seen.has(key)) return `With ${name}`;
    seen.add(key);
    return `${name} Comes Out`;
  });
}

export function songLabel(song, note) {
  const title = song?.title || 'Untitled';
  return note ? `${title} (${note})` : title;
}

/** Label for one song, looking at the whole setlist it belongs to. */
export function songLabelIn(setlist, songId) {
  const notes = guestNotes(setlist);
  const i = setlist.findIndex((s) => s.id === songId);
  return i < 0 ? '' : songLabel(setlist[i], notes[i]);
}

/** Special guests seen at a concert (a guest on several songs counts once). */
export function concertGuests(concert) {
  return new Set((concert.setlist || []).map((s) => guestKey(s.guest)).filter(Boolean));
}

/** DJ opener songs always come first in a setlist, keeping their order within each part. */
export function djFirst(setlist) {
  return [...setlist.filter((s) => s.dj), ...setlist.filter((s) => !s.dj)];
}
