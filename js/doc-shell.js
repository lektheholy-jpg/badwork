// ==========================================================================
// DocShell — ส่วนกลางของหน้า "ระบบเอกสาร" (ใช้ร่วมกันทุกระบบ: PA · ต่อไปคือ ID-Plan)
//   • โครงหน้า: หัวเรื่อง + แท็บ (จาก config.tabs ของระบบ) + พื้นที่เนื้อหา #doc-tab-body
//   • สลับแท็บ / ตัวโหลด / ตรวจเรนเดอร์ล้าสมัย (docStale) / จางเข้า (docSwapIn)
//   • ตัวช่วยร่วม: ปีงบประมาณ · วันที่ไทย · ตัวเลข/ชั่วโมง · ไอคอน · ป้ายสถานะ · ฟอนต์พิมพ์
//
// สิ่งที่ระบบหนึ่งต้องทำเพื่อใช้โครงนี้ (ดู js/pa.js ท้ายไฟล์เป็นตัวอย่าง)
//   1) ลงทะเบียน config ที่ js/doc-system.js:  registerDocSystem(CONFIG)   (id · title · collections · tabs …)
//   2) ลงทะเบียนตัวเรนเดอร์ของแท็บ:
//        registerDocUi('id', { tabs: { รหัสแท็บ: sys => render…(), default: sys => render…() }, beforeLeave(sys) {…} })
//      tabs.default ใช้กับแท็บที่ไม่ได้ระบุ · beforeLeave (ไม่บังคับ) เรียกก่อนสลับแท็บ เพื่อเก็บค่าฟอร์มที่พิมพ์ค้าง
//   3) จุดเข้าของหน้า: renderDocPage('id')   (app.js เรียกตาม route)
//
// โหลดหลัง js/doc-system.js และก่อนไฟล์ของแต่ละระบบเสมอ (LAZY_BUNDLES ใน js/utils.js)
// ==========================================================================

const DOC_UI = {};
function registerDocUi(id, ui) {
  if (!ui || !ui.tabs || typeof ui.tabs.default !== 'function') throw new Error(`UI ของระบบเอกสาร "${id}" ไม่ครบ (ต้องมี tabs.default)`);
  if (DOC_UI[id]) throw new Error(`UI ของระบบเอกสาร "${id}" ลงทะเบียนซ้ำ`);
  DOC_UI[id] = ui;
  return ui;
}
function docUi(id) {
  const ui = DOC_UI[id];
  if (!ui) throw new Error(`ระบบเอกสาร "${id}" ยังไม่ได้ลงทะเบียน UI (registerDocUi)`);
  return ui;
}

// ------------------------------------------------------------------
// ปีงบประมาณเริ่ม 1 ต.ค. (ต.ค.–ธ.ค. นับเป็นปีงบประมาณถัดไป)
function docFiscalYear(d = new Date()) { return d.getFullYear() + 543 + (d.getMonth() >= 9 ? 1 : 0); }

const DOC_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
function docThaiDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${+m[3]} ${DOC_MONTHS[+m[2] - 1] || ''} ${+m[1] + 543}` : '';
}
function docNum(v) {
  const n = parseFloat(String(v ?? '').replace(/[๐-๙]/g, c => String(c.charCodeAt(0) - 0x0E50)).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
}
const docFmtH = n => String(Math.round((Number(n) || 0) * 100) / 100);
const docSum = rows => (rows || []).reduce((s, r) => s + (Number(r.hours) || 0), 0);
const docNl = s => escapeHtml(s || '').replace(/\n/g, '<br>');

// ------------------------------------------------------------------
// ไอคอน SVG
// ------------------------------------------------------------------
const DOC_ICO_ADD   = `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>`;
const DOC_ICO_EDIT  = `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M16.2 3.6a2.4 2.4 0 0 1 3.4 0l.8.8a2.4 2.4 0 0 1 0 3.4L9.5 18.7a2 2 0 0 1-.9.5l-4.3 1.1a.8.8 0 0 1-1-1l1.1-4.3c.1-.3.3-.6.5-.9Z"/></svg>`;
const DOC_ICO_DEL   = `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
const DOC_ICO_PRINT = `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6"/><path d="M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2"/><rect x="6" y="14" width="12" height="7" rx="1"/></svg>`;
const DOC_ICO_COPY  = `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>`;

// ------------------------------------------------------------------
// ป้ายสถานะ
// ------------------------------------------------------------------
function docStatusBadge(status) {
  if (status === 'submitted') return `<span class="badge badge-success">ส่งแล้ว</span>`;
  return `<span class="badge badge-neutral">ร่าง</span>`;
}

