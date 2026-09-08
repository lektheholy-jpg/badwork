// ==========================================================================
// Top-level pages that start with a course picker (dropdown), matching the
// reference UI where you choose the course first instead of drilling into
// a course detail page.
// ==========================================================================

async function loadCourseOptions() {
  const uid = AppState.user.uid;
  const snap = await db.collection('users').doc(uid).collection('courses').orderBy('createdAt', 'desc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function courseSelectorHtml(courses, selectedId, selectId) {
  if (courses.length === 0) {
    return `<div class="card"><div class="empty-state"><div class="icon">📚</div>ยังไม่มีรายวิชา กรุณาสร้างรายวิชาก่อน</div></div>`;
  }
  return `
    <div class="card card-pad" style="margin-bottom:18px; display:flex; align-items:center; gap:12px;">
      <div style="font-size:13px; font-weight:600; color:var(--ink-soft); white-space:nowrap;">เลือกรายวิชา</div>
      <select id="${selectId}" style="flex:1; max-width:420px; padding:9px 11px; border:1px solid var(--border); border-radius:6px; font-size:14px; font-family:inherit;">
        ${courses.map(c => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${escapeHtml(c.code ? c.code + ' - ' : '')}${escapeHtml(c.name)}${c.level ? ' (' + escapeHtml(c.level) + (c.room ? '/' + escapeHtml(c.room) : '') + ')' : ''}</option>`).join('')}
      </select>
      <span style="font-size:12.5px; color:var(--ink-soft);">ภาคเรียน ${escapeHtml(courses.find(c => c.id === selectedId)?.semester || '-')}/${escapeHtml(courses.find(c => c.id === selectedId)?.year || '-')}</span>
    </div>
  `;
}

async function renderStructurePage() {
  const view = document.getElementById('view');
  view.innerHTML = `<div class="empty-state">กำลังโหลด...</div>`;
  const courses = await loadCourseOptions();
  AppState.pickerCourses = courses;
  const selectedId = AppState.structurePageCourseId || courses[0]?.id || null;
  AppState.structurePageCourseId = selectedId;

  view.innerHTML = `
    <div class="page-header">
      <h1>⚙️ ตั้งค่าโครงสร้างวิชา</h1>
      <div class="sub">กำหนดสัดส่วนคะแนน + รายการคะแนนเก็บประจำรายวิชา</div>
    </div>
    ${courseSelectorHtml(courses, selectedId, 'structure-course-select')}
    <div id="structure-page-body"></div>
  `;

  if (!selectedId) return;
  const sel = document.getElementById('structure-course-select');
  sel.addEventListener('change', () => {
    AppState.structurePageCourseId = sel.value;
    renderStructurePage();
  });

  const course = courses.find(c => c.id === selectedId);
  renderStructureTab(document.getElementById('structure-page-body'), course);
}

async function renderScoresPage() {
  const view = document.getElementById('view');
  view.innerHTML = `<div class="empty-state">กำลังโหลด...</div>`;
  const courses = await loadCourseOptions();
  AppState.pickerCourses = courses;
  const selectedId = AppState.scoresPageCourseId || courses[0]?.id || null;
  AppState.scoresPageCourseId = selectedId;

  view.innerHTML = `
    <div class="page-header">
      <h1>📝 บันทึกคะแนน</h1>
      <div class="sub">บันทึกคะแนนรายบุคคลแบบตาราง พร้อมคำนวณรวมและเกรดอัตโนมัติ</div>
    </div>
    ${courseSelectorHtml(courses, selectedId, 'scores-course-select')}
    <div id="scores-page-body"></div>
  `;

  if (!selectedId) return;
  const sel = document.getElementById('scores-course-select');
  sel.addEventListener('change', () => {
    AppState.scoresPageCourseId = sel.value;
    renderScoresPage();
  });

  const course = courses.find(c => c.id === selectedId);
  renderScoresTab(document.getElementById('scores-page-body'), course);
}
