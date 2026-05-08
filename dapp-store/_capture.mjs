import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEDIA = path.join(__dirname, "media");

const SHOTS = [
  { name: "screenshot-home.png", url: "https://sol.new/" },
  { name: "screenshot-launches.png", url: "https://sol.new/whats-new" },
  { name: "screenshot-docs.png", url: "https://sol.new/docs" },
];

const VIEWPORT = { width: 1080, height: 1920 };
const DEVICE_SCALE = 1;

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
});

const ctx = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: DEVICE_SCALE,
  isMobile: true,
  userAgent:
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
  colorScheme: "dark",
});

// Dismiss the welcome modal before any page in this context loads.
await ctx.addInitScript(() => {
  try { localStorage.setItem("sol-new-welcomed", "1"); } catch {}
});

for (const shot of SHOTS) {
  const page = await ctx.newPage();
  console.log("→", shot.url);
  await page.goto(shot.url, { waitUntil: "networkidle", timeout: 45_000 });
  // Hide the install prompt and any toaster overlays for clean shots.
  await page.addStyleTag({
    content: `
      [class*="install-prompt"], [data-sonner-toaster], .sonner-toast { display: none !important; }
    `,
  });
  await page.waitForTimeout(800);
  const out = path.join(MEDIA, shot.name);
  await page.screenshot({ path: out, fullPage: false });
  console.log("  ✓", out);
  await page.close();
}

// Banners: render local HTML files at their declared dimensions.
const BANNERS = [
  { html: "_banner.html",          out: "banner.png",          w: 1920, h: 1080 },
  { html: "_banner-1200x600.html", out: "banner-1200x600.png", w: 1200, h: 600  },
];
for (const b of BANNERS) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: b.w, height: b.h });
  const bannerUrl = "file://" + path.join(MEDIA, b.html);
  console.log("→", bannerUrl);
  await page.goto(bannerUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const out = path.join(MEDIA, b.out);
  await page.screenshot({
    path: out,
    fullPage: false,
    clip: { x: 0, y: 0, width: b.w, height: b.h },
  });
  console.log("  ✓", out);
  await page.close();
}

await browser.close();
console.log("done.");
