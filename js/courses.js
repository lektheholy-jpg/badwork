// ==========================================================================
// Courses: list, create, detail shell (tabs)
// ==========================================================================

function openCreateCourseModal() {
  openModal(`
    <h2>สร้างรายวิชา</h2>
    <div class="modal-sub">กรอกข้อมูลพื้นฐานของรายวิชา แก้ไขภายหลังได้</div>
    <div class="field-row">
      <div class="field"><label>รหัสวิชา</label><input id="f-code" placeholder="เช่น ว33101"></div>
      <div class="field"><label>ชื่อวิชา</label><input id="f-name" placeholder="เช่น วิทยาการคำนวณ"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>ระดับชั้น</label><input id="f-level" placeholder="เช่น ม.6"></div>
      <div class="field"><label>ห้อง</label><input id="f-room" placeholder="เช่น 1"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>ภาคเรียน</label><input id="f-semester" placeholder="1"></div>
      <div class="field"><label>ปีการศึกษา</label><input id="f-year" placeholder="2569"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>หน่วยกิต</label><input id="f-credit" placeholder="1.0"></div>
      <div class="field"><label>สีประจำวิชา</label><input id="f-color" type="color" value="#0E7C86" style="height:38px; padding:3px;"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="cancel-create">ยกเลิก</button>
      <button class="btn btn-primary" id="submit-create">สร้างรายวิชา</button>
    </div>
  `);
  document.getElementById('cancel-create').addEventListener('click', closeModal);
  document.getElementById('submit-create').addEventListener('click', async () => {
    const name = document.getElementById('f-name').value.trim();
    if (!name) { showToast('กรุณากรอกชื่อวิชา'); return; }
    const uid = AppState.user.uid;
    const data = {
      code: document.getElementById('f-code').value.trim(),
      name,
      level: document.getElementById('f-level').value.trim(),
      room: document.getElementById('f-room').value.trim(),
      semester: document.getElementById('f-semester').value.trim(),
      year: document.getElementById('f-year').value.trim(),
      credit: document.getElementById('f-credit').value.trim(),
      color: document.getElementById('f-color').value,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    const ref = await db.collection('users').doc(uid).collection('courses').add(data);
    // สร้างเกณฑ์เกรดเริ่มต้น
    await ref.collection('settings').doc('grading').set({ scale: DEFAULT_GRADE_SCALE });
    closeModal();
    showToast('สร้างรายวิชาสำเร็จ');
    openCourse(ref.id);
  });
}

async function renderCoursesList() {
  const view = document.getElementById('view');
  view.innerHTML = `<div class="empty-state">กำลังโหลด...</div>`;
  const uid = AppState.user.uid;
  const snap = await db.collection('users').doc(uid).collection('courses').orderBy('createdAt', 'desc').get();
  const courses = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  view.innerHTML = `
    <div class="page-header" style="display:flex; align-items:center; justify-content:space-between;">
      <div>
        <h1>รายวิชาของฉัน</h1>
        <div class="sub">รายวิชาทั้งหมดที่คุณสอนในปีการศึกษานี้</div>
      </div>
      <button class="btn btn-primary" id="new-course-btn">+ สร้างรายวิชา</button>
    </div>
    ${courses.length === 0 ? `<div class="card"><div class="empty-state"><div class="icon">📚</div>ยังไม่มีรายวิชา</div></div>` : `
      <div class="course-list">
        ${courses.map(c => `
          <div class="course-row" data-course-id="${c.id}">
            <div class="course-dot" style="background:${c.color || '#0E7C86'}"></div>
            <div class="info">
              <div class="name">${escapeHtml(c.name)}</div>
              <div class="meta">${escapeHtml(c.code || '')} • ${escapeHtml(c.level || '')}${c.room ? '/' + escapeHtml(c.room) : ''} • ภาคเรียน ${escapeHtml(c.semester || '-')}/${escapeHtml(c.year || '-')}</div>
            </div>
            <button class="btn btn-ghost btn-sm">เปิดรายวิชา</button>
          </div>
        `).join('')}
      </div>
    `}
  `;
  document.getElementById('new-course-btn').addEventListener('click', openCreateCourseModal);
  view.querySelectorAll('.course-row').forEach(row => {
    row.addEventListener('click', () => openCourse(row.dataset.courseId));
  });
}

function openCourse(courseId) {
  AppState.currentRoute = 'course';
  AppState.currentCourseId = courseId;
  AppState.currentTab = 'overview';
  setActiveNav(null);
  renderCourseShell();
}

async function renderCourseShell() {
  const uid = AppState.user.uid;
  const courseId = AppState.currentCourseId;
  const courseDoc = await db.collection('users').doc(uid).collection('courses').doc(courseId).get();
  if (!courseDoc.exists) { navigate('courses'); return; }
  const course = { id: courseDoc.id, ...courseDoc.data() };
  AppState.currentCourse = course;

  const tabs = [
    { id: 'overview', label: 'ภาพรวม' },
    { id: 'students', label: 'นักเรียน' },
    { id: 'structure', label: 'โครงสร้างคะแนน' },
    { id: 'scores', label: 'บันทึกคะแนน' },
    { id: 'report', label: 'รายงาน' },
  ];

  const view = document.getElementById('view');
  view.innerHTML = `
    <div class="crumb"><a href="#" id="back-to-courses" style="text-decoration:none; color:inherit;">รายวิชาของฉัน</a> / <b>${escapeHtml(course.name)}</b></div>
    <div class="page-header">
      <h1>${escapeHtml(course.code ? course.code + ' • ' : '')}${escapeHtml(course.name)}</h1>
      <div class="sub">${escapeHtml(course.level || '')}${course.room ? '/' + escapeHtml(course.room) : ''} • ภาคเรียน ${escapeHtml(course.semester || '-')}/${escapeHtml(course.year || '-')}</div>
    </div>
    <div class="tabs">
      ${tabs.map(t => `<div class="tab ${AppState.currentTab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.label}</div>`).join('')}
    </div>
    <div id="course-tab-body"></div>
  `;

  document.getElementById('back-to-courses').addEventListener('click', (e) => { e.preventDefault(); navigate('courses'); });
  view.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => {
      AppState.currentTab = t.dataset.tab;
      renderCourseShell();
    });
  });

  const body = document.getElementById('course-tab-body');
  if (AppState.currentTab === 'overview') renderCourseOverview(body, course);
  else if (AppState.currentTab === 'students') renderStudentsTab(body, course);
  else if (AppState.currentTab === 'structure') renderStructureTab(body, course);
  else if (AppState.currentTab === 'scores') renderScoresTab(body, course);
  else if (AppState.currentTab === 'report') renderReportTab(body, course);
}

async function renderCourseOverview(container, course) {
  const uid = AppState.user.uid;
  const base = db.collection('users').doc(uid).collection('courses').doc(course.id);
  const [studentsSnap, assessSnap, scoresSnap] = await Promise.all([
    base.collection('students').get(),
    base.collection('assessments').get(),
    base.collection('scores').get(),
  ]);
  const progress = studentsSnap.size > 0 ? Math.round((scoresSnap.size / studentsSnap.size) * 100) : 0;

  container.innerHTML = `
    <div class="stat-row">
      <div class="stat-card"><div class="label">จำนวนนักเรียน</div><div class="value">${studentsSnap.size}</div></div>
      <div class="stat-card"><div class="label">รายการคะแนนที่กำหนด</div><div class="value">${assessSnap.size}</div></div>
      <div class="stat-card"><div class="label">ความคืบหน้าการบันทึกคะแนน</div><div class="value">${progress}%</div></div>
    </div>
    <div class="card card-pad">
      <h2 style="font-size:14.5px; margin-bottom:10px;">ขั้นตอนถัดไป</h2>
      <div style="display:flex; flex-direction:column; gap:8px; font-size:13.5px; color:var(--ink-soft);">
        <div>1. เพิ่มรายชื่อนักเรียน ${studentsSnap.size > 0 ? '✅' : '— ยังไม่มีนักเรียน'}</div>
        <div>2. กำหนดโครงสร้างคะแนน ${assessSnap.size > 0 ? '✅' : '— ยังไม่ได้กำหนด'}</div>
        <div>3. บันทึกคะแนน ${progress > 0 ? `— บันทึกแล้ว ${progress}%` : '— ยังไม่เริ่มบันทึก'}</div>
      </div>
    </div>
  `;
}
