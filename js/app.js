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

// เปลี่ยนหน้า: เล่นเฟดเข้าครั้งเดียวต่อการกดหนึ่งครั้ง (CSS ปิดเองเมื่อผู้ใช้ตั้ง reduced-motion)
function playViewEnter() {
  const v = document.getElementById('view');
  if (!v) return;
  clearLoading(v); // เนื้อหาจริงมาแล้ว — ยกเลิกตัวโหลดที่รออยู่
  v.classList.remove('view-enter', 'view-pending');
  void v.offsetWidth; // รีสตาร์ทแอนิเมชันถ้ากดซ้ำ
  v.classList.add('view-enter');
}
// กดเปิดหน้าที่ต้องรอข้อมูลก่อนวาด (เช่น เปิดรายวิชา): หน้าเดิมจางลงทันที แล้ว playViewEnter จะถอดออกเมื่อหน้าใหม่มา
function markViewPending() {
  AppState.enterNext = true; // renderCourseShell เห็นแล้วจะเฟดเข้าตอนหน้าใหม่มาถึง
  showLoading('cat');        // หน้าเดิมจางทันที ถ้ารอเกิน 180ms น้องแมวจะขึ้นแทน
}
document.getElementById('view')?.addEventListener('animationend', e => {
  if (e.target === e.currentTarget) e.currentTarget.classList.remove('view-enter');
});

// หน้าที่ต้องโหลดสคริปต์เพิ่มก่อนวาด (ดู LAZY_MODULES ใน utils.js)
const ROUTE_MODULES = { 'report-page': 'report', tools: 'tools', profile: 'profile', 'pa-page': LAZY_BUNDLES.pa };

function navigate(route) {
  // รายงาน PA ไม่มีปุ่มเมนูแยกแล้ว — เป็นแท็บในหน้า PA (ใช้ได้กับลิงก์/โค้ดเดิมที่ยังเรียก 'pa-report-page')
  let paTab = null; // state ของหน้า PA อยู่ในระบบเอกสาร 'pa' (js/doc-system.js · lazy) — ตั้งค่าหลังโหลดเสร็จ
  if (route === 'pa-report-page') { paTab = 'report'; route = 'pa-page'; }
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
    if (AppState.currentRoute === route) playViewEnter();
  });
}

