// ==========================================================================
// Dashboard
// ==========================================================================

// โหลดรายวิชาที่เปิดใช้งานพร้อมข้อมูลห้อง/นักเรียน/เกรด — ใช้ร่วมกันระหว่างหน้าแรกและหน้ารายงาน
const ITEM_DONE_RATIO = 0.7; // สัดส่วนนักเรียนที่มีคะแนนแล้ว ที่ถือว่ารายการนั้น "บันทึกแล้ว"

// เรียงรายการคะแนนให้เหมือนตารางบันทึกคะแนน: คะแนนเก็บ (ตามหมวด) → กลางภาค → ปลายภาค
function orderAssessmentsLikeSheet(assessments, groups) {
  const byOrder = [...assessments].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  const gi = (gid) => groups.findIndex(g => g.id === gid);
  const collect = byOrder.filter(a => a.category === 'collect').map((a, i) => ({ a, i }))
    .sort((x, y) => (gi(x.a.groupId) - gi(y.a.groupId)) || (x.i - y.i)).map(x => x.a);
  return [...collect, ...byOrder.filter(a => a.category === 'midterm'), ...byOrder.filter(a => a.category === 'final')];
}

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
    const [sections, assessSnap, gradingDoc, structDoc] = await Promise.all([
      loadSections(uid, c.id),
      courseBase.collection('assessments').get(),
      courseBase.collection('settings').doc('grading').get(),
      courseBase.collection('settings').doc('structure').get(),
    ]);
    const assessments = assessSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const orderedItems = orderAssessmentsLikeSheet(assessments, structDoc.exists ? (structDoc.data().groups || []) : []);
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
      // รายการถัดไป = รายการแรก (ตามลำดับในตาราง) ที่ยังบันทึกไม่ครบทุกคน — ยังไม่เริ่มเลยจะเป็นรายการแรก
      const sIds = studentsSnap.docs.map(d => d.id);
      let nextItem = null, itemsDone = 0;
      for (const a of orderedItems) {
        const n = sIds.filter(id => { const v = (scoresByStudent[id] || {})[a.id]; return v !== undefined && v !== null && v !== ''; }).length;
        if (sIds.length > 0 && n / sIds.length > ITEM_DONE_RATIO) itemsDone++; // นับว่าบันทึกแล้วเมื่อมากกว่า 70% ของนักเรียนในห้อง
        else if (!nextItem) nextItem = { name: a.name, filled: n };
      }
      const secProgress = totalCells > 0 ? Math.round((filledCells / totalCells) * 100) : 0;
      studentCount += studentsSnap.size;
      progressSum += secProgress;
      sectionCards.push({
        courseId: c.id,
        sectionId: s.id,
        courseName: c.name,
        level: c.level,
        color: courseColor(c),
        room: s.room,
        studentCount: studentsSnap.size,
        progress: secProgress,
        nextItem, itemsDone, itemsTotal: orderedItems.length,
        state: sIds.length === 0 ? 'nostudents' : orderedItems.length === 0 ? 'nostructure' : !nextItem ? 'complete' : secProgress === 0 ? 'notstarted' : 'partial',
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
    c.maxTotal = assessments.reduce((sum, a) => sum + (Number(a.max) || 0), 0) || 100;
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

  view.innerHTML = `
    <div class="dash">
    <header class="site-banner">
      <img src="assets/banner.webp" width="590" height="350" decoding="async" alt="กมฺมุนา วตฺตตี โลโก — สัตว์โลกย่อมเป็นไปตามกรรม">
    </header>
    <div class="cw-row">
      <div class="cw-card cw-clock">
        <div class="cw-clock-txt">
          <div class="cw-day" id="cw-day"></div>
          <div class="cw-time" id="cw-time">--:--<small>:--</small></div>
          <div class="cw-date" id="cw-date"></div>
        </div>
        <svg class="cw-analog" viewBox="0 0 100 100" aria-hidden="true">
          <circle class="cw-face" cx="50" cy="50" r="48"/>
          <line class="cw-tick maj" x1="50" y1="5" x2="50" y2="11" transform="rotate(0 50 50)"/><line class="cw-tick" x1="50" y1="6" x2="50" y2="9" transform="rotate(30 50 50)"/><line class="cw-tick" x1="50" y1="6" x2="50" y2="9" transform="rotate(60 50 50)"/><line class="cw-tick maj" x1="50" y1="5" x2="50" y2="11" transform="rotate(90 50 50)"/><line class="cw-tick" x1="50" y1="6" x2="50" y2="9" transform="rotate(120 50 50)"/><line class="cw-tick" x1="50" y1="6" x2="50" y2="9" transform="rotate(150 50 50)"/><line class="cw-tick maj" x1="50" y1="5" x2="50" y2="11" transform="rotate(180 50 50)"/><line class="cw-tick" x1="50" y1="6" x2="50" y2="9" transform="rotate(210 50 50)"/><line class="cw-tick" x1="50" y1="6" x2="50" y2="9" transform="rotate(240 50 50)"/><line class="cw-tick maj" x1="50" y1="5" x2="50" y2="11" transform="rotate(270 50 50)"/><line class="cw-tick" x1="50" y1="6" x2="50" y2="9" transform="rotate(300 50 50)"/><line class="cw-tick" x1="50" y1="6" x2="50" y2="9" transform="rotate(330 50 50)"/>
          <line class="cw-hand cw-hh" id="cw-hh" x1="50" y1="54" x2="50" y2="29"/>
          <line class="cw-hand cw-mm" id="cw-mm" x1="50" y1="56" x2="50" y2="17"/>
          <line class="cw-hand cw-ss" id="cw-ss" x1="50" y1="60" x2="50" y2="12"/>
          <circle class="cw-cap" cx="50" cy="50" r="3.6"/>
        </svg>
      </div>
      <div class="cw-card cw-weather" data-sky="clear-day">
        <div class="cw-wx-ico" id="cw-wx-ico" aria-hidden="true">…</div>
        <div class="cw-wx-main">
          <div class="cw-temp" id="cw-temp">--°</div>
          <div class="cw-wx-desc" id="cw-wx-desc">กำลังโหลดสภาพอากาศ</div>
          <div class="cw-wx-meta" id="cw-wx-meta"></div>
        </div>
      </div>
    </div>
    ${renderRoomCompare(courses)}

    ${renderLatestProgress(courses, sectionCards)}

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

    ${courses.length === 0 ? `
      <div class="card"><div class="empty-state">
        <div class="icon">${icon('book')}</div>
        <div>ยังไม่มีรายวิชา เริ่มจากสร้างรายวิชาแรกของคุณ</div>
        <button class="btn btn-primary" data-go="structure-page" style="margin-top:16px;">สร้างรายวิชา</button>
      </div></div>
    ` : ''}
    </section>
    </div>
  `;

  view.querySelectorAll('.prog-row').forEach(el => el.addEventListener('click', () => openCourseSection(el.dataset.courseId, el.dataset.sectionId)));
  view.querySelectorAll('[data-go]').forEach(el => el.addEventListener('click', () => navigate(el.dataset.go)));
  wireRoomCompare(courses);
  initClockWeather();
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
      <tr class="gs-course" style="--cc:${courseColor(c)}">
        <td colspan="15"><span class="course-dot" style="background:${courseColor(c) || '#3E91FF'}"></span>${escapeHtml(c.name)}${c.code ? ` <span class="gs-code">(${escapeHtml(c.code)})</span>` : ''}</td>
      </tr>`;
    const rows = rooms.map(r => {
      no++;
      return `
      <tr class="gs-row" style="--cc:${courseColor(c)}" data-course-id="${c.id}" data-section-id="${r.sectionId}" title="เปิดหน้าบันทึกคะแนน">
        <td class="num gs-no">${no}</td>
        <td>${escapeHtml(c.level || '')}</td>
        <td>${escapeHtml(r.room)}</td>
        ${gradeSummaryCells(gradeSummaryCounts(r.students))}
      </tr>`;
    }).join('');
    let total = '';
    if (rooms.length > 1) {
      total = `
      <tr class="gs-total" style="--cc:${courseColor(c)}">
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
            <span class="course-dot" style="background:${courseColor(c) || '#3E91FF'}"></span>
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

// ความคืบหน้าล่าสุด: 1 แถวต่อ 1 ห้อง (วิชา · ห้อง → รายการที่กำลังบันทึก/ถัดไป → แถบความคืบหน้า)
function renderLatestProgress(courses, sectionCards) {
  const rows = [];
  courses.forEach(c => sectionCards.filter(r => r.courseId === c.id).forEach(r => rows.push({ c, r })));
  if (!rows.length) return '';
  const item = (r) => {
    if (r.state === 'nostudents') return 'ยังไม่มีนักเรียน';
    if (r.state === 'nostructure') return 'ยังไม่ตั้งโครงสร้างคะแนน';
    if (r.state === 'complete') return 'บันทึกครบทุกรายการ';
    if (r.state === 'notstarted') return `เริ่มที่ ${r.nextItem.name}`;
    return `ถัดไป ${r.nextItem.name} (${r.nextItem.filled}/${r.studentCount})`;
  };
  return `
    <section class="prog-section">
      <h2 class="prog-h2">ความคืบหน้าล่าสุด</h2>
      <div class="prog-list">
        ${rows.map(({ c, r }) => `
          <button class="prog-row" style="--w:${courseColor(c) || 'var(--primary)'}" data-course-id="${r.courseId}" data-section-id="${r.sectionId}">
            <span class="prog-dot" style="background:${courseColor(c) || 'var(--primary)'}"></span>
            <span class="prog-title">${escapeHtml(c.name)} · ห้อง ${escapeHtml(r.room)}</span>
            <span class="prog-item">${escapeHtml(item(r))}</span>
            <span class="progress-bar"><span class="fill" style="width:${r.progress}%; background:${courseColor(c) || 'var(--primary)'}"></span></span>
            <span class="prog-pct">${r.progress}%</span>
          </button>`).join('')}
      </div>
    </section>`;
}

// ==========================================================================
// กราฟเส้นเทียบรายห้อง (ในวิชาเดียวกัน): คะแนนสูงสุด / เฉลี่ย / ต่ำสุด ของคะแนนรวม
// แสดงเฉพาะวิชาที่มี 2 ห้องขึ้นไป · คิดจากนักเรียนที่มีคะแนนบันทึกแล้วเท่านั้น
// ==========================================================================
const RC_SERIES = [
  { key: 'max', label: 'สูงสุด', cls: 'rc-s-max' },
  { key: 'avg', label: 'เฉลี่ย', cls: 'rc-s-avg' },
  { key: 'min', label: 'ต่ำสุด', cls: 'rc-s-min' },
];
const RC_GEO = { l: 34, r: 14, t: 16, b: 30 };
// ความกว้างวาดตามความกว้างจริงของการ์ด เพื่อให้ตัวอักษรขนาดคงที่ทั้งบนมือถือและเดสก์ท็อป
function rcSize() {
  const body = document.getElementById('rc-body');
  const plot = body?.querySelector('.rc-plot');
  const w = Math.round(body?.clientWidth || 520);
  const W = Math.max(280, Math.min(1600, w));
  // จอกว้าง: การ์ดยืดตามความสูงแถว → วาดกราฟให้เต็มพื้นที่จริง (ไม่เหลือที่ว่างใต้กราฟ)
  const stretched = plot && window.matchMedia('(min-width: 1360px)').matches;
  if (stretched && plot.clientHeight > 0) return { W, H: Math.max(240, Math.min(640, Math.round(plot.clientHeight))) };
  return { W, H: W < 480 ? 214 : Math.round(Math.max(240, Math.min(480, W * 0.36))) };
}

function roomCompareCourses(courses) {
  return courses.filter(c => (c.roomsData || []).length >= 2);
}

function roomCompareStats(course) {
  return course.roomsData.map(r => {
    const t = r.students.filter(s => s.hasScore).map(s => s.total);
    return {
      room: r.room, n: t.length,
      max: t.length ? Math.max(...t) : null,
      min: t.length ? Math.min(...t) : null,
      avg: t.length ? t.reduce((a, b) => a + b, 0) / t.length : null,
    };
  });
}

const rcFmt = v => v === null ? '–' : (Math.round(v * 10) / 10).toString();

function renderRoomCompareChart(course) {
  const { l, r, t, b } = RC_GEO;
  const { W, H } = rcSize();
  const max = course.maxTotal || 100;
  const stats = roomCompareStats(course);
  const n = stats.length;
  const iw = W - l - r, ih = H - t - b, band = iw / n;
  const x = i => l + band * (i + 0.5);
  const y = v => t + ih * (1 - Math.min(v, max) / max);

  const grid = [0, .25, .5, .75, 1].map(f => {
    const yy = t + ih * (1 - f);
    return `<line class="rc-grid${f === 0 ? ' base' : ''}" x1="${l}" x2="${W - r}" y1="${yy}" y2="${yy}"/>
            <text class="rc-tick" x="${l - 8}" y="${yy + 4}" text-anchor="end">${Math.round(max * f)}</text>`;
  }).join('');

  const xlabels = stats.map((s, i) => `<text class="rc-xlab" x="${x(i)}" y="${H - 9}" text-anchor="middle">${escapeHtml(truncateLabel(String(s.room), 6))}</text>`).join('');

  const lines = RC_SERIES.map(sr => {
    let d = '', pen = false;
    stats.forEach((s, i) => {
      if (s[sr.key] === null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(s[sr.key]).toFixed(1)} `;
      pen = true;
    });
    const dots = stats.map((s, i) => s[sr.key] === null ? '' :
      `<circle class="rc-dot ${sr.cls}" cx="${x(i).toFixed(1)}" cy="${y(s[sr.key]).toFixed(1)}" r="4.5"/>`).join('');
    return `<g class="rc-series ${sr.cls}"><path class="rc-line" d="${d.trim()}"/>${dots}</g>`;
  }).join('');

  // ป้ายค่าเฉพาะเส้นเฉลี่ย (ไม่ใส่ตัวเลขทุกจุด)
  const avgLabels = stats.map((s, i) => {
    if (s.avg === null) return '';
    const crowdedAbove = y(s.avg) - y(s.max) < 24;      // เส้นสูงสุดอยู่ใกล้เหนือจุดเฉลี่ย → วางป้ายไว้ใต้จุด
    const crowdedBelow = y(s.min) - y(s.avg) < 24;
    if (crowdedAbove && crowdedBelow) // ทั้งบนและล่างแน่น → วางป้ายไว้ข้างจุด
      return `<text class="rc-val" x="${(x(i) + 11).toFixed(1)}" y="${(y(s.avg) + 4).toFixed(1)}" text-anchor="start">${rcFmt(s.avg)}</text>`;
    const below = crowdedAbove;
    return `<text class="rc-val" x="${x(i).toFixed(1)}" y="${(y(s.avg) + (below ? 19 : -10)).toFixed(1)}" text-anchor="middle">${rcFmt(s.avg)}</text>`;
  }).join('');

  const legend = RC_SERIES.map(sr => `<span class="rc-leg ${sr.cls}"><i></i>${sr.label}</span>`).join('');

  const table = `
    <details class="rc-table">
      <summary>ดูเป็นตาราง</summary>
      <table><thead><tr><th>ห้อง</th><th>จำนวน</th>${RC_SERIES.map(sr => `<th>${sr.label}</th>`).join('')}</tr></thead>
      <tbody>${stats.map(s => `<tr><td>${escapeHtml(s.room)}</td><td>${s.n}</td>${RC_SERIES.map(sr => `<td>${rcFmt(s[sr.key])}</td>`).join('')}</tr>`).join('')}</tbody></table>
    </details>`;

  return `
    <div class="rc-legend">${legend}<span class="rc-note">คะแนนเต็ม ${max}</span></div>
    <div class="rc-plot" data-course-id="${course.id}">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="กราฟเส้นคะแนนสูงสุด เฉลี่ย ต่ำสุด รายห้อง วิชา ${escapeHtml(course.name)}">
        ${grid}${xlabels}
        <line class="rc-cross" x1="0" x2="0" y1="${t}" y2="${t + ih}" style="display:none"/>
        ${lines}${avgLabels}
      </svg>
      <div class="rc-tip" hidden></div>
    </div>
    ${table}`;
}

function renderRoomCompare(courses) {
  const list = roomCompareCourses(courses);
  if (!list.length) return '';
  return `
    <section class="rc-card">
      <div class="rc-head">
        <div class="chart-title">คะแนนรายห้อง · สูงสุด เฉลี่ย ต่ำสุด</div>
      </div>
      ${list.length > 1
        ? `<div class="rc-tabs" role="tablist" aria-label="เลือกวิชา">${list.map((c, i) => `
            <button type="button" role="tab" class="rc-tab${i === 0 ? ' is-on' : ''}" aria-selected="${i === 0}" data-course-id="${c.id}" style="--tc:${courseColor(c) || 'var(--primary)'}">${escapeHtml(c.name)}</button>`).join('')}
          </div>`
        : `<div class="rc-course">${escapeHtml(list[0].name)}</div>`}
      <div id="rc-body">${renderRoomCompareChart(list[0])}</div>
    </section>`;
}

function wireRoomCompare(courses) {
  const body = document.getElementById('rc-body');
  if (!body) return;
  const tabs = document.querySelectorAll('.rc-tab');
  const current = () => courses.find(c => c.id === body.querySelector('.rc-plot')?.dataset.courseId);
  tabs.forEach(tab => tab.addEventListener('click', () => {
    const c = courses.find(x => x.id === tab.dataset.courseId);
    if (!c) return;
    tabs.forEach(t => { const on = t === tab; t.classList.toggle('is-on', on); t.setAttribute('aria-selected', String(on)); });
    body.innerHTML = renderRoomCompareChart(c);
  }));

  // เลื่อนเมาส์/แตะบนกราฟ → เส้นนำสายตา + ป้ายค่าของห้องนั้น
  const show = (ev) => {
    const plot = ev.target.closest('.rc-plot');
    const c = current();
    if (!plot || !c) return;
    const svg = plot.querySelector('svg'), tip = plot.querySelector('.rc-tip'), cross = plot.querySelector('.rc-cross');
    const box = svg.getBoundingClientRect();
    const { l, r } = RC_GEO;
    const W = svg.viewBox.baseVal.width;
    const stats = roomCompareStats(c);
    const vx = (ev.clientX - box.left) / box.width * W;
    const i = Math.max(0, Math.min(stats.length - 1, Math.floor((vx - l) / ((W - l - r) / stats.length))));
    const cx = l + ((W - l - r) / stats.length) * (i + 0.5);
    cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.style.display = '';
    const s = stats[i];
    tip.innerHTML = `<b>ห้อง ${escapeHtml(s.room)}</b><small>${s.n} คน</small>` +
      RC_SERIES.map(sr => `<div class="rc-tip-row ${sr.cls}"><i></i><span>${sr.label}</span><b>${rcFmt(s[sr.key])}</b></div>`).join('');
    tip.hidden = false;
    const pct = cx / W * 100;
    tip.style.left = pct + '%';
    tip.classList.toggle('flip', pct > 58);
  };
  const hide = () => {
    const plot = body.querySelector('.rc-plot'); if (!plot) return;
    plot.querySelector('.rc-tip').hidden = true;
    plot.querySelector('.rc-cross').style.display = 'none';
  };
  let lastW = body.querySelector('svg')?.viewBox.baseVal.width || 0;
  let lastH = body.querySelector('svg')?.viewBox.baseVal.height || 0;
  if (window.ResizeObserver) new ResizeObserver(() => {
    if (!document.body.contains(body)) return;
    const sz = rcSize();
    if (Math.abs(sz.W - lastW) < 8 && Math.abs(sz.H - lastH) < 8) return;
    lastW = sz.W; lastH = sz.H;
    const c = current(); if (c) body.innerHTML = renderRoomCompareChart(c);
  }).observe(body);
  body.addEventListener('pointermove', show);
  body.addEventListener('pointerdown', show);
  body.addEventListener('pointerleave', hide);
}

// ---------- Lightweight inline SVG charts (no external chart library) ----------

function renderProgressChart(courses) {
  if (!courses.length) return `<div class="empty-state" style="padding:20px 0;">ยังไม่มีข้อมูล</div>`;
  return `
    <div class="progress-chart-list">
      ${courses.map(c => `
        <div class="progress-chart-row">
          <div class="progress-chart-label" title="${escapeHtml(c.name)}">
            <span class="progress-chart-dot" style="background:${courseColor(c) || 'var(--primary)'}"></span>
            <span class="progress-chart-label-text">${escapeHtml(c.name)}</span>
          </div>
          <div class="progress-bar"><div class="fill" style="width:${c.progress || 0}%; background:${courseColor(c) || 'var(--primary)'}"></div></div>
          <div class="progress-pct" style="color:${courseColor(c) || 'var(--primary)'};">${c.progress || 0}%</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderStudentDonut(courses, totalStudents) {
  if (!totalStudents) return `<div class="empty-state" style="padding:20px 0;">ยังไม่มีนักเรียน</div>`;
  const palette = ['#2D80F2', '#12A87A', '#7B52E6', '#1A9FD0', '#3FB86B', '#A25BE0'];  // ฟ้า เขียว ม่วง
  const r = 46, cx = 60, cy = 60, circumference = 2 * Math.PI * r;
  let offset = 0;
  const segs = courses.filter(c => c.studentCount > 0).map((c, i) => {
    const frac = c.studentCount / totalStudents;
    const len = frac * circumference;
    const seg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${courseColor(c) || palette[i % palette.length]}"
      stroke-width="16" stroke-dasharray="${len} ${circumference - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"></circle>`;
    offset += len;
    return seg;
  }).join('');
  const legend = courses.filter(c => c.studentCount > 0).map((c, i) => `
    <div class="donut-legend-item">
      <span class="dot" style="background:${courseColor(c) || palette[i % palette.length]}"></span>
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

// ==========================================================================
// วิดเจ็ตวัน/วันที่/เวลา + สภาพอากาศ (Open-Meteo ไม่ต้องใช้คีย์)
// ตำแหน่ง: ใช้ตำแหน่งของเบราว์เซอร์ ถ้าไม่อนุญาตจะใช้ค่าเริ่มต้น (นครราชสีมา)
// ==========================================================================
const WX_DEFAULT = { lat: 14.9799, lon: 102.0978, name: 'นครราชสีมา' };
const WX_CODES = [
  [[0], 'ท้องฟ้าแจ่มใส', '☀️', '🌙'], [[1, 2], 'มีเมฆบางส่วน', '⛅', '☁️'], [[3], 'เมฆมาก', '☁️', '☁️'],
  [[45, 48], 'มีหมอก', '🌫️', '🌫️'], [[51, 53, 55, 56, 57], 'ฝนปรอย', '🌦️', '🌧️'],
  [[61, 63, 65, 66, 67, 80, 81, 82], 'ฝนตก', '🌧️', '🌧️'], [[71, 73, 75, 77, 85, 86], 'หิมะ', '🌨️', '🌨️'],
  [[95, 96, 99], 'พายุฝนฟ้าคะนอง', '⛈️', '⛈️'],
];
function wxSky(code, isDay) {
  const t = isDay ? 'day' : 'night';
  if ([95, 96, 99].includes(code)) return 'storm';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain-' + t;
  if ([45, 48].includes(code)) return 'fog-' + t;
  if (code === 3) return 'cloud-' + t;
  if ([1, 2].includes(code)) return 'part-' + t;
  return 'clear-' + t;
}
function wxDescribe(code, isDay) {
  const hit = WX_CODES.find(r => r[0].includes(code));
  return hit ? { text: hit[1], emoji: isDay ? hit[2] : hit[3] } : { text: 'ไม่ทราบสภาพอากาศ', emoji: '🌡️' };
}

function getWxPosition() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(WX_DEFAULT);
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, name: 'ตำแหน่งของคุณ' }),
      () => resolve(WX_DEFAULT),
      { timeout: 4000, maximumAge: 3600000 });
  });
}

async function loadWeather() {
  const KEY = 'myscore-wx';
  try {
    const c = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (c && Date.now() - c.t < 10 * 60 * 1000) return c.d;
  } catch (e) {}
  const pos = await getWxPosition();
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${pos.lat}&longitude=${pos.lon}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('weather ' + res.status);
  const cur = (await res.json()).current;
  const d = { ...cur, place: pos.name };
  try { sessionStorage.setItem(KEY, JSON.stringify({ t: Date.now(), d })); } catch (e) {}
  return d;
}

function initClockWeather() {
  const $ = id => document.getElementById(id);
  const tick = () => {
    const elTime = $('cw-time');
    if (!elTime) { clearInterval(timer); return; } // ออกจากหน้าแรกแล้ว
    const now = new Date();
    const hm = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });
    const sec = String(now.getSeconds()).padStart(2, '0');
    elTime.innerHTML = `${hm}<small>:${sec}</small>`;
    $('cw-day').textContent = now.toLocaleDateString('th-TH', { weekday: 'long' });
    $('cw-date').textContent = now.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
    const sN = now.getSeconds(), mN = now.getMinutes() + sN / 60, hN = (now.getHours() % 12) + mN / 60;
    const rot = (id, deg) => { const el = $(id); if (el) el.setAttribute('transform', `rotate(${deg} 50 50)`); };
    rot('cw-hh', hN * 30); rot('cw-mm', mN * 6); rot('cw-ss', sN * 6);
  };
  const timer = setInterval(tick, 1000);
  tick();

  loadWeather().then(w => {
    if (!$('cw-temp')) return;
    const info = wxDescribe(w.weather_code, w.is_day);
    $('cw-wx-ico').textContent = info.emoji;
    const card = $('cw-wx-ico').closest('.cw-weather');
    if (card) card.dataset.sky = wxSky(w.weather_code, w.is_day);
    $('cw-temp').textContent = `${Math.round(w.temperature_2m)}°C`;
    $('cw-wx-desc').textContent = info.text;
    $('cw-wx-meta').textContent = `${w.place} · รู้สึกเหมือน ${Math.round(w.apparent_temperature)}° · ชื้น ${w.relative_humidity_2m}%`;
  }).catch(() => {
    const card = document.querySelector('.cw-weather'); if (card) card.dataset.sky = 'cloud-day';
    if ($('cw-wx-desc')) { $('cw-wx-ico').textContent = '🌡️'; $('cw-wx-desc').textContent = 'โหลดสภาพอากาศไม่ได้'; }
  });
}
