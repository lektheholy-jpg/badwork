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
  const sectionCards = [];
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
      const secProgress = studentsSnap.size > 0 ? Math.round((scoresSnap.size / studentsSnap.size) * 100) : 0;
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
  const rowH = 30;
  const height = courses.length * rowH + 10;
  const rows = courses.map((c, i) => {
    const y = i * rowH + 6;
    const w = Math.max(2, (c.progress || 0));
    const color = c.color || 'var(--primary)';
    return `
      <g>
        <text x="0" y="${y + 13}" font-size="11" fill="var(--ink-soft)" font-weight="600">${escapeHtml(truncateLabel(c.name, 14))}</text>
        <rect x="0" y="${y + 18}" width="100%" height="6" rx="3" fill="var(--surface-sunken)"></rect>
        <rect x="0" y="${y + 18}" width="${w}%" height="6" rx="3" fill="${color}"></rect>
        <text x="100%" y="${y + 13}" font-size="11" fill="var(--ink)" font-weight="700" text-anchor="end">${c.progress || 0}%</text>
      </g>`;
  }).join('');
  return `<svg viewBox="0 0 300 ${height}" width="100%" height="${height}" preserveAspectRatio="none" style="overflow:visible;">${rows}</svg>`;
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
