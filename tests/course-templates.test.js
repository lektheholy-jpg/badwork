// ทดสอบแม่แบบวิชา: แปลงวิชาเดิมเป็นแม่แบบ · สร้างรายวิชาจากแม่แบบ · ซิงก์โครงสร้างตามแม่แบบ (Firestore จำลองในหน่วยความจำ)
const fs = require('fs'), vm = require('vm'), assert = require('assert');
// ---- in-memory Firestore ----
const store = new Map(); let idn = 0;
const TS = { toMillis: () => 1 };
function ref(path) {
  const parts = path.split('/');
  return {
    path, id: parts[parts.length - 1],
    collection: (n) => col(path + '/' + n),
    get: async () => ({ exists: store.has(path), id: parts[parts.length - 1], data: () => store.get(path), ref: ref(path) }),
    set: async (d) => { store.set(path, JSON.parse(JSON.stringify(d))); },
    update: async (d) => { store.set(path, { ...store.get(path), ...d }); },
    delete: async () => { store.delete(path); },
  };
}
function col(path, filt = [], ord) {
  const depth = path.split('/').length + 1;
  const list = () => {
    let r = [...store.keys()].filter(k => k.startsWith(path + '/') && k.split('/').length === depth)
      .map(k => ({ id: k.split('/').pop(), data: () => store.get(k), ref: ref(k) }));
    filt.forEach(([f, , v]) => { r = r.filter(d => d.data()[f] === v); });
    if (ord) r.sort((a, b) => (a.data()[ord] ?? 0) - (b.data()[ord] ?? 0));
    return r;
  };
  return { doc: (id) => ref(path + '/' + (id || 'auto' + (++idn))), get: async () => { const docs = list(); return { docs, size: docs.length }; },
    where: (f, o, v) => col(path, [...filt, [f, o, v]], ord), orderBy: (f) => col(path, filt, f) };
}
const db = { collection: (n) => col(n), batch: () => { const ops = []; return {
  set: (r, d) => ops.push(() => r.set(d)), update: (r, d) => ops.push(() => r.update(d)), delete: (r) => ops.push(() => r.delete()),
  commit: async () => { for (const o of ops) await o(); } }; } };
const ctx = { db, AppState: { user: { uid: 'u1' } }, firebase: { firestore: { FieldValue: { serverTimestamp: () => ({ __ts: 1 }) } } },
  showToast: () => {}, invalidateCourseData: () => {}, DEFAULT_GRADE_SCALE: [{ g: 4 }], console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require('path').join(__dirname, '..', 'js', 'courses.js'), 'utf8').replace(/^const /gm, 'var '), ctx);
