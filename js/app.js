// ==========================================================================
// Router
// ==========================================================================

const navPills = []; // ฟังก์ชันวางแถบเลื่อนของเมนูข้าง/แถบล่าง (สร้างใน initNavPill)

// แถบสีเลื่อนไปหาปุ่มที่ active — ใช้กับเมนูข้าง แถบเมนูล่าง และแท็บ/ห้อง/ตัวเลือกสลับในหน้า
//   opt.activeSel  ตัวเลือกของปุ่ม active (ค่าเริ่มต้น '.active'; ตัวเลือกสลับใช้ '[aria-pressed="true"]')
//   opt.key        ระบุเมื่อหน้านั้นวาด container ใหม่ทุกครั้งที่กด (innerHTML) — เรียก pillSlideNext(key) ก่อนวาด
//                  แถบใหม่จะเริ่มจากตำแหน่งเดิมแล้วเลื่อนไปที่ใหม่ แทนการโผล่ทันที
//   opt.watch      true = เฝ้าดู aria-pressed ที่เปลี่ยนในที่เดิม (ไม่ต้องวาดใหม่) แล้วเลื่อนตาม
//   opt.colorVar   ชื่อตัวแปรสีบนปุ่ม active ที่แถบจะยืมไปใช้เป็น --w (ค่าเริ่มต้น '--w')
//   opt.global     true = ลงทะเบียนให้ setActiveNav สั่งเลื่อน (เมนูข้าง/ล่างเท่านั้น)
const pillGeom = {}, pillPending = {};
function pillSlideNext(key) { pillPending[key] = true; }

function initNavPill(container, itemSel, cls, opt = {}) {
  if (!container) return;
  const { activeSel = '.active', key = null, watch = false, global = false, colorVar = '--w' } = opt;
  const pill = document.createElement('span');
  pill.className = cls; pill.setAttribute('aria-hidden', 'true');
  container.prepend(pill);
  const apply = g => {
    pill.style.width = g.w + 'px';
    pill.style.height = g.h + 'px';
    pill.style.transform = `translate(${g.x}px, ${g.y}px)`;
  };
  const place = (animate) => {
    const t = container.querySelector(itemSel + activeSel);
    if (!t || !t.offsetWidth) { pill.style.opacity = '0'; return; } // ไม่มีปุ่ม active หรือเมนูถูกซ่อนอยู่
    const g = { x: t.offsetLeft, y: t.offsetTop, w: t.offsetWidth, h: t.offsetHeight };
    pill.style.setProperty('--w', getComputedStyle(t).getPropertyValue(colorVar));
    pill.style.opacity = '1';
    if (!pill.dataset.placed) {
      pill.dataset.placed = '1';
      pill.classList.add('no-anim'); // ครั้งแรก: วางทันที ไม่เลื่อนมาจากมุม
      const from = key && pillPending[key] && pillGeom[key];
      if (key) pillPending[key] = false;
      apply(from || g);
      if (from) { void pill.offsetWidth; pill.classList.remove('no-anim'); apply(g); } // หน้าวาดใหม่: เลื่อนจากตำแหน่งเดิม
    } else {
      pill.classList.toggle('no-anim', !animate); // ปรับขนาดจอ: วางทันที
      apply(g);
    }
    if (key) pillGeom[key] = g;
  };
  if (typeof ResizeObserver === 'function') {
    let lw = container.offsetWidth, lh = container.offsetHeight;
    new ResizeObserver(() => {
      if (container.offsetWidth === lw && container.offsetHeight === lh) return; // observer ยิงครั้งแรกตอนเริ่มโดยขนาดไม่เปลี่ยน — ห้ามวางทับจนการเลื่อนที่กำลังเล่นถูกยกเลิก
      lw = container.offsetWidth; lh = container.offsetHeight;
      place(false);
    }).observe(container);
  }
  container.__pillPlace = place; // ให้โค้ดหน้าสั่งเลื่อนทันทีตอนกด (ก่อนข้อมูลใหม่มา)
  if (watch && typeof MutationObserver === 'function') {
    new MutationObserver(() => place(true)).observe(container, { attributes: true, subtree: true, attributeFilter: ['aria-pressed', 'aria-selected'] });
  }
  if (global) navPills.push(place);
  place(false);
}

function setActiveNav(routeId) {
  if (typeof islandSetPage === 'function') islandSetPage(routeId || AppState.currentRoute); // ชื่อหน้าบน Dynamic Island (หน้าในวิชา routeId=null → ใช้ currentRoute)
  document.querySelectorAll('.nav-item[data-route], .user-chip[data-route]').forEach(el => {
    el.classList.toggle('active', el.dataset.route === routeId);
  });
  const MORE = ['structure-page', 'archive-page', 'tools', 'settings', 'profile'];
  document.querySelectorAll('.tab-item').forEach(el => {
    const on = el.dataset.route === routeId || (!!el.dataset.more && MORE.includes(routeId));
    el.classList.toggle('active', on); // ต้องส่ง boolean จริง ไม่งั้น toggle จะสลับค่าแทนการกำหนดค่า
    if (on) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
  });
  navPills.forEach(place => place(true));
}

// iOS: Safari มีอนิเมชันเลื่อนหน้าของระบบตอนปัดย้อนจากขอบอยู่แล้ว → ใส่ class ให้ CSS ลดเหลือจางเข้าตอนย้อนกลับ (ไม่ให้เลื่อนซ้อนกัน)
if (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) document.documentElement.classList.add('is-ios');
const VIEW_ENTER_CLASSES = ['view-enter', 'view-enter-fwd', 'view-enter-back'];

