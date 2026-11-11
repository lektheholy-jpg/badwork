// ==========================================================================
// เวลาเรียน (เช็คชื่อ) — อยู่ในแท็บ "บันทึกคะแนน" ของรายวิชา (ปุ่มสลับ คะแนน | เวลาเรียน ใน scores.js)
// โหลดแบบ lazy ครั้งแรกที่เปิดมุมมองเวลาเรียน (LAZY_MODULES.attendance ใน js/utils.js)
//
// ข้อมูล (แยกตามห้อง เหมือน scores):
//   courses/{cid}/sections/{sid}/attendance/{studentId}    = { [sessionId]: 'p'|'a'|'s'|'l' }   (เขียนทีละช่องแบบ merge)
//   courses/{cid}/sections/{sid}/attendanceMeta/sessions   = { list: [{ id, date:'YYYY-MM-DD', type:'class'|'holiday' }] }
//   courses/{cid}/settings/attendance                      = { late:boolean, leave:boolean, thr:number }
// ใช้ id คาบเป็นคีย์ ไม่ใช้วันที่ — เลื่อนวันเรียนแล้วข้อมูลไม่หลุด
//
// กติกาคำนวณ: คิดจาก "คาบที่เช็คแล้ว" (คาบเรียนที่มีบันทึกอย่างน้อย 1 คน) · สายนับเป็นมา (ตั้งได้) · ลาไม่นับเป็นมา (ตั้งได้)
// % = มา ÷ จำนวนคาบที่เช็คแล้ว (ตรงสูตรของแบบฟอร์มรายงานการเข้าเรียน)
// ==========================================================================

const CK_CODES = ['p', 'a', 's', 'l'];
const CK_LABEL = { p: 'มา', a: 'ขาด', s: 'สาย', l: 'ลา' };
const CK_SYM = { p: '/', a: 'X', s: 'ส', l: 'ล.' };
const CK_RULES_DEFAULT = { late: true, leave: false, thr: 80 };
const CK_MONTH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

// ---------- ตรรกะล้วน (มีเทสต์ใน tests/attendance.test.js) ----------
function ckParseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}
function ckFmtDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function ckDayLabel(s) { const d = ckParseDate(s); return d ? `${d.getDate()} ${CK_MONTH[d.getMonth()]}` : '-'; }
function ckSortSessions(list) {
  return [...list].sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)));
}
// สร้างคาบรายสัปดาห์: วันเดียวกับ startDate ทุก 7 วัน, count สัปดาห์ · ข้ามวันที่ที่มีคาบอยู่แล้ว
function ckWeeklySessions(startDate, count, existing, makeId) {
  const d0 = ckParseDate(startDate);
  if (!d0) return [];
  const have = new Set(existing.map(s => s.date));
  const out = [];
  for (let k = 0; k < count; k++) {
    const date = ckFmtDate(new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + 7 * k));
    if (!have.has(date)) out.push({ id: makeId(), date, type: 'class' });
  }
  return out;
}
// คาบเรียนที่เช็คแล้ว = คาบเรียนที่มีบันทึกอย่างน้อย 1 คน
function ckTakenIds(sessions, rec) {
  const any = new Set();
  Object.values(rec).forEach(r => Object.keys(r || {}).forEach(k => any.add(k)));
  return sessions.filter(s => s.type !== 'holiday' && any.has(s.id)).map(s => s.id);
}
// สถิติของนักเรียน 1 คน — คาบที่เช็คแล้วแต่ไม่มีบันทึกของคนนี้ (เช่น เพิ่มชื่อทีหลัง) นับเป็นมา
function ckStat(studentRec, takenIds, rules) {
  const c = { p: 0, a: 0, s: 0, l: 0 };
  takenIds.forEach(id => { c[(studentRec && studentRec[id]) || 'p']++; });
  const present = c.p + (rules.late ? c.s : 0) + (rules.leave ? c.l : 0);
  const total = takenIds.length;
  const pct = total ? Math.round(present / total * 10000) / 100 : null;
  return { c, present, total, pct, low: pct !== null && pct < rules.thr };
}
const ckPct = (n) => (n === null ? '-' : String(n).replace(/\.00$/, ''));

