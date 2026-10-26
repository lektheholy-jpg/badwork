// ทดสอบผู้ช่วย AI ของฟอร์มคำอธิบายรายวิชา (js/course-desc-ai.js + แกน js/badwork-ai.js) ด้วย jsdom — วาดฟอร์มจริงแล้วตรวจ
// วิธีรัน: node tests/course-desc-ai.test.js   (หรือ npm run test:cdescai)
// ตรวจ: การ์ด AI อยู่หัวฟอร์ม + แถวปุ่มเฉพาะ 2 ช่อง (คำอธิบาย · จุดประสงค์ — ไม่แตะตัวชี้วัด) · ปุ่มทำงานถูก (ช่องว่าง/ปรับสำนวน/ย่อ ไม่เขียนทับ) ·
//        พร้อต์: ส่งข้อมูลวิชา+ตัวชี้วัด+บริบทเฉพาะที่เกี่ยวข้อง · ใช้ค่าที่ยังไม่บันทึก · จำกัดขนาดตัวชี้วัด · ไม่ส่งชื่อครู ·
//        ผ่านหน้าต่างตรวจทาน → ใส่ช่อง → ตั้งธง "ยังไม่บันทึก" · บริบท aiCtx: บันทึกอัตโนมัติแม้ยังไม่เคยบันทึกฟอร์ม (ไม่ทำให้ค่าเริ่มต้นจากวิชาหาย) ·
//        บันทึกฟอร์มแล้วบริบทไม่หาย · ไม่ตั้งธงค่าค้างจากการพิมพ์บริบท · ไม่ดึงบริบทของวิชาอื่นมาเติม · ร่างข้ามแท็บคงบริบท ·
//        โหลด AI ล้มเหลว = ฟอร์มใช้ได้ตามเดิม · ลงทะเบียนไฟล์ครบ (utils.js · sw.js) · คีย์ AI ไม่ซ้ำระบบอื่น · ไม่มี CSS ใน JS
const fs = require('fs'), vm = require('vm'), path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = process.env.PA_ROOT ? path.resolve(process.env.PA_ROOT) : path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// ---- Firestore จำลอง: เก็บเอกสารตามพาธ · set รองรับ { merge: true } (รวมแมปซ้อนเหมือนของจริง) ----
const store = new Map();
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const merge = (a, b) => { const o = { ...a }; Object.keys(b).forEach(k => { o[k] = isObj(b[k]) && isObj(a[k]) ? merge(a[k], b[k]) : b[k]; }); return o; };
const setLog = [];
function ref(p) {
  const parts = p.split('/');
  return {
    path: p, id: parts[parts.length - 1],
    collection: n => ({ doc: id => ref(p + '/' + n + '/' + id) }),
    get: async () => ({ exists: store.has(p), data: () => store.get(p) }),
    set: async (d, opt) => {
      const clean = JSON.parse(JSON.stringify(d));
      setLog.push({ p, merge: !!(opt && opt.merge), keys: Object.keys(clean) });
      store.set(p, opt && opt.merge && store.has(p) ? merge(store.get(p), clean) : clean);
    },
  };
}
const TPL = id => `users/u1/courseTemplates/${id}/settings/description`;

const dom = new JSDOM('<!doctype html><body><div id="host"></div><div id="modal-root"></div></body>', { url: 'http://localhost/' });
const w = dom.window;
const toasts = [];
const lsMap = new Map();
const PROFILE = { prefix: 'นาย', firstName: 'ทดสอบ', lastName: 'ตัวอย่าง', position: 'ครู', school: 'โรงเรียนตัวอย่างวิทยา' };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mkCtx = (extra = {}) => ({
  window: w, document: w.document, console, setTimeout, clearTimeout, setInterval, clearInterval, Promise, URL, JSON, Date, Math, Object, Array, Set, Map, String, Number, Error, RegExp, encodeURIComponent,
  navigator: { onLine: true }, location: { hostname: 'x' },
  AppState: { user: { uid: 'u1' }, teacherProfile: PROFILE },
  firebase: { firestore: { FieldValue: { serverTimestamp: () => 'TS' } } },
  localStorage: { getItem: k => (lsMap.has(k) ? lsMap.get(k) : null), setItem: (k, v) => { lsMap.set(k, String(v)); }, removeItem: k => { lsMap.delete(k); } },
  escapeHtml: esc, showLoading() {}, showToast: (m, k) => toasts.push([m, k || '']),
  confirm: () => true, requestAnimationFrame: f => setTimeout(f, 0), getComputedStyle: w.getComputedStyle.bind(w), Event: w.Event, HTMLElement: w.HTMLElement, AbortController: w.AbortController,
  courseBaseRef: c => ref('users/u1/' + (c.isTemplate ? 'courseTemplates' : 'courses') + '/' + c.id),
  ...extra,
});

