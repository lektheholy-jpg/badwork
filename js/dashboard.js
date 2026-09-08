// ==========================================================================
// Dashboard
// ==========================================================================

async function renderDashboard() {
  const view = document.getElementById('view');
  view.innerHTML = `<div class="empty-state">กำลังโหลด...</div>`;

  const uid = AppState.user.uid;
  const coursesSnap = await db.collection('users').doc(uid).collection('courses')
    .orderBy('createdAt', 'desc').get();

  const courses = [];
  let totalStudents = 0;
  let totalProgressSum = 0;

  for (const doc of coursesSnap.docs) {
    const c = { id: doc.id, ...doc.data() };
    const studentsSnap = await db.collection('users').doc(uid).collection('courses').doc(c.id).collection('students').get();
    const scoresSnap = await db.collection('users').doc(uid).collection('courses').doc(c.id).collection('scores').get();
    c.studentCount = studentsSnap.size;
    c.progress = studentsSnap.size > 0 ? Math.round((scoresSnap.size / studentsSnap.size) * 100) : 0;
    totalStudents += c.studentCount;
    totalProgressSum += c.progress;
    courses.push(c);
  }
  AppState.courses = courses;

  const avgProgress = courses.length ? Math.round(totalProgressSum / courses.length) : 0;
  const firstName = (AppState.user.displayName || 'คุณครู').split(' ')[0];

  view.innerHTML = `
    <div class="page-header">
      <h1>สวัสดีครับ คุณครู ${escapeHtml(firstName)} 👋</h1>
      <div class="sub">ภาพรวมการสอนและการบันทึกคะแนนของคุณ</div>
    </div>

    <div class="stat-row">
      <div class="stat-card"><div class="label">รายวิชา</div><div class="value">${courses.length}</div></div>
      <div class="stat-card"><div class="label">นักเรียนทั้งหมด</div><div class="value">${totalStudents}</div></div>
      <div class="stat-card"><div class="label">ความคืบหน้าเฉลี่ย</div><div class="value">${avgProgress}%</div></div>
    </div>

    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
      <h2 style="font-size:15px; font-weight:700;">รายวิชาของฉัน</h2>
      <button class="btn btn-primary btn-sm" id="dash-create-course">+ สร้างรายวิชา</button>
    </div>

    ${courses.length === 0 ? `
      <div class="card"><div class="empty-state">
        <div class="icon">📚</div>
        <div>ยังไม่มีรายวิชา เริ่มสร้างรายวิชาแรกของคุณได้เลย</div>
        <div style="margin-top:14px;"><button class="btn btn-primary" id="dash-create-course-2">+ สร้างรายวิชา</button></div>
      </div></div>
    ` : `
      <div class="course-list">
        ${courses.map(c => `
          <div class="course-row" data-course-id="${c.id}">
            <div class="course-dot" style="background:${c.color || '#0E7C86'}"></div>
            <div class="info">
              <div class="name">${escapeHtml(c.name)}</div>
              <div class="meta">${escapeHtml(c.level || '')}${c.room ? '/' + escapeHtml(c.room) : ''} • ${c.studentCount} คน</div>
            </div>
            <div class="progress-bar"><div class="fill" style="width:${c.progress}%"></div></div>
            <div class="progress-pct">${c.progress}%</div>
            <button class="btn btn-ghost btn-sm">เปิดรายวิชา</button>
          </div>
        `).join('')}
      </div>
    `}
  `;

  view.querySelectorAll('.course-row').forEach(row => {
    row.addEventListener('click', () => openCourse(row.dataset.courseId));
  });
  const c1 = document.getElementById('dash-create-course');
  const c2 = document.getElementById('dash-create-course-2');
  if (c1) c1.addEventListener('click', openCreateCourseModal);
  if (c2) c2.addEventListener('click', openCreateCourseModal);
}
