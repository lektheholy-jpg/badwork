// ==========================================================================
// Dashboard
// ==========================================================================

// โหลดรายวิชาที่เปิดใช้งานพร้อมข้อมูลห้อง/นักเรียน/เกรด — ใช้ร่วมกันระหว่างหน้าแรกและหน้ารายงาน
async function loadCoursesWithGrades() {
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
    const [sections, assessSnap, gradingDoc] = await Promise.all([
      loadSections(uid, c.id),
      courseBase.collection('assessments').get(),
      courseBase.collection('settings').doc('grading').get(),
    ]);
    const assessments = assessSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const assessmentIds = assessments.map(a => a.id);
    const gradeScale = gradingDoc.exists ? gradingDoc.data().scale : DEFAULT_GRADE_SCALE;
    let studentCount = 0;
    let progressSum = 0;
    const roomsData = []; // สถิติเกรดแยกรายห้อง สำหรับใช้ในการ์ด "สถิติเกรดรายวิชา"
    for (const s of sections) {
      const secBase = courseBase.collection('sections').doc(s.id);
      const [studentsSnap, scoresSnap] = await Promise.all([
        secBase.collection('students').get(),
        secBase.collection('scores').get(),
      ]);
      // ความคืบหน้า = สัดส่วน "ช่องคะแนน" ที่กรอกแล้วจากทุกช่องในห้องนี้ (นักเรียน x รายการคะแนนทั้งหมด)
      const totalCells = studentsSnap.size * assessmentIds.length;
      let filledCells = 0;
      const scoresByStudent = {};
      scoresSnap.docs.forEach(d => {
        const data = d.data();
        scoresByStudent[d.id] = data;
        assessmentIds.forEach(aid => {
          if (data[aid] !== undefined && data[aid] !== null && data[aid] !== '') filledCells++;
        });
      });
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

      const gradedStudents = studentsSnap.docs.map(sd => {
        const sc = scoresByStudent[sd.id] || {};
        const total = assessments.reduce((sum, a) => sum + (Number(sc[a.id]) || 0), 0);
        const hasScore = assessmentIds.some(aid => sc[aid] !== undefined && sc[aid] !== null && sc[aid] !== '');
        return { id: sd.id, total, hasScore, grade: calcGrade(total, gradeScale) };
      });
      roomsData.push({ sectionId: s.id, room: s.room, students: gradedStudents });
    }
    c.studentCount = studentCount;
    c.roomCount = sections.length;
    c.progress = sections.length > 0 ? Math.round(progressSum / sections.length) : 0;
    c.gradeScale = gradeScale;
    c.roomsData = roomsData;
    totalStudents += studentCount;
    totalProgressSum += c.progress;
    courses.push(c);
  }
  return { courses, sectionCards, totalStudents, totalProgressSum };
}

async function renderDashboard() {
  const view = document.getElementById('view');
  view.innerHTML = `<div class="empty-state">กำลังโหลด...</div>`;

  const { courses, sectionCards, totalStudents, totalProgressSum } = await loadCoursesWithGrades();
  AppState.courses = courses;

  const avgProgress = courses.length ? Math.round(totalProgressSum / courses.length) : 0;
  const firstName = (AppState.user.displayName || 'คุณครู').split(' ')[0];

  view.innerHTML = `
    <!-- ปกหนังสือ -->
    <section class="book-cover">
      <i class="cv-ring"></i><i class="cv-circle"></i><i class="cv-dot"></i>
      <div class="cover-emblem"><img src="assets/icons/android-chrome-512x512.png" alt="โลโก้"></div>
      <div class="cover-kicker">สวัสดีครับ คุณครู ${escapeHtml(firstName)}</div>
      <div class="cv-main">
        <h1 class="cover-title">งานน่าเบื่อ<span class="dots">..</span></h1>
        <p class="cover-sub">สมุดบันทึกคะแนนสำหรับครู</p>
      </div>
      <div class="cover-stats">
        <div class="cover-stat"><div class="value">${courses.length}</div><div class="label">รายวิชา</div></div>
        <div class="cover-stat"><div class="value">${totalStudents}</div><div class="label">นักเรียนทั้งหมด</div></div>
        <div class="cover-stat"><div class="value">${avgProgress}%</div><div class="label">ความคืบหน้าเฉลี่ย</div></div>
      </div>
    </section>

    <!-- หน้าในเล่ม -->
    <section class="book-inside">
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
    </section>
  `;

  view.querySelectorAll('.section-card').forEach(card => {
    card.addEventListener('click', () => openCourseSection(card.dataset.courseId, card.dataset.sectionId));
  });

}

