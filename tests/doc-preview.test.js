// ทดสอบโครงหน้า "ตัวอย่าง / พิมพ์" กลางใน js/doc-shell.js (docRenderPreview · docFitPaper · docWatchResize) ด้วย jsdom
// วิธีรัน: node tests/doc-preview.test.js   (หรือ npm run test:docprev)
// ตอน A  โครงกลางเดี่ยวๆ: สถานะว่าง · โหลดพัง · ล้าสมัย (สลับแท็บ/รอบ) · แถบเลือก/แก้ไข/พิมพ์ · fitPage · mount · ย่อกระดาษ · listener resize
// ตอน B  หน้าตัวอย่าง ID-Plan จริง (idpRenderPreviewView) ผ่านโครงกลาง
// ตอน C  กันสำเนากลับมา: ไฟล์ระบบเอกสารไม่ฟัง resize / ตั้ง zoom เอง · ไม่มี CSS .parp-* ใน JS
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
  // ตัดส่วนที่ผูกกับหน้าจริงออก (โครงหน้า/ตัวโหลด/สลับแท็บ) — ทดสอบเฉพาะตัวโครงตัวอย่าง
  ctx.docMount = () => body(); ctx.docShowLoading = () => {}; ctx.docSwapIn = () => { ctx.__swapped = (ctx.__swapped || 0) + 1; };
  ctx.docSwitchTab = t => { switched.push(t); };
  const sys = vm.runInContext(`registerDocSystem({ id: 't', title: 'T', collections: { a: 'ta' }, tabs: [['prev', 'ตัวอย่าง'], ['form', 'ฟอร์ม']] })`, ctx);
  sys.state.tab = 'prev';
  const render = o => ctx.docRenderPreview(Object.assign({ sys, tab: 'prev', selectLabel: 'เลือก', hint: () => 'คำแนะนำ', paperHtml: () => '<p>กระดาษ</p>', onPick() {}, onEdit() {}, onPrint() {}, empty: { icon: '<i>I</i>', title: 'ว่างจ้า', sub: 'ยังไม่มี', gotoLabel: 'ไปฟอร์ม', gotoTab: 'form' } }, o));
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
    ok(body().querySelector('#after') && body().querySelector('p') && !body().querySelector('.doc-paper'), 'ไม่ใส่ fitPage → กระดาษแทรกตรงๆ ไม่ห่อ .doc-paper · afterHtml ต่อท้าย');
    const sel = body().querySelector('.doc-preview-select'); sel.value = 'a'; sel.dispatchEvent(new w.Event('change', { bubbles: true }));
    body().querySelector('.doc-preview-edit').click(); body().querySelector('.doc-preview-print').click();
    ok(JSON.stringify(calls.slice(1)) === JSON.stringify([['pick', 'a'], ['edit', true], ['print', true, true]]), 'เลือก/แก้ไข/พิมพ์ → เรียกตัวจัดการด้วยค่าที่ถูก');
  }
  { // fitPage + mount
    const order = [];
    await render({
      load: mk([{ id: 'a', label: 'A' }], 'a'), fitPage: '.pg', paperHtml: () => '<div class="pg" id="pgx">หน้า</div>',
      mount: async (v, c) => { order.push(['mount-start', !!v.querySelector('.doc-preview-bar'), c.pickId]); await sleep(20); order.push('mount-end'); },
    });
    ok(body().querySelector('.doc-paper > #pgx'), 'ใส่ fitPage → ห่อกระดาษด้วย .doc-paper');
    ok(JSON.stringify(order) === JSON.stringify([['mount-start', true, 'a'], 'mount-end']), 'mount ถูกเรียกหลังวาด และ docRenderPreview รอ mount จบ');
  }

  console.log('A · docFitPaper');
  {
    const mkBox = (cw, ow, withPage = true) => {
      const box = w.document.createElement('div'); const pg = w.document.createElement('div'); pg.className = 'pg';
      Object.defineProperty(box, 'clientWidth', { value: cw }); Object.defineProperty(pg, 'offsetWidth', { value: ow });
      if (withPage) box.appendChild(pg); return box;
    };
    const z = b => b.style.getPropertyValue('--fit-zoom');
    let b = mkBox(397, 794); ctx.docFitPaper(b, '.pg'); ok(Math.abs(z(b) - 0.5) < 1e-6, 'กล่องแคบกว่ากระดาษ → ย่อตามสัดส่วน (0.5)');
    b = mkBox(1200, 794); ctx.docFitPaper(b, '.pg'); ok(z(b) === '1', 'กล่องกว้างกว่ากระดาษ → ไม่ขยายเกินขนาดจริง (1)');
    b = mkBox(0, 0); ctx.docFitPaper(b, '.pg'); ok(z(b) === '1', 'ยังไม่มีขนาด (0/0 = NaN) → คง 1 ไม่ใส่ NaN');
    b = mkBox(0, 794); ctx.docFitPaper(b, '.pg'); ok(z(b) === '1', 'กล่องกว้าง 0 → คง 1 (ไม่ย่อจนหาย)');
    let threw = false; try { ctx.docFitPaper(mkBox(1, 1, false), '.pg'); ctx.docFitPaper(null, '.pg'); } catch (e) { threw = true; } ok(!threw, 'ไม่มีหน้ากระดาษ/ไม่มีกล่อง → ไม่ error');
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
    ok(tb().querySelector('#idp-preview-frame')?.classList.contains('doc-preview-frame'), 'มี iframe ตัวอย่าง (#idp-preview-frame) ในกรอบ doc-preview-frame-wrap');
    ok(!tb().querySelector('.doc-paper'), 'ID-Plan ไม่ห่อ .doc-paper (กระดาษเป็น iframe ตัดหน้าเอง)');
    ok(/idp1/.test(tb().querySelector('#idp-preview-frame').getAttribute('srcdoc') || ''), 'ใส่ srcdoc ของแผนที่เลือก (ตัวสร้างเอกสาร idpBuildPreviewHtml)');
    ok(/ค21101/.test(tb().querySelector('#idp-preview-frame').getAttribute('srcdoc') || ''), 'srcdoc เป็นข้อมูลของแผนแรก (มี ค21101)');

    // 2) เลือกแผนอื่น
    const sel = tb().querySelector('.doc-preview-select'); sel.value = 'p2'; sel.dispatchEvent(new w2.Event('change', { bubbles: true })); await sleep(40);
    ok(tb().querySelector('.doc-preview-select').value === 'p2' && !/ค21101/.test(tb().querySelector('#idp-preview-frame').getAttribute('srcdoc')), 'เลือกแผน 2 → วาดใหม่ด้วยแผน 2');

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
    const frame = tb().querySelector('#idp-preview-frame');
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
    ok(bad2.length === 0, 'ไม่ตั้ง el.style.zoom เอง (ใช้ docFitPaper → --fit-zoom ใน CSS)' + (bad2.length ? ' — พบที่: ' + bad2.join(', ') : ''));
    const bad3 = sysFiles.filter(f => /\.parp-(bar|paper|actions|hint|select)\b/.test(read(f)) || /parp-(bar|paper|actions|hint)/.test(strip(read(f))));
    ok(bad3.length === 0, 'ไม่มีคลาสแถบ/กระดาษชุดเก่า (.parp-bar/.parp-paper/…) ในโค้ด' + (bad3.length ? ' — พบที่: ' + bad3.join(', ') : ''));
    const css = read('css/style.css');
    ok(/\.doc-paper\s*\{/.test(css) && /\.doc-paper \.pa1\s*\{[^}]*zoom:\s*var\(--fit-zoom/.test(css), 'css/style.css มี .doc-paper และ .pa1 ใช้ zoom: var(--fit-zoom)');
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
