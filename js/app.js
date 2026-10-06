// ==========================================================================
// Router
// ==========================================================================

const navPills = []; // ฟังก์ชันวางแถบเลื่อนของเมนูข้าง/แถบล่าง (สร้างใน initNavPill)

// แถบสีเลื่อนไปหาปุ่มที่ active — ใช้กับเมนูข้าง แถบเมนูล่าง และแท็บ/ห้อง/ตัวเลือกสลับในหน้า
//   opt.activeSel  ตัวเลือกของปุ่ม active (ค่าเริ่มต้น '.active'; ตัวเลือกสลับใช้ '[aria-pressed="true"]')
//   opt.key        ระบุเมื่อหน้านั้นวาด container ใหม่ทุกครั้งที่กด (innerHTML) — เรียก pillSlideNext(key) ก่อนวาด
//                  แถบใหม่จะเริ่มจากตำแหน่งเดิมแล้วเลื่อนไปที่ใหม่ แทนการโผล่ทันที
//   opt.watch      true = เฝ้าดู aria-pressed ที่เปลี่ยนในที่เดิม (ไม่ต้องวาดใหม่) แล้วเลื่อนตาม
//   opt.global     true = ลงทะเบียนให้ setActiveNav สั่งเลื่อน (เมนูข้าง/ล่างเท่านั้น)
const pillGeom = {}, pillPending = {};
function pillSlideNext(key) { pillPending[key] = true; }

function initNavPill(container, itemSel, cls, opt = {}) {
  if (!container) return;
  const { activeSel = '.active', key = null, watch = false, global = false } = opt;
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
    pill.style.setProperty('--w', getComputedStyle(t).getPropertyValue('--w'));
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
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => place(false)).observe(container);
  if (watch && typeof MutationObserver === 'function') {
    new MutationObserver(() => place(true)).observe(container, { attributes: true, subtree: true, attributeFilter: ['aria-pressed'] });
  }
  if (global) navPills.push(place);
  place(false);
}

function setActiveNav(routeId) {
  if (typeof islandSetPage === 'function') islandSetPage(routeId || AppState.currentRoute); // ชื่อหน้าบน Dynamic Island (หน้าในวิชา routeId=null → ใช้ currentRoute)
  document.querySelectorAll('.nav-item[data-route]').forEach(el => {
    el.classList.toggle('active', el.dataset.route === routeId);
  });
  const MORE = ['structure-page', 'archive-page', 'tools', 'settings'];
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
  v.classList.remove('view-enter');
  void v.offsetWidth; // รีสตาร์ทแอนิเมชันถ้ากดซ้ำ
  v.classList.add('view-enter');
}
document.getElementById('view')?.addEventListener('animationend', e => {
  if (e.target === e.currentTarget) e.currentTarget.classList.remove('view-enter');
});

// หน้าที่ต้องโหลดสคริปต์เพิ่มก่อนวาด (ดู LAZY_MODULES ใน utils.js)
const ROUTE_MODULES = { 'report-page': 'report', tools: 'tools' };

function navigate(route) {
  AppState.flushScoreSaves?.(); // กันคะแนนหายถ้าเพิ่งพิมพ์คะแนนแล้วรีบกดออกจากหน้าวิชา
  AppState.currentRoute = route;
  AppState.currentCourseId = null;
  setActiveNav(route);
  closeMobileNav();
  document.getElementById('app')?.classList.remove('more-open');

  const mod = ROUTE_MODULES[route];
  if (!mod) { renderRoute(route); playViewEnter(); return; }

  // โหลดสคริปต์ของหน้านั้นครั้งแรก — ถ้าผู้ใช้เปลี่ยนหน้าไปก่อนโหลดเสร็จ ไม่ต้องวาดทับ
  const view = document.getElementById('view');
  if (view) view.innerHTML = `<div class="empty-state">กำลังโหลด...</div>`;
  loadModule(mod).then(() => {
    if (AppState.currentRoute === route) { renderRoute(route); playViewEnter(); }
  }).catch(err => {
    console.error(err);
    if (AppState.currentRoute !== route) return;
    if (view) view.innerHTML = `<div class="card"><div class="empty-state">${escapeHtml(err.message)}<br><button type="button" class="btn btn-ghost btn-sm" id="retry-route-btn">ลองใหม่</button></div></div>`;
    document.getElementById('retry-route-btn')?.addEventListener('click', () => navigate(route));
  });
}

