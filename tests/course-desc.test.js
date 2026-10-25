// ทดสอบฟอร์มคำอธิบายรายวิชา (js/course-desc.js) ด้วย jsdom + Firestore จำลองในหน่วยความจำ
// วิธีรัน: node tests/course-desc.test.js   (หรือ npm run test:cdesc)
// ตรวจ: normalize (ค่าเริ่มต้นจากวิชา · ตัดช่องว่าง · จำกัดจำนวน) · แยกตัวชี้วัดที่วางมา · โครงฟอร์มแบบ PA ·
//        เพิ่ม/ลบ/วางแถว · เก็บค่า → บันทึกที่ settings/description ของแม่แบบ/รายวิชา · ธง "ยังไม่บันทึก" ·
//        ลงทะเบียนครบ (utils.js · sw.js · แท็บในหน้าโครงสร้างวิชา · CSS ใน bundle docs) · ไม่มี CSS ใน JS
const fs = require('fs'), vm = require('vm'), path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = process.env.PA_ROOT ? path.resolve(process.env.PA_ROOT) : path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// ---- Firestore จำลอง: เก็บเอกสารตามพาธ ----
const store = new Map();
function ref(p) {
  const parts = p.split('/');
  return {
    path: p, id: parts[parts.length - 1],
    collection: n => ({ doc: id => ref(p + '/' + n + '/' + id) }),
    get: async () => ({ exists: store.has(p), data: () => store.get(p) }),
    set: async d => { store.set(p, JSON.parse(JSON.stringify(d))); },
  };
}
const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', { url: 'http://localhost/' });
const w = dom.window;
const toasts = [];
const ctx = {
  window: w, document: w.document, console, setTimeout, clearTimeout, Promise, JSON, Date, Math, Object, Array, Set, Map, String, Number, Error, RegExp,
  AppState: { user: { uid: 'u1' } },
  firebase: { firestore: { FieldValue: { serverTimestamp: () => 'TS' } } },
  escapeHtml: s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  showLoading() {}, showToast: (m, k) => toasts.push([m, k || '']), loadModule: async () => {}, loadModules: async () => {},
  courseBaseRef: c => ref('users/u1/' + (c.isTemplate ? 'courseTemplates' : 'courses') + '/' + c.id),
  requestAnimationFrame: f => setTimeout(f, 0), getComputedStyle: w.getComputedStyle.bind(w), Event: w.Event, HTMLElement: w.HTMLElement,
};
vm.createContext(ctx);
['js/doc-shell.js', 'js/course-desc.js'].forEach(f => vm.runInContext(read(f), ctx, { filename: f }));
const R = code => vm.runInContext(code, ctx);
const settle = () => new Promise(r => setTimeout(r, 30));
let fail = 0;
const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗', m); if (!c) fail++; };
const d = w.document;
const $ = id => d.getElementById(id);