// เปลี่ยนหน้า: เล่นเฟดเข้าครั้งเดียวต่อการกดหนึ่งครั้ง (CSS ปิดเองเมื่อผู้ใช้ตั้ง reduced-motion)
function playViewEnter() {
  const v = document.getElementById('view');
  if (!v) return;
  clearLoading(v); // เนื้อหาจริงมาแล้ว — ยกเลิกตัวโหลดที่รออยู่
  v.classList.remove(...VIEW_ENTER_CLASSES, 'view-pending');
  void v.offsetWidth; // รีสตาร์ทแอนิเมชันถ้ากดซ้ำ
  v.classList.add(NavHistory.direction() === 'back' ? 'view-enter-back' : 'view-enter-fwd'); // เดินหน้า = เข้าจากขวา · ย้อนกลับ = เข้าจากซ้าย (บน iOS ย้อนกลับจางเข้าอย่างเดียว — ดู css)
}
// กดเปิดหน้าที่ต้องรอข้อมูลก่อนวาด (เช่น เปิดรายวิชา): หน้าเดิมจางลงทันที แล้ว playViewEnter จะถอดออกเมื่อหน้าใหม่มา
function markViewPending() {
  AppState.enterNext = true; // renderCourseShell เห็นแล้วจะเฟดเข้าตอนหน้าใหม่มาถึง
  showLoading('cat');        // หน้าเดิมจางทันที ถ้ารอเกิน 180ms น้องแมวจะขึ้นแทน
}
document.getElementById('view')?.addEventListener('animationend', e => {
  if (e.target === e.currentTarget) e.currentTarget.classList.remove(...VIEW_ENTER_CLASSES);
});

// หน้าที่ต้องโหลดสคริปต์เพิ่มก่อนวาด (ดู LAZY_MODULES ใน utils.js)
const ROUTE_MODULES = { 'report-page': 'report', tools: 'tools', profile: 'profile', 'pa-page': LAZY_BUNDLES.pa, 'idp-page': LAZY_BUNDLES.idp, 'tra-page': LAZY_BUNDLES.tra, 'car-page': LAZY_BUNDLES.car };

function navigate(route) {
  // รายงาน PA ไม่มีปุ่มเมนูแยกแล้ว — เป็นแท็บในหน้า PA (ใช้ได้กับลิงก์/โค้ดเดิมที่ยังเรียก 'pa-report-page')
  let paTab = null; // state ของหน้า PA อยู่ในระบบเอกสาร 'pa' (js/doc-system.js · lazy) — ตั้งค่าหลังโหลดเสร็จ
  if (route === 'pa-report-page') { paTab = 'report'; route = 'pa-page'; }
  NavHistory.record({ kind: 'route', route }); // ให้ปุ่ม/ท่าย้อนกลับของระบบถอยกลับมาหน้านี้ได้ (js/nav-history.js)
  AppState.enterNext = false; // ยกเลิกเฟดที่ค้างจากการเปิดรายวิชา (เช่น วิชาถูกลบแล้วเด้งกลับ)
  AppState.flushScoreSaves?.(); // กันคะแนนหายถ้าเพิ่งพิมพ์คะแนนแล้วรีบกดออกจากหน้าวิชา
  AppState.currentRoute = route;
  AppState.currentCourseId = null;
  setActiveNav(route);
  closeMobileNav();
  document.getElementById('app')?.classList.remove('more-open');

  const mod = ROUTE_MODULES[route];
  if (!mod) { drawRoute(route); return; }

  // โหลดสคริปต์ของหน้านั้นครั้งแรก — ถ้าผู้ใช้เปลี่ยนหน้าไปก่อนโหลดเสร็จ ไม่ต้องวาดทับ
  const view = document.getElementById('view');
  if (view) showLoading('cat');
  loadModules(mod).then(() => {
    if (AppState.currentRoute !== route) return;
    if (paTab) docSystem('pa').state.nextTab = paTab;
    drawRoute(route);
  }).catch(err => {
    console.error(err);
    if (AppState.currentRoute !== route) return;
    if (view) view.innerHTML = `<div class="card"><div class="empty-state">${escapeHtml(err.message)}<br><button type="button" class="btn btn-ghost btn-sm" id="retry-route-btn">ลองใหม่</button></div></div>`;
    document.getElementById('retry-route-btn')?.addEventListener('click', () => navigate(route));
  });
}

// วาดหน้า แล้วเฟดเข้าเมื่อวาดเสร็จจริง (หน้าส่วนใหญ่วาด "กำลังโหลด..." ก่อน แล้วรอ Firestore ค่อยวาดเนื้อหา — ถ้าเฟดทันที จะเฟดทับข้อความโหลดแล้วเนื้อหาจริงโผล่แข็ง)
function drawRoute(route) {
  Promise.resolve(renderRoute(route)).then(() => {
    if (AppState.currentRoute !== route) return;
    playViewEnter();
    NavHistory.applyScroll(); // ย้อนกลับ = เลื่อนกลับตำแหน่งเดิม · หน้าใหม่ = ขึ้นบนสุด (js/nav-history.js)
  });
}

function renderRoute(route) {
  if (route === 'dashboard') return renderDashboard();
  else if (route === 'courses') return renderCoursesList();
  else if (route === 'archive-page') return renderArchivePage();
  else if (route === 'structure-page') {
    // เข้าหน้านี้ปกติเริ่มที่รายการวิชา · structureOpenOnce = ข้ามไปแก้แม่แบบวิชาที่ระบุเลย (ใช้ครั้งเดียว — เช่นปุ่มแก้คำอธิบายรายวิชาที่หน้าวิชา)
    AppState.structureEditingTemplateId = AppState.structureOpenOnce || null;
    AppState.structureOpenOnce = null;
    return renderStructurePage();
  }
  else if (route === 'scores-page') return renderScoresPage();
  else if (route === 'report-page') return renderReportPage();
  else if (route === 'tools') return renderToolsPage();
  else if (route === 'settings') return renderSettings();
  else if (route === 'profile') return renderProfilePage();
  else if (route === 'pa-page') return renderDocPage('pa');
  else if (route === 'idp-page') return renderDocPage('idp');
  else if (route === 'tra-page') return renderDocPage('tra');
  else if (route === 'car-page') return renderDocPage('car');
}

// ช่องเลือกพื้นหลังในหน้าตั้งค่า: แต่ละช่องส่งสีผ่านตัวแปร --sw (ค่าสีจริงอยู่ที่ --bgp-* ใน css/style.css)
function bgGroupHtml(title, opts) {
  const tiles = opts.map(([id, label]) => `
    <button type="button" class="bg-opt${id === 'default' ? ' bg-opt-default' : ''}" data-bg-pref="${id}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"${id === 'default' ? '' : ` style="--sw:${bgPresetCss(id) || `var(--bgp-${id})`}"`}>
      <span class="bg-check">${icon('check')}</span>
    </button>`).join('');
  return `<div class="u-note u-semibold u-mt-12">${escapeHtml(title)}</div><div class="bg-grid" role="group" aria-label="${escapeHtml(title)}">${tiles}</div>`;
}

