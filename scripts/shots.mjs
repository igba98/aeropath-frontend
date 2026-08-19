import puppeteer from "puppeteer-core";
const CHROME = "/Users/ignasyb/.cache/puppeteer/chrome/mac_arm-131.0.6778.204/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const BASE = process.env.BASE ?? "http://localhost:3001";
const OUT = process.env.OUT ?? "/tmp/shots";
const routes = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
for (const r of routes) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  // Sign in through the real login screen, so gated consoles render their content.
  const persona = process.env.AS;
  if (persona) {
    await page.goto(BASE + "/login", { waitUntil: "networkidle2" });
    const clicked = await page.evaluate((name) => {
      const el = [...document.querySelectorAll("button, a")].find((n) => n.innerText?.includes(name));
      if (el) { el.click(); return true; }
      return false;
    }, persona);
    if (!clicked) console.warn("  persona not found:", persona);
    await new Promise((x) => setTimeout(x, 900));
  }
  await page.goto(BASE + r, { waitUntil: "networkidle2", timeout: 30000 });
  await new Promise((x) => setTimeout(x, 600));
  const name = r === "/" ? "home" : r.replace(/^\//, "").replace(/[/?=&]/g, "_");
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(name);
  await page.close();
}
await browser.close();
