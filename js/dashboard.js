// ==========================================================================
// Dashboard
// ==========================================================================

async function renderDashboard() {
  const view = document.getElementById('view');
  view.innerHTML = `<div class="empty-state">กำลังโหลด...</div>`;

  const uid = AppState.user.uid;
  const coursesSnap = await db.collection('users').doc(uid).collection('courses')
    .orderBy('createdAt', 'desc').get();
  const activeDocs = coursesSnap.docs.filter(d => !d.data().archived);

  const courses = [];
  const sectionCards = [];
  let totalStudents = 0;
  let totalProgressSum = 0;

  for (const doc of activeDocs) {
    const c = { id: doc.id, ...doc.data() };
    const courseBase = db.collection('users').doc(uid).collection('courses').doc(c.id);
    const [sections, assessSnap] = await Promise.all([
      loadSections(uid, c.id),
      courseBase.collection('assessments').get(),
    ]);
    const assessmentIds = assessSnap.docs.map(d => d.id);
    let studentCount = 0;
    let progressSum = 0;
    for (const s of sections) {
      const secBase = courseBase.collection('sections').doc(s.id);
      const [studentsSnap, scoresSnap] = await Promise.all([
        secBase.collection('students').get(),
        secBase.collection('scores').get(),
      ]);
      // ความคืบหน้า = สัดส่วน "ช่องคะแนน" ที่กรอกแล้วจากทุกช่องในห้องนี้ (นักเรียน x รายการคะแนนทั้งหมด)
      const totalCells = studentsSnap.size * assessmentIds.length;
      let filledCells = 0;
      if (totalCells > 0) {
        scoresSnap.docs.forEach(d => {
          const data = d.data();
          assessmentIds.forEach(aid => {
            if (data[aid] !== undefined && data[aid] !== null && data[aid] !== '') filledCells++;
          });
        });
      }
      const secProgress = totalCells > 0 ? Math.round((filledCells / totalCells) * 100) : 0;
      studentCount += studentsSnap.size;
      progressSum += secProgress;
      sectionCards.push({
        courseId: c.id,
        sectionId: s.id,
        courseName: c.name,
        level: c.level,
        color: c.color,
        room: s.room,
        studentCount: studentsSnap.size,
        progress: secProgress,
      });
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

    ${courses.length > 0 ? `
    <div class="chart-row">
      <div class="card chart-card">
        <div class="chart-title">ความคืบหน้าการบันทึกคะแนนต่อวิชา</div>
        ${renderProgressChart(courses)}
      </div>
      <div class="card chart-card">
        <div class="chart-title">สัดส่วนนักเรียนต่อวิชา</div>
        ${renderStudentDonut(courses, totalStudents)}
      </div>
    </div>
    ` : ''}

    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
      <h2 style="font-size:15px; font-weight:700;">รายวิชาของฉัน</h2>
    </div>

    ${sectionCards.length === 0 ? `
      <div class="card"><div class="empty-state">
        <div class="icon">📚</div>
        <div>ยังไม่มีรายวิชา ไปที่หน้า ⚙️ ตั้งค่าโครงสร้างวิชา เพื่อสร้างรายวิชาแรกของคุณ</div>
      </div></div>
    ` : `
      <div class="section-card-grid">
        ${sectionCards.map(sc => `
          <div class="section-card" data-course-id="${sc.courseId}" data-section-id="${sc.sectionId}">
            <div class="section-card-top">
              <span class="course-dot" style="background:${sc.color || '#6B7A4F'}"></span>
              <span class="section-card-room">ห้อง ${escapeHtml(sc.room)}</span>
            </div>
            <div class="section-card-name">${escapeHtml(sc.courseName)}</div>
            <div class="section-card-meta">${escapeHtml(sc.level || '')} • ${sc.studentCount} คน</div>
            <div class="progress-bar"><div class="fill" style="width:${sc.progress}%"></div></div>
            <div class="section-card-pct">${sc.progress}% บันทึกแล้ว</div>
          </div>
        `).join('')}
      </div>
    `}
  `;

  view.querySelectorAll('.section-card').forEach(card => {
    card.addEventListener('click', () => openCourseSection(card.dataset.courseId, card.dataset.sectionId));
  });
}

function openCourseSection(courseId, sectionId) {
  AppState.currentRoute = 'course';
  AppState.currentCourseId = courseId;
  AppState.currentSectionId = sectionId;
  AppState.currentTab = 'scores';
  setActiveNav(null);
  renderCourseShell();
}

// ---------- Lightweight inline SVG charts (no external chart library) ----------

function renderProgressChart(courses) {
  if (!courses.length) return `<div class="empty-state" style="padding:20px 0;">ยังไม่มีข้อมูล</div>`;
  return `
    <div class="progress-chart-list">
      ${courses.map(c => `
        <div class="progress-chart-row">
          <div class="progress-chart-label" title="${escapeHtml(c.name)}">
            <span class="progress-chart-dot" style="background:${c.color || 'var(--primary)'}"></span>
            <span class="progress-chart-label-text">${escapeHtml(c.name)}</span>
          </div>
          <div class="progress-bar"><div class="fill" style="width:${c.progress || 0}%; background:${c.color || 'var(--primary)'}"></div></div>
          <div class="progress-pct" style="color:${c.color || 'var(--primary)'};">${c.progress || 0}%</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderStudentDonut(courses, totalStudents) {
  if (!totalStudents) return `<div class="empty-state" style="padding:20px 0;">ยังไม่มีนักเรียน</div>`;
  const palette = ['#6C6C95', '#5C8A9B', '#B08A4E', '#4E9E77', '#C15B54', '#8A7CA8'];
  const r = 46, cx = 60, cy = 60, circumference = 2 * Math.PI * r;
  let offset = 0;
  const segs = courses.filter(c => c.studentCount > 0).map((c, i) => {
    const frac = c.studentCount / totalStudents;
    const len = frac * circumference;
    const seg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${c.color || palette[i % palette.length]}"
      stroke-width="16" stroke-dasharray="${len} ${circumference - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"></circle>`;
    offset += len;
    return seg;
  }).join('');
  const legend = courses.filter(c => c.studentCount > 0).map((c, i) => `
    <div class="donut-legend-item">
      <span class="dot" style="background:${c.color || palette[i % palette.length]}"></span>
      ${escapeHtml(truncateLabel(c.name, 16))} <b>${c.studentCount}</b>
    </div>`).join('');
  return `
    <div class="donut-wrap">
      <svg viewBox="0 0 120 120" width="120" height="120">
        ${segs}
        <text x="60" y="56" text-anchor="middle" font-size="20" font-weight="700" fill="var(--ink)">${totalStudents}</text>
        <text x="60" y="72" text-anchor="middle" font-size="10" fill="var(--ink-soft)">คน</text>
      </svg>
      <div class="donut-legend">${legend}</div>
    </div>`;
}

function truncateLabel(str, n) {
  if (!str) return '';
  return str.length > n ? str.slice(0, n) + '…' : str;
}