// ---------- พื้นหลังกำหนดเอง: สีเดียว / ไล่สี / ลาย (ตรรกะสีและการบันทึกอยู่ที่ js/theme.js) ----------
const BG_DEFAULTS = {
  solid:   { t: 'solid',   c: ['#ffd6e8'] },
  grad:    { t: 'grad',    c: ['#a1c4fd', '#fbc2eb'], a: 160, k: 'linear' },
  pattern: { t: 'pattern', c: ['#eef5ff'], a: 160, k: 'linear', p: 'dots', ink: '#0381fe', s: 28, o: 30 }
};
const BG_UNITS = { a: '°', s: 'px', o: '%', card: '%', menu: '%', blur: 'px' };

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}
const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

function bgColorField(key, label, value) {
  return `<div class="bg-field"><span>${escapeHtml(label)}</span><span class="bg-color-wrap"><span class="bg-hex" data-hex="${key}">${value}</span><input type="color" class="bg-color" data-key="${key}" value="${value}" aria-label="${escapeHtml(label)}"></span></div>`;
}
function bgSlider(key, label, min, max, step, value) {
  return `<div class="bg-slider"><div class="bg-slider-head"><span>${escapeHtml(label)}</span><span class="bg-slider-val" data-val="${key}">${value}${BG_UNITS[key]}</span></div><input type="range" class="bg-range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${escapeHtml(label)}"></div>`;
}
function bgPanelHtml(mode, cfg) {
  const preview = '<div class="bg-preview" aria-hidden="true"></div>';
  const btn = (act, label) => `<button type="button" class="btn btn-ghost btn-sm" data-bg-act="${act}">${label}</button>`;
  if (mode === 'solid') {
    return `${preview}${bgColorField('c0', 'สีพื้นหลัง', cfg.c[0])}<div class="u-flex u-gap-8 u-wrap u-mt-12">${btn('random', 'สุ่มสี')}</div>`;
  }
  if (mode === 'grad') {
    const kinds = [['linear', 'เส้นตรง'], ['radial', 'วงกลม']].map(([k, l]) =>
      `<button type="button" class="theme-opt" data-bg-kind="${k}" aria-pressed="${cfg.k === k}">${l}</button>`).join('');
    const colors = cfg.c.map((c, i) => bgColorField('c' + i, 'สีที่ ' + (i + 1), c)).join('');
    return `${preview}<div class="theme-seg bg-kind u-mt-12" role="group" aria-label="รูปแบบไล่สี">${kinds}</div>${colors}`
      + (cfg.k === 'linear' ? bgSlider('a', 'ทิศทาง', 0, 360, 5, cfg.a) : '')
      + `<div class="u-flex u-gap-8 u-wrap u-mt-12">${btn('random', 'สุ่มสี')}${btn('swap', 'สลับสี')}${btn('third', cfg.c.length === 3 ? 'เอาสีที่ 3 ออก' : 'เพิ่มสีที่ 3')}</div>`;
  }
  const tiles = BG_PATTERNS.map(([id, label]) => `
    <button type="button" class="bg-opt bg-opt-pat" data-bg-pat="${id}" aria-label="${escapeHtml(label)}" aria-pressed="${cfg.p === id}" style="--sw:${bgCssOf({ ...cfg, p: id }, 0.6)}">
      <span class="bg-check">${icon('check')}</span><span class="bg-cap">${escapeHtml(label)}</span>
    </button>`).join('');
  return `${preview}<div class="bg-grid" role="group" aria-label="ลายพื้นหลัง">${tiles}</div>`
    + bgColorField('c0', 'สีพื้น', cfg.c[0])
    + (cfg.c.length === 2 ? bgColorField('c1', 'สีพื้นที่ 2 (ไล่สี)', cfg.c[1]) : '')
    + bgColorField('ink', 'สีลาย', cfg.ink)
    + bgSlider('s', 'ขนาดลาย', 12, 72, 2, cfg.s)
    + bgSlider('o', 'ความเข้มลาย', 8, 100, 2, cfg.o)
    + `<div class="u-flex u-gap-8 u-wrap u-mt-12">${btn('random', 'สุ่มลายและสี')}${btn('mix', cfg.c.length === 2 ? 'ใช้สีพื้นสีเดียว' : 'ผสมสีพื้น (ไล่สี)')}</div>`;
}

// ---------- สีหลัก + ความโปร่งใสของส่วนต่างๆ (ตรรกะสี/การบันทึกอยู่ที่ js/theme.js: getLookPref / setLookPref / resetLookPref) ----------
const LOOK_COLORS = [['#7b52e6', 'ม่วง'], ['#0f9f88', 'เขียวอมฟ้า'], ['#f0731f', 'ส้ม'], ['#e83e7a', 'ชมพู'], ['#e5484d', 'แดง']];
const LOOK_SLIDERS = [['card', 'การ์ดและกล่องเนื้อหา', 0, 90], ['menu', 'เมนูข้างและแถบเมนูล่าง', 0, 90]];

function lookHtml() {
  const sw = LOOK_COLORS.map(([hex, label]) =>
    `<button type="button" class="look-sw" data-look-color="${hex}" aria-pressed="false" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}" style="--sw:${hex}"><span class="bg-check">${icon('check')}</span></button>`).join('');
  const sliders = LOOK_SLIDERS.map(([key, label, lo, hi]) => bgSlider(key, label, lo, hi, 5, 0)).join('')
    + bgSlider('blur', 'ความเบลอหลังเมนู', 0, 40, 2, 0);
  return `
    <div class="card card-pad set-look">
      <h2 class="card-title">สีหลักและความโปร่งใส</h2>
      <div class="u-note">เลือกสีหลักของแอป (ปุ่ม เมนูที่เลือก ไฮไลต์) และปรับความโปร่งใสของแต่ละส่วน 0% = ทึบ ยิ่งมากยิ่งเห็นพื้นหลังทะลุ</div>
      <div class="u-note u-semibold u-mt-12">สีหลัก</div>
      <div class="look-swatches" role="group" aria-label="สีหลัก">
        <button type="button" class="look-sw" data-look-color="" aria-pressed="false" aria-label="ค่าเริ่มต้น" title="ค่าเริ่มต้น" style="--sw:var(--hue-blue)"><span class="bg-check">${icon('check')}</span></button>
        ${sw}
      </div>
      ${bgColorField('pc', 'เลือกสีเอง', '#0381fe')}
      <div class="u-note u-semibold u-mt-16">ความโปร่งใส</div>
      <label class="bg-field"><span>เอฟเฟกต์กระจก (เบลอพื้นหลังหลังการ์ด)</span><span class="switch"><input type="checkbox" id="look-glass" role="switch" aria-label="เอฟเฟกต์กระจก"><span class="switch-slider"></span></span></label>
      ${sliders}
      <div class="u-flex u-gap-8 u-wrap u-mt-12"><button type="button" class="btn btn-ghost btn-sm" data-look-reset>คืนค่าเริ่มต้น</button></div>
    </div>`;
}

