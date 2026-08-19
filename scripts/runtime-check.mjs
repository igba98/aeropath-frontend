/**
 * Loads every route in a real browser and reports client-side runtime errors:
 * uncaught exceptions, console errors, hydration mismatches and failed requests.
 * A 200 response only proves the server rendered; this proves the page actually runs.
 */
import puppeteer from "puppeteer-core";

const CHROME = "/Users/ignasyb/.cache/puppeteer/chrome/mac_arm-131.0.6778.204/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const BASE = process.env.BASE ?? "http://localhost:3001";

const ROUTES = process.argv.slice(2).length ? process.argv.slice(2) : [
  "/", "/login", "/stays", "/tours", "/flights", "/transfers",
  "/stays/kubu-kubu-tented-camp", "/tours/7-day-northern-circuit-safari",
  "/transfers/jro-arusha-transfer", "/flights/dar-znz-pw401",
  "/cart", "/travellers", "/extras", "/review", "/payment",
  "/trips", "/trips/AP-3B8QX", "/trips/AP-3B8QX/amend", "/trips/AP-3B8QX/cancel",
  "/confirmation/AP-3B8QX", "/profile", "/wishlist",
  "/destinations/serengeti", "/collections/bush-and-beach", "/partner", "/partner/supplier", "/partner/supplier/products", "/partner/supplier/bookings",
  "/partner/supplier/availability", "/partner/supplier/payouts", "/partner/supplier/reviews",
  "/partner/supplier/users", "/partner/supplier/contract", "/partner/supplier/onboarding",
  "/admin", "/admin/guide", "/admin/ops/queue", "/admin/ops/bookings", "/admin/ops/manual", "/admin/ops/suppliers",
  "/admin/ops/amendments", "/admin/ops/exceptions", "/admin/ops/departures",
  "/admin/supply", "/admin/supply/onboarding", "/admin/supply/products", "/admin/supply/loading",
  "/admin/supply/rates", "/admin/supply/performance", "/admin/supply/suppliers/sup_serena",
  "/admin/finance", "/admin/finance/reconciliation", "/admin/finance/refunds", "/admin/finance/payouts",
  "/admin/finance/ledger", "/admin/finance/revenue", "/admin/finance/tax",
  "/admin/content", "/admin/content/rails", "/admin/content/promos", "/admin/content/seo",
  "/admin/content/media", "/admin/content/banners",
  "/admin/support", "/admin/support/lookup", "/admin/support/impersonate", "/admin/support/customer/AP-3B8QX",
  "/admin/settings/users", "/admin/settings/roles", "/admin/settings/role-builder", "/admin/settings/audit",
  "/admin/settings/integrations", "/admin/settings/flags", "/admin/settings/system", "/admin/settings/templates",
];

// Noise that is not a defect in this app.
const IGNORE = [
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
  /favicon\.ico/i,
  /Failed to load resource.*404.*favicon/i,
];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const results = [];

for (const route of ROUTES) {
  const page = await browser.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push({ kind: "uncaught", text: String(e.message).split("\n")[0] }));
  page.on("console", (m) => {
    if (m.type() !== "error" && m.type() !== "warning") return;
    const text = m.text();
    if (IGNORE.some((r) => r.test(text))) return;
    problems.push({ kind: m.type(), text: text.slice(0, 220) });
  });
  page.on("requestfailed", (r) => {
    const u = r.url();
    // Next cancels its own speculative prefetches on navigation; that is not a defect.
    if (r.failure()?.errorText === "net::ERR_ABORTED") return;
    if (IGNORE.some((rx) => rx.test(u))) return;
    problems.push({ kind: "requestfailed", text: `${u} — ${r.failure()?.errorText}` });
  });
  page.on("response", (r) => {
    if (r.status() < 400) return;
    const u = r.url();
    if (IGNORE.some((rx) => rx.test(u))) return;
    problems.push({ kind: `http${r.status()}`, text: u });
  });

  try {
    await page.goto(BASE + route, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise((r) => setTimeout(r, 350)); // let hydration settle
    const bodyLen = await page.evaluate(() => document.body.innerText.trim().length);
    if (bodyLen < 40) problems.push({ kind: "empty", text: `body has only ${bodyLen} chars of text` });
  } catch (e) {
    problems.push({ kind: "navigation", text: String(e.message).split("\n")[0] });
  }
  await page.close();
  results.push({ route, problems });
}

await browser.close();

const bad = results.filter((r) => r.problems.length);
for (const r of bad) {
  console.log(`\n✗ ${r.route}`);
  const seen = new Set();
  for (const p of r.problems) {
    const k = p.kind + p.text;
    if (seen.has(k)) continue;
    seen.add(k);
    console.log(`    [${p.kind}] ${p.text}`);
  }
}
console.log(`\n${results.length} routes checked · ${bad.length} with problems · ${results.length - bad.length} clean`);
process.exit(bad.length ? 1 : 0);
