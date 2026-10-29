// ทดสอบแท็บ "โครงสร้างรายวิชา" (js/syllabus.js) ด้วย jsdom + Firestore จำลองในหน่วยความจำ
// วิธีรัน: node tests/syllabus.test.js   (หรือ npm run test:syll)
// ตรวจ: normalize (ตัดช่องว่าง · ทิ้งแถวว่าง · id ซ้ำ · ขีดจำกัด · กลุ่มสาระเริ่มต้นจากคำอธิบายรายวิชา) · โครงสร้างคะแนน → หน่วย/น้ำหนัก (ลำดับ · คะแนนนอกหน่วย · กลางภาค/ปลายภาค) ·
//        โมเดลตาราง (ยอดรวม · คำเตือนชั่วโมง/คะแนน · หน่วยที่ถูกลบข้าม · หน่วยใหม่เป็นแถวว่าง · เปลี่ยนชื่อตามโครงสร้าง) ·
//        กระดาษตามตัวอย่างหลักสูตร ว22183 (หัวเอกสาร · ตาราง 5 หน่วย · อัตราส่วน 70 : 30 · รวมทั้งสิ้น 20 / 100 · escape) ·
//        ฟอร์ม (โหลด · ดึงตัวชี้วัด · เพิ่ม/ลบสาระย่อย · สรุปสด · บันทึกที่ settings/syllabus · เก็บข้อมูลหน่วยที่ถูกข้าม · ร่างข้ามมุมมอง) ·
//        การ์ดแท็บภาพรวมของหน้าวิชา (js/courses.js) · ลงทะเบียนครบ (utils.js · sw.js · แท็บ · CSS bundle docs · script test)
const fs = require('fs'), vm = require('vm'), path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = process.env.PA_ROOT ? path.resolve(process.env.PA_ROOT) : path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// ---- Firestore จำลอง: เก็บเอกสารตามพาธ · collection().get() = เอกสารลูกโดยตรงของพาธนั้น ----
const store = new Map();
const fail = { on: false };
function ref(p) {
  return {
    path: p, id: p.split('/').pop(),
    collection: n => ({
      doc: id => ref(p + '/' + n + '/' + id),
      get: async () => {
        if (fail.on) throw new Error('offline');
        const pre = p + '/' + n + '/';
        const docs = [...store.keys()].filter(k => k.startsWith(pre) && !k.slice(pre.length).includes('/')).map(k => ({ id: k.slice(pre.length), data: () => store.get(k) }));
        return { docs, size: docs.length };
      },
    }),
    get: async () => { if (fail.on) throw new Error('offline'); return { exists: store.has(p), data: () => store.get(p) }; },
    set: async d => { store.set(p, JSON.parse(JSON.stringify(d))); },
  };
}
const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', { url: 'http://localhost/' });
const w = dom.window;
const toasts = [];
const ctx = {
  window: w, document: w.document, console, setTimeout, clearTimeout, Promise, URL, JSON, Date, Math, Object, Array, Set, Map, String, Number, Error, RegExp, isFinite,
  AppState: { user: { uid: 'u1' } },
  firebase: { firestore: { FieldValue: { serverTimestamp: () => 'TS' } } },
  escapeHtml: s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  showLoading() {}, showToast: (m, k) => toasts.push([m, k || '']), loadModule: async () => {}, loadModules: async () => {},
  courseBaseRef: c => ref('users/u1/' + (c.isTemplate ? 'courseTemplates' : 'courses') + '/' + c.id),
  requestAnimationFrame: f => setTimeout(f, 0), getComputedStyle: w.getComputedStyle.bind(w), Event: w.Event, HTMLElement: w.HTMLElement,
};
vm.createContext(ctx);
['js/doc-shell.js', 'js/course-desc.js', 'js/syllabus.js'].forEach(f => vm.runInContext(read(f), ctx, { filename: f }));
const R = code => vm.runInContext(code, ctx);
const J = o => JSON.stringify(o);
const settle = () => new Promise(r => setTimeout(r, 30));
let bad = 0;
const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗', m); if (!c) bad++; };
const d = w.document;
const $ = id => d.getElementById(id);
const norm = s => s.replace(/\s+/g, ' ').trim();
const body = html => new JSDOM('<body>' + html + '</body>').window.document;

// ---- ข้อมูลตัวอย่าง: โครงสร้างรายวิชา ว22183 (เทคโนโลยี วิทยาการคำนวณ 2) ม.2 · 0.5 หน่วยกิต = 20 ชั่วโมง ----
const course = { id: 't1', isTemplate: true, code: 'ว22183', name: 'เทคโนโลยี (วิทยาการคำนวณ 2)', level: 'มัธยมศึกษาปีที่ 2', credit: '0.5' };
const TP = 'users/u1/courseTemplates/t1';
const unitNames = ['การใช้เทคโนโลยีสารสนเทศอย่างมีความรับผิดชอบ', 'แนวคิดเชิงคำนวณ', 'หลักการทำงานของระบบคอมพิวเตอร์', 'เทคโนโลยีการสื่อสาร', 'การแก้ปัญหาด้วยโปรแกรม Scratch'];
const seedStructure = (opts = {}) => {
  [...store.keys()].filter(k => k.startsWith(TP + '/assessments/') || k === TP + '/settings/structure').forEach(k => store.delete(k));
  store.set(TP + '/settings/structure', {
    groups: [{ id: 'g1', name: 'ก่อนกลางภาค' }, { id: 'g2', name: 'หลังกลางภาค' }],
    units: unitNames.map((name, i) => ({ id: 'u' + (i + 1), name, groupId: i < 2 ? 'g1' : 'g2' })),
  });
  unitNames.forEach((_, i) => store.set(`${TP}/assessments/a${i + 1}`, { name: 'งาน ' + (i + 1), max: 10, category: 'collect', groupId: i < 2 ? 'g1' : 'g2', unitId: 'u' + (i + 1) }));
  store.set(TP + '/assessments/mid', { name: 'สอบกลางภาค', max: 20, category: 'midterm' });
  store.set(TP + '/assessments/fin', { name: 'สอบปลายภาค', max: 30, category: 'final' });
  if (opts.outside) store.set(TP + '/assessments/loose', { name: 'งานนอกหน่วย', max: 5, category: 'collect', groupId: null, unitId: null });
};
const t = (title, hours) => ({ title, hours });
const SYL = {
  units: [
    { id: 'u1', standard: 'ว4.2 / ม.2/4', topics: [t('ถูกต้อง ปลอดภัย ใช่เลย', '1'), t('สิทธิ์ของเรา', '1')] },
    { id: 'u2', standard: 'ว4.2 / ม.2/1', topics: [t('แนวคิดเชิงคำนวณ', '2'), t('ประยุกต์แนวคิดเชิงคำนวณ', '2')] },
    { id: 'u3', standard: 'ว4.2 / ม.2/3', topics: [t('หลักการทำงานของระบบคอมพิวเตอร์', '1'), t('ซอฟต์แวร์และการใช้งาน', '1')] },
    { id: 'u4', standard: 'ว4.2 / ม.2/3', topics: [t('การสื่อสารและบริการบนเครือข่าย', '2'), t('เทคโนโลยีคลาวด์', '2')] },
    { id: 'u5', standard: 'ว4.2 / ม.2/1, ม2/2', topics: [t('รู้จักฟังก์ชัน', '2'), t('เรื่องของความจริง', '2'), t('ฟังก์ชันที่มีพารามิเตอร์', '2'), t('การประยุกต์ใช้งาน', '2')] },
  ],
};
const DESC = { type: 'พื้นฐาน', area: 'วิทยาศาสตร์และเทคโนโลยี', indicators: [{ code: 'ว 4.2 ม.2/1', text: 'a' }, { code: 'ว 4.2 ม.2/2', text: 'b' }, { code: 'ว 4.2 ม.2/3', text: 'c' }, { code: 'ว 4.2 ม.2/4', text: 'd' }] };

