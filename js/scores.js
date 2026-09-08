// ==========================================================================
// Score entry: spreadsheet-style grid, grouped columns, autosave
// โครงสร้างคะแนน (assessments) ใช้ร่วมกันทุกห้องของวิชานี้
// นักเรียน/คะแนนจริง แยกตามห้อง (section)
// ==========================================================================

async function renderScoresTab(container, course, section) {
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

  const collectItems = assessments.filter(a => a.category === 'collect');
  const midItems = assessments.filter(a => a.category === 'midterm');
  const finalItems = assessments.filter(a => a.category === 'final');
  const collectMax = collectItems.reduce((s, a) => s + (Number(a.max) || 0), 0);
  const maxTotal = assessments.reduce((s, a) => s + (Number(a.max) || 0), 0);

  if (assessments.length === 0) {
    container.innerHTML = `<div class="card"><div class="empty-state"><div class="icon">🧮</div>กรุณากำหนดโครงสร้างคะแนนของวิชานี้ก่อนเริ่มบันทึกคะแนน</div></div>`;
    return;
  }
  if (students.length === 0) {
    container.innerHTML = `<div class="card"><div class="empty-state"><div class="icon">👨‍🎓</div>กรุณาเพิ่มรายชื่อนักเรียนในห้อง ${escapeHtml(section.room)} ก่อนเริ่มบันทึกคะแนน</div></div>`;
    return;
  }

  container.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left">
        <span style="font-size:13px; color:var(--ink-soft); font-weight:600;">ห้อง ${escapeHtml(section.room)}</span>
        <div class="search-box"><input id="student-search" placeholder="ค้นหานักเรียน..."></div>
      </div>
      <div class="save-status" id="save-status"><span class="dot"></span> บันทึกอัตโนมัติแล้ว</div>
    </div>
    <div class="sheet-wrap">
      <table class="sheet" id="score-sheet">
        <thead>
          <tr>
            <th rowspan="2">เลขที่</th>
            <th rowspan="2">นักเรียน</th>
            ${collectItems.length ? `<th class="grp-label grp-collect" colspan="${collectItems.length}">คะแนนเก็บ</th>` : ''}
            <th rowspan="2" class="grp-collect-total">รวมเก็บ<br><span style="font-weight:400;">/${collectMax}</span></th>
            ${midItems.map(a => `<th rowspan="2" class="grp-mid">${escapeHtml(a.name)}<br><span style="font-weight:400;">/${a.max}</span></th>`).join('')}
            ${finalItems.map(a => `<th rowspan="2" class="grp-final">${escapeHtml(a.name)}<br><span style="font-weight:400;">/${a.max}</span></th>`).join('')}
            <th rowspan="2">รวม<br><span style="font-weight:400;">/${maxTotal}</span></th>
            <th rowspan="2">เกรด</th>
          </tr>
          <tr>
            ${collectItems.map(a => `<th class="grp-collect">${escapeHtml(a.name)}<br><span style="font-weight:400;">/${a.max}</span></th>`).join('')}
          </tr>
        </thead>
        <tbody id="score-tbody">
          ${students.map(s => renderScoreRow(s, collectItems, midItems, finalItems, scores[s.id] || {}, collectMax, maxTotal, gradeScale)).join('')}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById('student-search').addEventListener('input', debounce((e) => {
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll('#score-tbody tr').forEach(row => {
      const text = row.dataset.searchtext || '';
      row.style.display = text.includes(q) ? '' : 'none';
    });
  }, 150));

  wireScoreInputs(container, course, section, students, collectItems, midItems, finalItems, scores, collectMax, maxTotal, gradeScale);
}

function renderScoreRow(student, collectItems, midItems, finalItems, studentScores, collectMax, maxTotal, gradeScale) {
  const collectSum = collectItems.reduce((s, a) => s + (Number(studentScores[a.id]) || 0), 0);
  const midSum = midItems.reduce((s, a) => s + (Number(studentScores[a.id]) || 0), 0);
  const finalSum = finalItems.reduce((s, a) => s + (Number(studentScores[a.id]) || 0), 0);
  const total = collectSum + midSum + finalSum;
  const grade = calcGrade(total, gradeScale);
  const searchText = `${student.no} ${student.code} ${student.firstName} ${student.lastName}`.toLowerCase();

  const cellFor = (a) => `
    <td class="grp-${a.category === 'collect' ? 'collect' : a.category === 'midterm' ? 'mid' : 'final'}" data-assessment-id="${a.id}">
      <input class="score-input" type="number" min="0" max="${a.max}"
             value="${studentScores[a.id] ?? ''}"
             data-student-id="${student.id}" data-assessment-id="${a.id}" data-max="${a.max}">
    </td>`;

  return `
    <tr data-student-id="${student.id}" data-searchtext="${escapeHtml(searchText)}">
      <td class="name-cell">${escapeHtml(student.no)}</td>
      <td class="name-cell">${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}<div class="name-sub">${escapeHtml(student.code || '')}</div></td>
      ${collectItems.map(cellFor).join('')}
      <td class="total-cell grp-collect-total" data-collect-for="${student.id}">${collectSum}</td>
      ${midItems.map(cellFor).join('')}
      ${finalItems.map(cellFor).join('')}
      <td class="total-cell" data-total-for="${student.id}">${total}/${maxTotal}</td>
      <td class="total-cell" data-grade-for="${student.id}"><span class="badge badge-neutral">${grade}</span></td>
    </tr>
  `;
}

