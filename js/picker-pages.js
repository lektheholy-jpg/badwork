// ==========================================================================
// Top-level pages that start with a course picker (dropdown), matching the
// reference UI where you choose the course first instead of drilling into
// a course detail page.
// ==========================================================================

// โหลดรายวิชาที่เปิดสอน "ทั้งหมด" (รวมที่เก็บเข้าคลังแล้ว) — ใช้นับว่าแต่ละแม่แบบเปิดสอนไปกี่เทอม
// และกันการเปิดวิชาเดียวกันซ้ำในเทอม/ปีเดียวกันตอนกดสร้างรายวิชา
async function loadAllCoursesForStructure() {
  const uid = AppState.user.uid;
  const snap = await db.collection('users').doc(uid).collection('courses').orderBy('createdAt', 'desc').get();
  const courses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  courses.sort((a, b) => (a.code || '').localeCompare(b.code || '', 'th') || (a.name || '').localeCompare(b.name || '', 'th'));
  return courses;
}

async function renderStructurePage() {
  const view = document.getElementById('view');
  showLoading(AppState.structureEditingTemplateId ? 'cat' : 'list'); // หน้ารายการวิชา = โครงแถว · หน้าแก้โครงสร้าง = น้องแมว

  if (AppState.structureEditingTemplateId) {
    return renderStructureEditor(view, AppState.structureEditingTemplateId);
  }
  if (typeof cdDiscardDraft === 'function') cdDiscardDraft(); // กลับมารายการวิชา = ออกจากการแก้แล้ว ร่างคำอธิบายที่ค้างไม่ถูกเก็บต่อ
  return renderStructureList(view);
}

// หน้านี้เก็บ "แม่แบบวิชา" (รหัส/ชื่อ/ระดับชั้น/หน่วยกิต + โครงสร้างคะแนน) โดยไม่ระบุเทอม
// การเปิดสอนจริง (เลือกวิชา ห้อง ภาคเรียน ปีการศึกษา) ทำที่หน้า "รายวิชาของฉัน" → + สร้างรายวิชา
// จัดกลุ่มตามระดับชั้น (ม.1-ม.6 แล้วตามด้วยวิชาที่ไม่ระบุ) แต่ละกลุ่มมีสีอ่อนประจำระดับชั้น
function renderStructureGroupsHtml(templates, usage) {
  return groupsByLevelHtml(templates, {
    levelOf: t => t.level,
    listClass: 'course-list struct-list',
    rowFn: t => structureRowHtml(t, usage.get(t.id) || 0),
  });
}

function structureRowHtml(t, usedCount) {
  const col = getLevelColor(t.level);
  return `
    <div class="course-row struct-row" data-template-id="${t.id}" style="--w:${courseColor(t)};">
      <div class="course-chip">${icon('book')}</div>
      <div class="info">
        <div class="name">
          <span class="struct-code" style="--c:${col.strong}">${escapeHtml(t.code || 'ไม่มีรหัส')}</span>
          <span class="struct-course-name">${escapeHtml(t.name)}</span>
        </div>
        <div class="meta">
          <span class="badge struct-level-badge" style="--c:${col.strong}">${escapeHtml(t.level || 'ไม่ระบุระดับชั้น')}</span>
          ${t.credit ? `${escapeHtml(t.credit)} หน่วยกิต • ` : ''}${usedCount > 0 ? `เปิดสอนแล้ว ${usedCount} เทอม` : 'ยังไม่เคยเปิดสอน'}
        </div>
      </div>
      <div class="struct-row-actions">
        <button class="btn btn-ghost btn-sm struct-info-btn" data-template-id="${t.id}">แก้ไขข้อมูลวิชา</button>
        <button class="btn btn-ghost btn-sm struct-edit-btn" data-template-id="${t.id}">แก้ไขโครงสร้าง</button>
        <button class="btn btn-danger-ghost btn-sm struct-del-btn" data-template-id="${t.id}">ลบ</button>
      </div>
    </div>
  `;
}