// ฟอนต์สำรองเมื่อเครื่องไม่มี TH Sarabun PSK (ตัวที่แบบราชการใช้): Sarabun (OFL) เก็บไว้ใน assets/fonts
// size-adjust 65.4% = ความกว้างตัวอักษรเท่า TH Sarabun PSK ที่ขนาดเดียวกัน (วัดจากแบบ PA ตัวจริง) → ตัดบรรทัด/จำนวนหน้าใกล้เคียงฟอร์มราชการ
function docFontCss() {
  const base = (typeof document !== 'undefined' && document.baseURI) || '';
  const u = f => `url(${base ? new URL('assets/fonts/' + f, base).href : 'assets/fonts/' + f}) format('woff2')`;
  const th = 'U+0E01-0E5B,U+200C-200D,U+25CC';
  const la = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2212,U+FEFF';
  const ff = (w, st, f, r) => `@font-face{font-family:'PA Sarabun';font-weight:${w};font-style:${st};size-adjust:65.4%;font-display:swap;src:${u(f)};unicode-range:${r}}`;
  return [
    ff(400, 'normal', 'sarabun-thai-400-normal.woff2', th), ff(700, 'normal', 'sarabun-thai-700-normal.woff2', th), ff(400, 'italic', 'sarabun-thai-400-italic.woff2', th),
    ff(400, 'normal', 'sarabun-latin-400-normal.woff2', la), ff(700, 'normal', 'sarabun-latin-700-normal.woff2', la),
  ].join('');
}

// ------------------------------------------------------------------
// โครงหน้า: หัวเรื่อง + แท็บ (แบบฟอร์มข้อตกลง | ตัวอย่าง/พิมพ์) + พื้นที่เนื้อหา
// ปุ่มเมนูข้างปุ่มเดียว (pa-page) เปิดหน้านี้ — สลับสองมุมมองด้วยแท็บโดยไม่วาดทั้งหน้าใหม่
// ------------------------------------------------------------------

function docBuildShell() {
  const sys = docSystem();
  const view = document.getElementById('view');
  view.innerHTML = `
    ${pageHeaderHtml(sys.config.title)}
    <div class="tabs" id="doc-tabs" role="tablist">
      ${sys.config.tabs.map(([id, label]) => `<div class="tab ${sys.state.tab === id ? 'active' : ''}" data-tab="${id}" role="tab" aria-selected="${sys.state.tab === id}" tabindex="0">${label}</div>`).join('')}
    </div>
    <div id="doc-tab-body"></div>`;
  const tabs = view.querySelector('#doc-tabs');
  initNavPill(tabs, '.tab', 'seg-pill');
  tabs.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('mousedown', e => e.preventDefault()); // กดด้วยเมาส์/นิ้วไม่ต้องรับโฟกัสเลย — ไม่มีกรอบ .tab:focus-visible สีน้ำเงินวาบตอนกด (คีย์บอร์ดยัง Tab/Enter ได้ตามเดิม)
    t.addEventListener('click', () => {
      t.blur(); // คลิกด้วยเมาส์/นิ้วแล้วไม่ต้องค้างกรอบโฟกัสสีน้ำเงิน (.tab:focus-visible) — ผู้ใช้คีย์บอร์ดกด Enter/Space ทางด้านล่างยังโฟกัสอยู่ตามเดิม
      docSwitchTab(t.dataset.tab);
    });
    t.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); docSwitchTab(t.dataset.tab); }
    });
  });
}

// พื้นที่เนื้อหาของแท็บ — ถ้ายังไม่มีโครง (เช่นถูกเรียกก่อน renderDocPage) ให้สร้างให้
function docMount() {
  const view = document.getElementById('view');
  if (!view.querySelector('#doc-tab-body')) docBuildShell();
  return view.querySelector('#doc-tab-body');
}

// เนื้อหาใหม่มาแล้ว: ยกเลิกตัวโหลด + จางเข้าเฉพาะพื้นที่เนื้อหา (แท็บไม่กะพริบ)
// มาจากการกดสลับแท็บ (เนื้อหาเดิมถูกหรี่ .is-switching อยู่ที่ 0.5) → จางเข้าต่อจาก 0.5 ไม่ให้วูบไปโปร่งใสแล้วค่อยขึ้น
// ผู้เรียกห้ามถอด .is-switching เองก่อนเรียกฟังก์ชันนี้ ไม่งั้นแยกไม่ออกว่ามาจากการกดแท็บ
function docSwapIn(body) {
  clearLoading(body);
  const fromDim = body.classList.contains('is-switching');
  body.classList.remove('is-switching', 'tab-swap', 'tab-swap-dim');
  void body.offsetWidth; // รีสตาร์ทแอนิเมชันถ้าสลับซ้ำเร็วๆ
  body.classList.add(fromDim ? 'tab-swap-dim' : 'tab-swap');
}