const U = 'users/u1/';
const put = (p, d) => store.set(p, d);
// เทอมเก่า + เทอมใหม่ของวิชาเดียวกัน (โครงสร้างต่างกันนิดหน่อย) + อีกวิชา
put(U+'courses/c1', { code:'ว1', name:'คอม', level:'ม.1', semester:'1', year:'2568', createdAt:{toMillis:()=>10}, archived:true });
put(U+'courses/c1/assessments/a1', { name:'งาน1', max:10, category:'collect', order:0 });
put(U+'courses/c1/assessments/a2', { name:'กลางภาค', max:20, category:'midterm', order:1 });
put(U+'courses/c2', { code:'ว1', name:'คอม', level:'ม.1', semester:'2', year:'2568', createdAt:{toMillis:()=>20} });
put(U+'courses/c2/assessments/b1', { name:'งาน1', max:15, category:'collect', order:0 });
put(U+'courses/c2/assessments/b2', { name:'กลางภาค', max:20, category:'midterm', order:1 });
put(U+'courses/c2/assessments/b3', { name:'ปลายภาค', max:30, category:'final', order:2 });
put(U+'courses/c2/settings/grading', { scale: [{ g: 3 }] });
put(U+'courses/c3', { code:'ค2', name:'คณิต', level:'ม.2', semester:'1', year:'2568', createdAt:{toMillis:()=>5} });
(async () => {
  const n = await ctx.migrateCoursesToTemplates();
  assert.strictEqual(n, 2, 'สร้าง 2 แม่แบบ');
  const tpls = [...store.keys()].filter(k => /courseTemplates\/[^/]+$/.test(k));
  assert.strictEqual(tpls.length, 2);
  const c1 = store.get(U+'courses/c1'), c2 = store.get(U+'courses/c2');
  assert.ok(c1.templateId && c1.templateId === c2.templateId, 'เทอมต่างกันของวิชาเดียวกันใช้แม่แบบเดียว');
  const t = c1.templateId;
  const tItems = [...store.entries()].filter(([k]) => k.startsWith(U+'courseTemplates/'+t+'/assessments/'));
  assert.strictEqual(tItems.length, 3, 'แม่แบบเอาโครงสร้างจากเทอมล่าสุด (c2)');
  assert.strictEqual(store.get(U+'courseTemplates/'+t+'/settings/grading').scale[0].g, 3);
  assert.ok(store.get(U+'courses/c1/assessments/a1').templateItemId, 'จับคู่รายการเดิมกับแม่แบบ');
  assert.strictEqual(await ctx.migrateCoursesToTemplates(), 0, 'รันซ้ำไม่สร้างซ้ำ');

  // สร้างวิชาใหม่จากแม่แบบ
  const cid = await ctx.createCourseFromTemplate({ id: t, code:'ว1', name:'คอม', level:'ม.1', credit:'1.0' }, { semester:'1', year:'2569', rooms:['1','2'] });
  const nc = store.get(U+'courses/'+cid);
  assert.deepStrictEqual([nc.semester, nc.year, nc.roomCount, nc.templateId], ['1','2569',2,t]);
  const ncA = [...store.entries()].filter(([k]) => k.startsWith(U+'courses/'+cid+'/assessments/'));
  assert.strictEqual(ncA.length, 3);
  assert.strictEqual([...store.keys()].filter(k => k.startsWith(U+'courses/'+cid+'/sections/')).length, 2);

  // แก้แม่แบบ: เปลี่ยนคะแนนงาน1, ลบปลายภาค, เพิ่มงานใหม่ → ซิงก์ c2
  const tItemKeys = tItems.map(([k, v]) => [k, v]);
  const work = tItemKeys.find(([, v]) => v.name === 'งาน1')[0];
  const fin = tItemKeys.find(([, v]) => v.name === 'ปลายภาค')[0];
  store.set(work, { ...store.get(work), max: 25, attachments: [{ id: 'q', kind: 'link', url: 'https://forms.gle/q', title: 'แบบทดสอบ' }] });
  store.delete(fin);
  put(U+'courseTemplates/'+t+'/assessments/newX', { name:'งานใหม่', max:5, category:'collect', order:5 });
  await ctx.syncTemplateToCourse(ref(U+'courseTemplates/'+t), ref(U+'courses/c2'));
  const after = [...store.entries()].filter(([k]) => k.startsWith(U+'courses/c2/assessments/')).map(([k, v]) => [k.split('/').pop(), v]);
  assert.strictEqual(store.get(U+'courses/c2/assessments/b1').max, 25, 'id เดิมคงอยู่ (คะแนนไม่หลุด) และค่าอัปเดต');
  assert.strictEqual(store.get(U+'courses/c2/assessments/b1').attachments[0].url, 'https://forms.gle/q', 'สื่อที่แนบในแม่แบบตามไปที่รายวิชา');
  assert.ok(!store.has(U+'courses/c2/assessments/b3'), 'รายการที่ลบจากแม่แบบถูกลบ');
  assert.ok(after.some(([, v]) => v.name === 'งานใหม่'), 'เพิ่มรายการใหม่');
  assert.strictEqual(after.length, 3);
  console.log('ALL PASS');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
