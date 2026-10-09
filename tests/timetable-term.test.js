// ทดสอบตารางสอนแยกปีการศึกษา/ภาคเรียน + วิดเจ็ตหน้าแรกที่ไม่มีปุ่มแก้ไข (จำลอง Firestore + DOM ด้วย jsdom)
// วิธีรัน: node tests/timetable-term.test.js   (หรือ npm run test:tt)
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { JSDOM } = require('jsdom');

let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg, extra !== undefined ? JSON.stringify(extra) : ''); } };
const tick = () => new Promise(r => setTimeout(r, 0));

function makeEnv(docs, { courses = [] } = {}) {
  const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>');
  const store = new Map(Object.entries(docs)); // id → data
  const writes = [];
  const col = {
    get: async () => ({ docs: [...store].map(([id, d]) => ({ id, data: () => d })) }),
    doc: id => ({ set: async d => { writes.push({ id, d }); store.set(id, d); } }),
  };
  const courseSnap = { docs: courses.map(c => ({ id: c.id, data: () => c })) };
  const db = { collection: () => ({ doc: () => ({ collection: n => (n === 'timetable' ? col : { orderBy: () => ({ get: async () => courseSnap }) }) }) }) };
  const nav = [];
  const ctx = {
    window: dom.window, document: dom.window.document, console, db, writes, nav,
    AppState: { user: { uid: 'u1' }, courses: courses.map(c => ({ id: c.id })) },
    firebase: { firestore: { FieldValue: { serverTimestamp: () => 'TS' } } },
    islandSave() {}, islandUndo() {}, showToast() {}, showLoading() {}, clearLoading() {},
    escapeHtml: s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    setInterval, clearInterval, icon: () => '', uid4: () => 'id' + Math.random().toString(36).slice(2, 8), initNavPill() {}, openConfirmModal() {},
    openModal: html => { let m = dom.window.document.getElementById('modal'); if (!m) { m = dom.window.document.createElement('div'); m.id = 'modal'; dom.window.document.body.appendChild(m); } m.innerHTML = html; },
    closeModal: () => { const m = dom.window.document.getElementById('modal'); if (m) m.innerHTML = ''; },
    navigate: r => nav.push(r), downloadCsv() {}, loadSections: async () => [],
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'timetable.js'), 'utf8'), ctx);
  return ctx;
}
const run = (ctx, code) => vm.runInContext(code, ctx);
const entry = (o) => ({ id: 'e1', kind: 'class', day: 1, period: 0, span: 1, title: 'วิทย์', code: 'ว1', cls: 'ม.2/1', room: '', hue: 'blue', courseId: 'c1', ...o });
const periods = [{ start: '08:00', end: '08:50' }, { start: '08:50', end: '09:40' }];

