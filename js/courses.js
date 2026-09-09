// ==========================================================================
// Courses: list, create (with room/section picker), detail shell (tabs)
// ==========================================================================

function openCreateCourseModal(onCreated, sourceCourse = null) {
  const src = sourceCourse || {};
  openModal(`
    <h2>${sourceCourse ? 'คัดลอกวิชาไปเทอมใหม่' : 'สร้างรายวิชา'}</h2>
    <div class="modal-sub">${sourceCourse ? `คัดลอกโครงสร้างคะแนนจาก "${escapeHtml(sourceCourse.name)}" มาใช้ — แค่ตั้งภาคเรียน/ปี และห้องใหม่ นักเรียน/คะแนนเริ่มต้นใหม่หมด` : 'กรอกข้อมูลพื้นฐานของรายวิชา — ตั้งครั้งเดียว ใช้ได้ทุกห้อง แก้ไขภายหลังได้'}</div>
    <div class="field-row">
      <div class="field"><label>รหัสวิชา</label><input id="f-code" placeholder="เช่น ว33101" value="${escapeHtml(src.code || '')}"></div>
      <div class="field"><label>ชื่อวิชา</label><input id="f-name" placeholder="เช่น วิทยาการคำนวณ" value="${escapeHtml(src.name || '')}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>ระดับชั้น</label><input id="f-level" placeholder="เช่น ม.6" value="${escapeHtml(src.level || '')}"></div>
      <div class="field"><label>สีประจำวิชา</label><input id="f-color" type="color" value="${src.color || '#6B7A4F'}" style="height:38px; padding:3px;"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>ภาคเรียน</label><input id="f-semester" placeholder="1"></div>
      <div class="field"><label>ปีการศึกษา</label><input id="f-year" placeholder="2569"></div>
    </div>
    <div class="field"><label>หน่วยกิต</label><input id="f-credit" placeholder="1.0" value="${escapeHtml(src.credit || '')}"></div>

    <div class="field">
      <label>ห้องที่สอน</label>
      <div class="room-mode-toggle">
        <button type="button" class="room-mode-btn active" data-mode="count">ระบุจำนวนห้อง</button>
        <button type="button" class="room-mode-btn" data-mode="list">พิมพ์เลขห้องเอง</button>
      </div>
      <div id="room-mode-count">
        <input id="f-room-count" type="number" min="1" value="${src.roomCount || 1}" placeholder="เช่น 5">
        <div class="field-hint">ระบบจะสร้างห้อง 1, 2, 3 ... ให้อัตโนมัติตามจำนวนที่ใส่</div>
      </div>
      <div id="room-mode-list" class="hidden">
        <input id="f-room-list" placeholder="เช่น 1,2,3 หรือ 1-5 หรือ ม.6/1, ม.6/2">
        <div class="field-hint">คั่นด้วยจุลภาค (,) ใช้เครื่องหมาย - เพื่อระบุช่วงได้ เช่น 1-6</div>
      </div>
    </div>

    <div class="modal-actions">
      <button class="btn btn-ghost" id="cancel-create">ยกเลิก</button>
      <button class="btn btn-primary" id="submit-create">${sourceCourse ? 'คัดลอกและสร้างวิชา' : 'สร้างรายวิชา'}</button>
    </div>
  `);

  const modeCountBtn = document.querySelector('.room-mode-btn[data-mode="count"]');
  const modeListBtn = document.querySelector('.room-mode-btn[data-mode="list"]');
  let roomMode = 'count';
  modeCountBtn.addEventListener('click', () => {
    roomMode = 'count';
    modeCountBtn.classList.add('active'); modeListBtn.classList.remove('active');
    document.getElementById('room-mode-count').classList.remove('hidden');
    document.getElementById('room-mode-list').classList.add('hidden');
  });
  modeListBtn.addEventListener('click', () => {
    roomMode = 'list';
    modeListBtn.classList.add('active'); modeCountBtn.classList.remove('active');
    document.getElementById('room-mode-list').classList.remove('hidden');
    document.getElementById('room-mode-count').classList.add('hidden');
  });

  document.getElementById('cancel-create').addEventListener('click', closeModal);
  document.getElementById('submit-create').addEventListener('click', async () => {
    const name = document.getElementById('f-name').value.trim();
    if (!name) { showToast('กรุณากรอกชื่อวิชา'); return; }

    let rooms = [];
    if (roomMode === 'count') {
      const n = Math.max(1, Number(document.getElementById('f-room-count').value) || 1);
      rooms = Array.from({ length: n }, (_, i) => String(i + 1));
    } else {
      rooms = parseRoomList(document.getElementById('f-room-list').value);
      if (rooms.length === 0) { showToast('กรุณาใส่เลขห้องอย่างน้อย 1 ห้อง'); return; }
    }

    const submitBtn = document.getElementById('submit-create');
    submitBtn.disabled = true;
    submitBtn.textContent = 'กำลังสร้าง...';

    const uid = AppState.user.uid;
    const data = {
      code: document.getElementById('f-code').value.trim(),
      name,
      level: document.getElementById('f-level').value.trim(),
      semester: document.getElementById('f-semester').value.trim(),
      year: document.getElementById('f-year').value.trim(),
      credit: document.getElementById('f-credit').value.trim(),
      color: document.getElementById('f-color').value,
      roomCount: rooms.length,
      archived: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    const courseRef = await db.collection('users').doc(uid).collection('courses').add(data);

    if (sourceCourse) {
      // คัดลอกโครงสร้างคะแนน (assessments) และเกณฑ์เกรดจากวิชาต้นทาง
      const srcBase = db.collection('users').doc(uid).collection('courses').doc(sourceCourse.id);
      const [assessSnap, gradingDoc] = await Promise.all([
        srcBase.collection('assessments').orderBy('order', 'asc').get(),
        srcBase.collection('settings').doc('grading').get(),
      ]);
      const copyBatch = db.batch();
      assessSnap.docs.forEach(d => {
        copyBatch.set(courseRef.collection('assessments').doc(), d.data());
      });
      copyBatch.set(courseRef.collection('settings').doc('grading'), {
        scale: gradingDoc.exists ? gradingDoc.data().scale : DEFAULT_GRADE_SCALE,
      });
      await copyBatch.commit();
    } else {
      await courseRef.collection('settings').doc('grading').set({ scale: DEFAULT_GRADE_SCALE });
    }

    // สร้างห้องเรียนทั้งหมดในครั้งเดียว (โครงสร้างคะแนนตั้งครั้งเดียว ใช้ร่วมกันทุกห้อง)
    const batch = db.batch();
    rooms.forEach((room, idx) => {
      const secRef = courseRef.collection('sections').doc();
      batch.set(secRef, { room, order: idx, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    });
    await batch.commit();

    closeModal();
    showToast(`สร้างรายวิชาสำเร็จ (${rooms.length} ห้อง)`);
    if (onCreated) onCreated(courseRef.id);
    else openCourse(courseRef.id);
  });
}

async function renderCoursesList() {
  const view = document.getElementById('view');
  view.innerHTML = `<div class="empty-state">กำลังโหลด...</div>`;
  const uid = AppState.user.uid;
  const snap = await db.collection('users').doc(uid).collection('courses').orderBy('createdAt', 'desc').get();
  const courses = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => !c.archived);

  view.innerHTML = `
    <div class="page-header">
      <h1>รายวิชาของฉัน</h1>
      <div class="sub">รายวิชาทั้งหมดที่คุณสอนในภาคเรียนนี้ — จบเทอมแล้วกดเก็บเข้า <a href="#" id="goto-archive" style="color:var(--primary); font-weight:600;">คลังรายวิชา</a> ได้จากหน้ารายวิชานั้น</div>
    </div>
    ${courses.length === 0 ? `
      <div class="card"><div class="empty-state">
        <div class="icon">📚</div>
        <div>ยังไม่มีรายวิชา ไปที่หน้า ⚙️ ตั้งค่าโครงสร้างวิชา เพื่อสร้างรายวิชาแรกของคุณ</div>
      </div></div>
    ` : `
      <div class="course-list">
        ${courses.map(c => `
          <div class="course-row" data-course-id="${c.id}">
            <div class="course-dot" style="background:${c.color || '#6B7A4F'}"></div>
            <div class="info">
              <div class="name">${escapeHtml(c.name)}</div>
              <div class="meta">${escapeHtml(c.code || '')} • ${escapeHtml(c.level || '')} • ${c.roomCount || 0} ห้อง • ภาคเรียน ${escapeHtml(c.semester || '-')}/${escapeHtml(c.year || '-')}</div>
            </div>
            <button class="btn btn-ghost btn-sm">เปิดรายวิชา</button>
          </div>
        `).join('')}
      </div>
    `}
  `;
  view.querySelectorAll('.course-row').forEach(row => {
    row.addEventListener('click', () => openCourse(row.dataset.courseId));
  });
  document.getElementById('goto-archive')?.addEventListener('click', (e) => { e.preventDefault(); navigate('archive-page'); });
}

function openCourse(courseId) {
  AppState.currentRoute = 'course';
  AppState.currentCourseId = courseId;
  AppState.currentSectionId = null;
  AppState.currentTab = 'overview';
  setActiveNav(null);
  renderCourseShell();
}

async function loadSections(uid, courseId) {
  const snap = await db.collection('users').doc(uid).collection('courses').doc(courseId)
    .collection('sections').orderBy('order', 'asc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function renderCourseShell() {
  const uid = AppState.user.uid;
  const courseId = AppState.currentCourseId;
  const courseDoc = await db.collection('users').doc(uid).collection('courses').doc(courseId).get();
  if (!courseDoc.exists) { navigate('courses'); return; }
  const course = { id: courseDoc.id, ...courseDoc.data() };
  AppState.currentCourse = course;

  const sections = await loadSections(uid, courseId);
  AppState.sections = sections;
  if (!AppState.currentSectionId || !sections.some(s => s.id === AppState.currentSectionId)) {
    AppState.currentSectionId = sections[0]?.id || null;
  }
  const section = sections.find(s => s.id === AppState.currentSectionId) || null;

  const tabs = [
    { id: 'overview', label: 'ภาพรวม' },
    { id: 'students', label: 'นักเรียน' },
    { id: 'structure', label: 'โครงสร้างคะแนน' },
    { id: 'scores', label: 'บันทึกคะแนน' },
    { id: 'report', label: 'รายงาน' },
  ];
  // แท็บที่ต้องผูกกับ "ห้อง" ที่เลือกอยู่ (นักเรียน/คะแนน/รายงานแยกตามห้อง)
  const sectionScopedTabs = new Set(['students', 'scores', 'report']);

  const view = document.getElementById('view');
  view.innerHTML = `
    <div class="crumb"><a href="#" id="back-to-courses" style="text-decoration:none; color:inherit;">รายวิชาของฉัน</a> / <b>${escapeHtml(course.name)}</b></div>
    <div class="page-header" style="display:flex; align-items:flex-start; justify-content:space-between; gap:16px; flex-wrap:wrap;">
      <div>
        <h1>${escapeHtml(course.code ? course.code + ' • ' : '')}${escapeHtml(course.name)} ${course.archived ? '<span class="badge badge-neutral" style="vertical-align:middle; margin-left:6px;">📦 อยู่ในคลัง</span>' : ''}</h1>
        <div class="sub">${escapeHtml(course.level || '')} • ภาคเรียน ${escapeHtml(course.semester || '-')}/${escapeHtml(course.year || '-')} • ${sections.length} ห้อง</div>
      </div>
      <div>
        ${course.archived
          ? `<button class="btn btn-ghost btn-sm" id="unarchive-course-btn">↩️ นำกลับมาใช้งาน</button>`
          : `<button class="btn btn-ghost btn-sm" id="archive-course-btn">📦 จบเทอมนี้แล้ว เก็บเข้าคลัง</button>`}
      </div>
    </div>

    ${sections.length > 0 ? `
      <div class="room-pills" id="room-pills">
        ${sections.map(s => `
          <button class="room-pill ${s.id === AppState.currentSectionId ? 'active' : ''}" data-section-id="${s.id}" style="padding:7px 14px;">ห้อง ${escapeHtml(s.room)}</button>
        `).join('')}
      </div>
    ` : `
      <div class="card card-pad" style="margin-bottom:16px;">
        <div class="empty-state" style="padding:0; text-align:left;">ยังไม่มีห้องเรียนในวิชานี้ — ไปเพิ่มห้องได้ที่หน้า ⚙️ ตั้งค่าโครงสร้างวิชา</div>
      </div>
    `}

    <div class="tabs">
      ${tabs.map(t => `<div class="tab ${AppState.currentTab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.label}</div>`).join('')}
    </div>
    <div id="course-tab-body"></div>
  `;

  document.getElementById('back-to-courses').addEventListener('click', (e) => { e.preventDefault(); navigate('courses'); });
  document.getElementById('archive-course-btn')?.addEventListener('click', () => {
    openConfirmModal({
      title: 'เก็บวิชานี้เข้าคลัง?',
      body: `"${escapeHtml(course.name)}" ทุกห้อง นักเรียน และคะแนน จะยังอยู่ครบเหมือนเดิม แค่จะไม่แสดงในหน้าแรก/รายวิชาของฉันอีกต่อไป — ดูย้อนหลังหรือกู้กลับมาได้ทุกเมื่อที่หน้า "คลังรายวิชา"`,
      confirmLabel: 'เก็บเข้าคลัง',
      onConfirm: async () => {
        await db.collection('users').doc(uid).collection('courses').doc(courseId).update({ archived: true, archivedAt: firebase.firestore.FieldValue.serverTimestamp() });
        showToast('เก็บวิชาเข้าคลังแล้ว');
        navigate('courses');
      }
    });
  });
  document.getElementById('unarchive-course-btn')?.addEventListener('click', async () => {
    await db.collection('users').doc(uid).collection('courses').doc(courseId).update({ archived: false });
    showToast('นำวิชากลับมาใช้งานแล้ว');
    renderCourseShell();
  });
  view.querySelectorAll('.room-pill[data-section-id]').forEach(p => {
    p.addEventListener('click', () => {
      AppState.currentSectionId = p.dataset.sectionId;
      renderCourseShell();
    });
  });
  view.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => {
      AppState.currentTab = t.dataset.tab;
      renderCourseShell();
    });
  });

  const body = document.getElementById('course-tab-body');
  if (sectionScopedTabs.has(AppState.currentTab) && !section) {
    body.innerHTML = `<div class="card"><div class="empty-state"><div class="icon">🏫</div>กรุณาเพิ่มห้องเรียนก่อน เพื่อเริ่มเพิ่มนักเรียนและบันทึกคะแนน</div></div>`;
    return;
  }

  if (AppState.currentTab === 'overview') renderCourseOverview(body, course, sections);
  else if (AppState.currentTab === 'students') renderStudentsTab(body, course, section);
  else if (AppState.currentTab === 'structure') renderStructureTab(body, course);
  else if (AppState.currentTab === 'scores') renderScoresTab(body, course, section);
  else if (AppState.currentTab === 'report') renderReportTab(body, course, section);
}

async function renderArchivePage() {
  const view = document.getElementById('view');
  view.innerHTML = `<div class="empty-state">กำลังโหลด...</div>`;
  const uid = AppState.user.uid;
  const snap = await db.collection('users').doc(uid).collection('courses').orderBy('createdAt', 'desc').get();
  const courses = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.archived);

  view.innerHTML = `
    <div class="page-header">
      <h1>📦 คลังรายวิชา</h1>
      <div class="sub">วิชาจากเทอมก่อนหน้าที่เก็บไว้ — ข้อมูลนักเรียนและคะแนนยังอยู่ครบ ดู แก้ไข หรือคัดลอกไปใช้เทอมใหม่ได้ทุกเมื่อ</div>
    </div>
    ${courses.length === 0 ? `
      <div class="card"><div class="empty-state">
        <div class="icon">📦</div>
        <div>ยังไม่มีวิชาในคลัง — จบเทอมแล้วกดปุ่ม "จบเทอมนี้แล้ว เก็บเข้าคลัง" ที่หน้ารายวิชานั้นได้เลย</div>
      </div></div>
    ` : `
      <div class="course-list">
        ${courses.map(c => `
          <div class="course-row" data-course-id="${c.id}" style="cursor:default;">
            <div class="course-dot" style="background:${c.color || '#6B7A4F'}"></div>
            <div class="info">
              <div class="name">${escapeHtml(c.name)}</div>
              <div class="meta">${escapeHtml(c.code || '')} • ${escapeHtml(c.level || '')} • ${c.roomCount || 0} ห้อง • ภาคเรียน ${escapeHtml(c.semester || '-')}/${escapeHtml(c.year || '-')}</div>
            </div>
            <button class="btn btn-ghost btn-sm view-archived-btn" data-course-id="${c.id}">ดูรายละเอียด</button>
            <button class="btn btn-primary btn-sm duplicate-course-btn" data-course-id="${c.id}">📋 คัดลอกไปเทอมใหม่</button>
          </div>
        `).join('')}
      </div>
    `}
  `;

  view.querySelectorAll('.view-archived-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); openCourse(btn.dataset.courseId); });
  });
  view.querySelectorAll('.duplicate-course-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const source = courses.find(c => c.id === btn.dataset.courseId);
      openCreateCourseModal(null, source);
    });
  });
}

function openAddRoomModal(course, onDone) {
  openModal(`
    <h2>เพิ่มห้องเรียน</h2>
    <div class="modal-sub">เพิ่มห้องใหม่ให้วิชา ${escapeHtml(course.name)} — ใช้โครงสร้างคะแนนเดียวกับห้องอื่น</div>
    <div class="field"><label>เลขห้อง</label><input id="new-room-input" placeholder="เช่น 4 หรือ ม.6/4"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="cancel-add-room">ยกเลิก</button>
      <button class="btn btn-primary" id="submit-add-room">เพิ่มห้อง</button>
    </div>
  `);
  document.getElementById('cancel-add-room').addEventListener('click', closeModal);
  document.getElementById('submit-add-room').addEventListener('click', async () => {
    const room = document.getElementById('new-room-input').value.trim();
    if (!room) { showToast('กรุณาใส่เลขห้อง'); return; }
    const uid = AppState.user.uid;
    const courseRef = db.collection('users').doc(uid).collection('courses').doc(course.id);
    await courseRef.collection('sections').add({
      room, order: AppState.sections.length, createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    await courseRef.update({ roomCount: firebase.firestore.FieldValue.increment(1) });
    closeModal();
    showToast('เพิ่มห้องสำเร็จ');
    if (onDone) onDone();
    else renderCourseShell();
  });
}

async function confirmDeleteSection(course, sectionId, roomLabel, onDone) {
  if (AppState.sections.length <= 1) {
    if (!confirm(`ห้อง ${roomLabel} เป็นห้องเดียวที่เหลืออยู่ในวิชานี้ ต้องการลบหรือไม่? (นักเรียนและคะแนนในห้องนี้จะหายไปด้วย)`)) return;
  } else {
    if (!confirm(`ลบห้อง ${roomLabel}? นักเรียนและคะแนนทั้งหมดในห้องนี้จะถูกลบไปด้วย และกู้คืนไม่ได้`)) return;
  }
  const uid = AppState.user.uid;
  const courseRef = db.collection('users').doc(uid).collection('courses').doc(course.id);
  const secRef = courseRef.collection('sections').doc(sectionId);

  showToast('กำลังลบห้อง...');
  await deleteCollectionDocs(secRef.collection('scores'));
  await deleteCollectionDocs(secRef.collection('students'));
  await secRef.delete();
  await courseRef.update({ roomCount: firebase.firestore.FieldValue.increment(-1) });

  if (AppState.currentSectionId === sectionId) AppState.currentSectionId = null;
  showToast('ลบห้องสำเร็จ');
  if (onDone) onDone();
  else renderCourseShell();
}

async function confirmDeleteCourse(course, onDone) {
  const step1 = confirm(`ลบรายวิชา "${course.name}"? การลบจะรวมทุกห้อง นักเรียน คะแนน และโครงสร้างคะแนนของวิชานี้ทั้งหมด และกู้คืนไม่ได้`);
  if (!step1) return;
  const step2 = prompt(`เพื่อยืนยัน พิมพ์ชื่อวิชา "${course.name}" ให้ตรงกันแล้วกดตกลง`);
  if (step2 !== course.name) { showToast('ชื่อวิชาไม่ตรงกัน ยกเลิกการลบ'); return; }

  const uid = AppState.user.uid;
  const courseRef = db.collection('users').doc(uid).collection('courses').doc(course.id);

  showToast('กำลังลบรายวิชา...');
  const sectionsSnap = await courseRef.collection('sections').get();
  for (const secDoc of sectionsSnap.docs) {
    const secRef = secDoc.ref;
    await deleteCollectionDocs(secRef.collection('scores'));
    await deleteCollectionDocs(secRef.collection('students'));
    await secRef.delete();
  }
  await deleteCollectionDocs(courseRef.collection('assessments'));
  await deleteCollectionDocs(courseRef.collection('settings'));
  await courseRef.delete();

  showToast('ลบรายวิชาสำเร็จ');
  if (onDone) onDone();
  else navigate('courses');
}

async function renderCourseOverview(container, course, sections) {
  const uid = AppState.user.uid;
  const base = db.collection('users').doc(uid).collection('courses').doc(course.id);

  const [assessSnap, perSection] = await Promise.all([
    base.collection('assessments').get(),
    Promise.all(sections.map(async (s) => {
      const secBase = base.collection('sections').doc(s.id);
      const [studentsSnap, scoresSnap] = await Promise.all([
        secBase.collection('students').get(),
        secBase.collection('scores').get(),
      ]);
      const progress = studentsSnap.size > 0 ? Math.round((scoresSnap.size / studentsSnap.size) * 100) : 0;
      return { ...s, studentCount: studentsSnap.size, progress };
    })),
  ]);

  const totalStudents = perSection.reduce((s, x) => s + x.studentCount, 0);
  const avgProgress = perSection.length ? Math.round(perSection.reduce((s, x) => s + x.progress, 0) / perSection.length) : 0;

  container.innerHTML = `
    <div class="stat-row">
      <div class="stat-card"><div class="label">จำนวนห้อง</div><div class="value">${sections.length}</div></div>
      <div class="stat-card"><div class="label">นักเรียนทั้งหมด</div><div class="value">${totalStudents}</div></div>
      <div class="stat-card"><div class="label">รายการคะแนนที่กำหนด</div><div class="value">${assessSnap.size}</div></div>
    </div>
    ${sections.length > 0 ? `
      <div class="card" style="margin-bottom:16px;">
        <div class="struct-panel-header">ความคืบหน้ารายห้อง</div>
        <div class="card-pad" style="display:flex; flex-direction:column; gap:10px;">
          ${perSection.map(s => `
            <div style="display:flex; align-items:center; gap:12px;">
              <div style="width:70px; font-weight:600; font-size:13.5px;">ห้อง ${escapeHtml(s.room)}</div>
              <div style="width:80px; font-size:12.5px; color:var(--ink-soft);">${s.studentCount} คน</div>
              <div class="progress-bar" style="flex:1; width:auto;"><div class="fill" style="width:${s.progress}%"></div></div>
              <div class="progress-pct">${s.progress}%</div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
    <div class="card card-pad">
      <h2 style="font-size:14.5px; margin-bottom:10px;">ขั้นตอนถัดไป</h2>
      <div style="display:flex; flex-direction:column; gap:8px; font-size:13.5px; color:var(--ink-soft);">
        <div>1. เพิ่มห้องเรียน ${sections.length > 0 ? '✅' : '— ยังไม่มีห้อง'}</div>
        <div>2. เพิ่มรายชื่อนักเรียนแต่ละห้อง ${totalStudents > 0 ? '✅' : '— ยังไม่มีนักเรียน'}</div>
        <div>3. กำหนดโครงสร้างคะแนน (ใช้ร่วมกันทุกห้อง) ${assessSnap.size > 0 ? '✅' : '— ยังไม่ได้กำหนด'}</div>
        <div>4. บันทึกคะแนน ${avgProgress > 0 ? `— บันทึกแล้วเฉลี่ย ${avgProgress}%` : '— ยังไม่เริ่มบันทึก'}</div>
      </div>
    </div>
  `;
}
