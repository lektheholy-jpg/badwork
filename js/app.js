// ==========================================================================
// Router
// ==========================================================================

function setActiveNav(routeId) {
  document.querySelectorAll('.nav-item[data-route]').forEach(el => {
    el.classList.toggle('active', el.dataset.route === routeId);
  });
}

function navigate(route) {
  AppState.flushScoreSaves?.(); // กันคะแนนหายถ้าเพิ่งพิมพ์คะแนนแล้วรีบกดออกจากหน้าวิชา
  AppState.currentRoute = route;
  AppState.currentCourseId = null;
  setActiveNav(route);
  closeMobileNav();

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
document.getElementById('sidebar-toggle')?.addEventListener('click', toggleSidebarCollapse);
