/**
 * The supplied photography is 2–21 MB per file (~173 MB total). This app's premise is a slow,
 * expensive connection, so nothing ships at that weight: every photo becomes a WebP at three
 * widths under a short, stable name, and every airline logo a small WebP.
 *
 * Re-run with `node scripts/optimize-images.mjs` after adding files to public/hotels or
 * public/flight-logs.
 */
import sharp from "sharp";
import { readdir, mkdir, stat } from "node:fs/promises";
import { join, parse } from "node:path";

/** Long stock filenames → short, stable asset names. */
const PHOTOS = {
  "beautiful-beach-chairs-sandy-beach-near-sea-summer-holiday-vacation-concept": "beach-chairs",
  "beautiful-promenade-with-palm-trees-marmaris": "palm-promenade",
  "empty-wood-chair-table-outdoor-patio-with-beautiful-tropical-beach-sea": "beach-patio",
  "hotel-pool": "hotel-pool",
  "miami-south-beach-street-view-with-water-reflections-night": "city-night",
  "palms-rocks-against-swimming-pool-morning-mediterranean-summer-resort-hotel-turkey-bodrum": "palms-pool",
  "placa-del-ajuntament-summer-evening-valencia": "town-square-evening",
  "placa-del-ajuntament-valencia-spain": "town-square",
  "pool-villa-are-located-heart-resort": "pool-villa",
  "popular-resort-amara-dolce-vita-luxury-hotel-with-pools-water-parks-recreational-area-along-sea-coast-turkey-sunset-tekirova-kemer": "resort-sunset",
  "portrait-beautiful-young-asian-woman-happy-smile-relax-around-neary-beach-sea": "beach-guest",
  "rest-sunshine-atoll-bungalow-holiday": "atoll-bungalow",
  "sea-house-resort-exotic-sky": "sea-house",
  "sky-summer-resort-nobody-spa": "resort-spa",
  "swimming-pool-beach-luxury-hotel-type-entertainment-complex-amara-dolce-vita-luxury-hotel-resort-tekirova-kemer-turkey": "beach-pool",
  "swimming-pool": "swimming-pool",
  "type-entertainment-complex-popular-resort-with-pools-water-parks-turkey-with-more-than-5-million-visitors-year-amara-dolce-vita-luxury-hotel-resort-tekirova-kemer": "resort-pools",
};

/** Logo filenames → carrier slug. */
const LOGOS = {
  "precision air": "precision-air",
  "coastal air": "coastal-aviation",
  "air tanzania": "air-tanzania",
  "kenyan airways": "kenya-airways",
  "ethopian": "ethiopian-airlines",
  "british": "british-airways",
  "Qatar-Airways-Logo": "qatar-airways",
  "Emirates-Logo": "emirates",
  "TURKISH-AIRLINES-logo": "turkish-airlines",
  "Qantas-Airline-Logo": "qantas",
  "Swiss-International-Air-Lines-logo": "swiss",
  "luftthansa": "lufthansa",
  "ryanair": "ryanair",
  "southe african airways": "south-african-airways",
  "srilanks": "srilankan",
  "virgin": "virgin-atlantic",
  "air-canada": "air-canada",
  "air-india": "air-india",
};

const mb = (n) => (n / 1024 / 1024).toFixed(1);

async function run(srcDir, outDir, names, { widths, fit, quality }) {
  await mkdir(outDir, { recursive: true });
  const files = (await readdir(srcDir)).filter((f) => /\.(jpe?g|png)$/i.test(f));
  let before = 0, after = 0, skipped = [];
  for (const file of files) {
    const base = parse(file).name;
    const name = names[base];
    if (!name) { skipped.push(file); continue; }
    const src = join(srcDir, file);
    before += (await stat(src)).size;
    for (const w of widths) {
      const out = join(outDir, widths.length > 1 ? `${name}-${w}.webp` : `${name}.webp`);
      await sharp(src).resize({ width: w, fit, withoutEnlargement: true }).webp({ quality }).toFile(out);
      after += (await stat(out)).size;
    }
  }
  console.log(`${srcDir} → ${outDir}: ${files.length - skipped.length} files · ${mb(before)} MB → ${mb(after)} MB`);
  if (skipped.length) console.log(`  unmapped (add to the table above): ${skipped.join(", ")}`);
}

await run("public/hotels", "public/img/stays", PHOTOS, { widths: [480, 960, 1600], fit: "cover", quality: 72 });
await run("public/flight-logs", "public/img/airlines", LOGOS, { widths: [160], fit: "inside", quality: 90 });
