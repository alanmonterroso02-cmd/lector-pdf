/* Prueba de humo con Edge (playwright-core) */
const { chromium } = require('playwright-core');
const path = require('path');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const SAMPLE = path.join(__dirname, 'sample.pdf');

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 870 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto('http://localhost:8899/', { waitUntil: 'load' });
  await page.waitForTimeout(600);

  console.log('1. app cargada, biblioteca vacía visible:', await page.isVisible('#empty-state'));

  await page.setInputFiles('#file-input', SAMPLE);
  await page.waitForSelector('.book-card', { timeout: 20000 });
  console.log('2. libro importado:', await page.textContent('.book-title'));

  await page.click('.book-card');
  await page.waitForSelector('.page-wrap canvas', { timeout: 25000 });
  await page.waitForTimeout(1200);

  const info = await page.evaluate(() => {
    const c = document.querySelector('.page-wrap canvas');
    const wraps = document.querySelectorAll('.page-wrap').length;
    return {
      canvasW: c ? c.width : 0,
      canvasH: c ? c.height : 0,
      wraps,
      pageLabel: document.getElementById('r-page-label').textContent,
      textLayer: !!document.querySelector('.textLayer span'),
      sliderMax: document.getElementById('r-slider').max
    };
  });
  console.log('3. lector:', JSON.stringify(info));

  await page.screenshot({ path: path.join(__dirname, 'shot-lector.png') });

  // índice
  await page.click('#r-toc');
  await page.waitForTimeout(500);
  const toc = await page.$$eval('.toc-item', els => els.map(e => e.textContent.trim()));
  console.log('4. índice:', JSON.stringify(toc));
  await page.screenshot({ path: path.join(__dirname, 'shot-toc.png') });
  const tocItem = await page.$('.toc-item[data-page]');
  if (tocItem) {
    await tocItem.click();
    await page.waitForTimeout(900);
  }

  // búsqueda
  await page.click('#r-search');
  await page.waitForTimeout(300);
  await page.fill('#pdf-q', 'lectura');
  await page.waitForTimeout(2500);
  const found = await page.textContent('#pdf-results');
  console.log('5. búsqueda:', (found || '').slice(0, 120).replace(/\s+/g, ' '));
  await page.screenshot({ path: path.join(__dirname, 'shot-search.png') });
  await page.keyboard.press('Escape');

  // cerrar hoja y modo noche
  await page.evaluate(() => document.querySelector('.backdrop') && document.querySelector('.backdrop').click());
  await page.waitForTimeout(400);
  await page.click('#r-more');
  await page.waitForTimeout(400);
  await page.click('.row[data-act="theme"]');
  await page.waitForTimeout(500);
  const mode = await page.getAttribute('body', 'data-pdf');
  console.log('6. modo de página:', mode);
  await page.evaluate(() => document.querySelector('.backdrop').click());
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(__dirname, 'shot-noche.png') });

  // salto de página con slider
  await page.evaluate(() => {
    const s = document.getElementById('r-slider');
    s.value = 4;
    s.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(1500);
  console.log('7. salto de página:', await page.textContent('#r-page'));

  // progreso guardado
  await page.click('#r-back');
  await page.waitForTimeout(1200);
  const pct = await page.textContent('.cover .pct').catch(() => 'sin badge');
  console.log('8. progreso en tarjeta:', pct);
  await page.screenshot({ path: path.join(__dirname, 'shot-biblioteca.png') });

  console.log('ERRORES:', errors.length ? '\n' + errors.join('\n') : 'ninguno');
  await browser.close();
})().catch(e => { console.error('FALLO TEST:', e.message); process.exit(1); });
