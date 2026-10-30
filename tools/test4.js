const { chromium } = require('playwright-core');
const path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

(async () => {
  const browser = await chromium.launch({
    executablePath: EDGE,
    headless: true,
    args: ['--use-fake-device-for-media-stream']
  });
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
  await page.waitForTimeout(1000);

  // iniciar lectura
  await page.click('#r-tts');
  await page.waitForTimeout(2000);
  const s1 = await page.evaluate(() => ({
    bar: !!document.querySelector('.tts-bar'),
    sub: document.getElementById('tts-sub') ? document.getElementById('tts-sub').textContent : '',
    title: document.getElementById('tts-title') ? document.getElementById('tts-title').textContent : '',
    rects: document.querySelectorAll('.hl-rect').length,
    speakSupported: !!(window.speechSynthesis)
  }));
  console.log('1. leyendo:', JSON.stringify(s1));
  await page.screenshot({ path: path.join(__dirname, 'shot-subrayado.png') });

  // pausa
  await page.click('#tts-play');
  await page.waitForTimeout(600);
  const s2 = await page.evaluate(() => ({
    title: document.getElementById('tts-title').textContent,
    sub: document.getElementById('tts-sub').textContent,
    icon: document.getElementById('tts-play').textContent
  }));
  console.log('2. pausa:', JSON.stringify(s2));
  const subPaused1 = s2.sub;
  await page.waitForTimeout(1500);
  const subPaused2 = await page.textContent('#tts-sub');
  console.log('3. sigue igual en pausa:', subPaused1 === subPaused2, '|', subPaused2);

  // adelantar frase
  await page.click('#tts-next');
  await page.waitForTimeout(600);
  const s3 = await page.evaluate(() => ({
    sub: document.getElementById('tts-sub').textContent,
    rects: document.querySelectorAll('.hl-rect').length
  }));
  console.log('4. adelantar:', JSON.stringify(s3));

  // atrasar frase
  await page.click('#tts-prev');
  await page.waitForTimeout(600);
  console.log('5. atrasar:', await page.textContent('#tts-sub'));

  // reanudar
  await page.click('#tts-play');
  await page.waitForTimeout(1500);
  console.log('6. reanudado:', await page.textContent('#tts-title'));

  // detener
  await page.click('#tts-stop');
  await page.waitForTimeout(500);
  const s4 = await page.evaluate(() => ({
    bar: !!document.querySelector('.tts-bar'),
    rects: document.querySelectorAll('.hl-rect').length
  }));
  console.log('7. detenido (sin barra ni subrayado):', JSON.stringify(s4));

  console.log('ERRORES:', errs.length ? '\n' + errs.join('\n') : 'ninguno');
  await browser.close();
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
