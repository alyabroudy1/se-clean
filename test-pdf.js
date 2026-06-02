const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  
  await page.goto('file:///Users/mohammad/AndroidStudioProjects/se-clean/index.html', {waitUntil: 'networkidle2'});
  
  await page.evaluate(() => {
    console.log("Keys on window with js:", JSON.stringify(Object.keys(window).filter(k => k.toLowerCase().includes('jspdf'))));
    console.log("Is jsPDF defined?", typeof window.jsPDF !== 'undefined');
    console.log("Is jspdf defined?", typeof window.jspdf !== 'undefined');
  });

  await browser.close();
})();
