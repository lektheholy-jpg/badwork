// ==========================================================================
// วิจัยในชั้นเรียน (ระบบเอกสาร "car") — รายการ · ฟอร์ม · ตัวอย่าง/พิมพ์
//   สร้างโดย tools/new-doc-system.js · โครงเดียวกับ js/idp.js (ใช้ doc-system.js / doc-shell.js ร่วมกับ PA และ ID-Plan)
//   Firestore: users/{uid}/car_docs/{docId} (อ้างผ่าน sys.col('docs', uid) — ชื่อ collection อยู่ที่ js/car-config.js)
//   โหลดหลัง js/car-config.js เสมอ (LAZY_BUNDLES.car ใน js/utils.js)
//
//   โครงเอกสาร = ปกรายงาน + 1 ความสำคัญและที่มา · 2 วัตถุประสงค์ · 3 สมมติฐาน · 4 ขอบเขต · 5 ประโยชน์ที่คาดว่าจะได้รับ
//                · 6 วิธีดำเนินการวิจัย (+เครื่องมือ) · 7 ผลการวิเคราะห์ข้อมูล (ตารางการส่งงาน คำนวณร้อยละ/ค่าเฉลี่ยให้อัตโนมัติ) · สรุปผล
//   ช่องข้อความยาวที่ให้ AI เขียน: id = car-<ช่อง> (background · hypothesis · scope · results · satisfaction · conclusion) — ดู js/car-config.js · js/car-ai.js
//   รายการหลายข้อ (วัตถุประสงค์ · ประโยชน์ · ขั้นตอน · เครื่องมือ) ใช้ docLBlockHtml / docLBind / docLRows (js/doc-shell.js)
//   ฟังก์ชันบันทึกตัดคีย์ที่ขึ้นต้น _ (ข้อมูลชั่วคราว) — carSave ทำให้แล้ว
// ==========================================================================

const CAR_ICO_DOC = `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><g fill="currentColor" stroke="none"><path opacity=".55" d="M7 2.5h7l5.5 5.5v11A2.5 2.5 0 0 1 17 21.5H7A2.5 2.5 0 0 1 4.5 19V5A2.5 2.5 0 0 1 7 2.5Z"/><rect x="8" y="9" width="8" height="1.5" rx=".75"/><rect x="8" y="12" width="8" height="1.5" rx=".75"/><rect x="8" y="15" width="5" height="1.5" rx=".75"/></g></svg>`;
const CAR_SAVE_LABEL = 'บันทึก วิจัยในชั้นเรียน'; // ป้ายปุ่มบันทึก (ข้อความล้วน อยู่ท้ายฟอร์ม) — ตัวต่อ AI ใช้ข้อความเดียวกัน (copy.saveLabel)

