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

// loadRoomReportData() และ exportRoomCsv() อยู่ใน report.js (ใช้ร่วมกับแท็บรายงานในวิชา)

function reportRoomRowHtml(course, { section, studentCount, progress }) {
  const col = getLevelColor(course.level);
  const empty = studentCount === 0;
  return `
    <div class="report-room-row" data-course-id="${course.id}" data-section-id="${section.id}">
      <div class="report-room-info">
        <span class="course-dot" style="--c:${courseColor(course) || col.strong}"></span>
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
  return groupsByLevelHtml(cards, {
    levelOf: c => c.course.level,
    listClass: 'scores-subject-list',
    rowFn: ({ course, sections }, col) => `
      <div class="scores-subject-block">
        <div class="scores-subject-title" style="--c:${col.strong}">
          <span class="struct-code" style="--c:${col.strong}">${escapeHtml(course.code || 'ไม่มีรหัส')}</span>
          <span class="struct-course-name">${escapeHtml(course.name)}</span>
        </div>
        ${sections.length === 0
          ? `<div class="empty-state u-pt-10 u-text-left">วิชานี้ยังไม่มีห้องเรียน</div>`
          : `<div class="report-room-list">${sections.map(si => reportRoomRowHtml(course, si)).join('')}</div>`}
      </div>`,
  });
}

// ---------- เอกสารที่ต้องส่งในภาคเรียน ----------
// จับคู่เอกสารที่ครูทำไว้ในระบบ (ID-Plan · SAR · PA · แผนการอบรม · วิจัยในชั้นเรียน · Course Syllabus) กับภาคเรียนที่เลือก แล้วโชว์ว่าทำแล้วหรือยัง
// ชื่อ collection อ่านจาก config ของแต่ละระบบผ่าน docSystem(id).col(kind, uid) (ไม่เขียนชื่อตรงในไฟล์นี้) · หน้านี้อ่านอย่างเดียว ไม่เขียนข้อมูล

// PA เก็บเป็นปีงบประมาณ: ปีงบ N = ภาค 2/(N-1) + ภาค 1/N → ภาค 1/Y = ปีงบ Y · ภาค 2/Y = ปีงบ Y+1 (ตรงกับ paTermLabels ใน js/pa.js)
function reportFiscalYear(year, sem) {
  const y = Number(year);
  if (!y) return null;
  return String(sem) === '1' ? String(y) : String(sem) === '2' ? String(y + 1) : null;
}

// รวมสถานะของหลายฉบับที่ตรงภาคเดียวกัน · docs = null → อ่านไม่ได้ (unknown) · มีฉบับที่ส่งแล้ว = ส่งแล้ว · มีแต่ร่าง = ร่าง · ไม่มีเลย = none
function reportDocState(docs) {
  if (!docs) return 'unknown';
  if (!docs.length) return 'none';
  return docs.some(d => d && d.status === 'submitted') ? 'submitted' : 'draft';
}

const RP_STATE_BADGE = {
  submitted: ['badge-success', 'ส่งแล้ว'],
  done: ['badge-success', 'ทำแล้ว'],
  draft: ['badge-grade-mid', 'ร่าง'],
  none: ['badge-neutral', 'ยังไม่ได้ทำ'],
  unknown: ['badge-neutral', 'ตรวจสถานะไม่ได้'],
};

// data = { idp, sar, tra, car, paAgr, paRpt: [เอกสาร] | null, syllabus: [{ course, state }] } · คืนรายการแถวที่จะวาด
function reportDocRows({ year, sem }, data) {
  const termText = `ภาคเรียนที่ ${sem}/${year}`;
  const fy = reportFiscalYear(year, sem);
  // preview = รหัสแท็บ "ตัวอย่าง / พิมพ์" ของระบบนั้น · docId = ฉบับที่จะเปิดดู (ฉบับที่ส่งแล้วก่อน ไม่งั้นฉบับแรก)
  const pickId = docs => { const list = (docs || []).filter(d => d && d.id); return (list.find(d => d.status === 'submitted') || list[0] || {}).id || ''; };
  const doc = (name, meta, docs, route, tab, sys, preview) => ({ name, meta: docs && docs.length > 1 ? `${meta} · ${docs.length} ฉบับ` : meta, state: reportDocState(docs), route, tab: tab || '', sys: sys || '', preview: preview || '', docId: pickId(docs), tplId: '' });
  const rows = [
    ...(data.syllabus || []).map(({ course, state }) => ({
      name: `Course Syllabus · ${[course.code, course.name].filter(Boolean).join(' ')}`, meta: termText, state, route: 'structure-page', tab: 'syll', sys: '', preview: 'syllprev', docId: '', tplId: course.templateId || '',
    })),
    doc('SAR · รายงานการประเมินตนเอง', termText, data.sar, 'idp-page', 'sar', 'idp', 'sarprev'),
    doc('ID-Plan · แผนพัฒนาตนเอง', `ปีการศึกษา ${year}`, data.idp, 'idp-page', '', 'idp', 'preview'),
  ];
  if (fy) {
    rows.push(doc('Personal Agreement (PA)', `ปีงบประมาณ ${fy}`, data.paAgr, 'pa-page', '', 'pa', 'report'));
    rows.push(doc('รายงานผล PA', `ปีงบประมาณ ${fy}`, data.paRpt, 'pa-page', 'rpt', 'pa', 'rptprev'));
  }
  rows.push(doc('แผนการอบรม', termText, data.tra, 'tra-page', '', 'tra', 'preview'));
  rows.push(doc('วิจัยในชั้นเรียน', termText, data.car, 'car-page', '', 'car', 'preview'));
  return rows;
}

function reportDocsHtml(rows) {
  const finished = rows.filter(r => r.state === 'submitted' || r.state === 'done').length;
  const list = rows.map(r => {
    const [cls, label] = RP_STATE_BADGE[r.state] || RP_STATE_BADGE.unknown;
    const open = r.state === 'none' ? 'เริ่มทำ' : 'เปิด';
    const noDoc = r.state === 'none'; // ยังไม่มีเอกสาร → ไม่มีอะไรให้ดูตัวอย่าง
    const attrs = `data-route="${escapeHtml(r.route)}" data-tab="${escapeHtml(r.tab)}" data-sys="${escapeHtml(r.sys)}" data-tpl="${escapeHtml(r.tplId || '')}"`;
    return `
      <div class="report-room-row rp-doc-row" ${attrs}>
        <div class="report-room-info">
          <span class="report-room-name">${escapeHtml(r.name)}</span>
          <span class="report-room-meta">${escapeHtml(r.meta)}</span>
        </div>
        <div class="report-room-actions">
          <span class="badge ${cls}">${label}</span>
          ${r.preview ? `<button type="button" class="btn btn-ghost btn-sm rp-doc-preview" ${attrs} data-preview="${escapeHtml(r.preview)}" data-doc="${escapeHtml(r.docId || '')}"${noDoc ? ' disabled title="ยังไม่มีเอกสารให้ดูตัวอย่าง"' : ''}>ตัวอย่างก่อนพิมพ์</button>` : ''}
          <button type="button" class="btn btn-ghost btn-sm rp-doc-open" ${attrs}>${open}</button>
        </div>
      </div>`;
  }).join('');
  return `<div class="u-note u-mb-12">ทำแล้ว/ส่งแล้ว ${finished} จาก ${rows.length} รายการ · ดึงสถานะจากเอกสารในระบบ (ร่าง = ยังไม่เปลี่ยนสถานะเป็น "ส่งแล้ว")</div><div class="report-room-list">${list}</div>`;
}

// อ่านเอกสารของภาคเรียนนั้นจาก Firestore · แต่ละแหล่งอ่านพลาดได้โดยไม่ล้มทั้งส่วน (ได้ null = "ตรวจสถานะไม่ได้")
async function loadReportDocStatus(key, termCourses) {
  const [year, sem] = key.split('|');
  const uid = AppState.user.uid;
  await loadModules(LAZY_BUNDLES.docConfigs);
  const fy = reportFiscalYear(year, sem);
  const sameSem = d => String(d.semester || '') === String(sem);
  const fetchDocs = async (sysId, kind, field, value, filter) => {
    try {
      const snap = await docSystem(sysId).col(kind, uid).where(field, '==', value).get();
      const arr = snap.docs.map(d => ({ ...d.data(), id: d.id }));
      return filter ? arr.filter(filter) : arr;
    } catch (err) { console.warn('อ่านเอกสารที่ต้องส่งไม่สำเร็จ:', sysId, kind, err); return null; }
  };
  const merge = (a, b) => (a === null && b === null ? null : [...(a || []), ...(b || [])]);
  const [idp, sar, tra, car, paNew, paOld, paRpt, syllabus] = await Promise.all([
    fetchDocs('idp', 'plans', 'year', year),
    fetchDocs('idp', 'sar', 'year', year, sameSem),
    fetchDocs('tra', 'docs', 'year', year, sameSem),
    fetchDocs('car', 'docs', 'year', year, sameSem),
    fy ? fetchDocs('pa', 'agreements', 'fiscalYear', fy) : Promise.resolve([]),
    fetchDocs('pa', 'agreements', 'year', year, sameSem), // PA รุ่นเก่าเก็บเป็นปีการศึกษา/ภาคเรียน
    fy ? fetchDocs('pa', 'reports', 'fiscalYear', fy) : Promise.resolve([]),
    Promise.all(termCourses.map(async course => {
      const sy = await loadCourseSyllabus(course); // courses.js · คืน null เมื่ออ่านไม่ได้
      return { course, state: sy ? (syllabusHasData(sy) ? 'done' : 'none') : 'unknown' };
    })),
  ]);
  return { idp, sar, tra, car, paAgr: merge(paNew, paOld), paRpt, syllabus };
}

async function renderReportPage() {
  const view = document.getElementById('view');
  showLoading('cat');

  // โหลดครั้งเดียว (รวมเกรดรายห้อง) แล้วสลับภาคเรียนจากข้อมูลในหน่วยความจำ ไม่ต้องโหลดซ้ำ
  const { courses, sectionCards } = await loadCoursesWithGrades(); // เฉพาะวิชาที่ยังเปิดใช้งาน
  if (courses.length === 0) {
    view.innerHTML = `
      ${pageHeaderHtml('รายงาน')}
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
    ${pageHeaderHtml('รายงาน')}
    <div class="toolbar u-mb-16">
      <div class="toolbar-left">
        <label for="report-term" class="u-fs-13 u-semibold">ภาคเรียน</label>
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
        <h2 class="section-title">สรุปผลการเรียน</h2>
        <div id="grade-summary-body">${buildGradeSummaryHtml(list, '__all__')}</div>
        <details class="gs-details">
          <summary>สถิติเกรดรายวิชา (กราฟ)</summary>
          <div id="grade-stats-body">${buildGradeStatsBodyHtml(list, '__all__')}</div>
        </details>
      </section>
      <section class="report-section">
        <h2 class="section-title">เอกสารที่ต้องส่งในภาคเรียนนี้</h2>
        <div id="report-docs-body"></div>
      </section>
      <section class="report-section">
        <h2 class="section-title">ส่งออกข้อมูลรายห้อง</h2>
        ${reportPageBodyHtml(cards)}
      </section>`;
    wireGradeSummaryRows();
    wireGradeRoomFilters(list);
    drawDocs();
  }

  // เอกสารที่ต้องส่ง: โหลดแยกจากตารางเกรด (ช้ากว่า) — ถ้าสลับภาคเรียนก่อนโหลดเสร็จ ผลของรอบเก่าไม่วาดทับ
  let docsToken = 0;
  async function drawDocs() {
    const slot = document.getElementById('report-docs-body');
    if (!slot) return;
    const token = ++docsToken;
    const [y, s] = currentTerm.split('|');
    if (currentTerm === '__all__') { slot.innerHTML = '<div class="u-note">เลือกภาคเรียนด้านบนเพื่อดูเอกสารที่ต้องส่งของภาคนั้น</div>'; return; }
    if (!y || !s) { slot.innerHTML = '<div class="u-note">รายวิชาในกลุ่มนี้ไม่ได้ระบุปีหรือภาคเรียน จึงจับคู่กับเอกสารไม่ได้</div>'; return; }
    slot.innerHTML = '<div class="u-note">กำลังตรวจสถานะเอกสาร...</div>';
    try {
      const termCourses = courses.filter(c => termKey(c) === currentTerm);
      const data = await loadReportDocStatus(currentTerm, termCourses);
      if (token !== docsToken || !slot.isConnected) return;
      slot.innerHTML = reportDocsHtml(reportDocRows({ year: y, sem: s }, data));
    } catch (err) {
      console.error(err);
      if (token === docsToken && slot.isConnected) slot.innerHTML = '<div class="u-note">ตรวจสถานะเอกสารไม่สำเร็จ ลองเปลี่ยนภาคเรียนหรือรีเฟรชหน้า</div>';
    }
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
      await loadModule('report'); // ปกติโหลดแล้วตอนเข้าหน้านี้ — กันไว้เผื่อกรณีเรียกจากที่อื่น
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

  // เอกสารที่ต้องส่ง: ปุ่ม "ตัวอย่างก่อนพิมพ์" → แท็บตัวอย่าง/พิมพ์ของระบบนั้น · ปุ่ม เปิด/เริ่มทำ หรือคลิกที่แถว → หน้าแก้ไข
  // ds = dataset ของแถว/ปุ่ม · tab = แท็บที่จะเปิด (ว่าง = แท็บแรกของระบบ) · docId = ฉบับที่ให้ตัวอย่างเปิดก่อน
  function openReportDoc(ds, tab, docId) {
    if (ds.sys) {
      try {
        const sys = docSystem(ds.sys);
        sys.state.nextTab = tab || null;
        if (docId) { // ตั้งฉบับที่ดูก่อน กันค้างฉบับของภาคเรียนอื่นจากครั้งก่อน
          if (tab === 'rptprev') sys.rptState.previewId = docId;
          else if (tab === 'sarprev') { if (typeof SAR !== 'undefined') SAR.previewId = docId; }
          else sys.state.previewId = docId;
        }
      } catch (err) { /* ไม่มีแท็บนั้น → เปิดแท็บแรก */ }
    } else if (ds.route === 'structure-page' && ds.tpl) { // Course Syllabus: ไปแม่แบบวิชานั้นเลย (ใช้ครั้งเดียว เหมือนปุ่มแก้ที่หน้าวิชา)
      AppState.structureOpenOnce = ds.tpl;
      AppState.structureTab = tab || 'syll';
    }
    navigate(ds.route);
  }

  body.addEventListener('click', (e) => {
    const prev = e.target.closest('.rp-doc-preview');
    if (prev) { if (!prev.disabled) openReportDoc(prev.dataset, prev.dataset.preview, prev.dataset.doc); return; }
    const open = e.target.closest('.rp-doc-open');
    if (open) { openReportDoc(open.dataset, open.dataset.tab); return; }
    const row = e.target.closest('.rp-doc-row');
    if (row && !e.target.closest('button, a')) openReportDoc(row.dataset, row.dataset.tab);
  });

  document.getElementById('report-term').addEventListener('change', (e) => {
    currentTerm = e.target.value;
    drawBody();
  });

  drawBody();
}
