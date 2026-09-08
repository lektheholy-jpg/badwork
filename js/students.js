// ==========================================================================
// Students: list, manual add, CSV / paste import
// ==========================================================================

async function renderStudentsTab(container, course) {
  container.innerHTML = `<div class="empty-state">กำลังโหลด...</div>`;
  const uid = AppState.user.uid;
  const snap = await db.collection('users').doc(uid).collection('courses').doc(course.id)
    .collection('students').orderBy('no', 'asc').get();
  const students = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  container.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left">
        <span style="font-size:13px; color:var(--ink-soft);">นักเรียนทั้งหมด ${students.length} คน</span>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-ghost btn-sm" id="add-one-btn">+ เพิ่มทีละคน</button>
        <button class="btn btn-primary btn-sm" id="import-btn">นำเข้ารายชื่อ</button>
      </div>
    </div>
    ${students.length === 0 ? `<div class="card"><div class="empty-state"><div class="icon">👨‍🎓</div>ยังไม่มีนักเรียนในรายวิชานี้</div></div>` : `
      <div class="sheet-wrap">
        <table class="sheet">
          <thead><tr><th>เลขที่</th><th>รหัสนักเรียน</th><th>ชื่อ</th><th>นามสกุล</th><th></th></tr></thead>
          <tbody>
            ${students.map(s => `
              <tr data-id="${s.id}">
                <td class="name-cell">${escapeHtml(s.no)}</td>
                <td class="name-cell">${escapeHtml(s.code)}</td>
                <td class="name-cell">${escapeHtml(s.firstName)}</td>
                <td class="name-cell">${escapeHtml(s.lastName)}</td>
                <td class="name-cell"><button class="btn btn-danger-ghost btn-sm del-student">ลบ</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `}
  `;

  document.getElementById('add-one-btn').addEventListener('click', () => openAddOneStudentModal(course));
  document.getElementById('import-btn').addEventListener('click', () => openImportStudentsModal(course));
  container.querySelectorAll('.del-student').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const row = e.target.closest('tr');
      if (!confirm('ลบนักเรียนคนนี้ออกจากรายวิชา?')) return;
      await db.collection('users').doc(AppState.user.uid).collection('courses').doc(course.id)
        .collection('students').doc(row.dataset.id).delete();
      renderStudentsTab(container, course);
    });
  });
}

function openAddOneStudentModal(course) {
  openModal(`
    <h2>เพิ่มนักเรียน</h2>
    <div class="modal-sub">เพิ่มนักเรียนทีละคน</div>
    <div class="field-row">
      <div class="field"><label>เลขที่</label><input id="s-no" placeholder="1"></div>
      <div class="field"><label>รหัสนักเรียน</label><input id="s-code" placeholder="16001"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>ชื่อ</label><input id="s-first" placeholder="สมชาย"></div>
      <div class="field"><label>นามสกุล</label><input id="s-last" placeholder="ใจดี"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="cancel-add-student">ยกเลิก</button>
      <button class="btn btn-primary" id="submit-add-student">เพิ่มนักเรียน</button>
    </div>
  `);
  document.getElementById('cancel-add-student').addEventListener('click', closeModal);
  document.getElementById('submit-add-student').addEventListener('click', async () => {
    const first = document.getElementById('s-first').value.trim();
    if (!first) { showToast('กรุณากรอกชื่อ'); return; }
    await db.collection('users').doc(AppState.user.uid).collection('courses').doc(course.id)
      .collection('students').add({
        no: document.getElementById('s-no').value.trim(),
        code: document.getElementById('s-code').value.trim(),
        firstName: first,
        lastName: document.getElementById('s-last').value.trim(),
      });
    closeModal();
    showToast('เพิ่มนักเรียนสำเร็จ');
    renderStudentsTab(document.getElementById('course-tab-body'), course);
  });
}

function openImportStudentsModal(course) {
  openModal(`
    <h2>นำเข้ารายชื่อนักเรียน</h2>
    <div class="modal-sub">วางข้อมูลจาก Excel/CSV รูปแบบ: เลขที่, รหัสนักเรียน, ชื่อ, นามสกุล (คั่นด้วย comma หรือ tab)</div>
    <div class="field">
      <textarea id="import-text" rows="8" placeholder="1,16001,สมชาย,ใจดี&#10;2,16002,สมหญิง,รักเรียน"></textarea>
    </div>
    <div id="preview-area"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="cancel-import">ยกเลิก</button>
      <button class="btn btn-ghost" id="preview-import-btn">ตรวจสอบข้อมูล</button>
      <button class="btn btn-primary hidden" id="confirm-import-btn">นำเข้า</button>
    </div>
  `);
  document.getElementById('cancel-import').addEventListener('click', closeModal);

  let parsedRows = [];
  document.getElementById('preview-import-btn').addEventListener('click', () => {
    const text = document.getElementById('import-text').value;
    const rows = parseDelimitedText(text);
    parsedRows = rows.map(r => ({ no: r[0] || '', code: r[1] || '', firstName: r[2] || '', lastName: r[3] || '' }));

    const codes = parsedRows.map(r => r.code).filter(Boolean);
    const dupCodes = codes.filter((c, i) => codes.indexOf(c) !== i);
    const emptyNames = parsedRows.filter(r => !r.firstName.trim()).length;

    const checks = [
      { ok: parsedRows.length > 0, text: `พบข้อมูล ${parsedRows.length} คน` },
      { ok: dupCodes.length === 0, text: dupCodes.length === 0 ? 'ไม่มีรหัสซ้ำ' : `พบรหัสซ้ำ ${dupCodes.length} รายการ` },
      { ok: emptyNames === 0, text: emptyNames === 0 ? 'ไม่มีชื่อว่าง' : `พบชื่อว่าง ${emptyNames} รายการ` },
    ];

    document.getElementById('preview-area').innerHTML = `
      <div class="card card-pad" style="margin-bottom:10px;">
        ${checks.map(c => `<div class="check-row ${c.ok ? 'ok' : 'warn'}">${c.ok ? '✓' : '✕'} ${c.text}</div>`).join('')}
      </div>
    `;
    const canImport = parsedRows.length > 0 && dupCodes.length === 0 && emptyNames === 0;
    const confirmBtn = document.getElementById('confirm-import-btn');
    confirmBtn.classList.toggle('hidden', !canImport);
    confirmBtn.textContent = `นำเข้า ${parsedRows.length} คน`;
  });

  document.getElementById('confirm-import-btn').addEventListener('click', async () => {
    const batch = db.batch();
    const colRef = db.collection('users').doc(AppState.user.uid).collection('courses').doc(course.id).collection('students');
    parsedRows.forEach(r => {
      const ref = colRef.doc();
      batch.set(ref, r);
    });
    await batch.commit();
    closeModal();
    showToast(`นำเข้านักเรียน ${parsedRows.length} คนสำเร็จ`);
    renderStudentsTab(document.getElementById('course-tab-body'), course);
  });
}