function renderRoute(route) {
  if (route === 'dashboard') renderDashboard();
  else if (route === 'courses') renderCoursesList();
  else if (route === 'archive-page') renderArchivePage();
  else if (route === 'structure-page') { AppState.structureEditingCourseId = null; renderStructurePage(); }
  else if (route === 'scores-page') renderScoresPage();
  else if (route === 'report-page') renderReportPage();
  else if (route === 'tools') renderToolsPage();
  else if (route === 'settings') renderSettings();
}

function renderSettings() {
  const view = document.getElementById('view');
  const u = AppState.user;
  view.innerHTML = `
    <div class="card card-pad u-maxw-420">
      <div class="u-flex u-items-center u-gap-12 u-mb-16">
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
    <div class="card card-pad u-maxw-420 u-mt-14">
      <div class="u-semibold">ธีม</div>
      <div class="u-note">เลือกโหมดสว่าง โหมดมืด หรือให้ตามการตั้งค่าของอุปกรณ์</div>
      <div class="theme-seg" role="group" aria-label="ธีม">
        <button type="button" class="theme-opt" data-theme-pref="auto">${icon('contrast')}ตามระบบ</button>
        <button type="button" class="theme-opt" data-theme-pref="light">${icon('sun')}สว่าง</button>
        <button type="button" class="theme-opt" data-theme-pref="dark">${icon('moon')}มืด</button>
      </div>
    </div>
    <div class="card card-pad u-maxw-420 u-mt-14">
      <div class="u-semibold">ความเป็นส่วนตัวและข้อมูลของฉัน</div>
      <div class="u-note u-lh-165 u-mt-4">
        แอปเก็บชื่อ อีเมล รูปโปรไฟล์ของครู และข้อมูลรายวิชา นักเรียน (ซึ่งเป็นข้อมูลส่วนบุคคลของผู้เยาว์) และคะแนน บน Google Firebase โดยผูกกับบัญชีของครูเท่านั้น
        หน้าหลักส่งพิกัดโดยประมาณ (ปัดเหลือราว 1 กม.) ไปยัง Open-Meteo เพื่อแสดงสภาพอากาศ โดยไม่ส่งข้อมูลนักเรียน
        ครูควรใช้ข้อมูลนักเรียนเท่าที่จำเป็นและตามนโยบายของโรงเรียน
      </div>
      <div class="u-flex u-gap-8 u-wrap u-mt-12">
        <button type="button" class="btn btn-ghost btn-sm" id="privacy-export-btn">ส่งออกข้อมูลของฉัน (JSON)</button>
        <button type="button" class="btn btn-danger-ghost btn-sm" id="privacy-delete-btn">ลบบัญชีและข้อมูลทั้งหมด</button>
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
    view.querySelectorAll('.theme-opt').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themePref === cur)));
  };
  view.querySelectorAll('.theme-opt').forEach(b => b.addEventListener('click', () => {
    setThemePref(b.dataset.themePref);
    syncThemeButtons();
  }));
  syncThemeButtons();
  initNavPill(view.querySelector('.theme-seg'), '.theme-opt', 'seg-pill', { activeSel: '[aria-pressed="true"]', watch: true });
}

initNavPill(document.querySelector('.nav-list'), '.nav-item', 'nav-pill', { global: true });

document.querySelectorAll('.nav-item[data-route]').forEach(el => {
  el.addEventListener('click', () => navigate(el.dataset.route));
});

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
  const src = k => k === 'logout' ? document.getElementById('logout-btn') : document.querySelector(`.nav-item[data-route="${k}"]`);
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

  ['structure-page', 'archive-page', 'tools', 'settings', 'logout'].forEach(k => {
    const s = src(k); if (!s) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'more-tile'; b.dataset.route = k === 'logout' ? 'logout-btn' : k;
    b.innerHTML = `<span class="more-ico">${iconOf(s)}</span><span>${s.querySelector('.nav-label')?.textContent || ''}</span>`;
    b.addEventListener('click', () => { setMore(false); if (k === 'logout') s.click(); else navigate(k); });
    grid.appendChild(b);
  });

  initNavPill(bar, '.tab-item', 'tab-pill', { global: true });
  document.getElementById('more-scrim')?.addEventListener('click', () => setMore(false));
  setActiveNav((typeof AppState !== 'undefined' && AppState.currentRoute) || 'dashboard');
})();