function initLook(view) {
  const box = view.querySelector('.set-look');
  const isDark = () => document.documentElement.dataset.theme === 'dark';
  const sync = () => {
    const L = getLookPref(), D = getLookDefaults();
    const pc = L.pc || (isDark() ? '#3e91ff' : '#0381fe');
    box.querySelectorAll('[data-look-color]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lookColor === (L.pc || ''))));
    box.querySelector('#look-glass').checked = L.glass ?? D.glass;
    const inp = box.querySelector('.bg-color[data-key="pc"]'); inp.value = pc;
    box.querySelector('[data-hex="pc"]').textContent = pc;
    ['card', 'menu', 'blur'].forEach(k => {
      const v = L[k] ?? D[k];
      box.querySelector(`.bg-range[data-key="${k}"]`).value = v;
      box.querySelector(`[data-val="${k}"]`).textContent = v + BG_UNITS[k];
    });
  };
  box.addEventListener('input', e => {
    const key = e.target.dataset.key; if (!key) return;
    if (key === 'pc') setLookPref({ pc: e.target.value });
    else setLookPref({ [key]: Number(e.target.value) });
    sync();
  });
  box.addEventListener('change', e => {
    if (e.target.id === 'look-glass') { setLookPref({ glass: e.target.checked }); sync(); }
  });
  box.addEventListener('click', e => {
    const c = e.target.closest('[data-look-color]');
    if (c) { setLookPref({ pc: c.dataset.lookColor || null }); sync(); return; }
    if (e.target.closest('[data-look-reset]')) { resetLookPref(); sync(); }
  });
  sync();
  return { sync };
}

// ---------- ชุดตั้งค่าของฉัน: บันทึก/ใช้/อัปเดต/ลบ preset ของพื้นหลัง + สีหลัก + ความโปร่งใสเมนู·การ์ด (ตรรกะอยู่ที่ js/theme.js: getLookPresets / saveLookPreset / applyLookPreset / deleteLookPreset) ----------
function presetsHtml() {
  return `
    <div class="card card-pad set-preset">
      <h2 class="card-title">ชุดตั้งค่าของฉัน</h2>
      <div class="u-note">บันทึกพื้นหลัง สีหลัก ความโปร่งใสของการ์ดและแถบเมนู ความเบลอ และเอฟเฟกต์กระจก ณ ตอนนี้ไว้เป็นชุดของตัวเอง แล้วกดใช้ได้ในครั้งเดียว (เก็บตามบัญชี Google ของคุณ ใช้ได้ทุกเครื่องที่ล็อกอิน · ไม่รวมโหมดสว่าง-มืด)</div>
      <div class="preset-save">
        <div class="field"><input type="text" id="preset-name" maxlength="${LOOK_PRESET_NAME_MAX}" autocomplete="off" placeholder="ตั้งชื่อชุด เช่น โปร่งใสมาก, กลางคืน" aria-label="ชื่อชุดตั้งค่า"></div>
        <button type="button" class="btn btn-primary btn-sm" id="preset-save-btn">บันทึกชุดนี้</button>
      </div>
      <div class="preset-list" id="preset-list"></div>
    </div>`;
}

function initPresets(view, onApplied) {
  const box = view.querySelector('.set-preset');
  const list = box.querySelector('#preset-list'), nameEl = box.querySelector('#preset-name');
  const D = () => getLookDefaults();
  const render = () => {
    const items = getLookPresets();
    if (!items.length) { list.innerHTML = '<div class="u-note-sm preset-empty">ยังไม่มีชุดที่บันทึกไว้ · ปรับพื้นหลังและความโปร่งใสให้ถูกใจ แล้วตั้งชื่อด้านบนเพื่อบันทึก</div>'; return; }
    list.innerHTML = items.map(p => {
      const d = D(), card = p.look.card ?? d.card, menu = p.look.menu ?? d.menu, blur = p.look.blur ?? d.blur;
      const dot = p.look.pc ? ` style="--dot:${p.look.pc}"` : '';
      return `
      <div class="preset-item" data-preset="${escapeHtml(p.id)}">
        <span class="preset-sw" style="--sw:${presetBgCss(p.bg)}" aria-hidden="true"><i class="preset-dot${p.look.pc ? '' : ' is-default'}"${dot}></i></span>
        <div class="preset-info">
          <div class="u-semibold preset-name">${escapeHtml(p.name)}</div>
          <div class="u-note-sm">โปร่งใส: การ์ด ${card}% · เมนู ${menu}% · เบลอ ${blur}px</div>
        </div>
        <div class="preset-actions">
          <button type="button" class="btn btn-primary btn-sm" data-preset-act="apply">ใช้</button>
          <button type="button" class="btn btn-ghost btn-sm" data-preset-act="update" title="เขียนทับด้วยค่าที่ตั้งอยู่ตอนนี้">อัปเดต</button>
          <button type="button" class="btn btn-danger-ghost btn-sm" data-preset-act="delete">ลบ</button>
        </div>
      </div>`;
    }).join('');
  };
  const REASONS = {
    name: ['กรุณาตั้งชื่อชุดก่อนบันทึก', 'warn'],
    dup: ['มีชื่อนี้อยู่แล้ว · ตั้งชื่อใหม่ หรือกด “อัปเดต” ที่ชุดนั้น', 'warn'],
    full: ['บันทึกได้สูงสุด ' + LOOK_PRESET_MAX + ' ชุด · ลบชุดเก่าก่อน', 'warn'],
    missing: ['ไม่พบชุดนี้แล้ว', 'warn'],
    storage: ['บันทึกไม่สำเร็จ (เบราว์เซอร์ไม่อนุญาตให้เก็บข้อมูล)', 'error']
  };
  const save = () => {
    const r = saveLookPreset(nameEl.value);
    if (!r.ok) { nameEl.focus(); showToast(...REASONS[r.reason]); return; }
    nameEl.value = '';
    render();
    showToast('บันทึกชุด “' + r.preset.name + '” แล้ว', 'success');
  };
  box.querySelector('#preset-save-btn').addEventListener('click', save);
  nameEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
  list.addEventListener('click', e => {
    const btn = e.target.closest('[data-preset-act]'); if (!btn) return;
    const id = btn.closest('[data-preset]').dataset.preset, act = btn.dataset.presetAct;
    const p = getLookPresets().find(x => x.id === id);
    if (!p) { render(); showToast(...REASONS.missing); return; }
    if (act === 'apply') {
      applyLookPreset(id);
      onApplied(); // วาดหน้าตั้งค่าใหม่ ให้ปุ่มพื้นหลัง/แถบเลื่อนตรงกับชุดที่ใช้
      showToast('ใช้ชุด “' + p.name + '” แล้ว', 'success');
    } else if (act === 'update') {
      openConfirmModal({
        title: 'อัปเดตชุดนี้?',
        body: 'เขียนทับชุด “' + escapeHtml(p.name) + '” ด้วยพื้นหลังและความโปร่งใสที่ตั้งอยู่ตอนนี้',
        confirmLabel: 'อัปเดต',
        onConfirm: () => {
          const r = saveLookPreset(null, id);
          if (!r.ok) throw new Error(r.reason);
          render();
          showToast('อัปเดตชุด “' + p.name + '” แล้ว', 'success');
        }
      });
    } else if (act === 'delete') {
      openConfirmModal({
        title: 'ลบชุดนี้?',
        body: 'ลบชุด “' + escapeHtml(p.name) + '” ออกจากรายการ (ไม่กระทบการตั้งค่าที่ใช้อยู่ตอนนี้)',
        confirmLabel: 'ลบ',
        danger: true,
        onConfirm: () => {
          if (!deleteLookPreset(id)) throw new Error('delete');
          render();
          showToast('ลบชุด “' + p.name + '” แล้ว', 'success');
        }
      });
    }
  });
  render();
}

// ผูกตัวควบคุมพื้นหลังกำหนดเองในหน้าตั้งค่า · onChange = เรียกเมื่อมีการใช้พื้นหลังกำหนดเอง (ให้ช่องสำเร็จรูปเลิกติ๊กถูก)
function initBgCustom(view, onChange) {
  const saved = getBgCustom();
  const clone = o => JSON.parse(JSON.stringify(o));
  const draft = { solid: clone(BG_DEFAULTS.solid), grad: clone(BG_DEFAULTS.grad), pattern: clone(BG_DEFAULTS.pattern) };
  if (saved) draft[saved.t] = saved;
  let mode = saved ? saved.t : null;
  const seg = view.querySelector('.bg-mode');
  const panel = view.querySelector('#bg-custom-panel');

  const syncMode = () => {
    seg.querySelectorAll('[data-bg-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.bgMode === mode)));
    panel.classList.toggle('hidden', !mode);
  };
  const renderPanel = () => {
    if (!mode) return;
    panel.innerHTML = bgPanelHtml(mode, draft[mode]);
    const kind = panel.querySelector('.bg-kind');
    if (kind) initNavPill(kind, '.theme-opt', 'seg-pill', { activeSel: '[aria-pressed="true"]', watch: true });
  };
  const commit = () => { setBgCustom(draft[mode]); onChange(); };
  const refreshTiles = () => {
    panel.querySelectorAll('[data-bg-pat]').forEach(t => t.style.setProperty('--sw', bgCssOf({ ...draft.pattern, p: t.dataset.bgPat }, 0.6)));
  };
  const select = m => { mode = m; syncMode(); renderPanel(); commit(); };

  seg.querySelectorAll('[data-bg-mode]').forEach(b => b.addEventListener('click', () => select(b.dataset.bgMode)));
  initNavPill(seg, '[data-bg-mode]', 'seg-pill', { activeSel: '[aria-pressed="true"]', watch: true });

  panel.addEventListener('input', e => {
    const el = e.target, key = el.dataset.key, cfg = draft[mode];
    if (!key) return;
    if (key === 'ink') cfg.ink = el.value;
    else if (key[0] === 'c') cfg.c[Number(key.slice(1))] = el.value;
    else cfg[key] = Number(el.value);
    const hex = panel.querySelector(`[data-hex="${key}"]`); if (hex) hex.textContent = el.value;
    const val = panel.querySelector(`[data-val="${key}"]`); if (val) val.textContent = el.value + (BG_UNITS[key] || '');
    commit();
    if (mode === 'pattern') refreshTiles();
  });
  panel.addEventListener('click', e => {
    const cfg = draft[mode];
    const pat = e.target.closest('[data-bg-pat]'), kind = e.target.closest('[data-bg-kind]'), act = e.target.closest('[data-bg-act]');
    if (pat) {
      cfg.p = pat.dataset.bgPat;
      panel.querySelectorAll('[data-bg-pat]').forEach(t => t.setAttribute('aria-pressed', String(t === pat)));
      commit();
    } else if (kind) {
      cfg.k = kind.dataset.bgKind; commit(); renderPanel();
    } else if (act) {
      const a = act.dataset.bgAct;
      if (a === 'swap') cfg.c.reverse();
      else if (a === 'third') { if (cfg.c.length === 3) cfg.c.pop(); else cfg.c.push(hslToHex(randInt(0, 359), 80, 82)); }
      else if (a === 'mix') { if (cfg.c.length === 2) cfg.c.pop(); else cfg.c.push(hslToHex(randInt(0, 359), 80, 86)); }
      else if (a === 'random') {
        const h = randInt(0, 359);
        if (mode === 'solid') cfg.c = [hslToHex(h, randInt(60, 95), randInt(68, 90))];
        else if (mode === 'grad') cfg.c = cfg.c.map((_, i) => hslToHex((h + i * randInt(40, 110)) % 360, randInt(65, 95), randInt(62, 86))), cfg.a = randInt(0, 72) * 5;
        else {
          cfg.c = cfg.c.map((_, i) => hslToHex((h + i * randInt(30, 90)) % 360, randInt(60, 90), randInt(82, 94)));
          cfg.ink = hslToHex((h + randInt(0, 40)) % 360, randInt(55, 90), randInt(32, 52));
          cfg.p = BG_PATTERNS[randInt(0, BG_PATTERNS.length - 1)][0]; cfg.s = randInt(8, 30) * 2; cfg.o = randInt(12, 40) * 2;
        }
      }
      commit(); renderPanel();
    }
  });
  syncMode(); renderPanel();
  return { reset() { mode = null; syncMode(); } }; // เลือกชุดสำเร็จรูปแล้ว → พับแผงกำหนดเอง
}

// ---------- เกี่ยวกับ (บนสุดของหน้าตั้งค่า): เวอร์ชันเว็บ · ผู้สร้าง ----------
// version รูปแบบ v<รุ่นใหญ่>.<ฟีเจอร์>.<วันเวลา> เช่น v1.15.26OC201912 — **ห้ามแก้มือ**
//   npm run build:version (รวมใน npm run build) เขียนให้ทั้งตรงนี้และ VERSION ใน sw.js · รายละเอียดดู tools/version.js
const APP_INFO = { version: 'v1.15.26OC271139', creator: 'lektheholy', email: 'lektheholy@gmail.com' };

function aboutHtml() {
  const a = APP_INFO;
  return `
    <div class="card card-pad set-about">
      <h2 class="card-title">เกี่ยวกับ</h2>
      <dl class="about-list">
        <div><dt class="u-note">เวอร์ชันของเว็บ</dt><dd class="u-semibold">${escapeHtml(a.version)}</dd></div>
        <div><dt class="u-note">ผู้สร้าง</dt><dd class="u-semibold">${escapeHtml(a.creator)}</dd></div>
        <div><dt class="u-note">อีเมล</dt><dd class="u-semibold"><a href="mailto:${escapeHtml(a.email)}">${escapeHtml(a.email)}</a></dd></div>
      </dl>
    </div>`;
}

// ---------- หน้าตั้งค่า: 2 แท็บ (รูปแบบหน้าเว็บ · เกี่ยวกับ) ----------
// แท็บ "เกี่ยวกับ" รวมเรื่องที่ไม่เกี่ยวกับหน้าตา: เวอร์ชัน/ผู้สร้าง · บัญชี · ความเป็นส่วนตัว
const SETTINGS_TABS = [['look', 'รูปแบบหน้าเว็บ'], ['about', 'เกี่ยวกับ']];

// พื้นหลังที่โชว์ให้เลือก — คัดจาก BG_OPTIONS (js/theme.js) ให้แต่ละช่องต่างโทนกันชัด ไม่มีสีใกล้เคียงซ้ำ
// id อื่นใน BG_OPTIONS ยังใช้งานได้ตามเดิม (ค่าที่เคยบันทึก/ซิงค์ไว้ไม่หาย) แค่ไม่โชว์ให้เลือกใหม่
const BG_SHOWN = [
  ['สว่างและนุ่ม', ['default', 'sky', 'mint', 'lemon', 'uipeach', 'uirose', 'lilac', 'uigraphite']],
  ['ไล่สี', ['ocean', 'dusk', 'sunsetpop']],
  ['เข้ม', ['midnight', 'forest', 'berry']]
];

function bgShownGroupsHtml() {
  const label = { default: 'ค่าเริ่มต้น' };
  Object.values(BG_OPTIONS).forEach(g => g.forEach(([id, l]) => { label[id] = l; }));
  const groups = BG_SHOWN.map(([title, ids]) => [title, ids.map(id => [id, label[id]])]);
  const cur = getBgPref();
  // ผู้ใช้ที่เคยเลือกชุดที่เลิกโชว์แล้ว: เพิ่มช่องนั้นให้ยังเห็นว่าใช้อยู่ (ไม่ให้เลือกใหม่ได้ ถ้าเปลี่ยนไปแล้ว)
  if (label[cur] && !BG_SHOWN.some(g => g[1].includes(cur))) groups.push(['ชุดเดิมที่ใช้อยู่', [[cur, label[cur]]]]);
  return groups.map(([title, opts]) => bgGroupHtml(title, opts)).join('');
}

function settingsLookHtml() {
  return `
    <div class="u-note u-mb-12">การตั้งค่าหน้าตาทั้งหมดบันทึกตามบัญชี Google ของคุณ จึงเหมือนเดิมเมื่อเปิดจากเครื่องอื่น</div>
    <div class="settings-grid settings-grid-look">
    <div class="card card-pad set-theme">
      <h2 class="card-title">ธีม</h2>
      <div class="u-note">เลือกโหมดสว่าง โหมดมืด หรือให้ตามการตั้งค่าของอุปกรณ์</div>
      <div class="theme-seg" role="group" aria-label="ธีม">
        <button type="button" class="theme-opt" data-theme-pref="auto">${icon('contrast')}ตามระบบ</button>
        <button type="button" class="theme-opt" data-theme-pref="light">${icon('sun')}สว่าง</button>
        <button type="button" class="theme-opt" data-theme-pref="dark">${icon('moon')}มืด</button>
      </div>
    </div>
    <div class="card card-pad set-bg">
      <h2 class="card-title">พื้นหลัง</h2>
      <div class="u-note">เลือกชุดสำเร็จรูป หรือสร้างเองด้านล่าง ตัวหนังสือบนพื้นจะปรับสีให้อ่านชัดเอง</div>
      ${bgShownGroupsHtml()}
      <div class="u-note u-semibold u-mt-16">สร้างพื้นหลังเอง</div>
      <div class="theme-seg bg-mode u-mt-6" role="group" aria-label="ชนิดพื้นหลังที่สร้างเอง">
        <button type="button" class="theme-opt" data-bg-mode="solid" aria-pressed="false">สีเดียว</button>
        <button type="button" class="theme-opt" data-bg-mode="grad" aria-pressed="false">ไล่สี</button>
        <button type="button" class="theme-opt" data-bg-mode="pattern" aria-pressed="false">ลาย</button>
      </div>
      <div id="bg-custom-panel" class="hidden"></div>
    </div>
    ${lookHtml()}
    ${presetsHtml()}
    </div>`;
}

// ---------- ติดตั้งแอป (แท็บเกี่ยวกับ · เฉพาะมือถือ) ตรรกะอยู่ที่ js/pwa.js: PwaInstall ----------
function installCardHtml(mode) {
  const ios = mode === 'ios';
  const steps = ios ? `
      <ol class="install-steps hidden" id="pwa-ios-steps">
        <li>แตะปุ่มแชร์ (ไอคอนสี่เหลี่ยมมีลูกศรชี้ขึ้น) ที่แถบของ Safari</li>
        <li>เลื่อนลงแล้วเลือก “เพิ่มไปยังหน้าจอโฮม”</li>
        <li>แตะ “เพิ่ม” ที่มุมขวาบน</li>
      </ol>` : '';
  return `
    <div class="card card-pad set-install">
      <h2 class="card-title">ติดตั้งแอป</h2>
      <div class="u-note">เพิ่มไอคอนไว้ที่หน้าจอโฮม เปิดใช้ได้เหมือนแอปทั่วไป เต็มจอ ไม่มีแถบเบราว์เซอร์</div>
      <div class="settings-actions"><button type="button" class="btn btn-primary btn-sm" id="pwa-install-btn"${ios ? ' aria-expanded="false" aria-controls="pwa-ios-steps"' : ''}>${ios ? 'ดูวิธีติดตั้ง' : 'ติดตั้งแอป'}</button></div>${steps}
    </div>`;
}

function bindInstallCard(slot) {
  if (!slot || typeof PwaInstall === 'undefined') return;
  const draw = () => {
    if (!slot.isConnected) { off(); return; } // ออกจากแท็บ/หน้านี้แล้ว → เลิกฟัง
    const mode = PwaInstall.mode();
    slot.innerHTML = mode === 'prompt' || mode === 'ios' ? installCardHtml(mode) : ''; // ติดตั้งแล้ว/ไม่รองรับ → ไม่แสดงการ์ด
    const btn = slot.querySelector('#pwa-install-btn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      if (mode === 'ios') {
        const open = slot.querySelector('#pwa-ios-steps').classList.toggle('hidden') === false;
        btn.setAttribute('aria-expanded', String(open));
        btn.textContent = open ? 'ซ่อนวิธีติดตั้ง' : 'ดูวิธีติดตั้ง';
        return;
      }
      btn.disabled = true;
      if (await PwaInstall.prompt()) showToast('ติดตั้งแอปแล้ว', 'success');
    });
  };
  const off = PwaInstall.onChange(draw);
  draw();
}

