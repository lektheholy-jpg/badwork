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
    const sections = await loadSections(uid, c.id);
    let studentCount = 0;
    let progressSum = 0;
    for (const s of sections) {
      const secBase = db.collection('users').doc(uid).collection('courses').doc(c.id).collection('sections').doc(s.id);
      const [studentsSnap, scoresSnap] = await Promise.all([
        secBase.collection('students').get(),
        secBase.collection('scores').get(),
      ]);
      studentCount += studentsSnap.size;
      progressSum += studentsSnap.size > 0 ? Math.round((scoresSnap.size / studentsSnap.size) * 100) : 0;
    }
    c.studentCount = studentCount;
    c.roomCount = sections.length;
    c.progress = sections.length > 0 ? Math.round(progressSum / sections.length) : 0;
    totalStudents += studentCount;
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
              <div class="meta">${escapeHtml(c.level || '')} • ${c.roomCount} ห้อง • ${c.studentCount} คน</div>
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
}