(async () => {
  // ---------------- normalize ----------------
  ok(R(`syHours('2')`) === '2' && R(`syHours(' 1.25 ')`) === '1.3' && R(`syHours('')`) === '' && R(`syHours('abc')`) === '' && R(`syHours('-3')`) === '' && R(`syHours('5000')`) === '999', 'ชั่วโมง: เลขไม่ติดลบ ทศนิยม 1 ตำแหน่ง ไม่เกิน 999 · ค่าอื่น = ว่าง');
  let n = JSON.parse(R(`JSON.stringify(syNormalize({ area: ' วิทย์ ', units: [
    { id: 'a', standard: ' ว1 ', topics: [{ title: ' ก ', hours: '2' }, { title: '', hours: '' }, null, { title: '', hours: '3' }] },
    { id: 'a', standard: 'ซ้ำ', topics: [] }, { id: '', standard: 'ไม่มี id' }, { id: 'b', standard: '', topics: [] }, null,
    { id: 'c', standard: 'x'.repeat(900), topics: Array.from({ length: 50 }, (_, i) => ({ title: 't' + i })) } ] }, 'ไม่ใช้'))`));
  ok(n.area === 'วิทย์' && n.units.length === 2 && n.units[0].id === 'a' && n.units[1].id === 'c', 'normalize: ตัดช่องว่าง · ทิ้ง id ซ้ำ/ไม่มี id/หน่วยที่ไม่มีเนื้อหา/ค่า null');
  ok(n.units[0].standard === 'ว1' && n.units[0].topics.length === 2 && n.units[0].topics[0].title === 'ก' && n.units[0].topics[1].hours === '3', 'normalize: สาระย่อยที่ว่างทั้งแถวถูกทิ้ง (มีแต่ชั่วโมงยังเก็บ)');
  ok(n.units[1].standard.length === R('SY_MAX.std') && n.units[1].topics.length === R('SY_MAX.topics'), 'normalize: ตัดความยาวมาตรฐาน · จำกัดจำนวนสาระย่อยต่อหน่วย');
  ok(R(`syNormalize({}, 'จากคำอธิบาย')`).area === 'จากคำอธิบาย' && R(`syNormalize({ units: [] }, 'จากคำอธิบาย')`).area === 'จากคำอธิบาย', 'ยังไม่เคยบันทึกกลุ่มสาระ → ใช้ค่าจากคำอธิบายรายวิชา');
  ok(R(`syNormalize({ area: '' }, 'จากคำอธิบาย')`).area === '', 'เคยบันทึกกลุ่มสาระเป็นค่าว่างแล้ว → ว่างตามนั้น (ไม่ดึงกลับมาทับ)');
  ok(R(`syNormalize(null, '').units.length`) === 0 && R(`syNormalize({ units: 'x' }, '').units.length`) === 0, 'normalize: เอกสารว่าง/รูปแบบผิด → ไม่พัง');

  // ---------------- โครงสร้างคะแนน → หน่วย ----------------
  const items = [
    { id: 'i1', category: 'collect', max: 10, unitId: 'ub' }, { id: 'i2', category: 'collect', max: '5', unitId: 'ub' }, { id: 'i3', category: 'collect', max: 8, unitId: 'ua' },
    { id: 'i4', category: 'collect', max: 7, unitId: null }, { id: 'i5', category: 'collect', max: 3, unitId: 'ghost' },
    { id: 'm', category: 'midterm', max: 20 }, { id: 'f', category: 'final', max: 30 },
  ];
  const sd = { groups: [{ id: 'g1', name: 'ก' }], units: [{ id: 'ua', name: 'หน่วย ก', groupId: 'g1' }, { id: 'ub', name: 'หน่วย ข', groupId: null }, { id: 'uc', name: 'หน่วย ค', groupId: 'หมวดที่ไม่มี' }, null, {}] };
  let st = JSON.parse(R(`JSON.stringify(syStructFrom(${J(items)}, ${J(sd)}))`));
  ok(st.units.map(u => u.id).join() === 'ub,uc,ua', 'ลำดับหน่วย: ยังไม่จัดหมวดก่อน (หมวดที่ไม่มีอยู่จริงนับเป็นยังไม่จัดหมวด) แล้วตามด้วยแต่ละหมวด · ข้ามรายการ null/ไม่มี id');
  ok(st.units[0].weight === 15 && st.units[1].weight === 0 && st.units[2].weight === 8, 'น้ำหนักคะแนนต่อหน่วย = รวม max ของชิ้นงานในหน่วย (ข้อความตัวเลขนับด้วย)');
  ok(st.outside === 10 && st.collect === 33 && st.midterm === 20 && st.final === 30, 'คะแนนเก็บนอกหน่วย (ไม่มีหน่วย + หน่วยที่ไม่มีอยู่) รวมเข้ายอดเก็บ · กลางภาค/ปลายภาค');
  st = JSON.parse(R(`JSON.stringify(syStructFrom([], null))`));
  ok(st.units.length === 0 && st.collect === 0 && st.midterm === 0 && st.final === 0, 'ยังไม่เคยบันทึกโครงสร้าง: ไม่มีหน่วย ยอดเป็นศูนย์ (ไม่พัง)');

  // ---------------- โมเดล: ตรงกับตัวอย่าง ว22183 ----------------
  seedStructure();
  store.set(TP + '/settings/syllabus', SYL);
  store.set(TP + '/settings/description', DESC);
  const loaded = await R(`syLoad`)(course, course);
  ok(loaded.struct.units.length === 5 && loaded.struct.units.every(u => u.weight === 10) && loaded.struct.collect === 50, 'syLoad: อ่านโครงสร้างคะแนนจริง 5 หน่วย หน่วยละ 10 คะแนน');
  ok(loaded.saved.area === 'วิทยาศาสตร์และเทคโนโลยี' && loaded.desc.type === 'พื้นฐาน', 'syLoad: กลุ่มสาระเริ่มต้นจากคำอธิบายรายวิชา · ประเภทวิชาจากคำอธิบาย');
  const m = R(`syModel`)(course, loaded.struct, loaded.saved, loaded.desc);
  ok(m.hoursTotal === 20 && m.hoursExpected === 20 && m.grand === 100 && m.ratio.join() === '70,30' && m.warnings.length === 0, 'ตัวอย่างหลักสูตร: ชั่วโมงรวม 20 = 0.5 × 40 · คะแนนรวม 100 · อัตราส่วน 70:30 · ไม่มีคำเตือน');
  ok(m.units.map(u => u.hours).join() === '2,4,2,4,8' && m.units[4].topics.length === 4, 'ชั่วโมงต่อหน่วย 2,4,2,4,8');

  const doc = body(R(`sySheetBodyHtml`)(m));
  ok(doc.querySelectorAll('section.pg-port').length === 1 && doc.querySelector('.sy-title').textContent === 'โครงสร้างรายวิชาพื้นฐานวิทยาศาสตร์และเทคโนโลยี', 'กระดาษ: 1 section · หัวเรื่อง "โครงสร้างรายวิชา" + ประเภท + กลุ่มสาระ');
  const hl = [...doc.querySelectorAll('.sy-l')].map(e => norm(e.textContent));
  ok(hl[0] === 'เทคโนโลยี (วิทยาการคำนวณ 2) ว22183 กลุ่มสาระการเรียนรู้วิทยาศาสตร์และเทคโนโลยี', 'บรรทัดที่ 2: ชื่อวิชา รหัส · กลุ่มสาระการเรียนรู้…');
  ok(hl[1] === 'ชั้นมัธยมศึกษาปีที่ 2 เวลา 20 ชั่วโมง จำนวน 0.5 หน่วยกิต', 'บรรทัดที่ 3: ชั้น… เวลา 20 ชั่วโมง จำนวน 0.5 หน่วยกิต');
  ok([...doc.querySelectorAll('thead th')].map(e => norm(e.textContent)).join('|') === 'หน่วยที่|ชื่อหน่วยการเรียนรู้|มาตรฐาน/ตัวชี้วัด|สาระการเรียนรู้ (เนื้อหา)|เวลา(ชั่วโมง)|น้ำหนักคะแนน', 'หัวตาราง 6 คอลัมน์ตามแบบ');
  const urows = [...doc.querySelectorAll('tr.sy-u')];
  ok(urows.length === 5 && urows.every(r => r.children.length === 5 && r.children[3].colSpan === 2), '1 หน่วย = 1 แถว (ตัดหน้าไม่กลางหน่วย) · เซลล์สาระ+เวลารวม 2 คอลัมน์ ไม่ใช้ rowspan');
  ok(!doc.querySelector('[rowspan]'), 'ไม่ใช้ rowspan (docPaginate ตัดตารางทีละแถว)');
  const r1 = urows[0];
  ok(norm(r1.children[0].textContent) === '1' && norm(r1.children[1].textContent) === unitNames[0] && norm(r1.children[2].textContent) === 'ว4.2 / ม.2/4' && norm(r1.children[4].textContent) === '10', 'แถวหน่วย 1: เลขหน่วย · ชื่อ · มาตรฐาน · น้ำหนัก 10');
  const topics1 = [...r1.querySelectorAll('.sy-tr')].map(e => [norm(e.querySelector('.sy-tt').textContent), norm(e.querySelector('.sy-th').textContent)]);
  ok(J(topics1) === J([['1.1 ถูกต้อง ปลอดภัย ใช่เลย', '1'], ['1.2 สิทธิ์ของเรา', '1']]), 'สาระย่อยเลขนำ 1.1 · 1.2 พร้อมชั่วโมง');
  ok([...urows[4].querySelectorAll('.sy-tt')].map(e => norm(e.textContent))[2] === '5.3 ฟังก์ชันที่มีพารามิเตอร์' && urows[4].querySelectorAll('.sy-tr').length === 4, 'หน่วย 5 มี 4 สาระย่อย (5.1–5.4)');
  const srows = [...doc.querySelectorAll('tr.sy-sum')].map(r => [...r.children].map(c => norm(c.textContent)));
  ok(J(srows[0]) === J(['อัตราส่วนระหว่างภาค : ปลายภาค 70 : 30 คะแนน']), 'แถวอัตราส่วน: "ระหว่างภาค : ปลายภาค 70 : 30 คะแนน"');
  ok(J(srows.slice(1)) === J([['รวมชั่วโมง/คะแนนระหว่างภาค', '', '50'], ['รวมชั่วโมง/คะแนนกลางภาค', '', '20'], ['รวมชั่วโมง/คะแนนปลายภาค', '', '30'], ['รวมทั้งสิ้น', '20', '100']]), 'แถวสรุป: ระหว่างภาค 50 · กลางภาค 20 · ปลายภาค 30 · รวมทั้งสิ้น 20 ชั่วโมง / 100 คะแนน');
  ok(!/คะแนนเก็บนอกหน่วย/.test(doc.body.textContent), 'ไม่มีคะแนนนอกหน่วย → ไม่มีแถวนี้');

  // ---------------- ตารางตามโครงสร้างจริง: เปลี่ยนชื่อ · ลบ · เพิ่มหน่วย · นอกหน่วย ----------------
  seedStructure({ outside: true });
  let L = await R(`syLoad`)(course, course);
  let m2 = R(`syModel`)(course, L.struct, L.saved, L.desc);
  ok(m2.outside === 5 && m2.collect === 55 && m2.grand === 105 && m2.ratio.join() === '75,30', 'คะแนนเก็บนอกหน่วยรวมเข้ายอด: เก็บ 55 · รวม 105 · อัตราส่วน 75:30');
  ok(m2.warnings.length === 1 && /105 ไม่ครบ 100/.test(m2.warnings[0]), 'เตือนเมื่อคะแนนรวมไม่ครบ 100');
  const od = body(R(`sySheetBodyHtml`)(m2));
  const orow = [...od.querySelectorAll('tr.sy-sum')].find(r => /คะแนนเก็บนอกหน่วย/.test(r.textContent));
  ok(orow && norm(orow.lastElementChild.textContent) === '5' && orow.nextElementSibling.textContent.includes('อัตราส่วน'), 'แถว "คะแนนเก็บนอกหน่วย" 5 คะแนน อยู่ก่อนแถวอัตราส่วน (ยอดรวมยังตรง)');

  seedStructure();
  store.set(TP + '/settings/structure', { groups: [{ id: 'g1', name: 'ก' }], units: [
    { id: 'u1', name: 'ชื่อใหม่ของหน่วย 1', groupId: 'g1' }, { id: 'u2', name: '   ', groupId: 'g1' }, { id: 'u9', name: 'หน่วยใหม่', groupId: 'g1' } ] }); // u3–u5 ถูกลบ · u9 เพิ่มใหม่
  L = await R(`syLoad`)(course, course);
  m2 = R(`syModel`)(course, L.struct, L.saved, L.desc);
  ok(m2.units.length === 3 && m2.units[0].name === 'ชื่อใหม่ของหน่วย 1' && m2.units[0].topics.length === 2, 'เปลี่ยนชื่อหน่วยในโครงสร้างคะแนน → ชื่อในตารางเปลี่ยนตาม (ข้อมูลที่กรอกยังอยู่ เพราะอ้างด้วย id)');
  ok(m2.units[1].name === 'หน่วยที่ 2', 'ชื่อหน่วยว่าง → "หน่วยที่ n"');
  ok(m2.units[2].id === 'u9' && m2.units[2].topics.length === 0 && m2.units[2].standard === '', 'หน่วยใหม่ → แถวว่างให้กรอก');
  ok(m2.hoursTotal === 6 && !m2.units.some(x => ['u3', 'u4', 'u5'].includes(x.id)), 'หน่วยที่ถูกลบ: ข้อมูลถูกข้าม (ไม่ถูกนับชั่วโมง ไม่โผล่ในตาราง)');
  ok(m2.warnings.some(x => /ชั่วโมงรวม 6 ไม่เท่ากับ 0.5 หน่วยกิต × 40 = 20 ชั่วโมง/.test(x)), 'เตือนเมื่อชั่วโมงรวมไม่เท่ากับหน่วยกิต × 40');
  const empty = R(`syModel`)({ id: 'x', credit: '' }, R(`syStructFrom([], null)`), {}, {});
  ok(empty.hoursExpected === null && empty.warnings.length === 2 && /ยังไม่มีหน่วย/.test(empty.warnings[0]), 'ไม่มีหน่วยกิต: ไม่เตือนเรื่องชั่วโมง · ไม่มีหน่วย: บอกให้ไปเพิ่มที่แท็บโครงสร้างคะแนน');
  const eb = body(R(`sySheetBodyHtml`)(empty));
  ok(/ชั้น…+ เวลา …+ ชั่วโมง/.test(eb.querySelectorAll('.sy-l')[1].textContent) && eb.querySelectorAll('tr.sy-u').length === 0, 'ช่องที่ยังว่างแสดงจุดไข่ปลา · ไม่มีหน่วย = ไม่มีแถวหน่วย');
  ok(R(`syModel`)({ id: 'x', credit: 1.5 }, L.struct, {}, {}).hoursExpected === 60, 'หน่วยกิต 1.5 (ตัวเลข) = 60 ชั่วโมง');

  // ---------------- escape ----------------
  const xs = R(`syModel`)({ id: 'x', code: '<i>', name: '<script>a</script>', credit: '1' }, { units: [{ id: 'u1', name: '<b>หน่วย</b>', weight: 1 }], outside: 0, collect: 1, midterm: 0, final: 0 },
    { area: '<u>x</u>', units: [{ id: 'u1', standard: 'ก<br>ข\nค', topics: [{ title: '<img src=x onerror=1>', hours: '1' }] }] }, {});
  const xd = body(R(`sySheetBodyHtml`)(xs));
  ok(!xd.querySelector('script, img, b, u, i') && xd.querySelectorAll('tr.sy-u br').length === 1, 'ข้อความทุกช่องถูก escape (ไม่ตีความ HTML) · ขึ้นบรรทัดใหม่ในช่องมาตรฐานเป็น <br> ของเราเอง');

  // ---------------- ฟอร์ม ----------------
  seedStructure();
  store.set(TP + '/settings/syllabus', SYL);
  const host = $('host');
  let toScore = 0;
  w.__toScore = () => toScore++;
  await R(`renderSyllabusTab(document.getElementById('host'), ${J(course)}, window.__toScore)`);
  await settle();
  ok(!!$('sy-form') && host.querySelectorAll('.sy-unit').length === 5, 'ฟอร์ม: 1 บล็อกต่อหน่วยการเรียนรู้ (5 หน่วย)');
  ok($('sy-area').value === 'วิทยาศาสตร์และเทคโนโลยี', 'กลุ่มสาระ: ยังไม่เคยกรอกในแท็บนี้ → เริ่มต้นจากคำอธิบายรายวิชา');
  const u1 = host.querySelector('.sy-unit[data-unit="u1"]');
  ok([...u1.querySelectorAll('.sy-unit-h > span')].map(e => norm(e.textContent)).join('|') === `หน่วยที่ 1|${unitNames[0]}|น้ำหนักคะแนน 10`, 'หัวบล็อกหน่วย: ชื่อ + น้ำหนักคะแนน แสดงเป็นข้อความ (แก้ไม่ได้ในแท็บนี้)');
  ok(u1.querySelector('.sy-std').value === 'ว4.2 / ม.2/4' && u1.querySelectorAll('.sy-trow').length === 2 && u1.querySelector('.sy-t-title').value === 'ถูกต้อง ปลอดภัย ใช่เลย', 'ค่าที่บันทึกไว้โหลดกลับมา (มาตรฐาน · สาระย่อย · ชั่วโมง)');
  ok(!host.querySelector('.sy-unit-name input') && /ไปแท็บโครงสร้างคะแนน/.test(host.textContent), 'ชื่อหน่วย/น้ำหนักไม่มีช่องกรอก · มีลิงก์ไปแท็บโครงสร้างคะแนน');
  host.querySelector('#sy-goto-score').click();
  ok(toScore === 1, 'ลิงก์ "ไปแท็บโครงสร้างคะแนน" เรียก onScore');
  ok(/ชั่วโมงรวม\s*20 \/ 20/.test(norm($('sy-check').textContent)) && !host.querySelector('.sy-warn'), 'สรุป: ชั่วโมงรวม 20 / 20 · คะแนนครบ → ไม่มีคำเตือน');

  // ดึงตัวชี้วัดจากคำอธิบายรายวิชา
  const pick = u1.querySelector('.sy-pick');
  ok(pick && pick.options.length === 2 && pick.options[1].textContent === 'ว4.2 / ม.2/1, ม.2/2, ม.2/3, ม.2/4', 'ปุ่มดึงตัวชี้วัด: รวมตามมาตรฐาน "ว4.2 / ม.2/1, …" จากคำอธิบายรายวิชา');
  const ta = u1.querySelector('.sy-std');
  ta.value = '';
  pick.value = '0'; pick.dispatchEvent(new w.Event('change', { bubbles: true }));
  ok(ta.value === 'ว4.2 / ม.2/1, ม.2/2, ม.2/3, ม.2/4' && pick.value === '' && R('syIsDirty()') === true, 'เลือกแล้วใส่ช่องมาตรฐาน (ช่องว่าง = ใส่เลย) · ตัวเลือกกลับเป็นค่าเริ่มต้น · ตั้งธงค่าค้าง');
  ta.value = 'ว4.2 / ม.2/4';
  pick.value = '0'; pick.dispatchEvent(new w.Event('change', { bubbles: true }));
  ok(ta.value === 'ว4.2 / ม.2/4\nว4.2 / ม.2/1, ม.2/2, ม.2/3, ม.2/4', 'ช่องมีค่าอยู่แล้ว: ต่อท้ายบรรทัดใหม่ ไม่ทับ');
  ta.value = 'ว4.2 / ม.2/4';

  // เพิ่ม/ลบสาระย่อย + สรุปสด
  u1.querySelector('.sy-t-add').click();
  ok(u1.querySelectorAll('.sy-trow').length === 3, 'เพิ่มสาระย่อย: แถวใหม่');
  const nr = u1.querySelectorAll('.sy-trow')[2];
  nr.querySelector('.sy-t-title').value = 'เรื่องใหม่';
  nr.querySelector('.sy-t-hours').value = '3';
  nr.querySelector('.sy-t-hours').dispatchEvent(new w.Event('input', { bubbles: true }));
  ok(/ชั่วโมงรวม\s*23 \/ 20/.test(norm($('sy-check').textContent)) && /ชั่วโมงรวม 23 ไม่เท่ากับ 0.5 หน่วยกิต × 40 = 20/.test(host.querySelector('.sy-warn').textContent), 'พิมพ์ชั่วโมงเพิ่ม → สรุปสดอัปเดตและเตือนชั่วโมงไม่เท่าหน่วยกิต × 40');
  nr.querySelector('.sy-t-del').click();
  ok(u1.querySelectorAll('.sy-trow').length === 2 && !host.querySelector('.sy-warn') && /ชั่วโมงรวม\s*20 \/ 20/.test(norm($('sy-check').textContent)), 'ลบแถว: สรุปกลับเป็น 20 / 20 · คำเตือนหาย');
  for (let i = 0; i < 20; i++) u1.querySelector('.sy-t-add').click();
  ok(u1.querySelectorAll('.sy-trow').length === R('SY_MAX.topics') && toasts.some(x => /สูงสุด/.test(x[0])), 'เพิ่มได้ไม่เกินขีดจำกัดต่อหน่วย · แจ้งเตือน');
  [...u1.querySelectorAll('.sy-trow')].slice(2).forEach(r => r.querySelector('.sy-t-del').click());

  // ตัวอย่าง/พิมพ์ ในแท็บเดียวกัน — ร่างข้ามมุมมองไม่หาย
  u1.querySelector('.sy-std').value = 'ค่าที่ยังไม่บันทึก';
  $('sy-area').value = 'กลุ่มสาระใหม่';
  d.querySelector('#sy-form').dispatchEvent(new w.Event('input'));
  $('sy-to-preview').click();
  await settle();
  const frame = host.querySelector('.doc-preview-frame.is-fit');
  ok(!$('sy-form') && !!frame && !!host.querySelector('.doc-preview-frame-wrap') && !!$('sy-prev-print'), 'มุมมองตัวอย่าง: กรอบตัวอย่างโครงเดียวกับระบบเอกสารอื่น + ปุ่มพิมพ์ (แท็บเดียว ไม่แยกแท็บ)');
  ok(/ยังไม่ได้บันทึก/.test(host.querySelector('.doc-preview-hint').textContent) && /ค่าที่ยังไม่บันทึก/.test(frame.srcdoc) && /กลุ่มสาระการเรียนรู้กลุ่มสาระใหม่/.test(frame.srcdoc), 'ตัวอย่างใช้ค่าที่ยังไม่บันทึก · บอกในข้อความแนะนำ');
  ok(/class="sy1"/.test(frame.srcdoc) && /id="doc-src"/.test(frame.srcdoc), 'ตัวอย่างห่อด้วยโครงกลาง (docSheetsHtml) + สไตล์กระดาษ sy1');
  $('sy-prev-edit').click();
  ok(!!$('sy-form') && host.querySelector('.sy-unit[data-unit="u1"] .sy-std').value === 'ค่าที่ยังไม่บันทึก' && $('sy-area').value === 'กลุ่มสาระใหม่' && R('syIsDirty()') === true, 'กลับมาแก้ไข: ค่าที่พิมพ์ค้างไม่หาย · ธงค่าค้างยังอยู่');
  host.querySelector('.sy-unit[data-unit="u1"] .sy-std').value = 'ว4.2 / ม.2/4';
  $('sy-area').value = 'วิทยาศาสตร์และเทคโนโลยี';

  // พิมพ์ผ่านหน้าต่างใหม่
  const written = []; let opened = 0;
  w.open = () => { opened++; return { document: { write: h => written.push(h), close() {} }, focus() {}, print() {}, close() {} }; };
  $('sy-to-preview').click(); await settle();
  const pr = R(`syPrint`)(R(`syModel`)(course, loaded.struct, SYL, DESC));
  ok(opened === 1, 'syPrint: เรียก window.open ทันที (ก่อน await ใดๆ)');
  await pr; await settle();
  const html = written.join('');
  ok(/<title>โครงสร้างรายวิชา ว22183 เทคโนโลยี \(วิทยาการคำนวณ 2\)<\/title>/.test(html) && /size:A4 portrait;margin:15mm/.test(html), 'หน้าต่างพิมพ์: ชื่อเอกสาร + @page A4 ขอบ 15 มม.');
  ok(/class="sy1"/.test(html) && /รวมทั้งสิ้น/.test(html) && /\.sy1 \.sy-tr\{display:grid/.test(html), 'หน้าต่างพิมพ์: มีตารางและสไตล์กระดาษ');
  $('sy-prev-edit').click();

  // syPrintCourse: เปิดหน้าต่างก่อนโหลดข้อมูล แล้วค่อยสร้างเอกสารจากแม่แบบของวิชาที่เปิดสอน
  store.set('users/u1/courses/c1/settings/structure', store.get(TP + '/settings/structure'));
  unitNames.forEach((_, i) => store.set(`users/u1/courses/c1/assessments/a${i + 1}`, store.get(`${TP}/assessments/a${i + 1}`)));
  store.set('users/u1/courses/c1/assessments/mid', store.get(TP + '/assessments/mid'));
  store.set('users/u1/courses/c1/assessments/fin', store.get(TP + '/assessments/fin'));
  written.length = 0; opened = 0;
  const pc = R(`syPrintCourse`)({ id: 'c1', templateId: 't1', code: 'ว22183', name: 'เทคโนโลยี', level: 'ม.2', credit: '0.5' });
  ok(opened === 1, 'syPrintCourse: เรียก window.open ทันที ก่อนโหลดข้อมูล (ไม่โดนบล็อก pop-up)');
  await pc; await settle();
  ok(/โครงสร้างรายวิชาพื้นฐานวิทยาศาสตร์และเทคโนโลยี/.test(written.join('')) && /1\.1 ถูกต้อง ปลอดภัย ใช่เลย/.test(written.join('')), 'syPrintCourse: ใช้ข้อมูลโครงสร้างของวิชานั้น + syllabus/คำอธิบายจากแม่แบบ');
  ok(R(`syOwner({ id: 'c1', templateId: 't1' })`).id === 't1' && R(`syOwner({ id: 'c1', templateId: 't1' })`).isTemplate === true && R(`syOwner({ id: 'c1' })`).id === 'c1', 'เจ้าของข้อมูล: วิชาที่ผูกแม่แบบ → แม่แบบ · ไม่ผูก → ตัววิชาเอง');

  // บันทึก — ต้องเก็บข้อมูลหน่วยที่ถูกข้ามไว้ด้วย
  store.set(TP + '/settings/syllabus', { ...SYL, units: [...SYL.units, { id: 'gone', standard: 'หน่วยที่เคยมี', topics: [t('เก่า', '4')] }] });
  host.innerHTML = '';
  await R(`renderSyllabusTab(document.getElementById('host'), ${J(course)}, window.__toScore)`);
  await settle();
  ok(host.querySelectorAll('.sy-unit').length === 5 && !host.querySelector('.sy-unit[data-unit="gone"]'), 'หน่วยที่ไม่อยู่ในโครงสร้างคะแนนแล้ว: ไม่แสดงในฟอร์ม');
  ok(R('syIsDirty()') === false, 'เปิดแท็บใหม่: ไม่มีธงค่าค้าง');
  host.querySelector('.sy-unit[data-unit="u2"] .sy-std').value = '  ว4.2 / ม.2/1  ';
  host.querySelector('.sy-unit[data-unit="u2"] .sy-t-hours').value = '2.0';
  $('sy-area').value = '  วิทยาศาสตร์  ';
  d.querySelector('#sy-form').dispatchEvent(new w.Event('input'));
  $('sy-save-btn').click();
  ok($('sy-save-btn').disabled === true, 'ระหว่างบันทึก: ปุ่มถูกปิดกันกดซ้ำ');
  await settle();
  const saved = store.get(TP + '/settings/syllabus');
  ok(!!saved && saved.area === 'วิทยาศาสตร์' && saved.updatedAt === 'TS', 'บันทึกที่ courseTemplates/{id}/settings/syllabus · ตัดช่องว่าง · เวลาแก้ไข');
  ok(saved && saved.units.length === 6 && saved.units.find(u => u.id === 'u2').standard === 'ว4.2 / ม.2/1' && saved.units.find(u => u.id === 'u2').topics[0].hours === '2', 'เนื้อหาต่อหน่วยถูกเขียนครบ (ชั่วโมง "2.0" → "2")');
  ok(saved && saved.units.some(u => u.id === 'gone' && u.topics[0].title === 'เก่า'), 'ข้อมูลของหน่วยที่ถูกข้ามยังถูกเก็บไว้ (กลับมาใช้ได้ถ้าเพิ่มหน่วยนั้นคืน)');
  ok(R('syIsDirty()') === false && toasts.some(x => /บันทึกโครงสร้างรายวิชาสำเร็จ/.test(x[0])) && !$('sy-save-btn').disabled && $('sy-save-btn').textContent.trim() === R('SY_SAVE_LABEL'), 'บันทึกสำเร็จ: ล้างธงค่าค้าง · แจ้งผล · ปุ่มกลับมากดได้');

  // เปิดซ้ำ = ค่าที่บันทึก (กลุ่มสาระไม่ถูกดึงจากคำอธิบายมาทับ)
  host.innerHTML = '';
  await R(`renderSyllabusTab(document.getElementById('host'), ${J(course)}, window.__toScore)`);
  await settle();
  ok($('sy-area').value === 'วิทยาศาสตร์' && host.querySelector('.sy-unit[data-unit="u2"] .sy-std').value === 'ว4.2 / ม.2/1', 'เปิดใหม่: โหลดค่าที่บันทึกไว้');

  // ไม่มีตัวชี้วัดในคำอธิบาย → ไม่มีตัวเลือกดึง · ไม่มีหน่วย → ข้อความนำทาง
  store.set(TP + '/settings/description', { type: 'พื้นฐาน', indicators: [] });
  host.innerHTML = '';
  await R(`renderSyllabusTab(document.getElementById('host'), ${J(course)}, window.__toScore)`);
  await settle();
  ok(!host.querySelector('.sy-pick'), 'คำอธิบายรายวิชายังไม่มีตัวชี้วัด: ไม่แสดงตัวเลือกดึง');
  store.set(TP + '/settings/structure', { groups: [], units: [] });
  host.innerHTML = '';
  await R(`renderSyllabusTab(document.getElementById('host'), ${J(course)}, window.__toScore)`);
  await settle();
  ok(host.querySelectorAll('.sy-unit').length === 0 && /ยังไม่มีหน่วยการเรียนรู้/.test(host.textContent) && !!$('sy-save-btn'), 'ไม่มีหน่วยในโครงสร้างคะแนน: บอกให้ไปเพิ่มที่แท็บโครงสร้างคะแนน');

  // ผู้ใช้สลับแท็บระหว่างโหลด → ไม่วาดทับ · โหลดล้มเหลว → ข้อความแทนฟอร์ม
  const ghost = d.createElement('div'); d.body.appendChild(ghost);
  const pend = R(`renderSyllabusTab`)(ghost, course, null);
  ghost.remove();
  await pend; await settle();
  ok(!ghost.querySelector('#sy-form'), 'ออกจากแท็บระหว่างโหลด: ไม่วาดฟอร์มค้าง');
  fail.on = true;
  host.innerHTML = '';
  const realErr = console.error; console.error = () => {};
  await R(`renderSyllabusTab(document.getElementById('host'), ${J(course)}, window.__toScore)`);
  await settle();
  console.error = realErr; fail.on = false;
  ok(/โหลดโครงสร้างรายวิชาไม่สำเร็จ/.test(host.textContent) && !$('sy-form'), 'โหลดไม่สำเร็จ: แสดงข้อความแทนฟอร์ม (ไม่ค้างหน้าโหลด)');

  // ---------------- แผ่นกระดาษ: ตัดหน้าด้วยโครงกลาง ----------------
  const many = { ...m, units: Array.from({ length: 14 }, (_, i) => ({ ...m.units[4], n: i + 1, id: 'x' + i })) };
  const paged = new JSDOM(R(`docSheetsHtml`)(R('SY1_CSS'), '<div class="sy1">' + R(`sySheetBodyHtml`)(many) + '</div>')).window.document;
  const pages = R(`(d => docPaginate(d, { specs: SY_SHEET, bodyClass: 'sy1', keep: '.sy-title', kindOf: () => 'port' }))`)(paged);
  ok(pages >= 1 && paged.querySelector('.doc-sheet-body.sy1 table') && /210|297/.test(paged.querySelector('.doc-sheet').getAttribute('style')) && /15mm 15mm 15mm 15mm/.test(paged.querySelector('.doc-sheet').getAttribute('style')), 'โครงกลางตัดหน้าได้: แผ่น A4 ขอบ 15 มม. ตรงกับ @page');
  const placed = [...paged.querySelectorAll('#doc-paper tr.sy-u')]; // ต้นฉบับ #doc-src ยังอยู่ใน DOM (ซ่อน) จึงนับเฉพาะที่วางลงแผ่นกระดาษ
  ok(placed.length === 14 && placed.every(r => r.children.length === 5) && paged.querySelectorAll('#doc-paper thead').length === pages, 'วางลงแผ่นแล้วทุกหน่วยครบ แถวหน่วยไม่ถูกฉีก (1 หน่วย = 1 แถว) · หัวตารางซ้ำทุกแผ่น (jsdom ไม่มีเลย์เอาต์ จึงตรวจโครงสร้าง ไม่ใช่จุดตัดหน้า)');

  // ---------------- แท็บภาพรวมของหน้าวิชา (js/courses.js) ----------------
  const cstore = new Map();
  const cref = p => ({ path: p, collection: nm => ({ doc: id => cref(p + '/' + nm + '/' + id) }), get: async () => { if (cref.fail) throw new Error('offline'); return { exists: cstore.has(p), data: () => cstore.get(p) }; } });
  const cctx = { db: { collection: nm => ({ doc: id => cref(nm + '/' + id) }) }, AppState: { user: { uid: 'u1' } }, console: { warn() {}, log() {}, error() {} }, escapeHtml: ctx.escapeHtml, showToast() {}, firebase: ctx.firebase };
  vm.createContext(cctx);
  vm.runInContext(read('js/courses.js').replace(/^const /gm, 'var '), cctx, { filename: 'js/courses.js' });
  const C = code => vm.runInContext(code, cctx);
  cstore.set('users/u1/courses/c1/settings/structure', { groups: [{ id: 'g1', name: 'ก' }, { id: 'g2', name: 'ข' }], units: [{ id: 'u2', name: 'หน่วยสอง', groupId: 'g2' }, { id: 'u1', name: 'หน่วยหนึ่ง', groupId: 'g1' }, { id: 'u0', name: 'ยังไม่จัดหมวด', groupId: null }] });
  cstore.set('users/u1/courseTemplates/t1/settings/syllabus', { units: [{ id: 'u1', standard: 'ว4.2 / ม.2/1\nว4.2 / ม.2/2', topics: [{ title: 'ก', hours: '2' }, { title: 'ข', hours: '1.5' }] }, { id: 'u2', standard: '', topics: [] }, { id: 'gone', standard: 'x', topics: [{ title: 'y', hours: '9' }] }] });
  cstore.set('users/u1/courses/c1/settings/syllabus', { units: [{ id: 'u1', standard: 'ของวิชาเอง', topics: [] }] });
  let got = await C(`loadCourseSyllabus({ id: 'c1', templateId: 't1' })`);
  ok(got && got.sd && got.syl && got.syl.units.length === 3, 'การ์ดภาพรวม: โครงสร้างอ่านจากวิชานี้เอง · syllabus อ่านจากแม่แบบ (ใช้ร่วมทุกเทอม)');
  got = await C(`loadCourseSyllabus({ id: 'c1' })`);
  ok(got && got.syl.units[0].standard === 'ของวิชาเอง', 'วิชาที่ไม่มี templateId: อ่าน syllabus จาก courses/{id}/settings/syllabus');
  got = await C(`loadCourseSyllabus({ id: 'zzz', templateId: 'zzz' })`);
  ok(got && got.sd === null && got.syl === null, 'ยังไม่เคยกรอก: { sd: null, syl: null } (ไม่โยน error)');
  cref.fail = true;
  ok(await C(`loadCourseSyllabus({ id: 'c1', templateId: 't1' })`) === null, 'อ่านไม่ได้ → null (ไม่ทำให้แท็บภาพรวมพัง)');
  cref.fail = false;
  const sy = await C(`loadCourseSyllabus({ id: 'c1', templateId: 't1' })`);
  const rows = JSON.parse(C(`JSON.stringify(syllabusRows(${J(sy)}))`));
  ok(rows.map(r => r.name).join() === 'ยังไม่จัดหมวด,หน่วยหนึ่ง,หน่วยสอง', 'ลำดับหน่วยในการ์ดเหมือนหน้าโครงสร้างคะแนน (ยังไม่จัดหมวด → แต่ละหมวดตามลำดับหมวด ไม่ใช่ตามลำดับในอาร์เรย์)');
  const sameOrder = R(`syStructFrom([], ${J(sy.sd)})`).units.map(u => u.name).join() === rows.map(r => r.name).join();
  ok(sameOrder, 'ลำดับหน่วยในการ์ด (courses.js) ตรงกับตาราง (syllabus.js · syStructFrom)');
  ok(rows[1].hours === 3.5 && rows[1].filled === true && rows[2].filled === false && rows[0].filled === false && !rows.some(r => r.hours === 9), 'ชั่วโมงต่อหน่วยรวมทศนิยม · หน่วยว่างไม่นับว่ากรอกแล้ว · ข้อมูลหน่วยที่ถูกลบถูกข้าม');
  let card = C(`syllabusCardHtml(null, { id: 'c1', templateId: 't1' })`);
  ok(/ยังไม่มีหน่วยการเรียนรู้ในโครงสร้างคะแนน/.test(card) && /ov-syl-edit-btn/.test(card) && !/ov-syl-print-btn/.test(card), 'ไม่มีโครงสร้างคะแนน: บอกให้เพิ่มหน่วยก่อน · ไม่มีปุ่มพิมพ์');
  card = C(`syllabusCardHtml(${J({ sd: sy.sd, syl: null })}, { id: 'c1', templateId: 't1' })`);
  ok(/ยังไม่ได้กรอกโครงสร้างรายวิชา/.test(card) && />กรอกโครงสร้างรายวิชา</.test(card) && !/ov-syl-print-btn/.test(card), 'มีหน่วยแต่ยังไม่กรอก: ข้อความนำทาง + ปุ่ม "กรอกโครงสร้างรายวิชา" · ไม่มีปุ่มพิมพ์');
  card = C(`syllabusCardHtml(${J(sy)}, { id: 'c1', templateId: 't1' })`);
  const cd = body(card);
  ok(/กรอกแล้ว 1 จาก 3 หน่วย · รวม 3.5 ชั่วโมง/.test(norm(cd.body.textContent)) && cd.querySelectorAll('.cdesc-ind-row').length === 3, 'การ์ด: สรุปจำนวนหน่วยที่กรอก + ชั่วโมงรวม · รายการหน่วยครบ');
  ok(/หน่วยหนึ่ง — 3.5 ชั่วโมง · ว4.2 \/ ม.2\/1 · ว4.2 \/ ม.2\/2/.test(norm(cd.body.textContent)) && !!cd.querySelector('#ov-syl-print-btn') && cd.querySelector('#ov-syl-edit-btn').textContent === 'แก้ไข', 'การ์ด: ชื่อหน่วย · ชั่วโมง · มาตรฐาน (ขึ้นบรรทัดใหม่ → " · ") · ปุ่มพิมพ์/แก้ไข');
  card = C(`syllabusCardHtml(${J({ sd: { units: [{ id: 'u1', name: '<b>x</b>' }] }, syl: { units: [{ id: 'u1', standard: '<i>y</i>', topics: [] }] } })}, { id: 'c1' })`);
  ok(!/<b>|<i>/.test(card) && !/ov-syl-edit-btn/.test(card), 'การ์ด: escape ข้อความ · วิชาที่ไม่มี templateId ไม่มีปุ่มแก้ (ไม่มีแม่แบบให้ไปแก้)');
  const cs = read('js/courses.js');
  ok(/loadCourseSyllabus\(course\)/.test(cs) && /\$\{syllabusCardHtml\(syll, course\)\}/.test(cs) && /structureTab = 'syll'/.test(cs) && /syPrintCourse\(course\)/.test(cs), 'แท็บภาพรวม: โหลดพร้อมข้อมูลอื่น · วาดการ์ดต่อจากคำอธิบายรายวิชา · ปุ่มแก้ไปแท็บ syll · ปุ่มพิมพ์ใช้ syPrintCourse');
  ok(!/\bsy-(unit|stat|warn|trow|std|pick|head-ro|topics)\b/.test(cs), 'courses.js (หลัก) ไม่ใช้คลาสของ bundle docs (ใช้ cdesc-* ที่อยู่ใน core แทน)');

  // ---------------- ลงทะเบียนครบ + กฎโปรเจกต์ ----------------
  const U = read('js/utils.js'), src = read('js/syllabus.js');
  ok(/syllabus:\s*'js\/syllabus\.js'/.test(U), 'utils.js: LAZY_MODULES มี syllabus');
  ok(/syll:\s*\[[^\]]*'doc-shell'[^\]]*'course-desc'[^\]]*'syllabus'\]/.test(U), 'utils.js: LAZY_BUNDLES.syll โหลด doc-shell → course-desc → syllabus (ได้ docs.min.css + ตัวช่วยของคำอธิบายรายวิชา)');
  ok(/'js\/syllabus\.js'/.test(read('sw.js')), 'sw.js: PRECACHE มี js/syllabus.js');
  const pk = read('js/picker-pages.js');
  ok(/STRUCT_TABS = \[\['score', '[^']+'\], \['syll', 'โครงสร้างรายวิชา'\], \['desc'/.test(pk), 'หน้าโครงสร้างวิชา: แท็บ "โครงสร้างรายวิชา" ต่อจากแท็บโครงสร้างคะแนน');
  ok(/loadModules\(LAZY_BUNDLES\.syll\)/.test(pk) && /renderSyllabusTab\(pane, tpl,/.test(pk) && /syIsDirty\(\)/.test(pk) && /syDiscard\(\)/.test(pk), 'หน้าโครงสร้างวิชา: โหลดโมดูลแล้ววาดแท็บ · ถามก่อนทิ้งค่าค้างตอนออกจากแท็บ');
  ok(/AppState\.structureTab !== 'score'/.test(read('js/structure.js')), 'saveStructure: ไม่วาดโครงสร้างคะแนนทับแท็บอื่นหลังบันทึก (รวมแท็บใหม่)');
  ok(!/<style|createElement\(['"]style|insertRule|\.style\./.test(src) && !/style="(?!--)[^"]/.test(src), 'ไม่เขียน CSS ใน JS (ไม่มี <style> · el.style · style="ค่าคงที่" — ส่งเป็นตัวแปร --xxx เท่านั้น)');
  ok(R('SY1_CSS').split('}').map(s => s.trim()).filter(Boolean).every(r => /^\.sy1\b/.test(r)), 'SY1_CSS มีเฉพาะกฎของกระดาษ (.sy1 …) ไม่มีสไตล์หน้าเว็บ');
  const css = read('css/style.css'), at = css.indexOf('/* @bundle docs'), ci = css.indexOf('.sy-unit {');
  ok(ci > at && at > 0 && read('css/docs.min.css').includes('.sy-unit') && read('css/docs.min.css').includes('.sy-stat'), 'CSS ของฟอร์มอยู่ในบล็อก bundle docs และถูกสร้างลง docs.min.css');
  ok(css.indexOf('.struct-table td.in-unit') > 0 && css.indexOf('.struct-table td.in-unit') < at && read('css/style.min.css').includes('td.in-unit'), 'CSS เยื้องชิ้นงานใต้หน่วย (แทน inline style เดิมใน structure.js) อยู่ใน core');
  ok(/"test:syll":\s*"node tests\/syllabus\.test\.js"/.test(read('package.json')), 'package.json: มีสคริปต์ test:syll');
  ok(/match \/courseTemplates\/\{templateId\}[\s\S]*?match \/\{document=\*\*\}[\s\S]*?validDoc\(100\)/.test(read('firestore.rules')), 'firestore.rules: เอกสารใต้ courseTemplates (รวม settings/syllabus) เขียนได้อยู่แล้ว');

  console.log(bad ? `\n✗ ไม่ผ่าน ${bad} ข้อ` : '\n✓ ผ่านทุกข้อ');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
