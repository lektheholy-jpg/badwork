// ทดสอบสิ่งที่แสดงบน Dynamic Island นอกเหนือจากข้อความแจ้งเตือน: ชิปจับเวลา · แถบ "AI กำลังคิด…" · ตัวจับเวลาที่เดินต่อเมื่อไม่มีหน้าจอ
// ใช้ island.js จริง + มาร์กอัปจริงจาก index.html + เครื่องยนต์จับเวลาจริงจาก tools.js + badworkAiGuard จริงจาก badwork-ai.js (ตัดเฉพาะช่วง)
// วิธีรัน: npm run test:island
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (!c && x !== undefined ? ' ' + JSON.stringify(x) : '')); };
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const html = R('index.html');
const islandHtml = html.slice(html.indexOf('<div id="island"'), html.indexOf('<!-- core bundle'));
const dom = new JSDOM(`<!doctype html><body>${islandHtml}<form id="f"><div class="doc-ai-row"><span class="doc-ai-state"></span><button type="button" id="b" data-doc-ai>✦</button></div></form></body>`, { url: 'https://example.test/', runScripts: 'outside-only' });
const w = dom.window;
w.eval(R('js/island.js') + '\nwindow.__ui = IslandUI;'); // const ของสคริปต์ไม่โผล่ข้ามสคริปต์ใน jsdom → ส่งออกผ่าน window
const el = w.document.getElementById('island');
const text = () => el.querySelector('.island-text').textContent;
const timerText = () => el.querySelector('.island-idle-timer-text').textContent;
const end = () => ['timer', 'ai', 'toast', 'x'].forEach(k => w.__ui.clear(k));

(async () => {
  console.log('ชิปจับเวลา');
  ok(!el.classList.contains('has-timer'), 'เริ่มต้นไม่มีชิป');
  w.islandTimer('12:30');
  ok(el.classList.contains('has-timer') && timerText() === '12:30', 'ตั้งเวลา → ชิปขึ้นพร้อมข้อความ', timerText());
  w.islandTimer('12:29', true);
  ok(timerText() === '12:29' && el.classList.contains('timer-warn'), '≤10 วิ → สีเตือน');
  w.islandTimer(null);
  ok(!el.classList.contains('has-timer') && !el.classList.contains('timer-warn'), 'ล้างชิปแล้วหายทั้งชิปและสีเตือน');
  ok(el.querySelector('.island-idle-timer-ico svg'), 'ชิปมีไอคอนนาฬิกา');

  console.log('ครบเวลา');
  w.islandTimer('00:01');
  w.islandTimerDone('หมดเวลาแล้ว · 05:00');
  ok(el.classList.contains('open') && el.dataset.kind === 'warn' && text() === 'หมดเวลาแล้ว · 05:00', 'เด้งแจ้งเตือนสีเตือน', [el.dataset.kind, text()]);
  ok(!el.classList.contains('has-timer'), 'ชิปหายเมื่อครบเวลา');
  w.showToast('ข้อความทั่วไป');
  ok(text() === 'หมดเวลาแล้ว · 05:00', 'ข้อความทั่วไปไม่ทับการแจ้งเตือนหมดเวลา');
  end();

  console.log('islandBusy');
  const b = w.islandBusy('กำลังทำ…', 'x');
  ok(el.classList.contains('open') && el.dataset.kind === 'loading' && el.dataset.bar === 'indeterminate', 'แถบวิ่ง + loading');
  w.showToast('บันทึกแล้ว', 'success');
  ok(text() === 'กำลังทำ…', 'ข้อความเบากว่าไม่ทับแถบ loading');
  b.done('เสร็จแล้ว');
  ok(el.dataset.kind === 'success' && text() === 'เสร็จแล้ว' && !el.dataset.bar, 'done → success และแถบหาย');
  b.clear(); ok(!el.classList.contains('open'), 'clear ปิดข้อความของตัวเอง');

  console.log('ตัวจับเวลา (ไม่มีหน้าจอ timer-out ใน DOM)');
  w.eval(R('js/tools.js') + '\nwindow.__tools = ToolsState;');
  ok(!w.document.getElementById('timer-out'), 'ไม่มีหน้าจับเวลาใน DOM');
  w.__tools.timerTotal = w.__tools.timerLeft = 2; w.toolsTimerStart();
  await sleep(350);
  ok(el.classList.contains('has-timer') && /^00:0[12]$/.test(timerText()), 'นับต่อและแสดงชิปแม้ไม่มีหน้าจอ', timerText());
  ok(el.classList.contains('timer-warn'), 'เหลือ ≤10 วิ ชิปเป็นสีเตือน');
  w.toolsTimerStop();
  ok(!el.classList.contains('has-timer'), 'หยุดชั่วคราว → ชิปหาย');
  w.__tools.timerTotal = w.__tools.timerLeft = 1; w.toolsTimerStart();
  await sleep(1500);
  ok(w.__tools.timerId === null, 'ครบเวลา → หยุด interval');
  ok(el.dataset.kind === 'warn' && /^หมดเวลาแล้ว/.test(text()), 'ครบเวลา → เด้งแจ้งเตือนบน Island', [el.dataset.kind, text()]);
  end();

  console.log('AI ผ่าน badworkAiGuard');
  const src = R('js/badwork-ai.js');
  const guardSrc = src.slice(src.indexOf('let badworkAiBusy'), src.indexOf('// หน้าต่างตรวจทานข้อความที่ AI เสนอ')).replace(/\/\/ -+\s*$/, '');
  w.eval(`const BADWORK_AI_CONFIG = { timeout: 90000 }; const docSystem = () => ({}); const badworkAiConsent = () => true;
    function badworkAiError(e) { showToast('ผิดพลาด:' + e.message); }\n${guardSrc}`);
  const btn = w.document.getElementById('b');
  let during;
  const p = w.badworkAiGuard(btn, async () => { await sleep(30); during = [el.dataset.kind, text(), el.dataset.bar]; return [1]; });
  await sleep(5);
  ok(el.classList.contains('open') && el.dataset.kind === 'loading' && text() === 'AI กำลังคิด…', 'ระหว่างรอ: "AI กำลังคิด…" + แถบวิ่ง', [el.dataset.kind, text()]);
  await p;
  ok(el.dataset.kind === 'success' && text() === 'AI เสร็จแล้ว', 'จบ: "AI เสร็จแล้ว"', [el.dataset.kind, text()]);
  end();
  await w.badworkAiGuard(btn, async () => { throw new Error('boom'); });
  ok(text() === 'ผิดพลาด:boom' && el.dataset.kind !== 'loading', 'error: แถบ loading ไม่บังข้อความ error', [el.dataset.kind, text()]);
  end();
  await w.badworkAiGuard(btn, async () => []);
  ok(!el.classList.contains('open'), 'ผลว่าง: ไม่ขึ้น "เสร็จแล้ว" ปล่อยให้ผู้เรียกแจ้งเอง');

  console.log(`\n${pass} ผ่าน · ${fail} ไม่ผ่าน`);
  process.exit(fail ? 1 : 0);
})();
