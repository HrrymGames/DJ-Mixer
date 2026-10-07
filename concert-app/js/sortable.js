// Drag-to-reorder for a list, using a grip handle (works with touch and mouse).

function scrollParent(el) {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return document.scrollingElement;
}

/**
 * opts.handle  selector for the grip inside each item
 * opts.onMove(itemEl, newDisplayIndex)  called while dragging so numbers can update live
 * opts.onEnd(fromIndex, toIndex)
 */
export function makeSortable(list, { handle, onMove, onEnd }) {
  if (list._sortable) return;
  list._sortable = true;

  list.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest(handle);
    if (!grip || !list.contains(grip) || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();

    const item = grip.closest('li');
    const items = [...list.children];
    const from = items.indexOf(item);
    const rects = items.map((it) => it.getBoundingClientRect());
    const gap = rects.length > 1 ? rects[1].top - rects[0].bottom : 0;
    const slot = rects[from].height + gap;
    const scroller = scrollParent(list);
    const startY = e.clientY;
    const startScroll = scroller.scrollTop;
    let pointerY = e.clientY;
    let to = from;
    let raf = 0;

    grip.setPointerCapture?.(e.pointerId);
    item.classList.add('dragging');
    list.classList.add('sorting');
    navigator.vibrate?.(8);

    const update = () => {
      const dy = pointerY - startY + (scroller.scrollTop - startScroll);
      item.style.transform = `translateY(${dy}px)`;
      const center = rects[from].top + rects[from].height / 2 + dy;
      to = from;
      for (let j = from + 1; j < items.length; j++) if (center > rects[j].top + rects[j].height / 2) to = j;
      for (let j = from - 1; j >= 0; j--) if (center < rects[j].top + rects[j].height / 2) to = j;
      items.forEach((it, j) => {
        if (it === item) return;
        let shift = 0;
        if (from < to && j > from && j <= to) shift = -slot;
        if (to < from && j >= to && j < from) shift = slot;
        it.style.transform = shift ? `translateY(${shift}px)` : '';
        onMove?.(it, j + (shift < 0 ? -1 : shift > 0 ? 1 : 0));
      });
      onMove?.(item, to);
    };

    // Scroll the page when dragging near the top or bottom edge.
    const autoScroll = () => {
      const box = scroller === document.scrollingElement ? { top: 0, bottom: innerHeight } : scroller.getBoundingClientRect();
      const edge = 70;
      let v = 0;
      if (pointerY < box.top + edge) v = -Math.ceil((box.top + edge - pointerY) / 6);
      else if (pointerY > box.bottom - edge - 80) v = Math.ceil((pointerY - (box.bottom - edge - 80)) / 6);
      if (v) { scroller.scrollTop += v; update(); }
      raf = requestAnimationFrame(autoScroll);
    };
    raf = requestAnimationFrame(autoScroll);

    const move = (ev) => { pointerY = ev.clientY; update(); };
    const end = () => {
      cancelAnimationFrame(raf);
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', end);
      grip.removeEventListener('pointercancel', end);
      list.classList.remove('sorting');
      item.classList.remove('dragging');
      // Put the element in its new place right away so nothing jumps while saving.
      items.forEach((it) => { it.style.transition = 'none'; it.style.transform = ''; });
      if (to !== from) list.insertBefore(item, to > from ? items[to].nextSibling : items[to]);
      [...list.children].forEach((it, j) => onMove?.(it, j));
      requestAnimationFrame(() => items.forEach((it) => { it.style.transition = ''; }));
      onEnd?.(from, to);
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
  });
}
