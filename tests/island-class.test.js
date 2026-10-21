// ทดสอบชิปคาบสอนบน Dynamic Island (\"คาบ 3 · ม.2/1 · อีก 12 นาที\" / \"ถัดไป 13:20 · ม.4/2\")
//   ส่วน A ตรรกะ กำลังสอน/ถัดไป/ใกล้คาบ (ttChipInfo ใน js/timetable.js จริง รันใน vm)
//   ส่วน B การส่งข้อความเข้า Island (ttChipSync / ttChipSet / ttChipReload / islandOnMinute)
//   ส่วน C ฝั่ง Island: islandClass · ย่อช่องชื่อหน้าบนมือถือ · ชิปจับเวลามาก่อน · hook รายนาที · islandSave('saved', { missing })
//   ส่วน E มือถือ: ชิปคาบ (ข้อความย่อ) สลับกับชื่อหน้า 5 วิ / 3 วิ · วันที่ + ไอคอนหน้าอยู่ตลอด · เปลี่ยนหน้า = โชว์ชื่อหน้าก่อน · ไม่พอที่ = ซ่อนวันที่
// ใช้ island.js + timetable.js จริง · มาร์กอัปจริงจาก index.html · ตรวจกฎ CSS จริงจาก css/style.css
// วิธีรัน: npm run test:islandclass   (หรือ node tests/island-class.test.js)
const fs = require('fs'), path = require('path'), vm = require('vm');
const { JSDOM } = require('jsdom');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (!c && x !== undefined ? ' ' + JSON.stringify(x) : '')); };
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

// ---------- ตารางตัวอย่าง (คาบมาตรฐานของระบบ: คาบ 3 = 09:20-10:10 · คาบ 8 = 13:30-14:20) ----------
const entry = o => ({ id: 'e' + Math.random().toString(36).slice(2, 7), kind: 'class', day: 1, period: 0, span: 1, title: 'วิทย์', code: '', cls: '', room: '', hue: 'blue', courseId: '', ...o });
const entries = [
  entry({ period: 2, cls: 'ม.2/1' }),                                           // จ. 09:20-10:10
  entry({ period: 4, span: 2, title: 'คณิตศาสตร์เพิ่มเติมขั้นสูง' }),            // จ. 11:00-12:40 · ไม่ใส่ห้อง → ใช้ชื่อวิชาแบบสั้น
  entry({ period: 7, cls: 'ม.4/2' }),                                           // จ. 13:30-14:20
  entry({ day: 3, period: 3, span: 3, cls: 'ม.5/3' }),                          // พ. 10:10-12:40
];

function makeCtx({ docs = {}, failGet = false } = {}) {
  const hooks = [], classCalls = [], shortCalls = [];
  const col = { get: async () => { if (failGet) throw new Error('offline'); return { docs: Object.entries(docs).map(([id, d]) => ({ id, data: () => d })) }; } };
  const ctx = {
    console: { log() {}, error() {}, warn() {} }, hooks, classCalls, shortCalls,
    AppState: { user: { uid: 'u1' } },
    islandClass: (t, sh) => { classCalls.push(t); shortCalls.push(sh); }, islandOnMinute: fn => hooks.push(fn),
    db: { collection: () => ({ doc: () => ({ collection: () => col }) }) },
    firebase: { firestore: { FieldValue: { serverTimestamp: () => 'TS' } } },
    islandSave() {}, showToast() {}, uid4: () => 'id', escapeHtml: s => String(s),
  };
  vm.createContext(ctx);
  vm.runInContext(R('js/timetable.js'), ctx);
  return ctx;
}
const run = (ctx, code) => vm.runInContext(code, ctx);

