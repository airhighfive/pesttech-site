// Builds the background river: the Tennessee River through Chattanooga, drawn a shade lighter than the page
// background so it shows up as a pale band with no dots in the dot dither (see site.css).
//
// Data: USGS National Hydrography Dataset (public domain). Through town the river is a StreamRiver polygon
// (ftype 460) in the "Area - Large Scale" layer (9). Below town it becomes Nickajack Lake, and above
// Chickamauga Dam it's Chickamauga Lake, both in the "Waterbody - Large Scale" layer (12). To refresh it,
// download both layers as GeoJSON for the same box:
//   https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/9/query
//   ?where=1=1&geometry=-85.42,34.98,-85.18,35.13&geometryType=esriGeometryEnvelope
//   &inSR=4326&outSR=4326&returnGeometry=true&outFields=*&f=geojson
// (the same with /12/ for the lakes), then run:
//   node scripts/make-river-svg.mjs <area.geojson> <waterbody.geojson>
//
// The map has one fixed scale, so a wider window shows more of the river instead of a bigger one. Williams
// Island lands just left of the page, and at this zoom downtown sits right behind the middle of it. It's cut
// in two at the middle, river-west.svg (Williams Island, Moccasin Bend, the gorge) and river-east.svg (up to
// the dam and the lake). Both are the same size, so site.css lays them over each other and fades them in turn.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [areaFile, waterbodyFile, outDir = path.join(root, "src/assets/img")] = process.argv.slice(2);
if (!waterbodyFile) throw new Error("Usage: node scripts/make-river-svg.mjs <area.geojson> <waterbody.geojson>");

const PX_PER_KM = 130;
const PAGE_HALF = 320; // the page is 640px wide, centered
const GAP = 16; // between Williams Island's east bank and the page
const MID_LAT = 35.08; // the latitude at the middle of the window
const FILL = "#e4ecf1"; // a shade lighter than the page background, #dce7ee
const W = 3000, H = 1500; // big enough for a 2560 x 1440 window; past that the river fades out
const ky = PX_PER_KM * 110.95; // px per degree of latitude
const kx = PX_PER_KM * 111.32 * Math.cos((MID_LAT * Math.PI) / 180);

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

const polygonsOf = (g) => (g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : []);
const km2 = (ring) => {
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++) s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return (Math.abs(s / 2) * kx * ky) / PX_PER_KM ** 2;
};
const ftype = (f) => Number(f.properties.ftype ?? f.properties.FTYPE);

// The river through town is the biggest StreamRiver polygon (the smaller ones are creeks). The lakes are the
// two big reservoirs in the waterbody layer, Nickajack below town and Chickamauga above the dam.
const river = JSON.parse(readFileSync(areaFile, "utf8")).features
  .filter((f) => ftype(f) === 460)
  .flatMap((f) => polygonsOf(f.geometry))
  .sort((a, b) => km2(b[0]) - km2(a[0]))[0];
const lakes = JSON.parse(readFileSync(waterbodyFile, "utf8")).features
  .flatMap((f) => polygonsOf(f.geometry))
  .filter((poly) => km2(poly[0]) > 5);
if (!river || lakes.length < 2) throw new Error("Couldn't find the river and both lakes in the data");

// Williams Island is the river's biggest island. Find the east bank of the channel beside it.
const island = river.slice(1).sort((a, b) => km2(b) - km2(a))[0];
const [iMinLat, iMaxLat] = [Math.min(...island.map((p) => p[1])), Math.max(...island.map((p) => p[1]))];
const iMaxLon = Math.max(...island.map((p) => p[0]));
const eastBank = Math.max(...river[0].filter(([lon, lat]) => lat > iMinLat && lat < iMaxLat && lon > iMaxLon && lon < iMaxLon + 0.01).map((p) => p[0]));

// Screen position relative to the middle of the window; SVG position adds W/2, H/2.
const x0 = W / 2 - PAGE_HALF - GAP - eastBank * kx;
const project = ([lon, lat]) => [x0 + lon * kx, H / 2 - (lat - MID_LAT) * ky];
for (const [name, ll] of Object.entries({ "Williams Island": [iMaxLon, (iMinLat + iMaxLat) / 2], downtown: [-85.3097, 35.0456], "Chickamauga Dam": [-85.2293, 35.1033] })) {
  const [x, y] = project(ll);
  console.log(`${name}: ${Math.round(x - W / 2)}px across, ${Math.round(y - H / 2)}px down from the middle of the window`);
}

const rings = [river, ...lakes].flat().map((ring) => ring.map(project));
const pad = 20; // clip a little outside the picture so cut edges never show
const PIECES = [
  { file: "river-west.svg", box: { x0: -pad, x1: W / 2, y0: -pad, y1: H + pad }, label: "Williams Island, Moccasin Bend and the gorge" },
  { file: "river-east.svg", box: { x0: W / 2, x1: W + pad, y0: -pad, y1: H + pad }, label: "up to Chickamauga Dam and the lake" },
];
for (const piece of PIECES) {
  const parts = [];
  let points = 0;
  for (const ring of rings) {
    const clipped = simplifyRing(clipRing(ring, piece.box), 1.2);
    if (clipped.length < 3) continue;
    points += clipped.length;
    parts.push("M" + clipped.map(([x, y]) => `${Math.round(x)} ${Math.round(y)}`).join("L") + "Z");
  }
  // Fade the outer edges, so a window bigger than the map doesn't end in a hard line.
  const stops = `<stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".06" stop-color="#fff"/>` +
    `<stop offset=".94" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<!-- Tennessee River through Chattanooga (${piece.label}), from the USGS National Hydrography Dataset. ` +
    `Made by scripts/make-river-svg.mjs; it covers the dots, so it reads as a pale band in them. -->` +
    `<defs><linearGradient id="h">${stops}</linearGradient><linearGradient id="v" x2="0" y2="1">${stops}</linearGradient>` +
    `<mask id="mh"><rect width="${W}" height="${H}" fill="url(#h)"/></mask><mask id="mv"><rect width="${W}" height="${H}" fill="url(#v)"/></mask></defs>` +
    `<g mask="url(#mv)"><path mask="url(#mh)" fill="${FILL}" fill-rule="evenodd" d="${parts.join("")}"/></g></svg>\n`;
  writeFileSync(path.join(outDir, piece.file), svg);
  console.log(`${piece.file}: ${W}x${H}, ${points} points, ${Math.round(svg.length / 1024)} KB`);
}
