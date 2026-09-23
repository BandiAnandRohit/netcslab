import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
for (const r of ['#/t/5.7','#/t/9.7','#/t/5.9','#/tricks','#/cards','#/u/9']) {
  errs.length=0;
  await p.goto('http://localhost:8099/'+r,{waitUntil:'networkidle'}); await p.waitForTimeout(500);
  const info = await p.evaluate(()=>({
    h1: document.querySelector('#main h1')?.innerText,
    h2s: document.querySelectorAll('#main h2').length,
    labs: document.querySelectorAll('.lab').length,
    checks: document.querySelectorAll('.q').length,
    cals: document.querySelectorAll('.cal').length,
    math: document.querySelectorAll('.katex').length,
    tables: document.querySelectorAll('#main table').length,
    words: document.querySelector('#main').innerText.split(/\s+/).length,
    toc: document.querySelectorAll('#toc a').length }));
  const bad = errs.filter(e=>!/favicon/.test(e));
  console.log((bad.length?'FAIL ':'ok   ')+r.padEnd(10), JSON.stringify(info));
  bad.slice(0,2).forEach(e=>console.log('     ',e.slice(0,160)));
}
await p.goto('http://localhost:8099/#/t/9.7',{waitUntil:'networkidle'}); await p.waitForTimeout(600);
await p.screenshot({path:'/tmp/claude-0/-home-claude/08b6a025-c590-502a-ae2a-9236415b083e/scratchpad/topic.png'});
await b.close();
