const { chromium } = require('playwright-core');
const path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 870 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });

  await page.goto('http://localhost:8899/');
  await page.waitForTimeout(500);

  await page.click('#btn-settings');
  await page.waitForTimeout(400);
  console.log('ajustes abiertos:', await page.isVisible('.sheet'));
  const sub = await page.textContent('#voice-sub');
  console.log('resumen de voz:', sub);
  await page.screenshot({ path: path.join(__dirname, 'shot-ajustes.png') });

  await page.click('#voice-row');
  await page.waitForTimeout(1200);
  const voiceSheet = await page.textContent('.sheet h3');
  const listTxt = (await page.textContent('#voice-list')).replace(/\s+/g, ' ').slice(0, 160);
  console.log('hoja:', voiceSheet, '| lista:', listTxt);
  await page.screenshot({ path: path.join(__dirname, 'shot-voces.png') });

  const auto = await page.$('[data-act="auto"]');
  if (auto) { await auto.click(); await page.waitForTimeout(600); }
  console.log('sin errores de clic:', true);

  console.log('ERRORES:', errs.length ? '\n' + errs.join('\n') : 'ninguno');
  await browser.close();
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