(async () => {
  // ---------------- normalize ----------------
  const course = { id: 't1', isTemplate: true, code: 'ท21102', name: 'ภาษาไทย 2', level: 'ม.1', credit: '1.5' };
  let n = R(`cdNormalize({}, ${JSON.stringify(course)})`);
  ok(n.codeTh === 'ท21102' && n.nameTh === 'ภาษาไทย 2' && n.level === 'ม.1' && n.credit === '1.5', 'ยังไม่เคยบันทึก: ดึงรหัส/ชื่อ/ระดับชั้น/หน่วยกิตจากข้อมูลวิชา');
  ok(n.type === 'พื้นฐาน' && n.semester === '' && Array.isArray(n.indicators) && !n.indicators.length, 'ค่าเริ่มต้น: ประเภท = พื้นฐาน · ไม่ระบุภาคเรียน · ไม่มีตัวชี้วัด');
  n = R(`cdNormalize({ codeTh: '', nameTh: 'ก', type: 'อื่น', semester: '3' }, ${JSON.stringify(course)})`);
  ok(n.codeTh === '' && n.nameTh === 'ก', 'เคยบันทึกแล้ว: ช่องที่ผู้ใช้เว้นว่างไม่ถูกเติมจากข้อมูลวิชากลับมา');
  ok(n.type === 'พื้นฐาน' && n.semester === '', 'ประเภท/ภาคเรียนที่ไม่อยู่ในตัวเลือก → กลับค่าปลอดภัย');
  n = R(`cdNormalize({ indicators: [ { code: ' ก ', text: ' ข ' }, { code: '', text: '' }, null, { text: 'x'.repeat(900) } ] }, null)`);
  ok(n.indicators.length === 2 && n.indicators[0].code === 'ก' && n.indicators[0].text === 'ข', 'ตัวชี้วัด: ตัดช่องว่าง · ทิ้งแถวว่าง/ค่า null');
  ok(n.indicators[1].text.length === R('CD_MAX.indText'), 'ข้อความตัวชี้วัดยาวเกินถูกตัดตามขีดจำกัด');
  n = R(`cdNormalize({ indicators: Array.from({ length: 200 }, (_, i) => ({ code: 'c' + i, text: 't' })) }, null)`);
  ok(n.indicators.length === R('CD_MAX.indRows'), 'จำกัดจำนวนตัวชี้วัดต่อวิชา');

  // ---------------- แยกตัวชี้วัดที่วางมา (ตัวอย่างจากหน้าคำอธิบายรายวิชา) ----------------
  const pasted = [
    'ท 1.1 ม. 1/1 : อ่านออกเสียงบทร้อยแก้ว และบทร้อยกรองได้ถูกต้องเหมาะสมกับเรื่องที่อ่าน',
    'ท 1.1 ม. 1/4 : ระบุและอธิบายคำเปรียบเทียบ และคำที่มีหลายความหมายในบริบทต่าง ๆ จากการ',
    'อ่าน',
    '',
    'ท 4.1 ม. 1/5：แต่งบทร้อยกรอง',
  ].join('\n');
  const rows = JSON.parse(R(`JSON.stringify(cdParseIndicators(${JSON.stringify(pasted)}))`));
  ok(rows.length === 3 && rows[0].code === 'ท 1.1 ม. 1/1' && rows[0].text.startsWith('อ่านออกเสียง'), 'วางตัวชี้วัด: แยกรหัส/ข้อความที่ ":" ตัวแรก');
  ok(rows[1].text.endsWith('จากการ อ่าน'), 'บรรทัดที่ไม่มี ":" ต่อท้ายข้อความของข้อก่อนหน้า');
  ok(rows[2].code === 'ท 4.1 ม. 1/5' && rows[2].text === 'แต่งบทร้อยกรอง', 'รองรับ ":" แบบเต็มความกว้าง');
  ok(R(`cdParseIndicators('')`).length === 0, 'วางข้อความว่าง → ไม่มีแถว');

  // ---------------- โครงฟอร์ม ----------------
  const host = $('host');
  await R(`renderCourseDescTab(document.getElementById('host'), ${JSON.stringify(course)})`);
  await settle();
  const form = $('cd-form');
  ok(!!form && form.classList.contains('doc-form') && form.getAttribute('autocomplete') === 'off', 'ฟอร์มใช้ .doc-form + autocomplete=off (โครงเดียวกับ PA)');
  const kids = [...form.children].map(e => e.className.split(' ')[0]);
  ok(kids[0] === 'doc-form-header' && kids.slice(1, 4).every(c => c === 'doc-section') && kids[kids.length - 1] === 'pa-form-footer', 'ลำดับ: แถบบนฟอร์ม → การ์ด .doc-section 3 ใบ → ท้ายฟอร์ม .pa-form-footer');
  ok(form.querySelectorAll('.doc-sec-title').length === 3, 'การ์ด 3 ส่วน: ชื่อรายวิชา · คำอธิบายรายวิชา · ตัวชี้วัด');
  const foot = form.querySelector('.pa-form-footer');
  ok(foot.querySelector('#cd-save-btn') && foot.querySelector('#cd-save-btn').classList.contains('btn-primary') && foot.querySelector('#cd-save-btn').type === 'button', 'ปุ่มบันทึกเป็น type=button ปุ่มหลัก อยู่ท้ายฟอร์ม');
  ok(foot.querySelector('#cd-save-btn').textContent.trim() === R('CD_SAVE_LABEL'), 'ป้ายปุ่มบันทึกตรงกับค่าคงที่ CD_SAVE_LABEL');
  ok($('cd-codeTh').value === 'ท21102' && $('cd-nameTh').value === 'ภาษาไทย 2' && $('cd-level').value === 'ม.1' && $('cd-credit').value === '1.5', 'ช่องถูกเติมค่าเริ่มต้นจากข้อมูลวิชา');
  ok(!form.querySelector('input[type="date"]'), 'ไม่มีช่องวันที่ (ฟอร์มนี้ไม่มีวันที่ลงนาม)');
  ok(form.querySelectorAll('[style]').length === 0, 'ไม่มี inline style ในฟอร์ม');

  // ---------------- เพิ่ม/ลบ/วางแถว ----------------
  ok(R('cdIsDirty()') === false, 'เปิดใหม่: ยังไม่มีค่าค้าง');
  $('cd-ind-add').click();
  ok(host.querySelectorAll('.cd-ind-row').length === 1 && R('cdIsDirty()') === true, 'กด "เพิ่มตัวชี้วัด": เพิ่ม 1 แถว + ตั้งธงค่าค้าง');
  $('cd-paste-text').value = pasted;
  $('cd-paste-add').click();
  ok(host.querySelectorAll('.cd-ind-row').length === 4 && $('cd-paste-text').value === '', 'วางตัวชี้วัด 3 ข้อ → เพิ่มเป็นแถว · ช่องวางถูกล้าง');
  host.querySelector('.cd-ind-row .cd-ind-del').click();
  ok(host.querySelectorAll('.cd-ind-row').length === 3, 'กดถังขยะ: ลบแถวนั้น');
  ok(host.querySelector('.cd-ind-row .cd-ind-code').value === 'ท 1.1 ม. 1/1', 'แถวที่วางมีรหัสในช่องรหัส');

  // ---------------- เก็บค่า → บันทึก ----------------
  $('cd-nameEn').value = ' Thai Language 2 ';
  $('cd-semester').value = '2';
  $('cd-type').value = 'เพิ่มเติม';
  $('cd-descMain').value = 'ศึกษาหลักการอ่านออกเสียง';
  $('cd-descPurpose').value = 'เพื่ออ่านออกเสียงบทร้อยแก้ว';
  const col = R('cdCollect(document.getElementById("cd-form"))');
  ok(col.nameEn === 'Thai Language 2' && col.semester === '2' && col.type === 'เพิ่มเติม' && col.indicators.length === 3, 'Collect: ตัดช่องว่าง · อ่านภาคเรียน/ประเภท/ตัวชี้วัดครบ');
  $('cd-save-btn').click();
  await settle();
  const saved = store.get('users/u1/courseTemplates/t1/settings/description');
  ok(!!saved, 'แม่แบบวิชา: บันทึกที่ courseTemplates/{id}/settings/description');
  ok(saved && saved.descMain === 'ศึกษาหลักการอ่านออกเสียง' && saved.indicators.length === 3 && saved.updatedAt === 'TS', 'เนื้อหา + ตัวชี้วัด + เวลาแก้ไข ถูกเขียนครบ');
  ok(R('cdIsDirty()') === false && toasts.some(t => /บันทึกคำอธิบายรายวิชาสำเร็จ/.test(t[0])), 'บันทึกสำเร็จ: ล้างธงค่าค้าง + แจ้งผล');
  ok(!$('cd-save-btn').disabled && $('cd-save-btn').textContent.trim() === R('CD_SAVE_LABEL'), 'ปุ่มบันทึกกลับมากดได้หลังบันทึก');

  // ---------------- เปิดซ้ำ: โหลดค่าที่บันทึกไว้ ----------------
  host.innerHTML = '';
  await R(`renderCourseDescTab(document.getElementById('host'), ${JSON.stringify(course)})`);
  await settle();
  ok($('cd-descMain').value === 'ศึกษาหลักการอ่านออกเสียง' && $('cd-semester').value === '2' && $('cd-type').value === 'เพิ่มเติม', 'เปิดใหม่: โหลดค่าที่บันทึกไว้กลับมา');
  ok(host.querySelectorAll('.cd-ind-row').length === 3, 'เปิดใหม่: ตัวชี้วัดครบ 3 แถว');
  $('cd-codeTh').value = '';
  $('cd-save-btn').click(); await settle();
  host.innerHTML = '';
  await R(`renderCourseDescTab(document.getElementById('host'), ${JSON.stringify(course)})`);
  await settle();
  ok($('cd-codeTh').value === '', 'ล้างรหัสวิชาแล้วบันทึก: เปิดใหม่ยังว่าง (ไม่ดึงจากวิชากลับมาทับ)');

  // ---------------- รายวิชาที่เปิดสอน (ไม่ใช่แม่แบบ) ----------------
  host.innerHTML = '';
  await R(`renderCourseDescTab(document.getElementById('host'), { id: 'c9', name: 'คณิต', code: 'ค21101', level: 'ม.1', semester: '1', credit: '1' })`);
  await settle();
  ok($('cd-semester').value === '1' && $('cd-nameTh').value === 'คณิต', 'รายวิชาที่เปิดสอน: ดึงภาคเรียนจากรายวิชา');
  $('cd-save-btn').click(); await settle();
  ok(store.has('users/u1/courses/c9/settings/description'), 'รายวิชาที่เปิดสอน: บันทึกที่ courses/{id}/settings/description');

  // ---------------- โหลดล้มเหลว ----------------
  host.innerHTML = '';
  ctx.courseBaseRef = () => ({ collection: () => ({ doc: () => ({ get: async () => { throw new Error('offline'); } }) }) });
  const realErr = console.error; console.error = () => {}; // ข้อผิดพลาดที่จงใจจำลอง ไม่ต้องรกผลเทสต์
  await R(`renderCourseDescTab(document.getElementById('host'), ${JSON.stringify(course)})`);
  await settle();
  console.error = realErr;
  ok(/โหลดคำอธิบายรายวิชาไม่สำเร็จ/.test(host.textContent) && !$('cd-form'), 'โหลดไม่สำเร็จ: แสดงข้อความแทนฟอร์ม (ไม่ค้างหน้าโหลด)');

  // ---------------- ลงทะเบียนครบ + กฎโปรเจกต์ ----------------
  const src = read('js/course-desc.js');
  ok(/'course-desc':\s*'js\/course-desc\.js'/.test(read('js/utils.js')), 'utils.js: LAZY_MODULES มี course-desc');
  ok(/cdesc:\s*\[[^\]]*'doc-shell'[^\]]*'course-desc'\]/.test(read('js/utils.js')), 'utils.js: LAZY_BUNDLES.cdesc โหลด doc-shell ก่อน course-desc (ได้ docs.min.css)');
  ok(/'js\/course-desc\.js'/.test(read('sw.js')), 'sw.js: PRECACHE มี js/course-desc.js');
  const pk = read('js/picker-pages.js');
  ok(/STRUCT_TABS[^;]*'desc'[^;]*คำอธิบายรายวิชา/.test(pk) && /loadModules\(LAZY_BUNDLES\.cdesc\)/.test(pk) && /renderCourseDescTab\(/.test(pk), 'หน้าโครงสร้างวิชา: มีแท็บ "คำอธิบายรายวิชา" ที่โหลดโมดูลแล้ววาดฟอร์ม');
  ok(!/<style|createElement\(['"]style|insertRule|\.style\./.test(src) && !/style="[^"$]/.test(src), 'ไม่เขียน CSS ใน JS (ไม่มี <style> · el.style · style="ค่าคงที่")');
  const css = read('css/style.css'), at = css.indexOf('/* @bundle docs'), ci = css.indexOf('.cd-ind {');
  ok(ci > at && at > 0 && read('css/docs.min.css').includes('.cd-ind'), 'CSS ของฟอร์มอยู่ในบล็อก bundle docs และถูกสร้างลง docs.min.css');
  const rules = read('firestore.rules');
  ok(/match \/courseTemplates\/\{templateId\}[\s\S]*?match \/\{document=\*\*\}[\s\S]*?validDoc\(100\)/.test(rules), 'firestore.rules: เอกสารใต้ courseTemplates (รวม settings/description) เขียนได้อยู่แล้ว');

  console.log(fail ? `\n✗ ไม่ผ่าน ${fail} ข้อ` : '\n✓ ผ่านทุกข้อ');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