function settingsAboutHtml() {
  const u = AppState.user;
  return `
    <div id="install-slot"></div>
    <div class="settings-grid settings-grid-info">
    ${aboutHtml()}
    <div class="card card-pad set-acct">
      <h2 class="card-title">บัญชี</h2>
      <div class="settings-profile">
        <img src="${escapeHtml(safePhotoUrl(u.photoURL, u.displayName))}" alt="" referrerpolicy="no-referrer" class="u-avatar-48">
        <div>
          <div class="u-semibold">${escapeHtml(u.displayName || '')}</div>
          <div class="u-note-sm">${escapeHtml(u.email || '')}</div>
        </div>
      </div>
      <div class="u-note">
        ข้อมูลรายวิชา ห้องเรียน นักเรียน และคะแนนของคุณจะถูกเก็บแยกจากครูคนอื่นโดยอัตโนมัติ ผ่านบัญชี Google ของคุณ
      </div>
    </div>
    <div class="card card-pad set-priv">
      <h2 class="card-title">ความเป็นส่วนตัวและข้อมูลของฉัน</h2>
      <div class="u-note u-lh-165 u-mt-4">
        แอปเก็บชื่อ อีเมล รูปโปรไฟล์ของครู การตั้งค่าหน้าตา (ธีม พื้นหลัง สี) ข้อมูลส่วนตัวที่ครูกรอกเอง (ตำแหน่ง สังกัด เงินเดือน ผู้ลงนาม) และข้อมูลรายวิชา นักเรียน (ซึ่งเป็นข้อมูลส่วนบุคคลของผู้เยาว์) และคะแนน บน Google Firebase โดยผูกกับบัญชีของครูเท่านั้น
        หน้าหลักส่งพิกัดโดยประมาณ (ปัดเหลือราว 1 กม.) ไปยัง Open-Meteo เพื่อแสดงสภาพอากาศ โดยไม่ส่งข้อมูลนักเรียน
        ครูควรใช้ข้อมูลนักเรียนเท่าที่จำเป็นและตามนโยบายของโรงเรียน
      </div>
      <div class="settings-actions">
        <button type="button" class="btn btn-ghost btn-sm" id="privacy-export-btn">ส่งออกข้อมูลของฉัน (JSON)</button>
        <button type="button" class="btn btn-danger-ghost btn-sm" id="privacy-delete-btn">ลบบัญชีและข้อมูลทั้งหมด</button>
      </div>
    </div>
    </div>`;
}