async function renderStructureList(view) {
  await ensureTemplatesMigrated(); // วิชาเดิมที่ยังไม่มีแม่แบบ → สร้างแม่แบบให้ก่อนแสดงรายการ
  const [templates, courses] = await Promise.all([loadTemplates(), loadAllCoursesForStructure()]);
  const usage = new Map();
  courses.forEach(c => { if (c.templateId) usage.set(c.templateId, (usage.get(c.templateId) || 0) + 1); });

  view.innerHTML = `
    <div class="page-header u-flex u-items-start u-between u-wrap u-gap-10">
      <div>
        <h1>ตั้งค่าโครงสร้างวิชา</h1>
        <div class="sub">สร้างโครงสร้างคะแนนของแต่ละวิชาไว้ครั้งเดียว (ไม่ระบุเทอม) — แล้วไปเลือกเปิดสอนที่หน้า "รายวิชาของฉัน"</div>
      </div>
      <button class="btn btn-primary btn-sm" id="struct-new-course-btn">+ สร้างวิชาใหม่</button>
    </div>
    ${templates.length === 0 ? `
      <div class="card"><div class="empty-state">
        <div class="icon">${icon('book')}</div>
        <div>ยังไม่มีวิชา กด "+ สร้างวิชาใหม่" เพื่อเริ่มต้น</div>
      </div></div>
    ` : renderStructureGroupsHtml(templates, usage)}
  `;

  document.getElementById('struct-new-course-btn').addEventListener('click', () => {
    openTemplateInfoModal(null, (newTemplateId) => {
      AppState.structureEditingTemplateId = newTemplateId;
      AppState.structureTab = 'score';
      renderStructurePage();
    });
  });

  view.querySelectorAll('.struct-info-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // ไม่ให้เด้งเข้าหน้าแก้โครงสร้างของแถวนั้น
      const tpl = templates.find(t => t.id === btn.dataset.templateId);
      openTemplateInfoModal(tpl, () => renderStructureList(view));
    });
  });

  view.querySelectorAll('.struct-edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      AppState.structureEditingTemplateId = btn.dataset.templateId;
      AppState.structureTab = 'score';
      renderStructurePage();
    });
  });

  view.querySelectorAll('.struct-del-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tpl = templates.find(t => t.id === btn.dataset.templateId);
      confirmDeleteTemplate(tpl, usage.get(tpl.id) || 0, () => renderStructureList(view));
    });
  });

  view.querySelectorAll('.struct-row').forEach(row => {
    row.addEventListener('click', () => {
      AppState.structureEditingTemplateId = row.dataset.templateId;
      AppState.structureTab = 'score';
      renderStructurePage();
    });
  });
}

const STRUCT_TABS = [['score', 'โครงสร้างคะแนน'], ['syll', 'โครงสร้างรายวิชา'], ['desc', 'คำอธิบายรายวิชา'], ['descprev', 'ตัวอย่างก่อนพิมพ์']];
const DESC_TABS = ['desc', 'descprev']; // แท็บในกลุ่มคำอธิบายรายวิชา — สลับกันเองได้โดยไม่ถามทิ้งร่าง (js/course-desc.js เก็บร่างข้ามแท็บ)

