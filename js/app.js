// ==========================================================================
// Router
// ==========================================================================

function setActiveNav(routeId) {
  document.querySelectorAll('.nav-item[data-route]').forEach(el => {
    el.classList.toggle('active', el.dataset.route === routeId);
  });
}

function navigate(route) {
  AppState.currentRoute = route;
  AppState.currentCourseId = null;
  setActiveNav(route);

  if (route === 'dashboard') renderDashboard();
  else if (route === 'courses') renderCoursesList();
  else if (route === 'structure-page') renderStructurePage();
  else if (route === 'scores-page') renderScoresPage();
  else if (route === 'settings') renderSettings();
}

function renderSettings() {
  const view = document.getElementById('view');
  const u = AppState.user;
  view.innerHTML = `
    <div class="page-header"><h1>ตั้งค่า</h1><div class="sub">ข้อมูลบัญชีของคุณ</div></div>
    <div class="card card-pad" style="max-width:420px;">
      <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
        <img src="${u.photoURL || ''}" style="width:48px; height:48px; border-radius:50%;">
        <div>
          <div style="font-weight:600;">${escapeHtml(u.displayName || '')}</div>
          <div style="font-size:12.5px; color:var(--ink-soft);">${escapeHtml(u.email || '')}</div>
        </div>
      </div>
      <div style="font-size:13px; color:var(--ink-soft);">
        ข้อมูลรายวิชา นักเรียน และคะแนนของคุณจะถูกเก็บแยกจากครูคนอื่นโดยอัตโนมัติ ผ่านบัญชี Google ของคุณ
      </div>
    </div>
  `;
}

document.querySelectorAll('.nav-item[data-route]').forEach(el => {
  el.addEventListener('click', () => navigate(el.dataset.route));
});
