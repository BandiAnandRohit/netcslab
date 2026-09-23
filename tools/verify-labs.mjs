import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage();
const go = async (r) => { await p.goto('http://localhost:8099/#/lab/' + r, { waitUntil: 'networkidle' }); await p.waitForTimeout(350); };
const txt = () => p.$eval('#main', n => n.innerText.replace(/\s+/g,' '));
const check = (name, cond, got) => console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  →  ' + got));

// 1. page replacement (Silberschatz classic: FIFO 15, LRU 12, OPT 9 on 3 frames)
await go('pagerepl');
await p.click('text=Compare all'); await p.waitForTimeout(250);
let t = await txt();
const row = (alg) => { const m = new RegExp(alg + ' (\\d+) (\\d+)').exec(t); return m ? +m[1] : -1; };
check('pagerepl FIFO=15', row('FIFO') === 15, row('FIFO'));
check('pagerepl LRU=12',  row('LRU')  === 12, row('LRU'));
check('pagerepl OPT=9',   row('Optimal') === 9, row('Optimal'));

// 2. FCFS scheduling  at 0 1 2 3 / bt 5 3 8 6 -> avg TAT 11.25, avg WT 5.75
await go('cpusched'); await p.waitForTimeout(250);
t = await txt();
check('cpusched FCFS avg TAT 11.25', /avg turnaround 11\.25/.test(t), t.slice(t.indexOf('avg turnaround'), t.indexOf('avg turnaround')+60));
check('cpusched FCFS avg WT 5.75',  /avg waiting 5\.75/.test(t), '');

// 3. disk scheduling: FCFS 640, SSTF 236 (Silberschatz)
await go('disksched'); t = await txt();
check('disk FCFS=640', /FCFS 640/.test(t), t.slice(0,200));
check('disk SSTF=236', /SSTF 236/.test(t), '');

// 4. banker classic -> safe, sequence starts P1
await go('banker'); t = await txt();
check('banker safe state', /Safe state/.test(t), t.slice(0,160));
check('banker sequence <P1, P3, P4, P0, P2>', /P1, P3, P4, P0, P2/.test(t), (/<([^>]+)>/.exec(t)||[])[1]);

// 5. subnet 192.168.10.77/26
await go('subnet'); t = await txt();
check('subnet network 192.168.10.64/26', /192\.168\.10\.64\/26/.test(t), '');
check('subnet broadcast .127', /192\.168\.10\.127/.test(t), '');
check('subnet 62 usable hosts', / 62 /.test(t), '');

// 6. Huffman classic -> 224 bits, avg 2.24
await go('huffman'); t = await txt();
check('huffman 224 bits', /224 bits/.test(t), t.slice(t.indexOf('Total encoded'), t.indexOf('Total encoded')+90));
check('huffman avg 2.24', /2\.2400/.test(t), '');

// 7. FIRST/FOLLOW expression grammar
await go('firstfollow'); t = await txt();
check('FIRST(E) = { (, id }', /E \{ \(, id \}/.test(t), t.slice(0,260));
check('FOLLOW(E) contains ) and $', /E \{ \(, id \} \{ \$, \) \}|E \{ \(, id \} \{ \), \$ \}/.test(t), t.slice(0,260));
check('grammar is LL(1)', /Grammar is LL\(1\)/.test(t), '');

// 8. DFA accepting (ends in q2)
await go('dfa'); t = await txt();
check('dfa verdict present', /String (ACCEPTED|REJECTED)/.test(t), '');

// 9. cache: 32-bit, 64KB, 16B block, 4-way
await go('cache'); t = await txt();
check('cache direct tag=16 bits', /Direct mapped 4096 4 12 16/.test(t), t.slice(t.indexOf('Direct'), t.indexOf('Direct')+80));
check('cache 4-way index=10', /4-way set associative 1024 4 10 18/.test(t), t.slice(t.indexOf('4-way'), t.indexOf('4-way')+80));

// 10. kmap
await go('kmap'); t = await txt();
check('kmap produced an SOP', /Minimal sum of products/.test(t), '');
check('kmap lists prime implicants', /All prime implicants/.test(t), '');

// 11. sql
await go('sql'); t = await txt();
check('sql GROUP BY/HAVING ran', /dept n avgsal/.test(t) && /rows returned/.test(t), t.slice(0,200));

// 12. errdet CRC
await go('errdet'); t = await txt();
check('crc remainder shown', /Transmitted frame/.test(t), '');
check('crc receiver remainder 0000', /remainder 0000/.test(t), t.slice(t.indexOf('receiver'), t.indexOf('receiver')+80));

// 13. graph Dijkstra A->F
await go('graphalgo'); t = await txt();
check('dijkstra table rendered', /Shortest distance/.test(t), '');

// 14. pipeline
await go('pipeline'); t = await txt();
check('pipeline cycle time 95', /95 ns/.test(t), t.slice(t.indexOf('cycle time'), t.indexOf('cycle time')+70));

// 15. fdtool
await go('fdtool'); t = await txt();
check('fdtool found candidate keys', /Candidate keys/.test(t), '');
check('fdtool reports a normal form', /Highest normal form/.test(t), '');

// 16. alphabeta 3 5 6 9 1 2 0 -1 b=2 -> minimax 5
await go('alphabeta'); t = await txt();
check('alphabeta root value 5', /Root value = 5/.test(t), t.slice(t.indexOf('Root value'), t.indexOf('Root value')+60));

// 17. sortviz
await go('sortviz'); await p.click('text=Compare all'); await p.waitForTimeout(250); t = await txt();
check('sortviz comparison table', /Worst Best Space Stable/.test(t), '');

await b.close();
