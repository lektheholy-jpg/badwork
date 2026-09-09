// ==========================================================================
// Top-level pages that start with a course picker (dropdown), matching the
// reference UI where you choose the course first instead of drilling into
// a course detail page.
// ==========================================================================

async function loadCourseOptions() {
  const uid = AppState.user.uid;
  const snap = await db.collection('users').doc(uid).collection('courses').orderBy('createdAt', 'desc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => !c.archived);
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
  const course = courses.find(c => c.id === selectedId) || null;

  const uid = AppState.user.uid;
  const sections = course ? await loadSections(uid, course.id) : [];
  AppState.sections = sections; // ใช้โดย openAddRoomModal/confirmDeleteSection เพื่อคำนวณลำดับห้อง/ข้อความยืนยัน

  view.innerHTML = `
    <div class="page-header" style="display:flex; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; gap:10px;">
      <div>
        <h1>⚙️ ตั้งค่าโครงสร้างวิชา</h1>
        <div class="sub">จัดการรายวิชา ห้องเรียน และสัดส่วนคะแนน — ตั้งครั้งเดียว ใช้ร่วมกันทุกห้องของวิชานี้</div>
      </div>
      <div style="display:flex; gap:8px;">
        ${course ? `<button class="btn btn-danger-ghost btn-sm" id="struct-del-course-btn">🗑️ ลบวิชานี้</button>` : ''}
        <button class="btn btn-primary btn-sm" id="struct-new-course-btn">+ สร้างรายวิชาใหม่</button>
      </div>
    </div>
    ${courseSelectorHtml(courses, selectedId, 'structure-course-select')}
    ${course ? `
      <div class="card card-pad" style="margin-bottom:16px;">
        <div style="font-weight:600; font-size:13.5px; margin-bottom:10px;">ห้องเรียนของวิชานี้</div>
        <div class="room-pills" id="struct-room-pills" style="margin-bottom:0;">
          ${sections.map(s => `
            <div class="room-pill-wrap">
              <span class="room-pill" style="cursor:default;">ห้อง ${escapeHtml(s.room)}</span>
              <button class="room-pill-del" data-section-id="${s.id}" data-room-label="${escapeHtml(s.room)}" title="ลบห้องนี้">×</button>
            </div>
          `).join('')}
          <button class="room-pill room-pill-add" id="struct-add-room-btn">+ เพิ่มห้อง</button>
        </div>
        ${sections.length === 0 ? `<div class="empty-state" style="padding:10px 0 0;">ยังไม่มีห้องเรียนในวิชานี้ กด "+ เพิ่มห้อง" เพื่อเริ่มต้น</div>` : ''}
      </div>
    ` : ''}
    <div id="structure-page-body"></div>
  `;

  document.getElementById('struct-new-course-btn').addEventListener('click', () => {
    openCreateCourseModal((newCourseId) => {
      AppState.structurePageCourseId = newCourseId;
      renderStructurePage();
    });
  });

  const delCourseBtn = document.getElementById('struct-del-course-btn');
  if (delCourseBtn) {
    delCourseBtn.addEventListener('click', () => {
      confirmDeleteCourse(course, () => {
        AppState.structurePageCourseId = null;
        renderStructurePage();
      });
    });
  }

  if (course) {
    document.getElementById('struct-add-room-btn').addEventListener('click', () => {
      openAddRoomModal(course, () => renderStructurePage());
    });
    view.querySelectorAll('#struct-room-pills .room-pill-del').forEach(btn => {
      btn.addEventListener('click', () => {
        confirmDeleteSection(course, btn.dataset.sectionId, btn.dataset.roomLabel, () => renderStructurePage());
      });
    });
  }

  if (!selectedId) return;
  const sel = document.getElementById('structure-course-select');
  sel.addEventListener('change', () => {
    AppState.structurePageCourseId = sel.value;
    renderStructurePage();
  });

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
