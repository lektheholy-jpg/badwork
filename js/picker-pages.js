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

// รหัสวิชาใช้เป็นคีย์หลักในการเรียงและอ้างอิงในหน้านี้ — โหลดวิชา "ทั้งหมด"
// (รวมที่ปิดใช้งาน/เก็บเข้าคลังแล้ว) เพื่อให้ครูเปิด/ปิดใช้งานได้จากลิสต์เดียว
async function loadAllCoursesForStructure() {
  const uid = AppState.user.uid;
  const snap = await db.collection('users').doc(uid).collection('courses').orderBy('createdAt', 'desc').get();
  const courses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  courses.sort((a, b) => (a.code || '').localeCompare(b.code || '', 'th') || (a.name || '').localeCompare(b.name || '', 'th'));
  return courses;
}

async function renderStructurePage() {
  const view = document.getElementById('view');
  view.innerHTML = `<div class="empty-state">กำลังโหลด...</div>`;

  if (AppState.structureEditingCourseId) {
    return renderStructureEditor(view, AppState.structureEditingCourseId);
  }
  return renderStructureList(view);
}

// จัดกลุ่มรายวิชาตามระดับชั้น (ม.1-ม.6 ตามลำดับ แล้วตามด้วยวิชาที่ไม่ระบุระดับชั้น)
// แต่ละกลุ่มมีสีอ่อนประจำระดับชั้นของตัวเอง ช่วยแยกสายตาเมื่อมีหลายวิชา
function renderStructureGroupsHtml(courses) {
  const groups = LEVEL_OPTIONS.map(level => ({ level, courses: courses.filter(c => c.level === level) }))
    .filter(g => g.courses.length > 0);
  const noLevel = courses.filter(c => !LEVEL_OPTIONS.includes(c.level));
  if (noLevel.length > 0) groups.push({ level: null, courses: noLevel });

  return `
    <div class="struct-groups">
      ${groups.map(g => {
        const col = getLevelColor(g.level);
        return `
          <div class="struct-group">
            <div class="struct-group-header" style="background:${col.tint}; color:${col.strong};">
              <span class="struct-group-title">${g.level ? g.level : 'ไม่ระบุระดับชั้น'}</span>
              <span class="struct-group-count">${g.courses.length} วิชา</span>
            </div>
            <div class="course-list struct-list">
              ${g.courses.map(c => structureRowHtml(c)).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function structureRowHtml(c) {
  const col = getLevelColor(c.level);
  return `
    <div class="course-row struct-row ${c.archived ? 'is-archived' : ''}" data-course-id="${c.id}" style="border-left:4px solid ${c.archived ? 'var(--border)' : col.strong};">
      <label class="switch" title="${c.archived ? 'ปิดใช้งานอยู่ — กดเพื่อใช้ในเทอมนี้' : 'กำลังใช้งานเทอมนี้ — กดเพื่อปิด'}">
        <input type="checkbox" class="struct-toggle" data-course-id="${c.id}" ${c.archived ? '' : 'checked'}>
        <span class="switch-slider"></span>
      </label>
      <div class="info">
        <div class="name">
          <span class="struct-code" style="color:${c.archived ? 'var(--ink-soft)' : col.strong};">${escapeHtml(c.code || 'ไม่มีรหัส')}</span>
          <span class="struct-course-name">${escapeHtml(c.name)}</span>
        </div>
        <div class="meta">
          <span class="badge struct-level-badge" style="background:${col.tint}; color:${col.strong};">${escapeHtml(c.level || 'ไม่ระบุระดับชั้น')}</span>
          ภาคเรียน ${escapeHtml(c.semester || '-')}/${escapeHtml(c.year || '-')} • ${c.roomCount || 0} ห้อง
          ${c.archived ? '<span class="struct-status-tag">ปิดใช้งาน</span>' : '<span class="struct-status-tag is-active">กำลังใช้งาน</span>'}
        </div>
      </div>
      <div class="struct-row-actions">
        <button class="btn btn-ghost btn-sm struct-edit-btn" data-course-id="${c.id}">แก้ไขโครงสร้าง</button>
        <button class="btn btn-danger-ghost btn-sm struct-del-btn" data-course-id="${c.id}">ลบ</button>
      </div>
    </div>
  `;
}

async function renderStructureList(view) {
  const courses = await loadAllCoursesForStructure();

  view.innerHTML = `
    <div class="page-header" style="display:flex; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; gap:10px;">
      <div>
        <h1>⚙️ ตั้งค่าโครงสร้างวิชา</h1>
        <div class="sub">รายวิชาทั้งหมดของคุณ อ้างอิงด้วยรหัสวิชา — เปิด/ปิดใช้งานเพื่อกำหนดว่าจะใช้วิชาไหนในเทอมนี้ หรือกดแก้ไขเพื่อจัดการห้องเรียนและสัดส่วนคะแนน</div>
      </div>
      <button class="btn btn-primary btn-sm" id="struct-new-course-btn">+ สร้างรายวิชาใหม่</button>
    </div>
    ${courses.length === 0 ? `
      <div class="card"><div class="empty-state">
        <div class="icon">📚</div>
        <div>ยังไม่มีรายวิชา กด "+ สร้างรายวิชาใหม่" เพื่อเริ่มต้น</div>
      </div></div>
    ` : renderStructureGroupsHtml(courses)}
  `;

  document.getElementById('struct-new-course-btn').addEventListener('click', () => {
    openCreateCourseModal((newCourseId) => {
      AppState.structureEditingCourseId = newCourseId;
      renderStructurePage();
    });
  });

  view.querySelectorAll('.struct-toggle').forEach(toggle => {
    toggle.addEventListener('click', (e) => e.stopPropagation());
    toggle.addEventListener('change', async () => {
      const courseId = toggle.dataset.courseId;
      const course = courses.find(c => c.id === courseId);
      const nowArchived = !toggle.checked;
      await db.collection('users').doc(AppState.user.uid).collection('courses').doc(courseId)
        .update({ archived: nowArchived });
      showToast(nowArchived ? `ปิดใช้งาน "${course.name}" สำหรับเทอมนี้แล้ว` : `เปิดใช้งาน "${course.name}" สำหรับเทอมนี้แล้ว`);
      renderStructureList(view);
    });
  });

  view.querySelectorAll('.struct-edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      AppState.structureEditingCourseId = btn.dataset.courseId;
      renderStructurePage();
    });
  });

  view.querySelectorAll('.struct-del-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const course = courses.find(c => c.id === btn.dataset.courseId);
      confirmDeleteCourse(course, () => renderStructureList(view));
    });
  });

  view.querySelectorAll('.struct-row').forEach(row => {
    row.addEventListener('click', () => {
      AppState.structureEditingCourseId = row.dataset.courseId;
      renderStructurePage();
    });
  });
}

