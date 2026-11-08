// 가상 일정 3종의 추천 결과 스크린샷 (폰 화면 크기)
// 사용: npm run build && npm run screenshots
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

const PORT = 4321;
const BASE = `http://localhost:${PORT}`;
const DATE = '2026-11-09';
const OUT = new URL('../docs/screenshots/', import.meta.url).pathname;
await mkdir(OUT, { recursive: true });

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((resolve, reject) => {
  server.stdout.on('data', (d) => String(d).includes(String(PORT)) && resolve());
  server.on('exit', (c) => reject(new Error(`preview exited ${c}`)));
  setTimeout(() => reject(new Error('preview timeout')), 20000);
});

const browser = await chromium.launch({ channel: 'chrome' });
const shot = async (name, url, { dark = false, act } = {}) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'ko-KR',
    colorScheme: dark ? 'dark' : 'light',
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${url}`);
  await page.waitForSelector('main .card');
  // 전체 페이지 캡처에서 고정 하단 탭이 본문을 덮지 않도록 캡처 때만 페이지 맨 아래에 둔다
  await page.addStyleTag({ content: '.app{position:relative}.tabs{position:absolute}.sticky-actions{position:static}.top{position:static}' });
  if (act) await act(page);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}${name}.png`, fullPage: true });
  console.log('saved', `docs/screenshots/${name}.png`);
  await ctx.close();
};

try {
  for (const id of ['day', 'night', 'mixed']) {
    await shot(`${id}-today`, `/?demo=${id}&date=${DATE}&tab=today`);
    await shot(`${id}-week`, `/?demo=${id}&date=${DATE}&tab=week`);
  }
  await shot('night-today-dark', `/?demo=night&date=${DATE}&tab=today`, { dark: true });
  // 출처 칩 펼침
  await shot('night-today-sources', `/?demo=night&date=${DATE}&tab=today`, {
    act: async (p) => {
      await p.locator('.tone-caffeine .chip-row').first().click();
      await p.locator('.tone-nap .chip-row').first().click();
    },
  });
  // 겹친 블록 오류
  await shot('input-overlap-error', `/?demo=night&date=${DATE}&tab=input`, {
    act: async (p) => {
      await p.getByRole('radio', { name: '잘 수 없는 시간' }).click();
      await p.locator('input[type=date]').nth(1).fill(DATE);
      await p.locator('input[type=time]').nth(0).fill('05:00');
      await p.locator('input[type=time]').nth(1).fill('07:00');
      await p.getByRole('button', { name: '저장', exact: true }).click();
      await p.waitForSelector('.errors');
    },
  });
  // AI 동의 → 보낼 내용 미리보기 (실제 전송은 하지 않음)
  await shot('ai-consent', `/?demo=mixed&date=${DATE}&tab=settings`, {
    act: async (p) => {
      await p.locator('.switch input').click();
      await p.waitForSelector('.consent');
      await p.locator('.consent').scrollIntoViewIfNeeded();
    },
  });
  await shot('ai-preview', `/?demo=mixed&date=${DATE}&tab=settings`, {
    act: async (p) => {
      await p.locator('.switch input').click();
      await p.getByRole('button', { name: '동의하고 켜기' }).click();
      await p.locator('nav.tabs').getByRole('button', { name: '주간', exact: true }).click();
      await p.getByRole('button', { name: '보낼 내용 확인' }).click();
      await p.locator('.preview details summary').click();
    },
  });
} finally {
  await browser.close();
  server.kill();
}
