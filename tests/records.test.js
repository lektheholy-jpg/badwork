// ทดสอบแท็บอบรม/เกียรติบัตร/รางวัล (js/records.js) โดยจำลอง Firestore/Storage + DOM ด้วย jsdom
// วิธีรัน: node tests/records.test.js   (หรือ npm run test:rec)
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { JSDOM } = require('jsdom');

let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg, extra !== undefined ? JSON.stringify(extra) : ''); } };
const tick = () => new Promise(r => setTimeout(r, 0));

function makeEnv(docs = {}) {
  const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>');
  const store = new Map(Object.entries(docs));
  const log = { sets: [], deletes: [], undo: null, files: [], toasts: [] };
  let n = 0;
  const col = {
    where: (f, op, v) => ({ get: async () => ({ docs: [...store].filter(([, d]) => d[f] === v).map(([id, d]) => ({ id, data: () => d })) }) }),
    doc: id => {
      id = id || 'new' + (++n);
      return { id, set: async d => { log.sets.push({ id, d }); store.set(id, d); }, delete: async () => { log.deletes.push(id); store.delete(id); } };
    },
  };
  const db = { collection: () => ({ doc: () => ({ collection: () => col }) }) };
  const ctx = {
    window: dom.window, document: dom.window.document, console: { ...console, error() {} }, db, log, store, setTimeout, clearTimeout, navigator: { onLine: true },
    AppState: { user: { uid: 'u1' } },
    firebase: { firestore: { FieldValue: { serverTimestamp: () => 'TS' } } },
    islandSave() {}, islandUndo: (t, fn) => { log.undo = fn; }, showToast: (m) => log.toasts.push(m), showLoading() {}, clearLoading() {},
    escapeHtml: s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    initNavPill() {}, Image: dom.window.Image, File: dom.window.File,
    openModal: html => { let m = dom.window.document.getElementById('modal'); if (!m) { m = dom.window.document.createElement('div'); m.id = 'modal'; dom.window.document.body.appendChild(m); } m.innerHTML = html; },
    closeModal: () => { const m = dom.window.document.getElementById('modal'); if (m) m.innerHTML = ''; },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'records.js'), 'utf8'), ctx);
  // จำลองส่วนที่ต้องใช้ canvas / Storage
  vm.runInContext(`
    recMakeThumb = async () => 'data:image/webp;base64,AAAA';
    recPrepareOriginal = async f => f;
    let _up = 0;
    recUpload = async (id, blob, name) => { log.files.push('up:' + id + ':' + name); return { path: 'users/u1/records/' + id + '/' + (++_up) + '.jpg', name, size: 10, type: 'image/jpeg' }; };
    recDeleteFile = async p => { log.files.push('del:' + p); };
    recFileUrl = async () => { throw new Error('จำลอง: ออฟไลน์'); };
  `, ctx);
  return ctx;
}
const run = (c, code) => vm.runInContext(code, c);
const rec = (o) => ({ type: 'training', title: 'อบรม AI', org: 'สพฐ.', date: '2026-06-10', year: 2569, hours: 6, note: '', thumb: '', file: null, ...o });