async function renderStructureEditor(view, courseId) {
  const uid = AppState.user.uid;
  const courseDoc = await db.collection('users').doc(uid).collection('courses').doc(courseId).get();
  if (!courseDoc.exists) {
    AppState.structureEditingCourseId = null;
    return renderStructurePage();
  }
  const course = { id: courseDoc.id, ...courseDoc.data() };
  const sections = await loadSections(uid, course.id);
  AppState.sections = sections; // ใช้โดย openAddRoomModal/confirmDeleteSection เพื่อคำนวณลำดับห้อง/ข้อความยืนยัน

  view.innerHTML = `
    <div class="crumb"><a href="#" id="struct-back-to-list" style="text-decoration:none; color:inherit;">⚙️ ตั้งค่าโครงสร้างวิชา</a> / <b>${escapeHtml(course.code ? course.code + ' - ' : '')}${escapeHtml(course.name)}</b></div>
    <div class="page-header" style="display:flex; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; gap:10px;">
      <div>
        <h1>${escapeHtml(course.code ? course.code + ' • ' : '')}${escapeHtml(course.name)} ${course.archived ? '<span class="badge badge-neutral" style="vertical-align:middle; margin-left:6px;">ปิดใช้งาน</span>' : '<span class="badge badge-success" style="vertical-align:middle; margin-left:6px;">กำลังใช้งาน</span>'}</h1>
        <div class="sub">${escapeHtml(course.level || 'ไม่ระบุระดับชั้น')} • ภาคเรียน ${escapeHtml(course.semester || '-')}/${escapeHtml(course.year || '-')}</div>
      </div>
      <button class="btn btn-danger-ghost btn-sm" id="struct-del-course-btn">🗑️ ลบวิชานี้</button>
    </div>
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
    <div id="structure-page-body"></div>
  `;

  document.getElementById('struct-back-to-list').addEventListener('click', (e) => {
    e.preventDefault();
    AppState.structureEditingCourseId = null;
    renderStructurePage();
  });

  document.getElementById('struct-del-course-btn').addEventListener('click', () => {
    confirmDeleteCourse(course, () => {
      AppState.structureEditingCourseId = null;
      renderStructurePage();
    });
  });

  document.getElementById('struct-add-room-btn').addEventListener('click', () => {
    openAddRoomModal(course, () => renderStructureEditor(view, courseId));
  });
  view.querySelectorAll('#struct-room-pills .room-pill-del').forEach(btn => {
    btn.addEventListener('click', () => {
      confirmDeleteSection(course, btn.dataset.sectionId, btn.dataset.roomLabel, () => renderStructureEditor(view, courseId));
    });
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
