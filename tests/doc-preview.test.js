// ทดสอบโครงหน้า "ตัวอย่าง / พิมพ์" กลางใน js/doc-shell.js (docRenderPreview · docPaginate · docFitSheets · docWatchResize) ด้วย jsdom
// วิธีรัน: node tests/doc-preview.test.js   (หรือ npm run test:docprev)
// ตอน A  โครงกลางเดี่ยวๆ: สถานะว่าง · โหลดพัง · ล้าสมัย (สลับแท็บ/รอบ) · แถบเลือก/แก้ไข/พิมพ์ · iframe กระดาษ · mount · listener resize
// ตอน A2 ตัวตัดหน้ากลาง docPaginate (เลย์เอาต์ปลอม — jsdom วัดความสูงจริงไม่ได้) · docFitSheets · ขอบแผ่นตรงกับ @page
// ตอน B  หน้าตัวอย่าง ID-Plan จริง (idpRenderPreviewView) ผ่านโครงกลาง
// ตอน C  กันสำเนากลับมา: ไฟล์ระบบเอกสารไม่ฟัง resize / ตั้ง zoom / ตัดหน้าเอง · ไม่มี CSS .parp-* ใน JS
// (หน้าตัวอย่าง PA และรายงานผลถูกเทียบกับ golden ใน tests/pa-config.test.js อยู่แล้ว)
const fs = require('fs'), vm = require('vm'), path = require('path'); const { JSDOM } = require('jsdom');
const ROOT = process.env.PA_ROOT ? path.resolve(process.env.PA_ROOT) : path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let fail = 0; const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗', m); if (!c) fail++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

