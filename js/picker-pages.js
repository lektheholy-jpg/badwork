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
    <div class="card card-pad picker-bar">
      <div class="picker-label">เลือกรายวิชา</div>
      <select id="${selectId}" class="picker-select">
        ${courses.map(c => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${escapeHtml(c.code ? c.code + ' - ' : '')}${escapeHtml(c.name)}${c.level ? ' (' + escapeHtml(c.level) + ')' : ''}</option>`).join('')}
      </select>
      <span class="picker-note">ภาคเรียน ${escapeHtml(courses.find(c => c.id === selectedId)?.semester || '-')}/${escapeHtml(courses.find(c => c.id === selectedId)?.year || '-')}</span>
    </div>
  `;
}

function roomSelectorHtml(sections, selectedId, selectId) {
  if (sections.length === 0) {
    return `<div class="card"><div class="empty-state"><div class="icon">🏫</div>วิชานี้ยังไม่มีห้องเรียน กรุณาเพิ่มห้องในหน้ารายวิชาก่อน</div></div>`;
  }
  return `
    <div class="card card-pad picker-bar">
      <div class="picker-label">เลือกห้อง</div>
      <select id="${selectId}" class="picker-select picker-select-sm">
        ${sections.map(s => `<option value="${s.id}" ${s.id === selectedId ? 'selected' : ''}>ห้อง ${escapeHtml(s.room)}</option>`).join('')}
      </select>
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
      <div class="sub">กำหนดสัดส่วนคะแนน + รายการคะแนนเก็บ — ตั้งครั้งเดียว ใช้ร่วมกันทุกห้องของวิชานี้</div>
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
    <div id="scores-room-selector"></div>
    <div id="scores-page-body"></div>
  `;

  if (!selectedId) return;
  const sel = document.getElementById('scores-course-select');
  sel.addEventListener('change', () => {
    AppState.scoresPageCourseId = sel.value;
    AppState.scoresPageSectionId = null;
    renderScoresPage();
  });

  const course = courses.find(c => c.id === selectedId);
  const uid = AppState.user.uid;
  const sections = await loadSections(uid, course.id);
  const selectedSectionId = AppState.scoresPageSectionId && sections.some(s => s.id === AppState.scoresPageSectionId)
    ? AppState.scoresPageSectionId : (sections[0]?.id || null);
  AppState.scoresPageSectionId = selectedSectionId;

  document.getElementById('scores-room-selector').innerHTML = roomSelectorHtml(sections, selectedSectionId, 'scores-room-select');
  if (!selectedSectionId) return;

  const roomSel = document.getElementById('scores-room-select');
  roomSel.addEventListener('change', () => {
    AppState.scoresPageSectionId = roomSel.value;
    renderScoresPage();
  });

  const section = sections.find(s => s.id === selectedSectionId);
  renderScoresTab(document.getElementById('scores-page-body'), course, section);
}
