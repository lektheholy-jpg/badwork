// ==========================================================================
// ตารางสอน — แท็บ "ตารางสอน" ในหน้าข้อมูลส่วนตัว (js/profile.js เรียก renderTimetableTab)
// เก็บที่ users/{uid}/timetable/main = { periods: [{ start, end }], entries: [...], updatedAt }
//   entry = { id, kind: 'class'|'activity', day: 1-5, period: เริ่มที่คาบ (0 = คาบ 1), span: จำนวนคาบติดกัน,
//             code, title, cls (เช่น ม.2/4), room (ห้องเรียน/สถานที่), hue, courseId }
// ฟิลด์ต้องตรงกับ validTimetable ใน firestore.rules · ไฟล์นี้ต้องใช้งานเดี่ยวได้ (หน้าแรกโหลดไปทำวิดเจ็ตโดยไม่โหลด profile.js)
// ==========================================================================

const TT_DAYS = [[1, 'จันทร์'], [2, 'อังคาร'], [3, 'พุธ'], [4, 'พฤหัสบดี'], [5, 'ศุกร์']]; // เลขวันตรงกับ Date.getDay()
const TT_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const TT_HUES = [['blue', 'ฟ้า'], ['violet', 'ม่วง'], ['teal', 'เขียว'], ['orange', 'ส้ม'], ['pink', 'ชมพู'], ['amber', 'เหลือง'], ['red', 'แดง'], ['gray', 'เทา']];
const TT_KINDS = [['class', 'วิชาที่สอน'], ['activity', 'กิจกรรม / อื่นๆ']];
const TT_MAX_PERIODS = 14;
const TT_DEFAULT_PERIODS = [
  ['07:50', '08:30'], ['08:30', '09:20'], ['09:20', '10:10'], ['10:10', '11:00'], ['11:00', '11:50'],
  ['11:50', '12:40'], ['12:40', '13:30'], ['13:30', '14:20'], ['14:20', '15:10'], ['15:10', '16:00'],
].map(([start, end]) => ({ start, end }));

// ---------- ข้อมูล ----------
function ttRef() {
  return db.collection('users').doc(AppState.user.uid).collection('timetable').doc('main');
}
function ttPad(n) { return String(n).padStart(2, '0'); }
function ttCleanTime(v) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v == null ? '' : v).trim());
  if (!m || +m[1] > 23 || +m[2] > 59) return '';
  return ttPad(+m[1]) + ':' + m[2];
}
function ttMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
// รวมสระอำที่พิมพ์แยกตัว (ํ+า) เป็นตัวเดียว + ตัดช่องว่างซ้ำ แล้วจำกัดความยาว
function ttText(v, max = 100) {
  return String(v == null ? '' : v).replace(/\u0E4D\u0E32/g, '\u0E33').replace(/\s+/g, ' ').trim().slice(0, max);
}
function ttDayName(n) { return (TT_DAYS.find(d => d[0] === n) || [0, ''])[1]; }

function ttCleanEntry(raw, periodCount) {
  if (!raw || typeof raw !== 'object') return null;
  const day = Number(raw.day), period = Number(raw.period);
  if (!TT_DAYS.some(d => d[0] === day) || !Number.isInteger(period) || period < 0 || period >= periodCount) return null;
  const span = Math.max(1, Math.min(Math.floor(Number(raw.span)) || 1, periodCount - period));
  const title = ttText(raw.title);
  if (!title) return null;
  return {
    id: ttText(raw.id, 40) || uid4(),
    kind: raw.kind === 'activity' ? 'activity' : 'class',
    day, period, span, title,
    code: ttText(raw.code, 30), cls: ttText(raw.cls, 30), room: ttText(raw.room, 30),
    hue: TT_HUES.some(h => h[0] === raw.hue) ? raw.hue : 'blue',
    courseId: ttText(raw.courseId, 60),
  };
}

async function loadTimetable() {
  const snap = await ttRef().get();
  const raw = snap.exists ? snap.data() : {};
  let periods = (Array.isArray(raw.periods) ? raw.periods : [])
    .map(p => ({ start: ttCleanTime(p && p.start), end: ttCleanTime(p && p.end) }))
    .filter(p => p.start && p.end).slice(0, TT_MAX_PERIODS);
  if (!periods.length) periods = TT_DEFAULT_PERIODS.map(p => ({ ...p }));
  const entries = (Array.isArray(raw.entries) ? raw.entries : []).map(e => ttCleanEntry(e, periods.length)).filter(Boolean);
  return { periods, entries };
}

// รายวิชาของครู (ไม่รวมที่เก็บเข้าคลัง) ไว้ให้เลือกตอนเพิ่มคาบ — โหลดไม่ได้ก็ยังพิมพ์เองได้
async function loadTtCourses() {
  try {
    const snap = await db.collection('users').doc(AppState.user.uid).collection('courses').orderBy('createdAt', 'desc').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => !c.archived)
      .map(c => ({ id: c.id, code: c.code || '', name: c.name || '', level: c.level || '' }));
  } catch (err) {
    console.error(err);
    return [];
  }
}

