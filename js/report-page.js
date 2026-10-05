// ==========================================================================
// หน้ารายงาน (เมนูด้านข้าง): เลือกภาคเรียน → ดู "สรุปผลการเรียน" และกดส่งออกได้ทันทีจากทุกรายวิชา/ห้อง
//   • สรุปผลการเรียน → ตารางเกรดตามแบบฟอร์ม + สถิติเกรดรายวิชา (ย้ายมาจากหน้าแรก)
//   • ส่งออกข้อมูล  → ไฟล์ CSV คะแนนจริงของห้อง
//   • SGS           → แปลงคะแนนเป็น 30/20/30/20 (openNextSchoolModal ใน report.js)
//   • Next School   → ใส่คะแนนลงไฟล์ฟอร์มของโรงเรียน (openNextSchoolFormModal ใน report.js)
// ใช้ฟังก์ชันส่งออกตัวเดิมทั้งหมด ไม่ต้องเข้าไปที่แท็บรายงานในแต่ละวิชา
// ==========================================================================

const termKey = (c) => `${(c.year || '').toString().trim()}|${(c.semester || '').toString().trim()}`;
function termLabel(key) {
  if (key === '__all__') return 'ทุกภาคเรียน';
  const [y, s] = key.split('|');
  if (!y && !s) return 'ไม่ระบุภาคเรียน';
  return `ภาคเรียนที่ ${s || '-'}/${y || '-'}`;
}

async function loadRoomReportData(course, section) {
  const uid = AppState.user.uid;
  const courseBase = db.collection('users').doc(uid).collection('courses').doc(course.id);
  const secBase = sectionRef(uid, course.id, section.id);
  const [studentsSnap, assessSnap, scoresSnap, gradingDoc] = await Promise.all([
    secBase.collection('students').orderBy('no', 'asc').get(),
    courseBase.collection('assessments').orderBy('order', 'asc').get(),
    secBase.collection('scores').get(),
    courseBase.collection('settings').doc('grading').get(),
  ]);
  const students = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  students.sort((a, b) => (Number(a.no) || 0) - (Number(b.no) || 0));
  const assessments = assessSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const scores = {};
  scoresSnap.docs.forEach(d => { scores[d.id] = d.data(); });
  const gradeScale = gradingDoc.exists ? gradingDoc.data().scale : DEFAULT_GRADE_SCALE;
  return { students, assessments, scores, gradeScale };
}

function exportRoomCsv(course, section, { students, assessments, scores, gradeScale }) {
  const header = ['เลขที่', 'รหัสนักเรียน', 'ชื่อ', 'นามสกุล', ...assessments.map(a => a.name), 'รวม', 'เกรด'];
  const rows = students.map(s => {
    const sc = scores[s.id] || {};
    const total = assessments.reduce((sum, a) => sum + (Number(sc[a.id]) || 0), 0);
    return [s.no, s.code, s.firstName, s.lastName, ...assessments.map(a => sc[a.id] ?? ''), total, calcGrade(total, gradeScale)];
  });
  downloadCsv(`คะแนน-${course.name}-ห้อง${section.room}.csv`, [header, ...rows]);
  showToast('ส่งออกไฟล์ CSV สำเร็จ');
}

function reportRoomRowHtml(course, { section, studentCount, progress }) {
  const col = getLevelColor(course.level);
  const empty = studentCount === 0;
  return `
    <div class="report-room-row" data-course-id="${course.id}" data-section-id="${section.id}">
      <div class="report-room-info">
        <span class="course-dot" style="background:${vividColor(course.color) || col.strong}"></span>
        <span class="report-room-name">ห้อง ${escapeHtml(section.room)}</span>
        <span class="report-room-meta">${studentCount} คน · บันทึกคะแนนแล้ว ${progress}%</span>
      </div>
      <div class="report-room-actions">
        ${empty ? `<span class="report-room-empty">ยังไม่มีนักเรียนในห้องนี้</span>` : `
          <button class="btn btn-ghost btn-sm rp-export" data-kind="csv">ส่งออกข้อมูล</button>
          <button class="btn btn-primary btn-sm rp-export" data-kind="sgs">SGS</button>
          <button class="btn btn-primary btn-sm rp-export" data-kind="nextschool">Next School</button>`}
      </div>
    </div>`;
}

function reportPageBodyHtml(cards) {
  if (cards.length === 0) return `<div class="card"><div class="empty-state"><div class="icon">${icon('book')}</div>ไม่มีรายวิชาในภาคเรียนนี้</div></div>`;
  const groups = LEVEL_OPTIONS.map(level => ({ level, cards: cards.filter(c => c.course.level === level) }))
    .filter(g => g.cards.length > 0);
  const noLevel = cards.filter(c => !LEVEL_OPTIONS.includes(c.course.level));
  if (noLevel.length > 0) groups.push({ level: null, cards: noLevel });

  return `<div class="struct-groups">${groups.map(g => {
    const col = getLevelColor(g.level);
    return `
      <div class="struct-group">
        <div class="struct-group-header" style="background:${col.tint}; color:${col.strong};">
          <span class="struct-group-title">${g.level ? g.level : 'ไม่ระบุระดับชั้น'}</span>
          <span class="struct-group-count">${g.cards.length} วิชา</span>
        </div>
        <div class="scores-subject-list">
          ${g.cards.map(({ course, sections }) => `
            <div class="scores-subject-block">
              <div class="scores-subject-title" style="border-left:4px solid ${col.strong};">
                <span class="struct-code" style="color:${col.strong};">${escapeHtml(course.code || 'ไม่มีรหัส')}</span>
                <span class="struct-course-name">${escapeHtml(course.name)}</span>
              </div>
              ${sections.length === 0
                ? `<div class="empty-state" style="padding:10px 0 0; text-align:left;">วิชานี้ยังไม่มีห้องเรียน</div>`
                : `<div class="report-room-list">${sections.map(si => reportRoomRowHtml(course, si)).join('')}</div>`}
            </div>`).join('')}
        </div>
      </div>`;
  }).join('')}</div>`;
}

