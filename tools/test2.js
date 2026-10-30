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
  await page.waitForTimeout(400);
  await page.setInputFiles('#file-input', path.join(__dirname, 'sample.pdf'));
  await page.waitForSelector('.book-card');
  await page.click('.book-card');
  await page.waitForSelector('.page-wrap canvas');
  await page.waitForTimeout(1200);

  const first = await page.evaluate(() => {
    const wraps = [...document.querySelectorAll('.page-wrap')];
    const pages = document.getElementById('pages');
    return {
      offsetTopP1: wraps[0].offsetTop,
      scrollTop: pages.scrollTop,
      rectTop: wraps[0].getBoundingClientRect().top,
      barH: document.querySelector('.reader-bar').getBoundingClientRect().height
    };
  });
  console.log('inicio de página 1:', JSON.stringify(first));

  for (const mode of ['light', 'sepia', 'night']) {
    await page.evaluate(m => document.body.setAttribute('data-pdf', m), mode);
    await page.waitForTimeout(200);
    const f = await page.evaluate(() => getComputedStyle(document.querySelector('.page-wrap canvas')).filter);
    await page.screenshot({ path: path.join(__dirname, 'shot-' + mode + '.png') });
    console.log('filtro', mode, '=', f);
  }

  // zoom
  await page.evaluate(() => document.querySelector('.icon-btn#r-more').click());
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('.row[data-act="zoomin"]').click());
  await page.waitForTimeout(900);
  const z = await page.evaluate(() => ({
    label: document.getElementById('r-page').textContent,
    wrapW: document.querySelectorAll('.page-wrap')[0].getBoundingClientRect().width,
    scaleVar: getComputedStyle(document.getElementById('pages-inner')).getPropertyValue('--scale-factor')
  }));
  console.log('zoom:', JSON.stringify(z));

  // TTS (sin motor de voz real en headless: solo verificamos que no rompa)
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.querySelector('.backdrop') && document.querySelector('.backdrop').click());
  await page.waitForTimeout(300);
  await page.evaluate(() => document.getElementById('r-tts').click());
  await page.waitForTimeout(1500);
  const ttsBar = await page.$('.tts-bar');
  console.log('barra TTS visible:', !!ttsBar, ttsBar ? await page.textContent('.tts-bar small') : '');
  if (ttsBar) await page.click('#tts-stop');
  await page.waitForTimeout(400);
  console.log('barra TTS tras detener:', !!(await page.$('.tts-bar')));

  // texto del libro extraído (TTS)
  const txt = await page.evaluate(() => {
    return new Promise(res => {
      const w = document.querySelector('.page-wrap');
      res(document.querySelector('.textLayer') ? document.querySelector('.textLayer').textContent.slice(0, 80) : 'sin capa de texto');
    });
  });
  console.log('capa de texto:', JSON.stringify(txt));

  console.log('ERRORES:', errs.length ? '\n' + errs.join('\n') : 'ninguno');
  await browser.close();
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
