// ==========================================================================
// รายงานข้อตกลง PA (PA Report)
// แสดงสรุป PA ของครู แยกตามปีการศึกษา อ่านข้อมูลจาก Firestore
// ==========================================================================

const PA_RPT_ICO = `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><g fill="currentColor" stroke="none"><path opacity=".55" d="M7 2.5h7l5.5 5.5v11A2.5 2.5 0 0 1 17 21.5H7A2.5 2.5 0 0 1 4.5 19V5A2.5 2.5 0 0 1 7 2.5Z"/><rect x="8" y="9" width="8" height="1.5" rx=".75"/><rect x="8" y="12" width="8" height="1.5" rx=".75"/><rect x="8" y="15" width="5" height="1.5" rx=".75"/></g></svg>`;

// ------------------------------------------------------------------
// โหลดข้อมูล (ใช้ paCol ที่นิยามใน pa.js)
// ------------------------------------------------------------------
async function paReportLoadList() {
  const uid = AppState.user?.uid;
  if (!uid) return [];
  const snap = await paCol(uid).orderBy('createdAt', 'desc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ------------------------------------------------------------------
// แสดง detail card ของ PA หนึ่งรายการ
// ------------------------------------------------------------------
function paReportDetailCard(d) {
  const row = (label, val) => val
    ? `<tr><td class="par-lbl">${label}</td><td class="par-val">${escapeHtml(val)}</td></tr>`
    : '';

  const taskRows = (Array.isArray(d.tasks) ? d.tasks : []).filter(t => t.name).map((t, i) => `
    <div class="par-task">
      <div class="par-task-num">งานที่ ${i + 1}</div>
      <div class="par-task-name">${escapeHtml(t.name)}</div>
      <div class="par-task-details">
        ${t.goal      ? `<div><span class="par-tag">เป้าหมาย</span>${escapeHtml(t.goal)}</div>` : ''}
        ${t.indicator ? `<div><span class="par-tag">ตัวชี้วัด</span>${escapeHtml(t.indicator)}</div>` : ''}
        ${t.method    ? `<div><span class="par-tag">วิธีการ</span>${escapeHtml(t.method)}</div>` : ''}
        ${t.timeline  ? `<div><span class="par-tag">กำหนดเวลา</span>${escapeHtml(t.timeline)}</div>` : ''}
      </div>
    </div>`).join('') || `<div style="color:var(--ink-soft);font-size:14px;padding:8px 0">ยังไม่มีรายการงาน</div>`;

  const statusColor = d.status === 'submitted' ? 'var(--hue-teal)' : 'var(--ink-soft)';
  const statusLabel = d.status === 'submitted' ? 'ส่งแล้ว' : 'ร่าง';

  return `
    <div class="card par-card" data-id="${escapeHtml(d.id)}">
      <!-- หัวการ์ด -->
      <div class="par-card-head">
        <div>
          <div class="par-card-title">ปีการศึกษา ${escapeHtml(d.year || '—')} ภาคเรียนที่ ${escapeHtml(d.semester || '—')}</div>
          <div class="par-card-sub">${escapeHtml(d.teacherName || '')}${d.department ? ' · ' + escapeHtml(d.department) : ''}</div>
        </div>
        <span class="badge" style="background:${statusColor};color:var(--on-w);flex-shrink:0">${statusLabel}</span>
      </div>

      <!-- ข้อมูลทั่วไป -->
      ${(d.position || d.level || d.school) ? `
      <table class="par-table">
        ${row('ตำแหน่ง', d.position)}
        ${row('วิทยฐานะ', d.level)}
        ${row('กลุ่มสาระ / ฝ่าย', d.department)}
        ${row('สถานศึกษา', d.school)}
      </table>` : ''}

      <!-- ข้อตกลงการพัฒนางาน -->
      <div class="par-section-label">ข้อตกลงในการพัฒนางาน</div>
      <div class="par-tasks">${taskRows}</div>

      <!-- การพัฒนาตนเอง -->
      ${d.selfDev ? `
      <div class="par-section-label" style="margin-top:16px">การพัฒนาตนเอง</div>
      <div class="par-selfdev">${escapeHtml(d.selfDev)}</div>` : ''}

      <!-- ลิงก์แก้ไข -->
      <div class="par-card-footer">
        <button type="button" class="btn btn-ghost btn-sm par-edit-btn" data-id="${escapeHtml(d.id)}">
          <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><path d="M16.2 3.6a2.4 2.4 0 0 1 3.4 0l.8.8a2.4 2.4 0 0 1 0 3.4L9.5 18.7a2 2 0 0 1-.9.5l-4.3 1.1a.8.8 0 0 1-1-1l1.1-4.3c.1-.3.3-.6.5-.9Z"/></svg>
          แก้ไขข้อตกลง
        </button>
      </div>
    </div>`;
}

// ------------------------------------------------------------------
// render แท็บ "แบบฟอร์มรายงาน" — วาดลงพื้นที่เนื้อหาของหน้า PA (โครงหน้า+แท็บอยู่ใน pa.js)
// ------------------------------------------------------------------
async function renderPAReportView() {
  const view = paMount();
  showLoading('list', view);

  let list = [];
  try {
    list = await paReportLoadList();
  } catch (err) {
    if (!view.isConnected || PAState.tab !== 'report') return; // ผู้ใช้สลับแท็บ/ออกจากหน้าไปแล้ว
    clearLoading(view);
    view.classList.remove('is-switching');
    view.innerHTML = `<div class="card card-pad"><div class="empty-state">โหลดข้อมูลไม่สำเร็จ: ${escapeHtml(err.message)}</div></div>`;
    return;
  }
  if (!view.isConnected || PAState.tab !== 'report') return; // สลับไปแท็บอื่นระหว่างรอข้อมูล — ไม่วาดทับ

  const empty = list.length === 0 ? `
    <div class="card">
      <div class="empty-state">
        <div class="icon" style="background:var(--hue-violet)">${PA_RPT_ICO}</div>
        <div style="font-weight:600;font-size:17px;margin-bottom:8px">ยังไม่มีรายงาน PA</div>
        <div style="color:var(--ink-soft);margin-bottom:20px">สร้างข้อตกลง PA ก่อน แล้วรายงานจะแสดงที่นี่โดยอัตโนมัติ</div>
        <button type="button" class="btn btn-primary par-goto-pa">ไปที่ข้อตกลง PA</button>
      </div>
    </div>` : '';

  // สรุปตัวเลข
  const total    = list.length;
  const submitted = list.filter(d => d.status === 'submitted').length;
  const draft    = total - submitted;
  const totalTasks = list.reduce((n, d) => n + (Array.isArray(d.tasks) ? d.tasks.filter(t => t.name).length : 0), 0);

  const statsHtml = total > 0 ? `
    <div class="par-stats">
      <div class="stat-card card"><div class="label">ข้อตกลงทั้งหมด</div><div class="value">${total}</div></div>
      <div class="stat-card card"><div class="label">ส่งแล้ว</div><div class="value" style="color:var(--hue-teal)">${submitted}</div></div>
      <div class="stat-card card"><div class="label">ร่าง</div><div class="value" style="color:var(--ink-soft)">${draft}</div></div>
      <div class="stat-card card"><div class="label">รายการงานรวม</div><div class="value">${totalTasks}</div></div>
    </div>` : '';

  const cards = list.map(d => paReportDetailCard(d)).join('');

  view.innerHTML = `
    ${statsHtml}
    ${empty}
    <div class="par-cards">${cards}</div>
    <style>
      .par-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}
      .par-cards{display:flex;flex-direction:column;gap:16px}
      .par-card{padding:20px 22px}
      .par-card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px}
      .par-card-title{font-size:17px;font-weight:700;color:var(--ink)}
      .par-card-sub{font-size:13px;color:var(--ink-soft);margin-top:3px}
      .par-table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:13.5px}
      .par-lbl{width:140px;color:var(--ink-soft);font-weight:600;padding:4px 0;vertical-align:top}
      .par-val{color:var(--ink);padding:4px 0}
      .par-section-label{font-size:12px;font-weight:700;color:var(--ink-soft);letter-spacing:.5px;text-transform:uppercase;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--border)}
      .par-tasks{display:flex;flex-direction:column;gap:10px}
      .par-task{padding:12px 14px;border-radius:var(--radius-s);background:var(--surface-sunken)}
      .par-task-num{font-size:11px;font-weight:700;color:var(--ink-soft);margin-bottom:4px;text-transform:uppercase;letter-spacing:.4px}
      .par-task-name{font-size:14.5px;font-weight:600;color:var(--ink);margin-bottom:8px}
      .par-task-details{display:flex;flex-direction:column;gap:5px;font-size:13px;color:var(--ink-soft)}
      .par-tag{display:inline-block;font-size:11px;font-weight:700;color:var(--primary-dark);background:var(--primary-tint);padding:1px 7px;border-radius:var(--radius-pill);margin-right:7px}
      .par-selfdev{font-size:14px;color:var(--ink);white-space:pre-wrap;line-height:1.7;padding:10px 14px;border-radius:var(--radius-s);background:var(--surface-sunken)}
      .par-card-footer{margin-top:16px;padding-top:12px;border-top:1px solid var(--border);display:flex;justify-content:flex-end}
      .badge{display:inline-block;padding:3px 10px;border-radius:var(--radius-pill);font-size:12px;font-weight:600}
      @media(max-width:600px){.par-stats{grid-template-columns:repeat(2,1fr)}.par-lbl{width:100px}}
    </style>`;

  // ปุ่มไปแท็บข้อตกลง
  view.querySelector('.par-goto-pa')?.addEventListener('click', () => paSwitchTab('agreement'));

  // ปุ่มแก้ไข: สลับไปแท็บข้อตกลงพร้อมเปิดฟอร์มของรายการนั้น
  view.querySelectorAll('.par-edit-btn').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.id;
    const d = list.find(x => x.id === id);
    if (!d) return;
    PAState.docId = id;
    PAState.doc = JSON.parse(JSON.stringify(d));
    if (!Array.isArray(PAState.doc.tasks) || PAState.doc.tasks.length === 0) PAState.doc.tasks = [paBlankTask()];
    PAState.view = 'form';
    paSwitchTab('agreement'); // paSwitchTab วาดฟอร์มให้เอง (PAState.view = 'form')
  }));

  view.classList.remove('is-switching');
  paSwapIn(view);
}
