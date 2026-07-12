import { pathToFileURL } from 'node:url';

const playwrightModule = process.env.PLAYWRIGHT_MODULE;
const chromiumPath = process.env.CHROMIUM_PATH;
const baseUrl = process.env.SITE_URL ?? 'http://127.0.0.1:8787';

if (!playwrightModule || !chromiumPath) {
  throw new Error('请设置 PLAYWRIGHT_MODULE 和 CHROMIUM_PATH。');
}

const { chromium } = await import(pathToFileURL(playwrightModule).href);
const browser = await chromium.launch({ executablePath: chromiumPath, headless: true });
const pages = ['/', '/harness.html', '/three-agents.html', '/tao-universe.html'];
const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (message) => {
      if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
        errors.push(message.text());
      }
    });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => {
      if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });

    for (const path of pages) {
      const response = await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
      if (!response?.ok()) throw new Error(`${path} HTTP ${response?.status()}`);
      const result = await page.evaluate(() => ({
        title: document.title,
        h1: document.querySelector('h1')?.textContent?.trim(),
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        brokenImages: [...document.images].filter((image) => !image.complete || image.naturalWidth === 0).length,
      }));
      if (!result.title || !result.h1) throw new Error(`${path} 缺少 title 或 h1`);
      if (result.overflow > 1) throw new Error(`${path} 横向溢出 ${result.overflow}px`);
      if (result.brokenImages) throw new Error(`${path} 有 ${result.brokenImages} 张图片加载失败`);
      console.log(`${viewport.name} ${path} OK`);
    }

    if (errors.length) throw new Error(`${viewport.name} 控制台错误：${errors.join(' | ')}`);
    await context.close();
  }
} finally {
  await browser.close();
}
