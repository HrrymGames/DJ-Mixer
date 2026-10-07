/* global topojson */
// Built-in world map (country outlines from Natural Earth, via the world-atlas package).
// It ships with the app, so the map always shows countries even with no signal.

let worldPromise;

export function loadWorld() {
  if (!worldPromise) {
    worldPromise = fetch('vendor/world/countries-50m.json')
      .then((r) => r.json())
      .then((topo) => {
        const fc = topojson.feature(topo, topo.objects.countries);
        for (const f of fc.features) f.bbox = bboxOf(f.geometry);
        return fc;
      });
    worldPromise.catch(() => { worldPromise = null; });
  }
  return worldPromise;
}

function polygons(geometry) {
  if (!geometry) return [];
  return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
}

function bboxOf(geometry) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const poly of polygons(geometry)) {
    for (const [x, y] of poly[0]) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  return [minX, minY, maxX, maxY];
}

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The country feature containing a point, or null (e.g. at sea). */
export function countryAt(world, lat, lon) {
  for (const f of world.features) {
    const [minX, minY, maxX, maxY] = f.bbox;
    if (lon < minX || lon > maxX || lat < minY || lat > maxY) continue;
    for (const poly of polygons(f.geometry)) {
      if (inRing(lon, lat, poly[0]) && !poly.slice(1).some((hole) => inRing(lon, lat, hole))) return f;
    }
  }
  return null;
}
