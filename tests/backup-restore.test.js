// ทดสอบสำรอง → กู้คืนทั้งบัญชี (js/privacy.js): ส่งออกแล้วกู้คืนกลับต้องได้ข้อมูลเท่าเดิม ไม่ลบของอื่น ไม่แตะบัญชีอื่น
// จำลอง Firestore แบบ path → doc ด้วย Map · วิธีรัน: node tests/backup-restore.test.js
const fs = require('fs'), vm = require('vm'), path = require('path');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (!c && x !== undefined ? ' ' + JSON.stringify(x) : '')); };
const J = f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');

class Ts { constructor(d) { this.d = d; } toDate() { return this.d; } }
Ts.fromDate = d => new Ts(d);

function makeEnv(store) {
  const children = p => [...store.keys()].filter(k => k.startsWith(p + '/') && !k.slice(p.length + 1).includes('/'));
  const docRef = p => ({ path: p, id: p.split('/').pop(), collection: n => colRef(p + '/' + n),
    get: async () => ({ exists: store.has(p), data: () => store.get(p) }), set: async d => { store.set(p, d); } });
  const colRef = p => ({ path: p, doc: id => docRef(p + '/' + id),
    get: async () => ({ docs: children(p).map(k => ({ id: k.split('/').pop(), data: () => store.get(k), ref: docRef(k) })) }) });
  const db = { collection: n => colRef(n), batch: () => { const ops = []; return { set: (r, d) => ops.push([r, d]), commit: async () => ops.forEach(([r, d]) => store.set(r.path, d)) }; } };
  const ctx = {
    console: { ...console, error() {} }, db, setTimeout, location: { reload() {} }, navigator: { onLine: true },
    AppState: { user: { uid: 'u1' } }, firebase: { firestore: { Timestamp: Ts } },
    COURSE_LOAD_CONCURRENCY: 2, SECTION_LOAD_CONCURRENCY: 2,
    mapLimit: async (arr, _n, fn) => Promise.all(arr.map(fn)),
    showToast() {}, islandProgress: () => ({ update() {}, finish() {}, fail() {} }), openConfirmModal() {}, escapeHtml: s => s,
  };
  vm.createContext(ctx);
  vm.runInContext(`
    var LAZY_BUNDLES = { docConfigs: ['doc-system', 'pa-config'] };
    var loadModules = async () => {}; var loadModule = async () => {};
  `, ctx);
  const u = J('utils.js');
  const a = u.indexOf('async function snapshotCollection'), b = u.indexOf('// ---------- Smart import parser');
  vm.runInContext(u.slice(a, b), ctx); // restoreDocs / restoreCourse ของจริง
  vm.runInContext(J('doc-system.js') + '\n' + J('pa-config.js') + '\n' + J('privacy.js'), ctx);
  return ctx;
}
const run = (c, code) => vm.runInContext(code, c);