function bindSettingsAbout(root) {
  // privacy.js โหลดเมื่อกดปุ่มครั้งแรกเท่านั้น
  const withPrivacy = (fnName) => async () => {
    try { await loadModule('privacy'); } catch (err) { showToast(err.message); return; }
    window[fnName]();
  };
  root.querySelector('#privacy-export-btn').addEventListener('click', withPrivacy('exportMyData'));
  root.querySelector('#privacy-delete-btn').addEventListener('click', withPrivacy('deleteMyAccount'));
  bindInstallCard(root.querySelector('#install-slot'));
}

function bindSettingsLook(root) {
  const syncThemeButtons = () => {
    const cur = getThemePref();
    root.querySelectorAll('.theme-opt[data-theme-pref]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themePref === cur)));
  };
  const look = initLook(root);
  root.querySelectorAll('.theme-opt[data-theme-pref]').forEach(b => b.addEventListener('click', () => {
    setThemePref(b.dataset.themePref);
    syncThemeButtons();
    look.sync(); // ค่าเริ่มต้นของการ์ด/สีหลักต่างกันตามโหมดสว่าง-มืด
  }));
  syncThemeButtons();
  const syncBgButtons = () => {
    const cur = getBgPref();
    root.querySelectorAll('.bg-opt[data-bg-pref]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.bgPref === cur)));
  };
  const bgCustom = initBgCustom(root, syncBgButtons);
  root.querySelectorAll('.bg-opt[data-bg-pref]').forEach(b => b.addEventListener('click', () => {
    setBgPref(b.dataset.bgPref);
    syncBgButtons();
    bgCustom.reset();
  }));
  syncBgButtons();
  initPresets(root, renderSettings);
  initNavPill(root.querySelector('.theme-seg[aria-label="ธีม"]'), '.theme-opt', 'seg-pill', { activeSel: '[aria-pressed="true"]', watch: true });
}

function renderSettings() {
  const view = document.getElementById('view');
  if (!SETTINGS_TABS.some(t => t[0] === AppState.settingsTab)) AppState.settingsTab = 'look';
  view.innerHTML = `
    ${pageHeaderHtml('ตั้งค่า')}
    <div class="tabs" id="settings-tabs">
      ${SETTINGS_TABS.map(([id, label]) => `<div class="tab ${AppState.settingsTab === id ? 'active' : ''}" data-tab="${id}">${label}</div>`).join('')}
    </div>
    <div id="settings-tab-body"></div>`;
  const tabs = view.querySelector('#settings-tabs');
  const body = view.querySelector('#settings-tab-body');
  initNavPill(tabs, '.tab', 'seg-pill');

  const draw = animate => {
    if (AppState.settingsTab === 'about') { body.innerHTML = settingsAboutHtml(); bindSettingsAbout(body); }
    else { body.innerHTML = settingsLookHtml(); bindSettingsLook(body); }
    if (animate) { body.classList.remove('tab-swap'); void body.offsetWidth; body.classList.add('tab-swap'); }
  };
  tabs.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    if (t.dataset.tab === AppState.settingsTab) return;
    AppState.settingsTab = t.dataset.tab;
    tabs.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
    tabs.__pillPlace?.(true);
    draw(true);
  }));
  draw(false);
}