async function renderStructureEditor(view, templateId) {
  const tplDoc = await templatesCol().doc(templateId).get();
  if (!tplDoc.exists) {
    AppState.structureEditingTemplateId = null;
    return renderStructurePage();
  }
  // isTemplate = ให้ renderStructureTab/saveStructure อ่าน-เขียนที่ courseTemplates (ไม่ใช่ courses)
  const tpl = { id: tplDoc.id, isTemplate: true, ...tplDoc.data() };
  if (!STRUCT_TABS.some(([id]) => id === AppState.structureTab)) AppState.structureTab = 'score';
  const usedCount = (await coursesCol().where('templateId', '==', tpl.id).get()).size;

  view.innerHTML = `
    ${courseHeaderHtml({
      crumbId: 'struct-back-to-list', crumbLabel: 'ตั้งค่าโครงสร้างวิชา',
      crumbCurrent: (tpl.code ? tpl.code + ' - ' : '') + tpl.name,
      title: (tpl.code ? tpl.code + ' • ' : '') + tpl.name,
      badge: '<span class="badge badge-neutral u-badge-inline">แม่แบบ ไม่ระบุเทอม</span>',
      sub: `${tpl.level || 'ไม่ระบุระดับชั้น'}${tpl.credit ? ' • ' + tpl.credit + ' หน่วยกิต' : ''} • ${usedCount > 0 ? `เปิดสอนแล้ว ${usedCount} เทอม` : 'ยังไม่เคยเปิดสอน'}`,
      actions: '<button class="btn btn-ghost btn-sm" id="struct-edit-info-btn">แก้ไขข้อมูลวิชา</button> <button class="btn btn-danger-ghost btn-sm" id="struct-del-course-btn">ลบวิชานี้</button>',
    })}
    <div class="tabs" id="struct-tabs">
      ${STRUCT_TABS.map(([id, label]) => `<div class="tab ${AppState.structureTab === id ? 'active' : ''}" data-tab="${id}">${label}</div>`).join('')}
    </div>
    <div id="structure-page-body"></div>
  `;

  document.getElementById('struct-back-to-list').addEventListener('click', (e) => {
    e.preventDefault();
    AppState.structureEditingTemplateId = null;
    renderStructurePage();
  });

  document.getElementById('struct-edit-info-btn').addEventListener('click', () => {
    openTemplateInfoModal(tpl, () => renderStructureEditor(view, templateId));
  });

  document.getElementById('struct-del-course-btn').addEventListener('click', () => {
    confirmDeleteTemplate(tpl, usedCount, () => {
      AppState.structureEditingTemplateId = null;
      renderStructurePage();
    });
  });

  // แท็บในหน้าแก้แม่แบบ: โครงสร้างคะแนน · โครงสร้างรายวิชา · คำอธิบายรายวิชา — แต่ละแท็บวาดลงกล่องของตัวเอง (วาดค้างจากแท็บเดิมไม่ทับแท็บใหม่)
  const body = document.getElementById('structure-page-body');
  const drawTab = async () => {
    const tab = AppState.structureTab;
    const pane = document.createElement('div');
    body.replaceChildren(pane);
    if (tab === 'syll') { // โครงสร้างรายวิชา: แท็บเดียวสลับมุมมองแก้ไข ↔ ตัวอย่างเอง (js/syllabus.js) · เข้าแท็บทีไรโหลดใหม่ เพราะโครงสร้างคะแนนอาจเพิ่งแก้
      showLoading('cat-sm', pane);
      try { await loadModules(LAZY_BUNDLES.syll); } catch (err) {
        if (pane.isConnected) pane.innerHTML = `<div class="card"><div class="empty-state">${escapeHtml(err.message)}</div></div>`;
        return;
      }
      if (!pane.isConnected || AppState.structureTab !== tab) return;
      await renderSyllabusTab(pane, tpl, () => tabsEl.querySelector('.tab[data-tab="score"]').click());
    } else if (DESC_TABS.includes(tab)) {
      showLoading('cat-sm', pane);
      try { await loadModules(LAZY_BUNDLES.cdesc); } catch (err) {
        if (pane.isConnected) pane.innerHTML = `<div class="card"><div class="empty-state">${escapeHtml(err.message)}</div></div>`;
        return;
      }
      if (!pane.isConnected || AppState.structureTab !== tab) return;
      if (tab === 'desc') await renderCourseDescTab(pane, tpl);
      else await renderCourseDescPreviewTab(pane, tpl, () => tabsEl.querySelector('.tab[data-tab="desc"]').click());
    } else {
      await renderStructureTab(pane, tpl);
    }
  };
  const tabsEl = document.getElementById('struct-tabs');
  initNavPill(tabsEl, '.tab', 'seg-pill', { key: 'struct-tabs' });
  tabsEl.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => {
      if (t.dataset.tab === AppState.structureTab) return;
      const cur = AppState.structureTab, leavingDesc = DESC_TABS.includes(cur) && !DESC_TABS.includes(t.dataset.tab);
      if (DESC_TABS.includes(cur) && typeof cdIsDirty === 'function') {
        if (cur === 'desc') cdStashDraft(); // ไปแท็บตัวอย่าง/แท็บอื่น: เก็บค่าที่พิมพ์ค้างไว้ก่อน
        if (leavingDesc && cdIsDirty()) {
          if (!confirm('คำอธิบายรายวิชามีที่ยังไม่ได้บันทึก — ออกจากแท็บนี้และทิ้งที่แก้ไว้?')) return;
          cdDiscardDraft();
        }
      }
      if (cur === 'syll' && typeof syIsDirty === 'function') { // ออกจากแท็บโครงสร้างรายวิชา: มีค่าค้างต้องถามก่อนทิ้ง
        if (syIsDirty() && !confirm('โครงสร้างรายวิชามีที่ยังไม่ได้บันทึก — ออกจากแท็บนี้และทิ้งที่แก้ไว้?')) return;
        syDiscard();
      }
      AppState.structureTab = t.dataset.tab;
      tabsEl.querySelectorAll(':scope > .active').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      tabsEl.__pillPlace?.(true);
      pillSlideNext('struct-tabs');
      drawTab();
    });
  });
  drawTab();
}

