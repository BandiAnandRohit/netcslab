import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage();
await p.goto('http://localhost:8099/#/lab/kmap', { waitUntil: 'networkidle' }); await p.waitForTimeout(400);
console.log('KMAP SOP:', await p.$eval('.cal.formula annotation, .cal.formula .katex-mathml', n => n.textContent).catch(()=> 'n/a'));
const rows = await p.$$eval('table tbody tr', rs => rs.map(r => [...r.children].map(c=>c.innerText.trim()).join(' | ')));
console.log(rows.filter(r=>/yes/.test(r)).join('\n'));
await b.close();
