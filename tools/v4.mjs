import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage();
await p.goto('http://localhost:8099/#/lab/kmap', { waitUntil: 'networkidle' }); await p.waitForTimeout(400);
console.log('SOP text:', JSON.stringify(await p.$eval('.cal.formula', n => n.innerText)));
console.log('summary  :', await p.$eval('.cal.formula ~ p, p.small.muted', n => n.innerText).catch(()=>'-'));
const rows = await p.$$eval('table tbody tr', rs => rs.map(r=>[...r.children].map(c=>c.innerText.trim())).filter(r=>r[3]==='yes'));
console.log('chosen primes:', rows.map(r=>r[0]+' covers '+r[1]).join('   |   '));
await b.close();