function wireScoreInputs(container, course, section, students, collectItems, midItems, finalItems, scores, collectMax, maxTotal, gradeScale) {
  const uid = AppState.user.uid;
  const base = sectionRef(uid, course.id, section.id);
  const statusEl = document.getElementById('save-status');

  const saveCell = debounce(async (studentId, assessmentId, value) => {
    statusEl.classList.add('saving');
    statusEl.innerHTML = `<span class="dot"></span> กำลังบันทึก...`;
    try {
      await base.collection('scores').doc(studentId).set({ [assessmentId]: value }, { merge: true });
      statusEl.classList.remove('saving');
      statusEl.innerHTML = `<span class="dot"></span> บันทึกแล้ว`;
    } catch (err) {
      statusEl.innerHTML = `<span class="dot" style="background:var(--danger)"></span> บันทึกไม่สำเร็จ`;
      console.error(err);
    }
  }, 500);

  function recalcRow(studentId) {
    const row = container.querySelector(`tr[data-student-id="${studentId}"]`);
    let collectSum = 0, total = 0;
    row.querySelectorAll('.score-input').forEach(inp => {
      const val = Number(inp.value) || 0;
      total += val;
      if (collectItems.some(a => a.id === inp.dataset.assessmentId)) collectSum += val;
    });
    row.querySelector(`[data-collect-for="${studentId}"]`).textContent = collectSum;
    row.querySelector(`[data-total-for="${studentId}"]`).textContent = `${total}/${maxTotal}`;
    const grade = calcGrade(total, gradeScale);
    row.querySelector(`[data-grade-for="${studentId}"]`).innerHTML = `<span class="badge badge-neutral">${grade}</span>`;
  }

  const inputs = [...container.querySelectorAll('.score-input')];

  inputs.forEach((inp) => {
    inp.addEventListener('input', () => {
      const max = Number(inp.dataset.max);
      const val = Number(inp.value);
      inp.closest('td').classList.toggle('over-max', inp.value !== '' && val > max);
      recalcRow(inp.dataset.studentId);
      saveCell(inp.dataset.studentId, inp.dataset.assessmentId, inp.value === '' ? 0 : val);
    });

    inp.addEventListener('keydown', (e) => {
      const row = inp.closest('tr');
      const cellsInRow = [...row.querySelectorAll('.score-input')];
      const colIndex = cellsInRow.indexOf(inp);
      const rows = () => [...container.querySelectorAll('#score-tbody tr')].filter(r => r.style.display !== 'none');

      if (e.key === 'Enter') {
        e.preventDefault();
        const rs = rows(); const rowIndex = rs.indexOf(row);
        rs[rowIndex + 1]?.querySelectorAll('.score-input')[colIndex]?.focus();
      } else if (e.key === 'ArrowRight' && inp.selectionStart === inp.value.length) {
        cellsInRow[colIndex + 1]?.focus();
      } else if (e.key === 'ArrowLeft' && inp.selectionStart === 0) {
        cellsInRow[colIndex - 1]?.focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const rs = rows(); const rowIndex = rs.indexOf(row);
        rs[rowIndex + 1]?.querySelectorAll('.score-input')[colIndex]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const rs = rows(); const rowIndex = rs.indexOf(row);
        rs[rowIndex - 1]?.querySelectorAll('.score-input')[colIndex]?.focus();
      }
    });

    inp.addEventListener('paste', (e) => {
      const text = (e.clipboardData || window.clipboardData).getData('text');
      if (!text.includes('\t') && !text.includes('\n')) return;
      e.preventDefault();
      const grid = parseDelimitedText(text);
      const row = inp.closest('tr');
      const startColIdx = [...row.querySelectorAll('.score-input')].indexOf(inp);
      const rows = [...container.querySelectorAll('#score-tbody tr')].filter(r => r.style.display !== 'none');
      const startRowIdx = rows.indexOf(row);

      grid.forEach((rowVals, rOff) => {
        const targetRow = rows[startRowIdx + rOff];
        if (!targetRow) return;
        const targetInputs = [...targetRow.querySelectorAll('.score-input')];
        rowVals.forEach((val, cOff) => {
          const targetInp = targetInputs[startColIdx + cOff];
          if (!targetInp) return;
          const num = Number(val);
          targetInp.value = isNaN(num) ? '' : num;
          recalcRow(targetInp.dataset.studentId);
          saveCell(targetInp.dataset.studentId, targetInp.dataset.assessmentId, isNaN(num) ? 0 : num);
        });
      });
    });
  });
}
