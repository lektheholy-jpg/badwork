// ==========================================================================
// Score entry: spreadsheet-style grid with autosave
// ==========================================================================

async function renderScoresTab(container, course) {
  container.innerHTML = `<div class="empty-state">กำลังโหลด...</div>`;
  const uid = AppState.user.uid;
  const base = db.collection('users').doc(uid).collection('courses').doc(course.id);

  const [studentsSnap, assessSnap, scoresSnap, gradingDoc] = await Promise.all([
    base.collection('students').orderBy('no', 'asc').get(),
    base.collection('assessments').orderBy('order', 'asc').get(),
    base.collection('scores').get(),
    base.collection('settings').doc('grading').get(),
  ]);

  const students = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const assessments = assessSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const scores = {};
  scoresSnap.docs.forEach(d => { scores[d.id] = d.data(); });
  const gradeScale = gradingDoc.exists ? gradingDoc.data().scale : DEFAULT_GRADE_SCALE;

  if (assessments.length === 0) {
    container.innerHTML = `<div class="card"><div class="empty-state"><div class="icon">🧮</div>กรุณากำหนดโครงสร้างคะแนนก่อนเริ่มบันทึกคะแนน</div></div>`;
    return;
  }
  if (students.length === 0) {
    container.innerHTML = `<div class="card"><div class="empty-state"><div class="icon">👨‍🎓</div>กรุณาเพิ่มรายชื่อนักเรียนก่อนเริ่มบันทึกคะแนน</div></div>`;
    return;
  }

  const maxTotal = assessments.reduce((s, a) => s + (Number(a.max) || 0), 0);

  container.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left">
        <div class="search-box"><input id="student-search" placeholder="ค้นหานักเรียน..."></div>
      </div>
      <div class="save-status" id="save-status"><span class="dot"></span> บันทึกอัตโนมัติแล้ว</div>
    </div>
    <div class="sheet-wrap">
      <table class="sheet" id="score-sheet">
        <thead>
          <tr>
            <th>เลขที่</th>
            <th>นักเรียน</th>
            ${assessments.map(a => `<th title="${CATEGORY_LABELS[a.category] || ''}">${escapeHtml(a.name)}<br><span style="font-weight:400;">/${a.max}</span></th>`).join('')}
            <th>รวม</th>
            <th>เกรด</th>
          </tr>
        </thead>
        <tbody id="score-tbody">
          ${students.map(s => renderScoreRow(s, assessments, scores[s.id] || {}, maxTotal, gradeScale)).join('')}
        </tbody>
      </table>
    </div>
  `;

  // search filter
  document.getElementById('student-search').addEventListener('input', debounce((e) => {
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll('#score-tbody tr').forEach(row => {
      const text = row.dataset.searchtext || '';
      row.style.display = text.includes(q) ? '' : 'none';
    });
  }, 150));

  wireScoreInputs(container, course, students, assessments, scores, maxTotal, gradeScale);
}

function renderScoreRow(student, assessments, studentScores, maxTotal, gradeScale) {
  const total = assessments.reduce((s, a) => s + (Number(studentScores[a.id]) || 0), 0);
  const grade = calcGrade(total, gradeScale);
  const searchText = `${student.no} ${student.code} ${student.firstName} ${student.lastName}`.toLowerCase();
  return `
    <tr data-student-id="${student.id}" data-searchtext="${escapeHtml(searchText)}">
      <td class="name-cell">${escapeHtml(student.no)}</td>
      <td class="name-cell">${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}</td>
      ${assessments.map(a => `
        <td data-assessment-id="${a.id}">
          <input class="score-input" type="number" min="0" max="${a.max}"
                 value="${studentScores[a.id] ?? ''}"
                 data-student-id="${student.id}" data-assessment-id="${a.id}" data-max="${a.max}">
        </td>
      `).join('')}
      <td class="total-cell" data-total-for="${student.id}">${total}/${maxTotal}</td>
      <td class="total-cell" data-grade-for="${student.id}"><span class="badge badge-neutral">${grade}</span></td>
    </tr>
  `;
}

function wireScoreInputs(container, course, students, assessments, scores, maxTotal, gradeScale) {
  const uid = AppState.user.uid;
  const base = db.collection('users').doc(uid).collection('courses').doc(course.id);
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
    let total = 0;
    row.querySelectorAll('.score-input').forEach(inp => { total += Number(inp.value) || 0; });
    row.querySelector(`[data-total-for="${studentId}"]`).textContent = `${total}/${maxTotal}`;
    const grade = calcGrade(total, gradeScale);
    row.querySelector(`[data-grade-for="${studentId}"]`).innerHTML = `<span class="badge badge-neutral">${grade}</span>`;
  }

  const inputs = [...container.querySelectorAll('.score-input')];

  inputs.forEach((inp, idx) => {
    inp.addEventListener('input', () => {
      const max = Number(inp.dataset.max);
      const val = Number(inp.value);
      inp.closest('td').classList.toggle('over-max', inp.value !== '' && val > max);
      recalcRow(inp.dataset.studentId);
      saveCell(inp.dataset.studentId, inp.dataset.assessmentId, inp.value === '' ? 0 : val);
    });

    inp.addEventListener('keydown', (e) => {
      // Tab / Enter navigation between cells, like a spreadsheet
      const row = inp.closest('tr');
      const cellsInRow = [...row.querySelectorAll('.score-input')];
      const colIndex = cellsInRow.indexOf(inp);

      if (e.key === 'Enter') {
        e.preventDefault();
        const rows = [...container.querySelectorAll('#score-tbody tr')].filter(r => r.style.display !== 'none');
        const rowIndex = rows.indexOf(row);
        const nextRow = rows[rowIndex + 1];
        if (nextRow) nextRow.querySelectorAll('.score-input')[colIndex]?.focus();
      } else if (e.key === 'ArrowRight' && inp.selectionStart === inp.value.length) {
        cellsInRow[colIndex + 1]?.focus();
      } else if (e.key === 'ArrowLeft' && inp.selectionStart === 0) {
        cellsInRow[colIndex - 1]?.focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const rows = [...container.querySelectorAll('#score-tbody tr')].filter(r => r.style.display !== 'none');
        const rowIndex = rows.indexOf(row);
        rows[rowIndex + 1]?.querySelectorAll('.score-input')[colIndex]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const rows = [...container.querySelectorAll('#score-tbody tr')].filter(r => r.style.display !== 'none');
        const rowIndex = rows.indexOf(row);
        rows[rowIndex - 1]?.querySelectorAll('.score-input')[colIndex]?.focus();
      }
    });

    // paste หลายช่องพร้อมกัน (วางจาก Excel)
    inp.addEventListener('paste', (e) => {
      const text = (e.clipboardData || window.clipboardData).getData('text');
      if (!text.includes('\t') && !text.includes('\n')) return; // ปล่อยให้ paste ปกติถ้าเป็นค่าเดียว
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