function carUpdatedAt(d) {
  const t = d.updatedAt || d.createdAt;
  const dt = t && typeof t.toDate === 'function' ? t.toDate() : null;
  return dt ? 'แก้ไขล่าสุด ' + dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

// ข้อมูลผู้จัดทำดึงจากหน้า "ข้อมูลส่วนตัว" (อ่านไม่ได้ = null → ตัวอย่างพิมพ์ใช้จุดไข่ปลาแทน)
async function carGetProfile() {
  try {
    await loadModule('profile');
    return await loadTeacherProfile();
  } catch (e) {
    return AppState.teacherProfile || null;
  }
}
function carProfileInfo(p) {
  p = p || {};
  const name = [(p.prefix || '') + (p.firstName || ''), p.lastName || ''].filter(Boolean).join(' ');
  const position = [p.position, p.academicStanding].filter(Boolean).join(' ');
  return { name, position, school: p.school || '', affiliation: p.affiliation || '' };
}

// ------------------------------------------------------------------
// Firestore
// ------------------------------------------------------------------
function carCol(uid) {
  return docSystem('car').col('docs', uid);
}

async function carLoadList() {
  const uid = AppState.user?.uid;
  if (!uid) return [];
  const snap = await carCol(uid).orderBy('createdAt', 'desc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// อย่า await การเขียนในจุดที่บล็อกการแสดงหน้า (ออฟไลน์ promise ค้าง) — ที่นี่ผู้เรียกรอเพื่อแสดงสถานะ "กำลังบันทึก…" เท่านั้น (เหมือน idpSave)
async function carSave(data) {
  const sys = docSystem('car');
  const uid = AppState.user?.uid;
  if (!uid) throw new Error('ยังไม่ได้เข้าสู่ระบบ');
  const now = firebase.firestore.FieldValue.serverTimestamp();
  const { id: _id, createdAt: _c, updatedAt: _u, ...clean } = data;
  Object.keys(clean).forEach(k => { if (k[0] === '_') delete clean[k]; }); // คีย์ขึ้นต้น _ = ข้อมูลชั่วคราว ไม่บันทึก
  if (sys.state.docId) {
    await carCol(uid).doc(sys.state.docId).update({ ...clean, updatedAt: now });
    return sys.state.docId;
  }
  const ref = await carCol(uid).add({ ...clean, createdAt: now, updatedAt: now });
  sys.state.docId = ref.id;
  return ref.id;
}

async function carDelete(docId) {
  const sys = docSystem('car');
  const uid = AppState.user?.uid;
  if (!uid) return;
  await carCol(uid).doc(docId).delete();
  sys.state.list = null;
}

// ------------------------------------------------------------------
// ตัวเลข/สถิติของตาราง "การส่งงาน" (ฟังก์ชันล้วน — ทดสอบได้โดยไม่ต้องมีหน้าเว็บ)
//   แถว = { total, on, late, none } (สตริงจากช่องกรอก) → ร้อยละรายแถว + ค่าเฉลี่ยทุกแถวที่กรอก
//   ค่าเฉลี่ย = เฉลี่ยทุกแถวที่กรอก (ช่องว่าง/ขีด = 0) และร้อยละของค่าเฉลี่ย = ค่าเฉลี่ยจำนวน ÷ ค่าเฉลี่ยจำนวนนักเรียน × 100
//   แถวที่ ส่งตามกำหนด + ส่งช้า + ไม่ส่ง ≠ จำนวนนักเรียน ถูกทำเครื่องหมาย mismatch (เตือนในฟอร์ม ไม่บล็อกการบันทึก)
// ------------------------------------------------------------------
function carNum(v) {
  const n = parseFloat(String(v == null ? '' : v).replace(/[๐-๙]/g, c => String(c.charCodeAt(0) - 0x0E50)).replace(/,/g, '').trim());
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function carPct(n, total) {
  return total > 0 ? Math.round((n / total) * 10000 + 1e-9) / 100 : null;
}
const carFmtPct = p => (p === null || p === undefined ? '' : p.toFixed(2));
const carFmtAvg = n => (Number.isInteger(n) ? String(n) : n.toFixed(2));

function carStatCalc(rows) {
  const out = (rows || []).map(r => {
    r = r || {};
    const t = carNum(r.total), on = carNum(r.on), late = carNum(r.late), none = carNum(r.none);
    const blank = [t, on, late, none].every(v => v === null);
    const T = t || 0, O = on || 0, L = late || 0, N = none || 0;
    return {
      blank, total: T, on: O, late: L, none: N,
      pOn: carPct(O, T), pLate: carPct(L, T), pNone: carPct(N, T),
      mismatch: !blank && T > 0 && O + L + N !== T,
    };
  });
  const used = out.filter(r => !r.blank);
  let avg = null;
  if (used.length) {
    const m = k => used.reduce((s, r) => s + r[k], 0) / used.length;
    avg = { total: m('total'), on: m('on'), late: m('late'), none: m('none') };
    avg.pOn = carPct(avg.on, avg.total);
    avg.pLate = carPct(avg.late, avg.total);
    avg.pNone = carPct(avg.none, avg.total);
  }
  return { rows: out, avg, count: used.length };
}

// ประโยคสรุปผลจากตาราง (ปุ่ม "เติมข้อความจากตาราง") — ใช้เฉพาะตัวเลขที่คำนวณได้จริง
function carResultsSentence(calc) {
  if (!calc || !calc.avg) return '';
  const a = calc.avg, p = v => (v === null ? '…' : carFmtPct(v));
  return `จากตารางที่ 1 พบว่า จำนวนนักเรียนที่ส่งงานตามกำหนด คิดเป็นค่าเฉลี่ย ${carFmtAvg(a.on)} คน คิดเป็นร้อยละ ${p(a.pOn)} ของจำนวนนักเรียนทั้งหมด `
    + `จำนวนนักเรียนที่ส่งงานช้า คิดเป็นร้อยละ ${p(a.pLate)} และจำนวนนักเรียนที่ไม่ส่งงาน คิดเป็นร้อยละ ${p(a.pNone)}`;
}

// ------------------------------------------------------------------
// ข้อมูลคะแนนผลสัมฤทธิ์จากรายวิชา (ฟังก์ชันล้วน — ไม่แตะหน้าเว็บ/Firestore ทดสอบได้)
//   ครูเลือกวิชา (+ห้อง) และหัวข้อคะแนนจากโครงสร้างคะแนน → สรุปเป็นตัวเลขรวมต่อหัวข้อ (ไม่มีชื่อ/รหัสนักเรียน) เก็บใน doc.scoreSel
//   scoreSel.rows = ตัวเลขต่อหัวข้อ (แสดงในฟอร์ม) · scoreSel.summary = ข้อความบริบทที่ส่งให้ AI (สร้างจาก rows ทุกครั้ง)
//   ช่องที่ยังไม่มีคะแนน ≠ 0 — ไม่นับเข้าค่าเฉลี่ย (นับแยกเป็น "ยังไม่มีคะแนน") · เกณฑ์ผ่าน = ร้อยละของคะแนนเต็ม (ครูตั้งเอง ค่าเริ่มต้น 50)
// ------------------------------------------------------------------
const CAR_SCORE_MAX_ITEMS = 40;
function carScoreNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
const carR2 = n => (n === null || n === undefined ? null : Math.round(n * 100) / 100);

// cells = คะแนนของนักเรียนแต่ละคนในหัวข้อนี้ (ว่าง/ไม่มี = ยังไม่มีคะแนน)
function carScoreStat(item, cells, passPct) {
  const max = Number(item.max) || 0;
  const all = cells || [];
  const vals = all.map(carScoreNum).filter(v => v !== null);
  const n = vals.length;
  const out = {
    id: String(item.id == null ? '' : item.id), name: String(item.name == null ? '' : item.name), group: String(item.group || ''),
    max, total: all.length, n, missing: all.length - n,
    avg: null, pct: null, sd: null, min: null, top: null, pass: null, pPass: null,
  };
  if (!n) return out;
  const avg = vals.reduce((s, v) => s + v, 0) / n;
  out.avg = carR2(avg);
  out.pct = max > 0 ? carR2((avg / max) * 100) : null;
  out.sd = n > 1 ? carR2(Math.sqrt(vals.reduce((s, v) => s + (v - avg) ** 2, 0) / (n - 1))) : null; // S.D. ของกลุ่มตัวอย่าง (n-1)
  out.min = Math.min(...vals);
  out.top = Math.max(...vals);
  if (max > 0) {
    const need = (max * passPct) / 100;
    out.pass = vals.filter(v => v + 1e-9 >= need).length;
    out.pPass = carR2((out.pass / n) * 100);
  }
  return out;
}

// items = หัวข้อที่เลือก [{id,name,max,group}] · rowsByStudent = เอกสารคะแนนของนักเรียนแต่ละคน {รหัสหัวข้อ: คะแนน} (คนที่ยังไม่มีเอกสาร = {})
function carScoreCompute(items, rowsByStudent, passPct) {
  const p = Number(passPct);
  const pp = Number.isFinite(p) && p > 0 && p <= 100 ? p : 50;
  const stu = (rowsByStudent || []).map(r => r || {});
  const rows = items.map(a => carScoreStat(a, stu.map(r => r[a.id]), pp));
  let combined = null;
  if (items.length > 1) { // รวมหลายหัวข้อ: คิดเฉพาะนักเรียนที่มีคะแนนครบทุกหัวข้อที่เลือก
    const full = stu.filter(r => items.every(a => carScoreNum(r[a.id]) !== null));
    if (full.length) {
      const sums = full.map(r => items.reduce((s, a) => s + carScoreNum(r[a.id]), 0));
      const sumMax = items.reduce((s, a) => s + (Number(a.max) || 0), 0);
      combined = carScoreStat({ id: '_all', name: 'รวมทุกหัวข้อที่เลือก', max: sumMax }, sums, pp);
      combined.total = stu.length;
      combined.missing = stu.length - full.length;
    }
  }
  return { passPct: pp, students: stu.length, rows, combined };
}

// ข้อความบริบทของ AI — ตัวเลขรวมล้วน (ไม่มีชื่อ/รหัสนักเรียน)
function carScoreSummary(sel) {
  if (!sel || !Array.isArray(sel.rows) || !sel.rows.length) return '';
  const f = v => (v === null || v === undefined ? '-' : carFmtAvg(v));
  const line = r => {
    const head = `- ${r.group ? r.group + ' · ' : ''}${r.name} (คะแนนเต็ม ${f(r.max)}): `;
    if (!r.n) return head + 'ยังไม่มีคะแนน';
    return head + `มีคะแนน ${r.n} คน`
      + ` · ค่าเฉลี่ย ${f(r.avg)}${r.pct === null ? '' : ` (ร้อยละ ${f(r.pct)})`}`
      + (r.sd === null ? '' : ` · S.D. ${f(r.sd)}`)
      + (r.pass === null ? '' : ` · ผ่านเกณฑ์ ${r.pass} คน (ร้อยละ ${f(r.pPass)})`)
      + ` · ต่ำสุด ${f(r.min)} สูงสุด ${f(r.top)}`;
  };
  const lines = [`ข้อมูลคะแนนผลสัมฤทธิ์จากระบบ (ตัวเลขรวม ไม่มีชื่อนักเรียน): วิชา ${sel.courseName || '-'} · ${sel.roomLabel || 'ทุกห้อง'} · นักเรียน ${sel.students || 0} คน · เกณฑ์ผ่าน = ร้อยละ ${sel.passPct} ของคะแนนเต็ม`];
  sel.rows.forEach(r => lines.push(line(r)));
  if (sel.combined) lines.push(line(sel.combined) + ` [คิดเฉพาะนักเรียนที่มีคะแนนครบทุกหัวข้อ ${sel.combined.n} คน]`);
  return lines.join('\n').slice(0, 3000);
}

// ทำให้ scoreSel ที่อ่านจาก Firestore / ค่าเก่า ปลอดภัยและครบฟิลด์เสมอ (ไม่มีวิชา = null) · summary สร้างใหม่จาก rows
function carNormScoreSel(s) {
  if (!s || typeof s !== 'object' || !s.courseId) return null;
  const str = (v, n) => String(v == null ? '' : v).slice(0, n);
  const num = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  const row = r => ({
    id: str(r.id, 80), name: str(r.name, 120), group: str(r.group, 120),
    max: num(r.max) || 0, total: num(r.total) || 0, n: num(r.n) || 0, missing: num(r.missing) || 0,
    avg: num(r.avg), pct: num(r.pct), sd: num(r.sd), min: num(r.min), top: num(r.top), pass: num(r.pass), pPass: num(r.pPass),
  });
  const pp = num(s.passPct);
  const out = {
    courseId: str(s.courseId, 80), courseName: str(s.courseName, 160), sectionId: str(s.sectionId, 80), roomLabel: str(s.roomLabel, 80),
    ids: (Array.isArray(s.ids) ? s.ids : []).map(x => str(x, 80)).filter(Boolean).slice(0, CAR_SCORE_MAX_ITEMS),
    passPct: pp !== null && pp > 0 && pp <= 100 ? pp : 50,
    at: num(s.at) || 0, students: num(s.students) || 0,
    rows: (Array.isArray(s.rows) ? s.rows : []).filter(r => r && typeof r === 'object').slice(0, CAR_SCORE_MAX_ITEMS).map(row),
    combined: s.combined && typeof s.combined === 'object' ? row(s.combined) : null,
  };
  out.summary = carScoreSummary(out);
  return out;
}

// ------------------------------------------------------------------
// Normalize / blank doc
// ------------------------------------------------------------------
const CAR_TEXT_KEYS = ['title', 'subject', 'level', 'location', 'statsTitle', 'background', 'hypothesis', 'scope', 'results', 'satisfaction', 'conclusion'];
const CAR_LIST_KEYS = ['objectives', 'benefits', 'steps', 'tools'];
const CAR_STAT_KEYS = ['total', 'on', 'late', 'none'];
const carStrList = v => (Array.isArray(v) ? v.map(x => String(x == null ? '' : x)).filter(x => x.trim()) : []);

function carNormalize(d) {
  d = d || {};
  d.semester = String(d.semester || '1');
  d.year     = String(d.year || String(new Date().getFullYear() + 543));
  d.signDate = String(d.signDate || '');
  CAR_TEXT_KEYS.forEach(k => { d[k] = String(d[k] == null ? '' : d[k]); });
  CAR_LIST_KEYS.forEach(k => { d[k] = carStrList(d[k]); });
  d.stats    = Array.isArray(d.stats)
    ? d.stats.map(r => { const o = {}; CAR_STAT_KEYS.forEach(k => { o[k] = String(r && r[k] != null ? r[k] : ''); }); return o; })
    : [];
  d.status   = d.status || 'draft';
  d.aiCtx    = d.aiCtx && typeof d.aiCtx === 'object' ? d.aiCtx : {};
  d.scoreSel = carNormScoreSel(d.scoreSel); // ข้อมูลคะแนนจากรายวิชาที่เลือกให้ AI ใช้ (null = ไม่ใช้)
  return d;
}

function carBlankDoc() {
  const blank = () => ({ total: '', on: '', late: '', none: '' });
  return carNormalize({ semester: '1', year: String(new Date().getFullYear() + 543), status: 'draft', statsTitle: 'แสดงการส่งงานของนักเรียน', stats: [blank(), blank(), blank(), blank()] });
}

function carDocTitle(d) {
  const term = `ภาคเรียนที่ ${d.semester || '—'} ปีการศึกษา ${d.year || '—'}`;
  return d.title ? `${d.title} · ${term}` : term;
}

// ------------------------------------------------------------------
// ตารางสถิติในฟอร์ม: อ่านค่า · วาดแถว · คำนวณสด
// ------------------------------------------------------------------
function carStatRead(scope) {
  const tbl = (scope || document).querySelector('.car-stat-table');
  if (!tbl || !tbl.tBodies[0]) return null;
  return [...tbl.tBodies[0].rows].map(tr => {
    const o = {};
    CAR_STAT_KEYS.forEach(k => { o[k] = (tr.querySelector(`[data-k="${k}"]`)?.value || '').trim(); });
    return o;
  });
}

function carStatRowHtml(r, i) {
  r = r || {};
  const inp = (k, label) => `<input class="input-sm car-n" data-k="${k}" type="text" inputmode="numeric" maxlength="5" value="${escapeHtml(r[k] || '')}" aria-label="${label}">`;
  const pct = k => `<td class="car-pct" data-p="${k}" data-label="ร้อยละ">–</td>`;
  return `<tr>
    <td class="car-no" data-label="ชิ้นงานที่">${i + 1}</td>
    <td data-label="จำนวนนักเรียน">${inp('total', 'จำนวนนักเรียน')}</td>
    <td data-label="ส่งตามกำหนด (คน)">${inp('on', 'จำนวนนักเรียนส่งตามกำหนด')}</td>${pct('pOn')}
    <td data-label="ส่งช้า (คน)">${inp('late', 'จำนวนนักเรียนส่งช้า')}</td>${pct('pLate')}
    <td data-label="ไม่ส่งงาน (คน)">${inp('none', 'จำนวนนักเรียนไม่ส่งงาน')}</td>${pct('pNone')}
    <td class="car-act"><button type="button" class="btn btn-danger-ghost btn-sm car-del-row" title="ลบแถว" aria-label="ลบแถว">${DOC_ICO_DEL}</button></td>
  </tr>`;
}

// คำนวณร้อยละรายแถว + ค่าเฉลี่ยใหม่ แล้วเขียนลงเซลล์ (เรียกทุกครั้งที่พิมพ์/เพิ่ม/ลบแถว)
function carStatRefresh(scope) {
  scope = scope || document;
  const tbl = scope.querySelector('.car-stat-table');
  const rows = carStatRead(scope);
  if (!tbl || !rows) return;
  const c = carStatCalc(rows);
  [...tbl.tBodies[0].rows].forEach((tr, i) => {
    const r = c.rows[i];
    tr.querySelector('.car-no').textContent = String(i + 1);
    tr.querySelectorAll('.car-pct').forEach(td => {
      const v = r[td.dataset.p];
      td.textContent = r.blank || v === null ? '–' : carFmtPct(v);
    });
  });
  tbl.querySelectorAll('tfoot [data-a]').forEach(td => {
    const k = td.dataset.a, v = c.avg ? c.avg[k] : null;
    td.textContent = v === null || v === undefined ? '' : (k[0] === 'p' ? carFmtPct(v) : carFmtAvg(v));
  });
  const warn = scope.querySelector('#car-stat-warn');
  if (warn) {
    const bad = c.rows.map((r, i) => (r.mismatch ? `ชิ้นงานที่ ${i + 1}: ส่งตามกำหนด + ส่งช้า + ไม่ส่ง = ${carFmtAvg(r.on + r.late + r.none)} แต่จำนวนนักเรียน = ${carFmtAvg(r.total)}` : '')).filter(Boolean);
    warn.textContent = bad.length ? 'ตรวจตัวเลข — ' + bad.join(' · ') : '';
  }
}

// ------------------------------------------------------------------
// Collect form data → state.doc
// ------------------------------------------------------------------
function carCollect() {
  const sys = docSystem();
  if (!document.getElementById('car-form')) return;
  const get = id => (document.getElementById(id)?.value || '').trim();
  const doc = sys.state.doc;

  doc.semester = get('car-semester');
  doc.year     = get('car-year');
  doc.signDate = get('car-signDate');
  CAR_TEXT_KEYS.forEach(k => { if (document.getElementById('car-' + k)) doc[k] = get('car-' + k); });
  CAR_LIST_KEYS.forEach(k => { const v = docLRows(k, false); if (v) doc[k] = v; }); // ไม่มีบล็อกในหน้า = คงค่าเดิม
  const st = carStatRead(document);
  if (st) doc.stats = st.filter(r => CAR_STAT_KEYS.some(k => r[k]));
  if (document.getElementById('car-status')) doc.status = document.getElementById('car-status').value || 'draft';

  // บริบทงานของผู้ช่วย AI — ช่องอยู่ในการ์ดที่ badwork-ai.js ติดให้ · ถ้าไม่มีช่อง (ไม่ได้โหลดไฟล์ AI) คงค่าเดิมไว้
  const ax = sys.config.aiCtx, aiCtx = {};
  Object.entries(ax.maxLen).forEach(([k, n]) => {
    aiCtx[k] = document.getElementById(ax.idPrefix + k) ? get(ax.idPrefix + k).slice(0, n) : (doc.aiCtx?.[k] || '');
  });
  doc.aiCtx = aiCtx;
}

// ------------------------------------------------------------------
// เลือกวิชา/หัวข้อคะแนนจากระบบ → สรุปเป็นตัวเลขรวมให้ AI (อ่านอย่างเดียว ไม่แก้คะแนนในวิชา)
//   โหลด: รายการวิชา → โครงสร้างคะแนน + ห้อง → คะแนนนักเรียน (เฉพาะตอนครูเลือก/กด "คำนวณใหม่") · ผลเก็บใน doc.scoreSel เมื่อกดบันทึกเอกสาร
// ------------------------------------------------------------------
function carCourseBase(courseId) {
  return db.collection('users').doc(AppState.user.uid).collection('courses').doc(courseId);
}

async function carScoreLoadCourses() {
  const snap = await db.collection('users').doc(AppState.user.uid).collection('courses').orderBy('createdAt', 'desc').get();
  return snap.docs.filter(d => !d.data().archived).map(d => {
    const c = d.data();
    return { id: d.id, name: String(c.name || ''), label: `${c.code ? c.code + ' - ' : ''}${c.name || 'ไม่มีชื่อวิชา'}${c.level ? ' (' + c.level + ')' : ''}` };
  });
}

async function carScoreLoadStructure(courseId) {
  const base = carCourseBase(courseId);
  const [aSnap, stDoc, secSnap] = await Promise.all([
    base.collection('assessments').orderBy('order', 'asc').get(),
    base.collection('settings').doc('structure').get(),
    base.collection('sections').get(),
  ]);
  const assessments = aSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const groups = stDoc.exists ? (stDoc.data().groups || []) : [];
  const sections = secSnap.docs.map(d => ({ id: d.id, room: String(d.data().room || '') }));
  sections.sort((a, b) => a.room.localeCompare(b.room, 'th', { numeric: true }));
  return { assessments, groups, sections };
}

// จัดหัวข้อตามลำดับเดียวกับหน้าคะแนน: คะแนนเก็บ (ยังไม่จัดหมวด → แต่ละหมวด) → กลางภาค → ปลายภาค
function carScoreGroups(st) {
  const gi = gid => st.groups.findIndex(g => g.id === gid);
  const collect = st.assessments.filter(a => a.category === 'collect').map((a, i) => ({ a, i }))
    .sort((x, y) => (gi(x.a.groupId) - gi(y.a.groupId)) || (x.i - y.i)).map(x => x.a);
  const mk = (title, list) => ({ title, items: list.map(a => ({ id: a.id, name: String(a.name || '(ไม่มีชื่อ)'), max: Number(a.max) || 0, group: title })) });
  const out = [];
  const loose = collect.filter(a => gi(a.groupId) < 0);
  if (loose.length) out.push(mk('คะแนนเก็บ', loose));
  st.groups.forEach(g => {
    const list = collect.filter(a => a.groupId === g.id);
    if (list.length) out.push(mk(String(g.name || '').trim() || 'หมวดหมู่ (ยังไม่ตั้งชื่อ)', list));
  });
  const mid = st.assessments.filter(a => a.category === 'midterm');
  const fin = st.assessments.filter(a => a.category === 'final');
  if (mid.length) out.push(mk('กลางภาค', mid));
  if (fin.length) out.push(mk('ปลายภาค', fin));
  return out;
}

// เอกสารคะแนนของนักเรียนทุกคนในห้องที่เลือก (คนที่ยังไม่มีเอกสาร = {}) — ไม่อ่านชื่อ/รหัสนักเรียน
async function carScoreLoadRows(courseId, sectionIds) {
  const base = carCourseBase(courseId);
  const rows = [];
  for (const sid of sectionIds) {
    const sec = base.collection('sections').doc(sid);
    const [stu, sc] = await Promise.all([sec.collection('students').get(), sec.collection('scores').get()]);
    const byId = new Map(sc.docs.map(d => [d.id, d.data()]));
    stu.docs.forEach(d => rows.push(byId.get(d.id) || {}));
  }
  return rows;
}

function carScoreOutHtml(sel) {
  if (!sel || !sel.rows.length) return '';
  const e = escapeHtml, f = v => (v === null || v === undefined ? '–' : carFmtAvg(v));
  const tr = (r, cls) => `<tr${cls ? ` class="${cls}"` : ''}>
      <td data-label="หัวข้อ">${e(r.name)}</td><td data-label="คะแนนเต็ม">${f(r.max)}</td><td data-label="มีคะแนน (คน)">${r.n}</td>
      <td data-label="ค่าเฉลี่ย">${f(r.avg)}</td><td data-label="ร้อยละ">${f(r.pct)}</td><td data-label="S.D.">${f(r.sd)}</td>
      <td data-label="ผ่านเกณฑ์ (คน)">${f(r.pass)}</td><td data-label="ร้อยละ">${f(r.pPass)}</td></tr>`;
  const miss = sel.rows.reduce((m, r) => Math.max(m, r.missing), 0);
  const when = sel.at ? new Date(sel.at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '';
  return `<div class="doc-table-wrap"><table class="doc-table doc-table--center car-score-table">
      <thead><tr><th>หัวข้อ</th><th>คะแนน<br>เต็ม</th><th>มีคะแนน<br>(คน)</th><th>ค่าเฉลี่ย</th><th>ร้อยละ</th><th>S.D.</th><th>ผ่านเกณฑ์<br>(คน)</th><th>ร้อยละ</th></tr></thead>
      <tbody>${sel.rows.map(r => tr(r)).join('')}${sel.combined ? tr(sel.combined, 'car-sc-sum') : ''}</tbody>
    </table></div>
    <div class="car-score-meta">${e(sel.courseName)} · ${e(sel.roomLabel || 'ทุกห้อง')} · นักเรียน ${sel.students} คน · เกณฑ์ผ่านร้อยละ ${sel.passPct}${miss ? ` · มีนักเรียนที่ยังไม่มีคะแนนบางหัวข้อ (สูงสุด ${miss} คน — ไม่นับเป็น 0)` : ''}${when ? ` · คำนวณเมื่อ ${e(when)}` : ''}
      <button type="button" class="btn btn-ghost btn-sm car-sc-refresh">คำนวณใหม่</button></div>`;
}

function carScoreUiInit(form) {
  const sys = docSystem();
  const $ = id => form.querySelector('#' + id);
  const elCourse = $('car-sc-course'), elRoom = $('car-sc-room'), elPass = $('car-sc-pass'), elItems = $('car-sc-items'), elOut = $('car-sc-out');
  if (!elCourse) return;
  const doc = sys.state.doc;
  const ui = { seq: 0, timer: null, struct: null, groups: [] };
  const e = escapeHtml;
  const renderOut = () => { elOut.innerHTML = carScoreOutHtml(doc.scoreSel); };

  function renderItems(checked) {
    elItems.innerHTML = ui.groups.map((g, gi) => `<fieldset class="car-sc-grp">
      <legend><label class="car-sc-chk"><input type="checkbox" class="car-sc-all" data-gi="${gi}"> ${e(g.title)} <span class="u-note">(${g.items.length} หัวข้อ)</span></label></legend>
      ${g.items.map(it => `<label class="car-sc-chk"><input type="checkbox" class="car-sc-it" value="${e(it.id)}"${checked.has(it.id) ? ' checked' : ''}> ${e(it.name)} <span class="u-note">/${it.max}</span></label>`).join('')}
    </fieldset>`).join('') || '<div class="u-note">วิชานี้ยังไม่มีโครงสร้างคะแนน — ตั้งค่าที่หน้าวิชา แท็บ “โครงสร้างคะแนน” ก่อน</div>';
    syncAll();
  }
  // ติ๊ก "ทั้งหมวด" ให้ตรงกับหัวข้อในหมวด
  function syncAll() {
    elItems.querySelectorAll('.car-sc-all').forEach(a => {
      const boxes = [...a.closest('fieldset').querySelectorAll('.car-sc-it')];
      const on = boxes.filter(b => b.checked).length;
      a.checked = boxes.length > 0 && on === boxes.length;
      a.indeterminate = on > 0 && on < boxes.length;
    });
  }

  async function loadCourse(courseId, saved) {
    const seq = ++ui.seq;
    elItems.innerHTML = '<div class="u-note">กำลังโหลดโครงสร้างคะแนน…</div>';
    elRoom.disabled = true;
    try {
      const st = await carScoreLoadStructure(courseId);
      if (seq !== ui.seq) return;
      ui.struct = st;
      ui.groups = carScoreGroups(st);
      elRoom.innerHTML = '<option value="">ทุกห้อง</option>' + st.sections.map(s => `<option value="${e(s.id)}">ห้อง ${e(s.room)}</option>`).join('');
      elRoom.value = saved && st.sections.some(s => s.id === saved.sectionId) ? saved.sectionId : '';
      elRoom.disabled = false;
      renderItems(new Set(saved ? saved.ids : []));
    } catch (err) {
      if (seq !== ui.seq) return;
      elItems.innerHTML = `<div class="car-warn">โหลดโครงสร้างคะแนนไม่สำเร็จ: ${e(err.message || err)}</div>`;
    }
  }

  async function recompute() {
    const courseId = elCourse.value;
    if (!courseId) { doc.scoreSel = null; renderOut(); return; }
    if (!ui.struct) return;
    const seq = ++ui.seq;
    const ids = [...elItems.querySelectorAll('.car-sc-it:checked')].map(b => b.value);
    const sectionId = elRoom.value;
    const base = {
      courseId, courseName: elCourse.selectedOptions[0]?.dataset.name || '', sectionId,
      roomLabel: sectionId ? (elRoom.selectedOptions[0]?.textContent || '') : '',
      ids, passPct: Number(elPass.value) || 50,
    };
    if (!ids.length) { doc.scoreSel = carNormScoreSel({ ...base, rows: [] }); renderOut(); return; }
    elOut.innerHTML = '<div class="u-note">กำลังคำนวณ…</div>';
    try {
      const items = ui.groups.flatMap(g => g.items).filter(it => ids.includes(it.id));
      const data = await carScoreLoadRows(courseId, sectionId ? [sectionId] : ui.struct.sections.map(s => s.id));
      if (seq !== ui.seq) return;
      const calc = carScoreCompute(items, data, base.passPct);
      doc.scoreSel = carNormScoreSel({ ...base, passPct: calc.passPct, at: Date.now(), students: calc.students, rows: calc.rows, combined: calc.combined });
      renderOut();
    } catch (err) {
      if (seq === ui.seq) elOut.innerHTML = `<div class="car-warn">คำนวณไม่สำเร็จ: ${e(err.message || err)}</div>`;
    }
  }
  const later = () => { clearTimeout(ui.timer); ui.timer = setTimeout(recompute, 400); };

  elCourse.addEventListener('change', async () => {
    doc.scoreSel = null;
    renderOut();
    elItems.innerHTML = '';
    ui.struct = null;
    elRoom.innerHTML = '<option value="">ทุกห้อง</option>';
    elRoom.disabled = true;
    if (elCourse.value) await loadCourse(elCourse.value, null);
  });
  elRoom.addEventListener('change', later);
  elPass.addEventListener('input', later);
  elItems.addEventListener('change', ev => {
    const all = ev.target.closest('.car-sc-all');
    if (all) all.closest('fieldset').querySelectorAll('.car-sc-it').forEach(b => { b.checked = all.checked; });
    syncAll();
    later();
  });
  elOut.addEventListener('click', ev => { if (ev.target.closest('.car-sc-refresh')) recompute(); });

  // เริ่มต้น: ใส่รายการวิชา · ถ้าเอกสารเคยเลือกไว้ ให้คืนค่าที่เลือก (ตัวเลขที่บันทึกไว้แสดงทันที ไม่ต้องรอโหลด)
  const saved = doc.scoreSel;
  elPass.value = String(saved ? saved.passPct : 50);
  renderOut();
  carScoreLoadCourses().then(courses => {
    if (!document.body.contains(elCourse)) return; // ผู้ใช้ออกจากหน้านี้แล้ว
    const list = courses.slice();
    if (saved && !list.some(c => c.id === saved.courseId)) list.push({ id: saved.courseId, name: saved.courseName, label: (saved.courseName || 'วิชาที่เลือกไว้') + ' (ไม่พบในรายการวิชาปัจจุบัน)' });
    elCourse.innerHTML = '<option value="">— ไม่ใช้ข้อมูลคะแนน —</option>' + list.map(c => `<option value="${e(c.id)}" data-name="${e(c.name)}">${e(c.label)}</option>`).join('');
    if (saved) { elCourse.value = saved.courseId; loadCourse(saved.courseId, saved); }
  }).catch(err => {
    elCourse.innerHTML = '<option value="">โหลดรายการวิชาไม่สำเร็จ</option>';
    console.warn('carScoreLoadCourses', err);
  });
}

// ------------------------------------------------------------------
// LIST VIEW
// ------------------------------------------------------------------
async function carRenderListView() {
  const sys = docSystem();
  const root = docMount();
  const seq = sys.state.seq;
  docShowLoading(root);

  try {
    if (!sys.state.list) sys.state.list = await carLoadList();
    if (docStale(root, seq, sys) || sys.state.tab !== 'form' || sys.state.view !== 'list') return;
    const list = sys.state.list;
    root.innerHTML = docListHtml({
      list, icon: CAR_ICO_DOC, hue: 'pink',
      title: d => carDocTitle(d),
      sub: d => carUpdatedAt(d),
      actions: ['print', 'dup', 'edit', 'del'],
      emptyTitle: 'ยังไม่มี วิจัยในชั้นเรียน',
      emptySub: 'กดปุ่มด้านล่างเพื่อสร้าง วิจัยในชั้นเรียน ฉบับแรก',
      newLabel: 'สร้าง วิจัยในชั้นเรียน ใหม่',
    });
    docSwapIn(root);

    const openEdit = id => {
      const found = list.find(d => d.id === id);
      if (!found) return;
      sys.state.docId = id;
      sys.state.doc = carNormalize(JSON.parse(JSON.stringify(found)));
      sys.state.view = 'form';
      carRenderFormView();
    };
    docBindList(root, {
      create: () => {
        sys.state.doc = carBlankDoc();
        sys.state.docId = null;
        sys.state.view = 'form';
        carRenderFormView();
      },
      open: openEdit,
      edit: openEdit,
      dup: id => {
        const found = list.find(d => d.id === id);
        if (!found) return;
        const d = carNormalize(JSON.parse(JSON.stringify(found)));
        ['id', 'createdAt', 'updatedAt'].forEach(k => { delete d[k]; });
        d.status = 'draft';
        sys.state.docId = null;
        sys.state.doc = d;
        sys.state.view = 'form';
        carRenderFormView();
        showToast('คัดลอกแล้ว — แก้ไขตามต้องการ แล้วกด “บันทึก” จะได้เป็นฉบับใหม่');
      },
      print: id => {
        const found = list.find(d => d.id === id);
        if (!found) return;
        sys.state.docId = id;
        sys.state.doc = carNormalize(JSON.parse(JSON.stringify(found)));
        sys.state.view = 'form'; // ตัวอย่าง/พิมพ์ อ่านจากเอกสารที่เปิดอยู่
        docSwitchTab('preview');
      },
      del: async id => { await carDelete(id); await carRenderListView(); },
    });
  } catch (e) {
    if (!root.isConnected) return;
    docSwapIn(root);
    root.innerHTML = `<div class="doc-error">โหลดรายการไม่สำเร็จ: ${escapeHtml(e.message)}</div>`;
  }
}

// ------------------------------------------------------------------
// FORM VIEW
// ------------------------------------------------------------------
async function carRenderFormView() {
  const sys = docSystem();
  const root = docMount();
  const seq = sys.state.seq;

  const doc = sys.state.doc || carBlankDoc();
  sys.state.doc = doc;

  const esc = escapeHtml;
  const input = (k, label, ph, max = 200) => `<div class="field u-mt-4"><label for="car-${k}">${label}</label>
        <input id="car-${k}" type="text" maxlength="${max}" placeholder="${esc(ph || '')}" value="${esc(doc[k])}">
      </div>`;
  // หัวช่อง = ชื่อซ้าย · แถวปุ่ม AI ขวา (.doc-item-h เหมือน PA / ID-Plan / SAR) — ตัวต่อ js/car-ai.js ฝังปุ่มที่นี่
  const area = (k, label, rows) => `<div class="field u-mt-4"><div class="doc-item-h"><label for="car-${k}">${label}</label></div>
        <textarea id="car-${k}" rows="${rows}">${esc(doc[k])}</textarea>
      </div>`;
  const list = (k, title, ph, add) => docLBlockHtml({ key: k, title, rows: doc[k].length ? doc[k] : [''], hours: false, ph, addLabel: add });
  const statRows = (doc.stats.length ? doc.stats : [{}]).map((r, i) => carStatRowHtml(r, i)).join('');

  root.innerHTML = `
  <div class="pa-form-head">
    <button type="button" class="btn btn-ghost btn-sm" id="car-back-btn">← กลับ</button>
    <div>
      <h2 class="pa-form-title">วิจัยในชั้นเรียน · ${sys.state.docId ? 'แก้ไขเอกสาร' : 'สร้างเอกสารใหม่'}</h2>
      <div class="u-note">รายงานการวิจัยในชั้นเรียน (Classroom Action Research) สำหรับครู</div>
    </div>
  </div>
  <form id="car-form" class="doc-form" autocomplete="off" novalidate>

    <!-- แถบบนฟอร์ม -->
    <div class="doc-form-header">
      <div class="doc-form-meta">
        <label>ภาคเรียนที่
          <select id="car-semester">
            <option value="1"${doc.semester === '1' ? ' selected' : ''}>1</option>
            <option value="2"${doc.semester === '2' ? ' selected' : ''}>2</option>
          </select>
        </label>
        <label>ปีการศึกษา
          <input id="car-year" type="text" inputmode="numeric" maxlength="4" value="${esc(doc.year)}">
        </label>
        <label>วันที่ลงนาม
          <input id="car-signDate" type="text" placeholder="เช่น 8 มิ.ย. 2569" value="${esc(doc.signDate)}">
        </label>
        <label>สถานะ
          <select id="car-status">
            <option value="draft"${(doc.status || 'draft') === 'draft' ? ' selected' : ''}>ร่าง</option>
            <option value="submitted"${doc.status === 'submitted' ? ' selected' : ''}>ส่งแล้ว</option>
          </select>
        </label>
      </div>
    </div>

    <!-- ปกรายงาน -->
    <details class="doc-section doc-fold" open>
      <summary class="doc-fold-h"><h2 class="doc-sec-title">ข้อมูลปกรายงาน <span class="doc-sec-note">(ชื่อ ตำแหน่ง โรงเรียน สังกัด ดึงจาก “ข้อมูลส่วนตัว” อัตโนมัติ)</span></h2></summary>
      <div class="field"><label for="car-title">ชื่อเรื่อง (ต่อจากคำว่า “เรื่อง”)</label>
        <textarea id="car-title" rows="2" maxlength="250" placeholder="เช่น การแก้ปัญหาการส่งงานในรายวิชา… โดยใช้…">${esc(doc.title)}</textarea>
      </div>
      ${input('subject', 'รายวิชา', 'เช่น วิทยาการคำนวณ', 100)}
      ${input('level', 'ระดับชั้นของนักเรียน', 'เช่น มัธยมศึกษาปีที่ 2', 80)}
      ${input('location', 'อำเภอ / จังหวัดของโรงเรียน', 'เช่น อำเภอแหลมสิงห์ จังหวัดจันทบุรี', 120)}
    </details>

    <!-- 1 ความสำคัญและที่มา -->
    <details class="doc-section doc-fold" open>
      <summary class="doc-fold-h"><h2 class="doc-sec-title">1. ความสำคัญและที่มา</h2></summary>
      ${area('background', 'ความสำคัญและที่มาของปัญหา', 9)}
    </details>

    <!-- 2 วัตถุประสงค์ -->
    <details class="doc-section doc-fold" open>
      <summary class="doc-fold-h"><h2 class="doc-sec-title">2. วัตถุประสงค์ในการวิจัย</h2></summary>
      ${list('objectives', 'ข้อวัตถุประสงค์ (ระบบใส่เลขข้อให้เอง)', 'เช่น เพื่อแก้ปัญหาการส่งงานของนักเรียน…', 'เพิ่มวัตถุประสงค์')}
    </details>

    <!-- 3 สมมติฐาน · 4 ขอบเขต -->
    <details class="doc-section doc-fold" open>
      <summary class="doc-fold-h"><h2 class="doc-sec-title">3. สมมติฐานสำหรับการวิจัย</h2></summary>
      ${area('hypothesis', 'สมมติฐาน', 4)}
    </details>
    <details class="doc-section doc-fold" open>
      <summary class="doc-fold-h"><h2 class="doc-sec-title">4. ขอบเขตของการวิจัย</h2></summary>
      ${area('scope', 'ประชากร / กลุ่มเป้าหมาย', 3)}
    </details>

    <!-- 5 ประโยชน์ที่คาดว่าจะได้รับ -->
    <details class="doc-section doc-fold" open>
      <summary class="doc-fold-h"><h2 class="doc-sec-title">5. ประโยชน์ที่คาดว่าจะได้รับ</h2></summary>
      ${list('benefits', 'ข้อประโยชน์ (ระบบใส่เลขข้อให้เอง)', 'เช่น นักเรียนส่งงานทันตามกำหนดเวลา', 'เพิ่มประโยชน์')}
    </details>

    <!-- 6 วิธีดำเนินการวิจัย -->
    <details class="doc-section doc-fold" open>
      <summary class="doc-fold-h"><h2 class="doc-sec-title">6. วิธีดำเนินการวิจัย</h2></summary>
      ${list('steps', 'ขั้นตอนการดำเนินการ (เรียงตามลำดับ)', 'เช่น ศึกษาปัญหาและอุปสรรคที่ทำให้นักเรียนส่งงานช้า', 'เพิ่มขั้นตอน')}
      ${list('tools', 'เครื่องมือที่ใช้ในการวิจัย', 'เช่น แบบประเมินความพึงพอใจ', 'เพิ่มเครื่องมือ')}
    </details>

    <!-- 7 ผลการวิเคราะห์ข้อมูล -->
    <details class="doc-section doc-fold" open>
      <summary class="doc-fold-h"><h2 class="doc-sec-title">7. ผลการวิเคราะห์ข้อมูล</h2></summary>
      <div class="doc-subsec car-score" id="car-score">
        <div class="doc-subsec-hd">ข้อมูลคะแนนผลสัมฤทธิ์จากรายวิชา <span class="doc-sec-note">(ไม่บังคับ · ให้ AI ใช้เขียนผลการวิเคราะห์)</span></div>
        <div class="u-note">เลือกวิชาและหัวข้อคะแนนที่เกี่ยวกับงานวิจัย ระบบสรุปเป็นตัวเลขรวม (ค่าเฉลี่ย ร้อยละ ผู้ผ่านเกณฑ์) ไม่เก็บและไม่ส่งชื่อหรือรหัสนักเรียน · อ่านอย่างเดียว ไม่แก้คะแนนในวิชา</div>
        <div class="car-score-pick">
          <div class="field"><label for="car-sc-course">วิชา</label><select id="car-sc-course"><option value="">กำลังโหลดรายการวิชา…</option></select></div>
          <div class="field"><label for="car-sc-room">ห้อง</label><select id="car-sc-room" disabled><option value="">ทุกห้อง</option></select></div>
          <div class="field"><label for="car-sc-pass">เกณฑ์ผ่าน (ร้อยละ)</label><input id="car-sc-pass" type="text" inputmode="numeric" maxlength="3" value="50"></div>
        </div>
        <div class="car-score-items" id="car-sc-items"></div>
        <div id="car-sc-out" role="status"></div>
      </div>
      ${input('statsTitle', 'ชื่อตารางที่ 1 (ต่อจากคำว่า “ตารางที่ 1”)', 'เช่น แสดงการส่งงานผ่านระบบ… ระดับชั้น…', 200)}
      <div class="doc-subsec-hd u-mt-4">จำนวนนักเรียนที่ส่งงาน (กรอกเป็นจำนวนคน — ร้อยละและค่าเฉลี่ยคำนวณให้เอง)</div>
      <div class="doc-table-wrap">
        <table class="doc-table doc-table--center car-stat-table">
          <thead>
            <tr>
              <th>ชิ้นงานที่</th><th>จำนวน<br>นักเรียน</th>
              <th>ส่งตาม<br>กำหนด (คน)</th><th>ร้อยละ</th>
              <th>ส่งช้า<br>(คน)</th><th>ร้อยละ</th>
              <th>ไม่ส่งงาน<br>(คน)</th><th>ร้อยละ</th><th></th>
            </tr>
          </thead>
          <tbody id="car-stat-body">${statRows}</tbody>
          <tfoot>
            <tr class="car-avg">
              <td data-label="">ค่าเฉลี่ย</td><td data-a="total"></td>
              <td data-a="on"></td><td data-a="pOn"></td>
              <td data-a="late"></td><td data-a="pLate"></td>
              <td data-a="none"></td><td data-a="pNone"></td><td></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div class="car-warn" id="car-stat-warn" role="status"></div>
      <div class="u-mt-4"><button type="button" class="btn btn-ghost btn-sm" id="car-add-row">${DOC_ICO_ADD} เพิ่มชิ้นงาน</button></div>
      ${area('results', 'อธิบายผลจากตาราง', 4)}
      <div class="u-mt-4"><button type="button" class="btn btn-ghost btn-sm" id="car-fill-results">เติมข้อความจากตาราง</button></div>
      ${area('satisfaction', 'ผลความพึงพอใจของนักเรียน (ถ้ามี)', 4)}
    </details>

    <!-- สรุปผล -->
    <details class="doc-section doc-fold" open>
      <summary class="doc-fold-h"><h2 class="doc-sec-title">สรุปผลและอภิปรายผล</h2></summary>
      ${area('conclusion', 'สรุปและอภิปรายผล', 8)}
    </details>

    <div class="pa-form-footer">
      ${sys.state.docId ? `<button type="button" class="btn btn-danger-ghost" id="car-del-btn">${DOC_ICO_DEL} ลบ</button>` : ''}
      <button type="button" class="btn btn-ghost" id="car-cancel-btn">ยกเลิก</button>
      <button type="button" class="btn btn-primary" id="car-save-btn">${CAR_SAVE_LABEL}</button>
    </div>

  </form>`;
  docSwapIn(root);
  const form = document.getElementById('car-form');
  if (typeof badworkAiMount === 'function') badworkAiMount(root, form, sys); // ปุ่มผู้ช่วย AI (js/badwork-ai.js + ตัวต่อ js/car-ai.js) — ไม่มีไฟล์นี้ฟอร์มก็ทำงานตามเดิม

  docLBind(form); // เพิ่ม/ลบแถวของรายการ (วัตถุประสงค์ · ประโยชน์ · ขั้นตอน · เครื่องมือ)
  carScoreUiInit(form); // เลือกวิชา/หัวข้อคะแนนจากระบบให้ AI ใช้ (doc.scoreSel)

  // ตารางสถิติ: คำนวณสดตอนพิมพ์ · เพิ่ม/ลบแถว
  const body = document.getElementById('car-stat-body');
  carStatRefresh(form);
  form.addEventListener('input', e => { if (e.target.classList.contains('car-n')) carStatRefresh(form); });
  document.getElementById('car-add-row')?.addEventListener('click', () => {
    body.insertAdjacentHTML('beforeend', carStatRowHtml({}, body.rows.length));
    carStatRefresh(form);
    body.lastElementChild.querySelector('input')?.focus();
  });
  body.addEventListener('click', e => {
    const del = e.target.closest('.car-del-row');
    if (!del) return;
    del.closest('tr').remove();
    carStatRefresh(form);
  });
  document.getElementById('car-fill-results')?.addEventListener('click', () => {
    const text = carResultsSentence(carStatCalc(carStatRead(form)));
    if (!text) { showToast('กรอกจำนวนนักเรียนในตารางก่อน แล้วค่อยเติมข้อความ'); return; }
    const ta = document.getElementById('car-results');
    ta.value = ta.value.trim() ? ta.value.trim() + '\n' + text : text;
    showToast('เติมข้อความจากตารางแล้ว — ตรวจและแก้สำนวนได้');
  });

  ['car-back-btn', 'car-cancel-btn'].forEach(id => document.getElementById(id)?.addEventListener('click', () => {
    carCollect();
    sys.state.view = 'list';
    carRenderListView();
  }));

  document.getElementById('car-save-btn')?.addEventListener('click', async () => {
    carCollect();
    const btn = document.getElementById('car-save-btn');
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก…';
    try {
      sys.state.doc.status = sys.state.doc.status || 'draft';
      await carSave(sys.state.doc);
      sys.state.list = null; // force reload list
      showToast('บันทึกแล้ว');
    } catch (e) {
      showToast('บันทึกไม่สำเร็จ: ' + e.message, 'error');
    }
    btn.disabled = false;
    btn.textContent = CAR_SAVE_LABEL;
  });

  document.getElementById('car-del-btn')?.addEventListener('click', async () => {
    if (!confirm('ลบ วิจัยในชั้นเรียน นี้?')) return;
    try {
      await carDelete(sys.state.docId);
      sys.state.docId = null;
      sys.state.doc = null;
      sys.state.view = 'list';
      carRenderListView();
    } catch (e) {
      showToast('ลบไม่สำเร็จ: ' + e.message, 'error');
    }
  });
}

// ------------------------------------------------------------------
// PRINT CSS — A4 แนวตั้ง (ขอบ 2/2/2/2.5 ซม. เหมือน ID-Plan หน้าแรก) · ปก 1 หน้า แล้วเนื้อหาต่อเนื่อง
//   ใช้ named page (@page car-port) ให้ตรงกับ CAR_SHEET.port ด้านล่าง
//   ตัวตัดหน้า (docPaginate) ทำงานกับลูกตรงของ <section> ทีละชิ้น → ทุกย่อหน้า/รายการ/ตารางต้องเป็นลูกตรง ไม่ห่อด้วย div
// ------------------------------------------------------------------
const CAR1_CSS = `
@page{size:A4 portrait;margin:2cm 2cm 2cm 2.5cm}
@page car-port{size:A4 portrait;margin:2cm 2cm 2cm 2.5cm}
.car1 .pg-port{page:car-port}
.car1{background:#fff;color:#000;font-family:'TH SarabunPSK','TH Sarabun PSK','THSarabunPSK','TH Sarabun New','THSarabunNew','PA Sarabun','Noto Sans Thai',Tahoma,sans-serif;font-size:16pt;line-height:1.22}
.car1 *{box-sizing:border-box}
.car1 b{font-weight:700}
.car1 .d1-c{text-align:center;font-weight:700}
.car1 .d1-cn{text-align:center}
.car1 .d1-xl{font-size:24pt}
.car1 .d1-cv1{margin-top:3.2cm}
.car1 .d1-cv2{margin-top:1.6cm}
.car1 .d1-cv3{margin-top:4cm}
.car1 .d1-h{font-weight:700;margin-top:.7em;break-after:avoid;page-break-after:avoid}
.car1 .d1-h.d1-h0{margin-top:0}
.car1 .d1-cap{font-weight:400;text-align:center}
.car1 .d1-p{margin-top:.3em;text-indent:1.25cm;overflow-wrap:anywhere}
.car1 .d1-li{margin:.1em 0 0 1.9cm;text-indent:-.9cm;overflow-wrap:anywhere}
.car1 .d1-sub{margin-top:.5em;font-weight:700;break-after:avoid;page-break-after:avoid}
.car1 .d1-sign{margin:2em 2cm 0 auto;width:9cm;text-align:center;break-inside:avoid;page-break-inside:avoid}
.car1 .d1-break{break-before:page;page-break-before:always;height:0}
.car1 .d1-mt3{margin-top:.3em}
.car1 .d1-tb{width:100%;table-layout:fixed;border-collapse:collapse;margin-top:.3em;font-size:14pt;line-height:1.15}
.car1 .d1-tb th,.car1 .d1-tb td{border:1px solid #000;padding:.12em .2em;text-align:center;vertical-align:middle}
.car1 .d1-tb th{font-weight:700}
.car1 .d1-tb .d1-avg td{font-weight:700}
.car1 .d1-w11{width:11%}
.car1 .d1-w13{width:13%}
.car1 .d1-w25{width:25%}
@media screen{
  .car1 .pg-port{padding:.4em 1em}
}
`;

// ------------------------------------------------------------------
// Build preview HTML — ปกรายงาน + หัวข้อ 1–7 + สรุปผล + ลงชื่อผู้รายงาน (ช่องว่าง = จุดไข่ปลาให้เขียนเอง)
// ------------------------------------------------------------------
function carBuildPreviewHtml(d, profile) {
  d = carNormalize(d);
  const pi = carProfileInfo(profile);
  const e = escapeHtml;
  const dots = n => '…'.repeat(n);
  const name = pi.name || dots(20);
  const term = e(d.year);
  const title = d.title.trim() ? e(d.title.trim()) : dots(30);

  // ย่อหน้า: แยกด้วยขึ้นบรรทัดใหม่ · ว่าง = จุดไข่ปลา
  const paras = t => {
    const ls = String(t || '').split('\n').map(x => x.trim()).filter(Boolean);
    return (ls.length ? ls : [dots(40)]).map(x => `<div class="d1-p">${e(x)}</div>`).join('\n');
  };
  const numbered = arr => (arr.length ? arr : [dots(30)]).map((x, i) => `<div class="d1-li">${i + 1}. ${e(x)}</div>`).join('\n');
  const bullets = arr => arr.map(x => `<div class="d1-li">- ${e(x)}</div>`).join('\n');
  const h = (t, first) => `<div class="d1-h${first ? ' d1-h0' : ''}">${t}</div>`;

  // ตารางที่ 1 (ไม่มีแถวที่กรอก = ไม่พิมพ์ตาราง)
  const calc = carStatCalc(d.stats);
  const cnt = n => (n ? carFmtAvg(n) : '-');
  const pc = (n, p) => (!n || p === null ? '-' : carFmtPct(p));
  let table = '';
  if (calc.count) {
    let no = 0;
    const body = calc.rows.filter(r => !r.blank).map(r => `<tr><td>${++no}</td><td>${carFmtAvg(r.total)}</td>`
      + `<td>${cnt(r.on)}</td><td>${pc(r.on, r.pOn)}</td><td>${cnt(r.late)}</td><td>${pc(r.late, r.pLate)}</td><td>${cnt(r.none)}</td><td>${pc(r.none, r.pNone)}</td></tr>`).join('');
    const a = calc.avg;
    const avg = `<tr class="d1-avg"><td>ค่าเฉลี่ย</td><td>${carFmtAvg(a.total)}</td>`
      + `<td>${cnt(a.on)}</td><td>${pc(a.on, a.pOn)}</td><td>${cnt(a.late)}</td><td>${pc(a.late, a.pLate)}</td><td>${cnt(a.none)}</td><td>${pc(a.none, a.pNone)}</td></tr>`;
    table = `<div class="d1-h d1-cap"><b>ตารางที่ 1</b> ${e(d.statsTitle.trim() || 'แสดงการส่งงานของนักเรียน')}</div>
<table class="d1-tb">
  <thead>
    <tr><th rowspan="2" class="d1-w11">ชิ้นงานที่</th><th rowspan="2" class="d1-w13">จำนวนนักเรียน</th><th colspan="2" class="d1-w25">ส่งงานตามกำหนดเวลา</th><th colspan="2" class="d1-w25">ส่งงานช้า</th><th colspan="2" class="d1-w25">ไม่ส่งงาน</th></tr>
    <tr><th>จำนวน</th><th>ร้อยละ</th><th>จำนวน</th><th>ร้อยละ</th><th>จำนวน</th><th>ร้อยละ</th></tr>
  </thead>
  <tbody>${body}${avg}</tbody>
</table>`;
  }

  const cover = [
    `<div class="d1-c d1-xl d1-cv1">วิจัยในชั้นเรียน</div>`,
    `<div class="d1-c">เรื่อง ${title}</div>`,
    `<div class="d1-c">ของนักเรียนระดับชั้น${d.level.trim() ? e(d.level.trim()) : dots(15)}</div>`,
    `<div class="d1-c">ประจำปีการศึกษา ${term}</div>`,
    `<div class="d1-c d1-cv2">ผู้รายงาน</div>`,
    `<div class="d1-cn">${e(name)}</div>`,
    `<div class="d1-cn">ตำแหน่ง ${e(pi.position || dots(10))}</div>`,
    `<div class="d1-cn">${e(pi.school || dots(25))}</div>`,
    `<div class="d1-cn">${d.location.trim() ? e(d.location.trim()) : dots(25)}</div>`,
    `<div class="d1-cn">${e(pi.affiliation || dots(30))}</div>`,
  ].join('\n');

  const parts = [
    cover,
    `<div class="d1-break"></div>`,
    `<div class="d1-c">การวิจัยในชั้นเรียน</div>`,
    `<div class="d1-c">เรื่อง ${title}</div>`,
    `<div class="d1-c">ของนักเรียนระดับชั้น${d.level.trim() ? e(d.level.trim()) : dots(15)}</div>`,
    h('1. ความสำคัญและที่มา'), paras(d.background),
    h('2. วัตถุประสงค์ในการวิจัย'), numbered(d.objectives),
    h('3. สมมติฐานสำหรับการวิจัย'), paras(d.hypothesis),
    h('4. ขอบเขตของการวิจัย'), paras(d.scope),
    h('5. ประโยชน์ที่คาดว่าจะได้รับ'), numbered(d.benefits),
    h('6. วิธีดำเนินการวิจัย'), numbered(d.steps),
  ];
  if (d.tools.length) parts.push(`<div class="d1-sub">เครื่องมือที่ใช้ในการวิจัย</div>`, bullets(d.tools));
  parts.push(h('7. ผลการวิเคราะห์ข้อมูล'));
  if (table) parts.push(table);
  if (d.results.trim() || !table) parts.push(paras(d.results));
  if (d.satisfaction.trim()) parts.push(paras(d.satisfaction));
  parts.push(h('สรุปผล'), paras(d.conclusion));
  parts.push(`<div class="d1-sign">
    <div>ผู้รายงาน</div>
    <div>(${e(name)})</div>${pi.position ? `
    <div class="d1-mt3">ตำแหน่ง ${e(pi.position)}</div>` : ''}${d.signDate ? `
    <div class="d1-mt3">วันที่ ${e(d.signDate)}</div>` : ''}
  </div>`);

  return docSheetsHtml(CAR1_CSS, `<div class="car1">

<section class="pg-port">
${parts.join('\n')}
</section>

</div>`);
}

// ------------------------------------------------------------------
// PREVIEW VIEW — แผ่นกระดาษ A4 เหมือนตอนพิมพ์ (ชุดเดียวกับ PA/ID-Plan — docRenderPreview({ sheets }))
//   อ่านจากเอกสารที่เปิดอยู่ (รวมฉบับที่ยังไม่บันทึก) · เลือกดูฉบับอื่นที่บันทึกไว้ได้จากรายการด้านบน
// ------------------------------------------------------------------
const CAR_SHEET = {
  port: { w: 210, h: 297, pad: [20, 20, 20, 25], label: 'A4 แนวตั้ง' }, // mm [บน, ขวา, ล่าง, ซ้าย] — ต้องตรงกับ @page car-port
};

async function carRenderPreviewView(pickId) {
  const sys = docSystem();
  return docRenderPreview({ // โครงกลางใน js/doc-shell.js (แถบเลือก · ปุ่ม · สถานะว่าง · แผ่นกระดาษตัดหน้า)
    sys, tab: 'preview',
    load: async () => {
      const open = sys.state.doc && sys.state.view === 'form' ? sys.state.doc : null;
      let list = [];
      try { list = await carLoadList(); } catch (e) { /* โหลดรายการไม่ได้ → ดูได้เฉพาะเอกสารที่เปิดอยู่ */ }
      // รายการให้เลือก: เอกสารที่เปิดอยู่มาก่อน (ฉบับที่ยังไม่บันทึกก็ดูได้) ตามด้วยที่บันทึกไว้
      const openKey = open ? (sys.state.docId || '__open__') : null;
      const items = [];
      if (open) items.push({ id: openKey, label: `${carDocTitle(open)} · ${sys.state.docId ? 'กำลังแก้ไข' : 'ฉบับที่ยังไม่บันทึก'}` });
      list.filter(x => x.id !== openKey).forEach(x => items.push({ id: x.id, label: carDocTitle(x) }));
      if (!items.length) return { items };
      const pid = items.some(x => x.id === pickId) ? pickId : items[0].id;
      const d = pid === openKey ? open : carNormalize(JSON.parse(JSON.stringify(list.find(x => x.id === pid))));
      const profile = await carGetProfile(); // อ่านล่าสุดทุกครั้งที่เปิดตัวอย่าง — แก้ข้อมูลส่วนตัวแล้วพิมพ์ได้เลย
      return { items, pickId: pid, d, open, openKey, profile };
    },
    selectLabel: 'เลือกเอกสาร',
    empty: { icon: CAR_ICO_DOC, title: 'ยังไม่มี วิจัยในชั้นเรียน', sub: 'สร้างเอกสารก่อน แล้วดูตัวอย่างและพิมพ์ที่นี่', gotoLabel: 'ไปที่แบบฟอร์ม', gotoTab: 'form' },
    hint: () => 'กดพิมพ์แล้วเลือก "บันทึกเป็น PDF" ในหน้าต่างพิมพ์ได้ · ใช้ Chrome/Edge จะแบ่งหน้าได้ถูกต้องที่สุด',
    sheets: ctx => ({ // แผ่นกระดาษตัดโดยโครงกลาง (docPaginate)
      html: () => carBuildPreviewHtml(ctx.d, ctx.profile),
      specs: CAR_SHEET, bodyClass: 'car1', keep: '.d1-h', breakSel: '.d1-break',
      kindOf: () => 'port',
      fonts: [...DOC_FONT_SPECS, "13pt 'PA Sarabun'"],
    }),
    onPick: id => carRenderPreviewView(id),
    onEdit: ctx => {
      if (ctx.pickId !== ctx.openKey) { // เปิดฉบับอื่นมาแก้ → แทนที่ฉบับที่เปิดอยู่ (ส่วนที่ยังไม่บันทึกจะหาย)
        if (ctx.open && !confirm('เปิดเอกสารนี้เพื่อแก้ไข? ส่วนที่แก้ในฉบับที่เปิดอยู่และยังไม่ได้บันทึกจะหายไป')) return;
        sys.state.docId = ctx.pickId;
        sys.state.doc = ctx.d;
        sys.state.view = 'form';
      }
      docSwitchTab('form');
    },
    onPrint: (ctx, view) => {
      const frame = view.querySelector('.doc-preview-frame');
      frame?.contentWindow?.focus();
      frame?.contentWindow?.print();
    },
  });
}

// ------------------------------------------------------------------
// ลงทะเบียน UI ของระบบ วิจัยในชั้นเรียน
// ------------------------------------------------------------------
registerDocUi('car', {
  tabs: {
    preview: () => carRenderPreviewView(),
    default: sys => sys.state.view === 'form' ? carRenderFormView() : carRenderListView(),
  },
  beforeLeave(sys) {
    if (sys.state.tab === 'form' && sys.state.view === 'form') carCollect();
  },
});
