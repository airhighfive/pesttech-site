// Builds the background river: the Tennessee River through Chattanooga, Moccasin Bend and all,
// drawn in the page's background color so it shows up as a gap in the dot dither (see site.css).
//
// Data: USGS National Hydrography Dataset (public domain), "Area - Large Scale" layer. The river through
// town is stored as StreamRiver polygons (ftype 460); the script keeps every one that reaches into the
// map area (a few creek mouths come along with them). To refresh it, download the GeoJSON from
//   https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/9/query
//   ?where=1=1&geometry=-85.42,34.98,-85.18,35.13&geometryType=esriGeometryEnvelope
//   &inSR=4326&outSR=4326&returnGeometry=true&outFields=*&f=geojson
// then run: node scripts/make-river-svg.mjs <that file.geojson>
//
// Output: two pieces that share one scale and one north/south window, so the river lines up:
//   river-west.svg  Moccasin Bend and the west half of downtown, pinned to the left edge of the screen
//   river-east.svg  downtown up to Chickamauga Dam, pinned to the right edge
// The centered page covers the middle, so each side of a wide screen shows a recognizable stretch,
// whatever the screen's shape. Each piece fades out along its inner edge, so neither ends in a hard line.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const input = process.argv[2];
if (!input) throw new Error("Usage: node scripts/make-river-svg.mjs <nhd-area.geojson>");

const LAT = { min: 35.016, max: 35.108 }; // from just below the I-24 bridge to Chickamauga Dam
const H = 1080;
const ky = H / (LAT.max - LAT.min);
const kx = ky * Math.cos((((LAT.min + LAT.max) / 2) * Math.PI) / 180);
const PIECES = [
  { file: "river-west.svg", lonMin: -85.352, lonMax: -85.293, fade: "right", label: "Moccasin Bend and downtown" },
  { file: "river-east.svg", lonMin: -85.3, lonMax: -85.226, fade: "left", label: "downtown up to Chickamauga Dam" },
];

// Sutherland-Hodgman clip of one ring against an axis-aligned rectangle.
function clipRing(ring, box) {
  const edges = [
    [(p) => p[0] >= box.x0, (a, b) => cross(a, b, 0, box.x0)],
    [(p) => p[0] <= box.x1, (a, b) => cross(a, b, 0, box.x1)],
    [(p) => p[1] >= box.y0, (a, b) => cross(a, b, 1, box.y0)],
    [(p) => p[1] <= box.y1, (a, b) => cross(a, b, 1, box.y1)],
  ];
  let out = ring;
  for (const [inside, intersect] of edges) {
    const pts = out;
    out = [];
    for (let i = 0; i < pts.length; i++) {
      const cur = pts[i];
      const prev = pts[(i + pts.length - 1) % pts.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(intersect(prev, cur));
        out.push(cur);
      } else if (inside(prev)) {
        out.push(intersect(prev, cur));
      }
    }
    if (!out.length) break;
  }
  return out;
}
function cross(a, b, axis, value) {
  const t = (value - a[axis]) / (b[axis] - a[axis]);
  return axis === 0 ? [value, a[1] + t * (b[1] - a[1])] : [a[0] + t * (b[0] - a[0]), value];
}

// Ramer-Douglas-Peucker simplification, tolerance in pixels.
function simplify(pts, tol) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxD = 0, idx = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
// Rings start and end on the same point, which would make the first split above degenerate,
// so split each ring at the point farthest from its start and simplify the two halves.
function simplifyRing(pts, tol) {
  if (pts.length < 4) return pts;
  let far = 0, maxD = -1;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]);
    if (d > maxD) { maxD = d; far = i; }
  }
  return simplify(pts.slice(0, far + 1), tol).concat(simplify(pts.slice(far), tol).slice(1));
}

// Collect the river polygons. USGS splits the river through town into more than one StreamRiver
// polygon (ftype 460), so keep every one that actually reaches into the map area.
const geo = JSON.parse(readFileSync(input, "utf8"));
const polygonsOf = (g) => (g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : []);
const lonMin = Math.min(...PIECES.map((p) => p.lonMin)), lonMax = Math.max(...PIECES.map((p) => p.lonMax));
const inArea = ([lon, lat]) => lon > lonMin && lon < lonMax && lat > LAT.min && lat < LAT.max;
const rings = [];
for (const f of geo.features) {
  if (Number(f.properties.ftype ?? f.properties.FTYPE) !== 460) continue;
  const polyRings = polygonsOf(f.geometry).flat();
  const count = polyRings.reduce((n, ring) => n + ring.filter(inArea).length, 0);
  if (count >= 5) rings.push(...polyRings);
}
if (!rings.length) throw new Error("No StreamRiver polygons found in the map area");

const pad = 40; // clip a little outside the picture so cut edges never show
for (const piece of PIECES) {
  const W = Math.round((piece.lonMax - piece.lonMin) * kx);
  const project = ([lon, lat]) => [(lon - piece.lonMin) * kx, (LAT.max - lat) * ky];
  const box = { x0: -pad, x1: W + pad, y0: -pad, y1: H + pad };
  const parts = [];
  let points = 0;
  for (const ring of rings) {
    const clipped = simplifyRing(clipRing(ring.map(project), box), 1.4);
    if (clipped.length < 3) continue;
    points += clipped.length;
    parts.push("M" + clipped.map(([x, y]) => `${Math.round(x)} ${Math.round(y)}`).join("L") + "Z");
  }
  // Fade the inner edge (the side that runs under the page) instead of ending in a hard line.
  const stops = piece.fade === "right"
    ? `<stop offset=".8" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>`
    : `<stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".2" stop-color="#fff"/>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">` +
    `<!-- Tennessee River through Chattanooga (${piece.label}), from the USGS National Hydrography Dataset. ` +
    `Made by scripts/make-river-svg.mjs; filled with the page background color so it reads as a gap in the dots. -->` +
    `<defs><linearGradient id="g">${stops}</linearGradient>` +
    `<mask id="m"><rect width="${W}" height="${H}" fill="url(#g)"/></mask></defs>` +
    `<path mask="url(#m)" fill="#dce7ee" fill-rule="evenodd" stroke="#dce7ee" stroke-width="7" stroke-opacity=".5" stroke-linejoin="round" d="${parts.join("")}"/></svg>\n`;
  writeFileSync(path.join(root, "src/assets/img", piece.file), svg);
  console.log(`${piece.file}: ${W}x${H}, ${points} points, ${Math.round(svg.length / 1024)} KB`);
}