async function saveTimetable(tt) {
  islandSave('saving');
  try {
    await ttRef().set({ periods: tt.periods, entries: tt.entries, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    islandSave('saved');
    return true;
  } catch (err) {
    console.error(err);
    showToast(err.code === 'permission-denied'
      ? 'บันทึกไม่สำเร็จ: ถูกปฏิเสธสิทธิ์ (ต้องอัปเดต firestore.rules ก่อน)'
      : 'บันทึกไม่สำเร็จ: ' + (err.message || err), 'error');
    return false;
  }
}

// ---------- ไปหน้าบันทึกคะแนนจากชื่อวิชาในตาราง ----------
// คาบที่ผูกกับรายวิชา (courseId) และยังมีวิชานั้นอยู่ → ชื่อวิชากดได้ · courseIds = ชุด id วิชาที่รู้ว่ายังมี (null = ยังไม่รู้ ให้ตรวจตอนกด)
function ttLinkable(e, courseIds) {
  return e.kind === 'class' && !!e.courseId && (!courseIds || courseIds.has(e.courseId));
}
// หาห้อง (section) ของคาบ: ป้ายห้องในตารางเขียนเป็น "ชั้น/ห้อง" (เช่น ม.2/7) ตรงกับที่ปุ่มเลือกห้องในหน้าต่างคาบสร้างไว้
function ttFindSection(e, course, sections) {
  const norm = t => String(t || '').replace(/\s+/g, '');
  const label = s => norm((course.level ? course.level + '/' : '') + s.room);
  const cls = norm(e.cls);
  return sections.find(s => cls && label(s) === cls)
    || sections.find(s => cls && cls.endsWith('/' + norm(s.room)))
    || (sections.length === 1 ? sections[0] : null);
}
let ttGoBusy = false;
async function ttOpenScores(e) {
  if (ttGoBusy) return;
  ttGoBusy = true;
  try {
    const uid = AppState.user.uid;
    const courseDoc = await db.collection('users').doc(uid).collection('courses').doc(e.courseId).get();
    if (!courseDoc.exists) { showToast('ไม่พบรายวิชานี้แล้ว — แก้คาบให้เลือกรายวิชาใหม่', 'warn'); return; }
    const course = { id: courseDoc.id, ...courseDoc.data() };
    const section = ttFindSection(e, course, await loadSections(uid, course.id));
    if (!section) { showToast('ไม่พบห้องของคาบนี้ — แก้คาบแล้วเลือกห้องจากรายการ', 'warn'); return; }
    AppState.scoresPageCourseId = course.id;
    AppState.scoresPageSectionId = section.id;
    navigate('scores-page');
  } catch (err) {
    console.error(err);
    showToast('เปิดหน้าบันทึกคะแนนไม่สำเร็จ: ' + (err.message || err), 'error');
  } finally { ttGoBusy = false; }
}

// ---------- วาดตาราง ----------
function ttMonday(now) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

// จัดวางคาบของแต่ละวัน: ข้ามคาบที่ทับกับคาบที่วางไปแล้ว (กันตารางพังถ้าข้อมูลเก่าซ้อนกัน)
function ttLayoutDay(entries, day) {
  const starts = new Map(), covered = new Set();
  entries.filter(e => e.day === day).sort((a, b) => a.period - b.period).forEach(e => {
    for (let i = e.period; i < e.period + e.span; i++) if (covered.has(i)) return;
    for (let i = e.period; i < e.period + e.span; i++) covered.add(i);
    starts.set(e.period, e);
  });
  return starts;
}

function ttItemHtml(e, courseIds) {
  const meta = [e.cls, e.room].filter(Boolean).map(t => `<span>${escapeHtml(t)}</span>`).join('');
  const inner = `
      ${e.code ? `<span class="tt-code">${escapeHtml(e.code)}</span>` : ''}
      <span class="tt-title">${escapeHtml(e.title)}</span>
      ${meta ? `<span class="tt-meta">${meta}</span>` : ''}`;
  const id = escapeHtml(e.id), hue = `style="--w:var(--hue-${e.hue})"`;
  // คาบที่ผูกกับรายวิชา: กดทั้งกรอบ = ไปหน้าบันทึกคะแนน · แก้ไขคาบใช้ปุ่มดินสอมุมกรอบ
  if (ttLinkable(e, courseIds)) {
    return `
    <div class="tt-item is-link" role="link" tabindex="0" ${hue} data-id="${id}" data-score-go="${id}" aria-label="ไปหน้าบันทึกคะแนน ${escapeHtml(e.title)}" title="ไปหน้าบันทึกคะแนน">
      <button type="button" class="tt-edit" data-edit="${id}" aria-label="แก้ไข ${escapeHtml(e.title)}" title="แก้ไขคาบ">${icon('edit')}</button>${inner}
    </div>`;
  }
  return `
    <button type="button" class="tt-item" ${hue} data-id="${id}" aria-label="แก้ไข ${escapeHtml(e.title)}">${inner}
    </button>`;
}

function ttGridHtml(tt, now, courseIds) {
  const { periods, entries } = tt;
  const monday = ttMonday(now);
  const today = now.getDay();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const cur = today >= 1 && today <= 5 ? periods.findIndex(p => nowMin >= ttMin(p.start) && nowMin < ttMin(p.end)) : -1;

  const head = periods.map((p, i) =>
    `<th class="${i === cur ? 'is-now' : ''}" data-p="${i}">คาบ ${i + 1}<small>${p.start} - ${p.end}</small></th>`).join('');

  const rows = TT_DAYS.map(([n, name]) => {
    const date = new Date(monday); date.setDate(monday.getDate() + n - 1);
    const starts = ttLayoutDay(entries, n);
    const cells = [];
    for (let i = 0; i < periods.length; i++) {
      const e = starts.get(i);
      if (e) {
        cells.push(`<td class="tt-cell" colspan="${e.span}">${ttItemHtml(e, courseIds)}</td>`);
        i += e.span - 1;
      } else {
        cells.push(`<td class="tt-cell"><button type="button" class="tt-add" data-day="${n}" data-period="${i}" aria-label="เพิ่มคาบ วัน${name} คาบ ${i + 1}">${icon('plus')}</button></td>`);
      }
    }
    return `<tr class="${n === today ? 'is-today' : ''}"><td class="tt-day"><b>${name}</b><span>${date.getDate()} ${TT_MONTHS[date.getMonth()]}</span></td>${cells.join('')}</tr>`;
  }).join('');

  return `
    <div class="sheet-scroll-hint">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="M16 21l4-4-4-4"/><path d="M20 17H4"/></svg>
      เลื่อนซ้าย-ขวาเพื่อดูคาบทั้งหมด — คอลัมน์วันจะติดหน้าจอไว้เสมอ
    </div>
    <div class="tt-wrap">
      <table class="tt">
        <thead><tr><th class="tt-corner">วัน/คาบ</th>${head}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function ttStats(tt) {
  const placed = TT_DAYS.flatMap(([n]) => [...ttLayoutDay(tt.entries, n).values()]);
  const teach = placed.filter(e => e.kind === 'class');
  const sum = list => list.reduce((s, e) => s + e.span, 0);
  const groups = new Set(teach.map(e => e.cls).filter(Boolean));
  return { teachPeriods: sum(teach), groups: groups.size, activityPeriods: sum(placed.filter(e => e.kind === 'activity')), placed };
}

function ttStatsHtml(s) {
  const card = (label, value) => `<div class="stat-card"><div class="label">${label}</div><div class="value">${value}</div></div>`;
  return card('คาบสอนต่อสัปดาห์', s.teachPeriods) + card('ห้อง/กลุ่มที่สอน', s.groups) + card('คาบกิจกรรมอื่นๆ', s.activityPeriods);
}

function ttLegendHtml(placed) {
  if (!placed.length) return '<div class="u-note">ยังไม่ได้เพิ่มคาบเรียน — แตะช่องว่างในตารางเพื่อเริ่มต้น</div>';
  const map = new Map();
  placed.forEach(e => {
    const key = e.kind + '|' + e.code + '|' + e.title;
    const g = map.get(key) || { e, periods: 0, cls: new Set() };
    g.periods += e.span;
    if (e.cls) g.cls.add(e.cls);
    map.set(key, g);
  });
  return [...map.values()].map(g => `
    <span class="tt-legend-item" style="--w:var(--hue-${g.e.hue})">
      ${escapeHtml([g.e.code, g.e.title].filter(Boolean).join(' '))}
      <small>${g.periods} คาบ${g.cls.size ? ' · ' + g.cls.size + ' ห้อง' : ''}</small>
    </span>`).join('');
}

function ttExportCsv(tt) {
  const head = ['วัน/คาบ', ...tt.periods.map((p, i) => `คาบ ${i + 1} (${p.start}-${p.end})`)];
  const rows = TT_DAYS.map(([n, name]) => {
    const row = new Array(tt.periods.length).fill('');
    ttLayoutDay(tt.entries, n).forEach(e => {
      const text = [e.code, e.title, e.cls, e.room].filter(Boolean).join(' ');
      for (let i = e.period; i < e.period + e.span; i++) row[i] = text;
    });
    return [name, ...row];
  });
  downloadCsv('ตารางสอน.csv', [head, ...rows]);
}

// ---------- หน้าต่างเพิ่ม/แก้ไขคาบ ----------
function ttEntryModal(ctx, { entry = null, day = 1, period = 0 }) {
  const { state, commit, removeEntries } = ctx;
  const periods = state.tt.periods;
  const isEdit = !!entry;
  const e = entry || { kind: 'class', day, period, span: 1, code: '', title: '', cls: '', room: '', hue: 'blue', courseId: '' };
  let kind = e.kind, hue = e.hue, hueTouched = isEdit;
  const courseExists = state.courses.some(c => c.id === e.courseId);

  const opt = (v, label, sel) => `<option value="${v}"${sel ? ' selected' : ''}>${escapeHtml(label)}</option>`;
  const courseOpts = opt('', '— พิมพ์เอง —', !courseExists) + state.courses.map(c =>
    opt(c.id, [c.code, c.name].filter(Boolean).join(' ') + (c.level ? ` (${c.level})` : ''), c.id === e.courseId)).join('');
  const dayOpts = TT_DAYS.map(([n, name]) => opt(n, name, n === e.day)).join('');
  const startOpts = periods.map((p, i) => opt(i, `คาบ ${i + 1} (${p.start})`, i === e.period)).join('');
  const spanOptsHtml = (start, cur) => Array.from({ length: periods.length - start }, (_, i) => opt(i + 1, i + 1 + ' คาบ', i + 1 === cur)).join('');
  const kindBtns = TT_KINDS.map(([k, label]) => `<button type="button" class="theme-opt" data-kind="${k}" aria-pressed="${k === kind}">${label}</button>`).join('');
  const hueBtns = TT_HUES.map(([h, label]) => `<button type="button" class="tt-hue" style="--w:var(--hue-${h})" data-hue="${h}" aria-pressed="${h === hue}" aria-label="${label}" title="${label}">${icon('check')}</button>`).join('');

  openModal(`
    <h2>${isEdit ? 'แก้ไขคาบเรียน' : 'เพิ่มคาบเรียน'}</h2>
    <div class="modal-sub">เลือกวันและคาบ แล้วกรอกรายละเอียด — ถ้าสอนหลายคาบติดกันให้เลือกจำนวนคาบ</div>
    <div class="theme-seg" id="tt-kind" role="group" aria-label="ประเภท">${kindBtns}</div>
    <div class="field" id="tt-course-field">
      <label for="tt-course">เลือกจากรายวิชาของฉัน</label>
      <select id="tt-course">${courseOpts}</select>
    </div>
    <div class="field-row">
      <div class="field" id="tt-code-field"><label for="tt-code">รหัสวิชา</label><input id="tt-code" maxlength="30" autocomplete="off" placeholder="เช่น ว22103" value="${escapeHtml(e.code)}"></div>
      <div class="field"><label for="tt-title" id="tt-title-label">ชื่อวิชา</label><input id="tt-title" maxlength="100" autocomplete="off" placeholder="เช่น วิทยาการคำนวณ 2" value="${escapeHtml(e.title)}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label for="tt-cls">ชั้น/ห้อง</label><input id="tt-cls" maxlength="30" autocomplete="off" list="tt-dl-cls" placeholder="เช่น ม.2/4" value="${escapeHtml(e.cls)}"><datalist id="tt-dl-cls"></datalist></div>
      <div class="field"><label for="tt-room">ห้องเรียน/สถานที่</label><input id="tt-room" maxlength="30" autocomplete="off" placeholder="เช่น 4315" value="${escapeHtml(e.room)}"></div>
    </div>
    <div class="tt-modal-row3">
      <div class="field"><label for="tt-day">วัน</label><select id="tt-day">${dayOpts}</select></div>
      <div class="field"><label for="tt-start">เริ่มคาบ</label><select id="tt-start">${startOpts}</select></div>
      <div class="field"><label for="tt-span">จำนวนคาบ</label><select id="tt-span">${spanOptsHtml(e.period, e.span)}</select></div>
    </div>
    <div class="field"><label>สี</label><div class="tt-hues" id="tt-hues" role="group" aria-label="สี">${hueBtns}</div></div>
    <div class="modal-actions">
      ${isEdit ? '<button type="button" class="btn btn-danger-ghost tt-del" id="tt-del-btn">ลบคาบนี้</button>' : ''}
      <button type="button" class="btn btn-ghost" id="tt-cancel-btn">ยกเลิก</button>
      <button type="button" class="btn btn-primary" id="tt-save-btn">บันทึก</button>
    </div>
  `);

  const $ = id => document.getElementById(id);
  const kindSeg = $('tt-kind');
  initNavPill(kindSeg, '.theme-opt', 'seg-pill', { activeSel: '[aria-pressed="true"]', watch: true });

  const syncKind = () => {
    kindSeg.querySelectorAll('[data-kind]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.kind === kind)));
    const isClass = kind === 'class';
    $('tt-course-field').classList.toggle('hidden', !isClass || !state.courses.length);
    $('tt-code-field').classList.toggle('hidden', !isClass);
    $('tt-title-label').textContent = isClass ? 'ชื่อวิชา' : 'ชื่อกิจกรรม';
    $('tt-title').placeholder = isClass ? 'เช่น วิทยาการคำนวณ 2' : 'เช่น กิจกรรมหน้าเสาธง, โฮมรูม';
    if (!hueTouched) setHue(isClass ? inheritedHue() : 'orange');
  };
  const setHue = h => {
    hue = h;
    $('tt-hues').querySelectorAll('[data-hue]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.hue === h)));
  };
  // วิชาเดียวกันที่มีในตารางแล้วใช้สีเดิม ให้มองเห็นกลุ่มเดียวกันได้ทันที
  const inheritedHue = () => {
    const code = ttText($('tt-code').value, 30), title = ttText($('tt-title').value);
    const hit = state.tt.entries.find(o => o.kind === 'class' && ((code && o.code === code) || (title && o.title === title)));
    return hit ? hit.hue : 'blue';
  };
  const onNameInput = () => { if (!hueTouched && kind === 'class') setHue(inheritedHue()); };

  kindSeg.querySelectorAll('[data-kind]').forEach(b => b.addEventListener('click', () => { kind = b.dataset.kind; syncKind(); }));
  $('tt-hues').addEventListener('click', ev => {
    const b = ev.target.closest('[data-hue]'); if (!b) return;
    hueTouched = true; setHue(b.dataset.hue);
  });
  $('tt-code').addEventListener('input', onNameInput);
  $('tt-title').addEventListener('input', onNameInput);

  $('tt-start').addEventListener('change', () => {
    const start = Number($('tt-start').value), keep = Number($('tt-span').value) || 1;
    $('tt-span').innerHTML = spanOptsHtml(start, Math.min(keep, periods.length - start));
  });

  // เลือกวิชาแล้วเติมรหัส/ชื่อให้ และเสนอรายชื่อห้องของวิชานั้น (ม.2/1, ม.2/2 ...)
  const fillRooms = async c => {
    try {
      if (!state.sections[c.id]) state.sections[c.id] = await loadSections(AppState.user.uid, c.id);
    } catch (err) { console.error(err); return; }
    if ($('tt-course').value !== c.id) return;
    const labels = state.sections[c.id].map(s => (c.level ? c.level + '/' : '') + s.room);
    $('tt-dl-cls').innerHTML = labels.map(l => `<option value="${escapeHtml(l)}"></option>`).join('');
    if (!$('tt-cls').value && labels.length === 1) $('tt-cls').value = labels[0];
  };
  $('tt-course').addEventListener('change', () => {
    const c = state.courses.find(x => x.id === $('tt-course').value);
    if (!c) { $('tt-dl-cls').innerHTML = ''; return; }
    $('tt-code').value = c.code; $('tt-title').value = c.name;
    onNameInput();
    fillRooms(c);
  });
  const preset = state.courses.find(c => c.id === e.courseId);
  if (preset) fillRooms(preset);
  syncKind();

  $('tt-cancel-btn').addEventListener('click', closeModal);
  $('tt-del-btn')?.addEventListener('click', () => { closeModal(); removeEntries([e.id], 'ลบคาบแล้ว'); });
  $('tt-save-btn').addEventListener('click', () => {
    const title = ttText($('tt-title').value);
    if (!title) { showToast(kind === 'class' ? 'กรอกชื่อวิชาก่อน' : 'กรอกชื่อกิจกรรมก่อน'); $('tt-title').focus(); return; }
    const d = Number($('tt-day').value), p = Number($('tt-start').value), span = Number($('tt-span').value) || 1;
    const clash = state.tt.entries.find(o => o.id !== e.id && o.day === d && o.period < p + span && p < o.period + o.span);
    if (clash) { showToast(`ชนกับ "${clash.title}" (วัน${ttDayName(d)} คาบ ${clash.period + 1})`, 'warn'); return; }
    const next = {
      id: e.id || uid4(), kind, day: d, period: p, span, title,
      code: kind === 'class' ? ttText($('tt-code').value, 30) : '',
      cls: ttText($('tt-cls').value, 30), room: ttText($('tt-room').value, 30), hue,
      courseId: kind === 'class' ? $('tt-course').value : '',
    };
    const entries = isEdit ? state.tt.entries.map(o => (o.id === e.id ? next : o)) : [...state.tt.entries, next];
    closeModal();
    commit({ ...state.tt, entries });
  });
}

// ---------- หน้าต่างตั้งเวลาคาบเรียน ----------
function ttPeriodsModal(ctx) {
  const { state, commit } = ctx;
  const periods = state.tt.periods.map(p => ({ ...p }));
  const lastUsed = state.tt.entries.reduce((m, e) => Math.max(m, e.period + e.span - 1), -1);

  openModal(`
    <h2>ตั้งเวลาคาบเรียน</h2>
    <div class="modal-sub">กำหนดเวลาเริ่ม-เลิกของแต่ละคาบตามโรงเรียน (สูงสุด ${TT_MAX_PERIODS} คาบ) คาบที่มีวิชาอยู่แล้วลบไม่ได้</div>
    <div id="tt-period-rows"></div>
    <div class="u-flex u-gap-8 u-wrap u-mt-12">
      <button type="button" class="btn btn-ghost btn-sm" id="tt-period-add">+ เพิ่มคาบ</button>
      <button type="button" class="btn btn-ghost btn-sm" id="tt-period-reset">ใช้เวลาเริ่มต้น</button>
    </div>
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" id="tt-period-cancel">ยกเลิก</button>
      <button type="button" class="btn btn-primary" id="tt-period-save">บันทึก</button>
    </div>
  `);
  const rowsEl = document.getElementById('tt-period-rows');
  const draw = () => {
    rowsEl.innerHTML = periods.map((p, i) => `
      <div class="tt-period-row">
        <span class="u-semibold">คาบ ${i + 1}</span>
        <input type="time" data-i="${i}" data-k="start" value="${p.start}" aria-label="เวลาเริ่ม คาบ ${i + 1}">
        <input type="time" data-i="${i}" data-k="end" value="${p.end}" aria-label="เวลาเลิก คาบ ${i + 1}">
        <button type="button" class="btn btn-ghost btn-sm" data-del="${i}" aria-label="ลบคาบ ${i + 1}"${i === periods.length - 1 && i > lastUsed && periods.length > 1 ? '' : ' disabled'}>✕</button>
      </div>`).join('');
  };
  rowsEl.addEventListener('input', ev => {
    const el = ev.target;
    if (el.dataset.k) periods[Number(el.dataset.i)][el.dataset.k] = ttCleanTime(el.value);
  });
  rowsEl.addEventListener('click', ev => {
    const b = ev.target.closest('[data-del]');
    if (b && !b.disabled) { periods.pop(); draw(); }
  });
  document.getElementById('tt-period-add').addEventListener('click', () => {
    if (periods.length >= TT_MAX_PERIODS) { showToast(`เพิ่มได้สูงสุด ${TT_MAX_PERIODS} คาบ`); return; }
    const prevEnd = periods.length ? ttMin(periods[periods.length - 1].end || '00:00') : 7 * 60 + 50;
    const s = Math.min(prevEnd, 23 * 60 + 9), e = Math.min(s + 50, 23 * 60 + 59);
    periods.push({ start: ttPad(Math.floor(s / 60)) + ':' + ttPad(s % 60), end: ttPad(Math.floor(e / 60)) + ':' + ttPad(e % 60) });
    draw();
  });
  document.getElementById('tt-period-reset').addEventListener('click', () => {
    if (lastUsed >= TT_DEFAULT_PERIODS.length) { showToast('มีวิชาอยู่เกินคาบที่ 10 จึงใช้เวลาเริ่มต้นไม่ได้'); return; }
    periods.splice(0, periods.length, ...TT_DEFAULT_PERIODS.map(p => ({ ...p })));
    draw();
  });
  document.getElementById('tt-period-cancel').addEventListener('click', closeModal);
  document.getElementById('tt-period-save').addEventListener('click', () => {
    for (let i = 0; i < periods.length; i++) {
      const p = periods[i];
      if (!p.start || !p.end) { showToast(`กรอกเวลาของคาบ ${i + 1} ให้ครบ`); return; }
      if (ttMin(p.start) >= ttMin(p.end)) { showToast(`คาบ ${i + 1}: เวลาเลิกต้องหลังเวลาเริ่ม`); return; }
      if (i > 0 && ttMin(p.start) < ttMin(periods[i - 1].end)) { showToast(`คาบ ${i + 1} เริ่มก่อนคาบ ${i} จบ`); return; }
    }
    closeModal();
    if (JSON.stringify(periods) !== JSON.stringify(state.tt.periods)) commit({ ...state.tt, periods });
  });
  draw();
}

// ---------- แท็บตารางสอน ----------
async function renderTimetableTab(body, isActive = () => true) {
  const [tt, courses] = await Promise.all([loadTimetable(), loadTtCourses()]);
  if (!isActive()) return;
  AppState.timetable = tt; // แคชให้วิดเจ็ตหน้าแรกวาดได้ทันที
  const state = { tt, courses, sections: {} };

  body.innerHTML = `
    <div class="tt-stats" id="tt-stats"></div>
    <div class="card card-pad">
      <div class="tt-toolbar">
        <h2 class="card-title">ตารางสอนประจำสัปดาห์</h2>
        <div class="tt-toolbar-actions">
          <button type="button" class="btn btn-ghost btn-sm" id="tt-periods-btn">ตั้งเวลาคาบเรียน</button>
          <button type="button" class="btn btn-ghost btn-sm" id="tt-export-btn">ส่งออก CSV</button>
          <button type="button" class="btn btn-danger-ghost btn-sm" id="tt-clear-btn">ล้างตาราง</button>
          <button type="button" class="btn btn-primary btn-sm" id="tt-add-btn">+ เพิ่มคาบ</button>
        </div>
      </div>
      <div class="u-note u-mb-12">แตะช่องว่างเพื่อเพิ่มคาบ · แตะคาบที่มีอยู่เพื่อแก้ไขหรือลบ · วันและคาบปัจจุบันจะมีสีเน้น</div>
      <div id="tt-grid"></div>
      <div class="tt-legend" id="tt-legend"></div>
    </div>`;

  const gridEl = body.querySelector('#tt-grid');
  const redraw = () => {
    const prev = gridEl.querySelector('.tt-wrap');
    const keep = prev ? { l: prev.scrollLeft, t: prev.scrollTop } : null;
    const s = ttStats(state.tt);
    body.querySelector('#tt-stats').innerHTML = ttStatsHtml(s);
    gridEl.innerHTML = ttGridHtml(state.tt, new Date(), new Set(state.courses.map(c => c.id)));
    body.querySelector('#tt-legend').innerHTML = ttLegendHtml(s.placed);
    const wrap = gridEl.querySelector('.tt-wrap');
    if (keep) { wrap.scrollLeft = keep.l; wrap.scrollTop = keep.t; }
    else { // ครั้งแรก: เลื่อนให้เห็นคาบปัจจุบัน (มือถือ)
      const now = wrap.querySelector('th.is-now');
      if (now) wrap.scrollLeft = Math.max(0, now.offsetLeft - 120);
    }
  };

  // บันทึกแบบ optimistic: วาดใหม่ทันที แล้วค่อยเขียน Firestore — พลาดก็คืนค่าเดิม
  const commit = async next => {
    const prev = state.tt;
    state.tt = next;
    redraw();
    const ok = await saveTimetable(next);
    if (!ok && state.tt === next) { state.tt = prev; redraw(); }
    if (state.tt === next || ok) AppState.timetable = state.tt;
    return ok;
  };
  const removeEntries = async (ids, label) => {
    const removed = state.tt.entries.filter(e => ids.includes(e.id));
    if (!removed.length) return;
    const ok = await commit({ ...state.tt, entries: state.tt.entries.filter(e => !ids.includes(e.id)) });
    if (!ok) return;
    islandUndo(label, async () => {
      if (!(await commit({ ...state.tt, entries: [...state.tt.entries, ...removed] }))) throw new Error('กู้คืนไม่สำเร็จ');
    });
  };
  const ctx = { state, commit, removeEntries };

  gridEl.addEventListener('keydown', ev => {
    const go = ev.target.closest('[data-score-go]');
    if (!go || ev.target !== go || (ev.key !== 'Enter' && ev.key !== ' ')) return;
    ev.preventDefault();
    const entry = state.tt.entries.find(e => e.id === go.dataset.scoreGo);
    if (entry) ttOpenScores(entry);
  });
  gridEl.addEventListener('click', ev => {
    const item = ev.target.closest('.tt-item'), add = ev.target.closest('.tt-add');
    const edit = ev.target.closest('[data-edit]'), go = ev.target.closest('[data-score-go]');
    if (edit) {
      const entry = state.tt.entries.find(e => e.id === edit.dataset.edit);
      if (entry) ttEntryModal(ctx, { entry });
    } else if (go) {
      const entry = state.tt.entries.find(e => e.id === go.dataset.scoreGo);
      if (entry) ttOpenScores(entry);
    } else if (item) {
      const entry = state.tt.entries.find(e => e.id === item.dataset.id);
      if (entry) ttEntryModal(ctx, { entry });
    } else if (add) {
      ttEntryModal(ctx, { day: Number(add.dataset.day), period: Number(add.dataset.period) });
    }
  });
  body.querySelector('#tt-add-btn').addEventListener('click', () => {
    const d = new Date().getDay();
    ttEntryModal(ctx, { day: d >= 1 && d <= 5 ? d : 1, period: 0 });
  });
  body.querySelector('#tt-periods-btn').addEventListener('click', () => ttPeriodsModal(ctx));
  body.querySelector('#tt-export-btn').addEventListener('click', () => ttExportCsv(state.tt));
  body.querySelector('#tt-clear-btn').addEventListener('click', () => {
    if (!state.tt.entries.length) { showToast('ตารางยังว่างอยู่'); return; }
    openConfirmModal({
      title: 'ล้างตารางสอนทั้งหมด?',
      body: 'คาบเรียนทุกคาบในตารางจะถูกลบ (เวลาคาบเรียนยังอยู่) — กด \"เลิกทำ\" ได้ภายใน 5 วินาทีหลังลบ',
      confirmLabel: 'ล้างตาราง', danger: true,
      onConfirm: async () => { await removeEntries(state.tt.entries.map(e => e.id), 'ล้างตารางแล้ว'); },
    });
  });

  redraw();
}

// ==========================================================================
// วิดเจ็ตตารางสอนหน้าแรก (วางใต้การ์ดสภาพอากาศ) — js/dashboard.js ใส่โครง #tt-widget แล้วเรียก initTimetableWidget
// แสดงคาบของวันที่เลือก (ค่าเริ่มต้น = วันนี้ · เสาร์-อาทิตย์ = วันจันทร์หน้า) พร้อมป้าย "กำลังสอน/ถัดไป" และอัปเดตทุกนาที
// ==========================================================================
const TT_SHORT_DAY = { 1: 'จ.', 2: 'อ.', 3: 'พ.', 4: 'พฤ.', 5: 'ศ.' };

function ttwWeekStart(now) { // วันจันทร์ของสัปดาห์ที่แสดง
  const m = ttMonday(now);
  if (now.getDay() === 0 || now.getDay() === 6) m.setDate(m.getDate() + 7);
  return m;
}

function ttwItemHtml(e, periods, tag, courseIds) {
  const start = periods[e.period].start, end = periods[e.period + e.span - 1].end;
  const label = e.span > 1 ? `คาบ ${e.period + 1}-${e.period + e.span}` : `คาบ ${e.period + 1}`;
  const meta = [e.cls, e.room && 'ห้อง ' + e.room].filter(Boolean).map(escapeHtml).join(' · ');
  const badge = tag === 'now' ? '<span class="badge badge-success">กำลังสอน</span>'
    : tag === 'next' ? '<span class="badge badge-neutral">ถัดไป</span>' : '';
  // คาบที่ผูกกับรายวิชา: กดทั้งกรอบ = ไปหน้าบันทึกคะแนน · แก้ไขคาบใช้ปุ่มดินสอ · คาบอื่น (กิจกรรม/พิมพ์เอง) กดทั้งกรอบ = แก้ไข
  const id = escapeHtml(e.id), link = ttLinkable(e, courseIds);
  const act = link
    ? ` role="link" tabindex="0" data-ttw-score="${id}" title="ไปหน้าบันทึกคะแนน"`
    : ` role="button" tabindex="0" data-ttw-edit="${id}" title="แก้ไขคาบ"`;
  const pencil = link ? `<button type="button" class="tt-edit" data-ttw-edit="${id}" aria-label="แก้ไข ${escapeHtml(e.title)}" title="แก้ไขคาบ">${icon('edit')}</button>` : '';
  return `
    <div class="ttw-item is-act${tag === 'now' ? ' is-now' : ''}" style="--w:var(--hue-${e.hue})"${act}>
      <div class="ttw-time"><b>${label}</b><span>${start} - ${end}</span></div>
      <div class="ttw-info">
        <span class="ttw-title">${escapeHtml([e.code, e.title].filter(Boolean).join(' '))}</span>
        ${meta ? `<span class="ttw-meta">${meta}</span>` : ''}
      </div>
      ${badge}${pencil}
    </div>`;
}

async function initTimetableWidget(root) {
  const daysEl = root.querySelector('#ttw-days'), listEl = root.querySelector('#ttw-list'), subEl = root.querySelector('#ttw-sub');
  const first = new Date();
  let day = first.getDay() >= 1 && first.getDay() <= 5 ? first.getDay() : 1;
  let tt = AppState.timetable || null;

  daysEl.innerHTML = TT_DAYS.map(([n, name]) =>
    `<button type="button" class="theme-opt${n === first.getDay() ? ' is-today' : ''}" data-day="${n}" aria-pressed="${n === day}" aria-label="${name}">${TT_SHORT_DAY[n]}</button>`).join('');
  initNavPill(daysEl, '.theme-opt', 'seg-pill', { activeSel: '[aria-pressed="true"]', watch: true });

  const draw = () => {
    if (!tt) return;
    const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
    const date = ttwWeekStart(now); date.setDate(date.getDate() + day - 1);
    const entries = [...ttLayoutDay(tt.entries, day).values()].sort((a, b) => a.period - b.period);
    const teach = entries.filter(e => e.kind === 'class').reduce((s, e) => s + e.span, 0);
    subEl.textContent = `วัน${ttDayName(day)}ที่ ${date.getDate()} ${TT_MONTHS[date.getMonth()]}` + (teach ? ` · สอน ${teach} คาบ` : '');

    if (!tt.entries.length) {
      listEl.innerHTML = `<div class="ttw-empty">ยังไม่ได้ตั้งตารางสอน<br><button type="button" class="btn btn-primary btn-sm u-mt-12" data-ttw-go>ตั้งตารางสอน</button></div>`;
      return;
    }
    if (!entries.length) { listEl.innerHTML = `<div class="ttw-empty">ไม่มีคาบในวัน${ttDayName(day)}</div>`; return; }

    const today = now.getDay() === day;
    let nowIdx = -1, nextIdx = -1;
    if (today) {
      entries.forEach((e, i) => {
        const s = ttMin(tt.periods[e.period].start), en = ttMin(tt.periods[e.period + e.span - 1].end);
        if (nowMin >= s && nowMin < en) nowIdx = i;
        else if (s > nowMin && nextIdx < 0) nextIdx = i;
      });
    }
    const courseIds = Array.isArray(AppState.courses) ? new Set(AppState.courses.map(c => c.id)) : null; // หน้าแรกโหลดรายวิชาไว้แล้ว · ถ้ายังไม่มีให้ตรวจตอนกด
    listEl.innerHTML = entries.map((e, i) => ttwItemHtml(e, tt.periods, i === nowIdx ? 'now' : i === nextIdx ? 'next' : '', courseIds)).join('');
  };

  // แก้ไขคาบจากหน้าแรก: ใช้หน้าต่างเดียวกับหน้าข้อมูลส่วนตัว (ttEntryModal) · โหลดรายวิชาครั้งแรกที่กดแก้
  let editCtx = null;
  const makeEditCtx = courses => {
    const state = { tt, courses, sections: {} };
    const setTt = next => { state.tt = next; tt = next; AppState.timetable = next; draw(); };
    const commit = async next => {
      const prev = state.tt;
      setTt(next);
      const ok = await saveTimetable(next);
      if (!ok && state.tt === next) setTt(prev);
      return ok;
    };
    const removeEntries = async (ids, label) => {
      const removed = state.tt.entries.filter(e => ids.includes(e.id));
      if (!removed.length) return;
      const ok = await commit({ ...state.tt, entries: state.tt.entries.filter(e => !ids.includes(e.id)) });
      if (!ok) return;
      islandUndo(label, async () => {
        if (!(await commit({ ...state.tt, entries: [...state.tt.entries, ...removed] }))) throw new Error('กู้คืนไม่สำเร็จ');
      });
    };
    return { state, commit, removeEntries };
  };
  const openEdit = async id => {
    const entry = tt && tt.entries.find(x => x.id === id);
    if (!entry) return;
    if (!editCtx) editCtx = makeEditCtx(await loadTtCourses());
    editCtx.state.tt = tt;
    ttEntryModal(editCtx, { entry });
  };
  const openScores = id => { const entry = tt && tt.entries.find(x => x.id === id); if (entry) ttOpenScores(entry); };

  const load = async () => {
    if (tt) draw(); else showLoading('list', listEl);
    try {
      const fresh = await loadTimetable();
      AppState.timetable = fresh; tt = fresh;
      if (!root.isConnected) return;
      clearLoading(listEl);
      draw();
    } catch (err) {
      console.error(err);
      if (tt || !root.isConnected) return;
      clearLoading(listEl);
      listEl.innerHTML = `<div class="ttw-empty">โหลดตารางสอนไม่สำเร็จ<br><button type="button" class="btn btn-ghost btn-sm u-mt-12" data-ttw-retry>ลองใหม่</button></div>`;
    }
  };

  daysEl.addEventListener('click', ev => {
    const b = ev.target.closest('[data-day]'); if (!b) return;
    day = Number(b.dataset.day);
    daysEl.querySelectorAll('[data-day]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    draw();
  });
  root.addEventListener('click', ev => {
    const ed = ev.target.closest('[data-ttw-edit]'), sc = ev.target.closest('[data-ttw-score]');
    if (ed) openEdit(ed.dataset.ttwEdit);
    else if (sc) openScores(sc.dataset.ttwScore);
    else if (ev.target.closest('[data-ttw-go]')) { AppState.profileTab = 'timetable'; navigate('profile'); }
    else if (ev.target.closest('[data-ttw-retry]')) load();
  });
  root.addEventListener('keydown', ev => {
    const el = ev.target.closest('[data-ttw-score], [data-ttw-edit]');
    if (!el || ev.target !== el || el.tagName === 'BUTTON' || (ev.key !== 'Enter' && ev.key !== ' ')) return; // ปุ่มดินสอเป็น <button> จริง กด Enter ได้เองอยู่แล้ว
    ev.preventDefault();
    if (el.dataset.ttwScore) openScores(el.dataset.ttwScore); else openEdit(el.dataset.ttwEdit);
  });
  const timer = setInterval(() => { if (!root.isConnected) clearInterval(timer); else draw(); }, 60000);
  await load();
}
