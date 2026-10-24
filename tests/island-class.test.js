// ทดสอบชิปคาบสอนบน Dynamic Island (\"คาบ 3 · ม.2/1 · อีก 12 นาที\" / \"ถัดไป 13:20 · ม.4/2\")
//   ส่วน A ตรรกะ กำลังสอน/ถัดไป/ใกล้คาบ (ttChipInfo ใน js/timetable.js จริง รันใน vm)
//   ส่วน B การส่งข้อความเข้า Island (ttChipSync / ttChipSet / ttChipReload / islandOnMinute)
//   ส่วน C ฝั่ง Island: islandClass · ย่อช่องชื่อหน้าบนมือถือ · ชิปจับเวลามาก่อน · hook รายนาที · islandSave('saved', { missing })
//   ส่วน E มือถือ: ชิปคาบ (ข้อความย่อ) สลับกับชื่อหน้า 5 วิ / 3 วิ ในช่องข้อความช่องเดียว · วันที่ + ไอคอนหน้าอยู่ที่เดิม · แคปซูลไม่ขยับตอนสลับ · ข้อความสั้นลงไม่หดกลับ (10m → 9m) · เปลี่ยนหน้า = โชว์ชื่อหน้าก่อน · ไม่พอที่ = ตัดด้วย …
//   ส่วน F วันที่แสดงตลอด: หน้าหลัก · ชิปจับเวลา · ชิปคาบ · ออฟไลน์ (ไม่มีกฎ CSS ซ่อนวันที่ และ JS ไม่ซ่อนเอง)
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

  // jsdom ไม่มี layout → จำลองความกว้างตามกติกา CSS ที่เกี่ยวข้อง (ตัวอักษรละ 8px)
  //   .pg-name = ข้อความ แต่ไม่ต่ำกว่า --sw และไม่เกิน --sm · .pg = (ขีด + ไอคอน + ระยะห่าง = 40) + .pg-name
  //   .island-idle-class-text = ข้อความ แต่ไม่ต่ำกว่า --cw · .island-idle-main (วันที่ · ป้ายออฟไลน์ · ชิปจับเวลา) = st.mainW
  const CH = 8, PREFIX = 40, tw = s => s.length * CH, px = n => n + 'px';
  function mockLayout(x, st) {
    const v = n => { const r = parseFloat(x.document.getElementById('island').style.getPropertyValue(n)); return Number.isFinite(r) ? r : null; };
    const nameW = n => { const nat = tw(n.textContent), sm = v('--sm'); return Math.max(sm === null ? nat : Math.min(nat, sm), v('--sw') || 0); };
    Object.defineProperty(x.HTMLElement.prototype, 'offsetWidth', { configurable: true, get() {
      const c = this.classList;
      if (c.contains('pg-name')) return nameW(this);
      if (c.contains('pg')) { const n = this.querySelector('.pg-name'); return n ? PREFIX + nameW(n) : 0; }
      if (c.contains('island-idle-class-text')) return Math.max(tw(this.textContent), v('--cw') || 0);
      if (c.contains('island-idle-main')) return st.mainW;
      return 0;
    } });
  }
  const L = n => `คาบ 3 · ม.2/1 · อีก ${n} นาที`, S = n => `คาบ 3 · ม.2/1 · ${n}m`;   // รูปเต็ม / รูปย่อ (ตรงกับ ttChipInfo)
  const PA = 'บันทึกคะแนน', PB = 'ตารางสอน';
  const pageA = { label: PA, icon: '' }, pageB = { label: PB, icon: '' };

  const dom = new JSDOM(`<!doctype html><body>${islandHtml}</body>`, { url: 'https://example.test/', runScripts: 'outside-only' });
  const w = dom.window;
  let narrow = false; const errs = [];
  w.matchMedia = () => ({ get matches() { return narrow; } });
  w.requestAnimationFrame = fn => w.setTimeout(fn, 0); // jsdom ไม่มีให้ (island.js ใช้ตอนตั้งหน้าครั้งแรกและตอนย่อขยายจอ)
  w.console.error = (...a) => errs.push(a);
  mockLayout(w, { mainW: 100 });
  w.eval(R('js/island.js') + '\nwindow.__ui = IslandUI;');
  const el = w.document.getElementById('island');
  const css = n => el.style.getPropertyValue(n);
  const chipText = () => el.querySelector('.island-idle-class-text').textContent;
  const slot = () => el.querySelector('.pg.on .pg-name').textContent;
  const text = () => el.querySelector('.island-text').textContent;

  ok(el.querySelector('.island-idle-main .island-idle-class .island-idle-class-ico svg'), 'มาร์กอัปจริง: ชิปอยู่ใน .island-idle-main (ความกว้างถูกวัดรวม) และมีไอคอน');
  ok(!el.classList.contains('has-class'), 'เริ่มต้นไม่มีชิป');
  w.__ui.setPage(pageA);
  const PW_A = px(PREFIX + tw(PA)), IW_A = px(100 + PREFIX + tw(PA) + 30);
  ok(css('--pw') === PW_A && css('--iw') === IW_A, 'ตั้งหน้า → ช่องชื่อหน้า = ขีด+ไอคอน+ชื่อ · แคปซูล = กลุ่มวันที่ + ช่องชื่อหน้า + 30', [css('--pw'), css('--iw')]);

  w.islandClass(L(12));
  ok(el.classList.contains('has-class') && chipText() === L(12), 'islandClass(ข้อความ) → ชิปขึ้นพร้อมข้อความ');
  ok(css('--pw') === PW_A && !el.classList.contains('alt'), 'จอกว้าง: ชิปอยู่ร่วมกับชื่อหน้า (ไม่สลับ ไม่ย่อ)', css('--pw'));
  ok(css('--cw') === px(tw(L(12))), 'จอกว้าง: ล็อกความกว้างข้อความชิป (--cw)', css('--cw'));
  el.querySelector('.island-idle-class-text').textContent = 'X'; // ถ้าไปเขียนทับอีกครั้ง แปลว่ามีการวาดซ้ำ
  w.islandClass(L(12));
  ok(chipText() === 'X', 'ข้อความเดิมซ้ำ = ไม่ทำอะไร (เรียกทุกนาทีได้ ไม่วัด/วาดซ้ำ)');
  w.islandClass(L(9));
  ok(chipText() === L(9) && css('--cw') === px(tw(L(12))), 'จอกว้าง: อีก 12 → อีก 9 นาที ข้อความสั้นลง แต่ความกว้างชิปไม่หดกลับ', [chipText(), css('--cw')]);
  w.islandClass(null);
  ok(css('--cw') === '0px', 'ชิปหาย → ล็อกความกว้างถูกล้าง (ชิปรอบหน้าเริ่มวัดใหม่)', css('--cw'));

  narrow = true;
  w.islandClass(L(11));
  ok(el.classList.contains('alt') && el.dataset.phase === 'class' && chipText() === L(11), 'มือถือ: มีชิป + มีชื่อหน้า → สลับเริ่มที่จังหวะชิป', [el.className, el.dataset.phase]);
  ok(slot() === L(11) && css('--sw') === px(tw(L(11))) && css('--pw') === px(PREFIX + tw(L(11))), 'จังหวะชิป: ข้อความในช่องชื่อหน้า = ชิป · ช่องกว้างเท่าข้อความที่ยาวสุด (ชิปยาวกว่าชื่อหน้า)', [slot(), css('--sw'), css('--pw')]);
  w.islandTimer('12:30');
  ok(el.classList.contains('has-timer') && el.classList.contains('has-class') && !el.classList.contains('alt') && slot() === PA && css('--sw') === '0px' && css('--pw') === PW_A, 'ชิปจับเวลาเดิน → ชิปคาบสอนถูกซ่อน (CSS) เลิกสลับ ชื่อหน้ากลับมา', [slot(), css('--sw'), css('--pw')]);
  w.islandTimer(null);
  ok(el.classList.contains('alt') && el.dataset.phase === 'class' && slot() === L(11), 'ชิปจับเวลาหาย → กลับมาสลับ เริ่มที่ชิป', [el.className, slot()]);
  w.islandClass(null);
  ok(!el.classList.contains('has-class') && !el.classList.contains('alt') && slot() === PA && css('--pw') === PW_A && css('--iw') === IW_A && css('--sw') === '0px', 'islandClass(null) → ชิปหาย เลิกสลับ ชื่อหน้ากลับมา ล็อกความกว้างถูกล้าง', [css('--pw'), css('--iw'), css('--sw')]);
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
  ok(text() === 'บันทึกแล้ว · เหลืออีก 7 คนที่ยังไม่มีคะแนน' && el.dataset.kind === 'success', 'missing = 7 → "บันทึกแล้ว · เหลืออีก 7 คนที่ยังไม่มีคะแนน"', [text(), el.dataset.kind]);
  done(); w.islandSave('saved', { missing: 0 });
  ok(text() === 'บันทึกแล้ว', 'missing = 0 → "บันทึกแล้ว" เฉยๆ');
  done(); w.islandSave('saved');
  ok(text() === 'บันทึกแล้ว', 'ไม่ส่ง info (ผู้เรียกเดิมทุกที่) → เหมือนเดิม');
  done(); w.islandSave('saved', { missing: NaN });
  ok(text() === 'บันทึกแล้ว', 'missing ไม่ใช่ตัวเลข → ไม่แสดง');
  done(); w.islandSave('saved', { missing: 2.9 });
  ok(text() === 'บันทึกแล้ว · เหลืออีก 2 คนที่ยังไม่มีคะแนน', 'เศษถูกตัดทิ้ง ไม่โชว์ทศนิยม');
  done();

  console.log('E. มือถือ: ชิปคาบ (ย่อ) ↔ ชื่อหน้า สลับกันเองในช่องข้อความช่องเดียว');
  // อินสแตนซ์แยก + นาฬิกาปลอม (เดินเวลาเองได้) · mockLayout: กลุ่มวันที่ 100 (ปรับได้) · ขีด+ไอคอน 40 · ตัวอักษรละ 8
  function makeIsland(opts = {}) {
    const d = new JSDOM(`<!doctype html><body>${islandHtml}</body>`, { url: 'https://example.test/', runScripts: 'outside-only' });
    const x = d.window, st = { narrow: opts.narrow !== false, now: 0, q: [], id: 0, mainW: opts.mainW || 100 };
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
    mockLayout(x, st);
    x.console.error = () => {};
    x.eval(R('js/island.js') + '\nwindow.__ui = IslandUI;');
    const e = x.document.getElementById('island');
    return { x, st, e, css: n => e.style.getPropertyValue(n), phase: () => e.dataset.phase, chip: () => e.querySelector('.island-idle-class-text').textContent,
      slot: () => { const n = e.querySelector('.pg.on .pg-name'); return n ? n.textContent : null; } };
  }
  const resize = m => m.x.dispatchEvent(new m.x.Event('resize'));

  let m = makeIsland();
  m.x.__ui.setPage(pageA);
  ok(!m.e.classList.contains('alt') && !m.phase() && m.slot() === PA, 'มีชื่อหน้าแต่ยังไม่มีชิปคาบ → ไม่สลับ (แสดงแบบเดิม)');
  m.x.islandClass(L(12), S(12));
  ok(m.chip() === S(12), 'จอแคบ → ชิปใช้ข้อความย่อ', m.chip());
  ok(m.e.classList.contains('alt') && m.phase() === 'class', 'มีชิป + มีชื่อหน้า → เริ่มสลับที่จังหวะชิป', [m.e.className, m.phase()]);
  const BOX = Math.max(tw(PA), tw(S(12)));
  ok(m.slot() === S(12) && m.css('--sw') === px(BOX) && m.css('--pw') === px(PREFIX + BOX) && m.css('--iw') === px(100 + PREFIX + BOX + 30),
    'จังหวะชิป: ข้อความในช่อง = ชิป (ย่อ) · ช่องกว้างเท่าข้อความที่ยาวสุดของ ชิป/ชื่อหน้า (วัดทั้งคู่ตั้งแต่แรก) · แคปซูล = 100+40+กล่อง+30', [m.slot(), m.css('--sw'), m.css('--pw'), m.css('--iw')]);
  ok(tw(PA) < BOX, 'ข้อมูลทดสอบ: ชื่อหน้าสั้นกว่าชิป (สลับไปชื่อหน้าแล้วแคปซูลต้องไม่หด)');
  const IW0 = m.css('--iw'), PW0 = m.css('--pw'), ico0 = m.e.querySelector('.pg.on .pg-ico'), date0 = m.e.querySelector('.island-idle-date');
  m.st.advance(4999);
  ok(m.phase() === 'class' && m.slot() === S(12), 'ชิปอยู่ครบ 5 วินาที (4.999 วินาทียังเป็นชิป)', [m.phase(), m.slot()]);
  m.st.advance(1);
  ok(m.phase() === 'page' && m.slot() === PA, 'ครบ 5 วินาที → ข้อความในช่องเป็นชื่อหน้า', [m.phase(), m.slot()]);
  ok(m.css('--iw') === IW0 && m.css('--pw') === PW0 && m.css('--sw') === px(BOX), 'สลับเป็นชื่อหน้า (สั้นกว่า) → ช่อง/แคปซูลขนาดเท่าเดิม ไม่หด', [m.css('--iw'), IW0]);
  ok(m.e.querySelector('.pg.on .pg-ico') === ico0 && m.e.querySelector('.island-idle-date') === date0, 'ไอคอนหน้า + วันที่ อยู่ที่เดิม (โหนดเดิม ไม่ถูกสร้างใหม่ตอนสลับ)');
  ok(m.e.querySelector('.pg.on .pg-name').classList.contains('swap'), 'สลับจังหวะ → ข้อความเลื่อนขึ้นจางเข้า (.swap)');
  m.st.advance(2999);
  ok(m.phase() === 'page', 'ชื่อหน้าอยู่ครบ 3 วินาที');
  m.st.advance(1);
  ok(m.phase() === 'class' && m.slot() === S(12) && m.css('--iw') === IW0, 'ครบ 3 วินาที → กลับไปชิป แคปซูลเท่าเดิม', [m.phase(), m.css('--iw')]);
  const sizes = new Set();
  for (let i = 0; i < 6; i++) { m.st.advance(5000); sizes.add(m.css('--iw') + '|' + m.css('--pw')); m.st.advance(3000); sizes.add(m.css('--iw') + '|' + m.css('--pw')); }
  ok(m.phase() === 'class' && sizes.size === 1 && sizes.has(IW0 + '|' + PW0), 'วนต่อเนื่อง 6 รอบ (5+3 วินาที): แคปซูล/ช่องขนาดเดิมทุกจังหวะ ไม่หด/ขยายเลย', [...sizes]);

  console.log('E. ล็อกความกว้าง: ข้อความสั้นลงไม่หดกลับ (10m → 9m)');
  m = makeIsland(); m.x.__ui.setPage(pageA);
  m.x.islandClass(L(10), S(10));
  const BOX10 = Math.max(tw(PA), tw(S(10))), IW10 = m.css('--iw');
  ok(m.css('--sw') === px(BOX10), 'เริ่มที่ 10m → ช่องกว้างเท่าข้อความยาวสุด', m.css('--sw'));
  m.e.querySelector('.pg.on .pg-name').classList.remove('swap');
  m.x.islandClass(L(9), S(9));
  ok(m.slot() === S(9) && m.chip() === S(9), '10m → 9m: ข้อความในช่องเปลี่ยนตามจริง', [m.slot(), m.chip()]);
  ok(m.css('--sw') === px(BOX10) && m.css('--iw') === IW10, '10m → 9m: ช่อง/แคปซูลไม่หดกลับ (กว้างเท่าเดิม)', [m.css('--sw'), m.css('--iw'), IW10]);
  ok(!m.e.querySelector('.pg.on .pg-name').classList.contains('swap'), 'ตัวเลขนับถอยหลังเปลี่ยน ≠ สลับจังหวะ → ไม่เล่นแอนิเมชันทุกนาที');
  m.x.islandClass(L(8), S(8));
  ok(m.css('--sw') === px(BOX10) && m.css('--iw') === IW10, 'ลดต่อเนื่อง 9m → 8m ก็ยังไม่หด');
  const LONGER = 'คาบ 3 · ม.2/1 · 1h 10m';
  m.x.islandClass(L(70), LONGER);
  ok(tw(LONGER) > BOX10 && m.css('--sw') === px(tw(LONGER)) && m.css('--iw') === px(100 + PREFIX + tw(LONGER) + 30), 'ข้อความยาวขึ้น (1h 10m) → ขยายครั้งเดียวให้พอดี', [m.css('--sw'), m.css('--iw')]);
  m.x.islandClass(L(69), S(69));
  ok(m.css('--sw') === px(tw(LONGER)), 'กลับเป็นข้อความสั้น → ค้างที่ความกว้างยาวสุดเดิม ไม่หด', m.css('--sw'));
  resize(m);
  ok(m.css('--sw') === px(tw(LONGER)), 'ย่อ/ขยายจอแต่ความกว้างเท่าเดิม (เช่น แถบเบราว์เซอร์) → ไม่ล็อกใหม่', m.css('--sw'));
  m.x.islandClass(L(5), S(5));
  m.x.innerWidth = 360; resize(m);
  ok(m.css('--sw') === px(Math.max(tw(PA), tw(S(5)))), 'ความกว้างจอเปลี่ยน (หมุนจอ) → ล็อกใหม่จากข้อความปัจจุบัน', m.css('--sw'));

  m = makeIsland(); m.x.__ui.setPage(pageA);
  m.x.islandClass(L(10), S(10)); m.x.islandClass(L(5), S(5));
  ok(m.css('--sw') === px(BOX10), 'เตรียมสถานะ: ล็อกที่ 10m แล้วข้อความเหลือ 5m');
  m.x.__ui.setPage(pageB);
  ok(m.css('--sw') === px(Math.max(tw(PB), tw(S(5)))) && m.slot() === PB, 'เปลี่ยนหน้า → ล็อกใหม่ (วัดจากชื่อหน้าใหม่ + ชิปปัจจุบัน) ไม่ลากความกว้างเก่ามา', [m.css('--sw'), m.slot()]);
  m = makeIsland(); m.x.__ui.setPage(pageA);
  m.x.islandClass(L(10), S(10)); m.x.islandClass(L(5), S(5)); m.x.islandClass(null);
  ok(!m.e.classList.contains('alt') && m.css('--sw') === '0px', 'ชิปหาย → เลิกสลับ ล็อกถูกล้าง');
  m.x.islandClass(L(5), S(5));
  ok(m.css('--sw') === px(Math.max(tw(PA), tw(S(5)))), 'ชิปกลับมา (ข้อความสั้นกว่าเดิม) → เริ่มวัดใหม่ ไม่ใช้ความกว้างรอบก่อน', m.css('--sw'));

  console.log('E. เปลี่ยนหน้า / ชิปจับเวลา / ออฟไลน์ / จอกว้าง');
  m = makeIsland(); m.x.__ui.setPage(pageA); m.x.islandClass(L(12), S(12));
  m.st.advance(3000);   // กำลังอยู่จังหวะชิป → เปลี่ยนหน้า
  m.x.__ui.setPage(pageB);
  ok(m.phase() === 'page' && m.slot() === PB, 'เปลี่ยนหน้า → โชว์ชื่อหน้าใหม่ทันที', [m.phase(), m.slot()]);
  ok(m.e.querySelector('.pg.on .pg-name').textContent === 'ตารางสอน', 'ชื่อที่แสดงคือหน้าใหม่');
  m.st.advance(2999); ok(m.phase() === 'page', 'หลังเปลี่ยนหน้าอยู่ครบ 3 วินาที (นับใหม่ ไม่ใช่เวลาที่เหลือของรอบเก่า)');
  m.st.advance(1);    ok(m.phase() === 'class' && m.slot() === S(12), 'แล้วกลับไปชิป');
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
  ok(!m.e.classList.contains('alt') && !m.phase() && m.slot() === PA && m.css('--sw') === '0px' && m.css('--pw') === px(PREFIX + tw(PA)), 'ชิปจับเวลาเดิน → เลิกสลับ (ชิปคาบถูกซ่อน) ชื่อหน้ากลับมาเต็ม', [m.e.className, m.css('--pw')]);
  m.x.islandTimer(null);
  ok(m.e.classList.contains('alt') && m.phase() === 'class', 'จับเวลาหาย → กลับมาสลับ เริ่มที่ชิป', m.phase());

  const sw0 = m.css('--sw');
  m.x.dispatchEvent(new m.x.Event('offline'));
  ok(m.e.classList.contains('is-offline') && m.e.classList.contains('alt') && m.phase() === 'class', 'ออฟไลน์ → ยังสลับต่อ (วันที่ + ป้ายออฟไลน์อยู่ครบ ช่องข้อความช่องเดียวไม่เปลี่ยนเลย์เอาต์)', [m.e.className, m.phase()]);
  ok(m.css('--sw') === sw0 && m.slot() === S(12), 'ออฟไลน์ + ชิป → ช่องข้อความเท่าเดิม', [m.css('--sw'), m.slot()]);
  m.st.advance(5000);
  ok(m.phase() === 'page' && m.slot() === PA, 'ออฟไลน์: ครบ 5 วินาทีก็สลับเป็นชื่อหน้าตามปกติ');
  m.x.dispatchEvent(new m.x.Event('online'));
  ok(!m.e.classList.contains('is-offline') && m.e.classList.contains('alt'), 'กลับมาออนไลน์ → ยังสลับต่อ');

  m.x.islandClass(null);
  ok(!m.e.classList.contains('has-class') && !m.e.classList.contains('alt'), 'ชิปหาย → เลิกสลับ');

  // ไม่ส่งข้อความย่อ (ผู้เรียกเก่า) → ใช้ข้อความเต็มและยังสลับได้
  m = makeIsland(); m.x.__ui.setPage(pageA); m.x.islandClass(L(12));
  ok(m.chip() === L(12) && m.slot() === L(12) && m.e.classList.contains('alt'), 'ไม่ส่ง short → ใช้ข้อความเต็ม และสลับตามปกติ', [m.chip(), m.slot()]);

  // จอกว้าง: ไม่สลับ ไม่ใช้ข้อความย่อ · ย่อจอ → เปลี่ยนเอง
  m = makeIsland({ narrow: false }); m.x.__ui.setPage(pageA); m.x.islandClass(L(12), S(12));
  ok(m.chip() === L(12) && !m.e.classList.contains('alt') && !m.phase() && m.slot() === PA && m.css('--pw') === px(PREFIX + tw(PA)), 'จอกว้าง (>640px): ข้อความเต็ม · ไม่สลับ · ชื่อหน้าเต็มอยู่ร่วมกับชิป', [m.chip(), m.css('--pw')]);
  m.st.narrow = true; m.x.innerWidth = 390; resize(m);
  ok(m.chip() === S(12) && m.e.classList.contains('alt') && m.phase() === 'class', 'ย่อหน้าต่างเป็นจอแคบ → ข้อความย่อ + เริ่มสลับ', [m.chip(), m.phase()]);
  m.st.narrow = false; resize(m);
  ok(m.chip() === L(12) && !m.e.classList.contains('alt') && !m.phase() && m.slot() === PA, 'ขยายกลับเป็นจอกว้าง → ข้อความเต็ม + เลิกสลับ ชื่อหน้ากลับมา', [m.chip(), m.phase(), m.slot()]);

  // ข้อความเดิมซ้ำ (ทุกนาที) ไม่วาดซ้ำและไม่รีเซ็ตจังหวะ
  m = makeIsland(); m.x.__ui.setPage(pageA); m.x.islandClass(L(12), S(12)); m.st.advance(5000);
  m.e.querySelector('.island-idle-class-text').textContent = 'X';
  m.x.islandClass(L(12), S(12));
  ok(m.chip() === 'X' && m.phase() === 'page', 'ข้อความ+ย่อเดิมซ้ำ = ไม่ทำอะไร ไม่รีเซ็ตจังหวะ', [m.chip(), m.phase()]);
  m.x.islandClass(L(11), S(11));
  ok(m.chip() === S(11) && m.phase() === 'page' && m.slot() === PA, 'ข้อความเปลี่ยน (ขึ้นนาทีใหม่) → วาดใหม่ แต่จังหวะเดินต่อ ไม่รีเซ็ต', [m.chip(), m.phase()]);

  console.log('E. ไม่พอที่ → ตัดข้อความด้วย … (วันที่ไม่หาย)');
  m = makeIsland({ innerWidth: 320, mainW: 150 }); m.x.__ui.setPage(pageA); m.x.islandClass(L(12), S(12));
  const ROOM = 320 - 24 - 150 - PREFIX - 30;
  ok(m.e.classList.contains('alt') && m.e.classList.contains('slot-cut') && m.css('--sm') === px(ROOM) && m.css('--sw') === px(ROOM), 'กว้างเกินจอ → .slot-cut + เพดาน --sm = ที่เหลือหลังหักวันที่/ขีด/ไอคอน', [m.e.className, m.css('--sm'), m.css('--sw')]);
  ok(m.css('--iw') === px(320 - 24) && !m.e.classList.contains('tight'), 'แคปซูลพอดีจอ (ไม่ล้น) และไม่มีโหมด .tight ซ่อนวันที่อีกแล้ว', [m.css('--iw'), m.e.className]);
  m.st.mainW = 60; m.st.advance(8000);
  ok(!m.e.classList.contains('slot-cut') && m.css('--sm') === '' && m.css('--sw') === px(BOX), 'มีที่พอ (กลุ่มวันที่เล็กลง) → เลิกตัด ช่องกลับเป็นความกว้างเต็ม', [m.e.className, m.css('--sm'), m.css('--sw')]);
  m = makeIsland({ innerWidth: 390, mainW: 100 }); m.x.__ui.setPage(pageA); m.x.islandClass(L(12), S(12));
  ok(!m.e.classList.contains('slot-cut') && m.css('--sm') === '', 'พอที่ → ไม่ตัด (100+40+152+30 ≤ 366)');
  m = makeIsland({ innerWidth: 320, mainW: 200 }); m.x.__ui.setPage(pageA); m.x.islandTimer('12:30');
  ok(m.e.classList.contains('slot-cut') && m.css('--sm') === px(320 - 24 - 200 - PREFIX - 30) && !m.e.classList.contains('alt'), 'ชิปจับเวลา + ชื่อหน้ายาวบนจอเล็ก (ไม่สลับ) → ตัดชื่อหน้าด้วย … แทนซ่อนวันที่', [m.e.className, m.css('--sm')]);

  console.log('F. วันที่แสดงตลอด');
  const dateOf = m => m.e.querySelector('.island-idle-date').textContent;
  const states = [
    ['หน้าหลัก', m => {}],
    ['หน้าหลัก + ชิปคาบ', m => m.x.islandClass(L(12), S(12))],
    ['หน้าที่มีชื่อ', m => m.x.__ui.setPage(pageA)],
    ['ชิปจับเวลา', m => { m.x.__ui.setPage(pageA); m.x.islandTimer('12:30'); }],
    ['ชิปคาบ (สลับ)', m => { m.x.__ui.setPage(pageA); m.x.islandClass(L(12), S(12)); }],
    ['ออฟไลน์', m => m.x.dispatchEvent(new m.x.Event('offline'))],
    ['ออฟไลน์ + ชิปคาบ + ชื่อหน้า', m => { m.x.__ui.setPage(pageA); m.x.islandClass(L(12), S(12)); m.x.dispatchEvent(new m.x.Event('offline')); }],
    ['ออฟไลน์ + ชิปจับเวลา', m => { m.x.__ui.setPage(pageA); m.x.islandTimer('12:30'); m.x.dispatchEvent(new m.x.Event('offline')); }],
  ];
  for (const [name, setup] of states) {
    for (const nw of [true, false]) {
      const mm = makeIsland({ narrow: nw, innerWidth: nw ? 320 : 1024, mainW: 150 }); setup(mm); mm.st.advance(8000);
      ok(/\S/.test(dateOf(mm)) && !mm.e.classList.contains('tight'), `${name} (${nw ? 'มือถือ 320px' : 'จอกว้าง'}): มีวันที่ และ JS ไม่ซ่อนวันที่`, [dateOf(mm), mm.e.className]);
    }
  }

  console.log('D. CSS / มาร์กอัป');
  const style = R('css/style.css').replace(/\r/g, '');
  const bare = style.replace(/\/\*[\s\S]*?\*\//g, '');   // ตัดคอมเมนต์ก่อนตรวจกฎ
  const rules = [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(r => [r[1].trim(), r[2]]);
  const iShow = style.indexOf('.island.has-class .island-idle-class { display: inline-flex; }');
  const iHide = style.indexOf('.island.has-timer .island-idle-class { display: none; }');
  ok(iShow > 0 && iHide > iShow, 'ชิปจับเวลามาก่อน: กฎซ่อนชิปคาบสอนตอนมี has-timer อยู่หลังกฎแสดง (ความจำเพาะเท่ากัน ตัวหลังชนะ)');
  const hidesDate = rules.filter(([sel, body]) => /\.island-idle-date\b/.test(sel) && /display:\s*none/.test(body));
  ok(hidesDate.length === 0, 'ไม่มีกฎ CSS ใดซ่อนวันที่ (หน้าหลัก/ชิปจับเวลา/ชิปคาบ/ออฟไลน์/ไม่พอที่)', hidesDate);
  ok(/@media \(max-width: 640px\) \{ \.island-idle-sep, \.island-idle-time \{ display: none; \} \}/.test(style), 'มือถือ: ซ่อนเฉพาะเวลา (แถบสถานะเครื่องมีอยู่แล้ว) วันที่อยู่ตลอด — JS ใช้ 640px เท่ากัน');
  ok(!rules.some(([sel]) => /is-offline[^,]*\.island-idle-(sep|time)/.test(sel)), 'ออฟไลน์ไม่ซ่อนเวลา (จอกว้าง) — วันที่ · เวลา อยู่ต่อท้ายด้วยป้ายออฟไลน์');
  ok(/\.island-idle-off \{[^}]*margin-left: 12px/.test(bare), 'ป้ายออฟไลน์เว้นระยะจากวันที่ (ไม่ชิดกัน)');
  const altHide = bare.indexOf('.island.alt .island-idle-class { display: none; }');
  ok(altHide > 0 && bare.lastIndexOf('{', altHide) < altHide && /@media \(max-width: 640px\) \{[^@]*\.island\.alt \.island-idle-class \{ display: none; \}/.test(bare), 'ตอนสลับ (.alt) ซ่อนชิปคาบตัวเดิมในกลุ่มวันที่ (ข้อความไปอยู่ในช่องเดียว) — อยู่ในบล็อกมือถือ');
  ok(bare.indexOf('.island.alt .island-idle-class { display: none; }') > bare.indexOf('.island.has-class .island-idle-class { display: inline-flex; }'), 'กฎซ่อนตอนสลับอยู่หลังกฎแสดงชิป (ความจำเพาะเท่ากัน ตัวหลังชนะ)');
  ok(!/data-phase/.test(bare.slice(bare.indexOf('.island.alt .island-idle-class'), bare.indexOf('.island.alt .island-idle-class') + 400)) , 'CSS ไม่ต้องพึ่ง data-phase เพื่อสลับอีก (JS สลับข้อความในช่องเอง)');
  ok(/\.pg-name \{[^}]*min-width: var\(--sw, 0px\)[^}]*max-width: var\(--sm, none\)/.test(bare), 'ช่องข้อความ (.pg-name): ล็อกความกว้างขั้นต่ำ --sw และเพดาน --sm จาก JS');
  ok(/\.island\.slot-cut \.pg-name \{[^}]*overflow: hidden[^}]*text-overflow: ellipsis[^}]*line-height: 18px/.test(bare), 'ไม่พอที่ (.slot-cut): ตัดด้วย … + บรรทัดสูงพอไม่ตัดสระ/วรรณยุกต์ไทย');
  ok(!/(^|\n)\.pg-name \{[^}]*overflow/.test(bare), 'ปกติ .pg-name ไม่ตั้ง overflow (กันตัดสระ/วรรณยุกต์ไทยบนบรรทัดสูง 1)');
  ok(/\.island-idle-class-text \{ min-width: var\(--cw, 0px\); \}/.test(bare), 'ข้อความชิปคาบ (ไม่สลับ) ล็อกความกว้างขั้นต่ำ --cw จาก JS');
  ok(/\.island\.alt \.pg-name\.swap \{ animation: island-swap \.35s ease; \}/.test(bare), 'สลับจังหวะ → แอนิเมชันเลื่อนขึ้นจากที่ข้อความ (.swap)');
  ok(/prefers-reduced-motion: reduce\) \{ \.island\.alt \.pg-name\.swap \{ animation: none; \}/.test(bare), 'ผู้ใช้ลดแอนิเมชัน: ไม่เลื่อน');
  ok(/@keyframes island-swap/.test(bare), 'มีแอนิเมชันตอนสลับ');
  ok(!/\.tight\b/.test(bare) && !/\.island\.has-class:not/.test(bare), 'ไม่เหลือโหมดเก่า: .tight / ซ่อนวันที่ตอนมีชิป');
  ok(!/\.island[^{]*\{[^}]*!important/.test(bare), 'ไม่ใช้ !important ในบล็อก .island (กฎของโปรเจกต์)');

  console.log(`\nผลรวม: ผ่าน ${pass}, ไม่ผ่าน ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