// ---- บริบทหลัก: โหลดแกน AI + ฟอร์ม + ตัวต่อจริง ----
const modalRoot = () => w.document.getElementById('modal-root');
const ctx = mkCtx({
  LAZY_BUNDLES: { cdescAi: ['doc-system', 'doc-shell', 'course-desc', 'badwork-ai-config', 'badwork-ai', 'course-desc-ai'] },
  loadModule: async () => {}, loadModules: async () => {},
  openModal: html => { modalRoot().innerHTML = `<div id="modal-backdrop"><div class="modal">${html}</div></div>`; },
  closeModal: () => { modalRoot().innerHTML = ''; },
});
vm.createContext(ctx);
for (const f of ['js/doc-system.js', 'js/doc-shell.js', 'js/badwork-ai-config.js', 'js/badwork-ai.js', 'js/course-desc.js', 'js/course-desc-ai.js']) vm.runInContext(read(f), ctx, { filename: f });
const R = code => vm.runInContext(code, ctx);
const J = JSON.stringify;
const settle = () => new Promise(r => setTimeout(r, 30));
let fail = 0;
const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗', m); if (!c) fail++; };
const d = w.document;
const $ = id => d.getElementById(id);

// Gemini จำลอง: เก็บทุกคำขอ แล้วตอบด้วย reply
const calls = [];
let reply = {};
ctx.fetch = async (url, opt) => { calls.push({ url, body: JSON.parse(opt.body) }); return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] }) }; };
const prompt = () => calls[calls.length - 1].body.contents[0].parts[0].text;
const system = () => calls[calls.length - 1].body.systemInstruction.parts[0].text;
const gen = async (key, mode = 'write') => { reply = { [key]: 'x' }; R(`badworkAiBatch(cdAiSpecs(cdAiSys()).filter(s => s.key === ${J(key)}), ${J(mode)}, {}, cdAiSys())`); await settle(); return prompt(); };
const resolve = (act, field) => R(`docAi(cdAiSys()).resolve(cdAiSys(), ${J(act)}, { dataset: { field: ${J(field || '')} } })`);
const open = async (c) => { $('host').innerHTML = ''; await R(`renderCourseDescTab(document.getElementById('host'), ${J(c)})`); await settle(); };

