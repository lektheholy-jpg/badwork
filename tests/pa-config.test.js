// ทดสอบกลุ่มหน้า Personal Agreement (js/pa-config.js + pa.js + pa-ai.js + pa-report.js + pa-rpt.js) ด้วย jsdom
// วิธีรัน: node tests/pa-config.test.js   (หรือ npm run test:pa)
//
// ทำอะไร
//   1) ตรวจโครง PA_CONFIG: ชื่อ collection ตรงกับ firestore.rules · แท็บไม่ซ้ำ · ตาราง scope ของ AI ครบทุกข้อ · ฯลฯ
//   2) โหลดกลุ่ม PA ตามลำดับ LAZY_BUNDLES.pa จริง แล้วรันจุดตรวจ (probe) ~20 จุด: เรนเดอร์ฟอร์ม/รายการ/ตัวอย่างพิมพ์/แท็บ ·
//      พร้อต์ที่ส่งให้ AI · path ที่ยิง Firestore · key ที่เขียน localStorage — แล้วเทียบ SHA-1 ของผลลัพธ์กับ tests/pa-golden.json
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
// จุดตรวจ — แต่ละจุดคืนข้อความ (ถูกแฮชเทียบกับ golden)
//   cfg() รองรับโค้ดก่อนรีแฟกเตอร์ (PA_TABS, PA_AI_* ...) ไว้ใช้สร้าง golden ครั้งแรก · โค้ดปัจจุบันอ่านจาก PA_CONFIG
// ------------------------------------------------------------------
const PROBES = `
const J = x => JSON.stringify(x);
const cfg = () => typeof PA_CONFIG !== 'undefined' ? {
  tabs: PA_CONFIG.tabs, classroomTypes: PA_CONFIG.classroomTypes, workItems: PA_CONFIG.workItems, loadLists: PA_CONFIG.loadLists,
  ctxMax: PA_CONFIG.aiCtx.maxLen, ctxFields: PA_CONFIG.aiCtx.fields, system: PA_CONFIG.ai.prompts.system, modes: PA_CONFIG.ai.prompts.modes,
  part2: PA_CONFIG.ai.prompts.part2, workHints: PA_CONFIG.ai.prompts.workHints, scope: PA_CONFIG.ai.prompts.scope, models: PA_CONFIG.ai.models,
  siteKey: PA_CONFIG.ai.siteKey, sdk: PA_CONFIG.ai.sdk, model: PA_CONFIG.ai.model, timeout: PA_CONFIG.ai.timeout,
  keys: [PA_CONFIG.ai.storageKeys.model, PA_CONFIG.ai.storageKeys.ctx, PA_CONFIG.ai.storageKeys.consent],
} : {
  tabs: PA_TABS, classroomTypes: PA_CLASSROOM_TYPES, workItems: PA_WORK_ITEMS, loadLists: PA_LOAD_LISTS,
  ctxMax: PA_CTX_MAX, ctxFields: PA_AI_CTX_FIELDS, system: PA_AI_SYSTEM, modes: PA_AI_MODE_TXT,
  part2: PA_AI_PART2, workHints: PA_AI_WORK_HINTS, scope: PA_AI_SCOPE, models: PA_AI.MODELS,
  siteKey: PA_AI.SITE_KEY, sdk: PA_AI.SDK, model: PA_AI.MODEL, timeout: PA_AI.TIMEOUT,
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
  'const.aiService': () => J([cfg().models, cfg().siteKey, cfg().sdk, cfg().model, cfg().timeout, cfg().keys]),

  // --- ฟังก์ชันล้วน ---
  'fn.normalize': () => J([paNormalize(clone(PA_FIXTURE)), paNormalize(clone(PA_LEGACY_FIXTURE)), paNormalize({}), paNormalize(null)]),
  'fn.docHtml': () => paBuildDocHtml(paNormalize(clone(PA_FIXTURE)), OWNER_FIXTURE) + '\\n----\\n' + paBuildDocHtml(paNormalize({ fiscalYear: '2569' }), {}) + '\\n----\\n' + paBuildDocHtml(paNormalize(clone(PA_LEGACY_FIXTURE)), OWNER_FIXTURE),
  'fn.rptHtml': () => parptBuildDocHtml(parptNormalize(clone(RPT_FIXTURE)), OWNER_FIXTURE, '') + '\\n----\\n' + parptBuildDocHtml(parptNormalize({ fiscalYear: '2569' }), {}, '<p>ภาคผนวก</p>'),
  'fn.css': () => PA1_CSS + '\\n----\\n' + PARPT_LIST_CSS + '\\n----\\n' + paFontCss(),
  'fn.aiScopes': () => J(['part2', ...cfg().workItems.flatMap(([, , items]) => items.map(([id]) => id))].map(id => [id, [...paAiScope(id === 'part2' ? [{ key: 'problem' }] : [{ group: id[0], key: id + '.s1' }])].sort()])),
  'fn.aiWorkSpecs': () => J([paAiWorkSpecs(null), paAiWorkSpecs(['1.1', '2.3']), paAiWorkSpecs(['9.9'])]),
  'fn.aiCtxHtml': () => paAiCtxHtml({}) + '\\n----\\n' + paAiCtxHtml(clone(PA_FIXTURE).aiCtx) + '\\n----\\n' + J([paAiCtxCount({}), paAiCtxCount(PA_FIXTURE.aiCtx)]),

  // --- หน้าจอ ---
  'ui.shell': () => { PAState.tab = 'rpt'; paBuildShell(); return view(); },
  'ui.list': async () => { PAState.tab = 'agreement'; PAState.view = 'list'; PAState.list = null; await renderPAListView(); await settle(); return document.getElementById('pa-tab-body')?.innerHTML ?? view(); },
  'ui.formEdit': async () => { PAState.tab = 'agreement'; PAState.view = 'form'; PAState.docId = 'a1'; PAState.doc = clone(PA_FIXTURE); PAState.doc.owner = OWNER_FIXTURE; await renderPAFormView(); await settle(); return document.getElementById('pa-tab-body').innerHTML; },
  'ui.formEditSubmitted': async () => { PAState.tab = 'agreement'; PAState.view = 'form'; PAState.docId = 'a1'; PAState.doc = { ...clone(PA_FIXTURE), status: 'submitted', owner: OWNER_FIXTURE }; await renderPAFormView(); await settle(); return document.getElementById('pa-tab-body').innerHTML; },
  'ui.formNew': async () => { PAState.tab = 'agreement'; PAState.view = 'form'; PAState.docId = null; PAState.doc = paNormalize({ fiscalYear: '2569', classroomTypes: { basic: true }, status: 'draft' }); await renderPAFormView(); await settle(); return document.getElementById('pa-tab-body').innerHTML + '\\n----\\n' + J(PAState.doc.load); },
  'ui.formLegacy': async () => { PAState.tab = 'agreement'; PAState.view = 'form'; PAState.docId = 'a0'; PAState.doc = clone(PA_LEGACY_FIXTURE); await renderPAFormView(); await settle(); return document.getElementById('pa-tab-body').innerHTML; },
  'ui.collect': async () => { PAState.tab = 'agreement'; PAState.view = 'form'; PAState.docId = 'a1'; PAState.doc = clone(PA_FIXTURE); await renderPAFormView(); await settle(); paCollectFormData(); return J(PAState.doc); },
  'ui.reportTab': async () => { PAState.tab = 'report'; PAState.previewId = 'a1'; await renderPAReportView(); await settle(); return document.getElementById('pa-tab-body')?.innerHTML ?? view(); },
  'ui.rptList': async () => { PAState.tab = 'rpt'; PARptState.view = 'list'; PARptState.list = null; await renderPARptView(); await settle(); return document.getElementById('pa-tab-body')?.innerHTML ?? view(); },
  'ui.rptForm': async () => { PAState.tab = 'rpt'; PARptState.view = 'form'; PARptState.docId = 'r1'; PARptState.doc = parptNormalize(clone(RPT_FIXTURE)); await renderPARptView(); await settle(); const h = document.getElementById('pa-tab-body')?.innerHTML ?? view(); parptCollect(); return h + '\\n----\\n' + J(PARptState.doc); },
  'ui.rptPreview': async () => { PAState.tab = 'rptprev'; PARptState.previewId = 'r1'; await renderPARptPreviewView(); await settle(); return document.getElementById('pa-tab-body')?.innerHTML ?? view(); },
  'ui.tabs': async () => {
    const seen = [];
    PAState.nextTab = null; await renderPAPage(); await settle();
    for (const t of [...cfg().tabs.map(x => x[0]), 'nope', 'agreement']) {
      await paSwitchTab(t); await settle();
      seen.push([t, PAState.tab, [...document.querySelectorAll('#pa-tabs .tab.active')].map(x => x.dataset.tab).join(), (document.getElementById('pa-tab-body')?.innerHTML || '').length]);
    }
    return J(seen);
  },

  // --- AI: พร้อต์ที่ส่งออก (จับที่ paAiGenerate ก่อนถึงเครือข่าย) ---
  'ai.prompts': async () => {
    PAState.tab = 'agreement'; PAState.view = 'form'; PAState.docId = 'a1'; PAState.doc = clone(PA_FIXTURE); await renderPAFormView(); await settle();
    const got = []; const real = paAiGenerate; paAiGenerate = async p => { got.push(p); return {}; };
    const sets = { part2: cfg().part2.map(f => ({ key: f.key, el: f.el, label: f.label, hint: f.hint })), work: paAiWorkSpecs(['1.1', '2.3', '3.3']), all: paAiWorkSpecs(null) };
    document.getElementById('pa-method').value = '1. ข้อความที่พิมพ์ค้าง';
    for (const [n, specs] of Object.entries(sets)) for (const mode of ['write', 'polish', 'shorten']) { got.push('### ' + n + ' / ' + mode); await paAiBatch(specs, mode, {}); }
    paAiGenerate = real;
    return got.join('\\n=====\\n');
  },
  'ai.ctxStorage': async () => {
    PAState.tab = 'agreement'; PAState.view = 'form'; PAState.docId = 'a1'; PAState.doc = clone(PA_FIXTURE); await renderPAFormView(); await settle();
    resetDb();
    const sel = document.getElementById('pa-ai-model'); const out = [paAiModelId()];
    sel.value = sel.options[sel.options.length - 1].value; sel.dispatchEvent(new Event('change')); out.push(paAiModelId(), document.querySelector('[data-model-hint]').textContent);
    document.getElementById('pa-ctx-level').value = 'ม.3'; await paAiCtxSave(null); out.push(J(paAiCtxLoadLocal()));
    PAState.docId = null; await paAiCtxSave(null);
    return J([out, lslog.slice(), dblog.slice(), toasts.slice()]);
  },

  // --- Firestore: path และฟิลด์ที่เขียน ---
  'db.paths': async () => {
    resetDb();
    PAState.docId = null; await paLoadList(); await paSave({ ...clone(PA_FIXTURE), id: 'x', createdAt: 1, _tmp: 1 });
    PAState.docId = 'a1'; await paSave(clone(PA_FIXTURE)); await paDelete('a1');
    PARptState.docId = null; await parptLoadList(); await parptSave({ ...clone(RPT_FIXTURE), id: 'y', _tmp: 1 });
    PARptState.docId = 'r1'; await parptSave(clone(RPT_FIXTURE)); await parptDelete('r1');
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
    const rules = read('firestore.rules');
    for (const [k, name] of Object.entries(C.collections)) ok(new RegExp(`match /${name}/\\{`).test(rules), `collections.${k} = ${name} มี match ใน firestore.rules`);
    ok(C.tabs.length === new Set(C.tabs.map(t => t[0])).size && C.tabs[0][0] === 'agreement', 'แท็บไม่ซ้ำ และแท็บแรกคือ agreement');
    const ids = C.workItems.flatMap(([, , items]) => items.map(i => i[0]));
    ok(ids.length === 15 && new Set(ids).size === 15, 'งานตามมาตรฐานตำแหน่งมี 15 ข้อ ไม่ซ้ำ');
    ok(ids.every(id => C.ai.prompts.scope[id]) && C.ai.prompts.scope.part2, 'ตาราง scope ของ AI ครอบคลุมครบทุกข้อ + part2');
    ok(JSON.stringify(Object.keys(C.aiCtx.fields).sort()) === JSON.stringify(Object.keys(C.aiCtx.maxLen).sort()), 'ช่องบริบท AI (fields) กับความยาวสูงสุด (maxLen) ตรงกัน');
    ok(C.ai.models.some(m => m.id === C.ai.model), 'รุ่น AI เริ่มต้นอยู่ในรายการรุ่นที่เลือกได้');
    ok(Object.values(C.ai.storageKeys).every(k => /^pa-ai-/.test(k)), 'คีย์ localStorage ของ AI ขึ้นต้น pa-ai-');
    const legacy = ['PA_TABS', 'PA_CLASSROOM_TYPES', 'PA_WORK_ITEMS', 'PA_LOAD_LISTS', 'PA_CTX_MAX', 'PA_AI_SYSTEM', 'PA_AI_MODE_TXT', 'PA_AI_PART2', 'PA_AI_WORK_HINTS', 'PA_AI_CTX_FIELDS', 'PA_AI_SCOPE'];
    const stray = ['js/pa.js', 'js/pa-ai.js', 'js/pa-rpt.js', 'js/pa-report.js'].flatMap(f => legacy.filter(n => new RegExp('\\b' + n + '\\b').test(read(f))).map(n => f + ':' + n))
      .concat(['js/pa.js', 'js/pa-ai.js', 'js/pa-rpt.js'].filter(f => /PA_AI\./.test(read(f)) || /'pa_(agreements|reports)'/.test(read(f))).map(f => f + ':literal'));
    ok(stray.length === 0, 'ไม่มีค่าคงที่ PA เดิมหรือชื่อ collection ค้างอยู่นอก PA_CONFIG', stray.join(', '));
    ok(bundleFiles()[0] === 'js/pa-config.js', 'pa-config.js ถูกโหลดก่อน pa.js ใน LAZY_BUNDLES.pa');
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

  console.log(`\nผลรวม: ผ่าน ${pass}, ไม่ผ่าน ${fail}`);
  process.exit(fail ? 1 : 0);
})();
