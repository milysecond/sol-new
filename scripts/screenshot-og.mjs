import { chromium } from 'playwright';

const pages = ['og-main', 'og-token', 'og-nft', 'og-multisig', 'og-wallet'];
const outputNames = ['og.png', 'og-token.png', 'og-nft.png', 'og-multisig.png', 'og-wallet.png'];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 4000 } });
await page.goto('http://localhost:3333/og-gen.html', { waitUntil: 'networkidle' });

for (let i = 0; i < pages.length; i++) {
  const el = page.locator(`#${pages[i]}`);
  await el.screenshot({ path: `public/${outputNames[i]}` });
  console.log(`Saved ${outputNames[i]}`);
}

await browser.close();
