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
  students.sort((a, b) => (Number(a.no) || 0) - (Number(b.no) || 0));
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
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn btn-ghost btn-sm" id="export-csv-btn">Export CSV</button>
        <button class="btn btn-ghost btn-sm" id="export-pp5-btn">Export เข้าฟอร์ม ปพ.5</button>
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

  document.getElementById('export-pp5-btn').addEventListener('click', () => {
    openPp5ExportModal(course, section, students, assessments, scores);
  });

  document.getElementById('edit-grade-scale').addEventListener('click', () => openGradeScaleModal(course, section, gradeScale));
}

// ==========================================================================
// Export เข้าฟอร์ม ปพ.5 — อัปโหลดไฟล์แบบฟอร์มที่โรงเรียนออก ID คอลัมน์คะแนนมาให้
// (คอลัมน์ A-E = ลำดับ/ID/รหัส/ชื่อ/ห้อง ตายตัว, คอลัมน์คะแนนเริ่ม F เป็นต้นไป
//  จำนวน/ป้ายกำกับของคอลัมน์คะแนนอ่านจากแถวหัวตารางของไฟล์ ไม่ตายตัว)
// ไม่แก้โครงสร้างคะแนน/หน้ากรอกคะแนนเดิม — แค่ "แปลง" ตอนส่งออกเท่านั้น
// ==========================================================================

const PP5_SCORE_COL_START = 5; // คอลัมน์ F (0-indexed)
const PP5_CODE_COL = 2;        // คอลัมน์ C (รหัส)
const PP5_HEADER_ROWS = 4;     // แถวหัวตาราง 4 แถวแรก, ข้อมูลนักเรียนเริ่มแถวที่ 5 (index 4)

function parsePp5TemplateColumns(aoa) {
  const groupRow = aoa[0] || [];
  const idRow = aoa[1] || [];
  const orderRow = aoa[2] || [];
  const maxRow = aoa[3] || [];
  const cols = [];
  let lastGroup = '';
  const width = Math.max(groupRow.length, idRow.length, orderRow.length, maxRow.length);
  for (let c = PP5_SCORE_COL_START; c < width; c++) {
    if (groupRow[c] !== undefined && groupRow[c] !== '') lastGroup = groupRow[c];
    const max = maxRow[c];
    if (max === undefined || max === '') break; // จบชุดคอลัมน์คะแนนเมื่อไม่มีค่าคะแนนเต็มแล้ว
    cols.push({
      colIndex: c,
      group: lastGroup,
      order: orderRow[c] !== undefined ? orderRow[c] : '',
      max: Number(max) || 0,
      itemId: idRow[c] !== undefined ? idRow[c] : '',
    });
  }
  return cols;
}