async function renderReportPage() {
  const view = document.getElementById('view');
  view.innerHTML = `<div class="empty-state">กำลังโหลด...</div>`;

  // โหลดครั้งเดียว (รวมเกรดรายห้อง) แล้วสลับภาคเรียนจากข้อมูลในหน่วยความจำ ไม่ต้องโหลดซ้ำ
  const { courses, sectionCards } = await loadCoursesWithGrades(); // เฉพาะวิชาที่ยังเปิดใช้งาน
  if (courses.length === 0) {
    view.innerHTML = `
      <div class="page-header"><h1>รายงาน</h1><div class="sub">สรุปผลการเรียน และส่งออกข้อมูลเข้าฟอร์ม SGS / Next School</div></div>
      <div class="card"><div class="empty-state"><div class="icon">${icon('book')}</div>ยังไม่มีรายวิชา กรุณาสร้างรายวิชาก่อน</div></div>`;
    return;
  }

  // ภาคเรียนทั้งหมดที่มี เรียงใหม่สุดก่อน (ปีมาก→น้อย, เทอมมาก→น้อย) และเลือกภาคเรียนล่าสุดเป็นค่าเริ่มต้น
  const terms = [...new Set(courses.map(termKey))].sort((a, b) => {
    const [ya, sa] = a.split('|'), [yb, sb] = b.split('|');
    return (Number(yb) || 0) - (Number(ya) || 0) || (Number(sb) || 0) - (Number(sa) || 0);
  });
  let currentTerm = AppState.reportPageTerm && (AppState.reportPageTerm === '__all__' || terms.includes(AppState.reportPageTerm))
    ? AppState.reportPageTerm : terms[0];

  view.innerHTML = `
    <div class="page-header">
      <h1>รายงาน</h1>
      <div class="sub">เลือกภาคเรียน เพื่อดูสรุปผลการเรียน และกดส่งออกข้อมูลหรือคะแนนเข้าฟอร์ม SGS / Next School ของแต่ละห้อง</div>
    </div>
    <div class="toolbar" style="margin-bottom:16px;">
      <div class="toolbar-left">
        <label for="report-term" style="font-size:13px; font-weight:600;">ภาคเรียน</label>
        <select id="report-term" class="gs-select">
          ${terms.map(t => `<option value="${t}" ${t === currentTerm ? 'selected' : ''}>${escapeHtml(termLabel(t))}</option>`).join('')}
          ${terms.length > 1 ? `<option value="__all__" ${currentTerm === '__all__' ? 'selected' : ''}>ทุกภาคเรียน</option>` : ''}
        </select>
      </div>
    </div>
    <div id="report-page-body"></div>`;

  const body = document.getElementById('report-page-body');
  let cards = [];

  function drawBody() {
    AppState.reportPageTerm = currentTerm;
    const list = currentTerm === '__all__' ? courses : courses.filter(c => termKey(c) === currentTerm);
    cards = list.map(course => ({
      course,
      sections: sectionCards.filter(sc => sc.courseId === course.id)
        .map(sc => ({ section: { id: sc.sectionId, room: sc.room }, studentCount: sc.studentCount, progress: sc.progress })),
    }));
    body.innerHTML = `
      <section class="report-section">
        <h2 class="report-h2">สรุปผลการเรียน</h2>
        <div id="grade-summary-body">${buildGradeSummaryHtml(list, '__all__')}</div>
        <details class="gs-details">
          <summary>สถิติเกรดรายวิชา (กราฟ)</summary>
          <div id="grade-stats-body">${buildGradeStatsBodyHtml(list, '__all__')}</div>
        </details>
      </section>
      <section class="report-section">
        <h2 class="report-h2">ส่งออกข้อมูลรายห้อง</h2>
        ${reportPageBodyHtml(cards)}
      </section>`;
    wireGradeSummaryRows();
    wireGradeRoomFilters(list);
  }

  // delegation: ผูก event ครั้งเดียวที่ container (วาดซ้ำเมื่อเปลี่ยนภาคเรียนได้โดยไม่ต้องผูกใหม่)
  body.addEventListener('click', async (e) => {
    const btn = e.target.closest('.rp-export');
    if (!btn || btn.disabled) return;
    const row = btn.closest('.report-room-row');
    const card = cards.find(c => c.course.id === row.dataset.courseId);
    const section = card?.sections.find(s => s.section.id === row.dataset.sectionId)?.section;
    if (!card || !section) return;

    const label = btn.textContent;
    btn.disabled = true; btn.textContent = 'กำลังโหลด...';
    try {
      const data = await loadRoomReportData(card.course, section);
      const { students, assessments, scores, gradeScale } = data;
      if (btn.dataset.kind === 'csv') exportRoomCsv(card.course, section, data);
      else if (assessments.length === 0) showToast('วิชานี้ยังไม่ได้ตั้งโครงสร้างคะแนน');
      else if (btn.dataset.kind === 'sgs') openNextSchoolModal(card.course, section, students, assessments, scores, gradeScale);
      else openNextSchoolFormModal(card.course, section, students, assessments, scores, gradeScale);
    } catch (err) {
      console.error(err);
      showToast('โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      btn.disabled = false; btn.textContent = label;
    }
  });

  document.getElementById('report-term').addEventListener('change', (e) => {
    currentTerm = e.target.value;
    drawBody();
  });

  drawBody();
}
