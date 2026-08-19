import puppeteer from "puppeteer-core";
const CHROME = "/Users/ignasyb/.cache/puppeteer/chrome/mac_arm-131.0.6778.204/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const BASE = process.env.BASE ?? "http://localhost:3001";
const persona = process.env.AS;
const routes = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const page = await b.newPage();
await page.setViewport({ width: 1440, height: 1000 });

if (persona) {
  await page.goto(BASE + "/login", { waitUntil: "networkidle2" });
  await page.evaluate((n) => {
    const el = [...document.querySelectorAll("button,a")].find((x) => x.innerText?.includes(n));
    el?.click();
  }, persona);
  await new Promise((r) => setTimeout(r, 900));
}

let bad = 0;
for (const r of routes) {
  const problems = [];
  const onErr = (e) => problems.push("uncaught: " + String(e.message).split("\n")[0]);
  const onMsg = (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/DevTools|Fast Refresh|favicon/.test(t)) return;
    problems.push("console: " + t.slice(0, 200));
  };
  page.on("pageerror", onErr); page.on("console", onMsg);
  await page.goto(BASE + r, { waitUntil: "networkidle2", timeout: 30000 });
  await new Promise((x) => setTimeout(x, 500));
  page.off("pageerror", onErr); page.off("console", onMsg);
  if (problems.length) { bad++; console.log(`✗ ${r}`); [...new Set(problems)].forEach((p) => console.log("   " + p)); }
}
console.log(`\n${routes.length} routes as ${persona ?? "guest"} · ${bad} with problems`);
await b.close();
