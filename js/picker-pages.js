// ==========================================================================
// Top-level pages that start with a course picker (dropdown), matching the
// reference UI where you choose the course first instead of drilling into
// a course detail page.
// ==========================================================================

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
  return groupsByLevelHtml(courses, {
    levelOf: c => c.level,
    listClass: 'course-list struct-list',
    rowFn: c => structureRowHtml(c),
  });
}

function structureRowHtml(c) {
  const col = getLevelColor(c.level);
  return `
    <div class="course-row struct-row ${c.archived ? 'is-archived' : ''}" data-course-id="${c.id}" style="--w:${courseColor(c)};">
      <label class="switch" title="${c.archived ? 'ปิดใช้งานอยู่ — กดเพื่อใช้ในเทอมนี้' : 'กำลังใช้งานเทอมนี้ — กดเพื่อปิด'}">
        <input type="checkbox" class="struct-toggle" data-course-id="${c.id}" ${c.archived ? '' : 'checked'}>
        <span class="switch-slider"></span>
      </label>
      <div class="info">
        <div class="name">
          <span class="struct-code" style="--c:${col.strong}">${escapeHtml(c.code || 'ไม่มีรหัส')}</span>
          <span class="struct-course-name">${escapeHtml(c.name)}</span>
        </div>
        <div class="meta">
          <span class="badge struct-level-badge" style="--c:${col.strong}">${escapeHtml(c.level || 'ไม่ระบุระดับชั้น')}</span>
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
    <div class="page-header u-flex u-wrap u-gap-10">
      <button class="btn btn-primary btn-sm u-ml-auto" id="struct-new-course-btn">+ สร้างรายวิชาใหม่</button>
    </div>
    ${courses.length === 0 ? `
      <div class="card"><div class="empty-state">
        <div class="icon">${icon('book')}</div>
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

  // สำคัญ: ต้อง stopPropagation ที่ label.switch (ไม่ใช่แค่ input) เพราะ input ถูกทำ
  // opacity:0 / width:0 / height:0 (ซ่อนไว้ใช้แค่ state) จุดที่ผู้ใช้คลิกจริงคือ
  // span.switch-slider ที่มองเห็น ซึ่ง event 'click' จะ bubble จาก span ผ่าน label ขึ้นไปที่
  // .struct-row ก่อนที่ browser จะ synthesize click แยกไปที่ input เสียอีก — ถ้า stopPropagation
  // ไว้ที่ input อย่างเดียว event ตัวจริง (target = span) จะหลุดไปโดน .struct-row แล้วเด้งเข้า
  // หน้าแก้ไขโครงสร้างแทนที่จะแค่ toggle
  view.querySelectorAll('.switch').forEach(label => {
    label.addEventListener('click', (e) => e.stopPropagation());
  });
  view.querySelectorAll('.struct-toggle').forEach(toggle => {
    toggle.addEventListener('change', async () => {
      const courseId = toggle.dataset.courseId;
      const course = courses.find(c => c.id === courseId);
      const nowArchived = !toggle.checked;
      await db.collection('users').doc(AppState.user.uid).collection('courses').doc(courseId)
        .update({ archived: nowArchived });
      invalidateCourseData();
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
    <div class="crumb"><a href="#" id="struct-back-to-list" class="u-link-plain">ตั้งค่าโครงสร้างวิชา</a> / <b>${escapeHtml(course.code ? course.code + ' - ' : '')}${escapeHtml(course.name)}</b></div>
    <div class="page-header u-flex u-items-start u-between u-wrap u-gap-10">
      <div>
        <h1>${escapeHtml(course.code ? course.code + ' • ' : '')}${escapeHtml(course.name)} ${course.archived ? '<span class="badge badge-neutral u-badge-inline">ปิดใช้งาน</span>' : '<span class="badge badge-success u-badge-inline">กำลังใช้งาน</span>'}</h1>
        <div class="sub">${escapeHtml(course.level || 'ไม่ระบุระดับชั้น')} • ภาคเรียน ${escapeHtml(course.semester || '-')}/${escapeHtml(course.year || '-')}</div>
      </div>
      <button class="btn btn-danger-ghost btn-sm" id="struct-del-course-btn">ลบวิชานี้</button>
    </div>
    <div class="card card-pad u-mb-16">
      <div class="u-flex u-items-center u-between u-mb-10 u-wrap u-gap-8">
        <div class="u-semibold u-fs-135">ห้องเรียนของวิชานี้</div>
        <button class="btn btn-ghost btn-sm" id="struct-import-all-btn">นำเข้ารายชื่อ (แยกห้องอัตโนมัติ)</button>
      </div>
      <div class="room-pills u-mb-0" id="struct-room-pills">
        ${sections.map(s => `
          <div class="room-pill-wrap">
            <span class="room-pill u-cursor-default">ห้อง ${escapeHtml(s.room)}</span>
            <button class="room-pill-del" data-section-id="${s.id}" data-room-label="${escapeHtml(s.room)}" title="ลบห้องนี้">×</button>
          </div>
        `).join('')}
        <button class="room-pill room-pill-add" id="struct-add-room-btn">+ เพิ่มห้อง</button>
      </div>
      ${sections.length === 0 ? `<div class="empty-state u-pt-10">ยังไม่มีห้องเรียนในวิชานี้ กด "+ เพิ่มห้อง" เพื่อเริ่มต้น</div>` : ''}
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
  document.getElementById('struct-import-all-btn').addEventListener('click', () => {
    openImportAllRoomsModal(course, sections, () => renderStructureEditor(view, courseId));
  });
  view.querySelectorAll('#struct-room-pills .room-pill-del').forEach(btn => {
    btn.addEventListener('click', () => {
      confirmDeleteSection(course, btn.dataset.sectionId, btn.dataset.roomLabel, () => renderStructureEditor(view, courseId));
    });
  });

  renderStructureTab(document.getElementById('structure-page-body'), course);
}

// ==========================================================================
// หน้าบันทึกคะแนน: เลือกด้วยการ์ดแบบเดียวกับหน้าแรก จัดกลุ่มตามระดับชั้น
// แล้วตามด้วยรายวิชา — เลือกห้องแล้วเข้าสู่ตารางบันทึกคะแนนทันที
// ==========================================================================

// ใช้ข้อมูลจากแคชกลาง loadCoursesWithGrades() (dashboard.js) ร่วมกับหน้าแรก/หน้ารายงาน
// ไม่ยิง Firestore ซ้ำ — คะแนน/นักเรียน/ห้อง/โครงสร้างที่แก้แล้วจะล้างแคชวิชานั้นเอง (invalidateCourseData)
// คืนค่า { courses, cards } โดย cards = [{ course, sections: [{ section, studentCount, progress }] }]
async function loadScoresPickerCards() {
  const { courses, sectionCards } = await loadCoursesWithGrades();
  const cardsByCourse = new Map();
  sectionCards.forEach(c => {
    if (!cardsByCourse.has(c.courseId)) cardsByCourse.set(c.courseId, []);
    cardsByCourse.get(c.courseId).push({
      section: { id: c.sectionId, room: c.room },
      studentCount: c.studentCount,
      progress: c.progress,
    });
  });
  const cards = courses.map(course => ({ course, sections: cardsByCourse.get(course.id) || [] }));
  return { courses, cards };
}

function scoresPickerGroupsHtml(cards) {
  return groupsByLevelHtml(cards, {
    levelOf: c => c.course.level,
    listClass: 'scores-subject-list',
    rowFn: c => scoresSubjectBlockHtml(c),
  });
}

function scoresSubjectBlockHtml({ course, sections }) {
  const col = getLevelColor(course.level);
  return `
    <div class="scores-subject-block">
      <div class="scores-subject-title" style="--c:${col.strong}">
        <span class="struct-code" style="--c:${col.strong}">${escapeHtml(course.code || 'ไม่มีรหัส')}</span>
        <span class="struct-course-name">${escapeHtml(course.name)}</span>
      </div>
      ${sections.length === 0 ? `
        <div class="empty-state u-pt-10 u-text-left">วิชานี้ยังไม่มีห้องเรียน</div>
      ` : `
        <div class="section-card-grid">
          ${sections.map(({ section, studentCount, progress }) => `
            <div class="section-card" style="--w:${courseColor(course) || col.strong}" data-course-id="${course.id}" data-section-id="${section.id}">
              <div class="section-card-top">
                <span class="course-dot" style="--c:${courseColor(course) || col.strong}"></span>
                <span class="section-card-room">ห้อง ${escapeHtml(section.room)}</span>
              </div>
              <div class="section-card-name">${escapeHtml(course.name)}</div>
              <div class="section-card-meta">${studentCount} คน</div>
              <div class="progress-bar"><div class="fill" style="--p:${progress}%; --c:${courseColor(course) || col.strong}"></div></div>
              <div class="section-card-pct">${progress}% บันทึกแล้ว</div>
            </div>
          `).join('')}
        </div>
      `}
    </div>
  `;
}

async function renderScoresPage() {
  const view = document.getElementById('view');
  view.innerHTML = `<div class="empty-state">กำลังโหลด...</div>`;

  const selCourseId = AppState.scoresPageCourseId;
  const selSectionId = AppState.scoresPageSectionId;

  // ยังไม่ได้เลือกวิชา/ห้อง (หรือกด "เลือกวิชาอื่น") -> แสดงการ์ดเลือกแยกชั้น/วิชา แบบหน้าแรก
  if (!selCourseId || !selSectionId) {
    const { courses, cards } = await loadScoresPickerCards();
    AppState.pickerCourses = courses;

    if (courses.length === 0) {
      view.innerHTML = `
        <div class="card"><div class="empty-state"><div class="icon">${icon('book')}</div>ยังไม่มีรายวิชา กรุณาสร้างรายวิชาก่อน</div></div>
      `;
      return;
    }

    view.innerHTML = `
      ${scoresPickerGroupsHtml(cards)}
    `;

    view.querySelectorAll('.section-card').forEach(card => {
      card.addEventListener('click', () => {
        AppState.scoresPageCourseId = card.dataset.courseId;
        AppState.scoresPageSectionId = card.dataset.sectionId;
        renderScoresPage();
      });
    });
    return;
  }

  // เลือกแล้ว -> แสดงตารางบันทึกคะแนน พร้อมทางกลับไปเลือกวิชา/ห้องอื่น
  const uid = AppState.user.uid;
  const courseDoc = await db.collection('users').doc(uid).collection('courses').doc(selCourseId).get();
  if (!courseDoc.exists) {
    AppState.scoresPageCourseId = null;
    AppState.scoresPageSectionId = null;
    return renderScoresPage();
  }
  const course = { id: courseDoc.id, ...courseDoc.data() };
  const sections = await loadSections(uid, course.id);
  const section = sections.find(s => s.id === selSectionId);
  if (!section) {
    AppState.scoresPageCourseId = null;
    AppState.scoresPageSectionId = null;
    return renderScoresPage();
  }

  view.innerHTML = `
    <div class="crumb"><a href="#" id="scores-back-to-picker" class="u-link-plain">บันทึกคะแนน</a> / <b>${escapeHtml(course.code ? course.code + ' - ' : '')}${escapeHtml(course.name)} • ห้อง ${escapeHtml(section.room)}</b></div>
    <div class="page-header">
      <h1>${escapeHtml(course.code ? course.code + ' • ' : '')}${escapeHtml(course.name)}</h1>
      <div class="sub">${escapeHtml(course.level || '')} • ห้อง ${escapeHtml(section.room)}</div>
    </div>
    <div id="scores-page-body"></div>
  `;

  document.getElementById('scores-back-to-picker').addEventListener('click', (e) => {
    e.preventDefault();
    AppState.scoresPageCourseId = null;
    AppState.scoresPageSectionId = null;
    renderScoresPage();
  });

  renderScoresTab(document.getElementById('scores-page-body'), course, section);
}