// ==========================================================================
// หน้าบันทึกคะแนน: เลือกด้วยการ์ดแบบเดียวกับหน้าแรก จัดกลุ่มตามระดับชั้น
// แล้วตามด้วยรายวิชา — เลือกห้องแล้วเข้าสู่ตารางบันทึกคะแนนทันที
// ==========================================================================

// ใช้ข้อมูลจากแคชกลาง loadCoursesWithGrades() (dashboard.js) ร่วมกับหน้าแรก/หน้ารายงาน
// ไม่ยิง Firestore ซ้ำ — คะแนน/นักเรียน/ห้อง/โครงสร้างที่แก้แล้วจะล้างแคชวิชานั้นเอง (invalidateCourseData)
// คืนค่า { courses, cards } โดย cards = [{ course, sections: [{ section, studentCount, progress }] }]
async function loadScoresPickerCards() {
  const { courses, sectionCards } = await loadCoursesWithGrades();
  const cardsByCourse = new Map();
  sectionCards.forEach(c => {
    if (!cardsByCourse.has(c.courseId)) cardsByCourse.set(c.courseId, []);
    cardsByCourse.get(c.courseId).push({
      section: { id: c.sectionId, room: c.room },
      studentCount: c.studentCount,
      progress: c.progress,
    });
  });
  const cards = courses.map(course => ({ course, sections: cardsByCourse.get(course.id) || [] }));
  return { courses, cards };
}

function scoresPickerGroupsHtml(cards) {
  return groupsByLevelHtml(cards, {
    levelOf: c => c.course.level,
    listClass: 'scores-subject-list',
    rowFn: c => scoresSubjectBlockHtml(c),
  });
}

