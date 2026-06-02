const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  
  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <body>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.4/jspdf.plugin.autotable.min.js"></script>
      <script>
        console.log("Is jsPDF defined?", typeof window.jspdf !== 'undefined');
        if (typeof window.jspdf !== 'undefined') {
          const { jsPDF } = window.jspdf;
          const doc = new jsPDF();
          console.log("Is autoTable a function?", typeof doc.autoTable === 'function');
        }
      </script>
    </body>
    </html>
  `, {waitUntil: 'networkidle0'});
  
  await browser.close();
})();
