import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { browserPath } from '../server/files.mjs';

const browser = await chromium.launch({ headless: true, ...(browserPath() ? { executablePath: browserPath() } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
const page = await context.newPage();
const errors = [], externalRequests = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4317/')) externalRequests.push(request.url()); });
const pointer = page.locator('.moon-pointer-layer');
try {
  await page.goto('http://127.0.0.1:4317');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.querySelector('.title-reveal')?.getAttribute('style')?.includes('-20%'));
  assert.equal(await pointer.getAttribute('data-active'), 'false', 'no phantom cursor before mouse input');
  await page.mouse.move(560, 295);
  await page.waitForTimeout(180);
  assert.equal(await pointer.getAttribute('data-active'), 'true');
  const tip = await page.locator('.moon-pointer-tip').evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y }; });
  assert.ok(Math.abs(tip.x - 557) < .1 && Math.abs(tip.y - 292) < .1, 'cursor hotspot stays exactly at mouse coordinates');
  assert.equal(await pointer.evaluate(el => getComputedStyle(el).pointerEvents), 'none', 'decorative overlay never captures clicks');
  assert.equal(await page.locator('.moon-pointer-light').evaluate(el => getComputedStyle(el).opacity), '1');
  await page.screenshot({ path: '../慢慢月光鼠标预览-v0.3.png', fullPage: true });

  await page.getByRole('button', { name: '连接我的模型' }).hover();
  assert.equal(await pointer.getAttribute('data-hover'), 'true');
  await page.getByRole('button', { name: '连接我的模型' }).click();
  await page.getByRole('dialog').waitFor();
  assert.ok(await page.locator('.moon-click-bloom').count() > 0, 'click creates ripple and sparks');
  await page.getByLabel('API Key').hover();
  assert.equal(await pointer.getAttribute('data-active'), 'false', 'inputs restore native cursor');
  assert.equal(await page.getByLabel('API Key').evaluate(el => getComputedStyle(el).cursor), 'text');
  await page.getByLabel('API Key').fill('pointer-test-not-a-real-key');
  assert.ok(!(await page.evaluate(() => JSON.stringify(localStorage))).includes('pointer-test-not-a-real-key'));
  await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(await pointer.getAttribute('data-active'), 'false');

  await page.mouse.move(560, 295);
  await page.locator('.page-heading').evaluate(el => {
    for (let i = 0; i < 20; i++) el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse', button: 0, clientX: 560, clientY: 295 }));
  });
  assert.ok(await page.locator('.moon-click-bloom').count() <= 6, 'rapid clicks keep transient DOM bounded');
  await page.waitForFunction(() => document.querySelectorAll('.moon-click-bloom').length === 0, undefined, { timeout: 2500 });
  assert.equal(await page.locator('.moon-click-bloom').count(), 0, 'finished particles are removed');
  await page.keyboard.press('Tab');
  assert.equal(await pointer.getAttribute('data-active'), 'false', 'keyboard navigation restores native cursor');
  await page.mouse.move(570, 305);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal(await pointer.getAttribute('data-active'), 'false', 'window exit cannot leave a stale cursor');

  await page.mouse.move(560, 295);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.mouse.move(575, 300);
  assert.equal(await pointer.evaluate(el => getComputedStyle(el).display), 'none');
  assert.equal(await page.evaluate(() => document.body.classList.contains('moon-pointer-active')), false);
  await page.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'active' });
  await page.mouse.move(580, 310);
  assert.equal(await pointer.evaluate(el => getComputedStyle(el).display), 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'none' });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.mouse.move(585, 315);
  assert.equal(await pointer.getAttribute('data-active'), 'true');

  await page.getByRole('button', { name: '先体验一份示例' }).click();
  await page.locator('#resume-text').hover();
  assert.equal(await pointer.getAttribute('data-active'), 'false', 'source resume editing stays native');
  assert.equal(await page.locator('#resume-text').evaluate(el => getComputedStyle(el).cursor), 'text');
  await page.getByRole('button', { name: '下一步，看清目标' }).click();
  await page.getByRole('button', { name: '开始慢慢打磨' }).click();
  await page.locator('.diff-grid').first().hover();
  assert.equal(await pointer.getAttribute('data-active'), 'false', 'before/after resume text can be selected normally');
  await page.getByRole('button', { name: '整理我的简历' }).click();
  await page.locator('.resume-paper').hover();
  assert.equal(await pointer.getAttribute('data-active'), 'false', 'export preview keeps native cursor');
  assert.deepEqual(externalRequests, [], 'fonts and visuals stay entirely local');
  assert.deepEqual(errors, []);

  const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  try {
    const phone = await touch.newPage(); await phone.goto('http://127.0.0.1:4317');
    await phone.getByRole('button', { name: '连接我的模型' }).tap();
    await phone.getByRole('dialog').waitFor();
    assert.equal(await phone.locator('.moon-pointer-layer').evaluate(el => getComputedStyle(el).display), 'none');
    assert.equal(await phone.evaluate(() => document.body.classList.contains('moon-pointer-active')), false);
  } finally { await touch.close(); }
  console.log('Pointer checks passed: precise hotspot, hover/click feedback, bounded particle cleanup, native editing, keyboard, blur, reduced motion, forced colors, touch and local-only assets.');
} finally { await context.close(); await browser.close(); }
