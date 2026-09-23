import { chromium } from 'playwright-core';
const routes = ['#/', '#/u/5', '#/pyq', '#/topicwise', '#/tricks', '#/labs', '#/cards', '#/mock', '#/stats', '#/settings',
  '#/practice/u9', '#/lab/pagerepl', '#/lab/cpusched', '#/lab/disksched', '#/lab/banker', '#/lab/kmap',
  '#/lab/numbase', '#/lab/cache', '#/lab/pipeline', '#/lab/subnet', '#/lab/errdet', '#/lab/fdtool',
  '#/lab/sql', '#/lab/dfa', '#/lab/firstfollow', '#/lab/sortviz', '#/lab/graphalgo', '#/lab/huffman', '#/lab/alphabeta'];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage();
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
for (const r of routes) {
  errs.length = 0;
  await p.goto('http://localhost:8099/' + r, { waitUntil: 'networkidle' });
  await p.waitForTimeout(450);
  const txt = await p.$eval('#main', n => n.innerText.trim().slice(0, 90));
  const bad = errs.filter(e => !/favicon|404 \(Not Found\)/.test(e));
  console.log((bad.length ? 'FAIL ' : 'ok   ') + r.padEnd(22) + ' | ' + txt.replace(/\n/g, ' ⏎ '));
  bad.slice(0, 3).forEach(e => console.log('        ' + e.slice(0, 180)));
}
await b.close();
