import { chromium } from 'playwright-core';
const B='http://localhost:8099/';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const p = await b.newPage();
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
p.on('console',m=>{if(m.type()==='error'&&!/favicon/.test(m.text()))errs.push('CONSOLE '+m.text())});
const go=async r=>{await p.goto(B+r,{waitUntil:'networkidle'});await p.waitForTimeout(400)};
let fails=0;
const ck=(n,c,extra='')=>{if(!c)fails++;console.log((c?'PASS ':'FAIL ')+n+(c?'':'  '+extra))};

// --- every route renders without errors ---
const routes=['#/','#/u/1','#/u/5','#/u/10','#/t/1.5','#/t/3.7','#/t/7.8','#/t/9.11','#/pyq','#/topicwise',
 '#/tricks','#/labs','#/cards','#/mock','#/stats','#/settings','#/practice/u3','#/practice/t4.5','#/practice/unseen'];
for(const r of routes){errs.length=0;await go(r);
  const w=await p.$eval('#main',n=>n.innerText.trim().length);
  ck('route '+r, errs.length===0 && w>200, errs[0]||('len='+w));}

// --- search works ---
await go('#/');
await p.fill('#search','deadlock'); await p.waitForTimeout(900);
const hits=await p.$$eval('#search-results a',a=>a.length);
ck('search returns hits', hits>3, 'hits='+hits);

// --- answering a practice question records it ---
await go('#/practice/t5.7');
await p.click('.q .opt'); await p.waitForTimeout(300);
ck('question reveals explanation', await p.$('.q-exp')!==null);
ck('attempt persisted', await p.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('net:v1:att')||'{}')).length>0));

// --- lesson "mark as studied" persists ---
await go('#/t/5.7');
await p.click('text=Mark as studied'); await p.waitForTimeout(250);
ck('topic marked studied', await p.evaluate(()=>!!JSON.parse(localStorage.getItem('net:v1:read')||'{}')['5.7']));

// --- flashcard grading advances the SRS ---
await go('#/cards');
await p.click('text=/Review \\d+ cards/'); await p.waitForTimeout(400);
await p.click('text=/Show answer/'); await p.waitForTimeout(200);
await p.click('.rate button:nth-child(3)'); await p.waitForTimeout(300);
ck('SRS scheduled a card', await p.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('net:v1:srs')||'{}')).length>0));

// --- full mock test: start, answer, submit, review ---
await go('#/mock');
await p.click('.card:has-text("Quick 25") button'); await p.waitForTimeout(900);
ck('mock started', p.url().includes('/mock/run'));
const total=await p.$$eval('.pal',n=>n.length);
ck('palette has 25 questions', total===25, 'got '+total);
for(let i=0;i<25;i++){ await p.click('.q .opt'); await p.waitForTimeout(40);
  if(i<24){ await p.click('button:has-text("Next ▶")'); await p.waitForTimeout(60);} }
const answered=await p.$$eval('.pal.ans',n=>n.length);
ck('all 25 answered in palette', answered===25, 'got '+answered);
p.once('dialog',d=>d.accept());
await p.click('button:has-text("Submit")'); await p.waitForTimeout(900);
ck('landed on result page', p.url().includes('/mock/result/'));
const res=await p.$eval('#main',n=>n.innerText);
ck('result shows marks out of 50', /\/\s*50/.test(res), res.slice(0,180).replace(/\n/g,' '));
ck('result shows unit breakdown', /Unit by unit/i.test(res));
ck('mock stored', await p.evaluate(()=>JSON.parse(localStorage.getItem('net:v1:mocks')||'[]').length>0));

// --- stats reflect the activity ---
await go('#/stats');
const st=await p.$eval('#main',n=>n.innerText);
ck('stats shows tests taken', /tests taken/i.test(st));
ck('stats shows weakest topics', /Weakest topics/i.test(st));

// --- export produces a backup ---
await go('#/settings');
const dl=p.waitForEvent('download',{timeout:5000}).catch(()=>null);
await p.click('text=Export progress'); const d=await dl;
ck('backup download fires', d!==null, d?'':'no download event');

// --- mobile viewport ---
const m=await b.newPage({viewport:{width:390,height:844}});
await m.goto(B+'#/t/9.7',{waitUntil:'networkidle'}); await m.waitForTimeout(500);
const scroll=await m.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
ck('no horizontal scroll on mobile', scroll<=1, 'overflow='+scroll+'px');
await m.screenshot({path:'/tmp/claude-0/-home-claude/08b6a025-c590-502a-ae2a-9236415b083e/scratchpad/mobile.png'});

// --- dark theme ---
await go('#/t/7.8'); await p.click('#theme-btn'); await p.waitForTimeout(400);
ck('dark theme applies', await p.evaluate(()=>document.documentElement.getAttribute('data-theme')==='dark'));
await p.screenshot({path:'/tmp/claude-0/-home-claude/08b6a025-c590-502a-ae2a-9236415b083e/scratchpad/dark.png'});

console.log(fails? `\n${fails} FAILURE(S)` : '\nALL CHECKS PASSED');
await b.close();