// ==========================================================================
// สรุปผลการเรียน — ตารางตามแบบฟอร์ม (ระดับชั้น / ห้อง / N / เกรด 4–0 / n / ร / มส.)
// ==========================================================================

const GS_GRADE_COLS = [4, 3.5, 3, 2.5, 2, 1.5, 1, 0];

function gradeSummaryCounts(students) {
  // n นับเฉพาะนักเรียนที่มีคะแนนบันทึกแล้ว — คนที่ยังไม่มีคะแนนเลยรวมอยู่ใน N แต่ยังไม่นับเป็นเกรด 0
  const counts = GS_GRADE_COLS.map(() => 0);
  students.forEach(s => {
    if (!s.hasScore) return;
    const i = GS_GRADE_COLS.indexOf(parseFloat(s.grade));
    if (i >= 0) counts[i]++;
  });
  return { N: students.length, counts, n: counts.reduce((a, b) => a + b, 0) };
}

function gradeSummaryCells(row) {
  return `
    <td class="num">${row.N}</td>
    ${row.counts.map(c => `<td class="num">${c || ''}</td>`).join('')}
    <td class="num gs-n">${row.n}</td>
    <td class="num"></td>
    <td class="num"></td>`;
}

function buildGradeSummaryHtml(courses, year) {
  const filtered = year === '__all__' ? courses : courses.filter(c => (c.year || '').toString().trim() === year);
  if (filtered.length === 0) {
    return `<div class="empty-state" style="padding:16px 0;">ไม่มีวิชาที่เปิดสอนในปีการศึกษานี้</div>`;
  }
  let no = 0;
  const body = filtered.map(c => {
    const rooms = c.roomsData || [];
    const head = `
      <tr class="gs-course">
        <td colspan="15"><span class="course-dot" style="background:${c.color || '#6B7A4F'}"></span>${escapeHtml(c.name)}${c.code ? ` <span class="gs-code">(${escapeHtml(c.code)})</span>` : ''}</td>
      </tr>`;
    const rows = rooms.map(r => {
      no++;
      return `
      <tr class="gs-row" data-course-id="${c.id}" data-section-id="${r.sectionId}" title="เปิดหน้าบันทึกคะแนน">
        <td class="num gs-no">${no}</td>
        <td>${escapeHtml(c.level || '')}</td>
        <td>${escapeHtml(r.room)}</td>
        ${gradeSummaryCells(gradeSummaryCounts(r.students))}
      </tr>`;
    }).join('');
    let total = '';
    if (rooms.length > 1) {
      total = `
      <tr class="gs-total">
        <td colspan="3">รวมทุกห้อง</td>
        ${gradeSummaryCells(gradeSummaryCounts(rooms.flatMap(r => r.students)))}
      </tr>`;
    }
    return head + rows + total;
  }).join('');

  return `
    <div class="gs-wrap">
      <table class="gs-table">
        <thead>
          <tr>
            <th rowspan="3" class="gs-no">ที่</th>
            <th rowspan="3">ระดับชั้น</th>
            <th rowspan="3">ห้อง</th>
            <th rowspan="3">จำนวนนักเรียน<br>ทั้งหมด (N)</th>
            <th colspan="11">จำนวนนักเรียน (คน)</th>
          </tr>
          <tr>
            <th colspan="9">ผ่านการประเมิน (X)</th>
            <th colspan="2">ไม่ผ่านการประเมิน</th>
          </tr>
          <tr>
            ${GS_GRADE_COLS.map(g => `<th>${g}</th>`).join('')}
            <th>รวม (n)</th>
            <th>ร</th>
            <th>มส.</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

function wireGradeSummaryRows() {
  document.querySelectorAll('.gs-row').forEach(tr => {
    tr.addEventListener('click', () => openCourseSection(tr.dataset.courseId, tr.dataset.sectionId));
  });
}

// ==========================================================================
// สถิติเกรดรายวิชา — กรองตามปีการศึกษา, เลือกดูรายห้องหรือทุกห้องรวมกันได้
// ==========================================================================

function buildGradeStatsBodyHtml(courses, year) {
  const filtered = year === '__all__' ? courses : courses.filter(c => (c.year || '').toString().trim() === year);
  if (filtered.length === 0) {
    return `<div class="empty-state" style="padding:12px 0;">ไม่มีวิชาที่เปิดสอนในปีการศึกษานี้</div>`;
  }
  return `<div class="grade-stat-grid">` + filtered.map(c => {
    const totalInCourse = c.roomsData.reduce((sum, r) => sum + r.students.length, 0);
    return `
      <div class="grade-stat-card">
        <div class="gsc-head">
          <div class="gsc-title">
            <span class="course-dot" style="background:${c.color || '#6B7A4F'}"></span>
            <span class="gsc-name">${escapeHtml(c.name)}</span>
          </div>
          <select class="grade-room-filter" data-course-id="${c.id}">
            <option value="__all__">ทุกห้อง (${totalInCourse})</option>
            ${c.roomsData.map(r => `<option value="${r.sectionId}">ห้อง ${escapeHtml(r.room)} (${r.students.length})</option>`).join('')}
          </select>
        </div>
        <div class="grade-stat-body" data-course-id="${c.id}">${renderGradeDistribution(c, '__all__')}</div>
      </div>
    `;
  }).join('') + `</div>`;
}

function wireGradeRoomFilters(courses) {
  document.querySelectorAll('.grade-room-filter').forEach(sel => {
    sel.addEventListener('change', () => {
      const course = courses.find(c => c.id === sel.dataset.courseId);
      const bodyEl = document.querySelector(`.grade-stat-body[data-course-id="${sel.dataset.courseId}"]`);
      if (course && bodyEl) bodyEl.innerHTML = renderGradeDistribution(course, sel.value);
    });
  });
}

function renderGradeDistribution(course, roomFilter) {
  const students = roomFilter === '__all__'
    ? course.roomsData.flatMap(r => r.students)
    : (course.roomsData.find(r => r.sectionId === roomFilter)?.students || []);

  if (students.length === 0) {
    return `<div class="empty-state" style="padding:12px 0;">ยังไม่มีนักเรียน/คะแนนในห้องนี้</div>`;
  }

  const gradeScale = course.gradeScale;
  const gradeCounts = {};
  gradeScale.forEach(g => { gradeCounts[g.grade] = 0; });
  let sumTotal = 0;
  students.forEach(s => {
    gradeCounts[s.grade] = (gradeCounts[s.grade] || 0) + 1;
    sumTotal += s.total;
  });
  const avg = (sumTotal / students.length).toFixed(1);
  const maxCount = Math.max(1, ...Object.values(gradeCounts));

  return `
    <div class="gsc-meta">นักเรียน ${students.length} คน • คะแนนเฉลี่ย ${avg}</div>
    ${gradeScale.map(g => `
      <div class="dist-row">
        <span class="g-label">${escapeHtml(g.grade)}</span>
        <div class="g-bar-track"><div class="g-bar-fill" style="width:${((gradeCounts[g.grade] || 0) / maxCount) * 100}%"></div></div>
        <span class="g-count">${gradeCounts[g.grade] || 0}</span>
      </div>
    `).join('')}
  `;
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