initNavPill(document.querySelector('.nav-list'), '.nav-item', 'nav-pill', { global: true });

document.querySelectorAll('.nav-item[data-route], .user-chip[data-route]').forEach(el => {
  el.addEventListener('click', () => navigate(el.dataset.route));
});

// เมนูตั้งค่า + ออกจากระบบอยู่ท้ายเมนูข้าง (นอก .nav-list) — ให้มีแถบสีเลื่อนของตัวเองเหมือนเมนูอื่น
initNavPill(document.querySelector('.sidebar-footer'), '.nav-item', 'nav-pill', { global: true });

// ปุ่มย้อนขึ้นบน: โผล่เมื่อเลื่อนลงเกินราว 1 หน้าจอ · คลิกแล้วเลื่อนขึ้นนุ่ม ๆ (ผู้ใช้ปิดอนิเมชันในระบบ = เด้งขึ้นทันที)
(function initToTop() {
  const btn = document.getElementById('to-top');
  if (!btn) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  let shown = false;
  const update = () => {
    const on = window.scrollY > Math.max(400, window.innerHeight * 0.6);
    if (on !== shown) { shown = on; btn.classList.toggle('is-show', on); }
  };
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update, { passive: true });
  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: reduce.matches ? 'auto' : 'smooth' });
    btn.blur();
  });
  update();
})();