(async () => {
  const course = { id: 't1', isTemplate: true, code: 'ท21102', name: 'ภาษาไทย 2', level: 'ม.1', credit: '1.5' };
  await open(course);
  const form = $('cd-form');

  // ---------------- โครงฟอร์ม + ปุ่ม ----------------
  ok(!!form && form.firstElementChild.classList.contains('doc-ai-top') && d.querySelectorAll('.doc-ai-top').length === 1, 'การ์ดผู้ช่วย AI อยู่หัวฟอร์ม (เหมือนหน้าอื่น) และมีใบเดียว');
  ok(form.children[1].classList.contains('doc-form-header') && !!form.querySelector('.pa-form-footer #cd-save-btn'), 'ฟอร์มเดิมครบตามเดิม: แถบบนฟอร์ม · ปุ่มบันทึกท้ายฟอร์ม');
  ok(d.querySelector('.doc-ai-top [data-doc-ai="all"]').textContent.includes('ร่างช่องที่ว่างของส่วนที่ 2'), 'ป้ายปุ่มบนสุด');
  const rowsOf = id => $(id).closest('.field').querySelector('.doc-item-h').querySelectorAll('.doc-ai-row [data-doc-ai]');
  ok(['cd-descMain', 'cd-descPurpose'].every(id => rowsOf(id).length === 3 && [...rowsOf(id)].map(b => b.dataset.docAi).join() === 'write,polish,shorten'), 'ช่องคำอธิบาย + จุดประสงค์: แถวปุ่ม 3 ปุ่ม (เขียน/ปรับสำนวน/ย่อ) อยู่ใน .doc-item-h ขวามือของชื่อช่อง');
  ok(d.querySelectorAll('.doc-ai-row').length === 2, 'มีแถวปุ่มแค่ 2 ช่อง — ไม่ติดที่มาตรฐาน/ตัวชี้วัด/รหัส/ชื่อวิชา (ข้อมูลทางการจากหลักสูตร ไม่ให้ AI สร้าง)');
  ok(!d.querySelector('#cd-ind-rows .doc-ai-row, #cd-std-rows .doc-ai-row') && !d.querySelector('.cd-grid .doc-ai-row'), 'ไม่มีปุ่ม AI ในแถวตัวชี้วัดและช่องชื่อ/รหัสวิชา');
  ok(['topics', 'skills', 'traits'].every(k => $('cd-ctx-' + k)) && !d.querySelector('[id^="pa-ctx-"],[id^="idp-ctx-"],[id^="sar-ctx-"],[id^="tra-ctx-"],[id^="car-ctx-"]'), 'การ์ดบริบทมีช่อง cd-ctx-* 3 ช่อง · ไม่มีช่องบริบทของระบบอื่นปนมา');
  ok(form.querySelectorAll('.doc-sec-title').length === 5 && form.querySelectorAll('[style]').length === 0, 'ส่วนของฟอร์มเดิม 4 + การ์ด AI 1 · ไม่มี inline style');
  ok($('cd-codeTh').value === 'ท21102' && $('cd-nameTh').value === 'ภาษาไทย 2', 'ติด AI แล้ว ค่าเริ่มต้นจากข้อมูลวิชายังถูกเติมเหมือนเดิม');

  // ---------------- ปุ่มทำอะไร ----------------
  let r = resolve('all');
  ok(r.mode === 'write' && r.specs.map(s => s.key).join() === 'descMain,descPurpose', 'ปุ่มบนสุด (ช่องว่างทั้งสอง): ร่าง 2 ช่อง');
  ok(resolve('write', 'descMain').specs.length === 1 && resolve('polish', 'descMain').toast && resolve('shorten', 'descMain').toast, 'ช่องว่าง: เขียนได้ · ปรับสำนวน/ย่อ = แจ้งว่าไม่มีข้อความ');
  $('cd-descMain').value = 'ศึกษาหลักการอ่านออกเสียง';
  $('cd-descMain').dispatchEvent(new w.Event('input', { bubbles: true }));
  r = resolve('all');
  ok(r.specs.length === 1 && r.specs[0].key === 'descPurpose', 'ปุ่มบนสุดข้ามช่องที่มีข้อความแล้ว (ไม่เขียนทับ): เหลือ 1 ช่อง');
  ok(resolve('write', 'descMain').toast && resolve('polish', 'descMain').specs[0].key === 'descMain' && resolve('shorten', 'descMain').mode === 'shorten', 'ช่องมีข้อความ: เขียนซ้ำ = แจ้ง · ปรับสำนวน/ย่อ ทำได้');
  ok(resolve('xyz') === null && resolve('write', 'nameEn') === null, 'act ที่ไม่รู้จัก / ช่องที่ไม่มีใน AI ไม่ทำอะไร');
  $('cd-descPurpose').value = 'เพื่ออ่านได้ถูกต้อง';
  ok(!!resolve('all').toast, 'ทั้งสองช่องมีข้อความ: ปุ่มบนสุดแจ้งแทนการยิง AI');
  $('cd-descMain').value = ''; $('cd-descPurpose').value = '';

  // ---------------- พร้อต์ ----------------
  $('cd-semester').value = '2';
  $('cd-std-paste-text').value = 'ท 1.1 : เข้าใจการอ่านเพื่อสร้างความรู้';
  $('cd-std-paste-add').click();
  $('cd-paste-text').value = 'ท 1.1 ม.1/1 : อ่านออกเสียงบทร้อยแก้วและบทร้อยกรองได้ถูกต้อง\nท 1.1 ม.1/2 : จับใจความสำคัญจากเรื่องที่อ่าน';
  $('cd-paste-add').click();
  $('cd-nameTh').value = 'ภาษาไทย 2 (วรรณคดีวิจักษ์)'; // ยังไม่ได้บันทึก — AI ต้องเห็นค่านี้
  $('cd-ctx-topics').value = 'วรรณคดีไทย · การอ่านวิเคราะห์';
  $('cd-ctx-skills').value = 'การคิดอย่างมีวิจารณญาณ';
  $('cd-ctx-traits').value = 'ใฝ่เรียนรู้ · มีวินัย';
  let p = await gen('descMain');
  ok(p.includes('วิชา: ท21102 ภาษาไทย 2 (วรรณคดีวิจักษ์)'), 'พร้อต์ใช้ค่าที่พิมพ์อยู่ในฟอร์มโดยไม่ต้องบันทึกก่อน (ชื่อวิชาที่เพิ่งแก้)');
  ok(p.includes('ระดับชั้น: ม.1 · ภาคเรียนที่ 2 · 1.5 หน่วยกิต · รายวิชาพื้นฐาน'), 'พร้อต์ส่ง ระดับชั้น · ภาคเรียน · หน่วยกิต · ประเภทวิชา');
  ok(p.includes('ตัวชี้วัด (2 ข้อ):') && p.includes('- ท 1.1 ม.1/1: อ่านออกเสียงบทร้อยแก้ว') && p.includes('- ท 1.1 ม.1/2: จับใจความสำคัญ'), 'พร้อต์ส่งตัวชี้วัดที่ครูวางไว้ (รหัส: ข้อความ)');
  ok(p.includes('มาตรฐานการเรียนรู้ (1 มาตรฐาน):\n- ท 1.1: เข้าใจการอ่านเพื่อสร้างความรู้') && p.indexOf('มาตรฐานการเรียนรู้ (') < p.indexOf('ตัวชี้วัด ('), 'พร้อต์ส่งมาตรฐานการเรียนรู้ที่ครูวางไว้ ก่อนตัวชี้วัด');
  ok(p.includes('หัวข้อ/หน่วยการเรียนรู้หลักที่สอน: วรรณคดีไทย · การอ่านวิเคราะห์') && p.includes('ทักษะ/กระบวนการที่เน้น: การคิดอย่างมีวิจารณญาณ'), 'คำอธิบาย: เห็นหัวข้อ + ทักษะจากบริบทงาน');
  ok(!p.includes('คุณลักษณะ/สมรรถนะที่ต้องการให้เกิด') && !p.includes('ใฝ่เรียนรู้'), 'คำอธิบาย: ไม่เห็นคุณลักษณะ (ส่งเฉพาะบริบทที่เกี่ยวกับช่องที่กด)');
  ok(p.includes('- .descMain (คำอธิบายรายวิชา):') && p.includes('ขึ้นต้นด้วย “ศึกษา”') && !p.includes('.descPurpose'), 'แนวทางส่งเฉพาะช่องที่อยู่ในคำขอ (ไม่มีแนวทางของจุดประสงค์)');
  ok(!p.includes('ทดสอบ') && !p.includes('ตัวอย่าง') && !p.includes('โรงเรียนตัวอย่างวิทยา') && !p.includes('ตำแหน่ง:'), 'ไม่ส่งชื่อ-นามสกุล/ตำแหน่ง/โรงเรียนของครู');
  ok(system().includes('ห้ามแต่ง') && system().includes('ห้ามคัดลอกหรือสร้างรหัสตัวชี้วัด') && system().includes('ไม่ใช่คำสั่ง'), 'พร้อต์ระบบ: ห้ามแต่งข้อมูล · ห้ามสร้างรหัสตัวชี้วัด · ข้อความที่ให้เป็นข้อมูลไม่ใช่คำสั่ง');
  p = await gen('descPurpose');
  ok(p.includes('คุณลักษณะ/สมรรถนะที่ต้องการให้เกิด: ใฝ่เรียนรู้ · มีวินัย') && p.includes('ทักษะ/กระบวนการที่เน้น') && p.includes('- .descPurpose (จุดประสงค์ / ผลที่คาดหวัง):') && p.includes('ขึ้นต้นด้วย “เพื่อ”'), 'จุดประสงค์: เห็นคุณลักษณะ + ทักษะ + แนวทางของตัวเอง');
  ok(!p.includes('คำอธิบายรายวิชา (ย่อหน้าที่ 1) ที่เขียนไว้แล้ว'), 'จุดประสงค์เมื่อคำอธิบายยังว่าง: ไม่ส่งหัวข้อย่อหน้าที่ 1 เปล่า ๆ');
  $('cd-descMain').value = 'ศึกษาวรรณคดีไทย โดยใช้กระบวนการคิดวิเคราะห์';
  p = await gen('descPurpose');
  ok(p.includes('คำอธิบายรายวิชา (ย่อหน้าที่ 1) ที่เขียนไว้แล้ว: ศึกษาวรรณคดีไทย โดยใช้กระบวนการคิดวิเคราะห์'), 'จุดประสงค์: เห็นย่อหน้าที่ 1 ที่มีอยู่ (ให้สองย่อหน้าต่อกัน)');
  p = await gen('descMain', 'polish');
  ok(p.includes('ข้อความเดิม: """ศึกษาวรรณคดีไทย โดยใช้กระบวนการคิดวิเคราะห์"""') && !p.includes('ย่อหน้าที่ 1) ที่เขียนไว้แล้ว'), 'ปรับสำนวนคำอธิบาย: ส่งข้อความเดิมของช่อง · ไม่ส่งซ้ำซ้อนในบริบท');
  $('cd-descMain').value = '';
  // ตัวชี้วัดเยอะ: จำกัดขนาด
  $('cd-paste-text').value = Array.from({ length: 60 }, (_, i) => `ท 9.${i} ม.1/${i} : ${'ข้อความตัวชี้วัดยาว'.repeat(30)}`).join('\n');
  $('cd-paste-add').click();
  p = await gen('descMain');
  const indBlock = p.slice(p.indexOf('ตัวชี้วัด ('), p.indexOf('หัวข้อ/หน่วยการเรียนรู้'));
  const indLines = indBlock.split('\n').filter(l => l.startsWith('- '));
  ok(/แสดง \d+ ข้อแรก/.test(indBlock) && indLines.length > 0 && indLines.length <= 40 && indBlock.length <= 3700, `ตัวชี้วัดเยอะ: จำกัดแถว/ความยาว (ส่ง ${indLines.length} จาก 60 ข้อ · ${indBlock.length} ตัวอักษร)`);
  ok(indLines.every(l => l.length <= 190), 'ตัวชี้วัดแต่ละข้อถูกตัดความยาวต่อแถว');
  d.querySelectorAll('.cd-ind-row').forEach(x => x.remove());

  // ---------------- หน้าต่างตรวจทาน → ใส่ช่อง → ธงยังไม่บันทึก ----------------
  R('cdDiscardDraft(); _cdDraftId = "t1"'); // ล้างธงค่าค้างจากการพิมพ์ทดสอบด้านบน
  ok(R('cdIsDirty()') === false, 'เริ่มรอบทดสอบการใส่ข้อความ: ไม่มีค่าค้าง');
  reply = { descMain: 'ศึกษา…โดยใช้กระบวนการอ่านวิเคราะห์', descPurpose: 'เพื่อให้ผู้เรียนมี…' };
  const callsBefore = calls.length;
  R(`badworkAiRunFields(document.querySelector('.doc-ai-top [data-doc-ai="all"]'), docAi(cdAiSys()).resolve(cdAiSys(), 'all').specs, 'write', cdAiSys())`);
  await settle();
  ok(calls.length === callsBefore + 1 && modalRoot().querySelectorAll('.doc-ai-item').length === 2, 'ปุ่มบนสุด: ยิง AI 1 คำขอ แล้วขึ้นหน้าต่างตรวจทาน 2 ช่อง');
  ok($('cd-descMain').value === '' && R('cdIsDirty()') === false, 'ก่อนกด “ใช้ที่เลือก”: ยังไม่เขียนลงฟอร์ม · ยังไม่ตั้งธงค่าค้าง');
  ok(/…/.test(modalRoot().textContent) && modalRoot().textContent.includes('ครูต้องเติมเอง'), 'หน้าต่างตรวจทาน: มีหมายเหตุเรื่อง “…”');
  modalRoot().querySelector('[data-x="apply"]').click();
  await settle();
  ok($('cd-descMain').value === 'ศึกษา…โดยใช้กระบวนการอ่านวิเคราะห์' && $('cd-descPurpose').value === 'เพื่อให้ผู้เรียนมี…', 'กด “ใช้ที่เลือก”: ข้อความลงช่องที่ถูกต้อง');
  ok(R('cdIsDirty()') === true, 'ข้อความจาก AI ทำให้ตั้งธง “ยังไม่บันทึก” (ต้องกดบันทึกเอง · ไม่บันทึกให้)');
  ok(!store.has(TPL('t1')) || !store.get(TPL('t1')).descMain, 'AI ไม่บันทึกคำอธิบายลง Firestore เอง');
  ok(toasts.some(t => /มี “…” ที่ต้องกรอกเอง/.test(t[0])), 'แจ้งเตือนว่ามี “…” ที่ต้องกรอกเอง');

  // ---------------- บริบท aiCtx: บันทึกอัตโนมัติ · ไม่ทำให้ค่าเริ่มต้นหาย · ไม่ตั้งธง ----------------
  R('cdDiscardDraft(); _cdDraftId = "t1"');
  $('cd-descMain').value = ''; $('cd-descPurpose').value = '';
  $('cd-ctx-topics').value = 'วรรณคดีไทย · การอ่านวิเคราะห์';
  $('cd-ctx-topics').dispatchEvent(new w.Event('input', { bubbles: true }));
  const ms = d.querySelector('#doc-ai-model'); ms.dispatchEvent(new w.Event('change', { bubbles: true }));
  ok(R('cdIsDirty()') === false, 'พิมพ์บริบท / เปลี่ยนรุ่น AI: ไม่ตั้งธง “ยังไม่บันทึก” (บริบทบันทึกอัตโนมัติ)');
  $('cd-nameEn').value = 'x'; $('cd-nameEn').dispatchEvent(new w.Event('input', { bubbles: true }));
  ok(R('cdIsDirty()') === true, 'พิมพ์ในช่องของฟอร์มจริง: ยังตั้งธงตามเดิม');
  R('cdDiscardDraft(); _cdDraftId = "t1"'); $('cd-nameEn').value = '';
  ok(!store.has(TPL('t1')), 'ยังไม่เคยบันทึกฟอร์ม: ยังไม่มีเอกสาร settings/description');
  setLog.length = 0;
  R('badworkAiCtxSave(null, cdAiSys())'); await settle();
  const doc1 = store.get(TPL('t1'));
  ok(doc1 && doc1.aiCtx && doc1.aiCtx.topics === 'วรรณคดีไทย · การอ่านวิเคราะห์', 'บริบทบันทึกอัตโนมัติลง settings/description.aiCtx แม้ยังไม่เคยบันทึกฟอร์ม (เอกสารยังไม่มี → สร้างด้วย merge)');
  ok(Object.keys(doc1).join() === 'aiCtx' && setLog.length === 1 && setLog[0].merge === true, 'เขียนเฉพาะ aiCtx ด้วย set(merge) — ไม่แตะช่องอื่น/เวลาแก้ไข');
  ok(R('CD_STATE.doc.aiCtx.topics') === 'วรรณคดีไทย · การอ่านวิเคราะห์', 'บริบทเข้า CD_STATE.doc.aiCtx ด้วย');
  await open(course); // เปิดแท็บใหม่ (ไม่มีร่าง) → โหลดเอกสารที่มีแต่ aiCtx
  ok($('cd-nameTh').value === 'ภาษาไทย 2' && $('cd-codeTh').value === 'ท21102' && $('cd-level').value === 'ม.1' && $('cd-credit').value === '1.5', 'เอกสารที่มีแต่ aiCtx ยังนับว่าไม่เคยบันทึก: ค่าเริ่มต้นจากวิชายังถูกเติม (ไม่ถูกแทนด้วยช่องว่าง)');
  ok($('cd-ctx-topics').value === 'วรรณคดีไทย · การอ่านวิเคราะห์' && $('cd-ctx-skills').value === 'การคิดอย่างมีวิจารณญาณ' && $('cd-ctx-traits').value === 'ใฝ่เรียนรู้ · มีวินัย', 'เปิดใหม่: บริบททั้ง 3 ช่องที่บันทึกอัตโนมัติกลับมา');
  ok(d.querySelector('.doc-ai-ctx').open === false && /กรอกแล้ว 3\/3/.test(d.querySelector('[data-ctx-count]').textContent), 'การ์ดบริบทพับเมื่อกรอกแล้ว · นับ 3/3');

  // ---------------- บันทึกฟอร์ม: บริบทไม่หาย ----------------
  $('cd-descMain').value = 'ศึกษาวรรณคดีไทย';
  $('cd-ctx-skills').value = 'การคิดวิเคราะห์';
  $('cd-ctx-skills').dispatchEvent(new w.Event('input', { bubbles: true }));
  $('cd-save-btn').click(); await settle();
  R('clearTimeout(badworkAiCtxTimer)'); // ตัวหน่วงบันทึกบริบทอัตโนมัติ (700 ms) ที่ค้างจากการพิมพ์ข้างบน — ไม่ให้ยิงตอนขั้นทดสอบถัดไป
  const doc2 = store.get(TPL('t1'));
  ok(doc2 && doc2.descMain === 'ศึกษาวรรณคดีไทย' && doc2.nameTh === 'ภาษาไทย 2' && doc2.updatedAt === 'TS', 'บันทึกฟอร์มตามเดิม (เนื้อหา · ค่าจากวิชา · เวลาแก้ไข)');
  ok(doc2.aiCtx && doc2.aiCtx.topics === 'วรรณคดีไทย · การอ่านวิเคราะห์' && doc2.aiCtx.skills === 'การคิดวิเคราะห์', 'บันทึกฟอร์มด้วย set() ทับทั้งเอกสาร แต่ aiCtx ไม่หาย (รวมที่เพิ่งพิมพ์ยังไม่ทันบันทึกอัตโนมัติ)');
  ok(R('cdIsDirty()') === false, 'บันทึกสำเร็จ: ล้างธงค่าค้าง');
  // ไม่ได้ติด AI (เช่น โหลดไม่สำเร็จ) แล้วบันทึก: คงบริบทที่โหลดมา
  d.querySelector('.doc-ai-top').remove();
  ok(R('cdCollect(document.getElementById("cd-form"))').aiCtx.topics === 'วรรณคดีไทย · การอ่านวิเคราะห์' && R('cdAiCtxNow()') === null, 'ไม่มีการ์ด AI บนหน้า: cdCollect คงบริบทที่โหลดมา (บันทึกแล้วบริบทไม่ถูกล้าง)');

  // ---------------- ไม่ดึงบริบทของวิชาอื่นมาเติม ----------------
  ok(lsMap.has('cd-ai-ctx-v1'), 'แกนสำรองบริบทล่าสุดในเครื่องตามเดิม (ชื่อคีย์ cd-ai-ctx-v1)');
  await open({ id: 't2', isTemplate: true, code: 'ค21101', name: 'คณิตศาสตร์ 1', level: 'ม.1', credit: '1' });
  ok($('cd-ctx-topics').value === '' && $('cd-ctx-skills').value === '' && $('cd-ctx-traits').value === '', 'เปิดวิชาอื่น: บริบทว่าง (ไม่หยิบบริบทของวิชาก่อนหน้ามาเติม แม้มีสำรองในเครื่อง)');
  ok(d.querySelector('.doc-ai-ctx').open === true, 'ยังไม่มีบริบท: การ์ดเปิดค้างให้กรอก');
  $('cd-ctx-topics').value = 'จำนวนและพีชคณิต';
  R('badworkAiCtxSave(null, cdAiSys())'); await settle();
  ok(store.get(TPL('t2')).aiCtx.topics === 'จำนวนและพีชคณิต' && store.get(TPL('t1')).aiCtx.topics === 'วรรณคดีไทย · การอ่านวิเคราะห์', 'บริบทเขียนที่เอกสารของวิชาที่เปิดอยู่เท่านั้น (ไม่ปนข้ามวิชา)');
  p = await gen('descMain');
  ok(p.includes('วิชา: ค21101 คณิตศาสตร์ 1') && p.includes('จำนวนและพีชคณิต') && !p.includes('วรรณคดี'), 'พร้อต์ของวิชาที่สอง: ไม่มีเนื้อหาของวิชาแรกหลุดมา');

  // ---------------- ร่างข้ามแท็บคงบริบท ----------------
  await open(course);
  $('cd-descMain').value = 'ร่างที่ยังไม่บันทึก';
  $('cd-descMain').dispatchEvent(new w.Event('input', { bubbles: true }));
  $('cd-ctx-traits').value = 'ใฝ่เรียนรู้';
  R('cdStashDraft()');
  ok(R('_cdDraft.aiCtx.traits') === 'ใฝ่เรียนรู้', 'เก็บร่างก่อนออกจากแท็บ: บริบทที่พิมพ์ค้างอยู่ในร่างด้วย');
  const pv = d.createElement('div'); d.body.appendChild(pv);
  await R('renderCourseDescPreviewTab')(pv, course, () => {}); await settle();
  ok(!!pv.querySelector('.doc-preview-frame') && !pv.querySelector('.doc-ai-top, .doc-ai-row'), 'แท็บตัวอย่างก่อนพิมพ์: ไม่มีปุ่ม/การ์ด AI');
  await open(course);
  ok($('cd-descMain').value === 'ร่างที่ยังไม่บันทึก' && $('cd-ctx-traits').value === 'ใฝ่เรียนรู้' && d.querySelectorAll('.doc-ai-top').length === 1 && d.querySelectorAll('.doc-ai-row').length === 2, 'กลับมาแท็บฟอร์ม: ค่าที่พิมพ์ค้าง + บริบทอยู่ครบ · ติดปุ่ม AI ครั้งเดียว ไม่ซ้ำ');
  R('cdDiscardDraft()');

  // ---------------- cdNormalize: aiCtx ----------------
  const nz = R(`cdNormalize({ aiCtx: { topics: 'x'.repeat(900), 'bad key': 'a', '9x': 'b', ok1: 5 } }, null).aiCtx`);
  ok(nz.topics.length === R('CD_MAX.ctx') && !('bad key' in nz) && !('9x' in nz) && nz.ok1 === '5', 'cdNormalize: aiCtx ตัดความยาว · ทิ้งชื่อคีย์ผิดรูปแบบ · แปลงเป็นสตริง');
  ok(Object.keys(R(`cdNormalize({ aiCtx: Object.fromEntries(Array.from({ length: 40 }, (_, i) => ['k' + i, 'v'])) }, null).aiCtx`)).length === R('CD_MAX.ctxKeys') && Object.keys(R(`cdNormalize({ aiCtx: ['a'] }, null).aiCtx`)).length === 0 && Object.keys(R('cdNormalize({}, null).aiCtx')).length === 0, 'cdNormalize: จำกัดจำนวนคีย์ · อาร์เรย์/ค่าว่าง → แมปว่าง (เอกสารเก่าไม่มี aiCtx ก็ใช้ได้)');

  // ---------------- หน้าภาพรวมวิชาไม่ถือว่าเอกสารที่มีแต่ aiCtx คือ "มีคำอธิบาย" ----------------
  const cstore = new Map([['users/u1/courseTemplates/t9/settings/description', { aiCtx: { topics: 'x' } }]]);
  const cref = p => ({ collection: n => ({ doc: id => cref(p + '/' + n + '/' + id) }), get: async () => ({ exists: cstore.has(p), data: () => cstore.get(p) }) });
  const cctx = { db: { collection: n => ({ doc: id => cref(n + '/' + id) }) }, AppState: { user: { uid: 'u1' } }, console: { warn() {}, log() {}, error() {} }, escapeHtml: esc, showToast() {}, firebase: ctx.firebase };
  vm.createContext(cctx);
  vm.runInContext(read('js/courses.js').replace(/^const /gm, 'var '), cctx, { filename: 'js/courses.js' });
  ok(await vm.runInContext(`loadCourseDescription({ id: 'c1', templateId: 't9' })`, cctx) === null, 'หน้าภาพรวมวิชา: เอกสารที่มีแต่บริบท AI = ยังไม่มีคำอธิบาย (แสดงปุ่มกรอก ไม่ใช่การ์ดว่าง)');

  // ---------------- โหลด AI ล้มเหลว = ฟอร์มใช้ได้ตามเดิม ----------------
  const warns = [];
  const ctx2 = mkCtx({ LAZY_BUNDLES: { cdescAi: ['x'] }, loadModule: async () => {}, loadModules: async () => { throw new Error('offline'); }, console: { ...console, warn: (...a) => warns.push(a.join(' ')) } });
  vm.createContext(ctx2);
  for (const f of ['js/doc-shell.js', 'js/course-desc.js']) vm.runInContext(read(f), ctx2, { filename: f });
  $('host').innerHTML = '';
  await vm.runInContext(`renderCourseDescTab(document.getElementById('host'), ${J(course)})`, ctx2); await settle();
  ok(!!$('cd-form') && !d.querySelector('.doc-ai-top, .doc-ai-row') && warns.some(x => /ผู้ช่วย AI/.test(x)), 'โหลดชุด AI ไม่สำเร็จ: ฟอร์มยังวาดและใช้ได้ (ไม่มีปุ่ม AI · มี warn ใน console ไม่ขึ้นข้อความรบกวน)');
  ok(vm.runInContext('cdCollect(document.getElementById("cd-form"))', ctx2).aiCtx !== undefined && vm.runInContext('typeof cdAiSys', ctx2) === 'undefined', 'ไม่มีตัวต่อ AI: cdCollect ยังทำงาน · ไม่มีฟังก์ชัน AI หลุดมาในบริบทนี้');

  // ---------------- ลงทะเบียนไฟล์ + ความไม่ชนกัน ----------------
  const U = read('js/utils.js'), SW = read('sw.js'), src = read('js/course-desc-ai.js');
  ok(/'course-desc-ai':\s*'js\/course-desc-ai\.js'/.test(U), 'utils.js: LAZY_MODULES มี course-desc-ai');
  const order = ((U.match(/cdescAi:\s*\[([^\]]*)\]/) || [])[1] || '').split(',').map(x => x.replace(/['\s]/g, '')).filter(Boolean);
  const at = n => order.indexOf(n);
  ok(at('course-desc-ai') === order.length - 1 && at('course-desc-ai') > at('course-desc') && at('course-desc-ai') > at('badwork-ai') && at('badwork-ai') > at('badwork-ai-config') && at('course-desc') > at('doc-shell'), 'LAZY_BUNDLES.cdescAi: doc-shell → course-desc → badwork-ai-config → badwork-ai → course-desc-ai (ตัวต่อโหลดท้ายสุด)');
  ok(!/cdesc:\s*\[[^\]]*(badwork-ai|course-desc-ai)/.test(U), 'LAZY_BUNDLES.cdesc (ที่หน้าภาพรวมวิชาโหลดเพื่อพิมพ์) ไม่แบกโค้ด AI');
  ok(SW.includes("'js/course-desc-ai.js'"), 'sw.js PRECACHE มี js/course-desc-ai.js');
  ok(/LAZY_BUNDLES\.cdescAi/.test(read('js/course-desc.js')) && /typeof badworkAiMount === 'function' && typeof cdAiSys === 'function'/.test(read('js/course-desc.js')), 'course-desc.js: โหลดบันเดิล AI เฉพาะที่แท็บฟอร์ม และเช็ก typeof ก่อนติด (ไม่มี AI ก็ทำงาน)');
  const prefixes = [], keys = [];
  fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).forEach(f => {
    const s = read('js/' + f);
    [...s.matchAll(/idPrefix:\s*'([^']+)'/g)].forEach(m => prefixes.push(m[1]));
    [...s.matchAll(/storageKeys:\s*\{\s*ctx:\s*'([^']+)'/g)].forEach(m => keys.push(m[1]));
  });
  ok(prefixes.includes('cd-ctx-') && new Set(prefixes).size === prefixes.length && keys.includes('cd-ai-ctx-v1') && new Set(keys).size === keys.length, `คีย์ AI ไม่ซ้ำระบบอื่น: idPrefix ${prefixes.length} ชุด · คีย์สำรองบริบท ${keys.length} ชุด`);
  ok(R(`Object.keys(DOC_AI).join()`) === 'cdesc' && R(`docAiFind(cdAiSys()) === DOC_AI.cdesc`), 'ตัวต่อลงทะเบียนเป็น id cdesc และแกนหาเจอจากระบบจำลองของฟอร์ม');
  ok(R(`Object.values(CD_AI_CONFIG.aiCtx.maxLen).every(n => n <= CD_MAX.ctx)`), 'ความยาวสูงสุดของช่องบริบทไม่เกินที่ cdCleanCtx เก็บ (CD_MAX.ctx)');
  ok(!/<style|createElement\(['"]style|insertRule|\.style\.|style="/.test(src), 'ไม่เขียน CSS ใน JS (ไม่มี <style> · el.style · style="…")');
  ok(!/pa-ai-|PA_CONFIG|PAState|docSystem\(/.test(src), 'ตัวต่อไม่อ้างชื่อ/คีย์ของระบบอื่น และไม่เรียก docSystem()');
  const rules = read('firestore.rules');
  ok(/match \/courseTemplates\/\{templateId\}[\s\S]*?match \/\{document=\*\*\}[\s\S]*?validDoc\(100\)/.test(rules) && /match \/courses\/\{courseId\}[\s\S]*?match \/\{document=\*\*\}[\s\S]*?validDoc\(100\)/.test(rules), 'firestore.rules: เอกสารใต้ courseTemplates/courses (รวม settings/description + aiCtx) เขียนได้อยู่แล้ว ไม่ต้องแก้ rules');

  console.log(fail ? `\nFAIL ${fail}` : '\nALL PASS');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
