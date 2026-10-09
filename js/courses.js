// ==========================================================================
// Courses: list, create (with room/section picker), detail shell (tabs)
// ==========================================================================

function openCreateCourseModal(onCreated, sourceCourse = null) {
  const src = sourceCourse || {};
  openModal(`
    <h2>${sourceCourse ? 'คัดลอกวิชาไปเทอมใหม่' : 'สร้างรายวิชา'}</h2>
    <div class="modal-sub">${sourceCourse ? `คัดลอกโครงสร้างคะแนนจาก "${escapeHtml(sourceCourse.name)}" มาใช้ — แค่ตั้งภาคเรียน/ปี และห้องใหม่ นักเรียน/คะแนนเริ่มต้นใหม่หมด` : 'กรอกข้อมูลพื้นฐานของรายวิชา — ตั้งครั้งเดียว ใช้ได้ทุกห้อง แก้ไขภายหลังได้'}</div>
    <div class="field-row">
      <div class="field"><label>รหัสวิชา</label><input id="f-code" placeholder="เช่น ว33101" value="${escapeHtml(src.code || '')}"></div>
      <div class="field"><label>ชื่อวิชา</label><input id="f-name" placeholder="เช่น วิทยาการคำนวณ" value="${escapeHtml(src.name || '')}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>ระดับชั้น</label>
        <select id="f-level">${levelSelectOptionsHtml(src.level || '')}</select>
      </div>
      <div class="field"><label>ภาคเรียน</label><input id="f-semester" placeholder="1"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>ปีการศึกษา</label><input id="f-year" placeholder="2569"></div>
      <div class="field"><label>หน่วยกิต</label><input id="f-credit" placeholder="1.0" value="${escapeHtml(src.credit || '')}"></div>
    </div>
    <div class="field-hint u-hint-up-6">สีประจำวิชาจะถูกกำหนดอัตโนมัติตามระดับชั้นที่เลือก เพื่อให้แยกกลุ่มวิชาได้ง่ายในหน้ารายวิชา</div>

    <div class="field">
      <label>ห้องที่สอน (เลือกได้ 1-13)</label>
      <div class="room-mode-toggle">
        <button type="button" class="room-mode-btn active" data-mode="count">ระบุจำนวนห้อง</button>
        <button type="button" class="room-mode-btn" data-mode="list">เลือกเลขห้องเอง</button>
      </div>
      <div id="room-mode-count">
        <input id="f-room-count" type="number" min="1" max="13" value="${Math.min(src.roomCount || 1, 13)}" placeholder="เช่น 5">
        <div class="field-hint">ระบบจะสร้างห้อง 1, 2, 3 ... ให้อัตโนมัติตามจำนวนที่ใส่ (สูงสุด 13 ห้อง)</div>
      </div>
      <div id="room-mode-list" class="hidden">
        <div class="room-number-grid" id="f-room-pick-grid">
          ${ROOM_OPTIONS.map(n => `<button type="button" class="room-pick-btn" data-room="${n}">${n}</button>`).join('')}
        </div>
        <div class="field-hint">แตะเลขห้องที่ต้องการสอน เลือกได้หลายห้อง</div>
      </div>
    </div>

    <div class="modal-actions">
      <button class="btn btn-ghost" id="cancel-create">ยกเลิก</button>
      <button class="btn btn-primary" id="submit-create">${sourceCourse ? 'คัดลอกและสร้างวิชา' : 'สร้างรายวิชา'}</button>
    </div>
  `);

  const modeCountBtn = document.querySelector('.room-mode-btn[data-mode="count"]');
  const modeListBtn = document.querySelector('.room-mode-btn[data-mode="list"]');
  let roomMode = 'count';
  modeCountBtn.addEventListener('click', () => {
    roomMode = 'count';
    modeCountBtn.classList.add('active'); modeListBtn.classList.remove('active');
    document.getElementById('room-mode-count').classList.remove('hidden');
    document.getElementById('room-mode-list').classList.add('hidden');
  });
  modeListBtn.addEventListener('click', () => {
    roomMode = 'list';
    modeListBtn.classList.add('active'); modeCountBtn.classList.remove('active');
    document.getElementById('room-mode-list').classList.remove('hidden');
    document.getElementById('room-mode-count').classList.add('hidden');
  });

  const selectedRooms = new Set();
  document.querySelectorAll('#f-room-pick-grid .room-pick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (selectedRooms.has(btn.dataset.room)) { selectedRooms.delete(btn.dataset.room); btn.classList.remove('active'); }
      else { selectedRooms.add(btn.dataset.room); btn.classList.add('active'); }
    });
  });

  document.getElementById('cancel-create').addEventListener('click', closeModal);
  document.getElementById('submit-create').addEventListener('click', async () => {
    const name = document.getElementById('f-name').value.trim();
    if (!name) { showToast('กรุณากรอกชื่อวิชา'); return; }

    let rooms = [];
    if (roomMode === 'count') {
      const n = Math.min(13, Math.max(1, Number(document.getElementById('f-room-count').value) || 1));
      rooms = Array.from({ length: n }, (_, i) => String(i + 1));
    } else {
      rooms = ROOM_OPTIONS.filter(n => selectedRooms.has(n));
      if (rooms.length === 0) { showToast('กรุณาเลือกเลขห้องอย่างน้อย 1 ห้อง'); return; }
    }

    const submitBtn = document.getElementById('submit-create');
    submitBtn.disabled = true;
    submitBtn.textContent = 'กำลังสร้าง...';

    const level = document.getElementById('f-level').value.trim();
    const uid = AppState.user.uid;
    const data = {
      code: document.getElementById('f-code').value.trim(),
      name,
      level,
      semester: document.getElementById('f-semester').value.trim(),
      year: document.getElementById('f-year').value.trim(),
      credit: document.getElementById('f-credit').value.trim(),
      roomCount: rooms.length,
      archived: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    const courseRef = await db.collection('users').doc(uid).collection('courses').add(data);
    invalidateCourseData();

    if (sourceCourse) {
      // คัดลอกโครงสร้างคะแนน (assessments) และเกณฑ์เกรดจากวิชาต้นทาง
      const srcBase = db.collection('users').doc(uid).collection('courses').doc(sourceCourse.id);
      const [assessSnap, gradingDoc, structDoc] = await Promise.all([
        srcBase.collection('assessments').orderBy('order', 'asc').get(),
        srcBase.collection('settings').doc('grading').get(),
        srcBase.collection('settings').doc('structure').get(),
      ]);
      const copyBatch = db.batch();
      assessSnap.docs.forEach(d => {
        copyBatch.set(courseRef.collection('assessments').doc(), d.data());
      });
      // คัดลอกหมวดหมู่หลักของคะแนนเก็บ (groupId ในแต่ละรายการอ้างถึงหมวดเหล่านี้)
      if (structDoc.exists) copyBatch.set(courseRef.collection('settings').doc('structure'), structDoc.data());
      copyBatch.set(courseRef.collection('settings').doc('grading'), {
        scale: gradingDoc.exists ? gradingDoc.data().scale : DEFAULT_GRADE_SCALE,
      });
      await copyBatch.commit();
    } else {
      await courseRef.collection('settings').doc('grading').set({ scale: DEFAULT_GRADE_SCALE });
    }

    // สร้างห้องเรียนทั้งหมดในครั้งเดียว (โครงสร้างคะแนนตั้งครั้งเดียว ใช้ร่วมกันทุกห้อง)
    const batch = db.batch();
    rooms.forEach((room, idx) => {
      const secRef = courseRef.collection('sections').doc();
      batch.set(secRef, { room, order: idx, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    });
    await batch.commit();
    invalidateCourseData();

    closeModal();
    showToast(`สร้างรายวิชาสำเร็จ (${rooms.length} ห้อง)`);
    if (onCreated) onCreated(courseRef.id);
    else openCourse(courseRef.id);
  });
}

// จัดกลุ่มรายวิชาตามระดับชั้นแบบเดียวกับหน้า "ตั้งค่าโครงสร้างวิชา" (สีอ่อนประจำระดับชั้น
// ช่วยแยกสายตาเมื่อมีหลายวิชา) แต่ในหน้านี้แต่ละแถวกดแล้วเปิดเข้ารายวิชาได้เลย ไม่มีปุ่มแก้ไข/ลบ
function courseListGroupsHtml(courses) {
  return groupsByLevelHtml(courses, {
    levelOf: c => c.level,
    listClass: 'course-list',
    rowFn: c => courseRowHtml(c),
  });
}

function courseRowHtml(c) {
  const col = getLevelColor(c.level);
  return `
    <div class="course-row" data-course-id="${c.id}" style="--w:${courseColor(c) || col.strong};">
      <div class="course-chip">${icon('book')}</div>
      <div class="info">
        <div class="name">${escapeHtml(c.code ? c.code + ' - ' : '')}${escapeHtml(c.name)}</div>
        <div class="meta">${c.roomCount || 0} ห้อง • ภาคเรียน ${escapeHtml(c.semester || '-')}/${escapeHtml(c.year || '-')}</div>
      </div>
      <button class="btn btn-ghost btn-sm">เปิดรายวิชา</button>
    </div>
  `;
}

async function renderCoursesList() {
  const view = document.getElementById('view');
  showLoading('list');
  const uid = AppState.user.uid;
  const snap = await db.collection('users').doc(uid).collection('courses').orderBy('createdAt', 'desc').get();
  const courses = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => !c.archived);

  view.innerHTML = `
    ${pageHeaderHtml('รายวิชาของฉัน')}
    ${courses.length === 0 ? `
      <div class="card"><div class="empty-state">
        <div class="icon">${icon('book')}</div>
        <div>ยังไม่มีรายวิชา ไปที่หน้า "ตั้งค่าโครงสร้างวิชา" เพื่อสร้างรายวิชาแรกของคุณ</div>
      </div></div>
    ` : courseListGroupsHtml(courses)}
  `;
  view.querySelectorAll('.course-row').forEach(row => {
    row.addEventListener('click', () => openCourse(row.dataset.courseId));
  });
}

// restore = { sectionId, tab } เมื่อมาจากการย้อนกลับ (NavHistory) — กลับไปเห็นแท็บ/ห้องเดิม
function openCourse(courseId, restore) {
  AppState.currentRoute = 'course';
  AppState.currentCourseId = courseId;
  AppState.currentSectionId = restore?.sectionId || null;
  AppState.currentTab = restore?.tab || 'overview';
  NavHistory.record({ kind: 'course', courseId });
  setActiveNav(null);
  markViewPending();
  renderCourseShell();
}

async function loadSections(uid, courseId) {
  const snap = await db.collection('users').doc(uid).collection('courses').doc(courseId)
    .collection('sections').orderBy('order', 'asc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function renderCourseShell() {
  const uid = AppState.user.uid;
  const courseId = AppState.currentCourseId;
  const courseDoc = await db.collection('users').doc(uid).collection('courses').doc(courseId).get();
  if (!courseDoc.exists) { navigate('courses'); return; }
  const course = { id: courseDoc.id, ...courseDoc.data() };
  AppState.currentCourse = course;

  const sections = await loadSections(uid, courseId);
  AppState.sections = sections;
  if (!AppState.currentSectionId || !sections.some(s => s.id === AppState.currentSectionId)) {
    AppState.currentSectionId = sections[0]?.id || null;
  }
  const section = sections.find(s => s.id === AppState.currentSectionId) || null;

  const tabs = [
    { id: 'overview', label: 'ภาพรวม' },
    { id: 'students', label: 'นักเรียน' },
    { id: 'structure', label: 'โครงสร้างคะแนน' },
    { id: 'scores', label: 'บันทึกคะแนน' },
    { id: 'report', label: 'รายงาน' },
  ];
  // แท็บที่ต้องผูกกับ "ห้อง" ที่เลือกอยู่ (นักเรียน/คะแนน/รายงานแยกตามห้อง)
  const sectionScopedTabs = new Set(['students', 'scores', 'report']);

  const view = document.getElementById('view');
  view.innerHTML = `
    ${courseHeaderHtml({
      crumbId: 'back-to-courses', crumbLabel: 'รายวิชาของฉัน', crumbCurrent: course.name,
      title: (course.code ? course.code + ' • ' : '') + course.name,
      badge: course.archived ? '<span class="badge badge-neutral u-badge-inline">อยู่ในคลัง</span>' : '',
      sub: `${course.level || ''} • ภาคเรียน ${course.semester || '-'}/${course.year || '-'} • ${sections.length} ห้อง`,
      actions: course.archived
        ? '<button class="btn btn-ghost btn-sm" id="unarchive-course-btn">นำกลับมาใช้งาน</button>'
        : '<button class="btn btn-ghost btn-sm" id="archive-course-btn">จบเทอมนี้แล้ว เก็บเข้าคลัง</button>',
    })}

    ${sections.length > 0 ? `
      <div class="room-pills" id="room-pills">
        ${sections.map(s => `
          <button class="room-pill ${s.id === AppState.currentSectionId ? 'active' : ''} u-pad-7-14" data-section-id="${s.id}">ห้อง ${escapeHtml(s.room)}</button>
        `).join('')}
      </div>
    ` : `
      <div class="card card-pad u-mb-16">
        <div class="empty-state u-p-0 u-text-left">ยังไม่มีห้องเรียนในวิชานี้ — ไปเพิ่มห้องได้ที่หน้า "ตั้งค่าโครงสร้างวิชา"</div>
      </div>
    `}

    <div class="tabs">
      ${tabs.map(t => `<div class="tab ${AppState.currentTab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.label}</div>`).join('')}
    </div>
    <div id="course-tab-body"></div>
  `;
  NavHistory.patch({ courseId, sectionId: AppState.currentSectionId, tab: AppState.currentTab }); // จำแท็บ/ห้องไว้ใน entry ของประวัติ
  if (AppState.enterNext) { AppState.enterNext = false; playViewEnter(); } // มาจากการเปิดรายวิชา (ไม่ใช่สลับแท็บ/ห้อง) → เฟดเข้า

  document.getElementById('back-to-courses').addEventListener('click', (e) => { e.preventDefault(); if (!NavHistory.backTo('courses')) navigate('courses'); });
  document.getElementById('archive-course-btn')?.addEventListener('click', () => {
    openConfirmModal({
      title: 'เก็บวิชานี้เข้าคลัง?',
      body: `"${escapeHtml(course.name)}" ทุกห้อง นักเรียน และคะแนน จะยังอยู่ครบเหมือนเดิม แค่จะไม่แสดงในหน้าแรก/รายวิชาของฉันอีกต่อไป — ดูย้อนหลังหรือกู้กลับมาได้ทุกเมื่อที่หน้า "คลังรายวิชา"`,
      confirmLabel: 'เก็บเข้าคลัง',
      onConfirm: async () => {
        await db.collection('users').doc(uid).collection('courses').doc(courseId).update({ archived: true, archivedAt: firebase.firestore.FieldValue.serverTimestamp() });
        invalidateCourseData();
        showToast('เก็บวิชาเข้าคลังแล้ว');
        navigate('courses');
      }
    });
  });
  document.getElementById('unarchive-course-btn')?.addEventListener('click', async () => {
    await db.collection('users').doc(uid).collection('courses').doc(courseId).update({ archived: false });
    invalidateCourseData();
    showToast('นำวิชากลับมาใช้งานแล้ว');
    renderCourseShell();
  });
  view.querySelectorAll('.room-pill[data-section-id]').forEach(p => {
    p.addEventListener('click', () => {
      AppState.flushScoreSaves?.(); // กันคะแนนหายถ้าเพิ่งพิมพ์แล้วรีบสลับห้อง
      AppState.currentSectionId = p.dataset.sectionId;
      switchInPlace(p);
      pillSlideNext('course-rooms');
      renderCourseShell();
    });
  });
  // กดแท็บ/ห้อง: ขยับแถบทันที + หรี่เนื้อหาเดิม — renderCourseShell ต้องรอ Firestore สองรอบก่อนวาดใหม่ ถ้าไม่ตอบสนองก่อนจะรู้สึกค้าง
  const switchInPlace = (el) => {
    el.parentElement.querySelectorAll(':scope > .active').forEach(x => x.classList.remove('active'));
    el.classList.add('active');
    el.parentElement.__pillPlace?.(true);
    const b = document.getElementById('course-tab-body');
    if (b) { b.classList.add('is-switching'); setTimeout(() => b.classList.remove('is-switching'), 8000); }
    AppState.tabSwitch = true;
  };
  initNavPill(view.querySelector('#room-pills'), '.room-pill', 'seg-pill', { key: 'course-rooms' });
  initNavPill(view.querySelector('.tabs'), '.tab', 'seg-pill', { key: 'course-tabs' });
  view.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => {
      AppState.flushScoreSaves?.(); // กันคะแนนหายถ้าเพิ่งพิมพ์แล้วรีบสลับแท็บ
      AppState.currentTab = t.dataset.tab;
      switchInPlace(t);
      pillSlideNext('course-tabs');
      renderCourseShell();
    });
  });

  const body = document.getElementById('course-tab-body');
  if (sectionScopedTabs.has(AppState.currentTab) && !section) {
    body.innerHTML = `<div class="card"><div class="empty-state"><div class="icon">${icon('book')}</div>กรุณาเพิ่มห้องเรียนก่อน เพื่อเริ่มเพิ่มนักเรียนและบันทึกคะแนน</div></div>`;
    return;
  }

  const switching = AppState.tabSwitch; AppState.tabSwitch = false;
  const enterBody = () => { // สลับแท็บ/ห้อง: เนื้อหาจริงจางเข้าเมื่อวาดเสร็จ (ไม่เล่นตอนวาดซ้ำจากเหตุอื่น)
    if (!switching || !body.isConnected) return;
    body.classList.remove('tab-swap'); void body.offsetWidth; body.classList.add('tab-swap');
  };
  if (AppState.currentTab === 'overview') { await renderCourseOverview(body, course, sections); enterBody(); }
  else if (AppState.currentTab === 'students') { await renderStudentsTab(body, course, section); enterBody(); }
  else if (AppState.currentTab === 'structure') { await renderStructureTab(body, course); enterBody(); }
  else if (AppState.currentTab === 'scores') { await renderScoresTab(body, course, section); enterBody(); }
  else if (AppState.currentTab === 'report') {
    // report.js โหลดครั้งแรกที่เปิดแท็บนี้ — ถ้าผู้ใช้สลับแท็บ/ออกจากหน้าก่อนโหลดเสร็จ ไม่ต้องวาดทับ
    showLoading('cat-sm', body);
    try { await loadModule('report'); } catch (err) { body.innerHTML = `<div class="card"><div class="empty-state">${escapeHtml(err.message)}</div></div>`; return; }
    if (AppState.currentTab === 'report' && body.isConnected) { await renderReportTab(body, course, section); enterBody(); }
  }
}

async function renderArchivePage() {
  const view = document.getElementById('view');
  showLoading('list');
  const uid = AppState.user.uid;
  const snap = await db.collection('users').doc(uid).collection('courses').orderBy('createdAt', 'desc').get();
  const courses = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.archived);

  view.innerHTML = `
    ${pageHeaderHtml('คลังรายวิชา')}
    ${courses.length === 0 ? `
      <div class="card"><div class="empty-state">
        <div class="icon">${icon('archive')}</div>
        <div>ยังไม่มีวิชาในคลัง — จบเทอมแล้วกดปุ่ม "จบเทอมนี้แล้ว เก็บเข้าคลัง" ที่หน้ารายวิชานั้นได้เลย</div>
      </div></div>
    ` : `
      <div class="course-list">
        ${courses.map(c => `
          <div class="course-row u-cursor-default" data-course-id="${c.id}">
            <div class="course-dot" style="--c:${courseColor(c) || 'var(--primary)'}"></div>
            <div class="info">
              <div class="name">${escapeHtml(c.name)}</div>
              <div class="meta">${escapeHtml(c.code || '')} • ${escapeHtml(c.level || '')} • ${c.roomCount || 0} ห้อง • ภาคเรียน ${escapeHtml(c.semester || '-')}/${escapeHtml(c.year || '-')}</div>
            </div>
            <button class="btn btn-ghost btn-sm view-archived-btn" data-course-id="${c.id}">ดูรายละเอียด</button>
            <button class="btn btn-primary btn-sm duplicate-course-btn" data-course-id="${c.id}">คัดลอกไปเทอมใหม่</button>
          </div>
        `).join('')}
      </div>
    `}
  `;

  view.querySelectorAll('.view-archived-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); openCourse(btn.dataset.courseId); });
  });
  view.querySelectorAll('.duplicate-course-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const source = courses.find(c => c.id === btn.dataset.courseId);
      openCreateCourseModal(null, source);
    });
  });
}

function openAddRoomModal(course, onDone) {
  const usedRooms = new Set((AppState.sections || []).map(s => String(s.room)));
  const availableRooms = ROOM_OPTIONS.filter(n => !usedRooms.has(n));

  if (availableRooms.length === 0) {
    openModal(`
      <h2>เพิ่มห้องเรียน</h2>
      <div class="modal-sub">วิชา ${escapeHtml(course.name)} ใช้ห้อง 1-13 ครบทุกห้องแล้ว</div>
      <div class="modal-actions"><button class="btn btn-primary" id="cancel-add-room">ปิด</button></div>
    `);
    document.getElementById('cancel-add-room').addEventListener('click', closeModal);
    return;
  }

  openModal(`
    <h2>เพิ่มห้องเรียน</h2>
    <div class="modal-sub">เพิ่มห้องใหม่ให้วิชา ${escapeHtml(course.name)} — ใช้โครงสร้างคะแนนเดียวกับห้องอื่น</div>
    <div class="field"><label>เลขห้อง</label>
      <select id="new-room-input">
        ${availableRooms.map(n => `<option value="${n}">ห้อง ${n}</option>`).join('')}
      </select>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="cancel-add-room">ยกเลิก</button>
      <button class="btn btn-primary" id="submit-add-room">เพิ่มห้อง</button>
    </div>
  `);
  document.getElementById('cancel-add-room').addEventListener('click', closeModal);
  document.getElementById('submit-add-room').addEventListener('click', async () => {
    const room = document.getElementById('new-room-input').value.trim();
    if (!room) { showToast('กรุณาเลือกเลขห้อง'); return; }
    const uid = AppState.user.uid;
    const courseRef = db.collection('users').doc(uid).collection('courses').doc(course.id);
    await courseRef.collection('sections').add({
      room, order: AppState.sections.length, createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    await courseRef.update({ roomCount: firebase.firestore.FieldValue.increment(1) });
    invalidateCourseData(course.id);
    closeModal();
    showToast('เพิ่มห้องสำเร็จ');
    if (onDone) onDone();
    else renderCourseShell();
  });
}

function confirmDeleteSection(course, sectionId, roomLabel, onDone) {
  const isLast = AppState.sections.length <= 1;
  openConfirmModal({
    title: `ลบห้อง ${escapeHtml(roomLabel)}?`,
    body: isLast
      ? `ห้อง ${escapeHtml(roomLabel)} เป็นห้องเดียวที่เหลืออยู่ในวิชานี้ นักเรียนและคะแนนในห้องนี้จะถูกลบไปด้วย และกู้คืนไม่ได้`
      : `นักเรียนและคะแนนทั้งหมดในห้องนี้จะถูกลบไปด้วย และกู้คืนไม่ได้`,
    confirmLabel: 'ลบห้อง',
    danger: true,
    onConfirm: async () => {
      const uid = AppState.user.uid;
      const courseRef = db.collection('users').doc(uid).collection('courses').doc(course.id);
      const secRef = courseRef.collection('sections').doc(sectionId);

      showToast('กำลังลบห้อง...');
      let backup = null;
      try { backup = await snapshotSection(secRef); } catch (e) { console.warn('สำรองห้องก่อนลบไม่สำเร็จ', e); }
      await deleteCollectionDocs(secRef.collection('scores'));
      await deleteCollectionDocs(secRef.collection('students'));
      await secRef.delete();
      await courseRef.update({ roomCount: firebase.firestore.FieldValue.increment(-1) });
      invalidateCourseData(course.id);

      if (AppState.currentSectionId === sectionId) AppState.currentSectionId = null;
      const refresh = () => { if (onDone) onDone(); else renderCourseShell(); };
      refresh();
      if (backup && backup.data) {
        const where = [AppState.currentRoute, AppState.currentCourseId];
        islandUndo(`ลบห้อง ${roomLabel} แล้ว`, async () => {
          await restoreSection(courseRef.collection('sections'), backup);
          await courseRef.update({ roomCount: firebase.firestore.FieldValue.increment(1) });
          invalidateCourseData(course.id);
          // วาดหน้าใหม่เฉพาะเมื่อผู้ใช้ยังอยู่หน้าเดิม ไม่ดึงออกจากหน้าที่กำลังใช้อยู่
          if (AppState.currentRoute === where[0] && AppState.currentCourseId === where[1]) refresh();
        });
      } else {
        showToast('ลบห้องสำเร็จ');
      }
    }
  });
}

// ลบรายวิชาเป็นการกระทำที่ย้อนกลับไม่ได้และกระทบข้อมูลเยอะที่สุดในแอป จึงให้พิมพ์ชื่อวิชา
// ยืนยันในกล่องเดียว (แทนการเด้ง native confirm()/prompt() 2 ครั้ง ซึ่งเบราว์เซอร์อาจบล็อกเงียบๆ
// ถ้าผู้ใช้เคยกด "ป้องกันไม่ให้หน้านี้สร้างกล่องโต้ตอบเพิ่มเติม" มาก่อน)
function confirmDeleteCourse(course, onDone) {
  openModal(`
    <h2>ลบรายวิชา "${escapeHtml(course.name)}"?</h2>
    <div class="modal-sub">การลบจะรวมทุกห้อง นักเรียน คะแนน และโครงสร้างคะแนนของวิชานี้ทั้งหมด และกู้คืนไม่ได้<br><br>
      พิมพ์ชื่อวิชา <b>${escapeHtml(course.name)}</b> ให้ตรงกันเพื่อยืนยัน</div>
    <div class="field"><input id="del-course-confirm-input" placeholder="${escapeHtml(course.name)}" autocomplete="off"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="del-course-cancel-btn">ยกเลิก</button>
      <button class="btn btn-danger" id="del-course-confirm-btn" disabled>ลบรายวิชา</button>
    </div>
  `);

  const input = document.getElementById('del-course-confirm-input');
  const confirmBtn = document.getElementById('del-course-confirm-btn');
  input.focus();
  input.addEventListener('input', () => { confirmBtn.disabled = input.value !== course.name; });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !confirmBtn.disabled) confirmBtn.click(); });
  document.getElementById('del-course-cancel-btn').addEventListener('click', closeModal);

  confirmBtn.addEventListener('click', async () => {
    if (input.value !== course.name) return;
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'กำลังลบ...';
    try {
      const uid = AppState.user.uid;
      const courseRef = db.collection('users').doc(uid).collection('courses').doc(course.id);

      showToast('กำลังลบรายวิชา...');
      let backup = null;
      try { backup = await snapshotCourse(courseRef); } catch (e) { console.warn('สำรองวิชาก่อนลบไม่สำเร็จ', e); }
      const sectionsSnap = await courseRef.collection('sections').get();
      for (const secDoc of sectionsSnap.docs) {
        const secRef = secDoc.ref;
        await deleteCollectionDocs(secRef.collection('scores'));
        await deleteCollectionDocs(secRef.collection('students'));
        await secRef.delete();
      }
      await deleteCollectionDocs(courseRef.collection('assessments'));
      await deleteCollectionDocs(courseRef.collection('settings'));
      await courseRef.delete();
      invalidateCourseData();

      closeModal();
      const refresh = () => { if (onDone) onDone(); else navigate('courses'); };
      refresh();
      if (backup && backup.data) {
        const where = [AppState.currentRoute, AppState.currentCourseId];
        islandUndo('ลบรายวิชาแล้ว', async () => {
          await restoreCourse(courseRef, backup);
          invalidateCourseData();
          if (AppState.currentRoute === where[0] && AppState.currentCourseId === where[1]) refresh();
        });
      } else {
        showToast('ลบรายวิชาสำเร็จ');
      }
    } catch (err) {
      invalidateCourseData(); // อาจลบไปแล้วบางส่วน
      console.error(err);
      showToast('เกิดข้อผิดพลาด ลองใหม่อีกครั้ง');
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'ลบรายวิชา';
    }
  });
}

async function renderCourseOverview(container, course, sections) {
  showLoading('cat-sm', container);
  const uid = AppState.user.uid;
  const base = db.collection('users').doc(uid).collection('courses').doc(course.id);

  const [assessSnap, perSection] = await Promise.all([
    base.collection('assessments').get(),
    Promise.all(sections.map(async (s) => {
      const secBase = base.collection('sections').doc(s.id);
      const [studentsSnap, scoresSnap] = await Promise.all([
        secBase.collection('students').get(),
        secBase.collection('scores').get(),
      ]);
      return { studentsSnap, scoresSnap, s };
    })),
  ]);

  const assessmentIds = assessSnap.docs.map(d => d.id);
  const perSectionWithProgress = perSection.map(({ studentsSnap, scoresSnap, s }) => ({
    ...s,
    studentCount: studentsSnap.size,
    progress: calcSectionProgress(studentsSnap, scoresSnap, assessmentIds),
  }));

  const totalStudents = perSectionWithProgress.reduce((s, x) => s + x.studentCount, 0);
  const avgProgress = perSectionWithProgress.length ? Math.round(perSectionWithProgress.reduce((s, x) => s + x.progress, 0) / perSectionWithProgress.length) : 0;

  container.innerHTML = `
    <div class="stat-row">
      <div class="stat-card"><div class="label">จำนวนห้อง</div><div class="value">${sections.length}</div></div>
      <div class="stat-card"><div class="label">นักเรียนทั้งหมด</div><div class="value">${totalStudents}</div></div>
      <div class="stat-card"><div class="label">รายการคะแนนที่กำหนด</div><div class="value">${assessSnap.size}</div></div>
    </div>
    ${sections.length > 0 ? `
      <div class="card u-mb-16">
        <div class="struct-panel-header">ความคืบหน้ารายห้อง</div>
        <div class="card-pad u-flex u-col u-gap-10">
          ${perSectionWithProgress.map(s => `
            <div class="u-flex u-items-center u-gap-12">
              <div class="u-w-70 u-semibold u-fs-135">ห้อง ${escapeHtml(s.room)}</div>
              <div class="u-w-80 u-note-sm">${s.studentCount} คน</div>
              <div class="progress-bar u-grow"><div class="fill" style="--p:${s.progress}%"></div></div>
              <div class="progress-pct">${s.progress}%</div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
    <div class="card card-pad">
      <h2 class="card-title u-mb-10">ขั้นตอนถัดไป</h2>
      <div class="u-flex u-col u-gap-8 u-fs-135 u-soft">
        <div>1. เพิ่มห้องเรียน ${sections.length > 0 ? '✓' : '— ยังไม่มีห้อง'}</div>
        <div>2. เพิ่มรายชื่อนักเรียนแต่ละห้อง ${totalStudents > 0 ? '✓' : '— ยังไม่มีนักเรียน'}</div>
        <div>3. กำหนดโครงสร้างคะแนน (ใช้ร่วมกันทุกห้อง) ${assessSnap.size > 0 ? '✓' : '— ยังไม่ได้กำหนด'}</div>
        <div>4. บันทึกคะแนน ${avgProgress > 0 ? `— บันทึกแล้วเฉลี่ย ${avgProgress}%` : '— ยังไม่เริ่มบันทึก'}</div>
      </div>
    </div>
  `;
}