(async () => {
  const c = makeCtx();
  const tt = { periods: run(c, 'TT_DEFAULT_PERIODS'), entries };
  const at = (day, h, m) => new Date(2026, 9, 18 + day, h, m); // 19 ต.ค. 2569 = จันทร์ (day 1) · 21 = พุธ
  ok(at(1, 0, 0).getDay() === 1 && at(3, 0, 0).getDay() === 3 && at(6, 0, 0).getDay() === 6, 'วันที่ในเทสต์ตรงกับวันที่ตั้งใจ (จ./พ./ส.)');
  const info = (d, h, m, lead) => c.ttChipInfo(tt, at(d, h, m), lead);

  console.log('A. ตรรกะ: กำลังสอน');
  let r = info(1, 9, 58);
  ok(r && r.state === 'now' && r.text === 'คาบ 3 · ม.2/1 · อีก 12 นาที', 'อยู่ในคาบ 3 → \"คาบ 3 · ม.2/1 · อีก 12 นาที\"', r);
  ok(info(1, 9, 20).text === 'คาบ 3 · ม.2/1 · อีก 50 นาที', 'นาทีแรกของคาบนับเป็นกำลังสอน');
  ok(info(1, 10, 9).text === 'คาบ 3 · ม.2/1 · อีก 1 นาที', 'นาทีสุดท้าย → อีก 1 นาที');
  ok(info(1, 10, 10) === null, 'ครบคาบแล้ว (10:10) ไม่ใช่คาบนั้นอีก · คาบถัดไปยังอีกไกล → ไม่ขึ้นชิป', info(1, 10, 10));
  r = info(1, 11, 0);
  ok(r && r.state === 'now' && r.text.startsWith('คาบ 5-6 · ') && r.text.endsWith(' · อีก 1 ชม. 40 นาที'), 'คาบคาบเกี่ยว 2 คาบ → \"คาบ 5-6\" และเวลาเหลือแปลงเป็นชั่วโมง', r && r.text);
  ok(r.text.includes('คณิตศาสตร์เพิ่…') && !r.text.includes('ขั้นสูง'), 'ไม่ได้ใส่ห้อง → ใช้ชื่อวิชาตัดสั้น 14 ตัวอักษรต่อท้าย …', r.text);
  ok(info(3, 10, 40).text === 'คาบ 4-6 · ม.5/3 · อีก 2 ชม.', 'เหลือชั่วโมงเต็ม → \"อีก 2 ชม.\" (ไม่มี 0 นาที)', info(3, 10, 40).text);
  ok(info(1, 13, 30).text === 'คาบ 8 · ม.4/2 · อีก 50 นาที', 'คาบเดี่ยวอีกคาบ');

  console.log('A. ข้อความย่อสำหรับมือถือ (short)');
  ok(info(1, 9, 58).short === 'คาบ 3 · ม.2/1 · 12m', 'กำลังสอน → \"คาบ 3 · ม.2/1 · 12m\"', info(1, 9, 58).short);
  ok(info(1, 10, 9).short === 'คาบ 3 · ม.2/1 · 1m', 'นาทีสุดท้าย → 1m');
  ok(info(1, 11, 0).short.startsWith('คาบ 5-6 · ') && info(1, 11, 0).short.endsWith(' · 1h 40m'), 'เกิน 1 ชม. → 1h 40m', info(1, 11, 0).short);
  ok(info(3, 10, 40).short === 'คาบ 4-6 · ม.5/3 · 2h', 'ชั่วโมงเต็ม → 2h (ไม่มี 0m)', info(3, 10, 40).short);
  ok(info(1, 11, 0).short.includes(' · คณิตศาสตร์… · ') && !info(1, 11, 0).text.includes(' · คณิตศาสตร์… · '), 'ชื่อ/ห้องตัดเหลือ 10 ตัวอักษรในรูปย่อ (รูปเต็มยังตัดที่ 14)', info(1, 11, 0).short);
  ok(info(1, 13, 15).short === 'ถัดไป 13:30 · ม.4/2', 'ใกล้คาบ → รูปย่อสั้นเท่าเดิม');
  ok(!/อีก|นาที|ชม\./.test(info(1, 9, 58).short), 'รูปย่อไม่มีคำไทยของเวลา (อีก/นาที/ชม.)');

  console.log('A. ตรรกะ: ใกล้คาบ (ถัดไป)');
  r = info(1, 13, 15);
  ok(r && r.state === 'next' && r.text === 'ถัดไป 13:30 · ม.4/2', 'อีก 15 นาทีพอดี → \"ถัดไป 13:30 · ม.4/2\"', r);
  ok(info(1, 13, 14) === null, 'อีก 16 นาที → ยังไม่ขึ้น (ตอนพักแถบไม่แน่น)');
  ok(info(1, 10, 45).state === 'next' && info(1, 10, 44) === null, 'ใช้เกณฑ์ 15 นาทีเหมือนกันกับคาบอื่น');
  ok(info(1, 12, 45) === null && info(1, 12, 45, 60).text === 'ถัดไป 13:30 · ม.4/2', 'ปรับเกณฑ์ lead ได้ (พักกลางวัน อีก 45 นาที: ค่าปกติไม่ขึ้น · lead 60 ขึ้น)');
  ok(info(1, 14, 20) === null && info(1, 18, 0) === null && info(1, 6, 0) === null, 'หลังคาบสุดท้าย / ก่อนคาบแรกยังไกล → ไม่ขึ้น');

  console.log('A. ตรรกะ: ไม่มีคาบ');
  ok(info(2, 9, 58) === null, 'วันอังคารไม่มีคาบ (ตารางมีแต่จันทร์/พุธ) → ไม่ขึ้น');
  ok(info(6, 9, 58) === null && info(7, 9, 58) === null, 'เสาร์-อาทิตย์ → ไม่ขึ้น');
  ok(c.ttChipInfo(null, at(1, 9, 58)) === null && c.ttChipInfo({ periods: tt.periods, entries: [] }, at(1, 9, 58)) === null && c.ttChipInfo({ entries }, at(1, 9, 58)) === null, 'ไม่มีตาราง / ตารางว่าง / ไม่มีเวลาคาบ → null ไม่พัง');
  const lead = c.ttChipInfo({ periods: tt.periods, entries: [entry({ period: 0, title: 'กกกกกกกกกกกกกเกก' })] }, at(1, 7, 55));
  ok(lead && lead.text.includes(' · กกกกกกกกกกกกก… · ') && !lead.text.includes('เ…'), 'ตัดชื่อแล้วไม่ทิ้งสระหน้า (เ) ห้อยท้ายคำ', lead && lead.text);
  const longCls = c.ttChipInfo({ periods: tt.periods, entries: [entry({ period: 2, cls: 'ม.4/2 (วิทย์-คณิต ห้องพิเศษ)' })] }, at(1, 9, 58));
  ok(longCls && longCls.text === 'คาบ 3 · ม.4/2 (วิทย์-ค… · อีก 12 นาที', 'ห้อง/ชั้นยาว (ช่องรับได้ 30 ตัว) ก็ตัดเหลือ 14 ตัว ชิปไม่ล้นจอเล็ก', longCls && longCls.text);
  const overlap = c.ttChipInfo({ periods: tt.periods, entries: [entry({ period: 2, cls: 'ม.1/1' }), entry({ period: 2, cls: 'ม.9/9' })] }, at(1, 9, 58));
  ok(overlap && /ม\.1\/1/.test(overlap.text), 'คาบซ้อนกัน: ใช้ตัวที่วางก่อน (ตรงกับวิดเจ็ตหน้าแรก ผ่าน ttLayoutDay)', overlap && overlap.text);
  const e0 = [entry({ period: 2, cls: 'ม.2/1' }), entry({ period: 7, cls: 'ม.4/2' })];
  ok(JSON.stringify(c.ttFindNowNext(e0, tt.periods, 9 * 60 + 58)) === '{"nowIdx":0,"nextIdx":1}', 'ttFindNowNext (ตรรกะกลางที่วิดเจ็ตหน้าแรกใช้ร่วม) คืน index กำลังสอน/ถัดไป');

  console.log('B. ส่งข้อความเข้า Island');
  const key = run(c, 'ttTermKey(ttCurrentTerm())');
  const c2 = makeCtx({ docs: { [key]: { periods: tt.periods, entries } } });
  ok(c2.hooks.length === 1 && c2.hooks[0] === c2.ttChipSync, 'timetable.js ลงทะเบียน ttChipSync กับ islandOnMinute ตอนโหลด (ครั้งเดียว)');
  const noIsland = vm.createContext({ console: { log() {}, error() {}, warn() {} }, AppState: { user: { uid: 'u1' } } });
  let loaded = true; try { vm.runInContext(R('js/timetable.js'), noIsland); noIsland.ttChipSet({ periods: tt.periods, entries }); noIsland.ttChipSync(); } catch (e) { loaded = false; }
  ok(loaded, 'ไม่มี Island (เช่นหน้าอื่น/เทสต์) → ไม่พัง ไม่ทำอะไร');
  c2.ttChipSet({ periods: tt.periods, entries });
  c2.hooks[0](at(1, 9, 58));
  ok(c2.classCalls.at(-1) === 'คาบ 3 · ม.2/1 · อีก 12 นาที', 'hook รายนาที → islandClass(ข้อความคาบ)', c2.classCalls.at(-1));
  ok(c2.shortCalls.at(-1) === 'คาบ 3 · ม.2/1 · 12m', 'hook รายนาที → ส่งข้อความย่อเป็นอาร์กิวเมนต์ที่ 2 ด้วย', c2.shortCalls.at(-1));
  c2.hooks[0](at(1, 12, 50));
  ok(c2.classCalls.at(-1) === null, 'พ้นคาบและยังไกลคาบถัดไป → islandClass(null) ซ่อนชิป', c2.classCalls.at(-1));
  ok(c2.shortCalls.at(-1) === undefined, 'ซ่อนชิป → ไม่ส่งข้อความย่อ');
  c2.AppState.user = { uid: 'u2' }; c2.hooks[0](at(1, 9, 58));
  ok(c2.classCalls.at(-1) === null, 'เปลี่ยนบัญชี → ไม่ใช้ตารางของบัญชีก่อนหน้า');
  c2.AppState.user = null; c2.hooks[0](at(1, 9, 58));
  ok(c2.classCalls.at(-1) === null, 'ยังไม่ล็อกอิน → ไม่ขึ้นชิป');
  c2.AppState.user = { uid: 'u1' };
  c2.ttChipSet({ periods: tt.periods, entries: [] });
  c2.ttChipSync(at(1, 9, 58));
  ok(c2.classCalls.at(-1) === null, 'ตารางถูกล้าง → ชิปหาย');
  await c2.ttChipReload();
  c2.ttChipSync(at(1, 9, 58));
  ok(c2.classCalls.at(-1) === 'คาบ 3 · ม.2/1 · อีก 12 นาที', 'ttChipReload (หลังบันทึกตาราง) อ่านตารางที่ใช้งานอยู่ใหม่ → ชิปเห็นของใหม่', c2.classCalls.at(-1));
  const c3 = makeCtx({ failGet: true });
  c3.ttChipSet({ periods: tt.periods, entries });
  let threw = false; try { await c3.ttChipReload(); } catch (e) { threw = true; }
  c3.ttChipSync(at(1, 9, 58));
  ok(!threw && c3.classCalls.at(-1) === 'คาบ 3 · ม.2/1 · อีก 12 นาที', 'โหลดใหม่ไม่สำเร็จ (ออฟไลน์) → ไม่โยน error และใช้ตารางเดิมต่อ');

  console.log('C. ฝั่ง Island');
  const html = R('index.html');
  const islandHtml = html.slice(html.indexOf('<div id="island"'), html.indexOf('<!-- core bundle'));
  const dom = new JSDOM(`<!doctype html><body>${islandHtml}</body>`, { url: 'https://example.test/', runScripts: 'outside-only' });
  const w = dom.window;
  let narrow = false; const errs = [];
  w.matchMedia = () => ({ get matches() { return narrow; } });
  w.requestAnimationFrame = fn => w.setTimeout(fn, 0); // jsdom ไม่มีให้ (island.js ใช้ตอนตั้งหน้าครั้งแรกและตอนย่อขยายจอ)
  w.console.error = (...a) => errs.push(a);
  // jsdom ไม่มี layout: ให้ช่องชื่อหน้า (.pg) กว้าง 100 และกลุ่มวัน·เวลา (.island-idle-main) กว้าง 200 เพื่อตรวจสูตรความกว้าง
  Object.defineProperty(w.HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return this.classList.contains('pg') ? 100 : this.classList.contains('island-idle-main') ? 200 : 0; } });
  w.eval(R('js/island.js') + '\nwindow.__ui = IslandUI;');
  const el = w.document.getElementById('island');
  const css = n => el.style.getPropertyValue(n);
  const chipText = () => el.querySelector('.island-idle-class-text').textContent;
  const text = () => el.querySelector('.island-text').textContent;

  ok(el.querySelector('.island-idle-main .island-idle-class .island-idle-class-ico svg'), 'มาร์กอัปจริง: ชิปอยู่ใน .island-idle-main (ความกว้างถูกวัดรวม) และมีไอคอน');
  ok(!el.classList.contains('has-class'), 'เริ่มต้นไม่มีชิป');
  w.__ui.setPage({ label: 'บันทึกคะแนน', icon: '' });
  ok(css('--pw') === '100px' && css('--iw') === '330px', 'ตั้งหน้า → ช่องชื่อหน้า 100 · แคปซูล 200+100+30', [css('--pw'), css('--iw')]);

  w.islandClass('คาบ 3 · ม.2/1 · อีก 12 นาที');
  ok(el.classList.contains('has-class') && chipText() === 'คาบ 3 · ม.2/1 · อีก 12 นาที', 'islandClass(ข้อความ) → ชิปขึ้นพร้อมข้อความ');
  ok(css('--pw') === '100px', 'จอกว้าง: ชิปอยู่ร่วมกับชื่อหน้า (ไม่ย่อ)', css('--pw'));
  el.querySelector('.island-idle-class-text').textContent = 'X'; // ถ้าไปเขียนทับอีกครั้ง แปลว่ามีการวาดซ้ำ
  w.islandClass('คาบ 3 · ม.2/1 · อีก 12 นาที');
  ok(chipText() === 'X', 'ข้อความเดิมซ้ำ = ไม่ทำอะไร (เรียกทุกนาทีได้ ไม่วัด/วาดซ้ำ)');

  narrow = true;
  w.islandClass('คาบ 3 · ม.2/1 · อีก 11 นาที');
  ok(chipText() === 'คาบ 3 · ม.2/1 · อีก 11 นาที' && css('--pw') === '0px' && css('--iw') === '230px', 'มือถือ: มีชิป + มีชื่อหน้า → ช่องชื่อหน้าเหลือแค่ไอคอน (ในเทสต์นี้ไอคอนกว้าง 0 จึงเป็น 0 · 200+0+30)', [css('--pw'), css('--iw')]);
  w.islandTimer('12:30');
  ok(el.classList.contains('has-timer') && el.classList.contains('has-class') && css('--pw') === '100px', 'ชิปจับเวลาเดิน → ชิปคาบสอนถูกซ่อน (CSS) และชื่อหน้ากลับมา', css('--pw'));
  w.islandTimer(null);
  ok(css('--pw') === '0px', 'ชิปจับเวลาหาย → ชิปคาบสอนกลับมา ชื่อหน้าย่ออีกครั้ง', css('--pw'));
  w.islandClass(null);
  ok(!el.classList.contains('has-class') && css('--pw') === '100px' && css('--iw') === '330px', 'islandClass(null) → ชิปหาย ชื่อหน้ากลับมา', [css('--pw'), css('--iw')]);
  w.islandClass(''); w.islandClass(undefined);
  ok(!el.classList.contains('has-class'), 'ข้อความว่าง/undefined = ซ่อน');
  narrow = false;

  const calls = [];
  w.islandOnMinute(() => { throw new Error('boom'); });
  w.islandOnMinute(d => calls.push(d));
  Object.defineProperty(w.document, 'hidden', { configurable: true, get: () => false });
  w.document.dispatchEvent(new w.Event('visibilitychange'));
  ok(calls.length === 1 && calls[0] instanceof w.Date, 'islandOnMinute: กลับมาเปิดแท็บ/ขึ้นนาทีใหม่ → เรียก hook พร้อมเวลาปัจจุบัน', calls.length);
  ok(errs.length === 1, 'hook ที่พังไม่ทำให้ hook ตัวอื่น/นาฬิกาหยุด (แค่ log error)', errs.length);

  console.log('C. islandSave(\'saved\', { missing })');
  const done = () => w.__ui.clear('save');
  w.islandSave('saved', { missing: 7 });
  ok(text() === 'บันทึกแล้ว · เหลืออีก 7 คนที่ยังไม่มีคะแนน' && el.dataset.kind === 'success', 'missing = 7 → \"บันทึกแล้ว · เหลืออีก 7 คนที่ยังไม่มีคะแนน\"', [text(), el.dataset.kind]);
  done(); w.islandSave('saved', { missing: 0 });
  ok(text() === 'บันทึกแล้ว', 'missing = 0 → \"บันทึกแล้ว\" เฉยๆ');
  done(); w.islandSave('saved');
  ok(text() === 'บันทึกแล้ว', 'ไม่ส่ง info (ผู้เรียกเดิมทุกที่) → เหมือนเดิม');
  done(); w.islandSave('saved', { missing: NaN });
  ok(text() === 'บันทึกแล้ว', 'missing ไม่ใช่ตัวเลข → ไม่แสดง');
  done(); w.islandSave('saved', { missing: 2.9 });
  ok(text() === 'บันทึกแล้ว · เหลืออีก 2 คนที่ยังไม่มีคะแนน', 'เศษถูกตัดทิ้ง ไม่โชว์ทศนิยม');
  done();

  console.log('E. มือถือ: ชิปคาบ (ย่อ) ↔ ชื่อหน้า สลับกันเอง');
  // อินสแตนซ์แยก + นาฬิกาปลอม (เดินเวลาเองได้) · ไอคอนหน้ากว้าง 14 ห่างจากซ้ายช่อง 20 → ช่องชื่อหน้าตอนเหลือแค่ไอคอน = 34 · ชื่อหน้าเต็ม = 100
  function makeIsland(opts = {}) {
    const d = new JSDOM(`<!doctype html><body>${islandHtml}</body>`, { url: 'https://example.test/', runScripts: 'outside-only' });
    const x = d.window, st = { narrow: opts.narrow !== false, now: 0, q: [], id: 0, mainW: opts.mainW || 200 };
    x.matchMedia = () => ({ get matches() { return st.narrow; } });
    x.requestAnimationFrame = fn => { fn(0); return 0; };
    x.setTimeout = (fn, ms) => { const id = ++st.id; st.q.push({ id, at: st.now + (ms || 0), fn }); return id; };
    x.clearTimeout = id => { st.q = st.q.filter(t => t.id !== id); };
    st.advance = ms => {
      const end = st.now + ms;
      for (;;) {
        const due = st.q.filter(t => t.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0];
        if (!due) break;
        st.q = st.q.filter(t => t !== due); st.now = due.at; due.fn();
      }
      st.now = end;
    };
    Object.defineProperty(x, 'innerWidth', { configurable: true, writable: true, value: opts.innerWidth || 390 });
    Object.defineProperty(x.HTMLElement.prototype, 'offsetWidth', { configurable: true, get() {
      return this.classList.contains('pg') ? 100 : this.classList.contains('pg-ico') ? 14 : this.classList.contains('island-idle-main') ? st.mainW : 0; } });
    Object.defineProperty(x.HTMLElement.prototype, 'offsetLeft', { configurable: true, get() { return this.classList.contains('pg-ico') ? 20 : 0; } });
    x.console.error = () => {};
    x.eval(R('js/island.js') + '\nwindow.__ui = IslandUI;');
    const e = x.document.getElementById('island');
    return { x, st, e, css: n => e.style.getPropertyValue(n), phase: () => e.dataset.phase, chip: () => e.querySelector('.island-idle-class-text').textContent };
  }
  const LONG = 'คาบ 3 · ม.2/1 · อีก 12 นาที', SHORT = 'คาบ 3 · ม.2/1 · 12m';
  const pageA = { label: 'บันทึกคะแนน', icon: '' }, pageB = { label: 'ตารางสอน', icon: '' };

  let m = makeIsland();
  m.x.__ui.setPage(pageA);
  ok(!m.e.classList.contains('alt') && !m.phase(), 'มีชื่อหน้าแต่ยังไม่มีชิปคาบ → ไม่สลับ (แสดงแบบเดิม)');
  m.x.islandClass(LONG, SHORT);
  ok(m.chip() === SHORT, 'จอแคบ → ชิปใช้ข้อความย่อ', m.chip());
  ok(m.e.classList.contains('alt') && m.phase() === 'class', 'มีชิป + มีชื่อหน้า → เริ่มสลับที่จังหวะชิป', [m.e.className, m.phase()]);
  ok(m.css('--pw') === '34px' && m.css('--iw') === '264px', 'จังหวะชิป: ช่องชื่อหน้าเหลือไอคอน (20+14=34) · แคปซูล 200+34+30', [m.css('--pw'), m.css('--iw')]);
  m.st.advance(4999);
  ok(m.phase() === 'class', 'ชิปอยู่ครบ 5 วินาที (4.999 วินาทียังเป็นชิป)', m.phase());
  m.st.advance(1);
  ok(m.phase() === 'page' && m.css('--pw') === '100px' && m.css('--iw') === '330px', 'ครบ 5 วินาที → จังหวะชื่อหน้า: ช่องเต็ม 100 · แคปซูล 200+100+30', [m.phase(), m.css('--pw'), m.css('--iw')]);
  m.st.advance(2999);
  ok(m.phase() === 'page', 'ชื่อหน้าอยู่ครบ 3 วินาที');
  m.st.advance(1);
  ok(m.phase() === 'class' && m.css('--pw') === '34px', 'ครบ 3 วินาที → กลับไปชิป', [m.phase(), m.css('--pw')]);
  m.st.advance(8000 * 3);
  ok(m.phase() === 'class', 'วนต่อเนื่อง (ครบ 3 รอบ 5+3 วินาที → กลับมาที่ชิป)', m.phase());

  m.st.advance(3000);   // กำลังอยู่จังหวะชิป → เปลี่ยนหน้า
  m.x.__ui.setPage(pageB);
  ok(m.phase() === 'page' && m.css('--pw') === '100px', 'เปลี่ยนหน้า → โชว์ชื่อหน้าใหม่ทันที', [m.phase(), m.css('--pw')]);
  ok(m.e.querySelector('.pg.on .pg-name').textContent === 'ตารางสอน', 'ชื่อที่แสดงคือหน้าใหม่');
  m.st.advance(2999); ok(m.phase() === 'page', 'หลังเปลี่ยนหน้าอยู่ครบ 3 วินาที (นับใหม่ ไม่ใช่เวลาที่เหลือของรอบเก่า)');
  m.st.advance(1);    ok(m.phase() === 'class', 'แล้วกลับไปชิป');
  m.x.__ui.setPage(pageB);
  ok(m.phase() === 'class', 'ตั้งหน้าเดิมซ้ำ (เช่น setActiveNav ถูกเรียกอีก) → ไม่รีเซ็ตจังหวะ', m.phase());

  m.x.__ui.setPage(null);
  ok(!m.e.classList.contains('alt') && !m.phase() && m.css('--pw') === '0px', 'กลับหน้าหลัก (ไม่มีชื่อหน้า) → เลิกสลับ แสดงชิปเฉยๆ', [m.e.className, m.phase(), m.css('--pw')]);
  const pending = m.st.q.length;
  m.st.advance(20000);
  ok(!m.phase() && m.st.q.length <= pending, 'เลิกสลับแล้วไม่มีตัวจับเวลาจังหวะค้าง (ไม่วนเปล่า)');
  m.x.__ui.setPage(pageA);
  ok(m.phase() === 'page', 'ออกจากหน้าหลักไปหน้าที่มีชื่อ (ชิปขึ้นอยู่) → โชว์ชื่อหน้าก่อน', m.phase());

  m.st.advance(3000);
  m.x.islandTimer('12:30');
  ok(!m.e.classList.contains('alt') && !m.phase() && m.css('--pw') === '100px', 'ชิปจับเวลาเดิน → เลิกสลับ (ชิปคาบถูกซ่อน) ชื่อหน้ากลับมาเต็ม', [m.e.className, m.css('--pw')]);
  m.x.islandTimer(null);
  ok(m.e.classList.contains('alt') && m.phase() === 'class', 'จับเวลาหาย → กลับมาสลับ เริ่มที่ชิป', m.phase());

  m.x.dispatchEvent(new m.x.Event('offline'));
  ok(m.e.classList.contains('is-offline') && !m.e.classList.contains('alt') && !m.phase(), 'ออฟไลน์ → ไม่สลับ (แถบออฟไลน์ใช้พื้นที่) กลับไปแบบเดิม', m.e.className);
  ok(m.css('--pw') === '0px', 'ออฟไลน์ + ชิป → ช่องชื่อหน้าย่อเป็น 0 เหมือนเดิม', m.css('--pw'));

  m.x.islandClass(null);
  ok(!m.e.classList.contains('has-class') && !m.e.classList.contains('alt'), 'ชิปหาย → เลิกสลับ');

  // ไม่ส่งข้อความย่อ (ผู้เรียกเก่า) → ใช้ข้อความเต็มและยังสลับได้
  m = makeIsland(); m.x.__ui.setPage(pageA); m.x.islandClass(LONG);
  ok(m.chip() === LONG && m.e.classList.contains('alt'), 'ไม่ส่ง short → ใช้ข้อความเต็ม และสลับตามปกติ', m.chip());

  // จอกว้าง: ไม่สลับ ไม่ใช้ข้อความย่อ · ย่อจอ → เปลี่ยนเอง
  m = makeIsland({ narrow: false }); m.x.__ui.setPage(pageA); m.x.islandClass(LONG, SHORT);
  ok(m.chip() === LONG && !m.e.classList.contains('alt') && !m.phase() && m.css('--pw') === '100px', 'จอกว้าง (>640px): ข้อความเต็ม · ไม่สลับ · ชื่อหน้าเต็มอยู่ร่วมกับชิป', [m.chip(), m.css('--pw')]);
  m.st.narrow = true; m.x.dispatchEvent(new m.x.Event('resize'));
  ok(m.chip() === SHORT && m.e.classList.contains('alt') && m.phase() === 'class', 'ย่อหน้าต่างเป็นจอแคบ → ข้อความย่อ + เริ่มสลับ', [m.chip(), m.phase()]);
  m.st.narrow = false; m.x.dispatchEvent(new m.x.Event('resize'));
  ok(m.chip() === LONG && !m.e.classList.contains('alt') && !m.phase(), 'ขยายกลับเป็นจอกว้าง → ข้อความเต็ม + เลิกสลับ', [m.chip(), m.phase()]);

  // ข้อความเดิมซ้ำ (ทุกนาที) ไม่วาดซ้ำและไม่รีเซ็ตจังหวะ
  m = makeIsland(); m.x.__ui.setPage(pageA); m.x.islandClass(LONG, SHORT); m.st.advance(5000);
  m.e.querySelector('.island-idle-class-text').textContent = 'X';
  m.x.islandClass(LONG, SHORT);
  ok(m.chip() === 'X' && m.phase() === 'page', 'ข้อความ+ย่อเดิมซ้ำ = ไม่ทำอะไร ไม่รีเซ็ตจังหวะ', [m.chip(), m.phase()]);
  m.x.islandClass(LONG.replace('12', '11'), SHORT.replace('12', '11'));
  ok(m.chip() === 'คาบ 3 · ม.2/1 · 11m' && m.phase() === 'page', 'ข้อความเปลี่ยน (ขึ้นนาทีใหม่) → วาดใหม่ แต่จังหวะเดินต่อ ไม่รีเซ็ต', [m.chip(), m.phase()]);

  // ไม่พอที่บนจอเล็กมาก → ซ่อนวันที่ชั่วคราว
  m = makeIsland({ innerWidth: 320, mainW: 300 }); m.x.__ui.setPage(pageA); m.x.islandClass(LONG, SHORT);
  ok(m.e.classList.contains('alt') && m.e.classList.contains('tight'), 'กว้างเกินจอ (300+34+30 > 320-24) → .tight ซ่อนวันที่', m.e.className);
  m.st.mainW = 150; m.st.advance(8000);
  ok(!m.e.classList.contains('tight'), 'ชิปสั้นลงจนพอที่ → วันที่กลับมา', m.e.className);
  m = makeIsland({ innerWidth: 390, mainW: 200 }); m.x.__ui.setPage(pageA); m.x.islandClass(LONG, SHORT);
  ok(!m.e.classList.contains('tight'), 'พอที่ → ไม่ซ่อนวันที่ (200+34+30 ≤ 366)');

  // การเรียก sizeIdle จาก rAF/promise (ส่งอาร์กิวเมนต์มาด้วย) ต้องไม่ถูกนับเป็นเปลี่ยนหน้า
  m = makeIsland(); m.x.__ui.setPage(pageA); m.x.islandClass(LONG, SHORT); m.st.advance(5000); m.st.advance(3000);
  ok(m.phase() === 'class', 'เตรียมสถานะ: จังหวะชิป');
  m.x.dispatchEvent(new m.x.Event('resize'));
  ok(m.phase() === 'class', 'ย่อ/ขยายจอ (rAF ส่งเวลามาเป็นอาร์กิวเมนต์) ไม่ดีดไปจังหวะชื่อหน้า', m.phase());

  console.log('D. CSS / มาร์กอัป');
  const style = R('css/style.css').replace(/\r/g, '');
  const iShow = style.indexOf('.island.has-class .island-idle-class { display: inline-flex; }');
  const iHide = style.indexOf('.island.has-timer .island-idle-class { display: none; }');
  ok(iShow > 0 && iHide > iShow, 'ชิปจับเวลามาก่อน: กฎซ่อนชิปคาบสอนตอนมี has-timer อยู่หลังกฎแสดง (ความจำเพาะเท่ากัน ตัวหลังชนะ)');
  ok(/@media \(max-width: 640px\) \{\s*\.island\.has-class:not\(\.has-timer\):not\(\.alt\) \.island-idle-date \{ display: none; \}/.test(style), 'มือถือ: ซ่อนวันที่เมื่อมีชิปและไม่ได้สลับ (.alt) — JS ใช้ 640px เท่ากัน');
  ok(/\.island\.alt\[data-phase="page"\] \.island-idle-class \{ display: none; \}/.test(style), 'จังหวะ page: ซ่อนชิปคาบ (ช่องชื่อหน้าเต็ม)');
  ok(/\.island\.alt\.tight \.island-idle-date \{ display: none; \}/.test(style), 'ไม่พอที่ (.tight): ซ่อนวันที่');
  ok(/prefers-reduced-motion: reduce\) \{ \.island\.alt \.island-idle-class \{ animation: none; \}/.test(style), 'ผู้ใช้ลดแอนิเมชัน: ไม่เลื่อน');
  ok(/@keyframes island-swap/.test(style), 'มีแอนิเมชันตอนสลับ');
  ok(!/island-idle-class[^{]*\{[^}]*!important/.test(style), 'ไม่ใช้ !important (กฎของโปรเจกต์)');

  console.log(`\nผลรวม: ผ่าน ${pass}, ไม่ผ่าน ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
