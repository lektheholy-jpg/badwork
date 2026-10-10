// ทดสอบกลุ่มหน้า Personal Agreement (js/doc-system.js + pa-config.js + pa.js + badwork-ai.js + pa-report.js + pa-rpt.js) ด้วย jsdom
// วิธีรัน: node tests/pa-config.test.js   (หรือ npm run test:pa)
//
// ทำอะไร
//   1) ตรวจโครง PA_CONFIG: ชื่อ collection ตรงกับ firestore.rules · แท็บไม่ซ้ำ · ตาราง scope ของ AI ครบทุกข้อ · ฯลฯ
//   2) โหลดกลุ่ม PA ตามลำดับ LAZY_BUNDLES.pa จริง แล้วรันจุดตรวจ (probe) ~20 จุด: เรนเดอร์ฟอร์ม/รายการ/ตัวอย่างพิมพ์/แท็บ ·
//      พร้อต์ที่ส่งให้ AI · path ที่ยิง Firestore · key ที่เขียน localStorage — แล้วเทียบ SHA-1 ของผลลัพธ์กับ tests/pa-golden.json
//   3) ระบบเอกสารหลายระบบ (js/doc-system.js): ลงทะเบียนระบบที่สองที่ชื่อ collection ต่างกัน แล้วตรวจว่า state ไม่ปนกัน ·
//      collection อ่านจาก config ของระบบที่ถืออยู่ · งานที่ค้างระหว่างสลับระบบเขียนลง state ของระบบที่เริ่มงานเท่านั้น
//   golden สร้างจากโค้ดก่อนรีแฟกเตอร์ (ก่อนมี PA_CONFIG) → ผ่าน = พฤติกรรมของ PA เหมือนเดิมทุกตัวอักษร
//   ใช้เป็นตาข่ายนิรภัยตอนรีแฟกเตอร์ขั้นต่อไป (แยก state / ย้ายไฟล์ core) — ถ้าเปลี่ยนพฤติกรรมตั้งใจ ให้รันใหม่ด้วย PA_UPDATE=1
//
//   PA_UPDATE=1        เขียน tests/pa-golden.json ใหม่จากโค้ดปัจจุบัน
//   PA_ROOT=<โฟลเดอร์>  อ่านโค้ดจากที่อื่น (เช่น สำเนาก่อนรีแฟกเตอร์) แทนโปรเจกต์นี้
//   PA_DUMP=<โฟลเดอร์>  เขียนผลลัพธ์เต็มของทุกจุดตรวจเป็นไฟล์ (ไว้ diff เมื่อจุดไหนไม่ตรง)
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const crypto = require('crypto');
const { JSDOM } = require('jsdom');

const ROOT = process.env.PA_ROOT ? path.resolve(process.env.PA_ROOT) : path.join(__dirname, '..');
const GOLDEN = path.join(__dirname, 'pa-golden.json');
const sha = s => crypto.createHash('sha1').update(String(s)).digest('hex');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg, extra !== undefined ? String(extra).slice(0, 300) : ''); } };