(async () => {
  console.log('ภาคเรียนปัจจุบัน');
  const env = makeEnv({});
  const t = (y, m, d) => JSON.stringify(run(env, `ttCurrentTerm(new Date(${y}, ${m - 1}, ${d}))`));
  ok(t(2026, 10, 9) === '{"year":2569,"sem":1}', 'ต.ค. 2026 = 1/2569');
  ok(t(2026, 6, 1) === '{"year":2569,"sem":1}', 'มิ.ย. = ภาค 1');
  ok(t(2026, 11, 20) === '{"year":2569,"sem":2}', 'พ.ย. = ภาค 2 ปีเดียวกัน');
  ok(t(2027, 2, 1) === '{"year":2569,"sem":2}', 'ก.พ. ปีถัดไป = ภาค 2 ของปีการศึกษาเดิม');
  ok(run(env, `ttParseTerm('2569-1').year`) === 2569 && run(env, `ttParseTerm('main')`) === null && run(env, `ttParseTerm('2569-3')`) === null, 'อ่านรหัสภาคเรียน: รับ 2569-1 ปฏิเสธ main / ภาค 3');

  console.log('เลือกตารางต่อภาคเรียน');
  const key = run(env, 'ttTermKey(ttCurrentTerm())');
  const prevKey = run(env, 'ttTermKey(ttPrevTerm(ttCurrentTerm()))');
  const e2 = makeEnv({ [key]: { periods, entries: [entry()] }, [prevKey]: { periods, entries: [entry({ title: 'เก่า' })] } });
  const act = await run(e2, 'loadTimetable()');
  ok(act.entries[0].title === 'วิทย์' && act.term.year === 2569, 'ใช้ตารางของภาคเรียนปัจจุบัน', act.term);

  const e3 = makeEnv({ [prevKey]: { periods, entries: [entry({ title: 'ภาคก่อน' })] } });
  const act3 = await run(e3, 'loadTimetable()');
  ok(act3.entries[0].title === 'ภาคก่อน' && run(e3, 'ttTermKey') && act3.term.sem === 2 && act3.term.year === 2568, 'ยังไม่ตั้งภาคนี้ → ใช้ของภาคก่อนหน้า', act3.term);

  const e4 = makeEnv({ '2567-1': { periods, entries: [entry({ title: 'เก่ามาก' })] } });
  const act4 = await run(e4, 'loadTimetable()');
  ok(act4.entries.length === 0 && act4.term.year === 2569, 'ตารางเก่ากว่าภาคก่อนหน้า ไม่ถูกนำมาแสดง');

  const e5 = makeEnv({ main: { periods, entries: [entry({ title: 'แบบเดิม' })] } });
  const act5 = await run(e5, 'loadTimetable()');
  ok(act5.entries[0] && act5.entries[0].title === 'แบบเดิม', 'ตารางแบบเดิม (main) ยังใช้ได้ในภาคเรียนปัจจุบัน');

  console.log('วิชาในภาคเรียน + คัดลอกตาราง');
  const courses = [
    { id: 'a', code: 'ว1', year: '2569', semester: '1' }, { id: 'b', code: 'ว1', year: '2569', semester: '2' },
    { id: 'c', code: 'ค1', year: '', semester: '' },
  ];
  const ids = run(e2, `ttCoursesForTerm(${JSON.stringify(courses)}, {year:2569, sem:2}).map(c=>c.id)`);
  ok(ids.join() === 'b,c', 'รายการวิชากรองตามภาคเรียน (วิชาไม่ระบุภาคใช้ได้ทุกภาค)', ids);
  const copy = run(e2, `ttCopyFrom({periods:${JSON.stringify(periods)}, entries:[${JSON.stringify(entry({ courseId: 'a' }))}, ${JSON.stringify(entry({ id: 'e2', courseId: 'zz', code: 'พ9' }))}]}, ${JSON.stringify(courses)}, {year:2569, sem:2})`);
  ok(copy.tt.entries[0].courseId === 'b' && copy.tt.entries[1].courseId === '' && copy.unlinked === 1, 'คัดลอกแล้วผูกวิชารหัสเดียวกันของภาคใหม่ / ที่หาไม่เจอยกเลิกการผูก', copy);

  console.log('แท็บตารางสอน: บันทึกแยกเอกสารตามภาคเรียน');
  const e6 = makeEnv({ [key]: { periods, entries: [entry()] } }, { courses: [{ id: 'c1', code: 'ว1', name: 'วิทย์', year: '2569', semester: '1' }] });
  const body = e6.document.getElementById('root');
  await run(e6, `renderTimetableTab(document.getElementById('root'))`);
  ok(body.querySelector('#tt-year') && body.querySelectorAll('[data-sem]').length === 2, 'มีตัวเลือกปีการศึกษาและภาคเรียน');
  ok(/คาบ/.test(body.querySelector('#tt-card-title').textContent) === false && body.querySelector('#tt-card-title').textContent.includes('1/2569'), 'หัวตารางบอกภาคเรียน', body.querySelector('#tt-card-title').textContent);
  ok(body.querySelectorAll('.tt-item').length === 1, 'ภาค 1/2569 แสดง 1 คาบ');
  body.querySelector('[data-sem="2"]').click();
  ok(body.querySelectorAll('.tt-item').length === 0, 'สลับเป็นภาค 2 → ตารางว่าง ไม่ปนกับภาค 1');
  ok(body.querySelector('#tt-copy-btn').disabled === false, 'ภาคว่างมีปุ่มคัดลอกจากภาคอื่น');
  ok(e6.writes.length === 0, 'เปิดดู/สลับภาคเรียนไม่เขียนข้อมูล');
  body.querySelector('.tt-add').click();
  const m = e6.document.getElementById('modal');
  ok(m.textContent.includes('ภาคเรียนที่ 2/2569'), 'หน้าต่างเพิ่มคาบบอกภาคเรียนที่กำลังแก้');
  ok(![...m.querySelectorAll('#tt-course option')].some(o => o.value === 'c1'), 'รายการวิชาไม่มีวิชาของภาค 1 เมื่อแก้ตารางภาค 2');
  m.querySelector('#tt-title').value = 'คณิต';
  m.querySelector('#tt-save-btn').click();
  await tick(); await tick();
  ok(e6.writes.length === 1 && e6.writes[0].id === '2569-2' && e6.writes[0].d.entries.length === 1, 'บันทึกลงเอกสาร 2569-2 เท่านั้น', e6.writes.map(w => w.id));
  ok(e6.AppState.timetable === null, 'ล้างแคชวิดเจ็ตหลังบันทึก');
  body.querySelector('[data-sem="1"]').click();
  ok(body.querySelectorAll('.tt-item').length === 1 && body.querySelector('.tt-title').textContent === 'วิทย์', 'กลับภาค 1 ข้อมูลเดิมไม่ถูกแตะ');

  console.log('วิดเจ็ตหน้าแรก: อ่านอย่างเดียว กดไปบันทึกคะแนน');
  const e7 = makeEnv({ [key]: { periods, entries: [entry(), entry({ id: 'e2', day: 1, period: 1, kind: 'activity', title: 'โฮมรูม', courseId: '' })] } }, { courses: [{ id: 'c1' }] });
  const root = e7.document.getElementById('root');
  root.innerHTML = '<div id="ttw-sub"></div><div id="ttw-days"></div><div id="ttw-list"></div>';
  // บังคับวันจันทร์เพื่อให้มีคาบแสดง
  await run(e7, `(async () => { const R = document.getElementById('root'); await initTimetableWidget(R); R.querySelector('[data-day="1"]').click(); })()`);
  const items = root.querySelectorAll('.ttw-item');
  ok(items.length === 2, 'แสดงคาบของวัน', items.length);
  ok(root.querySelectorAll('.tt-edit, [data-ttw-edit]').length === 0, 'ไม่มีปุ่มแก้ไข/ดินสอในวิดเจ็ต');
  ok(root.querySelectorAll('[data-ttw-score]').length === 1, 'เฉพาะคาบที่ผูกวิชากดไปบันทึกคะแนนได้');
  ok(!items[1].hasAttribute('role') && !items[1].classList.contains('is-act'), 'กิจกรรมแสดงอย่างเดียว กดไม่ได้');
  ok(root.querySelector('#ttw-sub').textContent.includes('ภาคเรียนที่ 1/2569'), 'หัวบอกภาคเรียน');
  ok(e7.writes.length === 0, 'วิดเจ็ตไม่เขียนข้อมูลใดๆ');

  console.log(`\nผลรวม: ผ่าน ${pass}, ไม่ผ่าน ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
