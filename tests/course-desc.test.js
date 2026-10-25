// ทดสอบฟอร์มคำอธิบายรายวิชา (js/course-desc.js) ด้วย jsdom + Firestore จำลองในหน่วยความจำ
// วิธีรัน: node tests/course-desc.test.js   (หรือ npm run test:cdesc)
// ตรวจ: normalize (ค่าเริ่มต้นจากวิชา · ตัดช่องว่าง · จำกัดจำนวน) · แยกตัวชี้วัดที่วางมา · โครงฟอร์มแบบ PA ·
//        เพิ่ม/ลบ/วางแถว · เก็บค่า → บันทึกที่ settings/description ของแม่แบบ/รายวิชา · ธง "ยังไม่บันทึก" ·
//        ตัวอย่างก่อนพิมพ์ (ปุ่ม · เนื้อหากระดาษ · ตัดย่อหน้ายาว · กลับไปแก้ไขค่าไม่หาย · พิมพ์ผ่าน docPrintWindow) ·
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

  // ---------------- ตัวอย่างก่อนพิมพ์ ----------------
  ctx.courseBaseRef = c => ref('users/u1/' + (c.isTemplate ? 'courseTemplates' : 'courses') + '/' + c.id); // คืนค่าที่เทสต์โหลดล้มเหลวทับไว้
  host.innerHTML = '';
  await R(`renderCourseDescTab(document.getElementById('host'), ${JSON.stringify(course)})`);
  await settle();
  const pbtn = $('cd-preview-btn');
  ok(!!pbtn && pbtn.type === 'button' && pbtn.closest('.pa-form-footer') && /ตัวอย่างก่อนพิมพ์/.test(pbtn.textContent), 'ท้ายฟอร์มมีปุ่ม "ตัวอย่างก่อนพิมพ์" (type=button)');
  ok(!/ยังไม่มีหน้าตัวอย่าง/.test(host.textContent), 'ข้อความเก่า "ยังไม่มีหน้าตัวอย่าง" ถูกเอาออก');

  const fd = { codeTh: 'ท21102', nameTh: 'ภาษาไทย 2', codeEn: 'TH21102', nameEn: 'Thai 2', level: 'มัธยมศึกษาปีที่ 1', semester: '1', credit: '1.5', type: 'พื้นฐาน',
    descMain: 'ศึกษาหลักการอ่าน <b>x</b>\nย่อหน้าสอง', descPurpose: 'เพื่ออ่านออกเสียง', indicators: [{ code: 'ท 1.1 ม.1/1', text: 'อ่านออกเสียง' }, { code: 'ท 1.1 ม.1/2', text: 'จับใจความ' }] };
  const body = R(`cdBuildBodyHtml(${JSON.stringify(fd)})`);
  const bd = new JSDOM('<body>' + body + '</body>').window.document;
  ok(bd.querySelectorAll('section.pg-port').length === 1 && bd.querySelector('.d1-title').textContent === 'คำอธิบายรายวิชา', 'เอกสาร: 1 section · หัวเรื่อง "คำอธิบายรายวิชา"');
  const lines = [...bd.querySelectorAll('.d1-c')].map(e => e.textContent);
  ok(lines.some(t => /รหัสวิชา ท21102\s+ชื่อรายวิชา ภาษาไทย 2/.test(t)) && lines.some(t => /Course Code TH21102\s+Course Title Thai 2/.test(t)), 'บรรทัดรหัส/ชื่อวิชา ไทย + อังกฤษ');
  ok(lines.some(t => /ระดับชั้น มัธยมศึกษาปีที่ 1\s+ภาคเรียนที่ 1\s+จำนวน 1\.5 หน่วยกิต\s+รายวิชาพื้นฐาน/.test(t)), 'บรรทัดระดับชั้น · ภาคเรียน · หน่วยกิต · ประเภท');
  ok(bd.querySelectorAll('.d1-p').length === 3 && !bd.querySelector('.d1-p b'), 'คำอธิบาย 2 ย่อหน้า + จุดประสงค์ 1 ย่อหน้า · ข้อความถูก escape (ไม่ตีความ HTML)');
  ok(bd.querySelectorAll('.d1-tbl tbody tr').length === 2 && bd.querySelector('.d1-tbl thead') && /รวมทั้งหมด 2 ตัวชี้วัด/.test(bd.querySelector('.d1-total').textContent), 'ตารางตัวชี้วัด: มีหัวตาราง · 2 แถว · สรุปจำนวน');
  const empty = new JSDOM('<body>' + R('cdBuildBodyHtml({})') + '</body>').window.document;
  ok(!empty.querySelector('.d1-tbl') && /…/.test(empty.querySelector('.d1-p').textContent) && /……/.test(empty.querySelector('.d1-c:nth-child(2)').textContent), 'เอกสารว่าง: ไม่มีตารางตัวชี้วัด · ช่องว่างเป็นจุดไข่ปลา');
  const long = ('คำ ').repeat(900).trim();
  const ch = JSON.parse(R(`JSON.stringify(cdChunks(${JSON.stringify(long)}))`));
  ok(ch.length > 2 && ch.every(c => c.text.length <= R('CD_PARA_MAX')) && ch[0].cont === false && ch.slice(1).every(c => c.cont === true), 'ย่อหน้ายาวถูกตัดเป็นท่อน ≤ CD_PARA_MAX (ท่อนต่อไม่เยื้อง)');
  ok(JSON.parse(R(`JSON.stringify(cdChunks('x'.repeat(1500)))`)).every(c => c.text.length <= R('CD_PARA_MAX')), 'ไม่มีช่องว่างเลย: ตัดตรงขีดไม่ค้าง');
  ok(ch.slice(0, -1).every(c => c.more === true) && ch[ch.length - 1].more === false && R(`cdChunks('สั้น')`)[0].more === false, 'ท่อนที่ยังมีท่อนต่อถูกทำเครื่องหมาย more (ท่อนสุดท้าย/ย่อหน้าสั้น = ไม่ใช่)');
  const lb = new JSDOM('<body>' + R(`cdBuildBodyHtml({ descMain: ${JSON.stringify(long)} })`) + '</body>').window.document;
  ok(lb.querySelectorAll('.d1-p.d1-more').length === ch.length - 1 && lb.querySelectorAll('.d1-p.d1-cont').length === ch.length - 1 && /d1-more\{text-align-last:justify\}/.test(R('CD1_CSS')), 'เอกสาร: ท่อนที่มีท่อนต่อใช้ .d1-more (กระจายบรรทัดท้าย) · ท่อนต่อใช้ .d1-cont');
  const paged = new JSDOM(R(`docSheetsHtml(CD1_CSS, '<div class="cd1">' + cdBuildBodyHtml(${JSON.stringify(fd)}) + '</div>')`)).window.document;
  const sheets = R(`(d => docPaginate(d, { specs: CD_SHEET, bodyClass: 'cd1', keep: '.d1-h', kindOf: () => 'port' }))`)(paged);
  ok(sheets === 1 && paged.querySelectorAll('.doc-sheet').length === 1 && paged.querySelector('.doc-sheet-body.cd1 .d1-tbl'), 'โครงกลางตัดหน้าได้: แผ่น A4 พร้อมตารางตัวชี้วัด');
  ok(/210|297/.test(paged.querySelector('.doc-sheet').getAttribute('style')) && /20mm 20mm 20mm 25mm/.test(paged.querySelector('.doc-sheet').getAttribute('style')), 'ขนาดแผ่น A4 ขอบ 20/20/20/25 มม. ตรงกับ @page ตอนพิมพ์');

  // กดปุ่ม → หน้าตัวอย่างแทนฟอร์ม (อ่านค่าที่ยังไม่บันทึกด้วย)
  $('cd-nameEn').value = 'Unsaved Title';
  $('cd-descMain').value = 'ค่าที่ยังไม่บันทึก';
  d.querySelector('#cd-form').dispatchEvent(new w.Event('input'));
  const dirtyBefore = R('cdIsDirty()');
  pbtn.click();
  await settle();
  ok(!$('cd-form') && !!host.querySelector('.doc-preview-frame') && !!$('cd-prev-back') && !!$('cd-prev-print'), 'กด "ตัวอย่างก่อนพิมพ์": ฟอร์มถูกแทนที่ด้วยกรอบตัวอย่าง + ปุ่มกลับ/พิมพ์');
  ok(host.querySelector('.doc-preview-frame').classList.contains('is-fit') && host.querySelector('.doc-preview-frame-wrap'), 'กรอบตัวอย่างใช้คลาสโครงเดียวกับระบบเอกสารอื่น (.doc-preview-frame.is-fit)');
  ok(dirtyBefore === true && R('cdIsDirty()') === true, 'อยู่หน้าตัวอย่าง: ธงค่าค้างยังอยู่ (สลับแท็บแล้วยังถามก่อนทิ้ง)');
  $('cd-prev-back').click();
  ok(!!$('cd-form') && $('cd-nameEn').value === 'Unsaved Title' && $('cd-descMain').value === 'ค่าที่ยังไม่บันทึก', 'กลับไปแก้ไข: ค่าที่พิมพ์ค้างไว้ไม่หาย');
  ok(R('cdIsDirty()') === true, 'กลับมาที่ฟอร์ม: ธงค่าค้างยังเป็นจริง');
  ok(!!$('cd-preview-btn') && !!$('cd-save-btn'), 'กลับมาที่ฟอร์ม: ปุ่มตัวอย่าง/บันทึกใช้งานได้อีก');

  // พิมพ์: เปิดหน้าต่างใหม่ → เขียนเอกสาร (ต้องเรียก window.open ก่อน await ใดๆ)
  const written = []; let opened = 0;
  w.open = () => { opened++; return { document: { write: h => written.push(h), close() {} }, focus() {}, print() {}, close() {} }; };
  const pr = R(`cdPrint(${JSON.stringify(fd)})`);
  ok(opened === 1, 'cdPrint: เรียก window.open ทันที (ไม่รอ await ก่อน)');
  await pr; await settle();
  const html = written.join('');
  ok(/<title>คำอธิบายรายวิชา ท21102 ภาษาไทย 2<\/title>/.test(html) && /size:A4 portrait;margin:2cm 2cm 2cm 2\.5cm/.test(html), 'หน้าต่างพิมพ์: ชื่อเอกสาร + @page A4 ขอบ 2/2/2/2.5 ซม.');
  ok(/class="cd1"/.test(html) && /อ่านออกเสียง/.test(html) && /\.cd1 \.d1-tbl/.test(html), 'หน้าต่างพิมพ์: มีเนื้อหา + สไตล์ของกระดาษ (CD1_CSS)');

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
  ok(/STRUCT_TABS[^;]*'desc'[^;]*คำอธิบายรายวิชา/.test(pk) && /loadModules\(LAZY_BUNDLES\.cdesc\)/.test(pk) && /renderCourseDescTab\(/.test(pk), 'หน้าโครงสร้างวิชา: มีแท็บ "คำอธิบายรายวิชา" ที่โหลดโมดูลแล้ววาดฟอร์ม');
  ok(!/<style|createElement\(['"]style|insertRule|\.style\./.test(src) && !/style="[^"$]/.test(src), 'ไม่เขียน CSS ใน JS (ไม่มี <style> · el.style · style="ค่าคงที่")');
  const css = read('css/style.css'), at = css.indexOf('/* @bundle docs'), ci = css.indexOf('.cd-ind {');
  ok(ci > at && at > 0 && read('css/docs.min.css').includes('.cd-ind'), 'CSS ของฟอร์มอยู่ในบล็อก bundle docs และถูกสร้างลง docs.min.css');
  const rules = read('firestore.rules');
  ok(/match \/courseTemplates\/\{templateId\}[\s\S]*?match \/\{document=\*\*\}[\s\S]*?validDoc\(100\)/.test(rules), 'firestore.rules: เอกสารใต้ courseTemplates (รวม settings/description) เขียนได้อยู่แล้ว');

  console.log(fail ? `\n✗ ไม่ผ่าน ${fail} ข้อ` : '\n✓ ผ่านทุกข้อ');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
