// Makes web-sized copies of the Claude Design uploads in src/assets/img.
// The originals (some 15 MB each) stay in ../design/uploads and are never committed.
// Run with `npm run images` after adding or replacing a source photo.
import sharp from "sharp";
import { mkdir, copyFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const uploads = path.resolve(root, "../design/uploads");
const img = path.join(root, "src/assets/img");
const fonts = path.join(root, "src/assets/fonts");

await mkdir(path.join(img, "photos"), { recursive: true });
await mkdir(path.join(img, "team"), { recursive: true });
await mkdir(fonts, { recursive: true });

const report = [];
async function write(pipeline, outFile) {
  const info = await pipeline.toFile(outFile);
  report.push(`${path.relative(root, outFile)}  ${info.width}x${info.height}  ${Math.round(info.size / 1024)} KB`);
}

// Logo: 2x the 300px it's shown at on the home page.
await write(
  sharp(path.join(uploads, "Pest_Tech_Chattanooga.png")).resize({ width: 600 }).png({ compressionLevel: 9, palette: true }),
  path.join(img, "pest-tech-chattanooga-logo.png"),
);

// Favicons: the bug from the logo (its left 1807px, antennae and all), squared up with a little room
// around it. They live at the site root, where browsers and phones look for them.
//   favicon.ico           16, 32 and 48px, for browser tabs and Google results
//   icon-192.png          for browsers that take a bigger icon
//   apple-touch-icon.png  for iPhone home screens: a white background (iOS shows transparency as black)
//                         and more room, since iOS rounds the corners off
const bugOnly = await sharp(path.join(uploads, "Pest_Tech_Chattanooga.png"))
  .extract({ left: 0, top: 0, width: 1807, height: 2410 }).png().toBuffer();
const clear = { r: 0, g: 0, b: 0, alpha: 0 };
async function bugIcon(px, room, background = clear) {
  const inner = Math.round(px * (1 - 2 * room));
  const top = Math.floor((px - inner) / 2), left = top;
  const icon = await sharp(bugOnly).resize(inner, inner, { fit: "contain", background: clear }).png().toBuffer();
  return sharp({ create: { width: px, height: px, channels: 4, background } })
    .composite([{ input: icon, top, left }]).png({ compressionLevel: 9 }).toBuffer();
}
// An .ico file is a small directory followed by the images; modern browsers and Windows read PNGs in it.
function ico(images) {
  const dir = Buffer.alloc(6 + 16 * images.length);
  dir.writeUInt16LE(1, 2);
  dir.writeUInt16LE(images.length, 4);
  let offset = dir.length;
  images.forEach(({ px, png }, i) => {
    const e = 6 + 16 * i;
    dir.writeUInt8(px, e);
    dir.writeUInt8(px, e + 1);
    dir.writeUInt16LE(1, e + 4);
    dir.writeUInt16LE(32, e + 6);
    dir.writeUInt32LE(png.length, e + 8);
    dir.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([dir, ...images.map((image) => image.png)]);
}
const favicons = await Promise.all([16, 32, 48].map(async (px) => ({ px, png: await bugIcon(px, 0.02) })));
const icons = {
  "favicon.ico": ico(favicons),
  "icon-192.png": await bugIcon(192, 0.04),
  "apple-touch-icon.png": await bugIcon(180, 0.12, "#ffffff"),
};
for (const [name, data] of Object.entries(icons)) {
  await writeFile(path.join(root, "src", name), data);
  report.push(`src/${name}  ${(data.length / 1024).toFixed(1)} KB`);
}

// Service-area maps: the design defaults to the circle outline; the vignette is the alternate.
await write(
  sharp(path.join(uploads, "Service Area Simple.jpg")).resize({ width: 1280, withoutEnlargement: true }).webp({ quality: 80 }),
  path.join(img, "service-area-map.webp"),
);
await write(
  sharp(path.join(uploads, "Service Area - Shadow.jpg")).resize({ width: 1280, withoutEnlargement: true }).webp({ quality: 80 }),
  path.join(img, "service-area-map-vignette.webp"),
);

// Photos Dan sent directly (2026-10-16). Originals live in ../photos, outside the repo.
const extra = path.resolve(root, "../photos");
// About page: an early photo of Dan with the truck and the hound, shown square at 360px.
await write(
  sharp(path.join(extra, "dan-and-truck.jpg")).rotate().resize(720, 720, { fit: "cover" }).webp({ quality: 80 }),
  path.join(img, "about-dan.webp"),
);
// Team page: the summer 2026 rafting trip. The original (1129x1500) is mostly trees up top,
// so this keeps a band of scenery above the helmets and stops below the feet.
await write(
  sharp(path.join(extra, "crew-rafting-2026.jpg")).rotate().extract({ left: 0, top: 420, width: 1129, height: 1000 })
    .resize({ width: 1000 }).webp({ quality: 72 }),
  path.join(img, "team-rafting.webp"),
);

// Crew and holiday photos: each gets a full-width copy (for a possible home hero) and a
// 400×460 portrait crop for its Team frame (assigned in src/_data/team.js).
const photos = (await readdir(uploads)).filter((f) => /\.jpe?g$/i.test(f) && !/^Service Area/i.test(f));
for (const file of photos) {
  const base = path.parse(file).name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const src = path.join(uploads, file);
  await write(
    sharp(src).rotate().resize({ width: 1280, withoutEnlargement: true }).webp({ quality: 78 }),
    path.join(img, "photos", `${base}.webp`),
  );
  await write(
    // Anchored to the top: these are seated portraits, and centered crops cut off heads.
    sharp(src).rotate().resize(400, 460, { fit: "cover", position: "north" }).webp({ quality: 80 }),
    path.join(img, "team", `${base}.webp`),
  );
}

// Nexa Bold is the only weight the approved designs use.
await copyFile(path.join(uploads, "Nexa_Bold.otf"), path.join(fonts, "Nexa_Bold.otf"));
report.push("src/assets/fonts/Nexa_Bold.otf  copied");

console.log(report.join("\n"));
