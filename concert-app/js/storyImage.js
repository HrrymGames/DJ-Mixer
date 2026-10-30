// Wrapped slides drawn as Instagram-story-sized pictures (1080 × 1920), and sharing them.
import { isNative, filesystem, share, nativeDownload } from './native.js';

const W = 1080;
const H = 1920;
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif';

/** Loads a picture so it can be drawn (artist photos come from other websites). */
export async function loadImage(url) {
  if (!url) return null;
  try {
    let src = url;
    if (!url.startsWith('blob:') && !url.startsWith('data:')) {
      let blob = null;
      try {
        const res = await fetch(url, { mode: 'cors' });
        if (res.ok) blob = await res.blob();
      } catch { /* the photo's website doesn't allow it – try the iPhone app's own download below */ }
      if (!blob && isNative) blob = await nativeDownload(url);
      if (!blob) return null;
      src = URL.createObjectURL(blob);
    }
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
    await img.decode();
    return img;
  } catch {
    return null;
  }
}

function lines(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/);
  const out = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) { out.push(line); line = w; } else line = test;
  }
  if (line) out.push(line);
  return out;
}

/** Writes text centred, wrapping onto new lines, shrinking it to fit `maxLines`. Returns the y below it. */
function text(ctx, str, y, { size, weight = 800, maxLines = 3, color = '#fff', maxWidth = W - 160, lineGap = 1.12 }) {
  if (!str) return y;
  let s = size;
  let ls;
  for (;;) {
    ctx.font = `${weight} ${s}px ${FONT}`;
    ls = lines(ctx, str, maxWidth);
    if (ls.length <= maxLines || s <= 28) break;
    s = Math.round(s * 0.9);
  }
  ls = ls.slice(0, maxLines);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const l of ls) { ctx.fillText(l, W / 2, y); y += s * lineGap; }
  return y;
}

/** One slide as a 1080 × 1920 canvas. `img` is the slide's loaded photo (or null). */
export function drawSlide(slide, img) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, slide.bg[0]);
  g.addColorStop(1, slide.bg[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Soft circles in the background.
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath(); ctx.arc(W * 0.92, H * 0.12, 330, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(W * 0.05, H * 0.86, 420, 0, Math.PI * 2); ctx.fill();

  // Work out how tall everything is, then centre it.
  const hasImg = !!img;
  const blockH = (hasImg ? 520 : 0) + (slide.big ? 300 : 0) + 260 + (slide.list?.length ? slide.list.length * 70 + 40 : 0)
    + (slide.tiles ? Math.ceil(slide.tiles.length / 2) * 250 : 0);
  let y = Math.max(250, (H - blockH) / 2 - 40);

  y = text(ctx, slide.kicker, y, { size: 46, weight: 700, color: 'rgba(255,255,255,0.85)', maxLines: 2 }) + 30;

  if (hasImg) {
    const r = 230;
    ctx.save();
    ctx.beginPath(); ctx.arc(W / 2, y + r, r, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
    const scale = Math.max((r * 2) / img.width, (r * 2) / img.height);
    const iw = img.width * scale;
    const ih = img.height * scale;
    // Like object-position: center 25% (keeps faces in the circle).
    ctx.drawImage(img, W / 2 - iw / 2, y - (ih - r * 2) * 0.25, iw, ih);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.arc(W / 2, y + r, r, 0, Math.PI * 2); ctx.stroke();
    y += r * 2 + 50;
  }

  if (slide.big) y = text(ctx, slide.big, y, { size: 260, weight: 900, maxLines: 1, lineGap: 1.0 }) + 10;
  y = text(ctx, slide.title, y, { size: slide.big ? 76 : 96, weight: 900, maxLines: 3 }) + 16;
  y = text(ctx, slide.sub, y, { size: 44, weight: 600, color: 'rgba(255,255,255,0.9)', maxLines: 3 }) + 30;

  if (slide.list?.length) {
    for (const item of slide.list) y = text(ctx, item, y, { size: 46, weight: 700, maxLines: 1, color: 'rgba(255,255,255,0.95)' }) + 14;
  }

  if (slide.tiles) {
    const colW = (W - 200) / 2;
    slide.tiles.forEach((t, i) => {
      const x = 100 + (i % 2) * (colW + 0);
      const ty = y + Math.floor(i / 2) * 230;
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      roundRect(ctx, x + 10, ty, colW - 20, 200, 36);
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = `700 34px ${FONT}`;
      ctx.fillText(t.label.toUpperCase(), x + colW / 2, ty + 34);
      let size = 64;
      ctx.font = `900 ${size}px ${FONT}`;
      while (ctx.measureText(t.value).width > colW - 60 && size > 30) { size -= 4; ctx.font = `900 ${size}px ${FONT}`; }
      ctx.fillStyle = '#fff';
      ctx.fillText(t.value, x + colW / 2, ty + 100);
    });
  }

  // Footer
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = `800 40px ${FONT}`;
  ctx.fillText(`SETLISTIC WRAPPED ${slide.year}`, W / 2, H - 150);
  return canvas;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const toBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));

/** Opens the share sheet for one or more pictures (Instagram, Save Image, AirDrop…). */
export async function shareImages(canvases, baseName) {
  if (isNative) {
    const uris = [];
    for (const [i, canvas] of canvases.entries()) {
      const name = `${baseName}-${i + 1}.png`;
      await filesystem.write(name, canvas.toDataURL('image/png').split(',')[1]);
      uris.push((await filesystem.uri(name)).uri);
    }
    await share({ files: uris });
    return;
  }
  const blobs = await Promise.all(canvases.map(toBlob));
  const files = blobs.map((b, i) => new File([b], `${baseName}-${i + 1}.png`, { type: 'image/png' }));
  if (navigator.canShare?.({ files })) {
    try { await navigator.share({ files }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  for (const f of files) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 60_000);
  }
}
