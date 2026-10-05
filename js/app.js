// ==========================================================================
// Router
// ==========================================================================

function setActiveNav(routeId) {
  document.querySelectorAll('.nav-item[data-route]').forEach(el => {
    el.classList.toggle('active', el.dataset.route === routeId);
  });
  const MORE = ['structure-page', 'archive-page', 'settings'];
  document.querySelectorAll('.tab-item').forEach(el => {
    const on = el.dataset.route === routeId || (!!el.dataset.more && MORE.includes(routeId));
    el.classList.toggle('active', on); // ต้องส่ง boolean จริง ไม่งั้น toggle จะสลับค่าแทนการกำหนดค่า
    if (on) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
  });
}

function navigate(route) {
  AppState.flushScoreSaves?.(); // กันคะแนนหายถ้าเพิ่งพิมพ์คะแนนแล้วรีบกดออกจากหน้าวิชา
  AppState.currentRoute = route;
  AppState.currentCourseId = null;
  setActiveNav(route);
  closeMobileNav();
  document.getElementById('app')?.classList.remove('more-open');

  if (route === 'dashboard') renderDashboard();
  else if (route === 'courses') renderCoursesList();
  else if (route === 'archive-page') renderArchivePage();
  else if (route === 'structure-page') { AppState.structureEditingCourseId = null; renderStructurePage(); }
  else if (route === 'scores-page') renderScoresPage();
  else if (route === 'report-page') renderReportPage();
  else if (route === 'settings') renderSettings();
}

function renderSettings() {
  const view = document.getElementById('view');
  const u = AppState.user;
  view.innerHTML = `
    <div class="page-header"><h1>ตั้งค่า</h1><div class="sub">บัญชีและหน้าตาของแอป</div></div>
    <div class="card card-pad" style="max-width:420px;">
      <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
        <img src="${u.photoURL || ''}" style="width:48px; height:48px; border-radius:50%;">
        <div>
          <div style="font-weight:600;">${escapeHtml(u.displayName || '')}</div>
          <div style="font-size:12.5px; color:var(--ink-soft);">${escapeHtml(u.email || '')}</div>
        </div>
      </div>
      <div style="font-size:13px; color:var(--ink-soft);">
        ข้อมูลรายวิชา ห้องเรียน นักเรียน และคะแนนของคุณจะถูกเก็บแยกจากครูคนอื่นโดยอัตโนมัติ ผ่านบัญชี Google ของคุณ
      </div>
    </div>
    <div class="card card-pad" style="max-width:420px; margin-top:14px;">
      <div style="font-weight:600;">ธีม</div>
      <div style="font-size:13px; color:var(--ink-soft);">เลือกโหมดสว่าง โหมดมืด หรือให้ตามการตั้งค่าของอุปกรณ์</div>
      <div class="theme-seg" role="group" aria-label="ธีม">
        <button type="button" class="theme-opt" data-theme-pref="auto">${icon('contrast')}ตามระบบ</button>
        <button type="button" class="theme-opt" data-theme-pref="light">${icon('sun')}สว่าง</button>
        <button type="button" class="theme-opt" data-theme-pref="dark">${icon('moon')}มืด</button>
      </div>
    </div>
  `;
  const syncThemeButtons = () => {
    const cur = getThemePref();
    view.querySelectorAll('.theme-opt').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themePref === cur)));
  };
  view.querySelectorAll('.theme-opt').forEach(b => b.addEventListener('click', () => {
    setThemePref(b.dataset.themePref);
    syncThemeButtons();
  }));
  syncThemeButtons();
}

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

  ['structure-page', 'archive-page', 'settings', 'logout'].forEach(k => {
    const s = src(k); if (!s) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'more-tile'; b.dataset.route = k === 'logout' ? 'logout-btn' : k;
    b.innerHTML = `<span class="more-ico">${iconOf(s)}</span><span>${s.querySelector('.nav-label')?.textContent || ''}</span>`;
    b.addEventListener('click', () => { setMore(false); if (k === 'logout') s.click(); else navigate(k); });
    grid.appendChild(b);
  });

  document.getElementById('more-scrim')?.addEventListener('click', () => setMore(false));
  setActiveNav((typeof AppState !== 'undefined' && AppState.currentRoute) || 'dashboard');
})();