function openPp5ExportModal(course, section, students, assessments, scores) {
  openModal(`
    <h2>ส่งออกเข้าฟอร์ม ปพ.5</h2>
    <div class="modal-sub">ห้อง ${escapeHtml(section.room)} — อัปโหลดไฟล์แบบฟอร์ม ปพ.5 ที่โรงเรียนออกให้สำหรับวิชา/ห้องนี้ (ไฟล์ .xlsx) ระบบจะอ่านโครงสร้างคอลัมน์คะแนนจากไฟล์เอง แล้วให้เลือกว่ารายการคะแนนของครูข้อไหนลงคอลัมน์ไหน</div>
    <div class="field">
      <input type="file" id="pp5-file" accept=".xlsx,.xls">
      <div class="field-hint">ต้องเป็นไฟล์ต้นฉบับที่มีคอลัมน์ ID ของโรงเรียนอยู่แล้ว (คอลัมน์ A-E: ลำดับ/ID/รหัส/ชื่อ/ห้อง) — ระบบจะเติมเฉพาะคะแนน ไม่แก้คอลัมน์อื่น</div>
    </div>
    <div id="pp5-body"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="pp5-cancel">ยกเลิก</button>
      <button class="btn btn-primary hidden" id="pp5-confirm">ส่งออกไฟล์</button>
    </div>
  `);
  document.getElementById('pp5-cancel').addEventListener('click', closeModal);

  let wb = null, ws = null, aoa = null, targetCols = [];

  document.getElementById('pp5-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    const bodyEl = document.getElementById('pp5-body');
    const confirmBtn = document.getElementById('pp5-confirm');
    confirmBtn.classList.add('hidden');
    if (!file) return;
    bodyEl.innerHTML = `<div class="empty-state">กำลังอ่านไฟล์...</div>`;
    try {
      const data = await file.arrayBuffer();
      wb = XLSX.read(data, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      ws = wb.Sheets[sheetName];
      aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      targetCols = parsePp5TemplateColumns(aoa);

      if (targetCols.length === 0) {
        bodyEl.innerHTML = `<div class="card card-pad"><div class="check-row warn">✕ อ่านโครงสร้างคอลัมน์คะแนนจากไฟล์นี้ไม่ได้ ตรวจสอบว่าเป็นไฟล์ต้นฉบับที่โรงเรียนออกให้จริงหรือไม่</div></div>`;
        return;
      }

      const courseBase = db.collection('users').doc(AppState.user.uid).collection('courses').doc(course.id);
      const savedDoc = await courseBase.collection('settings').doc('pp5mapping').get();
      const saved = savedDoc.exists ? savedDoc.data() : null;
      const savedMap = (saved && Array.isArray(saved.columns) && saved.columns.length === targetCols.length)
        ? saved.columns : null;

      bodyEl.innerHTML = `
        <div class="card card-pad" style="margin-bottom:12px;">
          <div class="check-row ok">✓ พบคอลัมน์คะแนนในฟอร์ม ${targetCols.length} คอลัมน์ — เลือกรายการคะแนนของครูที่จะลงแต่ละคอลัมน์ (เลือกได้มากกว่า 1 รายการ ระบบจะรวมคะแนนให้)</div>
        </div>
        <div style="display:flex; flex-direction:column; gap:12px;" id="pp5-map-rows">
          ${targetCols.map((col, idx) => `
            <div class="card card-pad">
              <div style="font-size:13px; font-weight:600; margin-bottom:6px;">
                ${escapeHtml(col.group || '')} ข้อที่ ${escapeHtml(String(col.order))} — เต็ม ${col.max} คะแนน
                <span style="color:var(--ink-soft); font-weight:400;">(รหัสคอลัมน์ในระบบโรงเรียน: ${escapeHtml(String(col.itemId))})</span>
              </div>
              <div style="display:flex; flex-wrap:wrap; gap:10px;">
                ${assessments.map(a => `
                  <label style="display:flex; align-items:center; gap:5px; font-size:13px;">
                    <input type="checkbox" class="pp5-item-check" data-col="${idx}" data-item="${a.id}"
                      ${savedMap && savedMap[idx] && savedMap[idx].assessmentIds && savedMap[idx].assessmentIds.includes(a.id) ? 'checked' : ''}>
                    ${escapeHtml(a.name)} (${a.max})
                  </label>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
        <div id="pp5-mismatch-preview" style="margin-top:12px;"></div>
      `;
      confirmBtn.classList.remove('hidden');
      updateMismatchPreview();

      document.querySelectorAll('.pp5-item-check').forEach(chk => chk.addEventListener('change', updateMismatchPreview));
    } catch (err) {
      bodyEl.innerHTML = `<div class="card card-pad"><div class="check-row warn">✕ อ่านไฟล์ไม่สำเร็จ: ${escapeHtml(err.message || String(err))}</div></div>`;
    }
  });

  function updateMismatchPreview() {
    if (!aoa) return;
    const dataRows = aoa.slice(PP5_HEADER_ROWS);
    const fileCodes = new Set(dataRows.map(r => String(r[PP5_CODE_COL] ?? '').trim()).filter(Boolean));
    const appCodes = students.map(s => String(s.code ?? '').trim());
    const matched = appCodes.filter(c => fileCodes.has(c));
    const missingInFile = students.filter(s => !fileCodes.has(String(s.code ?? '').trim()));
    const el = document.getElementById('pp5-mismatch-preview');
    if (!el) return;
    el.innerHTML = `
      <div class="card card-pad">
        <div class="check-row ${missingInFile.length === 0 ? 'ok' : 'warn'}">
          ${missingInFile.length === 0 ? '✓' : '✕'} จับคู่รหัสนักเรียนได้ ${matched.length}/${students.length} คน
        </div>
        ${missingInFile.length > 0 ? `
          <div style="font-size:12.5px; color:var(--ink-soft); margin-top:6px;">
            ไม่พบรหัสในไฟล์ต้นแบบ (จะไม่ถูกส่งออก): ${missingInFile.map(s => escapeHtml(`${s.firstName} ${s.lastName} (รหัส ${s.code || '-'})`)).join(', ')}
          </div>
        ` : ''}
      </div>
    `;
  }

  document.getElementById('pp5-confirm').addEventListener('click', async () => {
    if (!wb || !ws || !aoa || targetCols.length === 0) { showToast('กรุณาอัปโหลดไฟล์ก่อน'); return; }

    const mapping = targetCols.map((col, idx) => ({
      colIndex: col.colIndex,
      itemId: col.itemId,
      assessmentIds: Array.from(document.querySelectorAll(`.pp5-item-check[data-col="${idx}"]:checked`)).map(el => el.dataset.item),
    }));

    const courseBase = db.collection('users').doc(AppState.user.uid).collection('courses').doc(course.id);
    await courseBase.collection('settings').doc('pp5mapping').set({ columns: mapping });

    const dataRows = aoa.slice(PP5_HEADER_ROWS);
    const rowByCode = new Map();
    dataRows.forEach((r, i) => {
      const code = String(r[PP5_CODE_COL] ?? '').trim();
      if (code) rowByCode.set(code, PP5_HEADER_ROWS + i);
    });

    let matchedCount = 0;
    const missing = [];
    students.forEach(s => {
      const code = String(s.code ?? '').trim();
      const rowIdx = rowByCode.get(code);
      if (rowIdx === undefined) { missing.push(`${s.firstName} ${s.lastName} (รหัส ${s.code || '-'})`); return; }
      matchedCount++;
      const sc = scores[s.id] || {};
      mapping.forEach(m => {
        const total = m.assessmentIds.reduce((sum, aid) => sum + (Number(sc[aid]) || 0), 0);
        const cellRef = XLSX.utils.encode_cell({ r: rowIdx, c: m.colIndex });
        ws[cellRef] = { ...(ws[cellRef] || {}), t: 'n', v: total };
      });
    });

    if (matchedCount === 0) {
      showToast('ไม่พบนักเรียนที่จับคู่รหัสได้เลย ตรวจสอบไฟล์อีกครั้ง');
      return;
    }

    const range = XLSX.utils.decode_range(ws['!ref']);
    range.e.r = Math.max(range.e.r, PP5_HEADER_ROWS + dataRows.length - 1);
    ws['!ref'] = XLSX.utils.encode_range(range);

    XLSX.writeFile(wb, `ปพ5-${course.code || course.name}-ห้อง${section.room}.xlsx`);
    closeModal();
    showToast(`ส่งออกสำเร็จ ${matchedCount}/${students.length} คน${missing.length ? ` (ตกหล่น ${missing.length} คน)` : ''}`);
  });
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
