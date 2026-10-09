// ทดสอบ js/privacy.js: ส่งออก/ลบบัญชีต้องครอบคลุมเอกสารของทุกระบบ (PA ฯลฯ) · โหลด config ไม่ได้ = ไม่ลบอะไรเลย
// จำลอง Firestore แบบ path → doc ด้วย Map · วิธีรัน: npm run test:priv
const fs = require('fs'), vm = require('vm'), path = require('path');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (!c && x !== undefined ? ' ' + JSON.stringify(x) : '')); };
const J = f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');

function makeEnv({ failConfig = false } = {}) {
  const store = new Map();
  const put = (p, d) => store.set(p, d);
  const U = 'users/u1';
  put(U, { displayName: 'ครู' });
  put(U + '/timetable/2569-1', { entries: [] });
  put(U + '/records/r1', { title: 'อบรม' });
  put(U + '/pa_agreements/a1', { x: 1 }); put(U + '/pa_agreements/a2', { x: 2 });
  put(U + '/pa_reports/p1', { y: 1 });
  put(U + '/courses/c1', { name: 'วิทย์' });
  put(U + '/courses/c1/sections/s1', { room: '1/1' });
  put(U + '/courses/c1/sections/s1/students/st1', { name: 'ก' });
  put(U + '/courses/c1/sections/s1/scores/st1', { v: 5 });
  put('users/other/pa_agreements/z', { keep: true });

  const children = p => [...store.keys()].filter(k => k.startsWith(p + '/') && !k.slice(p.length + 1).includes('/'));
  const docRef = p => ({ path: p, id: p.split('/').pop(), collection: n => colRef(p + '/' + n), get: async () => ({ exists: store.has(p), data: () => store.get(p) }), delete: async () => { store.delete(p); } });
  const colRef = p => ({ path: p, doc: id => docRef(p + '/' + id), get: async () => { const docs = children(p).map(k => ({ id: k.split('/').pop(), data: () => store.get(k), ref: docRef(k) })); return { docs, empty: !docs.length }; } });
  const db = { collection: n => colRef(n), batch: () => { const ops = []; return { delete: r => ops.push(r), commit: async () => ops.forEach(r => store.delete(r.path)) }; } };

  const log = { toasts: [], filesDeleted: 0 };
  const user = { uid: 'u1', delete: async () => { log.userDeleted = true; } };
  const ctx = {
    console: { ...console, error() {} }, db, log, store, setTimeout,
    AppState: { user }, auth: { currentUser: user }, googleProvider: {},
    COURSE_LOAD_CONCURRENCY: 2, SECTION_LOAD_CONCURRENCY: 2,
    mapLimit: async (arr, _n, fn) => Promise.all(arr.map(fn)),
    deleteCollectionDocs: async ref => { for (const d of (await ref.get()).docs) await d.ref.delete(); },
    openConfirmModal: o => { ctx._confirm = o; }, showToast: m => log.toasts.push(m),
    islandProgress: () => ({ update() {}, finish() {}, fail() {} }),
    localStorage: { clear() {} }, sessionStorage: { clear() {} },
  };
  vm.createContext(ctx);
  // ของจริง: doc-system.js + pa-config.js ผ่าน loadModules · recDeleteAllFiles จำลอง
  vm.runInContext(`
    var LAZY_BUNDLES = { docConfigs: ['doc-system', 'pa-config'] };
    var loadModules = async () => { if (${failConfig}) throw new Error('โหลดไม่สำเร็จ'); };
    var loadModule = async () => {};
    var recDeleteAllFiles = async () => { log.filesDeleted++; };
  `, ctx);
  vm.runInContext(J('doc-system.js') + '\n' + J('pa-config.js') + '\n' + J('privacy.js'), ctx);
  return ctx;
}
const run = (c, code) => vm.runInContext(code, c);
const keys = c => [...c.store.keys()].filter(k => k.startsWith('users/u1'));

(async () => {
  console.log('ส่งออก');
  const e = makeEnv();
  const out = await run(e, `_collectAll('u1')`);
  ok(Array.isArray(out.pa_agreements) && out.pa_agreements.length === 2, 'มี pa_agreements ครบ 2 เอกสาร', Object.keys(out));
  ok(Array.isArray(out.pa_reports) && out.pa_reports.length === 1 && out.pa_reports[0].id === 'p1', 'มี pa_reports');
  ok(out.records.length === 1 && out.timetable.length === 1 && out.courses.length === 1, 'ของเดิม (records/timetable/courses) ยังอยู่');
  ok(!JSON.stringify(out).includes('keep'), 'ไม่ปนข้อมูลของผู้ใช้อื่น');

  console.log('ลบบัญชี');
  const d = makeEnv();
  run(d, 'deleteMyAccount()');
  await d._confirm.onConfirm();
  ok(keys(d).length === 0, 'ไม่เหลือเอกสารใต้ users/u1 เลย', keys(d));
  ok(d.store.has('users/other/pa_agreements/z'), 'ข้อมูลผู้ใช้อื่นไม่ถูกลบ');
  ok(d.log.filesDeleted === 1 && d.log.userDeleted === true, 'ลบไฟล์ Storage และบัญชีแล้ว');

  console.log('โหลด config ไม่ได้');
  const f = makeEnv({ failConfig: true });
  const before = keys(f).length;
  run(f, 'deleteMyAccount()');
  await f._confirm.onConfirm();
  ok(keys(f).length === before && !f.log.userDeleted && f.log.filesDeleted === 0, 'หยุดก่อนลบ ไม่ลบบางส่วน ไม่ลบบัญชี', keys(f).length);
  ok(f.log.toasts.some(t => /ลบไม่สำเร็จ/.test(t)), 'แจ้งผู้ใช้ว่าลบไม่สำเร็จ');
  let threw = false; try { await run(makeEnv({ failConfig: true }), `_collectAll('u1')`); } catch (_) { threw = true; }
  ok(threw, 'ส่งออกก็ error ชัดเจน (ไม่ส่งไฟล์ที่ขาด PA ออกไปเงียบๆ)');

  console.log(`\nผลรวม: ผ่าน ${pass}, ไม่ผ่าน ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