document.getElementById('hamburger-btn')?.addEventListener('click', toggleMobileNav);
document.getElementById('nav-overlay')?.addEventListener('click', closeMobileNav);
document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
  // เดสก์ท็อป: ย่อ/ขยายเมนู · มือถือ: แตะโลโก้เพื่อปิดลิ้นชักเมนู
  if (window.innerWidth <= SIDEBAR_BREAKPOINT) closeMobileNav(); else toggleSidebarCollapse();
});

// ==========================================================================
// แถบเมนูล่างบนมือถือ + แผง "เพิ่มเติม" (สร้างจากปุ่มเมนูข้างเพื่อไม่ให้ไอคอนซ้ำซ้อน)
// ==========================================================================
(function initTabbar() {
  const app = document.getElementById('app'), bar = document.getElementById('tabbar'), grid = document.getElementById('more-grid');
  if (!app || !bar || !grid) return;
  const src = k => k === 'logout' ? document.getElementById('logout-btn') : document.querySelector(`.nav-item[data-route="${k}"], .user-chip[data-route="${k}"]`);
  const iconOf = el => el.querySelector('.nav-icon')?.innerHTML || '';
  const setMore = open => app.classList.toggle('more-open', open);

  [['dashboard', 'หน้าหลัก'], ['courses', 'รายวิชา'], ['scores-page', 'คะแนน'], ['report-page', 'รายงาน']].forEach(([route, label]) => {
    const s = src(route); if (!s) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tab-item'; b.dataset.route = route;
    b.innerHTML = `<span class="tab-ico">${iconOf(s)}</span><span class="tab-label">${label}</span>`;
    b.addEventListener('click', () => navigate(route));
    bar.appendChild(b);
  });

  const more = document.createElement('button');
  more.type = 'button'; more.className = 'tab-item'; more.dataset.route = 'more'; more.dataset.more = '1';
  more.innerHTML = '<span class="tab-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></svg></span><span class="tab-label">เพิ่มเติม</span>';
  more.addEventListener('click', () => setMore(!app.classList.contains('more-open')));
  bar.appendChild(more);

  // จัดกลุ่มปุ่มใน more-sheet: กลุ่ม 1 = เนื้อหา, กลุ่ม 2 = บัญชี/ตั้งค่า, กลุ่ม 3 = ออกจากระบบ
  const addDivider = () => { const d = document.createElement('div'); d.className = 'more-divider'; grid.appendChild(d); };
  const addTile = (k) => {
    const s = src(k); if (!s) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'more-tile'; b.dataset.route = k === 'logout' ? 'logout-btn' : k;
    const ico = k === 'profile' ? icon('user') : iconOf(s);
    const label = k === 'profile' ? 'ข้อมูลส่วนตัว' : (s.querySelector('.nav-label')?.textContent || '');
    b.innerHTML = `<span class="more-ico">${ico}</span><span>${label}</span>`;
    b.addEventListener('click', () => { setMore(false); if (k === 'logout') s.click(); else navigate(k); });
    grid.appendChild(b);
  };

  // กลุ่ม 1: เมนูเนื้อหา
  ['pa-page', 'idp-page', 'car-page', 'structure-page', 'archive-page', 'tools'].forEach(addTile);
  addDivider();
  // กลุ่ม 2: บัญชีและตั้งค่า
  ['profile', 'settings'].forEach(addTile);
  addDivider();
  // กลุ่ม 3: ออกจากระบบ
  addTile('logout');

  initNavPill(bar, '.tab-item', 'tab-pill', { global: true });
  document.getElementById('more-scrim')?.addEventListener('click', () => setMore(false));
  setActiveNav((typeof AppState !== 'undefined' && AppState.currentRoute) || 'dashboard');
})();
