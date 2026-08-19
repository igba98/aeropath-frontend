import puppeteer from "puppeteer-core";
const CHROME = "/Users/ignasyb/.cache/puppeteer/chrome/mac_arm-131.0.6778.204/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const BASE = process.env.BASE ?? "http://localhost:3001";
const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const page = await b.newPage();
await page.setViewport({ width: 1440, height: 1100 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.split("\n")[0]));
page.on("console", (m) => { if (m.type() === "error" && !/DevTools|Fast Refresh/.test(m.text())) errors.push(m.text().slice(0, 140)); });

const click = async (text) => {
  const ok = await page.evaluate((t) => {
    const el = [...document.querySelectorAll("button,a")].find((n) => n.innerText?.trim().includes(t));
    if (el) { el.click(); return true; } return false;
  }, text);
  if (!ok) console.log("  ! not found:", text);
  await new Promise((r) => setTimeout(r, 900));
  return ok;
};

await page.goto(BASE + "/flights?from=DAR&to=ZNZ&dateFrom=2026-09-01&adults=2", { waitUntil: "networkidle2" });
await click("Select");                       // pick a fare
await new Promise((r) => setTimeout(r, 600));
await click("Add to trip");
await click("Continue");                     // to travellers
await page.goto(BASE + "/extras", { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: "/tmp/shots/flow-extras.png" });
if (await click("Choose seats")) {
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: "/tmp/shots/flow-seatmap.png" });
  await click("Baggage");
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: "/tmp/shots/flow-baggage.png" });
}
console.log(errors.length ? "ERRORS:\n  " + [...new Set(errors)].join("\n  ") : "no runtime errors");
await b.close();