// ---------- หน้าจอ ----------
async function renderAttendanceTab(container, course, section) {
  showLoading('cat-sm', container);
  const uid = AppState.user.uid;
  const secBase = sectionRef(uid, course.id, section.id);
  const courseBase = db.collection('users').doc(uid).collection('courses').doc(course.id);
  const attCol = secBase.collection('attendance');
  const metaRef = secBase.collection('attendanceMeta').doc('sessions');
  const rulesRef = courseBase.collection('settings').doc('attendance');

  const [stuSnap, attSnap, metaDoc, rulesDoc] = await Promise.all([
    secBase.collection('students').orderBy('no', 'asc').get(), attCol.get(), metaRef.get(), rulesRef.get(),
  ]);
  const students = stuSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  students.sort((a, b) => (Number(a.no) || 0) - (Number(b.no) || 0));
  if (students.length === 0) {
    container.innerHTML = `<div class="card"><div class="empty-state"><div class="icon">${icon('user')}</div>กรุณาเพิ่มรายชื่อนักเรียนในห้อง ${escapeHtml(section.room)} ก่อนเช็คเวลาเรียน</div></div>`;
    return;
  }
  const rec = {};
  attSnap.docs.forEach(d => { rec[d.id] = d.data(); });
  let sessions = ckSortSessions(metaDoc.exists ? (metaDoc.data().list || []) : []);
  const rules = { ...CK_RULES_DEFAULT, ...(rulesDoc.exists ? rulesDoc.data() : {}) };
  let view = AppState.attendanceView || 'check';
  let curId = AppState.attendanceSession && sessions.some(s => s.id === AppState.attendanceSession) ? AppState.attendanceSession : null;

  const nameOf = (s) => `${s.firstName || ''} ${s.lastName || ''}`.trim();
  const taken = () => ckTakenIds(sessions, rec);
  const pickDefaultSession = () => {
    const cls = sessions.filter(s => s.type !== 'holiday');
    const t = new Set(taken());
    return (cls.find(s => !t.has(s.id)) || cls[cls.length - 1] || sessions[0] || {}).id || null;
  };
  if (!curId) curId = pickDefaultSession();

  // ----- บันทึก (เขียนลง Firestore ทันที — ตอนออฟไลน์เข้าคิวในเครื่องเอง) -----
  let pending = 0, failed = 0;
  const statusEl = () => container.querySelector('#ck-save-status');
  function renderStatus() {
    const el = statusEl(); if (!el) return;
    el.classList.toggle('saving', pending > 0);
    el.innerHTML = failed ? `<span class="dot"></span> บันทึกไม่สำเร็จ ${failed} รายการ` : pending > 0 ? `<span class="dot"></span> กำลังบันทึก...` : `<span class="dot"></span> บันทึกอัตโนมัติแล้ว`;
  }
  async function track(promise) {
    pending++; renderStatus();
    try { await promise; } catch (err) { console.error(err); failed++; showToast('บันทึกเวลาเรียนไม่สำเร็จ ลองใหม่อีกครั้ง'); }
    pending--; renderStatus();
  }
  const setStatus = (studentId, sid, code) => {
    (rec[studentId] = rec[studentId] || {})[sid] = code;
    track(attCol.doc(studentId).set({ [sid]: code }, { merge: true }));
  };
  const saveSessions = () => track(metaRef.set({ list: sessions }));
  async function commitBatches(ops) {
    for (let i = 0; i < ops.length; i += 400) {
      const b = db.batch(); ops.slice(i, i + 400).forEach(fn => fn(b)); await b.commit();
    }
  }

  // ----- วาด -----
  function sessionLabel(s) { return s.type === 'holiday' ? `${ckDayLabel(s.date)} หยุด` : ckDayLabel(s.date); }
  function toolbarHtml() {
    return `
      <div class="toolbar">
        <div class="toolbar-left">
          <span class="badge badge-neutral u-fs-13 u-pad-6-12">ห้อง ${escapeHtml(section.room)}</span>
          <div class="ck-seg" role="group" aria-label="มุมมอง">
            <button class="ck-seg-btn ${view === 'check' ? 'active' : ''}" data-view="check">เช็คชื่อรายคาบ</button>
            <button class="ck-seg-btn ${view === 'grid' ? 'active' : ''}" data-view="grid">สรุปทั้งเทอม</button>
          </div>
        </div>
        <div class="toolbar-right ck-tools">
          <button class="btn btn-ghost btn-sm" id="ck-weekly">สร้างคาบรายสัปดาห์</button>
          <button class="btn btn-ghost btn-sm" id="ck-add">เพิ่มคาบ</button>
          <button class="btn btn-ghost btn-sm" id="ck-rules">กติกา</button>
          <div class="save-status" id="ck-save-status"><span class="dot"></span> บันทึกอัตโนมัติแล้ว</div>
        </div>
      </div>`;
  }
  function checkHtml() {
    if (!sessions.length) {
      return `<div class="card"><div class="empty-state"><div class="icon">${icon('book')}</div>ยังไม่มีคาบเรียน — กด "สร้างคาบรายสัปดาห์" เพื่อสร้างทั้งเทอมในครั้งเดียว หรือ "เพิ่มคาบ" ทีละวัน</div></div>`;
    }
    const cur = sessions.find(s => s.id === curId) || sessions[0];
    const takenSet = new Set(taken());
    const isTaken = takenSet.has(cur.id);
    const chips = sessions.map((s, i) => {
      const n = sessions.slice(0, i + 1).filter(x => x.type !== 'holiday').length;
      return `<button class="ck-chip ${s.id === cur.id ? 'active' : ''} ${s.type === 'holiday' ? 'holiday' : ''} ${takenSet.has(s.id) ? 'done' : ''}" data-sid="${s.id}">${s.type === 'holiday' ? 'หยุด' : 'คาบ ' + n}<small>${ckDayLabel(s.date)}</small></button>`;
    }).join('');
    let body;
    if (cur.type === 'holiday') {
      body = `<div class="empty-state">วันนี้เป็นวันหยุด — ไม่นับในเวลาเรียน</div>`;
    } else {
      const cnt = { p: 0, a: 0, s: 0, l: 0 };
      students.forEach(st => { cnt[(rec[st.id] && rec[st.id][cur.id]) || 'p']++; });
      body = `
        <div class="ck-sum">
          ${CK_CODES.map(k => `<span class="ck-pill ck-${k}">${CK_LABEL[k]} ${cnt[k]}</span>`).join('')}
          ${isTaken ? '<span class="ck-note">เช็คชื่อแล้ว</span>' : '<span class="ck-note">ยังไม่ได้เช็ค — ทุกคนเป็น "มา" ไว้ก่อน แตะเฉพาะคนที่ขาด สาย ลา แล้วกดบันทึกคาบนี้</span>'}
          <button class="btn btn-primary btn-sm ck-save-all" id="ck-save-all">${isTaken ? 'ตั้งคนที่ยังไม่เลือกเป็นมา' : 'บันทึกคาบนี้'}</button>
        </div>
        <ul class="ck-list">
          ${students.map(st => {
            const v = rec[st.id] && rec[st.id][cur.id];
            const stt = ckStat(rec[st.id], [...takenSet], rules);
            return `<li data-student-id="${st.id}">
              <span class="ck-no">${escapeHtml(st.no ?? '')}</span>
              <div class="ck-name"><b>${escapeHtml(nameOf(st))}</b><span class="${stt.low ? 'ck-low' : ''}">${escapeHtml(st.code || '')}${stt.total ? ` · เวลาเรียน ${ckPct(stt.pct)}%${stt.low ? ' ต่ำกว่าเกณฑ์' : ''}` : ''}</span></div>
              <div class="ck-btns" role="group" aria-label="สถานะของ ${escapeHtml(nameOf(st))}">
                ${CK_CODES.map(k => `<button class="ck-btn ck-${k} ${(v || 'p') === k ? 'on' : ''} ${!v && k === 'p' ? 'ghost' : ''}" data-k="${k}" aria-pressed="${(v || 'p') === k}">${CK_LABEL[k]}</button>`).join('')}
              </div>
            </li>`;
          }).join('')}
        </ul>
        <div class="ck-session-actions">
          <button class="btn btn-ghost btn-sm" id="ck-holiday">ทำเป็นวันหยุด</button>
          <button class="btn btn-ghost btn-sm" id="ck-del">ลบคาบนี้</button>
        </div>`;
    }
    return `<div class="card card-pad"><div class="ck-chips">${chips}</div>${body}</div>`;
  }
  function gridHtml() {
    if (!sessions.length) return checkHtml();
    const t = taken(), tSet = new Set(t);
    const runs = [];
    sessions.forEach(s => { const d = ckParseDate(s.date), m = d ? d.getMonth() : -1; const l = runs[runs.length - 1]; if (l && l.m === m) l.n++; else runs.push({ m, n: 1 }); });
    const head = `<tr><th rowspan="2" class="ck-sticky">ชื่อ-สกุล</th>${runs.map(r => `<th colspan="${r.n}" class="ck-mo">${CK_MONTH[r.m] || ''}</th>`).join('')}
      <th rowspan="2">มา</th><th rowspan="2">ขาด</th><th rowspan="2">สาย</th><th rowspan="2">ลา</th><th rowspan="2">%</th></tr>
      <tr>${sessions.map(s => `<th class="${s.type === 'holiday' ? 'ck-hol' : ''}">${ckParseDate(s.date)?.getDate() ?? ''}</th>`).join('')}</tr>`;
    const rows = students.map(st => {
      const stt = ckStat(rec[st.id], t, rules);
      const cells = sessions.map(s => {
        if (s.type === 'holiday') return '<td class="ck-cell ck-hol">H</td>';
        const v = rec[st.id] && rec[st.id][s.id];
        const shown = v || (tSet.has(s.id) ? 'p' : '');
        return `<td class="ck-cell"><button class="ck-gcell ck-${shown}" data-sid="${s.id}" aria-label="${escapeHtml(nameOf(st))} ${ckDayLabel(s.date)}">${shown ? CK_SYM[shown] : '·'}</button></td>`;
      }).join('');
      return `<tr data-student-id="${st.id}"><td class="ck-sticky">${escapeHtml(st.no ?? '')}. ${escapeHtml(nameOf(st))}</td>${cells}
        <td>${stt.present}</td><td>${stt.c.a}</td><td>${stt.c.s}</td><td>${stt.c.l}</td><td class="ck-pct ${stt.low ? 'low' : ''}">${ckPct(stt.pct)}</td></tr>`;
    }).join('');
    return `<div class="sheet-wrap"><table class="ck-sheet"><thead>${head}</thead><tbody>${rows}</tbody></table></div>
      <div class="ck-legend">/ มา · X ขาด · ส สาย · ล. ลา · H วันหยุด — คำนวณจาก ${t.length} คาบที่เช็คแล้ว (สายนับเป็นมา: ${rules.late ? 'ใช่' : 'ไม่'} · ลานับเป็นมา: ${rules.leave ? 'ใช่' : 'ไม่'} · มส เมื่อต่ำกว่า ${rules.thr}%) · แตะช่องเพื่อเปลี่ยนสถานะ</div>`;
  }
  function draw() {
    AppState.attendanceView = view; AppState.attendanceSession = curId;
    container.innerHTML = toolbarHtml() + `<div id="ck-body">${view === 'check' ? checkHtml() : gridHtml()}</div>`;
    renderStatus();
  }
  const redrawBody = () => {
    const body = container.querySelector('#ck-body'); if (!body) return;
    const sc = body.querySelector('.sheet-wrap'), x = sc ? sc.scrollLeft : 0, y = window.scrollY;
    body.innerHTML = view === 'check' ? checkHtml() : gridHtml();
    const sc2 = body.querySelector('.sheet-wrap'); if (sc2) sc2.scrollLeft = x;
    window.scrollTo(0, y);
    AppState.attendanceSession = curId;
  };

  // ----- ปุ่ม/ป๊อปอัป -----
  function openAddModal() {
    openModal(`
      <h2>เพิ่มคาบ</h2>
      <div class="field"><label>วันที่</label><input type="date" id="ck-new-date" value="${ckFmtDate(new Date())}"></div>
      <div class="field"><label>ประเภท</label><select id="ck-new-type"><option value="class">คาบเรียน</option><option value="holiday">วันหยุด</option></select></div>
      <div class="modal-actions"><button class="btn btn-ghost" id="ck-m-cancel">ยกเลิก</button><button class="btn btn-primary" id="ck-m-ok">เพิ่ม</button></div>`);
    document.getElementById('ck-m-cancel').addEventListener('click', closeModal);
    document.getElementById('ck-m-ok').addEventListener('click', () => {
      const date = document.getElementById('ck-new-date').value;
      if (!ckParseDate(date)) { showToast('กรุณาเลือกวันที่'); return; }
      if (sessions.some(s => s.date === date)) { showToast('มีคาบในวันที่นี้แล้ว'); return; }
      const s = { id: uid4(), date, type: document.getElementById('ck-new-type').value };
      sessions = ckSortSessions([...sessions, s]); curId = s.id;
      saveSessions(); closeModal(); draw();
    });
  }
  function openWeeklyModal() {
    openModal(`
      <h2>สร้างคาบรายสัปดาห์</h2>
      <div class="modal-sub">เลือกวันที่เรียนครั้งแรกของภาคเรียน ระบบจะสร้างคาบวันเดียวกันทุกสัปดาห์ แล้วแก้ไข ลบ หรือทำเป็นวันหยุดได้ทีหลัง</div>
      <div class="field-row">
        <div class="field"><label>วันเรียนครั้งแรก</label><input type="date" id="ck-w-start"></div>
        <div class="field"><label>จำนวนสัปดาห์</label><input type="number" id="ck-w-count" min="1" max="60" value="18"></div>
      </div>
      <div class="modal-actions"><button class="btn btn-ghost" id="ck-m-cancel">ยกเลิก</button><button class="btn btn-primary" id="ck-m-ok">สร้างคาบ</button></div>`);
    document.getElementById('ck-m-cancel').addEventListener('click', closeModal);
    document.getElementById('ck-m-ok').addEventListener('click', () => {
      const start = document.getElementById('ck-w-start').value;
      const count = Math.min(60, Math.max(1, parseInt(document.getElementById('ck-w-count').value, 10) || 0));
      if (!ckParseDate(start)) { showToast('กรุณาเลือกวันเรียนครั้งแรก'); return; }
      const add = ckWeeklySessions(start, count, sessions, uid4);
      if (!add.length) { showToast('มีคาบทุกวันที่นี้อยู่แล้ว'); return; }
      sessions = ckSortSessions([...sessions, ...add]);
      if (!curId) curId = add[0].id;
      saveSessions(); closeModal(); draw(); showToast(`สร้าง ${add.length} คาบแล้ว`);
    });
  }
  function openRulesModal() {
    openModal(`
      <h2>กติกาการนับเวลาเรียน</h2>
      <div class="field"><label><input type="checkbox" id="ck-r-late" ${rules.late ? 'checked' : ''}> นับ "สาย" เป็นมา</label></div>
      <div class="field"><label><input type="checkbox" id="ck-r-leave" ${rules.leave ? 'checked' : ''}> นับ "ลา" เป็นมา</label></div>
      <div class="field"><label>ไม่มีสิทธิ์สอบ (มส) เมื่อเวลาเรียนต่ำกว่า (%)</label><input type="number" id="ck-r-thr" min="0" max="100" value="${rules.thr}"></div>
      <div class="field-hint">ใช้กับทุกห้องของวิชานี้</div>
      <div class="modal-actions"><button class="btn btn-ghost" id="ck-m-cancel">ยกเลิก</button><button class="btn btn-primary" id="ck-m-ok">บันทึก</button></div>`);
    document.getElementById('ck-m-cancel').addEventListener('click', closeModal);
    document.getElementById('ck-m-ok').addEventListener('click', () => {
      rules.late = document.getElementById('ck-r-late').checked;
      rules.leave = document.getElementById('ck-r-leave').checked;
      const thr = Number(document.getElementById('ck-r-thr').value);
      rules.thr = Number.isFinite(thr) ? Math.min(100, Math.max(0, thr)) : CK_RULES_DEFAULT.thr;
      track(rulesRef.set({ late: rules.late, leave: rules.leave, thr: rules.thr }, { merge: true }));
      closeModal(); draw();
    });
  }
  function deleteCurrent() {
    const cur = sessions.find(s => s.id === curId); if (!cur) return;
    openConfirmModal({
      title: 'ลบคาบนี้?', body: `คาบวันที่ ${ckDayLabel(cur.date)} และบันทึกเวลาเรียนของคาบนี้ทั้งห้องจะถูกลบ`, confirmLabel: 'ลบคาบ', danger: true,
      onConfirm: async () => {
        const del = firebase.firestore.FieldValue.delete();
        const ops = students.filter(st => rec[st.id] && rec[st.id][cur.id]).map(st => (b) => b.set(attCol.doc(st.id), { [cur.id]: del }, { merge: true }));
        await commitBatches(ops);
        students.forEach(st => { if (rec[st.id]) delete rec[st.id][cur.id]; });
        sessions = sessions.filter(s => s.id !== cur.id);
        await metaRef.set({ list: sessions });
        curId = pickDefaultSession(); closeModal(); draw();
      },
    });
  }

  container.addEventListener('click', (e) => {
    const t = e.target;
    let el;
    if ((el = t.closest('.ck-seg-btn'))) { view = el.dataset.view; draw(); }
    else if (t.closest('#ck-add')) openAddModal();
    else if (t.closest('#ck-weekly')) openWeeklyModal();
    else if (t.closest('#ck-rules')) openRulesModal();
    else if (t.closest('#ck-save-status') && failed) { failed = 0; renderStatus(); showToast('ลองแตะสถานะอีกครั้งเพื่อบันทึกซ้ำ'); }
    else if ((el = t.closest('.ck-chip'))) { curId = el.dataset.sid; redrawBody(); }
    else if ((el = t.closest('.ck-btn'))) {
      const id = el.closest('li').dataset.studentId;
      setStatus(id, curId, el.dataset.k); redrawBody();
    } else if (t.closest('#ck-save-all')) {
      const ops = students.filter(st => !(rec[st.id] && rec[st.id][curId])).map(st => {
        (rec[st.id] = rec[st.id] || {})[curId] = 'p';
        return (b) => b.set(attCol.doc(st.id), { [curId]: 'p' }, { merge: true });
      });
      track(commitBatches(ops)); redrawBody(); showToast('บันทึกเช็คชื่อคาบนี้แล้ว');
    } else if (t.closest('#ck-holiday')) {
      const cur = sessions.find(s => s.id === curId); if (!cur) return;
      cur.type = 'holiday'; saveSessions(); draw();
    } else if (t.closest('#ck-del')) deleteCurrent();
    else if ((el = t.closest('.ck-gcell'))) {
      const id = el.closest('tr').dataset.studentId, sid = el.dataset.sid;
      const v = (rec[id] && rec[id][sid]) || (new Set(taken()).has(sid) ? 'p' : null);
      setStatus(id, sid, v ? CK_CODES[(CK_CODES.indexOf(v) + 1) % CK_CODES.length] : 'p'); redrawBody();
    }
  });
  draw();
}
