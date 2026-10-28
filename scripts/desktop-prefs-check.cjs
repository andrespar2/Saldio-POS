const { chromium } = require('playwright-core');

(async () => {
  const mode = process.argv[2] || 'read';
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9224');
  const pages = browser.contexts().flatMap((c) => c.pages());
  const page = pages.find((p) => p.url().startsWith('saldio://')) || pages[0];
  if (!page) throw new Error('Ventana no encontrada');
  await page.waitForLoadState('domcontentloaded');
  if (mode === 'set') {
    await page.evaluate(() => {
      localStorage.setItem('saldio.apiUrl', 'http://127.0.0.1:3000');
      localStorage.setItem('saldio.theme', JSON.stringify('dark'));
      localStorage.setItem('saldio.accent', JSON.stringify('violet'));
    });
    console.log('SET_OK');
  } else {
    const values = await page.evaluate(() => ({
      apiUrl: localStorage.getItem('saldio.apiUrl'),
      theme: localStorage.getItem('saldio.theme'),
      accent: localStorage.getItem('saldio.accent'),
    }));
    console.log('PREFERENCES', JSON.stringify(values));
  }
  await browser.close();
})().catch((error) => {
  console.error('ERROR', error.message);
  process.exit(1);
});
