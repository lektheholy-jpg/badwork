// ==========================================================================
// Report: summary stats, grade distribution, export — scoped to one ห้อง
// ==========================================================================

async function renderReportTab(container, course, section) {
  container.innerHTML = `<div class="empty-state">กำลังโหลด...</div>`;
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
  const assessments = assessSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const scores = {};
  scoresSnap.docs.forEach(d => { scores[d.id] = d.data(); });
  const gradeScale = gradingDoc.exists ? gradingDoc.data().scale : DEFAULT_GRADE_SCALE;
  const maxTotal = assessments.reduce((s, a) => s + (Number(a.max) || 0), 0) || 100;

  const totals = students.map(s => {
    const sc = scores[s.id] || {};
    return assessments.reduce((sum, a) => sum + (Number(sc[a.id]) || 0), 0);
  });

  const avg = totals.length ? (totals.reduce((a, b) => a + b, 0) / totals.length) : 0;
  const max = totals.length ? Math.max(...totals) : 0;
  const min = totals.length ? Math.min(...totals) : 0;

  const gradeCounts = {};
  gradeScale.forEach(g => { gradeCounts[g.grade] = 0; });
  totals.forEach(t => {
    const g = calcGrade(t, gradeScale);
    gradeCounts[g] = (gradeCounts[g] || 0) + 1;
  });
  const maxCount = Math.max(1, ...Object.values(gradeCounts));

  container.innerHTML = `
    <div style="font-size:13px; color:var(--ink-soft); font-weight:600; margin-bottom:10px;">ห้อง ${escapeHtml(section.room)}</div>
    <div class="stat-row">
      <div class="stat-card"><div class="label">คะแนนเฉลี่ย</div><div class="value">${avg.toFixed(1)}</div></div>
      <div class="stat-card"><div class="label">คะแนนสูงสุด</div><div class="value">${max}</div></div>
      <div class="stat-card"><div class="label">คะแนนต่ำสุด</div><div class="value">${min}</div></div>
    </div>

    <div class="card card-pad" style="margin-bottom:16px;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
        <h2 style="font-size:14.5px;">การกระจายเกรด</h2>
        <button class="btn btn-ghost btn-sm" id="edit-grade-scale">ตั้งเกณฑ์เกรด</button>
      </div>
      ${gradeScale.map(g => `
        <div class="dist-row">
          <span class="g-label">${g.grade}</span>
          <div class="g-bar-track"><div class="g-bar-fill" style="width:${((gradeCounts[g.grade] || 0) / maxCount) * 100}%"></div></div>
          <span class="g-count">${gradeCounts[g.grade] || 0}</span>
        </div>
      `).join('')}
    </div>

    <div class="card card-pad">
      <h2 style="font-size:14.5px; margin-bottom:12px;">ส่งออกข้อมูล</h2>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-ghost btn-sm" id="export-csv-btn">Export CSV</button>
      </div>
    </div>
  `;

  document.getElementById('export-csv-btn').addEventListener('click', () => {
    const header = ['เลขที่', 'รหัสนักเรียน', 'ชื่อ', 'นามสกุล', ...assessments.map(a => a.name), 'รวม', 'เกรด'];
    const rows = students.map(s => {
      const sc = scores[s.id] || {};
      const total = assessments.reduce((sum, a) => sum + (Number(sc[a.id]) || 0), 0);
      return [s.no, s.code, s.firstName, s.lastName, ...assessments.map(a => sc[a.id] ?? ''), total, calcGrade(total, gradeScale)];
    });
    downloadCsv(`คะแนน-${course.name}-ห้อง${section.room}.csv`, [header, ...rows]);
    showToast('ส่งออกไฟล์ CSV สำเร็จ');
  });

  document.getElementById('edit-grade-scale').addEventListener('click', () => openGradeScaleModal(course, section, gradeScale));
}

function openGradeScaleModal(course, section, scale) {
  let rows = scale.map(r => ({ ...r }));
  function draw() {
    openModal(`
      <h2>ตั้งเกณฑ์เกรด</h2>
      <div class="modal-sub">กำหนดเกรดและคะแนนขั้นต่ำของแต่ละเกรด — ใช้ร่วมกันทุกห้องในวิชานี้</div>
      <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:14px;" id="scale-rows">
        ${rows.map((r, idx) => `
          <div style="display:flex; gap:8px; align-items:center;">
            <input class="scale-grade" data-idx="${idx}" value="${escapeHtml(r.grade)}" style="width:70px; padding:7px; border:1px solid var(--border); border-radius:6px;">
            <span style="font-size:13px; color:var(--ink-soft);">คะแนนขั้นต่ำ</span>
            <input class="scale-min" type="number" data-idx="${idx}" value="${r.min}" style="width:80px; padding:7px; border:1px solid var(--border); border-radius:6px;">
            <button class="btn btn-danger-ghost btn-sm del-scale-row" data-idx="${idx}">ลบ</button>
          </div>
        `).join('')}
      </div>
      <button class="btn btn-ghost btn-sm" id="add-scale-row">+ เพิ่มระดับเกรด</button>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="cancel-scale">ยกเลิก</button>
        <button class="btn btn-primary" id="save-scale">บันทึกเกณฑ์เกรด</button>
      </div>
    `);
    document.querySelectorAll('.scale-grade').forEach(i => i.addEventListener('input', () => { rows[i.dataset.idx].grade = i.value; }));
    document.querySelectorAll('.scale-min').forEach(i => i.addEventListener('input', () => { rows[i.dataset.idx].min = Number(i.value); }));
    document.querySelectorAll('.del-scale-row').forEach(b => b.addEventListener('click', () => { rows.splice(b.dataset.idx, 1); draw(); }));
    document.getElementById('add-scale-row').addEventListener('click', () => { rows.push({ grade: '', min: 0 }); draw(); });
    document.getElementById('cancel-scale').addEventListener('click', closeModal);
    document.getElementById('save-scale').addEventListener('click', async () => {
      await db.collection('users').doc(AppState.user.uid).collection('courses').doc(course.id)
        .collection('settings').doc('grading').set({ scale: rows });
      closeModal();
      showToast('บันทึกเกณฑ์เกรดสำเร็จ');
      renderReportTab(document.getElementById('course-tab-body'), course, section);
    });
  }
  draw();
}