(async () => {
  // =============================== ตอน A ===============================
  console.log('A · docRenderPreview (โครงกลางเดี่ยวๆ)');
  const dom = new JSDOM('<!doctype html><body><div id="view"><div id="doc-tab-body"></div></div></body>', { url: 'http://localhost/' }); const w = dom.window;
  const body = () => w.document.getElementById('doc-tab-body');
  const switched = [];
  const ctx = {
    window: w, document: w.document, console, setTimeout, clearTimeout, Promise, JSON, Date, Math, Object, Array, Set, Map, String, Number, Error, RegExp, URL, Number,
    escapeHtml, showToast() {}, clearLoading() {}, requestAnimationFrame: f => setTimeout(f, 0), db: {},
  };
  vm.createContext(ctx);
  for (const f of ['js/doc-system.js', 'js/doc-shell.js']) vm.runInContext(read(f), ctx, { filename: f });
  const SHEET_A4 = vm.runInContext('DOC_SHEET_A4', ctx), PAGE_A4 = vm.runInContext('DOC_PAGE_A4', ctx); // const ระดับบนสุดไม่โผล่เป็น property ของ ctx
  // ตัดส่วนที่ผูกกับหน้าจริงออก (โครงหน้า/ตัวโหลด/สลับแท็บ) — ทดสอบเฉพาะตัวโครงตัวอย่าง
  ctx.docMount = () => body(); ctx.docShowLoading = () => {}; ctx.docSwapIn = () => { ctx.__swapped = (ctx.__swapped || 0) + 1; };
  ctx.docSwitchTab = t => { switched.push(t); };
  const sys = vm.runInContext(`registerDocSystem({ id: 't', title: 'T', collections: { a: 'ta' }, tabs: [['prev', 'ตัวอย่าง'], ['form', 'ฟอร์ม']] })`, ctx);
  sys.state.tab = 'prev';
  const render = o => ctx.docRenderPreview(Object.assign({ sys, tab: 'prev', selectLabel: 'เลือก', hint: () => 'คำแนะนำ', sheets: () => ({ html: () => '<p>กระดาษ</p>', specs: { port: SHEET_A4 } }), onPick() {}, onEdit() {}, onPrint() {}, empty: { icon: '<i>I</i>', title: 'ว่างจ้า', sub: 'ยังไม่มี', gotoLabel: 'ไปฟอร์ม', gotoTab: 'form' } }, o));
  const mk = (items, pickId, extra) => () => Promise.resolve(Object.assign({ items, pickId }, extra));

  { // สถานะว่าง
    body().innerHTML = ''; switched.length = 0;
    await render({ load: mk([], null) });
    ok(body().querySelector('.empty-title')?.textContent === 'ว่างจ้า' && !body().querySelector('.doc-preview-select'), 'items ว่าง → สถานะว่าง ไม่มีแถบเลือก');
    body().querySelector('.doc-preview-goto').click();
    ok(switched.join() === 'form', 'ปุ่มในสถานะว่าง → สลับไปแท็บ gotoTab');
  }
  { // โหลดพัง
    body().innerHTML = '';
    await render({ load: async () => { throw new Error('เน็ตหลุด <x>'); } });
    ok(/โหลดข้อมูลไม่สำเร็จ: เน็ตหลุด &lt;x&gt;/.test(body().innerHTML), 'load โยน error → การ์ดแจ้ง (escape ข้อความ)');
  }
  { // ล้าสมัยระหว่างโหลด
    let shown = 0;
    body().innerHTML = 'เดิม';
    await render({ load: async () => { sys.state.seq++; return { items: [{ id: 'a', label: 'A' }], pickId: 'a' }; }, shown: () => shown++ });
    ok(body().innerHTML === 'เดิม' && shown === 0, 'seq เปลี่ยนระหว่างรอ → ไม่วาดทับ ไม่เรียก shown');
    sys.state.tab = 'form'; body().innerHTML = 'เดิม';
    await render({ load: mk([{ id: 'a', label: 'A' }], 'a'), shown: () => shown++ });
    ok(body().innerHTML === 'เดิม' && shown === 0, 'สลับไปแท็บอื่นแล้ว → ไม่วาดทับ');
    sys.state.tab = 'form'; body().innerHTML = 'เดิม';
    await render({ load: async () => { throw new Error('x'); } });
    ok(body().innerHTML === 'เดิม', 'โหลดพังหลังสลับแท็บ → ไม่วาดการ์ด error ทับแท็บใหม่');
    sys.state.tab = 'prev';
  }
  { // วาดปกติ + ตัวจัดการ
    const calls = [];
    const c = { items: [{ id: 'a', label: 'แผน <1>' }, { id: 'b', label: 'แผน 2' }], pickId: 'b', extra: 7 };
    await render({
      load: async () => c, shown: x => calls.push(['shown', x === c, !body().querySelector('.doc-preview-bar')]),
      hint: x => `ต้องใช้ "PDF" <b> ${x.extra}`, afterHtml: () => '<em id="after">ท้าย</em>',
      onPick: id => calls.push(['pick', id]), onEdit: x => calls.push(['edit', x === c]), onPrint: (x, v) => calls.push(['print', x === c, v === body()]),
    });
    const opts = [...body().querySelectorAll('.doc-preview-select option')];
    ok(opts.length === 2 && opts[0].textContent === 'แผน <1>' && opts[1].selected && !opts[0].selected, 'ตัวเลือกครบ · เลือกตาม pickId · label ถูก escape');
    ok(body().querySelector('.doc-preview-select').getAttribute('aria-label') === 'เลือก', 'aria-label ของตัวเลือก');
    ok(body().querySelector('.doc-preview-hint').textContent === 'ต้องใช้ "PDF" <b> 7' && !body().querySelector('.doc-preview-hint b'), 'ข้อความแนะนำเป็นข้อความล้วน (ไม่ตีความเป็น HTML)');
    ok(calls[0][0] === 'shown' && calls[0][1] === true && calls[0][2] === true, 'shown(ctx) ถูกเรียกก่อนวาด');
    const fr = body().querySelector('.doc-preview-frame-wrap > iframe.doc-preview-frame');
    ok(fr && fr.getAttribute('srcdoc') === '<p>กระดาษ</p>' && body().querySelector('#after') && !body().querySelector('.doc-paper'), 'กระดาษเป็น iframe (.doc-preview-frame) ที่ได้ srcdoc จาก sheets(ctx).html() · afterHtml ต่อท้าย');
    const sel = body().querySelector('.doc-preview-select'); sel.value = 'a'; sel.dispatchEvent(new w.Event('change', { bubbles: true }));
    body().querySelector('.doc-preview-edit').click(); body().querySelector('.doc-preview-print').click();
    ok(JSON.stringify(calls.slice(1)) === JSON.stringify([['pick', 'a'], ['edit', true], ['print', true, true]]), 'เลือก/แก้ไข/พิมพ์ → เรียกตัวจัดการด้วยค่าที่ถูก');
  }
  { // mount
    const order = [];
    await render({
      load: mk([{ id: 'a', label: 'A' }], 'a'),
      mount: async (v, c) => { order.push(['mount-start', !!v.querySelector('.doc-preview-bar'), c.pickId]); await sleep(20); order.push('mount-end'); },
    });
    ok(JSON.stringify(order) === JSON.stringify([['mount-start', true, 'a'], 'mount-end']), 'mount ถูกเรียกหลังวาด และ docRenderPreview รอ mount จบ');
  }
  { // sheets เป็นออบเจ็กต์ตรงๆ ก็ได้ · การตัดหน้าไม่ถูกรอ (jsdom ไม่ยิง load ของ srcdoc — ถ้ารอ การ await นี้จะค้าง)
    let done = false;
    render({ load: mk([{ id: 'a', label: 'A' }], 'a'), sheets: { html: () => '<i>x</i>', specs: { port: SHEET_A4 } } }).then(() => { done = true; });
    await sleep(30);
    ok(done && body().querySelector('iframe.doc-preview-frame')?.getAttribute('srcdoc') === '<i>x</i>', 'sheets เป็นออบเจ็กต์ได้ · docRenderPreview ไม่รอ iframe โหลด/ตัดหน้า (แถบแสดงทันที)');
  }

  console.log('A2 · docPaginate (เลย์เอาต์ปลอม: แต่ละบล็อกบอกความสูงเองด้วย data-h · ความสูงแผ่น = 100)');
  {
    const dp = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' }); const pw = dp.window;
    const H = el => Number(el.dataset && el.dataset.h) || 0;
    const hOf = el => el.tagName === 'TABLE' ? [...el.querySelectorAll('tr')].reduce((a, r) => a + H(r), 0) : H(el);
    Object.defineProperty(pw.HTMLElement.prototype, 'scrollHeight', { get() { return this.classList.contains('doc-sheet-body') ? [...this.children].reduce((a, c) => a + hOf(c), 0) : 0; } });
    Object.defineProperty(pw.HTMLElement.prototype, 'clientHeight', { get() { return this.classList.contains('doc-sheet-body') ? 100 : 0; } });
    const SPECS = { port: { w: 210, h: 297, pad: [16, 14, 16, 14], label: 'A4 แนวตั้ง' }, land: { w: 297, h: 210, pad: [15, 15, 15, 15], label: 'A4 แนวนอน' } };
    const OPT = { specs: SPECS, bodyClass: 'pa1', keep: '.h,.k', breakSel: '.brk' };
    const run = (srcHtml, opt = {}) => {
      pw.document.documentElement.className = ''; pw.document.body.innerHTML = `<div id="doc-src">${srcHtml}</div><div id="doc-paper"></div>`;
      const n = ctx.docPaginate(pw.document, Object.assign({}, OPT, opt));
      const sheets = [...pw.document.querySelectorAll('.doc-sheet-body')];
      return { n, sheets, kids: sheets.map(b => [...b.children].map(c => c.className || c.tagName.toLowerCase()).join(',')) };
    };
    const blk = (h, cls = '') => `<div class="${cls}" data-h="${h}"></div>`;

    let r = run(`<div class="root">${blk(40, 'a')}${blk(40, 'b')}${blk(40, 'c')}</div>`);
    ok(r.n === 2 && r.kids[0] === 'a,b' && r.kids[1] === 'c', 'บล็อกเกินแผ่น → ขึ้นแผ่นใหม่ (40+40 | 40)');
    ok(pw.document.documentElement.classList.contains('paper-on'), 'ตัดเสร็จ → html.paper-on (ซ่อนต้นฉบับบนจอ)');
    ok([...pw.document.querySelectorAll('.doc-pgno')].map(x => x.textContent).join('|') === 'หน้า 1 / 2 · A4 แนวตั้ง|หน้า 2 / 2 · A4 แนวตั้ง', 'ป้ายใต้แผ่น "หน้า n / N · ขนาด"');
    const sh = pw.document.querySelector('.doc-sheet');
    ok(sh.style.width === '210mm' && sh.style.height === '297mm' && [sh.style.paddingTop, sh.style.paddingRight, sh.style.paddingBottom, sh.style.paddingLeft].join(' ') === '16mm 14mm 16mm 14mm' && sh.classList.contains('is-port'), 'ขนาดและขอบแผ่นมาจาก specs (มม.)');
    ok(r.sheets.every(b => b.classList.contains('pa1')), 'เนื้อในทุกแผ่นมี bodyClass (สไตล์ของแบบใช้ได้ทุกแผ่น)');

    r = run(`<div class="root">${blk(10, 'a')}<div class="brk"></div>${blk(10, 'b')}</div>`);
    ok(r.n === 2 && r.kids[0] === 'a' && r.kids[1] === 'b', 'ตัวบังคับขึ้นหน้าใหม่ (breakSel) → แผ่นใหม่ · ตัวมันเองไม่ถูกคัดลอก');
    r = run(`<div class="root"><div class="brk"></div>${blk(10, 'a')}</div>`);
    ok(r.n === 1 && r.kids[0] === 'a', 'breakSel ที่หัวแผ่นว่าง → ไม่เกิดแผ่นว่าง');

    r = run(`<div class="root">${blk(60, 'a')}${blk(30, 'h')}${blk(30, 'b')}</div>`);
    ok(r.n === 2 && r.kids[0] === 'a' && r.kids[1] === 'h,b', 'หัวข้อ (keep) ไม่ถูกทิ้งท้ายแผ่น → ตามเนื้อหาถัดไปไปแผ่นใหม่');
    r = run(`<div class="root">${blk(40, 'a')}${blk(30, 'h')}${blk(30, 'k')}${blk(30, 'b')}</div>`);
    ok(r.n === 2 && r.kids[0] === 'a' && r.kids[1] === 'h,k,b', 'หัวข้อซ้อนกันหลายชั้น (keep ติดกัน) ไปด้วยกันทั้งชุด');

    r = run(`<div class="root">${blk(20, 'a')}<style>.x{}</style><script>1</script>${blk(20, 'b')}</div>`);
    ok(r.kids[0] === 'a,b', '<style>/<script> ในต้นฉบับไม่ถูกคัดลอกลงแผ่น');

    const tbl = `<table class="t"><colgroup><col class="c1"><col class="c2"></colgroup><thead><tr data-h="10"><th>h</th></tr></thead><tbody>
      <tr data-h="30" id="r1"></tr><tr data-h="30" id="r2"></tr><tr class="grp" data-h="10" id="g"></tr><tr data-h="30" id="r3"></tr></tbody></table>`;
    r = run(`<div class="root">${blk(20, 'a')}${tbl}</div>`);
    const tabs = [...pw.document.querySelectorAll('.doc-sheet-body table')];
    const rowIds = t => [...t.tBodies[0].rows].map(x => x.id).join(',');
    ok(r.n === 2 && tabs.length === 2 && rowIds(tabs[0]) === 'r1,r2' && rowIds(tabs[1]) === 'g,r3', 'ตารางแบ่งทีละแถว · แถวหัวกลุ่ม (tr.grp) ท้ายแผ่นตามไปแผ่นใหม่ ไม่ถูกทิ้งตามลำพัง');
    ok(tabs.every(t => t.querySelector(':scope > colgroup col.c2') && t.tHead && t.tHead.rows.length === 1), 'ตารางต่อบนแผ่นใหม่ซ้ำทั้ง colgroup (ความกว้างคอลัมน์) และหัวตาราง');
    ok(tabs[1].classList.contains('t') && pw.document.querySelector('#doc-src table').tBodies[0].rows.length === 4, 'ตารางต่อคงคลาสเดิม · ต้นฉบับไม่ถูกแก้');

    r = run(`<div class="root">${blk(95, 'a')}${tbl.replace(/data-h="30"/g, 'data-h="10"')}</div>`); // ตารางเตี้ยพอดีแผ่นเดียว แต่แถวแรกไม่พอที่ท้ายแผ่นแรก
    const t2 = [...pw.document.querySelectorAll('.doc-sheet-body table')];
    ok(r.n === 2 && t2.length === 1 && r.kids[1] === 't' && rowIds(t2[0]) === 'r1,r2,g,r3', 'แถวแรกยังไม่พอที่ → ย้ายทั้งตารางไปแผ่นใหม่');

    r = run(`<div class="root"><section class="pg-port">${blk(10, 'a')}</section><section class="pg-land">${blk(10, 'b')}</section></div>`, { kindOf: s2 => s2.classList.contains('pg-land') ? 'land' : 'port' });
    const kinds = [...pw.document.querySelectorAll('.doc-sheet')].map(x => x.classList.contains('is-land') ? 'land' : 'port').join();
    ok(r.n === 2 && kinds === 'port,land' && pw.document.querySelectorAll('.doc-sheet')[1].style.width === '297mm', 'ต้นฉบับมี <section> → แต่ละ section เริ่มแผ่นใหม่ ชนิดตาม kindOf (แนวตั้ง/แนวนอน)');
    ok(ctx.docPaginate(pw.document.implementation.createHTMLDocument(''), OPT) === 0, 'ไม่มี #doc-src/#doc-paper → คืน 0 ไม่ error');
    r = run(`<div class="root"></div>`);
    ok(r.n === 1, 'ต้นฉบับว่าง → แผ่นเดียว (ไม่ error)');
  }

  console.log('A2 · docFitSheets');
  {
    const df = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' }); const fw = df.window;
    const mkFrame = (frameW, sheetW, scrollH, paperOn = true) => {
      const frame = fw.document.createElement('iframe'); fw.document.body.appendChild(frame);
      const d = frame.contentDocument; d.body.innerHTML = '<div id="doc-paper"><section class="doc-sheet"></section></div>';
      if (paperOn) d.documentElement.classList.add('paper-on');
      Object.defineProperty(frame, 'clientWidth', { value: frameW });
      Object.defineProperty(d.querySelector('.doc-sheet'), 'offsetWidth', { value: sheetW });
      Object.defineProperty(d.documentElement, 'scrollHeight', { value: scrollH });
      return { frame, paper: d.getElementById('doc-paper') };
    };
    const zoom = f => f.paper.style.getPropertyValue('--doc-zoom');
    let f = mkFrame(416, 794, 1500); ctx.docFitSheets(f.frame);
    ok(Math.abs(zoom(f) - (416 - 16) / 794) < 1e-3 && f.frame.style.getPropertyValue('--fit-h') === '1500px', 'กรอบแคบกว่าแผ่น → ย่อ (เผื่อขอบ 16px) และตั้งความสูง iframe = ความสูงเนื้อหา');
    f = mkFrame(1400, 794, 900); ctx.docFitSheets(f.frame);
    ok(zoom(f) === '1.0000', 'กรอบกว้างกว่าแผ่น → ไม่ขยายเกินขนาดจริง');
    f = mkFrame(0, 0, 100); ctx.docFitSheets(f.frame);
    ok(Number(zoom(f)) === 1, 'ยังไม่มีขนาด (แท็บซ่อน) → คง 1 ไม่ใส่ NaN');
    f = mkFrame(0, 794, 100); ctx.docFitSheets(f.frame);
    ok(Number.isFinite(Number(zoom(f))) && Number(zoom(f)) > 0 && zoom(f) !== '0.0000', 'กรอบกว้าง 0 → ไม่ใส่ NaN/0');
    f = mkFrame(400, 794, 900, false); ctx.docFitSheets(f.frame);
    ok(zoom(f) === '' && f.frame.style.getPropertyValue('--fit-h') === '', 'ยังไม่ตัดหน้า (ไม่มี paper-on) → ไม่แตะอะไร');
    let threw = false; try { ctx.docFitSheets({ contentDocument: null }); } catch (e) { threw = true; } ok(!threw, 'iframe ยังไม่มีเอกสาร → ไม่ error');
  }

  console.log('A2 · ขอบแผ่นบนจอตรงกับ @page ตอนพิมพ์');
  {
    const m = /@page\{size:A4;margin:(\d+)mm (\d+)mm\}/.exec(PAGE_A4);
    ok(m && JSON.stringify(SHEET_A4.pad) === JSON.stringify([+m[1], +m[2], +m[1], +m[2]]) && SHEET_A4.w === 210 && SHEET_A4.h === 297, 'DOC_SHEET_A4 = DOC_PAGE_A4 (A4 ขอบ 16/14 มม. — PA ทั้งตัวอย่างและตัวพิมพ์)');
  }

  console.log('A · docWatchResize');
  {
    const el = w.document.createElement('div'); w.document.body.appendChild(el);
    let n = 0; sys.state.tab = 'prev';
    ctx.docWatchResize(sys, 'prev', el, () => n++);
    const fire = () => w.dispatchEvent(new w.Event('resize'));
    fire(); fire(); ok(n === 2, 'ปรับขนาดหน้าต่าง → เรียก fn ทุกครั้งขณะยังอยู่แท็บนี้');
    sys.state.tab = 'form'; fire(); ok(n === 2, 'สลับไปแท็บอื่น → ไม่เรียก fn');
    sys.state.tab = 'prev'; fire(); ok(n === 2, 'กลับมาแท็บเดิมก็ไม่เรียกอีก (listener ถูกถอดแล้ว ไม่ซ้อนกับรอบใหม่)');
    let m = 0; ctx.docWatchResize(sys, 'prev', el, () => m++); el.remove(); fire(); fire();
    ok(m === 0, 'องค์ประกอบหลุดจากหน้า → ไม่เรียก fn และถอด listener');
  }

  // =============================== ตอน B ===============================
  console.log('B · หน้าตัวอย่าง ID-Plan จริง');
  {
    const dom2 = new JSDOM('<!doctype html><body><div id="view"></div></body>', { url: 'http://localhost/' }); const w2 = dom2.window;
    const PLANS = [{ id: 'p1', semester: '1', year: '2569', subjects: [{ name: 'ค21101', hours: 3 }] }, { id: 'p2', semester: '2', year: '2568' }];
    let plans = PLANS.slice(); const sw = []; let confirmAns = true, printed = 0;
    const q = () => { const o = { orderBy: () => o, get: async () => ({ docs: plans.map(p => ({ id: p.id, data: () => { const { id, ...r } = p; return r; } })) }) }; return o; };
    const PROFILE = { prefix: 'นาย', firstName: 'ทดสอบ', lastName: 'ตัวอย่าง', position: 'ครู', school: 'รร.' };
    const c2 = {
      window: w2, document: w2.document, console, setTimeout, clearTimeout, setInterval, clearInterval, navigator: { onLine: true }, location: { hostname: 'x' },
      db: { collection: () => ({ doc: () => ({ collection: () => q() }) }) }, AppState: { user: { uid: 'u1' }, teacherProfile: PROFILE },
      firebase: { firestore: { FieldValue: { serverTimestamp: () => 'TS' } }, app: () => ({ options: {} }) }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
      Promise, JSON, Date, Math, Object, Array, Set, Map, String, Number, Error, RegExp, URL, encodeURIComponent, escapeHtml,
      pageHeaderHtml: t => `<h1>${t}</h1>`, initNavPill() {}, clearLoading() {}, loaderHtml: () => '', _loadTimers: new Map(), showToast() {}, showLoading() {}, islandSave() {}, islandUndo() {},
      openModal() {}, closeModal() {}, confirm: () => confirmAns, requestAnimationFrame: f => setTimeout(f, 0), loadModule: async () => {}, loadModules: async () => {}, loadTeacherProfile: async () => PROFILE,
      ttTermLabel: () => 'ภาคเรียนที่ 1', navigate() {}, getComputedStyle: w2.getComputedStyle.bind(w2), CSS: { escape: s => s }, Event: w2.Event, HTMLElement: w2.HTMLElement,
    };
    vm.createContext(c2);
    for (const f of ['js/doc-system.js', 'js/doc-shell.js', 'js/idp-config.js', 'js/idp.js']) vm.runInContext(read(f), c2, { filename: f });
    c2.docSwitchTab = t => { sw.push(t); }; // ไม่ต้องวาดแท็บอื่นจริง
    const run = code => vm.runInContext(code, c2);
    const d = w2.document, tb = () => d.getElementById('doc-tab-body');
    run(`docActivate('idp'); docBuildShell(); docSystem('idp').state.tab = 'preview';`);
    const fireView = async (pick, wait = 40) => { run(`idpRenderPreviewView(${pick ? `'${pick}'` : ''})`); await sleep(wait); };

    // 1) ไม่มีแผนเปิดอยู่ + มีรายการบันทึกไว้
    run(`docSystem('idp').state.doc = null; docSystem('idp').state.view = 'list'; docSystem('idp').state.docId = null;`);
    await fireView();
    const opts = [...tb().querySelectorAll('.doc-preview-select option')];
    ok(opts.length === 2 && opts[0].textContent.includes('ภาคเรียนที่ 1 ปีการศึกษา 2569'), 'ตัวเลือก = แผนที่บันทึกไว้ (2 แผน)');
    ok(tb().querySelector('.doc-preview-frame-wrap > iframe.doc-preview-frame'), 'มี iframe ตัวอย่าง (.doc-preview-frame) ในกรอบ doc-preview-frame-wrap');
    ok(/id="doc-src"/.test(tb().querySelector('.doc-preview-frame').getAttribute('srcdoc')) && /id="doc-paper"/.test(tb().querySelector('.doc-preview-frame').getAttribute('srcdoc')), 'srcdoc ใช้โครงกลาง docSheetsHtml (#doc-src ต้นฉบับ + #doc-paper แผ่นกระดาษ)');
    ok(/idp1/.test(tb().querySelector('.doc-preview-frame').getAttribute('srcdoc') || ''), 'ใส่ srcdoc ของแผนที่เลือก (ตัวสร้างเอกสาร idpBuildPreviewHtml)');
    ok(/ค21101/.test(tb().querySelector('.doc-preview-frame').getAttribute('srcdoc') || ''), 'srcdoc เป็นข้อมูลของแผนแรก (มี ค21101)');

    // 2) เลือกแผนอื่น
    const sel = tb().querySelector('.doc-preview-select'); sel.value = 'p2'; sel.dispatchEvent(new w2.Event('change', { bubbles: true })); await sleep(40);
    ok(tb().querySelector('.doc-preview-select').value === 'p2' && !/ค21101/.test(tb().querySelector('.doc-preview-frame').getAttribute('srcdoc')), 'เลือกแผน 2 → วาดใหม่ด้วยแผน 2');

    // 3) แก้ไข: แผนอื่น (ไม่มีแผนเปิดอยู่) → เข้าฟอร์มด้วยแผนนั้น
    sw.length = 0; tb().querySelector('.doc-preview-edit').click();
    ok(sw.join() === 'form' && run(`docSystem('idp').state.docId`) === 'p2' && run(`docSystem('idp').state.view`) === 'form' && run(`docSystem('idp').state.doc.year`) === '2568', 'ปุ่มแก้ไขแผนอื่น → ตั้งแผนที่เปิด + เข้าแท็บฟอร์ม');

    // 4) มีแผนเปิดอยู่ (กำลังแก้) → อยู่หัวรายการ, เลือกแผนอื่นแล้วแก้ต้องยืนยัน
    await fireView();
    const o2 = [...tb().querySelectorAll('.doc-preview-select option')];
    ok(o2[0].value === 'p2' && /กำลังแก้ไข/.test(o2[0].textContent) && o2.length === 2, 'แผนที่เปิดอยู่มาก่อน (กำลังแก้ไข) ไม่ซ้ำกับรายการ');
    const s2 = tb().querySelector('.doc-preview-select'); s2.value = 'p1'; s2.dispatchEvent(new w2.Event('change', { bubbles: true })); await sleep(40);
    sw.length = 0; confirmAns = false; tb().querySelector('.doc-preview-edit').click();
    ok(sw.length === 0 && run(`docSystem('idp').state.docId`) === 'p2', 'แก้แผนอื่นขณะมีแผนเปิดอยู่ → ถามยืนยัน · ปฏิเสธ = ไม่เปลี่ยนอะไร');
    confirmAns = true; tb().querySelector('.doc-preview-edit').click();
    ok(sw.join() === 'form' && run(`docSystem('idp').state.docId`) === 'p1', 'ยืนยัน → แทนที่แผนที่เปิดอยู่');

    // 5) ฉบับที่ยังไม่บันทึก
    run(`docSystem('idp').state.doc = idpBlankDoc(); docSystem('idp').state.docId = null; docSystem('idp').state.view = 'form';`);
    await fireView();
    ok(/ฉบับที่ยังไม่บันทึก/.test(tb().querySelector('.doc-preview-select option').textContent), 'ฉบับที่ยังไม่บันทึกดูได้');

    // 6) พิมพ์ → iframe.print()
    const frame = tb().querySelector('.doc-preview-frame');
    Object.defineProperty(frame, 'contentWindow', { value: { focus() {}, print() { printed++; } } });
    tb().querySelector('.doc-preview-print').click(); ok(printed === 1, 'ปุ่มพิมพ์ → สั่ง print() ของ iframe');

    // 7) ไม่มีแผนเลย → สถานะว่างของ ID-Plan
    plans = []; run(`docSystem('idp').state.doc = null; docSystem('idp').state.view = 'list'; docSystem('idp').state.docId = null;`);
    await fireView(null, 40);
    ok(/ยังไม่มี ID-Plan/.test(tb().textContent) && !tb().querySelector('.doc-preview-select'), 'ไม่มีแผนเลย → สถานะว่าง "ยังไม่มี ID-Plan"');
    sw.length = 0; tb().querySelector('.doc-preview-goto').click(); ok(sw.join() === 'form', 'ปุ่มในสถานะว่าง → ไปแท็บฟอร์ม');
  }

  // =============================== ตอน C ===============================
  console.log('C · กันสำเนากลับมา');
  {
    const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
    const sysFiles = ['js/pa.js', 'js/pa-report.js', 'js/pa-rpt.js', 'js/idp.js'];
    const bad1 = sysFiles.filter(f => /addEventListener\(\s*['"]resize['"]/.test(strip(read(f))));
    ok(bad1.length === 0, 'ไฟล์ระบบเอกสารไม่ฟัง resize เอง (ใช้ docWatchResize)' + (bad1.length ? ' — พบที่: ' + bad1.join(', ') : ''));
    const bad2 = sysFiles.filter(f => /\.style\.zoom\s*=/.test(strip(read(f))));
    ok(bad2.length === 0, 'ไม่ตั้ง el.style.zoom เอง (โครงกลาง docFitSheets ตั้ง --doc-zoom ให้)' + (bad2.length ? ' — พบที่: ' + bad2.join(', ') : ''));
    const bad3 = sysFiles.filter(f => /\.parp-(bar|paper|actions|hint|select)\b/.test(read(f)) || /parp-(bar|paper|actions|hint)/.test(strip(read(f))));
    ok(bad3.length === 0, 'ไม่มีคลาสแถบ/กระดาษชุดเก่า (.parp-bar/.parp-paper/…) ในโค้ด' + (bad3.length ? ' — พบที่: ' + bad3.join(', ') : ''));
    const css = read('css/style.css');
    ok(!/\.doc-paper\b|--fit-zoom/.test(css), 'css/style.css ไม่มีกระดาษแทรกในหน้าชุดเก่า (.doc-paper · --fit-zoom) แล้ว — ทุกหน้าใช้แผ่นใน iframe');
    const bad4 = sysFiles.filter(f => /function\s+\w*(Paginate|FitPaper)\b/.test(strip(read(f))) || /id=["']\w*-(src|paper)["']/.test(strip(read(f))));
    ok(bad4.length === 0, 'ไฟล์ระบบเอกสารไม่เขียนตัวตัดหน้า/ย่อกระดาษเอง (ใช้ docPaginate/docFitSheets) และไม่ตั้ง id แผ่นกระดาษเอง' + (bad4.length ? ' — พบที่: ' + bad4.join(', ') : ''));
    ok(!/docFitPaper|fitPage/.test(strip(read('js/doc-shell.js'))), 'doc-shell.js ไม่เหลือ docFitPaper/fitPage');
    ok(/\.parp-legacy\s*\{/.test(css) && /\.parp-legacy-text\s*\{/.test(css), 'สไตล์กล่อง "ข้อมูลแบบเดิม" ย้ายมาอยู่ใน css/style.css แล้ว');
    const fs2 = read('js/doc-shell.js');
    ok(/docRenderPreview/.test(read('js/pa-report.js')) && /docRenderPreview/.test(read('js/pa-rpt.js')) && /docRenderPreview/.test(read('js/idp.js')), 'ทั้งสามหน้าตัวอย่างเรียก docRenderPreview');
    const styleTags = f => (strip(read(f)).match(/<style>[\s\S]*?<\/style>/g) || []);
    const barCssInJs = ['js/pa-report.js', 'js/pa-rpt.js', 'js/idp.js'].filter(f => styleTags(f).some(t => /\.parp-|\.doc-paper|\.doc-preview/.test(t)));
    ok(barCssInJs.length === 0, 'ไม่มีสไตล์แถบ/กระดาษตัวอย่าง (.parp-* · .doc-paper · .doc-preview-*) ฝังใน <style> ของ JS — อยู่ใน css/style.css' + (barCssInJs.length ? ' — พบที่: ' + barCssInJs.join(', ') : ''));
    ok(fs2.length > 0, 'doc-shell.js อ่านได้');
  }

  console.log(fail ? `\nไม่ผ่าน ${fail}` : '\nALL PASS');
  process.exit(fail ? 1 : 0);
})();
