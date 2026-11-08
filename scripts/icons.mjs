// public/icons/icon.svg → PNG 아이콘 (설치된 Chrome으로 렌더링)
import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';

const svg = await readFile(new URL('../public/icons/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
const out = [
  ['icon-192.png', 192, 0],
  ['icon-512.png', 512, 0],
  ['apple-touch-icon.png', 180, 0],
  ['icon-maskable-512.png', 512, 0.12],
];
for (const [name, size, pad] of out) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * (1 - pad * 2));
  // maskable: 안전 영역을 위해 배경을 꽉 채우고 안쪽에 아이콘을 둔다
  const bg = pad ? '#3b3fb6' : 'transparent';
  const body = svg.replace('rx="112"', pad ? 'rx="0"' : 'rx="112"');
  await page.setContent(
    `<html><body style="margin:0;background:${bg};display:grid;place-items:center;width:${size}px;height:${size}px">` +
      `<div style="width:${inner}px;height:${inner}px">${body.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`,
  );
  await page.screenshot({ path: new URL(`../public/icons/${name}`, import.meta.url).pathname, omitBackground: !pad });
  console.log('wrote', name);
}
await browser.close();
