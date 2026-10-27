// ทดสอบฟอร์มคำอธิบายรายวิชา (js/course-desc.js) ด้วย jsdom + Firestore จำลองในหน่วยความจำ
// วิธีรัน: node tests/course-desc.test.js   (หรือ npm run test:cdesc)
// ตรวจ: normalize (ค่าเริ่มต้นจากวิชา · ตัดช่องว่าง · จำกัดจำนวน) · แยกตัวชี้วัดที่วางมา · โครงฟอร์มแบบ PA ·
//        เพิ่ม/ลบ/วางแถว · เก็บค่า → บันทึกที่ settings/description ของแม่แบบ/รายวิชา · ธง "ยังไม่บันทึก" ·
//        ตัวอย่างก่อนพิมพ์ (แท็บถัดจากฟอร์ม · เนื้อหากระดาษ · ตัดย่อหน้ายาว · ร่างข้ามแท็บไม่หาย · พิมพ์ผ่าน docPrintWindow) ·
//        การ์ดคำอธิบายรายวิชาที่แท็บภาพรวมของหน้าวิชา (js/courses.js: โหลดจากแม่แบบ · อ่านอย่างเดียว · escape) ·
//        ลงทะเบียนครบ (utils.js · sw.js · แท็บในหน้าโครงสร้างวิชา · CSS ใน bundle docs) · ไม่มี CSS ของหน้าเว็บใน JS
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
  window: w, document: w.document, console, setTimeout, clearTimeout, Promise, URL, JSON, Date, Math, Object, Array, Set, Map, String, Number, Error, RegExp,
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
  ok(n.hours === '' && n.area === '', 'ค่าเริ่มต้น: เวลาเรียน (ชั่วโมง) และกลุ่มสาระการเรียนรู้ ว่าง (ไม่มีในข้อมูลวิชา) · เอกสารเก่าที่ไม่มีช่องนี้ก็ใช้ได้');
  ok(R(`cdNormalize({ hours: '9'.repeat(30), area: 'ก'.repeat(300) }, null)`).hours.length === R('CD_MAX.hours') && R(`cdNormalize({ area: 'ก'.repeat(300) }, null)`).area.length === R('CD_MAX.area'), 'เวลาเรียน/กลุ่มสาระ: ตัดตามขีดจำกัด');
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
  ok(kids[0] === 'doc-form-header' && kids.slice(1, 5).every(c => c === 'doc-section') && kids[kids.length - 1] === 'pa-form-footer', 'ลำดับ: แถบบนฟอร์ม → การ์ด .doc-section 4 ใบ → ท้ายฟอร์ม .pa-form-footer');
  ok(form.querySelectorAll('.doc-sec-title').length === 4 && [...form.querySelectorAll('.doc-sec-title')].map(t => t.textContent.replace(/\s+/g, ' ').trim()).join('|') === 'ส่วนที่ 1 ชื่อรายวิชา|ส่วนที่ 2 คำอธิบายรายวิชา|ส่วนที่ 3 มาตรฐานการเรียนรู้|ส่วนที่ 4 ตัวชี้วัด', 'การ์ด 4 ส่วนตามลำดับ: ชื่อรายวิชา · คำอธิบาย · มาตรฐานการเรียนรู้ · ตัวชี้วัด (มาตรฐานอยู่ก่อนตัวชี้วัด)');
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

  // ---------------- มาตรฐานการเรียนรู้ (ก่อนตัวชี้วัด) ----------------
  $('cd-std-add').click();
  ok(host.querySelectorAll('.cd-std-row').length === 1 && host.querySelectorAll('.cd-ind-row').length === 3 && R('cdIsDirty()') === true, 'กด \"เพิ่มมาตรฐาน\": เพิ่ม 1 แถวในส่วนมาตรฐาน (ตัวชี้วัดไม่เปลี่ยน)');
  $('cd-std-paste-text').value = 'ว 4.2 : เข้าใจและใช้แนวคิดเชิงคำนวณในการแก้ปัญหา\nอย่างเป็นระบบ\nว 4.1 : เข้าใจเทคโนโลยี';
  $('cd-std-paste-add').click();
  const srows = [...host.querySelectorAll('.cd-std-row')];
  ok(srows.length === 3 && srows[1].querySelector('.cd-std-code').value === 'ว 4.2' && /อย่างเป็นระบบ$/.test(srows[1].querySelector('.cd-std-text').value) && $('cd-std-paste-text').value === '', 'วางมาตรฐานทั้งชุด: แยกรหัส/ข้อความ · บรรทัดต่อท้ายต่อข้อความก่อนหน้า · ช่องวางถูกล้าง');
  srows[0].querySelector('.cd-std-del').click();
  ok(host.querySelectorAll('.cd-std-row').length === 2 && host.querySelectorAll('.cd-ind-row').length === 3, 'ลบแถวมาตรฐาน: ลบเฉพาะแถวนั้น ไม่กระทบตัวชี้วัด');
  ok(R('cdCollect(document.getElementById(\"cd-form\"))').standards.length === 2 && R('cdCollect(document.getElementById(\"cd-form\"))').standards[0].code === 'ว 4.2', 'Collect: เก็บมาตรฐานแยกจากตัวชี้วัด');
  ok(R(`cdNormalize({ standards: Array.from({ length: 99 }, (_, i) => ({ code: 'c' + i, text: 't' })) }, null).standards.length`) === R('CD_MAX.stdRows') && R(`cdNormalize({}, null).standards.length`) === 0, 'cdNormalize: จำกัดจำนวนมาตรฐาน · เอกสารเก่าที่ไม่มีมาตรฐาน = รายการว่าง');

  // ---------------- เก็บค่า → บันทึก ----------------
  $('cd-nameEn').value = ' Thai Language 2 ';
  $('cd-semester').value = '2';
  $('cd-hours').value = ' 60 ';
  $('cd-area').value = ' ภาษาไทย ';
  $('cd-type').value = 'เพิ่มเติม';
  $('cd-descMain').value = 'ศึกษาหลักการอ่านออกเสียง';
  $('cd-descPurpose').value = 'เพื่ออ่านออกเสียงบทร้อยแก้ว';
  const col = R('cdCollect(document.getElementById("cd-form"))');
  ok(col.nameEn === 'Thai Language 2' && col.semester === '2' && col.type === 'เพิ่มเติม' && col.indicators.length === 3 && col.hours === '60' && col.area === 'ภาษาไทย', 'Collect: ตัดช่องว่าง · อ่านภาคเรียน/ประเภท/ตัวชี้วัด/เวลาเรียน/กลุ่มสาระครบ');
  $('cd-save-btn').click();
  await settle();
  const saved = store.get('users/u1/courseTemplates/t1/settings/description');
  ok(!!saved, 'แม่แบบวิชา: บันทึกที่ courseTemplates/{id}/settings/description');
  ok(saved && saved.descMain === 'ศึกษาหลักการอ่านออกเสียง' && saved.indicators.length === 3 && saved.standards.length === 2 && saved.hours === '60' && saved.area === 'ภาษาไทย' && saved.updatedAt === 'TS', 'เนื้อหา + มาตรฐาน + ตัวชี้วัด + เวลาเรียน + กลุ่มสาระ + เวลาแก้ไข ถูกเขียนครบ');
  ok(R('cdIsDirty()') === false && toasts.some(t => /บันทึกคำอธิบายรายวิชาสำเร็จ/.test(t[0])), 'บันทึกสำเร็จ: ล้างธงค่าค้าง + แจ้งผล');
  ok(!$('cd-save-btn').disabled && $('cd-save-btn').textContent.trim() === R('CD_SAVE_LABEL'), 'ปุ่มบันทึกกลับมากดได้หลังบันทึก');

  // ---------------- เปิดซ้ำ: โหลดค่าที่บันทึกไว้ ----------------
  host.innerHTML = '';
  await R(`renderCourseDescTab(document.getElementById('host'), ${JSON.stringify(course)})`);
  await settle();
  ok($('cd-descMain').value === 'ศึกษาหลักการอ่านออกเสียง' && $('cd-semester').value === '2' && $('cd-type').value === 'เพิ่มเติม', 'เปิดใหม่: โหลดค่าที่บันทึกไว้กลับมา');
  ok(host.querySelectorAll('.cd-ind-row').length === 3 && host.querySelectorAll('.cd-std-row').length === 2, 'เปิดใหม่: ตัวชี้วัดครบ 3 แถว · มาตรฐานครบ 2 แถว');
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

  // ---------------- ตัวอย่างก่อนพิมพ์ ----------------
  ctx.courseBaseRef = c => ref('users/u1/' + (c.isTemplate ? 'courseTemplates' : 'courses') + '/' + c.id); // คืนค่าที่เทสต์โหลดล้มเหลวทับไว้
  host.innerHTML = '';
  await R(`renderCourseDescTab(document.getElementById('host'), ${JSON.stringify(course)})`);
  await settle();
  ok(!$('cd-preview-btn') && !/ยังไม่มีหน้าตัวอย่าง/.test(host.textContent), 'ฟอร์มไม่มีปุ่มตัวอย่างแล้ว (ย้ายเป็นแท็บ) · ข้อความเก่า "ยังไม่มีหน้าตัวอย่าง" ถูกเอาออก');
  ok(/แท็บ “ตัวอย่างก่อนพิมพ์”/.test(host.textContent), 'ข้อความแนะนำบนฟอร์มชี้ไปที่แท็บ "ตัวอย่างก่อนพิมพ์"');

  const fd = { codeTh: 'ท21102', nameTh: 'ภาษาไทย 2', codeEn: 'TH21102', nameEn: 'Thai 2', level: 'มัธยมศึกษาปีที่ 1', semester: '1', credit: '1.5', hours: '60', area: 'ภาษาไทย', type: 'พื้นฐาน',
    descMain: 'ศึกษาหลักการอ่าน <b>x</b>\nย่อหน้าสอง', descPurpose: 'เพื่ออ่านออกเสียง', indicators: [{ code: 'ท 1.1 ม.1/1', text: 'อ่านออกเสียง' }, { code: 'ท 1.1 ม.1/2', text: 'จับใจความ' }] };
  const body = R(`cdBuildBodyHtml(${JSON.stringify(fd)})`);
  const bd = new JSDOM('<body>' + body + '</body>').window.document;
  ok(bd.querySelectorAll('section.pg-port').length === 1 && bd.querySelector('.d1-title').textContent === 'คำอธิบายรายวิชาพื้นฐาน', 'เอกสาร: 1 section · หัวเรื่อง \"คำอธิบายรายวิชา\" ตามด้วยประเภทวิชา (พื้นฐาน)');
  ok(new JSDOM('<body>' + R(`cdBuildBodyHtml(${JSON.stringify({ ...fd, type: 'เพิ่มเติม' })})`) + '</body>').window.document.querySelector('.d1-title').textContent === 'คำอธิบายรายวิชาเพิ่มเติม', 'ประเภทเพิ่มเติม: หัวเรื่อง \"คำอธิบายรายวิชาเพิ่มเติม\"');
  const hl = [...bd.querySelectorAll('.d1-l')].map(e => e.textContent.replace(/\s+/g, ' ').trim());
  ok(hl[0] === 'ท21102 ภาษาไทย 2 กลุ่มสาระการเรียนรู้ภาษาไทย' && bd.querySelectorAll('.d1-l > span').length === 4, 'บรรทัดที่ 2: รหัส ชื่อวิชา กลุ่มสาระการเรียนรู้… (ไม่มีคำว่า \"รหัสวิชา\" / \"ชื่อรายวิชา\" นำหน้า)');
  ok(hl[1] === 'ชั้นมัธยมศึกษาปีที่ 1 เวลา 60 ชั่วโมง จำนวน 1.5 หน่วยกิต', 'บรรทัดที่ 3: ชั้น… เวลา … ชั่วโมง จำนวน … หน่วยกิต');
  ok(bd.querySelector('.d1-title + .d1-l') && bd.querySelectorAll('.d1-l + .d1-l + .d1-rule').length === 1 && bd.querySelector('.d1-rule + .d1-p'), 'ลำดับ: หัวเรื่อง → 2 บรรทัดข้อมูล → เส้นจุดไข่ปลา → ย่อหน้าคำอธิบาย');
  ok(!/ภาคเรียนที่|Course Code|Course Title|TH21102/.test(bd.body.textContent), 'ไม่พิมพ์ภาคเรียน · ชื่อ/รหัสภาษาอังกฤษ (ไม่อยู่ในแบบฟอร์ม)');
  ok(bd.querySelectorAll('.d1-p').length === 3 && !bd.querySelector('.d1-p b'), 'คำอธิบาย 2 ย่อหน้า + จุดประสงค์ 1 ย่อหน้า · ข้อความถูก escape (ไม่ตีความ HTML)');
  ok(!bd.querySelector('table') && bd.querySelector('.d1-h').textContent === 'รหัสตัวชี้วัด', 'ตัวชี้วัด: หัว \"รหัสตัวชี้วัด\" · ไม่ใช้ตาราง');
  const indLines = [...bd.querySelectorAll('.d1-ind')].map(e => e.textContent);
  ok(indLines.length === 1 && indLines[0] === 'ท 1.1 ม.1/1, ม.1/2' && /รวมทั้งหมด 2 ตัวชี้วัด/.test(bd.querySelector('.d1-total').textContent), 'ตัวชี้วัดมาตรฐานเดียวกันรวมเป็นบรรทัดเดียว (\"ท 1.1 ม.1/1, ม.1/2\") · สรุปจำนวนเป็นตัวชี้วัด ไม่ใช่จำนวนบรรทัด');
  const gi = JSON.parse(R(`JSON.stringify(cdGroupIndicators([
    { code: 'ต1.1 ป1/1' }, { code: 'ต 1.2  ป.1/1' }, { code: 'ต1.1 ป1/2' }, { code: 'ต 1.2 ป.1/2', text: 'x' }, { code: 'ท 1.1' }, { code: '', text: 'ไม่มีรหัส' }, null, { code: 'ว 1.1 ม.2/10' } ]))`));
  ok(gi.length === 4 && gi[0].head === 'ต1.1' && gi[0].subs.join('|') === 'ป1/1|ป1/2' && gi[1].head === 'ต 1.2' && gi[1].subs.join('|') === 'ป.1/1|ป.1/2', 'จัดกลุ่มตามมาตรฐานเรียงตามที่พบก่อน · รหัสย่อยเรียงตามที่ใส่ · ใช้ข้อความตามที่พิมพ์ (ต1.1 กับ ต 1.2 ไม่ปนกัน)');
  ok(gi[2].head === 'ท 1.1' && gi[2].subs.length === 0 && gi[3].head === 'ว 1.1' && gi[3].subs[0] === 'ม.2/10', 'รหัสที่ไม่มีรหัสย่อยแสดงเป็นบรรทัดของตัวเอง · แถวไม่มีรหัส/null ถูกข้าม');
  const six = new JSDOM('<body>' + R(`cdBuildBodyHtml({ indicators: ['ต 1.1 ป 6/1','ต 1.2 ป 6/1','ต 1.3 ป 6/1','ต 2.1 ป 6/1','ต 2.2 ป 6/1','ต 3.1 ป 6/1','ต 4.1 ป 6/1','ต 4.2 ป 6/1'].map(code => ({ code })) })`) + '</body>').window.document;
  const rows6 = [...six.querySelectorAll('.d1-irow')].map(r => [...r.querySelectorAll('.d1-ind')].map(c => c.querySelector('.d1-ih').textContent));
  ok(rows6.length === 4 && rows6.flat().join(',') === 'ต 1.1,ต 2.2,ต 1.2,ต 3.1,ต 1.3,ต 4.1,ต 2.1,ต 4.2', 'รหัสตัวชี้วัด 2 คอลัมน์ เรียงลงตามคอลัมน์ (ซ้าย ต1.1–2.1 · ขวา ต2.2–4.2) แต่ละแถวเป็นบล็อกตัดหน้าได้');
  const gp = JSON.parse(R(`JSON.stringify(cdGroupIndicators([{ code: 'ต 1.1 ป 6/1' }, { code: 'ต 1.1 ป 6/2' }, { code: 'ต 1.2 ป 6/6' }]))`));
  ok(gp.length === 2 && gp[0].head === 'ต 1.1' && gp[0].subs.join('|') === 'ป 6/1|ป 6/2' && gp[1].subs[0] === 'ป 6/6', 'รหัสย่อยแบบมีช่องว่าง \"ป 6/1\" (ตามแบบหลักสูตร) แยกถูก: ต 1.1 → ป 6/1, ป 6/2');
  const mixed = new JSDOM('<body>' + R(`cdBuildBodyHtml({ indicators: [ { code: 'ท 1.1 ม.1/1' }, { code: 'ท 1.1' }, { text: 'ไม่มีรหัส' } ] })`) + '</body>').window.document;
  ok(/รวมทั้งหมด 2 ตัวชี้วัด/.test(mixed.querySelector('.d1-total').textContent), 'จำนวนรวมนับเฉพาะแถวที่มีรหัส (ตรงกับที่เห็นในรายการ)');
  ok(R(`cdLevelText('มัธยมศึกษาปีที่ 1')`) === 'ชั้นมัธยมศึกษาปีที่ 1' && R(`cdLevelText('ชั้นประถมศึกษาปีที่ 4')`) === 'ชั้นประถมศึกษาปีที่ 4' && R(`cdLevelText('ม.1')`) === 'ชั้น ม.1' && R(`cdLevelText('')`) === '', 'คำว่า \"ชั้น\" นำหน้าระดับชั้น: ไม่ซ้ำ · ติดกับ ประถม/มัธยม · เว้นวรรคกับรูปย่อ');
  const ar = new JSDOM('<body>' + R(`cdBuildBodyHtml({ area: 'กลุ่มสาระการเรียนรู้ภาษาต่างประเทศ' })`) + '</body>').window.document;
  ok(/กลุ่มสาระการเรียนรู้ภาษาต่างประเทศ/.test(ar.querySelector('.d1-l').textContent) && !/กลุ่มสาระการเรียนรู้\s*กลุ่มสาระ/.test(ar.querySelector('.d1-l').textContent), 'กลุ่มสาระ: พิมพ์คำนำมาเองก็ไม่ซ้ำสองรอบ');
  const empty = new JSDOM('<body>' + R('cdBuildBodyHtml({})') + '</body>').window.document;
  const el = [...empty.querySelectorAll('.d1-l')].map(e => e.textContent);
  ok(!empty.querySelector('.d1-ind') && !empty.querySelector('.d1-h') && /…/.test(empty.querySelector('.d1-p').textContent) && /……/.test(el[0]) && /กลุ่มสาระการเรียนรู้…/.test(el[0]) && /ชั้น…/.test(el[1]) && /เวลา …+ ชั่วโมง จำนวน …+ หน่วยกิต/.test(el[1]), 'เอกสารว่าง: ไม่มีรายการตัวชี้วัด · ช่องว่างเป็นจุดไข่ปลา');
  const sd = new JSDOM('<body>' + R(`cdBuildBodyHtml(${JSON.stringify({ ...fd, standards: [{ code: 'ว 4.2', text: 'เข้าใจและใช้แนวคิดเชิงคำนวณ' }] })})`) + '</body>').window.document;
  ok(!/มาตรฐานการเรียนรู้|ว 4\.2|เข้าใจและใช้แนวคิด/.test(sd.body.textContent) && !sd.querySelector('table'), 'มาตรฐานการเรียนรู้ที่กรอกไว้ ไม่พิมพ์ในแบบนี้ (เก็บไว้ในฟอร์ม)');
  ok(!bd.body.textContent.includes('มาตรฐานการเรียนรู้'), 'ไม่มีมาตรฐาน: ไม่แสดงหัว/ตารางมาตรฐาน');
  const long = ('คำ ').repeat(900).trim();
  const ch = JSON.parse(R(`JSON.stringify(cdChunks(${JSON.stringify(long)}))`));
  ok(ch.length > 2 && ch.every(c => c.text.length <= R('CD_PARA_MAX')) && ch[0].cont === false && ch.slice(1).every(c => c.cont === true), 'ย่อหน้ายาวถูกตัดเป็นท่อน ≤ CD_PARA_MAX (ท่อนต่อไม่เยื้อง)');
  ok(JSON.parse(R(`JSON.stringify(cdChunks('x'.repeat(1500)))`)).every(c => c.text.length <= R('CD_PARA_MAX')), 'ไม่มีช่องว่างเลย: ตัดตรงขีดไม่ค้าง');
  ok(ch.slice(0, -1).every(c => c.more === true) && ch[ch.length - 1].more === false && R(`cdChunks('สั้น')`)[0].more === false, 'ท่อนที่ยังมีท่อนต่อถูกทำเครื่องหมาย more (ท่อนสุดท้าย/ย่อหน้าสั้น = ไม่ใช่)');
  const lb = new JSDOM('<body>' + R(`cdBuildBodyHtml({ descMain: ${JSON.stringify(long)} })`) + '</body>').window.document;
  ok(lb.querySelectorAll('.d1-p.d1-more').length === ch.length - 1 && lb.querySelectorAll('.d1-p.d1-cont').length === ch.length - 1 && /d1-more\{text-align-last:justify\}/.test(R('CD1_CSS')), 'เอกสาร: ท่อนที่มีท่อนต่อใช้ .d1-more (กระจายบรรทัดท้าย) · ท่อนต่อใช้ .d1-cont');
  const paged = new JSDOM(R(`docSheetsHtml(CD1_CSS, '<div class="cd1">' + cdBuildBodyHtml(${JSON.stringify(fd)}) + '</div>')`)).window.document;
  const sheets = R(`(d => docPaginate(d, { specs: CD_SHEET, bodyClass: 'cd1', keep: '.d1-h', kindOf: () => 'port' }))`)(paged);
  ok(sheets === 1 && paged.querySelectorAll('.doc-sheet').length === 1 && paged.querySelector('.doc-sheet-body.cd1 .d1-ind'), 'โครงกลางตัดหน้าได้: แผ่น A4 พร้อมรายการรหัสตัวชี้วัด');
  ok(/210|297/.test(paged.querySelector('.doc-sheet').getAttribute('style')) && /20mm 15mm 20mm 30mm/.test(paged.querySelector('.doc-sheet').getAttribute('style')), 'ขนาดแผ่น A4 ขอบ 20/15/20/30 มม. ตรงกับ @page ตอนพิมพ์');

  // แท็บตัวอย่าง: ร่างที่ยังไม่บันทึกข้ามแท็บได้ · ไม่มีร่างก็อ่านที่บันทึกไว้
  $('cd-nameEn').value = 'Unsaved Title';
  $('cd-descMain').value = 'ค่าที่ยังไม่บันทึก';
  d.querySelector('#cd-form').dispatchEvent(new w.Event('input'));
  R('cdStashDraft()');
  const pv = d.createElement('div'); d.body.appendChild(pv);
  let edited = 0;
  await R(`renderCourseDescPreviewTab`)(pv, course, () => edited++);
  await settle();
  ok(!!pv.querySelector('.doc-preview-frame.is-fit') && !!pv.querySelector('.doc-preview-frame-wrap') && !!pv.querySelector('#cd-prev-print'), 'แท็บตัวอย่าง: กรอบตัวอย่างใช้คลาสโครงเดียวกับระบบเอกสารอื่น + ปุ่มพิมพ์');
  ok(/ยังไม่ได้บันทึก/.test(pv.querySelector('.doc-preview-hint').textContent), 'ใช้ร่างที่พิมพ์ค้าง: ข้อความแนะนำบอกว่ารวมส่วนที่ยังไม่บันทึก');
  pv.querySelector('#cd-prev-edit').click();
  ok(edited === 1, 'ปุ่ม "แก้ไข" เรียก onEdit (พากลับแท็บฟอร์ม)');
  ok(R('cdIsDirty()') === true, 'อยู่แท็บตัวอย่าง: ธงค่าค้างยังอยู่ (ออกจากกลุ่มแท็บแล้วยังถามก่อนทิ้ง)');
  host.innerHTML = '';
  await R(`renderCourseDescTab(document.getElementById('host'), ${JSON.stringify(course)})`);
  ok($('cd-nameEn').value === 'Unsaved Title' && $('cd-descMain').value === 'ค่าที่ยังไม่บันทึก' && R('cdIsDirty()') === true, 'กลับมาแท็บฟอร์ม: ค่าที่พิมพ์ค้างไว้ไม่หาย · ธงค่าค้างยังเป็นจริง');
  ok(!!$('cd-save-btn'), 'กลับมาแท็บฟอร์ม: ปุ่มบันทึกใช้งานได้');
  const other = JSON.stringify({ ...course, id: 'other' });
  pv.innerHTML = '';
  await R(`renderCourseDescPreviewTab`)(pv, JSON.parse(other), () => {});
  await settle();
  ok(!/ยังไม่ได้บันทึก/.test(pv.querySelector('.doc-preview-hint').textContent), 'ร่างของวิชาหนึ่งไม่ถูกเอาไปแสดงเป็นตัวอย่างของอีกวิชา');
  R('cdDiscardDraft()');
  pv.innerHTML = '';
  await R(`renderCourseDescPreviewTab`)(pv, course, () => {});
  await settle();
  ok(R('cdIsDirty()') === false && !/ยังไม่ได้บันทึก/.test(pv.querySelector('.doc-preview-hint').textContent), 'ทิ้งร่างแล้ว: ตัวอย่างอ่านจากที่บันทึกไว้ · ไม่มีธงค้าง');
  host.innerHTML = '';
  await R(`renderCourseDescTab(document.getElementById('host'), ${JSON.stringify(course)})`);
  await settle();

  // พิมพ์: เปิดหน้าต่างใหม่ → เขียนเอกสาร (ต้องเรียก window.open ก่อน await ใดๆ)
  const written = []; let opened = 0;
  w.open = () => { opened++; return { document: { write: h => written.push(h), close() {} }, focus() {}, print() {}, close() {} }; };
  const pr = R(`cdPrint(${JSON.stringify(fd)})`);
  ok(opened === 1, 'cdPrint: เรียก window.open ทันที (ไม่รอ await ก่อน)');
  await pr; await settle();
  const html = written.join('');
  ok(/<title>คำอธิบายรายวิชา ท21102 ภาษาไทย 2<\/title>/.test(html) && /size:A4 portrait;margin:2cm 1\.5cm 2cm 3cm/.test(html), 'หน้าต่างพิมพ์: ชื่อเอกสาร + @page A4 ขอบ 2/1.5/2/3 ซม.');
  ok(/class="cd1"/.test(html) && /อ่านออกเสียง/.test(html) && /\.cd1 \.d1-ind/.test(html) && /\.cd1 \.d1-rule\{border-bottom:1\.5pt dotted/.test(html), 'หน้าต่างพิมพ์: มีเนื้อหา + สไตล์ของกระดาษ (CD1_CSS)');

  // ---------------- แท็บภาพรวมของหน้าวิชา (js/courses.js) ----------------
  const cstore = new Map();
  const cref = path => ({ path, collection: n => ({ doc: id => cref(path + '/' + n + '/' + id) }), get: async () => { if (cref.fail) throw new Error('offline'); return { exists: cstore.has(path), data: () => cstore.get(path) }; } });
  const cctx = { db: { collection: n => ({ doc: id => cref(n + '/' + id) }) }, AppState: { user: { uid: 'u1' } }, console: { warn() {}, log() {}, error() {} },
    escapeHtml: ctx.escapeHtml, showToast() {}, firebase: ctx.firebase };
  vm.createContext(cctx);
  vm.runInContext(read('js/courses.js').replace(/^const /gm, 'var '), cctx, { filename: 'js/courses.js' });
  const C = code => vm.runInContext(code, cctx);
  const T = 'users/u1/courseTemplates/t1/settings/description', X = 'users/u1/courses/c1/settings/description';
  ok(await C(`loadCourseDescription({ id: 'c1', templateId: 't1' })`) === null, 'ยังไม่เคยกรอก → null (ไม่มีเอกสาร)');
  cstore.set(T, { descMain: '', descPurpose: '', indicators: [] });
  ok(await C(`loadCourseDescription({ id: 'c1', templateId: 't1' })`) === null, 'เอกสารว่างทั้งหมด → null (แสดงสถานะยังไม่กรอก)');
  cstore.set(T, { descMain: 'ศึกษาจากแม่แบบ', indicators: [{ code: 'ก', text: 'ข' }] });
  cstore.set(X, { descMain: 'ของรายวิชาเอง' });
  let got = await C(`loadCourseDescription({ id: 'c1', templateId: 't1' })`);
  ok(got && got.descMain === 'ศึกษาจากแม่แบบ', 'วิชาที่ผูกแม่แบบ: อ่านคำอธิบายจากแม่แบบ (ใช้ร่วมกันทุกเทอม)');
  got = await C(`loadCourseDescription({ id: 'c1' })`);
  ok(got && got.descMain === 'ของรายวิชาเอง', 'วิชาที่ไม่มี templateId: อ่านจาก courses/{id}/settings/description');
  cref.fail = true;
  ok(await C(`loadCourseDescription({ id: 'c1', templateId: 't1' })`) === null, 'อ่านไม่ได้ → null (ไม่ทำให้แท็บภาพรวมพัง)');
  cref.fail = false;

  let card = C(`courseDescCardHtml(null, { id: 'c1', templateId: 't1' })`);
  ok(/ยังไม่ได้กรอกคำอธิบายรายวิชา/.test(card) && /id="ov-desc-edit-btn"[^>]*>กรอกคำอธิบายรายวิชา</.test(card) && !/ov-desc-print-btn/.test(card), 'ยังไม่มีคำอธิบาย: บอกสถานะ + ปุ่มกรอก · ไม่มีปุ่มพิมพ์');
  card = C(`courseDescCardHtml(${JSON.stringify({ descMain: 'ศึกษา <script>x</script>', descPurpose: 'เพื่อ…', indicators: [{ code: 'ท 1.1', text: 'a' }, { code: '', text: '' }, { code: 'ท 1.2', text: 'b' }] })}, { id: 'c1', templateId: 't1' })`);
  ok(/id="ov-desc-print-btn"/.test(card) && />แก้ไข</.test(card) && /ศึกษา &lt;script&gt;/.test(card) && !/<script>/.test(card), 'มีคำอธิบาย: ปุ่มดูตัวอย่าง/พิมพ์ + แก้ไข · ข้อความถูก escape');
  ok(/ตัวชี้วัด 2 ข้อ/.test(card) && (card.match(/class="cdesc-ind-row"/g) || []).length === 2, 'ตัวชี้วัด: ซ่อนในรายการพับ · นับเฉพาะแถวที่มีข้อมูล');
  card = C(`courseDescCardHtml(${JSON.stringify({ descMain: 'ศึกษา', standards: [{ code: 'ว 4.2', text: 'มาตรฐาน <b>x</b>' }], indicators: [{ code: 'ม.1/1', text: 'a' }] })}, { id: 'c1', templateId: 't1' })`);
  ok(/มาตรฐานการเรียนรู้ 1 มาตรฐาน/.test(card) && card.indexOf('มาตรฐานการเรียนรู้ 1') < card.indexOf('ตัวชี้วัด 1 ข้อ') && /มาตรฐาน &lt;b&gt;x/.test(card), 'การ์ดหน้าวิชา: แสดงมาตรฐานก่อนตัวชี้วัด (พับได้ · escape)');
  cstore.set(T, { standards: [{ code: 'ว 4.2', text: 'x' }] });
  ok((await C(`loadCourseDescription({ id: 'c1', templateId: 't1' })`)) !== null, 'เอกสารที่มีแต่มาตรฐานก็นับว่ามีคำอธิบาย (ไม่แสดงสถานะยังไม่กรอก)');
  ok(!/ov-desc-edit-btn/.test(C(`courseDescCardHtml(null, { id: 'c1' })`)), 'วิชาที่ไม่มี templateId: ไม่มีปุ่มแก้ (ไม่มีแม่แบบให้ไปแก้)');
  const cs = read('js/courses.js'), ap = read('js/app.js');
  ok(/loadCourseDescription\(course\)/.test(cs) && /\$\{courseDescCardHtml\(desc, course\)\}/.test(cs), 'แท็บภาพรวม: โหลดพร้อมข้อมูลอื่น แล้ววาดการ์ด');
  ok(/structureOpenOnce\s*=\s*course\.templateId/.test(cs) && /AppState\.structureTab\s*=\s*'desc'/.test(cs) && /structureEditingTemplateId\s*=\s*AppState\.structureOpenOnce\s*\|\|\s*null/.test(ap) && /structureOpenOnce\s*=\s*null/.test(ap), 'ปุ่มแก้: ข้ามไปแท็บคำอธิบายของแม่แบบ (ใช้ครั้งเดียวแล้วล้าง) · เข้าหน้าตั้งค่าโครงสร้างตามปกติยังเริ่มที่รายการ');
  ok(/cdPrint\(/.test(cs) && /LAZY_BUNDLES\.cdesc/.test(cs), 'ปุ่มพิมพ์ที่หน้าวิชา: โหลดโมดูล cdesc แล้วใช้ cdPrint ตัวเดียวกับหน้าตัวอย่าง');
  const cssAll = read('css/style.css'), bundleAt = cssAll.indexOf('/* @bundle docs');
  ok(cssAll.indexOf('.cdesc-text') > 0 && cssAll.indexOf('.cdesc-text') < bundleAt && read('css/style.min.css').includes('.cdesc-ind-row'), 'CSS การ์ดคำอธิบายอยู่ในส่วนหลัก (core) — หน้าวิชาไม่ต้องรอโหลด docs.min.css');

  // ---------------- ลงทะเบียนครบ + กฎโปรเจกต์ ----------------
  const src = read('js/course-desc.js');
  ok(/'course-desc':\s*'js\/course-desc\.js'/.test(read('js/utils.js')), 'utils.js: LAZY_MODULES มี course-desc');
  ok(/cdesc:\s*\[[^\]]*'doc-shell'[^\]]*'course-desc'\]/.test(read('js/utils.js')), 'utils.js: LAZY_BUNDLES.cdesc โหลด doc-shell ก่อน course-desc (ได้ docs.min.css)');
  ok(/'js\/course-desc\.js'/.test(read('sw.js')), 'sw.js: PRECACHE มี js/course-desc.js');
  const pk = read('js/picker-pages.js');
  ok(/STRUCT_TABS[^;]*'desc'[^;]*คำอธิบายรายวิชา[^;]*'descprev'[^;]*ตัวอย่างก่อนพิมพ์/.test(pk) && /renderCourseDescPreviewTab\(/.test(pk) && /cdStashDraft\(\)/.test(pk) && /loadModules\(LAZY_BUNDLES\.cdesc\)/.test(pk) && /renderCourseDescTab\(/.test(pk), 'หน้าโครงสร้างวิชา: มีแท็บ "คำอธิบายรายวิชา" แล้วตามด้วยแท็บ "ตัวอย่างก่อนพิมพ์" (โหลดโมดูลแล้ววาด · เก็บร่างก่อนสลับแท็บ)');
  ok(!/<style|createElement\(['"]style|insertRule|\.style\./.test(src) && !/style="[^"$]/.test(src), 'ไม่เขียน CSS ใน JS (ไม่มี <style> · el.style · style="ค่าคงที่")');
  const css = read('css/style.css'), at = css.indexOf('/* @bundle docs'), ci = css.indexOf('.cd-ind, .cd-std {');
  ok(ci > at && at > 0 && read('css/docs.min.css').includes('.cd-std'), 'CSS ของฟอร์มอยู่ในบล็อก bundle docs และถูกสร้างลง docs.min.css');
  const rules = read('firestore.rules');
  ok(/match \/courseTemplates\/\{templateId\}[\s\S]*?match \/\{document=\*\*\}[\s\S]*?validDoc\(100\)/.test(rules), 'firestore.rules: เอกสารใต้ courseTemplates (รวม settings/description) เขียนได้อยู่แล้ว');

  console.log(fail ? `\n✗ ไม่ผ่าน ${fail} ข้อ` : '\n✓ ผ่านทุกข้อ');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
