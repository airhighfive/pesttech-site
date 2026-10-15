// Makes web-sized copies of the Claude Design uploads in src/assets/img.
// The originals (some 15 MB each) stay in ../design/uploads and are never committed.
// Run with `npm run images` after adding or replacing a source photo.
import sharp from "sharp";
import { mkdir, copyFile, readdir } from "node:fs/promises";
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

// Service-area maps: the design defaults to the circle outline; the vignette is the alternate.
await write(
  sharp(path.join(uploads, "Service Area Simple.jpg")).resize({ width: 1280, withoutEnlargement: true }).webp({ quality: 80 }),
  path.join(img, "service-area-map.webp"),
);
await write(
  sharp(path.join(uploads, "Service Area - Shadow.jpg")).resize({ width: 1280, withoutEnlargement: true }).webp({ quality: 80 }),
  path.join(img, "service-area-map-vignette.webp"),
);

// Crew and holiday photos aren't assigned to anyone yet, so each gets a full-width copy
// (for the home hero or About) and a 400×460 portrait crop (for a Team frame).
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