(async () => {
  const U = 'users/u1';
  const src = new Map();
  const when = new Date('2026-11-01T03:00:00.000Z');
  src.set(U, { displayName: 'ครู' });
  src.set(U + '/timetable/2569-1', { entries: [{ id: 'e1', title: 'วิทย์' }] });
  src.set(U + '/records/r1', { title: 'อบรม', at: new Ts(when) });
  src.set(U + '/pa_agreements/a1', { x: 1 });
  src.set(U + '/courses/c1', { name: 'วิทย์', savedAt: '2026-11-01T03:00:00.000Z', updatedAt: new Ts(when) });
  src.set(U + '/courses/c1/assessments/as1', { name: 'งาน 1', max: 10 });
  src.set(U + '/courses/c1/settings/grade', { scale: [1, 2] });
  src.set(U + '/courses/c1/sections/s1', { room: '1/1' });
  src.set(U + '/courses/c1/sections/s1/students/st1', { firstName: 'สมชาย' });
  src.set(U + '/courses/c1/sections/s1/scores/st1', { as1: 9 });
  src.set(U + '/courses/c1/sections/s1/attendance/st1', { d: 'x' });

  console.log('ส่งออก → ไฟล์สำรอง');
  const e1 = makeEnv(src);
  const raw = await run(e1, `_collectAll('u1')`);
  const file = JSON.parse(JSON.stringify(Object.assign({ format: 'myscore-backup', version: 2 }, run(e1, '_tagTimestamps')(raw))));
  ok(file.courses[0].updatedAt && file.courses[0].updatedAt.__ts === when.toISOString(), 'Timestamp ถูกติดป้าย __ts');
  ok(file.courses[0].savedAt === '2026-11-01T03:00:00.000Z', 'ข้อความ ISO ธรรมดาคงเป็นข้อความ (ไม่ถูกเข้าใจผิดว่าเป็น Timestamp)');
  ok(run(e1, `_validateBackup(${JSON.stringify(file)}).ok`) === true, 'ตรวจไฟล์ผ่าน');
  ok(run(e1, `_validateBackup({a:1}).ok`) === false && run(e1, `_validateBackup([]).ok`) === false && run(e1, `_validateBackup(null).ok`) === false, 'ปฏิเสธไฟล์ที่ไม่ใช่ไฟล์สำรอง');
  ok(run(e1, `_validateBackup({format:'other',courses:[],exportedAt:'x'}).ok`) === false, 'ปฏิเสธ format อื่น');
  ok(run(e1, `_validateBackup({format:'myscore-backup',version:99,courses:[],exportedAt:'x'}).ok`) === false, 'ปฏิเสธไฟล์ที่ใหม่กว่าแอป');
  ok(run(e1, `_validateBackup({courses:[],exportedAt:'x'}).ok`) === true, 'ไฟล์ส่งออกรุ่นเก่า (ไม่มีหัวไฟล์) ยังรับ');

  console.log('กู้คืนลงบัญชีว่าง');
  const dst = new Map();
  dst.set('users/other/courses/z', { keep: true });
  const e2 = makeEnv(dst);
  const r = await run(e2, `_restoreBackup('u1', ${JSON.stringify(file)})`);
  ok(r.courses === 1 && r.sections === 1 && r.students === 1 && r.failed.length === 0, 'สรุปผลถูกต้อง', r);
  const same = k => JSON.stringify(src.get(k)) === JSON.stringify(dst.get(k));
  ok(dst.get(U + '/courses/c1').name === 'วิทย์' && dst.get(U + '/courses/c1').updatedAt instanceof Ts && +dst.get(U + '/courses/c1').updatedAt.toDate() === +when, 'วิชา + Timestamp กลับมาเป็น Timestamp');
  ok(dst.get(U + '/courses/c1').savedAt === '2026-11-01T03:00:00.000Z' && typeof dst.get(U + '/courses/c1').savedAt === 'string', 'ฟิลด์ข้อความคงเป็นข้อความ');
  ok(same(U + '/courses/c1/assessments/as1') && same(U + '/courses/c1/settings/grade'), 'โครงสร้างคะแนน + เกณฑ์เกรด');
  ok(same(U + '/courses/c1/sections/s1') && same(U + '/courses/c1/sections/s1/students/st1') && same(U + '/courses/c1/sections/s1/scores/st1') && same(U + '/courses/c1/sections/s1/attendance/st1'), 'ห้อง/นักเรียน/คะแนน/เช็กชื่อ');
  ok(same(U + '/timetable/2569-1') && same(U + '/pa_agreements/a1') && dst.has(U + '/records/r1'), 'ตารางสอน/เอกสาร PA/อบรม');
  ok(!dst.has(U) && dst.get('users/other/courses/z').keep === true, 'ไม่แตะโปรไฟล์ และไม่แตะบัญชีอื่น');

  console.log('กู้คืนทับบัญชีที่มีข้อมูล');
  dst.set(U + '/courses/c1/sections/s1/scores/st1', { as1: 1 });          // ค่าเปลี่ยนหลังสำรอง → ต้องถูกเขียนทับ
  dst.set(U + '/courses/c9', { name: 'วิชาใหม่หลังสำรอง' });                 // ไม่อยู่ในไฟล์ → ต้องไม่ถูกลบ
  await run(e2, `_restoreBackup('u1', ${JSON.stringify(file)})`);
  ok(dst.get(U + '/courses/c1/sections/s1/scores/st1').as1 === 9, 'คะแนนที่รหัสตรงกันถูกเขียนทับด้วยค่าในไฟล์');
  ok(dst.get(U + '/courses/c9').name === 'วิชาใหม่หลังสำรอง', 'ข้อมูลที่ไม่อยู่ในไฟล์ไม่ถูกลบ');

  console.log('วิชาเสียไม่ทำให้ทั้งงานพัง');
  const bad = JSON.parse(JSON.stringify(file)); bad.courses.unshift({ name: 'ไม่มีรหัส' });
  const e3 = makeEnv(new Map());
  const r3 = await run(e3, `_restoreBackup('u1', ${JSON.stringify(bad)})`);
  ok(r3.courses === 1 && r3.failed.length === 1 && r3.failed[0] === 'ไม่มีรหัส', 'วิชาที่ข้อมูลเสียถูกข้าม + รายงานชื่อ', r3);

  console.log('\nผลรวม: ผ่าน ' + pass + ', ไม่ผ่าน ' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