// ตัวโหลดของหน้า PA — แก้อาการวาบตอนกดสลับแท็บ/เปิดหน้า
//   เดิมใช้ showLoading() ซึ่งหลัง 180ms จะเอาเนื้อหาเดิมไปเปลี่ยนเป็นโครง skeleton (มีก้อนทรงปุ่มสีฟ้า)
//   แล้วเนื้อหาจริงมาทับอีกที = วาบ 2 จังหวะ ทั้งที่รออยู่แค่แป๊บเดียว
//   • มีเนื้อหาเดิมอยู่ (กดสลับแท็บ): ไม่ต้องทำอะไร — docSwitchTab หรี่เนื้อหาเดิม (.is-switching) ค้างไว้อยู่แล้ว
//   • พื้นที่ว่าง (เปิดหน้า PA ครั้งแรก): รอ 450ms ก่อนค่อยโชว์ skeleton ถ้าข้อมูลมาเร็วกว่านั้นจะไม่เห็นเลย
const DOC_LOAD_DELAY_MS = 450;
function docShowLoading(view) {
  if (!view) return;
  clearLoading(view);
  if (view.firstChild) return;
  _loadTimers.set(view, setTimeout(() => {
    _loadTimers.delete(view);
    if (view.isConnected && !view.firstChild) view.innerHTML = loaderHtml('list');
  }, DOC_LOAD_DELAY_MS));
}

// เรนเดอร์นี้ล้าสมัยแล้วหรือยัง: ออกจากหน้าไปแล้ว หรือมีการกดสลับแท็บรอบใหม่ระหว่างรอข้อมูล
// sys = ระบบที่เรนเดอร์รอบนั้นถืออยู่ (ส่งต่อจากตัวแปร sys ของฟังก์ชันเรนเดอร์ ไม่ใช้ระบบที่กำลังแสดงตอนนี้ — กันผลค้างของอีกระบบมาเทียบเลขรอบผิดตัว)
function docStale(view, seq, sys = docSystem()) { return !view.isConnected || sys.state.seq !== seq; }

function docRenderTab() {
  const sys = docSystem();
  sys.state.seq++; // รอบใหม่ — เรนเดอร์ที่ยังค้างจากรอบก่อนจะถูกมองว่าล้าสมัย
  const ui = docUi(sys.id);
  const fn = ui.tabs[sys.state.tab] || ui.tabs.default; // ตัวเรนเดอร์ของแท็บ (ระบบลงทะเบียนเองด้วย registerDocUi)
  return fn(sys);
}

async function docSwitchTab(tab) {
  const sys = docSystem();
  if (tab === sys.state.tab || !sys.config.tabs.some(t => t[0] === tab)) return;
  // กำลังกรอกฟอร์มอยู่: ให้ระบบเก็บค่าที่พิมพ์ค้างไว้ก่อนสลับแท็บ (ui.beforeLeave ของแต่ละระบบ)
  docUi(sys.id).beforeLeave?.(sys);
  sys.state.tab = tab;
  const tabs = document.getElementById('doc-tabs');
  tabs?.querySelectorAll('.tab').forEach(x => {
    const on = x.dataset.tab === tab;
    x.classList.toggle('active', on);
    x.setAttribute('aria-selected', String(on));
  });
  tabs?.__pillPlace?.(true);
  const body = document.getElementById('doc-tab-body');
  body?.classList.add('is-switching'); // หรี่เนื้อหาเดิมทันที ระหว่างรอข้อมูล
  try {
    await docRenderTab();
  } catch (err) {
    // เรนเดอร์พัง: ถ้าไม่ถอดตรงนี้เนื้อหาจะค้างหรี่และกดอะไรไม่ได้ (pointer-events: none)
    console.error(`${sys.id} tab render failed`, err);
    if (body && body.isConnected) { clearLoading(body); body.classList.remove('is-switching'); }
    if (typeof showToast === 'function') showToast('เปิดแท็บไม่สำเร็จ ลองกดอีกครั้ง');
  }
}

// ------------------------------------------------------------------
// renderDocPage — จุดเข้าของหน้าระบบเอกสาร (เรียกจาก app.js ตาม route)
// ------------------------------------------------------------------
async function renderDocPage(id) {
  const sys = docActivate(id); // ตั้งให้ระบบนี้เป็นระบบที่กำลังแสดง
  sys.state.tab = sys.state.nextTab || sys.config.tabs[0][0]; // กดจากเมนูข้าง = เริ่มที่แท็บแรก (ยกเว้นมีคนขอแท็บอื่นผ่าน state.nextTab)
  sys.state.nextTab = null;
  sys.state.view = 'list';
  docBuildShell();
  // ห้าม await ข้อมูลตรงนี้: drawRoute (app.js) เล่นเฟดเข้าทั้งหน้าเมื่อฟังก์ชันนี้ resolve
  // ถ้ารอข้อมูลก่อน หัวเรื่อง+แท็บจะโผล่ แล้วดับเป็นโปร่งใส แล้วเฟดเข้าใหม่ (วาบ) และคนจะเห็นหน้าเปล่าค้าง
  // → ปล่อยให้โครงหน้าเฟดเข้าทันที ส่วนเนื้อหาในแท็บโหลดต่อและเฟดเข้าเองด้วย docSwapIn
  docRenderTab().catch(err => {
    console.error(`${sys.id} render failed`, err);
    const body = document.getElementById('doc-tab-body');
    if (body && body.isConnected) { clearLoading(body); body.classList.remove('is-switching'); }
    if (typeof showToast === 'function') showToast('เปิดหน้าไม่สำเร็จ ลองกดอีกครั้ง');
  });
}