function scoresSubjectBlockHtml({ course, sections }) {
  const col = getLevelColor(course.level);
  return `
    <div class="scores-subject-block">
      <div class="scores-subject-title" style="--c:${col.strong}">
        <span class="struct-code" style="--c:${col.strong}">${escapeHtml(course.code || 'ไม่มีรหัส')}</span>
        <span class="struct-course-name">${escapeHtml(course.name)}</span>
      </div>
      ${sections.length === 0 ? `
        <div class="empty-state u-pt-10 u-text-left">วิชานี้ยังไม่มีห้องเรียน</div>
      ` : `
        <div class="section-card-grid">
          ${sections.map(({ section, studentCount, progress }) => `
            <div class="section-card" style="--w:${courseColor(course) || col.strong}" data-course-id="${course.id}" data-section-id="${section.id}">
              <div class="section-card-top">
                <span class="course-dot" style="--c:${courseColor(course) || col.strong}"></span>
                <span class="section-card-room">ห้อง ${escapeHtml(section.room)}</span>
              </div>
              <div class="section-card-name">${escapeHtml(course.name)}</div>
              <div class="section-card-meta">${studentCount} คน</div>
              <div class="progress-bar"><div class="fill" style="--p:${progress}%; --c:${courseColor(course) || col.strong}"></div></div>
              <div class="section-card-pct">${progress}% บันทึกแล้ว</div>
            </div>
          `).join('')}
        </div>
      `}
    </div>
  `;
}

async function renderScoresPage() {
  const view = document.getElementById('view');
  showLoading(AppState.scoresPageCourseId && AppState.scoresPageSectionId ? 'cat' : 'list'); // ยังไม่เลือกวิชา/ห้อง = การ์ดเลือกวิชา → โครงแถว

  const selCourseId = AppState.scoresPageCourseId;
  const selSectionId = AppState.scoresPageSectionId;

  // ยังไม่ได้เลือกวิชา/ห้อง (หรือกด "เลือกวิชาอื่น") -> แสดงการ์ดเลือกแยกชั้น/วิชา แบบหน้าแรก
  if (!selCourseId || !selSectionId) {
    const { courses, cards } = await loadScoresPickerCards();
    AppState.pickerCourses = courses;

    if (courses.length === 0) {
      view.innerHTML = `
        ${pageHeaderHtml('บันทึกคะแนน')}
        <div class="card"><div class="empty-state"><div class="icon">${icon('book')}</div>ยังไม่มีรายวิชา กรุณาสร้างรายวิชาก่อน</div></div>
      `;
      return;
    }

    view.innerHTML = `
      ${pageHeaderHtml('บันทึกคะแนน')}
      ${scoresPickerGroupsHtml(cards)}
    `;

    view.querySelectorAll('.section-card').forEach(card => {
      card.addEventListener('click', () => {
        AppState.scoresPageCourseId = card.dataset.courseId;
        AppState.scoresPageSectionId = card.dataset.sectionId;
        renderScoresPage();
      });
    });
    return;
  }

  // เลือกแล้ว -> แสดงตารางบันทึกคะแนน พร้อมทางกลับไปเลือกวิชา/ห้องอื่น
  const uid = AppState.user.uid;
  const courseDoc = await db.collection('users').doc(uid).collection('courses').doc(selCourseId).get();
  if (!courseDoc.exists) {
    AppState.scoresPageCourseId = null;
    AppState.scoresPageSectionId = null;
    return renderScoresPage();
  }
  const course = { id: courseDoc.id, ...courseDoc.data() };
  const sections = await loadSections(uid, course.id);
  const section = sections.find(s => s.id === selSectionId);
  if (!section) {
    AppState.scoresPageCourseId = null;
    AppState.scoresPageSectionId = null;
    return renderScoresPage();
  }

  view.innerHTML = `
    ${courseHeaderHtml({
      crumbId: 'scores-back-to-picker', crumbLabel: 'บันทึกคะแนน',
      crumbCurrent: `${course.code ? course.code + ' - ' : ''}${course.name} • ห้อง ${section.room}`,
      title: (course.code ? course.code + ' • ' : '') + course.name,
      sub: `${course.level || ''} • ห้อง ${section.room}`,
    })}
    <div id="scores-page-body"></div>
  `;

  document.getElementById('scores-back-to-picker').addEventListener('click', (e) => {
    e.preventDefault();
    AppState.scoresPageCourseId = null;
    AppState.scoresPageSectionId = null;
    renderScoresPage();
  });

  renderScoresTab(document.getElementById('scores-page-body'), course, section);
}