// ------------------------------------------------------------------
// ลำดับไฟล์ของกลุ่ม PA — อ่านจาก js/utils.js (ตัวเดียวกับที่แอปใช้โหลดจริง)
// ------------------------------------------------------------------
function bundleFiles() {
  const utils = read('js/utils.js');
  const mods = {};
  for (const m of (utils.match(/const LAZY_MODULES = \{([\s\S]*?)\};/) || [])[1].matchAll(/['"]?([\w-]+)['"]?:\s*'([^']+)'/g)) mods[m[1]] = m[2];
  const names = [...(utils.match(/LAZY_BUNDLES = \{\s*pa:\s*\[([^\]]+)\]/) || [])[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  return names.map(n => mods[n]);
}

// ------------------------------------------------------------------
// ข้อมูลตัวอย่าง
// ------------------------------------------------------------------
const OWNER = { name: 'นายทดสอบ ตัวอย่าง', position: 'ครู', standing: 'ชำนาญการ', pay: 'ค.ศ. 2 อัตราเงินเดือน 30,000 บาท', school: 'โรงเรียนตัวอย่างวิทยา', affiliation: 'สพม. นครราชสีมา', director: 'นายผู้อำนวยการ ใจดี', subjectGroup: 'คณิตศาสตร์' };
const PROFILE = { prefix: 'นาย', firstName: 'ทดสอบ', lastName: 'ตัวอย่าง', position: 'ครู', academicStanding: 'ชำนาญการ', ksLevel: 'ค.ศ. 2', salary: 30000, school: OWNER.school, affiliation: OWNER.affiliation, director: OWNER.director, subjectGroup: OWNER.subjectGroup };
const PA_DOC = {
  fiscalYear: '2569', status: 'draft', classroomTypes: { basic: true, special: true },
  load: { group: 'คณิตศาสตร์', subjects: [{ name: 'ค21101 คณิตศาสตร์', hours: 3 }, { name: 'ค22101 คณิตศาสตร์', hours: 3.5 }], activities: [{ name: 'ชุมนุม', hours: 1 }], support: [{ name: 'หัวหน้างานวัดผล', hours: 2 }], quality: [{ name: 'งานประกัน', hours: 1 }], policy: [{ name: 'อ่านออกเขียนได้', hours: 1 }] },
  workItems: { '1.1': { s1: 'พัฒนาหลักสูตรสถานศึกษา', s2: 'ปรับปรุงหลักสูตร', outcome: 'ผู้เรียนมีทักษะ', indicator: 'ร้อยละ 80' }, '2.3': { s1: 'งานวิชาการ', s2: '', outcome: 'งานเรียบร้อย', indicator: '' }, '3.3': { s1: 'นำความรู้ไปใช้', s2: 'ต่อยอด', outcome: 'ดีขึ้น', indicator: 'ร้อยละ 90' } },
  challengeTitle: 'การพัฒนาทักษะการอ่านโจทย์ปัญหาคณิตศาสตร์', problem: 'นักเรียนอ่านโจทย์ไม่คล่อง', method: '1. ศึกษา\n2. ออกแบบ\n3. ดำเนินการ', outcomeQuant: 'ร้อยละ … ผ่านเกณฑ์', outcomeQual: 'นักเรียนมั่นใจขึ้น', signDate: '2025-10-01',
  aiCtx: { level: 'ม.2', rooms: '4', students: '148', problems: 'อ่านโจทย์ไม่คล่อง', prev: 'ผ่านเกณฑ์ ร้อยละ 62', focus: 'อ่านออกเขียนได้' },
};
const PA_LEGACY = { year: '2567', semester: '1', classroomBasic: true, workload: '18 คาบ', outcome: 'ดี', tasks: [{ name: 'งาน ก', goal: 'เป้า', indicator: 'ตัวชี้วัด', method: 'วิธี', timeline: 'ต.ค.' }], selfDev: 'อบรม' };
const RPT_DOC = {
  fiscalYear: '2569', status: 'submitted', selfScore: '95', teachHours: '18', leave: { sickTimes: '2', sickDays: '3', bizTimes: '1', bizDays: '1' },
  items: { '1.1': { text: 'ทำหลักสูตร', ref: 'เอกสาร 1' }, '1.3': { text: 'จัดการเรียนรู้', ref: '' }, '3.3': { text: 'นำไปใช้', ref: 'เอกสาร 9' } },
  challengeTitle: 'การพัฒนาทักษะ', problem: 'ปัญหา', method: 'วิธี', outcomeQuant: 'ปริมาณ', outcomeQual: 'คุณภาพ', assigned: 'งานที่ได้รับมอบหมาย', signDate: '2026-09-30', agreementId: 'a1', owner: OWNER,
};

// ------------------------------------------------------------------
// สภาพแวดล้อมจำลอง (DOM + Firestore + ฟังก์ชันของแอปที่ไฟล์ PA เรียกใช้)
// ------------------------------------------------------------------
function makeEnv() {
  const dom = new JSDOM('<!doctype html><body><div id="view"></div></body>', { url: 'http://localhost/' });
  const w = dom.window;
  const dblog = [], lslog = [];
  const store = { pa_agreements: [{ id: 'a1', ...PA_DOC, owner: OWNER }, { id: 'a0', ...PA_LEGACY }], pa_reports: [{ id: 'r1', ...RPT_DOC }], records: [] };
  const docSnap = (id, d) => ({ id, exists: true, data: () => d });
  const query = name => {
    const q = {
      where: () => q, orderBy: () => q, limit: () => q,
      get: async () => { dblog.push(`${name}:get`); return { docs: (store[name] || []).map(({ id, ...d }) => docSnap(id, d)) }; },
    };
    return q;
  };
  const col = name => {
    dblog.push(`collection:${name}`);
    return {
      ...query(name),
      doc: id => ({ id, get: async () => { dblog.push(`${name}/${id}:get`); const r = (store[name] || []).find(x => x.id === id); return r ? docSnap(id, { ...r }) : { exists: false, data: () => undefined }; },
        update: async d => { dblog.push(`${name}/${id}:update:${Object.keys(d).sort().join(',')}`); }, set: async () => { dblog.push(`${name}/${id}:set`); }, delete: async () => { dblog.push(`${name}/${id}:delete`); } }),
      add: async d => { dblog.push(`${name}:add:${Object.keys(d).sort().join(',')}`); return { id: 'new1' }; },
    };
  };
  const db = { collection: c => { dblog.push(`root:${c}`); return { doc: u => ({ collection: col }) }; } };
  // localStorage ที่จดการเข้าถึง key (กันเปลี่ยนชื่อ key โดยไม่ตั้งใจ — ผู้ใช้เดิมจะเสียรุ่น AI/บริบท/ความยินยอมที่จำไว้)
  const mem = {};
  const localStorage = { getItem: k => { lslog.push('get:' + k); return k in mem ? mem[k] : null; }, setItem: (k, v) => { lslog.push('set:' + k); mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
  const toasts = [];
  const ctx = {
    window: w, document: w.document, console: { ...console, error() {}, warn() {} }, db, dblog, lslog, localStorage, toasts, store,
    setTimeout, clearTimeout, setInterval, clearInterval, navigator: { onLine: true }, location: { hostname: 'example.com' },
    AppState: { user: { uid: 'u1' }, teacherProfile: PROFILE },
    firebase: { firestore: { FieldValue: { serverTimestamp: () => 'TS' } }, app: () => ({ options: {} }) },
    Promise, JSON, Date, Math, Object, Array, Set, Map, String, Number, Error, RegExp, URL, encodeURIComponent,
    escapeHtml: s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    pageHeaderHtml: t => `<h1 class="page-title">${t}</h1>`, initNavPill() {}, clearLoading() {}, loaderHtml: k => `<div class="loader" data-k="${k}"></div>`, _loadTimers: new Map(),
    showToast: m => toasts.push(m), showLoading() {}, islandSave() {}, islandUndo() {}, formatSalary: n => Number(n).toLocaleString('en-US'),
    openModal: html => { let m = w.document.getElementById('modal'); if (!m) { m = w.document.createElement('div'); m.id = 'modal'; w.document.body.appendChild(m); } m.innerHTML = html; }, closeModal() {},
    confirm: () => true, requestAnimationFrame: f => setTimeout(f, 0),
    // ตารางสอน/โปรไฟล์/records (โหลดแบบ lazy ในแอปจริง)
    loadModule: async () => {}, loadModules: async () => {}, loadTeacherProfile: async () => PROFILE,
    loadTimetable: async () => ({ term: 1 }), ttTermLabel: () => 'ภาคเรียนที่ 1',
    ttStats: () => ({ placed: [{ kind: 'class', code: 'ค21101', title: 'คณิตศาสตร์', span: 3 }, { kind: 'class', code: 'ค21101', title: 'คณิตศาสตร์', span: 2 }, { kind: 'activity', code: '', title: 'ชุมนุม', span: 1 }] }),
    navigate() {}, getComputedStyle: w.getComputedStyle.bind(w), CSS: { escape: s => s }, Event: w.Event, HTMLElement: w.HTMLElement,
  };
  vm.createContext(ctx);
  for (const f of bundleFiles()) vm.runInContext(read(f), ctx, { filename: f });
  return ctx;
}

// ------------------------------------------------------------------
// จุดตรวจระบบเอกสารหลายระบบ (ไม่เข้า golden — เป็นการยืนยันตรงๆ ในฝั่ง node)
//   ฟังก์ชันนี้ถูกส่งเข้าไปรันในสภาพแวดล้อมจำลอง (ใช้ได้เฉพาะตัวแปร global ของแอป ห้ามอ้างตัวแปรของไฟล์นี้)
// ------------------------------------------------------------------
// <SYS_PROBE>
async function sysProbe() {
  const out = {};
  const thrown = f => { try { f(); return null; } catch (e) { return String(e.message); } };
  const pa = docSystem('pa');
  const initial = JSON.stringify([pa.state, pa.rptState]);
  // ระบบที่สอง: โครงเดียวกับ PA แต่ id · ชื่อหัวเรื่อง · ชื่อ collection ต่างกัน
  const cfg2 = Object.assign({}, PA_CONFIG, { id: 'idp', title: 'ระบบที่สอง (ทดสอบ)', collections: { agreements: 'idp_plans', reports: 'idp_reports' } });
  const idp = registerDocSystem(cfg2);
  out.registered = Object.keys(DOC_SYSTEMS).sort();
  out.firstIsActive = docSystem().id;

  // state แยกกัน และเริ่มจากค่าเริ่มต้นเสมอ
  out.distinct = pa.state !== idp.state && pa.rptState !== idp.rptState;
  out.freshDefaults = JSON.stringify([idp.state, idp.rptState]) === initial;
  pa.state.docId = 'x'; pa.state.tab = 'rpt'; pa.rptState.view = 'form';
  out.noLeak = [idp.state.docId, idp.state.tab, idp.rptState.view];
  pa.state.docId = null; pa.state.tab = 'agreement'; pa.rptState.view = 'list';

  // collection อ่านจาก config ของระบบที่กำลังแสดง
  dblog.length = 0; docActivate('idp'); await paLoadList(); await parptLoadList(); const idpLog = dblog.slice();
  dblog.length = 0; docActivate('pa'); await paLoadList(); await parptLoadList(); const paLog = dblog.slice();
  out.routing = { idp: idpLog, pa: paLog };

  // งานที่ค้าง: เริ่มบันทึกตอน PA แสดงอยู่ แล้วสลับไประบบอื่นก่อนบันทึกเสร็จ
  dblog.length = 0; docActivate('pa');
  const pending = paSave({ fiscalYear: '2569' });
  docActivate('idp');
  const newId = await pending;
  out.inflight = { newId, paDocId: pa.state.docId, idpDocId: idp.state.docId, db: dblog.filter(x => /:add:/.test(x)) };
  pa.state.docId = null;

  // หัวเรื่องหน้าอ่านจาก config ของระบบที่กำลังแสดง
  docActivate('idp'); docBuildShell(); const idpShell = document.getElementById('view').innerHTML;
  docActivate('pa'); docBuildShell(); const paShell = document.getElementById('view').innerHTML;
  out.titles = [idpShell.includes(cfg2.title), idpShell.includes(PA_CONFIG.title), paShell.includes(PA_CONFIG.title), paShell.includes(cfg2.title)];

  out.errors = [
    thrown(() => docSystem('nope')),
    thrown(() => docActivate('nope')),
    thrown(() => idp.col('nope', 'u1')),
    thrown(() => registerDocSystem(cfg2)),
    thrown(() => createDocSystem({})),
    thrown(() => createDocSystem({ id: 'x', collections: {}, tabs: [] })),
  ];
  out.activeAfter = docSystem().id;
  return JSON.stringify(out);
}
// </SYS_PROBE>


// ------------------------------------------------------------------
// จุดตรวจแกน AI ร่วม: ระบบจำลองที่สอง (id 'mock') ใช้ js/badwork-ai.js ตัวเดียวกับ PA โดยไม่ปนกัน
//   รันในสภาพแวดล้อมใหม่ (env4) · fetch จำลองอยู่ที่ __pending (ค้างไว้ให้ทดสอบการสลับระบบกลางคัน)
// ------------------------------------------------------------------
// <AI_PROBE>
async function aiProbe() {
  const out = {};
  const settle = () => new Promise(r => setTimeout(r, 20));
  const thrown = f => { try { f(); return null; } catch (e) { return String(e.message); } };
  const view = () => document.getElementById('view');
  const paPrompt = async () => { // พร้อต์ที่ PA ส่ง (ช่องส่วนที่ 2 ที่ว่าง โหมด write) — จับก่อนถึงเครือข่าย
    const pa = docSystem('pa'); docActivate('pa');
    pa.state.tab = 'agreement'; pa.state.view = 'form'; pa.state.docId = 'a1'; pa.state.doc = JSON.parse(JSON.stringify(PA_FIXTURE));
    await renderPAFormView(); await settle();
    const got = []; const real = badworkAiGenerate; badworkAiGenerate = async p => { got.push(p); return {}; };
    await badworkAiBatch(PA_CONFIG.ai.prompts.part2, 'write', {});
    badworkAiGenerate = real; return got.join('\n====\n');
  };
  out.paBefore = await paPrompt();

  // ---- ทะเบียนตัวต่อ ----
  const cfg2 = { id: 'mock', title: 'ระบบจำลอง', collections: { agreements: 'idp_plans', reports: 'idp_reports' }, tabs: [['main', 'หลัก']],
    aiCtx: { fields: { topic: 'หัวข้อ', note: 'หมายเหตุ' }, maxLen: { topic: 30, note: 50 }, idPrefix: 'mock-ctx-' },
    ai: { storageKeys: { ctx: 'mock-ai-ctx-v1' } } };
  const mock = registerDocSystem(cfg2);
  const adapter = {
    systemPrompt: () => 'SYS-MOCK',
    task: (sys, mode) => 'งานของ mock ' + mode,
    context: (sys, known, scope) => 'CTX-MOCK scope=' + (scope ? [...scope].join() : 'all') + ' title=' + (sys.state.doc.title || ''),
    scope: () => new Set(['x', 'y']),
    guide: () => '',
    itemHeading: s => 'หัวข้อ ' + s.item,
    copy: { consent: 'CONSENT-MOCK', saveLabel: 'บันทึกMock', topPoints: ['จุดที่ 1 ของ mock', 'จุดที่ 2 ของ mock'], topWarn: 'WARN-MOCK', topButton: 'ร่างของ mock', ctxTitle: 'บริบท mock', ctxNote: 'NOTE-MOCK',
      reviewGroup: () => ({ id: 'g1', title: 'กลุ่มของ mock' }) },
    ctxBody: (sys, c, h) => h.one('topic', 'ph-topic') + '\n    ' + h.many('note', 'ph-note'),
    ctxStorageKey: sys => sys.config.ai.storageKeys.ctx,
    docRef: (sys, uid, id) => sys.col('agreements', uid).doc(id),
    slots: (sys, form) => [{ host: form.querySelector('#mock-a').closest('.field'), buttons: [{ act: 'w', label: 'เขียน', data: { k: 'a' } }] }],
    resolve: (sys, act) => act === 'w' ? { specs: [{ key: 'a', el: 'mock-a', label: 'ช่อง A', hint: 'แนวทาง A' }], mode: 'write' } : null,
  };
  registerDocAi('mock', adapter);
  out.errors = [
    thrown(() => registerDocAi('x1', {})),
    thrown(() => registerDocAi('x2', { ...adapter, copy: { ...adapter.copy, consent: '' } })),
    thrown(() => registerDocAi('mock', adapter)),
    thrown(() => docAi(registerDocSystem({ id: 'bare', collections: { agreements: 'b' }, tabs: [['t', 't']] }))),
  ];

  // ---- ฟอร์มของ mock ----
  docActivate('mock'); mock.state.docId = 'p1'; mock.state.doc = { title: 'T', aiCtx: {} };
  view().innerHTML = '<form id="mock-form"><div class="field"><label for="mock-a">A</label><textarea id="mock-a"></textarea></div></form>';
  const form = document.getElementById('mock-form');
  badworkAiMount(view(), form); badworkAiMount(view(), form); // เรียกซ้ำ = ไม่ติดซ้ำ
  const html = form.innerHTML;
  out.mount = { tops: form.querySelectorAll('.doc-ai-top').length, rows: form.querySelectorAll('.doc-ai-row').length, html };
  const bare = docSystem('bare'); const bareForm = document.createElement('form'); badworkAiMount(view(), bareForm, bare);
  out.bareMounted = bareForm.children.length;

  // ---- กดปุ่ม: ความยินยอมครั้งเดียว · คำขอใช้พร้อต์/บริบท/รุ่นของส่วนกลาง + ตัวต่อของ mock · สลับระบบกลางคัน ----
  const btn = form.querySelector('[data-doc-ai="w"]');
  const paDocBefore = JSON.stringify([docSystem('pa').state, docSystem('pa').rptState]);
  btn.click(); await settle();
  const req1 = __pending[0]; const b1 = JSON.parse(req1.opts.body);
  out.req1 = { url: req1.url, auth: req1.opts.headers.Authorization || null, sys: b1.systemInstruction.parts[0].text, model: b1.model, prompt: b1.contents[0].parts[0].text, confirms: __confirms.slice() };
  docActivate('pa'); // สลับไประบบ PA ระหว่างที่คำขอของ mock ยังค้าง
  req1.res({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"a":"ข้อเสนอของ mock"}' }] } }] }) });
  await settle();
  const modal = document.querySelector('#modal-root .modal');
  out.review = { open: !!modal, text: modal ? modal.textContent : '', area: modal ? modal.querySelector('textarea').value : '', active: docSystem().id };
  modal.querySelector('[data-x="apply"]').click(); await settle();
  out.applied = { value: document.getElementById('mock-a').value, toast: toasts[toasts.length - 1], paSame: JSON.stringify([docSystem('pa').state, docSystem('pa').rptState]) === paDocBefore };

  // ---- ยินยอมแล้ว กดอีกรอบจาก mock และถามจาก PA ต้องไม่ถามซ้ำ · เลือกรุ่นครั้งเดียวมีผลทุกระบบ ----
  docActivate('mock');
  const sel = form.querySelector('#doc-ai-model'); sel.value = sel.options[sel.options.length - 1].value; sel.dispatchEvent(new Event('change'));
  btn.click(); await settle(); const req2 = __pending[1]; const b2 = JSON.parse(req2.opts.body);
  req2.res({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }) }); await settle();
  out.shared = { confirmsAfter: __confirms.length, paConsent: badworkAiConsent(docSystem('pa')), confirmsAfterPa: __confirms.length, model2: b2.model, modelId: badworkAiModelId(), busy: badworkAiBusy };

  // ---- บริบท: แยกตามระบบ (คีย์สำรอง · collection) ----
  lslog.length = 0; dblog.length = 0;
  document.getElementById('mock-ctx-topic').value = 'X';
  await badworkAiCtxSave(null);
  out.ctx = { ls: lslog.slice(), db: dblog.filter(x => /update/.test(x)), saved: mock.state.doc.aiCtx, local: badworkAiCtxLoadLocal(mock), paKeyTouched: lslog.some(x => /pa-ai-ctx/.test(x)) };
  // ฟอร์มถูกถอดก่อนตัวหน่วงครบ → ห้ามเขียนทับบริบทด้วยค่าว่าง
  view().innerHTML = ''; lslog.length = 0; dblog.length = 0;
  await badworkAiCtxSave(null);
  out.ctxGuard = { ls: lslog.slice(), db: dblog.slice(), kept: mock.state.doc.aiCtx.topic };

  // ---- PA ไม่เปลี่ยนเลยหลังมีระบบที่สอง ----
  out.paAfter = await paPrompt();
  return JSON.stringify(out);
}
// </AI_PROBE>

// ------------------------------------------------------------------
// จุดตรวจ — แต่ละจุดคืนข้อความ (ถูกแฮชเทียบกับ golden)
//   cfg() รองรับโค้ดก่อนรีแฟกเตอร์ (PA_TABS, PA_AI_* ...) ไว้ใช้สร้าง golden ครั้งแรก · โค้ดปัจจุบันอ่านจาก PA_CONFIG
// ------------------------------------------------------------------
const PROBES = `
const J = x => JSON.stringify(x);
const cfg = () => typeof PA_CONFIG !== 'undefined' ? {
  tabs: PA_CONFIG.tabs, classroomTypes: PA_CONFIG.classroomTypes, workItems: PA_CONFIG.workItems, loadLists: PA_CONFIG.loadLists,
  ctxMax: PA_CONFIG.aiCtx.maxLen, ctxFields: PA_CONFIG.aiCtx.fields, system: PA_CONFIG.ai.prompts.system, modes: PA_CONFIG.ai.prompts.modes,
  part2: PA_CONFIG.ai.prompts.part2, workHints: PA_CONFIG.ai.prompts.workHints, scope: PA_CONFIG.ai.prompts.scope, models: BADWORK_AI_CONFIG.models,
  endpoint: BADWORK_AI_CONFIG.endpoint, model: BADWORK_AI_CONFIG.model, timeout: BADWORK_AI_CONFIG.timeout,
  keys: [BADWORK_AI_CONFIG.storageKeys.model, PA_CONFIG.ai.storageKeys.ctx, BADWORK_AI_CONFIG.storageKeys.consent], // ค่าเชื่อมต่อ/รุ่น/ความยินยอมย้ายไป config กลาง — ค่าต้องเท่าเดิม (golden)
} : {
  tabs: PA_TABS, classroomTypes: PA_CLASSROOM_TYPES, workItems: PA_WORK_ITEMS, loadLists: PA_LOAD_LISTS,
  ctxMax: PA_CTX_MAX, ctxFields: PA_AI_CTX_FIELDS, system: PA_AI_SYSTEM, modes: PA_AI_MODE_TXT,
  part2: PA_AI_PART2, workHints: PA_AI_WORK_HINTS, scope: PA_AI_SCOPE, models: PA_AI.MODELS,
  endpoint: undefined, model: PA_AI.MODEL, timeout: PA_AI.TIMEOUT, // โค้ดก่อนรีแฟกเตอร์ใช้ Firebase AI Logic (ไม่มี endpoint) — สร้าง golden ของ const.aiService จากโค้ดนั้นไม่ได้อีก
  keys: [PA_AI.MODEL_KEY, PA_AI.CTX_KEY, PA_AI.CONSENT_KEY],
};
const clone = o => JSON.parse(JSON.stringify(o));
const view = () => document.getElementById('view').innerHTML;
const settle = () => new Promise(r => setTimeout(r, 20));
const resetDb = () => { dblog.length = 0; lslog.length = 0; };

globalThis.__probes = {
  // --- ค่าคงที่ (ค่าเดิมต้องเหมือนเดิมทุกตัวอักษร) ---
  'const.tabs': () => J(cfg().tabs),
  'const.form': () => J([cfg().classroomTypes, cfg().workItems, cfg().loadLists]),
  'const.aiCtx': () => J([cfg().ctxMax, cfg().ctxFields]),
  'const.aiPrompts': () => J([cfg().system, ['', 'ข้อความเดิม'].map(c => Object.keys(cfg().modes).map(m => cfg().modes[m](c))), cfg().part2, cfg().workHints, cfg().scope]),
  // บริการ AI = Gemini REST ผ่านพร็อกซี (เดิมคือ Firebase AI Logic: siteKey/sdk) · ไม่ใส่ proxyUrl/apiKey ในแฮช — proxyUrl เปลี่ยนตามการ deploy (ตรวจรูปแบบแยกด้านล่าง) และ apiKey ต้องว่างเสมอ
  'const.aiService': () => J([cfg().models, cfg().endpoint, cfg().model, cfg().timeout, cfg().keys]),

  // --- ฟังก์ชันล้วน ---
  'fn.normalize': () => J([paNormalize(clone(PA_FIXTURE)), paNormalize(clone(PA_LEGACY_FIXTURE)), paNormalize({}), paNormalize(null)]),
  'fn.docHtml': () => paBuildDocHtml(paNormalize(clone(PA_FIXTURE)), OWNER_FIXTURE) + '\\n----\\n' + paBuildDocHtml(paNormalize({ fiscalYear: '2569' }), {}) + '\\n----\\n' + paBuildDocHtml(paNormalize(clone(PA_LEGACY_FIXTURE)), OWNER_FIXTURE),
  'fn.rptHtml': () => parptBuildDocHtml(parptNormalize(clone(RPT_FIXTURE)), OWNER_FIXTURE, '') + '\\n----\\n' + parptBuildDocHtml(parptNormalize({ fiscalYear: '2569' }), {}, '<p>ภาคผนวก</p>'),
  'fn.css': () => PA1_CSS + '\\n----\\n' + PARPT_LIST_CSS + '\\n----\\n' + docFontCss(),
  'fn.aiScopes': () => J(['part2', ...cfg().workItems.flatMap(([, , items]) => items.map(([id]) => id))].map(id => [id, [...paAiScope(docSystem('pa'), id === 'part2' ? [{ key: 'problem' }] : [{ group: id[0], key: id + '.s1' }])].sort()])),
  'fn.aiWorkSpecs': () => J([paAiWorkSpecs(docSystem('pa'), null), paAiWorkSpecs(docSystem('pa'), ['1.1', '2.3']), paAiWorkSpecs(docSystem('pa'), ['9.9'])]),
  'fn.aiCtxHtml': () => badworkAiCtxHtml({}) + '\\n----\\n' + badworkAiCtxHtml(clone(PA_FIXTURE).aiCtx) + '\\n----\\n' + J([badworkAiCtxCount({}), badworkAiCtxCount(PA_FIXTURE.aiCtx)]),

  // --- หน้าจอ ---
  'ui.shell': () => { docSystem('pa').state.tab = 'rpt'; docBuildShell(); return view(); },
  'ui.list': async () => { docSystem('pa').state.tab = 'agreement'; docSystem('pa').state.view = 'list'; docSystem('pa').state.list = null; await renderPAListView(); await settle(); return document.getElementById('doc-tab-body')?.innerHTML ?? view(); },
  'ui.formEdit': async () => { docSystem('pa').state.tab = 'agreement'; docSystem('pa').state.view = 'form'; docSystem('pa').state.docId = 'a1'; docSystem('pa').state.doc = clone(PA_FIXTURE); docSystem('pa').state.doc.owner = OWNER_FIXTURE; await renderPAFormView(); await settle(); return document.getElementById('doc-tab-body').innerHTML; },
  'ui.formEditSubmitted': async () => { docSystem('pa').state.tab = 'agreement'; docSystem('pa').state.view = 'form'; docSystem('pa').state.docId = 'a1'; docSystem('pa').state.doc = { ...clone(PA_FIXTURE), status: 'submitted', owner: OWNER_FIXTURE }; await renderPAFormView(); await settle(); return document.getElementById('doc-tab-body').innerHTML; },
  'ui.formNew': async () => { docSystem('pa').state.tab = 'agreement'; docSystem('pa').state.view = 'form'; docSystem('pa').state.docId = null; docSystem('pa').state.doc = paNormalize({ fiscalYear: '2569', classroomTypes: { basic: true }, status: 'draft' }); await renderPAFormView(); await settle(); return document.getElementById('doc-tab-body').innerHTML + '\\n----\\n' + J(docSystem('pa').state.doc.load); },
  'ui.formLegacy': async () => { docSystem('pa').state.tab = 'agreement'; docSystem('pa').state.view = 'form'; docSystem('pa').state.docId = 'a0'; docSystem('pa').state.doc = clone(PA_LEGACY_FIXTURE); await renderPAFormView(); await settle(); return document.getElementById('doc-tab-body').innerHTML; },
  'ui.collect': async () => { docSystem('pa').state.tab = 'agreement'; docSystem('pa').state.view = 'form'; docSystem('pa').state.docId = 'a1'; docSystem('pa').state.doc = clone(PA_FIXTURE); await renderPAFormView(); await settle(); paCollectFormData(); return J(docSystem('pa').state.doc); },
  'ui.reportTab': async () => { docSystem('pa').state.tab = 'report'; docSystem('pa').state.previewId = 'a1'; await renderPAReportView(); await settle(); return document.getElementById('doc-tab-body')?.innerHTML ?? view(); },
  'ui.rptList': async () => { docSystem('pa').state.tab = 'rpt'; docSystem('pa').rptState.view = 'list'; docSystem('pa').rptState.list = null; await renderPARptView(); await settle(); return document.getElementById('doc-tab-body')?.innerHTML ?? view(); },
  'ui.rptForm': async () => { docSystem('pa').state.tab = 'rpt'; docSystem('pa').rptState.view = 'form'; docSystem('pa').rptState.docId = 'r1'; docSystem('pa').rptState.doc = parptNormalize(clone(RPT_FIXTURE)); await renderPARptView(); await settle(); const h = document.getElementById('doc-tab-body')?.innerHTML ?? view(); parptCollect(); return h + '\\n----\\n' + J(docSystem('pa').rptState.doc); },
  'ui.rptPreview': async () => { docSystem('pa').state.tab = 'rptprev'; docSystem('pa').rptState.previewId = 'r1'; await renderPARptPreviewView(); await settle(); return document.getElementById('doc-tab-body')?.innerHTML ?? view(); },
  'ui.tabs': async () => {
    const seen = [];
    docSystem('pa').state.nextTab = null; await renderDocPage('pa'); await settle();
    for (const t of [...cfg().tabs.map(x => x[0]), 'nope', 'agreement']) {
      await docSwitchTab(t); await settle();
      seen.push([t, docSystem('pa').state.tab, [...document.querySelectorAll('#doc-tabs .tab.active')].map(x => x.dataset.tab).join(), (document.getElementById('doc-tab-body')?.innerHTML || '').length]);
    }
    return J(seen);
  },

  // --- AI: พร้อต์ที่ส่งออก (จับที่ badworkAiGenerate ก่อนถึงเครือข่าย) ---
  'ai.prompts': async () => {
    docSystem('pa').state.tab = 'agreement'; docSystem('pa').state.view = 'form'; docSystem('pa').state.docId = 'a1'; docSystem('pa').state.doc = clone(PA_FIXTURE); await renderPAFormView(); await settle();
    const got = []; const real = badworkAiGenerate; badworkAiGenerate = async p => { got.push(p); return {}; };
    const sets = { part2: cfg().part2.map(f => ({ key: f.key, el: f.el, label: f.label, hint: f.hint })), work: paAiWorkSpecs(docSystem('pa'), ['1.1', '2.3', '3.3']), all: paAiWorkSpecs(docSystem('pa'), null) };
    document.getElementById('pa-method').value = '1. ข้อความที่พิมพ์ค้าง';
    for (const [n, specs] of Object.entries(sets)) for (const mode of ['write', 'polish', 'shorten']) { got.push('### ' + n + ' / ' + mode); await badworkAiBatch(specs, mode, {}); }
    badworkAiGenerate = real;
    return got.join('\\n=====\\n');
  },
  'ai.ctxStorage': async () => {
    docSystem('pa').state.tab = 'agreement'; docSystem('pa').state.view = 'form'; docSystem('pa').state.docId = 'a1'; docSystem('pa').state.doc = clone(PA_FIXTURE); await renderPAFormView(); await settle();
    resetDb();
    const sel = document.getElementById('doc-ai-model'); const out = [badworkAiModelId()];
    sel.value = sel.options[sel.options.length - 1].value; sel.dispatchEvent(new Event('change')); out.push(badworkAiModelId(), document.querySelector('[data-model-hint]').textContent);
    document.getElementById('pa-ctx-level').value = 'ม.3'; await badworkAiCtxSave(null); out.push(J(badworkAiCtxLoadLocal()));
    docSystem('pa').state.docId = null; await badworkAiCtxSave(null);
    return J([out, lslog.slice(), dblog.slice(), toasts.slice()]);
  },

  // --- Firestore: path และฟิลด์ที่เขียน ---
  'db.paths': async () => {
    resetDb();
    docSystem('pa').state.docId = null; await paLoadList(); await paSave({ ...clone(PA_FIXTURE), id: 'x', createdAt: 1, _tmp: 1 });
    docSystem('pa').state.docId = 'a1'; await paSave(clone(PA_FIXTURE)); await paDelete('a1');
    docSystem('pa').rptState.docId = null; await parptLoadList(); await parptSave({ ...clone(RPT_FIXTURE), id: 'y', _tmp: 1 });
    docSystem('pa').rptState.docId = 'r1'; await parptSave(clone(RPT_FIXTURE)); await parptDelete('r1');
    await paReportLoadList(); await parptPullAgreement(parptNormalize({ fiscalYear: '2569' }));
    return dblog.join('\\n');
  },
};
`;

(async () => {
  console.log('โครง PA_CONFIG');
  const cfgSrc = fs.existsSync(path.join(ROOT, 'js/pa-config.js')) ? read('js/pa-config.js') : null;
  const env0 = makeEnv();
  const run = (c, code) => vm.runInContext(code, c);
  if (cfgSrc) {
    const C = run(env0, 'JSON.parse(JSON.stringify(PA_CONFIG, (k, v) => typeof v === "function" ? "fn" : v))');
    const S = run(env0, 'JSON.parse(JSON.stringify(BADWORK_AI_CONFIG))'); // ตั้งค่า AI ส่วนกลาง (js/badwork-ai-config.js)
    const rules = read('firestore.rules');
    for (const [k, name] of Object.entries(C.collections)) ok(new RegExp(`match /${name}/\\{`).test(rules), `collections.${k} = ${name} มี match ใน firestore.rules`);
    ok(C.tabs.length === new Set(C.tabs.map(t => t[0])).size && C.tabs[0][0] === 'agreement', 'แท็บไม่ซ้ำ และแท็บแรกคือ agreement');
    const ids = C.workItems.flatMap(([, , items]) => items.map(i => i[0]));
    ok(ids.length === 15 && new Set(ids).size === 15, 'งานตามมาตรฐานตำแหน่งมี 15 ข้อ ไม่ซ้ำ');
    ok(ids.every(id => C.ai.prompts.scope[id]) && C.ai.prompts.scope.part2, 'ตาราง scope ของ AI ครอบคลุมครบทุกข้อ + part2');
    ok(JSON.stringify(Object.keys(C.aiCtx.fields).sort()) === JSON.stringify(Object.keys(C.aiCtx.maxLen).sort()), 'ช่องบริบท AI (fields) กับความยาวสูงสุด (maxLen) ตรงกัน');
    ok(S.models.some(m => m.id === S.model), 'รุ่น AI เริ่มต้นอยู่ในรายการรุ่นที่เลือกได้ (config กลาง)');
    ok(!('models' in C.ai) && !('apiKey' in C.ai) && !('proxyUrl' in C.ai) && !('endpoint' in C.ai) && !('model' in C.ai) && !('timeout' in C.ai) && !('consent' in C.ai.storageKeys) && !('model' in C.ai.storageKeys), 'PA_CONFIG.ai ไม่มีค่าเชื่อมต่อ/รุ่น/ความยินยอมซ้ำกับ config กลาง');
    const allKeys = [...Object.values(S.storageKeys), ...Object.values(C.ai.storageKeys)];
    ok(allKeys.every(k => /^pa-ai-/.test(k)) && new Set(allKeys).size === 3, 'คีย์ localStorage ของ AI ขึ้นต้น pa-ai- (ค่าเดิม ห้ามเปลี่ยน — ไม่เกี่ยวกับชื่อ class doc-ai-*) และไม่ซ้ำกัน');
    const legacy = ['PA_TABS', 'PA_CLASSROOM_TYPES', 'PA_WORK_ITEMS', 'PA_LOAD_LISTS', 'PA_CTX_MAX', 'PA_AI_SYSTEM', 'PA_AI_MODE_TXT', 'PA_AI_PART2', 'PA_AI_WORK_HINTS', 'PA_AI_CTX_FIELDS', 'PA_AI_SCOPE'];
    const stray = ['js/pa.js', 'js/badwork-ai.js', 'js/pa-ai.js', 'js/pa-rpt.js', 'js/pa-report.js'].flatMap(f => legacy.filter(n => new RegExp('\\b' + n + '\\b').test(read(f))).map(n => f + ':' + n))
      .concat(['js/pa.js', 'js/badwork-ai.js', 'js/pa-ai.js', 'js/pa-rpt.js'].filter(f => /PA_AI\./.test(read(f)) || /'pa_(agreements|reports)'/.test(read(f))).map(f => f + ':literal'));
    ok(stray.length === 0, 'ไม่มีค่าคงที่ PA เดิมหรือชื่อ collection ค้างอยู่นอก PA_CONFIG', stray.join(', '));
    ok(bundleFiles()[0] === 'js/doc-system.js' && bundleFiles()[1] === 'js/doc-shell.js' && bundleFiles()[2] === 'js/pa-config.js' && bundleFiles()[3] === 'js/pa.js', 'ลำดับโหลด LAZY_BUNDLES.pa: doc-system.js → doc-shell.js → pa-config.js → pa.js');
    const bf = bundleFiles(), at = f => bf.indexOf(f);
    ok(at('js/badwork-ai-config.js') > -1 && at('js/badwork-ai-config.js') < at('js/badwork-ai.js') && at('js/badwork-ai.js') < at('js/pa-ai.js') && at('js/pa.js') < at('js/pa-ai.js'), 'ลำดับโหลด: badwork-ai-config.js → badwork-ai.js (แกน) → pa-ai.js (ตัวต่อ หลัง pa.js)');
    // ตัดคอมเมนต์ก่อนตรวจ — คอมเมนต์อ้างชื่อเดิมเพื่ออธิบายได้ แต่โค้ดห้ามใช้
    const code = f => read(f).replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
    const jsFiles = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f);
    const oldState = jsFiles.filter(f => /\b(PAState|PARptState)\b/.test(code(f)));
    ok(oldState.length === 0, 'ไม่มี PAState / PARptState (global เดี่ยว) เหลือในโค้ด — state อยู่ที่ระบบเอกสาร (sys.state / sys.rptState)', oldState.join(', '));
    const cfgUse = jsFiles.filter(f => f !== 'js/pa-config.js' && /\bPA_CONFIG\b/.test(code(f)));
    ok(cfgUse.length === 0, 'PA_CONFIG ถูกอ้างโดยตรงเฉพาะใน js/pa-config.js — ไฟล์อื่นอ่านผ่าน sys.config', cfgUse.join(', '));
    const colLit = jsFiles.filter(f => f !== 'js/pa-config.js' && /pa_(agreements|reports)/.test(code(f)));
    ok(colLit.length === 0, 'ชื่อ collection ไม่ถูกเขียนตรงในโค้ดนอก pa-config.js — อ่านผ่าน sys.col(kind, uid)', colLit.join(', '));
    // แกน AI ต้องไม่รู้จัก PA — ตัดคอมเมนต์แล้วห้ามมีชื่อ/โครง/ข้อความของ PA หลงเหลือในโค้ด (ชื่อ class/id doc-ai-* เป็นชื่อกลางอยู่แล้ว ไม่ผูกกับระบบใด)
    const coreBad = [/PA_CONFIG/, /\bpa[A-Z]\w*\s*\(/, /\bpart2\b/, /workItems|classroomTypes|loadLists/, /pa-wi-|pa-witem|data-wi\b|pa-ctx-|pa-form/, /Personal Agreement|PA 1|\bPA\b/, /ประเด็นท้าทาย|ส่วนที่ 2|ช่วยครู/, /docSystem\(\s*['"`]/, /docActivate/, /'agreements'|"agreements"/, /teacherProfile/]
      .filter(re => re.test(code('js/badwork-ai.js')));
    ok(coreBad.length === 0, 'js/badwork-ai.js (แกน) ไม่มีชื่อ/โครง/ข้อความของ PA ในโค้ด', coreBad.join(' '));
    // ชื่อ class/id/data-attribute ของ UI ผู้ช่วย AI เป็นชื่อกลาง doc-ai-* — ห้ามมี pa-ai-* หลงเหลือ (ยกเว้นคีย์ localStorage ใน js/badwork-ai-config.js และ js/pa-config.js ที่ต้องคงค่าเดิม)
    const cssSrc = read('css/style.css');
    const oldNames = ['js/badwork-ai.js', 'js/pa-ai.js', 'js/pa.js'].flatMap(f => (code(f).match(/\bpa-ai-[\w-]*|data-pa-ai\b|dataset\.paAi\b/g) || []).map(m => f + ':' + m))
      .concat((cssSrc.match(/\bpa-ai-[\w-]*|data-pa-ai\b/g) || []).map(m => 'css/style.css:' + m));
    ok(oldNames.length === 0, 'ไม่มีชื่อ pa-ai-* / data-pa-ai เหลือใน แกน · ตัวต่อ · CSS (เปลี่ยนเป็น doc-ai-* / data-doc-ai แล้ว)', oldNames.join(', '));
    // class ที่โค้ด AI ใช้ ↔ selector ใน CSS ต้องตรงกันทั้งสองทิศ (กันพิมพ์ชื่อผิดตอนเปลี่ยนชื่อ → สไตล์หายเงียบๆ)
    const jsClasses = new Set(['js/badwork-ai.js', 'js/pa-ai.js'].flatMap(f => (code(f).match(/\bdoc-ai-[\w-]*[\w]/g) || [])));
    const cssClasses = new Set((cssSrc.match(/\.doc-ai-[\w-]*[\w]/g) || []).map(s => s.slice(1)));
    const ID_ONLY = new Set(['doc-ai-model']); // ใช้เป็น id ของ <select> (และ class ของกล่องครอบ) — ไม่มีกฎ CSS ของตัวเอง
    const noStyle = [...jsClasses].filter(c => !cssClasses.has(c) && !ID_ONLY.has(c));
    const noUse = [...cssClasses].filter(c => !jsClasses.has(c));
    ok(jsClasses.size >= 15 && noStyle.length === 0, 'class doc-ai-* ทุกตัวที่โค้ดใช้ มีกฎใน css/style.css', noStyle.join(', '));
    ok(noUse.length === 0, 'กฎ .doc-ai-* ทุกตัวใน css/style.css ถูกใช้โดยโค้ด AI (ไม่มีกฎกำพร้า)', noUse.join(', '));
    // ไฟล์ PA ไม่ต่อ db.collection('users')... เอง ยกเว้นอ่าน 'records' (อบรม/เกียรติบัตร ของแอปหลัก ไม่ใช่ collection ของระบบเอกสาร) ที่ pa-rpt.js จุดเดียว
    const direct = ['js/pa.js', 'js/badwork-ai.js', 'js/pa-ai.js', 'js/pa-report.js', 'js/pa-rpt.js'].flatMap(f => (code(f).match(/collection\(\s*['"`]users['"`]\s*\)[^;]*/g) || []).map(m => f + ': ' + m.replace(/\s+/g, ' ').slice(0, 60)));
    ok(direct.length === 1 && /^js\/pa-rpt\.js: .*\.collection\('records'\)/.test(direct[0]), 'ไฟล์ PA ไม่ต่อ db.collection(\'users\')... เอง — collection ของระบบเอกสารผ่าน sys.col เท่านั้น (ยกเว้นอ่าน records จุดเดียว)', direct.join(' | '));
  } else console.log('  (ไม่มี js/pa-config.js — โค้ดก่อนรีแฟกเตอร์ ข้ามส่วนนี้)');

  console.log('จุดตรวจพฤติกรรม (เทียบ golden)');
  const env = makeEnv();
  Object.assign(env, {});
  vm.runInContext(`const PA_FIXTURE = ${JSON.stringify(PA_DOC)}, PA_LEGACY_FIXTURE = ${JSON.stringify(PA_LEGACY)}, RPT_FIXTURE = ${JSON.stringify(RPT_DOC)}, OWNER_FIXTURE = ${JSON.stringify(OWNER)};`, env);
  vm.runInContext(PROBES, env);
  const probes = env.__probes;
  const out = {};
  for (const [name, fn] of Object.entries(probes)) {
    try { out[name] = String(await fn()); } catch (e) { out[name] = 'ERR: ' + (e && e.stack || e); }
  }
  if (process.env.PA_DUMP) { fs.mkdirSync(process.env.PA_DUMP, { recursive: true }); for (const [k, v] of Object.entries(out)) fs.writeFileSync(path.join(process.env.PA_DUMP, k + '.txt'), v); }
  const errs = Object.entries(out).filter(([, v]) => v.startsWith('ERR: '));
  errs.forEach(([k, v]) => ok(false, `จุดตรวจ ${k} รันไม่ผ่าน`, v.split('\n').slice(0, 3).join(' | ')));
  ok(!errs.length, `รันครบทุกจุดตรวจโดยไม่ error (${Object.keys(out).length} จุด)`);
  ok(Object.values(out).every(v => v.length > 2), 'ผลลัพธ์ทุกจุดไม่ว่าง');
  const hashes = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, sha(v)]));

  if (process.env.PA_UPDATE) {
    fs.writeFileSync(GOLDEN, JSON.stringify(hashes, null, 2) + '\n');
    console.log(`  เขียน ${path.relative(process.cwd(), GOLDEN)} แล้ว (${Object.keys(hashes).length} จุด)`);
  } else {
    const gold = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
    for (const k of Object.keys(gold)) ok(hashes[k] === gold[k], `${k} เหมือนเดิม`);
    ok(Object.keys(hashes).every(k => k in gold), 'ไม่มีจุดตรวจใหม่ที่ยังไม่อยู่ใน golden', Object.keys(hashes).filter(k => !(k in gold)).join(', '));
  }

  // ---- ตั้งค่าบริการ AI: ไม่มีความลับหลุดในโค้ดหน้าเว็บ ----
  if (/PA_CONFIG/.test(read('js/pa-config.js'))) {
    const aiCfg = JSON.parse(vm.runInContext('JSON.stringify({ apiKey: BADWORK_AI_CONFIG.apiKey, proxyUrl: BADWORK_AI_CONFIG.proxyUrl, endpoint: BADWORK_AI_CONFIG.endpoint, model: BADWORK_AI_CONFIG.model, ids: BADWORK_AI_CONFIG.models.map(m => m.id) })', env));
    ok(aiCfg.apiKey === '', 'ai.apiKey ว่าง — ไม่ commit คีย์ลงหน้าเว็บ (ใช้พร็อกซี)', aiCfg.apiKey ? '(มีค่า!)' : '');
    ok(/^https:\/\/[^\s/]+(\/\S*)?$/.test(aiCfg.proxyUrl || ''), 'ai.proxyUrl เป็น https URL', aiCfg.proxyUrl);
    ok(!/[?&]key=/i.test(aiCfg.proxyUrl || '') && aiCfg.endpoint === 'https://generativelanguage.googleapis.com/v1beta', 'ไม่มีคีย์ใน URL · endpoint ตรงกับ Gemini API');
    ok(aiCfg.ids.includes(aiCfg.model) && new Set(aiCfg.ids).size === aiCfg.ids.length, 'รุ่นเริ่มต้นอยู่ในรายการรุ่น และรายการไม่ซ้ำ');
  }

  // ---- ระบบเอกสารหลายระบบ (สภาพแวดล้อมใหม่ ไม่ปนกับจุดตรวจด้านบน) ----
  console.log('ระบบเอกสารหลายระบบ (js/doc-system.js)');
  const env3 = makeEnv();
  let R;
  try { R = JSON.parse(await vm.runInContext('(' + sysProbe.toString() + ')()', env3)); } catch (e) { ok(false, 'รันจุดตรวจระบบเอกสารไม่ผ่าน', e && e.stack || e); }
  if (R) {
    ok(JSON.stringify(R.registered) === '["idp","pa"]' && R.firstIsActive === 'pa', 'ลงทะเบียนได้หลายระบบ · ระบบแรก (pa) เป็นระบบที่กำลังแสดงจนกว่าจะ activate ระบบอื่น');
    ok(R.distinct && R.freshDefaults, 'ทุกระบบได้ state คนละออบเจ็กต์ และเริ่มจากค่าเริ่มต้นเดียวกับ PAState/PARptState เดิม');
    ok(JSON.stringify(R.noLeak) === '[null,"agreement","list"]', 'แก้ state ของ pa ไม่กระทบ state ของระบบอื่น', JSON.stringify(R.noLeak));
    const has = (log, n) => log.includes('collection:' + n);
    ok(has(R.routing.idp, 'idp_plans') && has(R.routing.idp, 'idp_reports') && !R.routing.idp.some(x => /pa_/.test(x)), 'ระบบ idp อ่าน/เขียน idp_plans · idp_reports ตาม config ของตัวเอง (ไม่แตะ pa_*)', R.routing.idp.join(' '));
    ok(has(R.routing.pa, 'pa_agreements') && has(R.routing.pa, 'pa_reports') && !R.routing.pa.some(x => /idp_/.test(x)), 'ระบบ pa ใช้ pa_agreements · pa_reports ตาม config ของตัวเอง (ไม่แตะ idp_*)', R.routing.pa.join(' '));
    ok(R.inflight.newId === 'new1' && R.inflight.paDocId === 'new1' && R.inflight.idpDocId === null && R.inflight.db.join() === 'pa_agreements:add:createdAt,fiscalYear,updatedAt', 'บันทึกที่ค้างระหว่างสลับระบบ เขียนลง state/collection ของระบบที่เริ่มงาน', JSON.stringify(R.inflight));
    ok(JSON.stringify(R.titles) === '[true,false,true,false]', 'หัวเรื่องหน้าอ่านจาก config ของระบบที่กำลังแสดง', JSON.stringify(R.titles));
    ok(R.errors.every(m => typeof m === 'string' && m.length) && /nope/.test(R.errors[0]) && /nope/.test(R.errors[2]), 'id/kind ที่ไม่รู้จัก · ลงทะเบียนซ้ำ · config ไม่ครบ → error ที่อ่านรู้เรื่อง', JSON.stringify(R.errors));
    ok(R.activeAfter === 'pa', 'activate กลับ pa แล้ว docSystem() คืน pa');
  }


  // ---- แกน AI ร่วม: ระบบจำลองที่สอง (สภาพแวดล้อมใหม่) ----
  console.log('แกน AI ร่วม (js/badwork-ai.js + ตัวต่อ) — ระบบจำลองที่สอง');
  const env4 = makeEnv();
  vm.runInContext(`const PA_FIXTURE = ${JSON.stringify(PA_DOC)}, OWNER_FIXTURE = ${JSON.stringify(OWNER)}; globalThis.__pending = []; globalThis.__confirms = [];`, env4);
  env4.fetch = (url, opts) => new Promise(res => env4.__pending.push({ url, opts, res }));
  env4.AbortController = env4.window.AbortController;
  env4.confirm = msg => { env4.__confirms.push(msg); return true; };
  env4.openModal = html => { const d = env4.document; d.getElementById('modal-root')?.remove(); const r = d.createElement('div'); r.id = 'modal-root'; r.innerHTML = `<div id="modal-backdrop"><div class="modal">${html}</div></div>`; d.body.appendChild(r); };
  let A;
  try { A = JSON.parse(await vm.runInContext('(' + aiProbe.toString() + ')()', env4)); } catch (e) { ok(false, 'รันจุดตรวจแกน AI ไม่ผ่าน', e && e.stack || e); }
  if (A) {
    const notPa = h => !/Personal Agreement|ประเด็นท้าทาย|pa-ctx-|\bPA\b|สพฐ|ครูไทย/.test(h);
    ok(A.mount.tops === 1 && A.mount.rows === 1, 'mount ติดการ์ดบนสุด 1 ใบ + แถวปุ่ม 1 แถวตามที่ตัวต่อของ mock บอก (เรียกซ้ำไม่ติดซ้ำ)', JSON.stringify([A.mount.tops, A.mount.rows]));
    ok(['WARN-MOCK', 'NOTE-MOCK', 'จุดที่ 2 ของ mock', 'ร่างของ mock', 'บริบท mock', 'id="mock-ctx-topic"', 'ph-topic'].every(t => A.mount.html.includes(t)) && notPa(A.mount.html), 'การ์ดของ mock ใช้ข้อความ/ช่องบริบท/id ของตัวต่อ mock — ไม่มีข้อความหรือ id ของ PA ปน', A.mount.html.slice(0, 200));
    ok(A.bareMounted === 0, 'ระบบที่ไม่มีตัวต่อ: mount ไม่ติดอะไร (ฟอร์มทำงานตามเดิม)');
    ok(A.errors.every(m => typeof m === 'string' && m.length) && /ไม่ครบ/.test(A.errors[0]) && /copy\.consent/.test(A.errors[1]) && /ซ้ำ/.test(A.errors[2]) && /bare/.test(A.errors[3]) && /registerDocAi/.test(A.errors[3]), 'ตัวต่อไม่ครบ · ข้อความหายไป · ลงทะเบียนซ้ำ · ระบบไม่มีตัวต่อ → error ที่อ่านรู้เรื่อง', JSON.stringify(A.errors));
    const r = A.req1;
    ok(r.sys === 'SYS-MOCK' && r.prompt.includes('CTX-MOCK scope=x,y title=T') && r.prompt.includes('งาน (ทุกช่อง): งานของ mock write') && r.prompt.includes('- "a" ชื่อช่อง: ช่อง A\n  แนวทาง: แนวทาง A') && notPa(r.prompt + r.sys), 'คำขอของ mock: คำสั่งระบบ/ข้อมูลประกอบ/งาน/ช่อง มาจากตัวต่อของ mock ผ่านโครงพร้อต์ของแกน (ไม่มีของ PA ปน)', r.prompt.slice(0, 200));
    ok(/^https:\/\//.test(r.url) && r.url === JSON.parse(vm.runInContext('JSON.stringify(BADWORK_AI_CONFIG.proxyUrl)', env4)) && r.model === 'gemini-3.8-flash', 'ปลายทาง/รุ่นเริ่มต้นมาจาก config กลาง');
    ok(r.confirms.length === 1 && r.confirms[0] === 'CONSENT-MOCK', 'ครั้งแรกถามยินยอมด้วยข้อความของระบบที่กด');
    ok(A.review.open && A.review.area === 'ข้อเสนอของ mock' && A.review.text.includes('กลุ่มของ mock') && A.review.text.includes('บันทึกMock') && notPa(A.review.text), 'หน้าต่างตรวจทาน: หัวกลุ่ม/ชื่อปุ่มบันทึกมาจากตัวต่อของ mock');
    ok(A.review.active === 'pa' && A.applied.value === 'ข้อเสนอของ mock' && /บันทึกMock/.test(A.applied.toast) && A.applied.paSame, 'สลับไป PA ระหว่างที่คำขอของ mock ค้าง: ผลลงช่องของ mock · state ของ PA ไม่ถูกแตะ');
    ok(A.shared.confirmsAfter === 1 && A.shared.paConsent === true && A.shared.confirmsAfterPa === 1 && A.shared.busy === false, 'ยินยอมครั้งเดียวมีผลทุกระบบ (กดซ้ำจาก mock และถามจาก PA ไม่ขึ้นหน้าต่างอีก) · ตัวกันกดซ้ำคืนค่า');
    ok(A.shared.model2 === 'gemini-3.1-flash-lite' && A.shared.modelId === 'gemini-3.1-flash-lite', 'เลือกรุ่นครั้งเดียวมีผลทุกระบบ (คำขอใช้รุ่นที่เลือก)', A.shared.model2);
    ok(JSON.stringify(A.ctx.ls) === '["set:mock-ai-ctx-v1"]' && JSON.stringify(A.ctx.db) === '["idp_plans/p1:update:aiCtx"]' && A.ctx.saved.topic === 'X' && A.ctx.local.topic === 'X' && !A.ctx.paKeyTouched, 'บริบทของ mock เก็บที่คีย์สำรอง/collection ของ mock เท่านั้น (ไม่แตะ pa-ai-ctx-v1 / pa_*)', JSON.stringify(A.ctx));
    ok(A.ctxGuard.ls.length === 0 && A.ctxGuard.db.length === 0 && A.ctxGuard.kept === 'X', 'ฟอร์มถูกถอดก่อนตัวหน่วงครบ: ไม่เขียนทับบริบทที่เก็บไว้ด้วยค่าว่าง', JSON.stringify(A.ctxGuard));
    ok(A.paBefore === A.paAfter && A.paBefore.length > 500, 'พร้อต์ของ PA เหมือนเดิมทุกตัวอักษรก่อน/หลังมีระบบที่สองลงทะเบียนและใช้งานแกน');
  }

  console.log(`\nผลรวม: ผ่าน ${pass}, ไม่ผ่าน ${fail}`);
  process.exit(fail ? 1 : 0);
})();