(async () => {
  console.log('ปีการศึกษา/ข้อมูล');
  const e0 = makeEnv();
  ok(run(e0, `recAcadYear('2026-06-10')`) === 2569 && run(e0, `recAcadYear('2026-12-31')`) === 2569, 'พ.ค.–ธ.ค. = ปี พ.ศ. ของปีนั้น');
  ok(run(e0, `recAcadYear('2027-03-01')`) === 2569 && run(e0, `recAcadYear('2027-05-01')`) === 2570, 'ม.ค.–เม.ย. = ปีการศึกษาก่อนหน้า');
  ok(run(e0, `recAcadYear('abc')`) === null, 'วันที่ผิดรูปแบบ = null');
  ok(run(e0, `recClean({title:''}, 'x')`) === null, 'ไม่มีชื่อเรื่อง = ตัดทิ้ง');
  ok(run(e0, `recClean({title:'ก', type:'award', hours: 5, date:'2026-06-10'}, 'x').hours`) === 0, 'ชั่วโมงเก็บเฉพาะการอบรม');
  ok(run(e0, `recClean({title:'ก', thumb:'javascript:alert(1)', date:'2026-06-10'}, 'x').thumb`) === '', 'รูปย่อต้องเป็น data:image เท่านั้น');
  ok(run(e0, `recDateTh('2026-06-10')`) === '10 มิ.ย. 2569', 'แสดงวันที่เป็น พ.ศ.');

  console.log('แท็บ: แสดงตามปี + สถิติ');
  const e1 = makeEnv({
    a: rec({ title: 'A', hours: 6 }), b: rec({ title: 'B', hours: 3.5, date: '2026-07-01' }),
    c: rec({ title: 'C', type: 'certificate', hours: 0 }), d: rec({ title: 'เก่า', year: 2568, date: '2025-06-01' }),
  });
  e1.AppState.recYear = 2569;
  const body = e1.document.getElementById('root');
  await run(e1, `renderRecordsTab(document.getElementById('root'))`);
  ok(body.querySelectorAll('.rec-card').length === 3, 'ปี 2569 แสดง 3 รายการ (ไม่ปนปี 2568)');
  const vals = [...body.querySelectorAll('.stat-card .value')].map(x => x.textContent);
  ok(vals.join() === '9.5,2,1,0', 'สถิติ: ชั่วโมงรวม/อบรม/เกียรติบัตร/รางวัล', vals);
  body.querySelector('[data-f="certificate"]').click();
  ok(body.querySelectorAll('.rec-card').length === 1, 'กรองตามประเภท');
  body.querySelector('[data-f="all"]').click();
  const sel = body.querySelector('#rec-year'); sel.value = '2568'; sel.dispatchEvent(new e1.window.Event('change'));
  await tick(); await tick();
  ok(body.querySelectorAll('.rec-card').length === 1 && body.querySelector('.rec-title').textContent === 'เก่า', 'สลับปี 2568 → เห็นเฉพาะของปีนั้น');
  sel.value = '2569'; sel.dispatchEvent(new e1.window.Event('change')); await tick(); await tick();

  console.log('เพิ่ม/แก้/ลบ');
  body.querySelector('#rec-add-btn').click();
  const m = e1.document.getElementById('modal');
  m.querySelector('#rec-title').value = 'ได้รับรางวัลครูดีเด่น';
  m.querySelector('[data-kind="award"]').click();
  m.querySelector('#rec-date').value = '2027-02-10'; // ม.ค.–เม.ย. → ปีการศึกษา 2569
  m.querySelector('#rec-save-btn').click();
  await tick(); await tick();
  ok(e1.log.sets.length === 1 && e1.log.sets[0].d.type === 'award' && e1.log.sets[0].d.year === 2569 && e1.log.sets[0].d.hours === 0, 'บันทึก: ประเภท/ปีการศึกษาคำนวณจากวันที่', e1.log.sets[0] && e1.log.sets[0].d);
  ok(body.querySelectorAll('.rec-card').length === 4, 'รายการใหม่โผล่ทันที');

  // เพิ่มพร้อมไฟล์ → อัปโหลดแล้วเก็บ path
  body.querySelector('#rec-add-btn').click();
  const m2 = e1.document.getElementById('modal');
  m2.querySelector('#rec-title').value = 'เกียรติบัตร';
  m2.querySelector('#rec-date').value = '2026-09-01';
  const input = m2.querySelector('#rec-file');
  const file = new e1.File(['x'], 'cert.jpg', { type: 'image/jpeg' });
  Object.defineProperty(input, 'files', { value: [file] });
  input.dispatchEvent(new e1.window.Event('change'));
  await tick(); await tick();
  m2.querySelector('#rec-save-btn').click();
  await tick(); await tick(); await tick();
  const last = e1.log.sets[e1.log.sets.length - 1];
  ok(last.d.file && last.d.file.path.startsWith('users/u1/records/') && last.d.thumb.startsWith('data:image/webp'), 'แนบไฟล์: เก็บ path ต้นฉบับ + รูปย่อ', last.d.file);
  ok(e1.log.files.some(f => f.startsWith('up:')), 'อัปโหลดต้นฉบับ 1 ครั้ง');

  // แก้ไข: เปลี่ยนไฟล์ → ลบไฟล์เก่า
  const card = [...body.querySelectorAll('.rec-card')].find(c => c.querySelector('.rec-title').textContent === 'เกียรติบัตร');
  card.click();
  await tick();
  e1.document.getElementById('rec-edit-btn').click();
  const m3 = e1.document.getElementById('modal');
  const input3 = m3.querySelector('#rec-file');
  Object.defineProperty(input3, 'files', { value: [new e1.File(['y'], 'new.jpg', { type: 'image/jpeg' })] });
  input3.dispatchEvent(new e1.window.Event('change')); await tick(); await tick();
  m3.querySelector('#rec-save-btn').click();
  await tick(); await tick(); await tick();
  ok(e1.log.files.some(f => f.startsWith('del:users/u1/records/')), 'เปลี่ยนไฟล์แล้วลบไฟล์เก่าออกจาก Storage');

  // ลบ + เลิกทำ
  const before = body.querySelectorAll('.rec-card').length;
  [...body.querySelectorAll('.rec-card')].find(c => c.querySelector('.rec-title').textContent === 'A').click();
  await tick();
  e1.document.getElementById('rec-del-btn').click();
  await tick(); await tick();
  ok(body.querySelectorAll('.rec-card').length === before - 1 && e1.log.deletes.length === 1, 'ลบแล้วหายจากรายการและเอกสาร');
  await e1.log.undo();
  ok(body.querySelectorAll('.rec-card').length === before, 'เลิกทำ: รายการกลับมา');

  console.log(`\nผลรวม: ผ่าน ${pass}, ไม่ผ่าน ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