function renderRoute(route) {
  if (route === 'dashboard') return renderDashboard();
  else if (route === 'courses') return renderCoursesList();
  else if (route === 'archive-page') return renderArchivePage();
  else if (route === 'structure-page') { AppState.structureEditingCourseId = null; return renderStructurePage(); }
  else if (route === 'scores-page') return renderScoresPage();
  else if (route === 'report-page') return renderReportPage();
  else if (route === 'tools') return renderToolsPage();
  else if (route === 'settings') return renderSettings();
  else if (route === 'profile') return renderProfilePage();
  else if (route === 'pa-page') return renderDocPage('pa');
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
const LOOK_COLORS = [['#0381fe', 'น้ำเงิน'], ['#7b52e6', 'ม่วง'], ['#0f9f88', 'เขียวอมฟ้า'], ['#f0731f', 'ส้ม'], ['#e83e7a', 'ชมพู'], ['#e5484d', 'แดง']];
const LOOK_SLIDERS = [['card', 'การ์ดและกล่องเนื้อหา', 0, 90], ['menu', 'เมนูข้างและแถบเมนูล่าง', 0, 90]];

function lookHtml() {
  const sw = LOOK_COLORS.map(([hex, label]) =>
    `<button type="button" class="look-sw" data-look-color="${hex}" aria-pressed="false" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}" style="--sw:${hex}"><span class="bg-check">${icon('check')}</span></button>`).join('');
  const sliders = LOOK_SLIDERS.map(([key, label, lo, hi]) => bgSlider(key, label, lo, hi, 5, 0)).join('')
    + bgSlider('blur', 'ความเบลอหลังเมนู', 0, 40, 2, 0);
  return `
    <div class="card card-pad set-look">
      <h2 class="card-title">สีและความโปร่งใส</h2>
      <div class="u-note">เลือกสีหลักของแอป (ปุ่ม เมนูที่เลือก ไฮไลต์) และปรับความโปร่งใสของแต่ละส่วน 0% = ทึบ ยิ่งมากยิ่งเห็นพื้นหลังทะลุ</div>
      <div class="u-note u-semibold u-mt-12">สีหลัก</div>
      <div class="look-swatches" role="group" aria-label="สีหลัก">
        <button type="button" class="look-sw" data-look-color="" aria-pressed="false" aria-label="ค่าเริ่มต้น" title="ค่าเริ่มต้น" style="--sw:var(--hue-blue)"><span class="bg-check">${icon('check')}</span></button>
        ${sw}
      </div>
      ${bgColorField('pc', 'เลือกสีเอง', '#0381fe')}
      <div class="u-note u-semibold u-mt-16">ความโปร่งใส</div>
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
  box.addEventListener('click', e => {
    const c = e.target.closest('[data-look-color]');
    if (c) { setLookPref({ pc: c.dataset.lookColor || null }); sync(); return; }
    if (e.target.closest('[data-look-reset]')) { resetLookPref(); sync(); }
  });
  sync();
  return { sync };
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

function renderSettings() {
  const view = document.getElementById('view');
  const u = AppState.user;
  view.innerHTML = `
    ${pageHeaderHtml('ตั้งค่า')}
    <div class="settings-grid">
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
      <div class="u-note">เลือกจากชุดสำเร็จรูป หรือปรับเองอิสระ: สีเดียว ไล่สีหลายสี และลายพื้นหลัง ชื่อแอปและตัวหนังสือบนพื้นจะเปลี่ยนสีให้อ่านชัดตามพื้นหลังเอง</div>
      ${bgGroupHtml('ค่าเริ่มต้น', [['default', 'ค่าเริ่มต้น']])}
      ${bgGroupHtml('สีทึบ', BG_OPTIONS.solid)}
      ${bgGroupHtml('ไล่สี', BG_OPTIONS.gradient)}
      ${bgGroupHtml('ชุดสีเพิ่มเติม', BG_OPTIONS.preset)}
      <div class="u-note u-semibold u-mt-16">ปรับเองอิสระ</div>
      <div class="theme-seg bg-mode u-mt-6" role="group" aria-label="ชนิดพื้นหลังที่ปรับเอง">
        <button type="button" class="theme-opt" data-bg-mode="solid" aria-pressed="false">สีเดียว</button>
        <button type="button" class="theme-opt" data-bg-mode="grad" aria-pressed="false">ไล่สี</button>
        <button type="button" class="theme-opt" data-bg-mode="pattern" aria-pressed="false">ลาย</button>
      </div>
      <div id="bg-custom-panel" class="hidden"></div>
    </div>
    ${lookHtml()}
    <div class="card card-pad set-priv">
      <h2 class="card-title">ความเป็นส่วนตัวและข้อมูลของฉัน</h2>
      <div class="u-note u-lh-165 u-mt-4">
        แอปเก็บชื่อ อีเมล รูปโปรไฟล์ของครู ข้อมูลส่วนตัวที่ครูกรอกเอง (ตำแหน่ง สังกัด เงินเดือน ผู้ลงนาม) และข้อมูลรายวิชา นักเรียน (ซึ่งเป็นข้อมูลส่วนบุคคลของผู้เยาว์) และคะแนน บน Google Firebase โดยผูกกับบัญชีของครูเท่านั้น
        หน้าหลักส่งพิกัดโดยประมาณ (ปัดเหลือราว 1 กม.) ไปยัง Open-Meteo เพื่อแสดงสภาพอากาศ โดยไม่ส่งข้อมูลนักเรียน
        ครูควรใช้ข้อมูลนักเรียนเท่าที่จำเป็นและตามนโยบายของโรงเรียน
      </div>
      <div class="settings-actions">
        <button type="button" class="btn btn-ghost btn-sm" id="privacy-export-btn">ส่งออกข้อมูลของฉัน (JSON)</button>
        <button type="button" class="btn btn-danger-ghost btn-sm" id="privacy-delete-btn">ลบบัญชีและข้อมูลทั้งหมด</button>
      </div>
    </div>
    </div>
  `;
  // privacy.js โหลดเมื่อกดปุ่มครั้งแรกเท่านั้น
  const withPrivacy = (fnName) => async () => {
    try { await loadModule('privacy'); } catch (err) { showToast(err.message); return; }
    window[fnName]();
  };
  document.getElementById('privacy-export-btn').addEventListener('click', withPrivacy('exportMyData'));
  document.getElementById('privacy-delete-btn').addEventListener('click', withPrivacy('deleteMyAccount'));
  const syncThemeButtons = () => {
    const cur = getThemePref();
    view.querySelectorAll('.theme-opt[data-theme-pref]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themePref === cur)));
  };
  const look = initLook(view);
  view.querySelectorAll('.theme-opt[data-theme-pref]').forEach(b => b.addEventListener('click', () => {
    setThemePref(b.dataset.themePref);
    syncThemeButtons();
    look.sync(); // ค่าเริ่มต้นของการ์ด/สีหลักต่างกันตามโหมดสว่าง-มืด
  }));
  syncThemeButtons();
  const syncBgButtons = () => {
    const cur = getBgPref();
    view.querySelectorAll('.bg-opt[data-bg-pref]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.bgPref === cur)));
  };
  const bgCustom = initBgCustom(view, syncBgButtons);
  view.querySelectorAll('.bg-opt[data-bg-pref]').forEach(b => b.addEventListener('click', () => {
    setBgPref(b.dataset.bgPref);
    syncBgButtons();
    bgCustom.reset();
  }));
  syncBgButtons();
  initNavPill(view.querySelector('.theme-seg[aria-label="ธีม"]'), '.theme-opt', 'seg-pill', { activeSel: '[aria-pressed="true"]', watch: true });
}

initNavPill(document.querySelector('.nav-list'), '.nav-item', 'nav-pill', { global: true });

document.querySelectorAll('.nav-item[data-route], .user-chip[data-route]').forEach(el => {
  el.addEventListener('click', () => navigate(el.dataset.route));
});

// เมนูตั้งค่า + ออกจากระบบอยู่ท้ายเมนูข้าง (นอก .nav-list) — ให้มีแถบสีเลื่อนของตัวเองเหมือนเมนูอื่น
initNavPill(document.querySelector('.sidebar-footer'), '.nav-item', 'nav-pill', { global: true });

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
  ['pa-page', 'structure-page', 'archive-page', 'tools'].forEach(addTile);
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
