// ==========================================================================
// SAR — แท็บ "Self-Assessment Report" ในหน้า ID-Plan (รายงานผลการปฏิบัติงานและการประเมินตนเองรายบุคคล)
//   อยู่ในระบบเอกสาร 'idp' (แท็บ 'sar' ใน IDP_CONFIG.tabs) · เก็บที่ users/{uid}/idp_sar (IDP_CONFIG.collections.sar)
//   โหลดหลัง idp.js (LAZY_BUNDLES.idp) — ใช้ idpGetProfile / idpProfileInfo / idpPullTimetable จาก idp.js
//   โครงเอกสาร: { semester, year, status, f:{ช่องเดี่ยว}, rows:{ตารางแถวซ้ำ}, lv:{ระดับคุณภาพรายข้อ} }
//   ค่าที่คำนวณ (เกรดเฉลี่ย · ร้อยละ · คะแนนมาตรฐาน · ระดับคุณภาพ) ไม่เก็บ — คำนวณสดจาก sarStats(d) ทั้งหน้าจอและตอนพิมพ์
// ==========================================================================

const SAR = { view: 'list', docId: null, doc: null, list: null };

// ระดับคุณภาพตามคะแนนเฉลี่ย [ขั้นต่ำ, ป้าย] — แก้เกณฑ์ที่ตรงนี้ที่เดียว
const SAR_LV = {
  std:    [[4.51, 'ยอดเยี่ยม'], [3.51, 'ดีเลิศ'], [2.51, 'ดี'], [1.51, 'ปานกลาง'], [0, 'กำลังพัฒนา']],
  survey: [[4.51, 'มากที่สุด'], [3.51, 'มาก'], [2.51, 'ปานกลาง'], [1.51, 'น้อย'], [0, 'น้อยที่สุด']],
  plan:   [[3.5, 'ดีมาก'], [2.5, 'ดี'], [1.5, 'ปานกลาง'], [0, 'ปรับปรุง']],
};
const sarLabel = (kind, avg) => avg > 0 ? SAR_LV[kind].find(([min]) => avg >= min - 1e-9)[1] : '—';

const SAR_METHODS = ['การอธิบาย', 'การศึกษาค้นคว้าด้วยตนเอง', 'การสาธิต / ทดลอง', 'กลุ่มสืบค้นความรู้', 'การใช้เกมประกอบ', 'กลุ่มสัมพันธ์', 'บทบาทสมมุติ', 'การเรียนรู้แบบร่วมมือ', 'คอมพิวเตอร์ช่วยสอน', 'ความคิดรวบยอด', 'การถามตอบ', 'โปรแกรมสำเร็จรูป', 'การแก้ปัญหา', 'การพัฒนากระบวนการคิด'];
const SAR_COND = ['ตรงตามวุฒิ/สาขาวิชาที่จบการศึกษา', 'ตรงตามความถนัด', 'ตรงตามประสบการณ์การสอน', 'ตรงกับความรู้ความสามารถ', 'ตรงกับความต้องการ/ความสนใจ'];
const SAR_SURVEY = ['ครูแจ้งผลการเรียนรู้ให้นักเรียนทราบอย่างชัดเจน', 'ครูจัดกิจกรรมการเรียนรู้สนุกและน่าสนใจ', 'เนื้อหาที่สอนทันสมัยเสมอ', 'ครูใช้สื่อประกอบการเรียนการสอนที่เหมาะสมและหลากหลาย', 'ครูใช้คำถามซักถามนักเรียนบ่อย ๆ', 'ครูประยุกต์สาระที่สอนเข้ากับเหตุการณ์ปัจจุบัน/สภาพแวดล้อม', 'ครูส่งเสริมนักเรียนได้ฝึกปฏิบัติจริง มีการจัดการ และการแก้ปัญหา', 'ครูให้นักเรียนฝึกกระบวนการคิด คิดวิเคราะห์ คิดสร้างสรรค์', 'ครูส่งเสริมให้นักเรียนทำงานร่วมกันทั้งเป็นกลุ่มและรายบุคคล', 'ครูให้นักเรียนแสวงหาความรู้จากแหล่งเรียนรู้ต่าง ๆ', 'ครูมีการเสริมแรงให้นักเรียนที่ร่วมกิจกรรมการเรียนการสอน', 'ครูเปิดโอกาสให้นักเรียนซักถามปัญหา', 'ครูคอยกระตุ้นให้นักเรียนตื่นตัวในการเรียนเสมอ', 'ครูสอดแทรกคุณธรรมและค่านิยม 12 ประการในวิชาที่สอน', 'ครูยอมรับความคิดเห็นของนักเรียนที่ต่างไปจากครู', 'นักเรียนมีส่วนร่วมในการวัดและประเมินผลการเรียน', 'ครูมีการประเมินผลการเรียนด้วยวิธีการที่หลากหลายและยุติธรรม', 'ครูมีความตั้งใจในการจัดกิจกรรมการเรียนการสอน', 'บุคลิกภาพ การแต่งกายและการพูดจาของครูเหมาะสม', 'ครูเข้าสอนและออกชั้นเรียนตรงตามเวลา'];
const SAR_PLAN = ['การวิเคราะห์มาตรฐานฯ และตัวชี้วัด/ผลการเรียนรู้', 'การออกแบบกิจกรรมการเรียนรู้', 'การออกแบบปฏิสัมพันธ์', 'การออกแบบประเมินผล', 'การใช้สื่ออุปกรณ์การเรียนรู้'];
const SAR_STD = [
  ['มาตรฐานที่ 1 คุณภาพของผู้เรียน', [
    '1.1 (1) มีความสามารถในการอ่าน การเขียน การสื่อสารและการคิดคำนวณ', '1.1 (2) มีความสามารถในการคิดวิเคราะห์ คิดอย่างมีวิจารณญาณ อภิปรายแลกเปลี่ยนความคิดเห็น และแก้ปัญหา', '1.1 (3) มีความสามารถในการสร้างนวัตกรรม', '1.1 (4) มีความสามารถในการใช้เทคโนโลยีสารสนเทศ และการสื่อสาร', '1.1 (5) มีผลสัมฤทธิ์ทางการเรียนตามหลักสูตรสถานศึกษา', '1.1 (6) มีความรู้ทักษะพื้นฐาน และเจตคติที่ดีต่องานอาชีพ',
    '1.2 (1) การมีคุณลักษณะและค่านิยมที่ดีตามที่สถานศึกษากำหนด', '1.2 (2) ความภูมิใจในท้องถิ่นและความเป็นไทย', '1.2 (3) การยอมรับที่จะอยู่ร่วมกันบนความแตกต่างและหลากหลาย', '1.2 (4) สุขภาวะทางร่างกาย และจิตสังคม']],
  ['มาตรฐานที่ 2 กระบวนการบริหารและการจัดการ', [
    '2.1 มีเป้าหมายวิสัยทัศน์และพันธกิจที่สถานศึกษากำหนดชัดเจน', '2.2 มีระบบบริหารจัดการคุณภาพของสถานศึกษา', '2.3 ดำเนินงานพัฒนาวิชาการที่เน้นคุณภาพผู้เรียนรอบด้าน ตามหลักสูตรสถานศึกษา และทุกกลุ่มเป้าหมาย', '2.4 พัฒนาครูและบุคลากรให้มีความเชี่ยวชาญทางวิชาชีพ', '2.5 จัดสภาพแวดล้อมทางกายภาพและสังคมที่เอื้อต่อการจัดการเรียนรู้อย่างมีคุณภาพ', '2.6 จัดระบบเทคโนโลยีสารสนเทศเพื่อสนับสนุนการบริหารจัดการและการจัดการเรียนรู้']],
  ['มาตรฐานที่ 3 กระบวนการจัดการเรียนการสอนที่เน้นผู้เรียนเป็นสำคัญ', [
    '3.1 จัดการเรียนรู้ผ่านกระบวนการคิดและปฏิบัติจริง และสามารถนำไปประยุกต์ใช้ในชีวิตได้', '3.2 ใช้สื่อ เทคโนโลยีสารสนเทศ และแหล่งเรียนรู้ที่เอื้อต่อการเรียนรู้', '3.3 มีการบริหารจัดการชั้นเรียนเชิงบวก', '3.4 ตรวจสอบและประเมินผู้เรียนอย่างเป็นระบบ และนำผลมาพัฒนาผู้เรียน', '3.5 มีการแลกเปลี่ยนเรียนรู้และให้ข้อมูลสะท้อนกลับ เพื่อพัฒนาและปรับปรุงการจัดการเรียนรู้']],
];
const SAR_DUTY = ['5.1 กลุ่มบริหารวิชาการ', '5.2 กลุ่มบริหารงานพัฒนานักเรียน', '5.3 กลุ่มบริหารทั่วไป', '5.4 กลุ่มบริหารบุคคล', '5.5 กลุ่มบริหารงบประมาณ'];
const SAR_NARR = [['n11', '1.1 การสร้างและ/หรือพัฒนาหลักสูตร'], ['n12', '1.2 การจัดการเรียนรู้ (ออกแบบหน่วยการเรียนรู้ · แผนการจัดการเรียนรู้ · กลยุทธ์)'], ['n13', '1.3 การสร้างและ/หรือพัฒนาสื่อ นวัตกรรม เทคโนโลยี และแหล่งเรียนรู้'], ['n14', '1.4 การวัดและประเมินผลการเรียนรู้'], ['n15', '1.5 ศึกษา วิเคราะห์ สังเคราะห์ และ/หรือวิจัย เพื่อแก้ปัญหาหรือพัฒนาการเรียนรู้'], ['n21', '2.1 การบริหารจัดการชั้นเรียน และการจัดทำข้อมูลสารสนเทศ'], ['n22', '2.2 การจัดระบบดูแลช่วยเหลือนักเรียน'], ['guide', '6. แนวทางการพัฒนาคุณภาพผู้เรียน (ในภาคเรียนต่อไป)']];

// ตารางแถวซ้ำ: [รหัสช่อง, หัวคอลัมน์]
const SAR_ROWS = {
  teaching:   [['name', 'รายวิชาที่สอน'], ['room', 'ห้อง'], ['n', 'จำนวนนักเรียน'], ['hours', 'ชม./สัปดาห์']],
  activities: [['name', 'กิจกรรมพัฒนาผู้เรียน'], ['room', 'ห้อง/กลุ่ม'], ['n', 'จำนวนนักเรียน'], ['hours', 'ชม./สัปดาห์']],
  grades:     [['name', 'วิชา'], ['room', 'ห้อง'], ['n', 'N'], ['g4', '4'], ['g35', '3.5'], ['g3', '3'], ['g25', '2.5'], ['g2', '2'], ['g15', '1.5'], ['g1', '1'], ['g0', '0'], ['r', 'ร'], ['ms', 'มส.']],
  traits:     [['room', 'ชั้น/ห้อง'], ['n', 'จำนวนนักเรียน'], ['g3', 'ดีเยี่ยม'], ['g2', 'ดี'], ['g1', 'ผ่าน'], ['g0', 'ไม่ผ่าน']],
  training:   [['date', 'วัน เดือน ปี'], ['topic', 'เรื่องที่รับการอบรม/พัฒนา'], ['place', 'สถานที่'], ['org', 'หน่วยงานที่จัด'], ['hours', 'ชั่วโมง']],
  awards:     [['date', 'วัน/เดือน/ปี'], ['title', 'รางวัล/เกียรติคุณ'], ['org', 'หน่วยงานที่มอบ'], ['evidence', 'หลักฐาน']],
  duty:       [['name', 'งานที่ปฏิบัติ']],
};
const sarCols = key => SAR_ROWS[key] || SAR_ROWS.duty; // duty0..duty4 ใช้คอลัมน์ชุดเดียวกัน
const SAR_G = [['g4', 4], ['g35', 3.5], ['g3', 3], ['g25', 2.5], ['g2', 2], ['g15', 1.5], ['g1', 1], ['g0', 0]];

const sarEsc = s => escapeHtml(String(s ?? ''));
const sarNum = v => Number(String(v ?? '').replace(/,/g, '')) || 0;
const sarFmt = (n, d = 2) => (Math.round(n * 10 ** d) / 10 ** d).toFixed(d);
function sarGet(o, path) { return path.split('.').reduce((a, k) => (a == null ? a : a[k]), o); }
function sarSet(o, path, v) { const p = path.split('.'); const last = p.pop(); p.reduce((a, k) => (a[k] = a[k] && typeof a[k] === 'object' ? a[k] : {}), o)[last] = v; }

// ---------------- ข้อมูล ----------------
const sarCol = uid => docSystem('idp').col('sar', uid);
async function sarLoadList() {
  const uid = AppState.user?.uid;
  if (!uid) return [];
  const snap = await sarCol(uid).orderBy('createdAt', 'desc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function sarSave(data) {
  const uid = AppState.user?.uid;
  if (!uid) throw new Error('ยังไม่ได้เข้าสู่ระบบ');
  const now = firebase.firestore.FieldValue.serverTimestamp();
  const { id: _i, createdAt: _c, updatedAt: _u, ...clean } = data;
  if (SAR.docId) { await sarCol(uid).doc(SAR.docId).update({ ...clean, updatedAt: now }); return SAR.docId; }
  const ref = await sarCol(uid).add({ ...clean, createdAt: now, updatedAt: now });
  SAR.docId = ref.id;
  return ref.id;
}
function sarNormalize(d) {
  d = d || {};
  d.semester = String(d.semester || '1');
  d.year = String(d.year || new Date().getFullYear() + 543);
  d.status = d.status || 'draft';
  d.f = d.f && typeof d.f === 'object' ? d.f : {};
  d.rows = d.rows && typeof d.rows === 'object' ? d.rows : {};
  d.lv = d.lv && typeof d.lv === 'object' ? d.lv : {};
  return d;
}
const sarTitle = d => `SAR ภาคเรียนที่ ${d.semester || '—'} ปีการศึกษา ${d.year || '—'}`;

// ---------------- คำนวณ (ใช้ทั้งหน้าจอและตอนพิมพ์) ----------------
function sarStats(d) {
  const R = d.rows || {}, L = d.lv || {};
  const sum = (a, k) => (a || []).reduce((s, r) => s + sarNum(r[k]), 0);
  const gs = r => {
    const c = SAR_G.reduce((s, [k]) => s + sarNum(r[k]), 0);
    const fx = SAR_G.reduce((s, [k, w]) => s + sarNum(r[k]) * w, 0);
    return { c, all: c + sarNum(r.r) + sarNum(r.ms), avg: c ? fx / c : 0 };
  };
  const tot = {};
  [...SAR_G.map(g => g[0]), 'r', 'ms', 'n'].forEach(k => { tot[k] = sum(R.grades, k); });
  const gt = gs(tot), pct = n => (gt.all ? (n / gt.all) * 100 : 0);
  const avgOf = a => { const v = (a || []).filter(Boolean); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0; };
  const sv = avgOf(L.survey), pl = avgOf(L.plan);
  return {
    teachHours: sum(R.teaching, 'hours'), teachN: sum(R.teaching, 'n'),
    rowG: (R.grades || []).map(gs), gradeTot: tot, gt,
    pHigh: pct(tot.g4 + tot.g35 + tot.g3), pMid: pct(tot.g25 + tot.g2 + tot.g15 + tot.g1), pLow: pct(tot.g0 + tot.r + tot.ms),
    traitN: sum(R.traits, 'n'), trainHours: sum(R.training, 'hours'),
    methodN: Object.values(d.f.m || {}).filter(Boolean).length,
    homeN: sarNum(d.f.hmM) + sarNum(d.f.hmF),
    sv, svLabel: sarLabel('survey', sv), pl, plLabel: sarLabel('plan', pl),
    std: SAR_STD.map(([, items], i) => {
      const v = (L['std' + i] || []).slice(0, items.length).filter(Boolean), s = v.reduce((a, b) => a + b, 0);
      const avg = v.length ? s / v.length : 0;
      return { sum: s, answered: v.length, total: items.length, avg, label: sarLabel('std', avg) };
    }),
  };
}

// ---------------- ฟอร์ม ----------------
const sarIn = (path, v, ph = '', extra = '') => `<input class="input-sm" data-f="${path}" value="${sarEsc(v)}" placeholder="${sarEsc(ph)}" ${extra}>`;
const sarFld = (label, html) => `<label class="field"><span>${label}</span>${html}</label>`;

function sarRowHtml(key, row = {}) {
  const cols = sarCols(key);
  return `<tr>${cols.map(([c, label]) => `<td data-label="${sarEsc(label)}"><input class="input-sm" data-c="${c}" value="${sarEsc(row[c])}"></td>`).join('')}${key === 'grades' ? '<td data-label="เฉลี่ย / ตรวจสอบ" class="sar-rowcalc"></td>' : ''}<td><button type="button" class="btn btn-danger-ghost btn-sm sar-del" aria-label="ลบแถว">${DOC_ICO_DEL}</button></td></tr>`;
}
function sarTable(key, title, addLabel, extraHead = '') {
  const rows = SAR.doc.rows[key]?.length ? SAR.doc.rows[key] : [{}];
  return `<div class="doc-subsec"><div class="doc-subsec-hd">${title}</div>
    <div class="idp-table-wrap"><table class="idp-comp-table"><thead><tr>${sarCols(key).map(c => `<th>${sarEsc(c[1])}</th>`).join('')}${extraHead}<th></th></tr></thead>
    <tbody data-rows="${key}">${rows.map(r => sarRowHtml(key, r)).join('')}</tbody></table></div>
    <div class="u-mt-4"><button type="button" class="btn btn-ghost btn-sm" data-add="${key}">${DOC_ICO_ADD} ${addLabel}</button></div></div>`;
}
function sarMatrix(group, items, levels, heads) {
  const cur = SAR.doc.lv[group] || [];
  return `<div class="idp-table-wrap"><table class="idp-comp-table"><thead><tr><th>รายการ</th>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>
    ${items.map((t, i) => `<tr><td data-label="รายการ">${sarEsc(t)}</td>${levels.map((lv, j) => `<td data-label="${heads[j]}"><input type="radio" name="lv-${group}-${i}" data-lv="${group}" data-i="${i}" value="${lv}"${cur[i] === lv ? ' checked' : ''}></td>`).join('')}</tr>`).join('')}
    </tbody></table></div>`;
}

function sarCollect() {
  const form = document.getElementById('sar-form');
  if (!form || !SAR.doc) return;
  const d = SAR.doc;
  d.semester = form.querySelector('#sar-semester')?.value || d.semester;
  d.year = (form.querySelector('#sar-year')?.value || '').trim() || d.year;
  d.status = form.querySelector('#sar-status')?.value || d.status;
  form.querySelectorAll('[data-f]').forEach(el => sarSet(d.f, el.dataset.f, el.type === 'checkbox' ? el.checked : el.value.trim()));
  form.querySelectorAll('tbody[data-rows]').forEach(tb => {
    d.rows[tb.dataset.rows] = [...tb.rows].map(tr => Object.fromEntries([...tr.querySelectorAll('[data-c]')].map(i => [i.dataset.c, i.value.trim()])));
  });
  const lv = {};
  form.querySelectorAll('input[data-lv]:checked').forEach(r => { (lv[r.dataset.lv] = lv[r.dataset.lv] || [])[Number(r.dataset.i)] = Number(r.value); });
  Object.keys(lv).forEach(g => { lv[g] = Array.from(lv[g], v => v || 0); });
  d.lv = lv;
}

function sarCalc() {
  const d = SAR.doc, s = sarStats(d), $ = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
  $('sar-t-sum', `รวม ${sarFmt(s.teachHours, 1)} ชม./สัปดาห์ · นักเรียน ${s.teachN} คน (นับซ้ำตามรายวิชา)`);
  $('sar-hm-n', `รวม ${s.homeN} คน`);
  $('sar-m-n', `จำนวนรูปแบบ/วิธีที่ใช้: ${s.methodN} วิธี`);
  $('sar-tr-n', `รวม ${s.traitN} คน`);
  $('sar-tn-h', `รวม ${sarFmt(s.trainHours, 1)} ชั่วโมง`);
  $('sar-g-res', s.gt.all ? `เฉลี่ย ${sarFmt(s.gt.avg)} · ผลการเรียน 3 ขึ้นไป ${sarFmt(s.pHigh)}% · 1–2.5 ${sarFmt(s.pMid)}% · 0/ร/มส ${sarFmt(s.pLow)}% (รวม ${s.gt.all} คน)` : 'กรอกจำนวนนักเรียนตามผลการเรียน ระบบคำนวณค่าเฉลี่ยและร้อยละให้');
  $('sar-sv-res', s.sv ? `ค่าเฉลี่ย ${sarFmt(s.sv)} → ระดับ ${s.svLabel}` : '');
  $('sar-pl-res', s.pl ? `ค่าเฉลี่ย ${sarFmt(s.pl)} → ระดับคุณภาพ ${s.plLabel}` : '');
  s.std.forEach((x, i) => $('sar-std-' + i, x.answered ? `คะแนนรวม ${x.sum} ÷ ${x.answered} ตัวบ่งชี้ = ${sarFmt(x.avg)} → ${x.label}${x.answered < x.total ? ` (ตอบ ${x.answered}/${x.total} ข้อ)` : ''}` : ''));
  document.querySelectorAll('#sar-form tbody[data-rows="grades"] tr').forEach((tr, i) => {
    const g = s.rowG[i], n = sarNum(d.rows.grades?.[i]?.n), cell = tr.querySelector('.sar-rowcalc');
    if (g && cell) cell.textContent = g.all ? `${sarFmt(g.avg)}${g.all !== n ? ` ⚠ รวม ${g.all} ≠ N ${n}` : ''}` : '';
  });
}

// วิชาที่เป็นกิจกรรมพัฒนาผู้เรียน (ไม่ใช่รายวิชา): รหัสขึ้นต้น ก หรือชื่อเข้าข่าย — ผิดก็แก้ย้ายเองในฟอร์มได้
const sarIsActivity = c => /^ก/.test(String(c.code || '').trim()) || /ชุมนุม|กิจกรรม|ลูกเสือ|เนตรนารี|แนะแนว|โฮมรูม|ผู้บำเพ็ญ|สวดมนต์/.test(c.name || '');
// ดึงจากรายวิชา/ห้อง/คะแนน/เกรดของภาคเรียน+ปีนั้น (loadCoursesWithGrades ใน dashboard.js ใช้แคชเดียวกับหน้าแรก)
async function sarPullCourses(d) {
  const { courses } = await loadCoursesWithGrades();
  const yr = String(d.year).trim(), sm = String(d.semester).trim();
  const mine = courses.filter(c => String(c.year || '').trim() === yr && String(c.semester || '').trim() === sm);
  if (!mine.length) return { found: 0 };
  let tt = { subjects: [], activities: [] };
  try { tt = await idpPullTimetable({ type: 'term', year: d.year, sem: d.semester }); } catch (e) { /* ไม่มีตารางสอน → เว้นชั่วโมงให้กรอกเอง */ }
  // หาชั่วโมงจากตารางสอน · ถ้าไม่พบ → คำนวณจากหน่วยกิต (0.5 หน่วยกิต = 1 ชม./สัปดาห์)
  const hoursOf = (c, list) => {
    const h = (list || []).find(x => (c.code && x.name.includes(c.code)) || x.name.includes(c.name));
    if (h) return String(h.hours);
    const cr = Number(c.credit);
    return cr > 0 ? String(cr * 2) : '';
  };
  const rows = { teaching: [], activities: [], grades: [] };
  let noScore = 0;
  mine.forEach(c => {
    const act = sarIsActivity(c), title = [c.code, c.name].filter(Boolean).join(' ');
    (c.roomsData || []).forEach(rm => {
      const g = gradeSummaryCounts(rm.students); // N + จำนวนตามเกรด (นับเฉพาะคนที่มีคะแนนแล้ว)
      const base = { name: title, room: rm.room || '', n: String(g.N) };
      if (act) { rows.activities.push({ ...base, hours: hoursOf(c, tt.activities) }); return; }
      rows.teaching.push({ ...base, hours: hoursOf(c, tt.subjects) });
      if (!g.n) noScore++;
      const gr = { ...base };
      ['g4', 'g35', 'g3', 'g25', 'g2', 'g15', 'g1', 'g0'].forEach((k, i) => { gr[k] = g.counts[i] ? String(g.counts[i]) : ''; });
      rows.grades.push(gr);
    });
  });
  Object.assign(d.rows, rows);
  return { found: mine.length, teach: rows.teaching.length, act: rows.activities.length, noScore };
}

async function sarRenderFormView() {
  const sys = docSystem(), root = docMount(), seq = sys.state.seq;
  const stillHere = () => !docStale(root, seq, sys) && sys.state.tab === 'sar' && SAR.view === 'form';
  const d = SAR.doc = sarNormalize(SAR.doc);
  const prof = AppState.teacherProfile || await idpGetProfile();
  if (!stillHere()) return;
  const pi = idpProfileInfo(prof), f = d.f;
  const sec = (t, body) => `<section class="doc-section"><h2 class="doc-sec-title">${t}</h2>${body}</section>`;
  const num = (label, path) => sarFld(label, sarIn(path, sarGet(d.f, path), '', 'inputmode="decimal"'));
  const lv5 = [5, 4, 3, 2, 1];

  root.innerHTML = `
  <div class="pa-form-head">
    <button type="button" class="btn btn-ghost btn-sm" id="sar-back-btn">← กลับ</button>
    <div><h2 class="pa-form-title">SAR · ${SAR.docId ? 'แก้ไขรายงาน' : 'สร้างรายงานใหม่'}</h2>
    <div class="u-note">รายงานผลการปฏิบัติงานและการประเมินตนเองรายบุคคล (Self-Assessment Report)</div></div>
  </div>
  <form id="sar-form" class="doc-form" autocomplete="off" novalidate>
    <div class="doc-form-header"><div class="doc-form-meta">
      <label>ภาคเรียนที่ <select id="sar-semester"><option value="1"${d.semester === '1' ? ' selected' : ''}>1</option><option value="2"${d.semester === '2' ? ' selected' : ''}>2</option></select></label>
      <label>ปีการศึกษา <input id="sar-year" type="text" inputmode="numeric" maxlength="4" value="${sarEsc(d.year)}"></label>
      <label>ช่วงเวลาที่รายงาน ${sarIn('period', f.period, 'เช่น 1 ต.ค. 2568 – 30 เม.ย. 2569')}</label>
      <label>สถานะ <select id="sar-status"><option value="draft"${d.status === 'draft' ? ' selected' : ''}>ร่าง</option><option value="submitted"${d.status === 'submitted' ? ' selected' : ''}>ส่งแล้ว</option></select></label>
    </div></div>

    ${sec('ส่วนที่ 1  ข้อมูลพื้นฐาน', `
      <div class="doc-subsec"><div class="doc-subsec-hd">1.1 ข้อมูลพื้นฐาน <span class="doc-sec-note">(ชื่อ/ตำแหน่ง/สถานศึกษา ดึงจากข้อมูลส่วนตัว)</span></div>
        <div class="u-mt-4"><span class="u-muted">ชื่อ</span> <span class="u-semibold">${sarEsc(pi.name || '—')}</span> <span class="u-muted">ตำแหน่ง</span> <span class="u-semibold">${sarEsc(pi.position || '—')}</span> <span class="u-muted">กลุ่มสาระฯ</span> <span class="u-semibold">${sarEsc(pi.subjectGroup || '—')}</span></div>
        <div class="u-mt-4"><span class="u-muted">สถานศึกษา</span> <span class="u-semibold">${sarEsc(pi.school || '—')}</span></div>
        <div class="doc-form-meta u-mt-4">
          ${num('อายุ (ปี)', 'age')}${num('อายุราชการ (ปี)', 'svcY')}${num('(เดือน)', 'svcM')}
          ${sarFld('คุณวุฒิสูงสุด', sarIn('degree', f.degree))}${sarFld('วิชาเอก', sarIn('major', f.major))}${sarFld('จากสถาบัน', sarIn('inst', f.inst))}
          ${sarFld('วิทยฐานะ', sarIn('rank', f.rank))}${sarFld('ตำแหน่งเลขที่', sarIn('posNo', f.posNo))}
        </div></div>
      <div class="u-mt-4"><button type="button" class="btn btn-primary btn-sm" id="sar-cs-pull">ดึงจากรายวิชา · คะแนน · เกรด (ภาคเรียนนี้)</button> <button type="button" class="btn btn-ghost btn-sm" id="sar-tt-pull">ดึงจากตารางสอนอย่างเดียว</button></div>
      <div class="u-note">ปุ่มแรกเติมภาระสอน กิจกรรม และตารางผลการเรียน (1.2.4.1) จากรายวิชาที่ภาคเรียน/ปีการศึกษาตรงกับด้านบน — ชั่วโมง/สัปดาห์มาจากตารางสอน แก้ไขต่อในช่องได้</div>
      ${sarTable('teaching', '1.2.1 ปฏิบัติการสอน', 'เพิ่มรายวิชา')}<div class="u-note" id="sar-t-sum"></div>
      ${sarTable('activities', '1.2.2 กิจกรรมพัฒนาผู้เรียน', 'เพิ่มกิจกรรม')}
      <div class="doc-subsec"><div class="doc-subsec-hd">1.2.3 ครูที่ปรึกษา</div><div class="doc-form-meta">
        ${sarFld('ชั้น/ห้อง', sarIn('hmCls', f.hmCls, 'เช่น ม.1/1'))}${num('ชาย (คน)', 'hmM')}${num('หญิง (คน)', 'hmF')}</div><div class="u-note" id="sar-hm-n"></div></div>
      <div class="doc-subsec"><div class="doc-subsec-hd">1.2.4 เวลาการมาปฏิบัติหน้าที่ราชการ <span class="doc-sec-note">(ครั้ง / วัน — เว้นว่างถ้าไม่มี)</span></div><div class="doc-form-meta">
        ${[['late', 'มาสาย'], ['sick', 'ลาป่วย'], ['biz', 'ลากิจ'], ['ord', 'ลาอุปสมบท'], ['mat', 'ลาคลอด']].map(([k, l]) => `${num(l + ' (ครั้ง)', 'at.' + k + 'T')}${num(l + ' (วัน)', 'at.' + k + 'D')}`).join('')}</div></div>`)}

    ${sec('ส่วนที่ 2  ผลงานที่เกิดจากการปฏิบัติหน้าที่', `
      ${SAR_NARR.slice(0, 7).map(([k, l]) => `<div class="field u-mt-4"><label for="sar-${k}">${sarEsc(l)}</label><textarea class="idp-ta" id="sar-${k}" data-f="${k}" rows="3">${sarEsc(f[k])}</textarea></div>`).join('')}
      ${sarTable('grades', '1.2.4.1 ผลสัมฤทธิ์ทางวิชาการของผู้เรียน (จำนวนนักเรียนตามระดับผลการเรียน)', 'เพิ่มรายวิชา', '<th>เฉลี่ย / ตรวจสอบ</th>')}<div class="u-note" id="sar-g-res"></div>
      ${sarTable('traits', '1.2.4.2 คุณลักษณะอันพึงประสงค์ของผู้เรียน (จำนวนคนตามผลการประเมิน)', 'เพิ่มห้อง')}<div class="u-note" id="sar-tr-n"></div>
      <div class="doc-subsec"><div class="doc-subsec-hd">1.2.5 รูปแบบ/วิธีการจัดกิจกรรมการเรียนการสอนที่ใช้</div>
        ${SAR_METHODS.map((m, i) => `<label class="u-mt-4"><input type="checkbox" data-f="m.${i}"${f.m?.[i] ? ' checked' : ''}> ${m}</label>`).join(' ')}
        <div class="field u-mt-4"><label for="sar-mo">อื่น ๆ (ระบุ)</label>${sarIn('mOther', f.mOther).replace('class="input-sm"', 'class="input-sm" id="sar-mo"')}</div><div class="u-note" id="sar-m-n"></div></div>
      <div class="doc-subsec"><div class="doc-subsec-hd">1.2.6 สภาพการปฏิบัติงานสอน</div>${sarMatrix('cond', SAR_COND, lv5, ['มากที่สุด', 'มาก', 'ปานกลาง', 'น้อย', 'น้อยที่สุด'])}</div>
      <div class="doc-subsec"><div class="doc-subsec-hd">1.2.7 ผลการประเมินการสอนของครูโดยนักเรียน</div>${sarMatrix('survey', SAR_SURVEY, lv5, ['มากที่สุด', 'มาก', 'ปานกลาง', 'น้อย', 'น้อยที่สุด'])}<div class="u-note" id="sar-sv-res"></div></div>
      <div class="doc-subsec"><div class="doc-subsec-hd">1.6 การประเมินตนเองเกี่ยวกับการจัดทำแผนการจัดการเรียนรู้ที่เน้นผู้เรียนเป็นสำคัญ <span class="doc-sec-note">(ระดับ 4 = ดีมาก … 1 = ปรับปรุง)</span></div>${sarMatrix('plan', SAR_PLAN, [4, 3, 2, 1], ['4', '3', '2', '1'])}<div class="u-note" id="sar-pl-res"></div></div>
      ${sarTable('training', '3.1 การพัฒนาตนเอง (อบรม/พัฒนา)', 'เพิ่มการอบรม')}<div class="u-note" id="sar-tn-h"></div>
      <div class="field u-mt-4"><label for="sar-plc">3.2 การพัฒนาวิชาชีพ (PLC)</label>${sarIn('plc', f.plc, 'เช่น เข้าร่วมกิจกรรม PLC ภาคเรียนที่ 2 จำนวน … ชั่วโมง').replace('class="input-sm"', 'class="input-sm" id="sar-plc"')}</div>
      ${sarTable('awards', '4. รางวัล / ประกาศเกียรติคุณ / ผลงานดีเด่น', 'เพิ่มรางวัล')}
      <div class="doc-subsec"><div class="doc-subsec-hd">5. งานอื่น ๆ ที่ได้รับมอบหมาย</div>
        ${SAR_DUTY.map((t, i) => `${sarTable('duty' + i, t, 'เพิ่มงาน')}<div class="field"><label>ระดับคุณภาพการปฏิบัติงาน
          <select data-f="dq${i}">${['', 'ดี', 'พอใช้', 'ปรับปรุง'].map(o => `<option value="${o}"${f['dq' + i] === o ? ' selected' : ''}>${o || '— เลือก —'}</option>`).join('')}</select></label></div>`).join('')}</div>
      ${SAR_NARR.slice(7).map(([k, l]) => `<div class="field u-mt-4"><label for="sar-${k}">${sarEsc(l)}</label><textarea class="idp-ta" id="sar-${k}" data-f="${k}" rows="4">${sarEsc(f[k])}</textarea></div>`).join('')}`)}

    ${sec('ส่วนที่ 3  ผลการดำเนินงานตามมาตรฐานการศึกษาขั้นพื้นฐาน', `
      <div class="u-note">ระดับคุณภาพ 5 = ยอดเยี่ยม · 4 = ดีเลิศ · 3 = ดี · 2 = ปานกลาง · 1 = กำลังพัฒนา — ค่าเฉลี่ยและระดับคุณภาพคำนวณให้</div>
      ${SAR_STD.map(([t, items], i) => `<div class="doc-subsec"><div class="doc-subsec-hd">${sarEsc(t)}</div>${sarMatrix('std' + i, items, lv5, ['5', '4', '3', '2', '1'])}<div class="u-note" id="sar-std-${i}"></div></div>`).join('')}`)}

    <div class="pa-form-footer">
      ${SAR.docId ? `<button type="button" class="btn btn-danger-ghost" id="sar-del-btn">${DOC_ICO_DEL} ลบ</button>` : ''}
      <button type="button" class="btn btn-ghost" id="sar-print-btn">${DOC_ICO_PRINT} พิมพ์</button>
      <button type="button" class="btn btn-ghost" id="sar-cancel-btn">ยกเลิก</button>
      <button type="button" class="btn btn-primary" id="sar-save-btn">บันทึก SAR</button>
    </div>
  </form>`;
  docSwapIn(root);
  const form = document.getElementById('sar-form');
  const update = () => { sarCollect(); sarCalc(); };
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  form.addEventListener('click', e => {
    const add = e.target.closest('[data-add]'), del = e.target.closest('.sar-del');
    if (add) { form.querySelector(`tbody[data-rows="${add.dataset.add}"]`).insertAdjacentHTML('beforeend', sarRowHtml(add.dataset.add)); update(); }
    if (del) { const tb = del.closest('tbody'); if (tb.rows.length > 1) del.closest('tr').remove(); else del.closest('tr').querySelectorAll('input').forEach(i => { i.value = ''; }); update(); }
  });
  sarCalc();

  document.getElementById('sar-cs-pull')?.addEventListener('click', async () => {
    sarCollect();
    const has = ['teaching', 'activities', 'grades'].some(k => (d.rows[k] || []).some(r => Object.values(r).some(Boolean)));
    if (has && !confirm('แทนที่ภาระสอน กิจกรรม และตารางผลการเรียนที่กรอกไว้ ด้วยข้อมูลจากรายวิชา?')) return;
    const btn = document.getElementById('sar-cs-pull');
    btn.disabled = true;
    try {
      const r = await sarPullCourses(d);
      if (!r.found) { showToast(`ไม่พบรายวิชาภาคเรียนที่ ${d.semester} ปี ${d.year} — ตรวจภาคเรียน/ปีของรายวิชา`); return; }
      if (stillHere()) { await sarRenderFormView(); showToast(`ดึงแล้ว: สอน ${r.teach} ห้อง · กิจกรรม ${r.act} ห้อง${r.noScore ? ` · ${r.noScore} ห้องยังไม่มีคะแนน` : ''}`); }
    } catch (e) { showToast('ดึงข้อมูลรายวิชาไม่สำเร็จ: ' + e.message, 'error'); }
    finally { btn.disabled = false; }
  });
  document.getElementById('sar-tt-pull')?.addEventListener('click', async () => {
    sarCollect();
    if ((d.rows.teaching || []).some(r => r.name) && !confirm('แทนที่รายวิชา/กิจกรรมที่กรอกไว้ด้วยข้อมูลจากตารางสอน?')) return;
    try {
      const t = await idpPullTimetable({ type: 'term', year: d.year, sem: d.semester });
      if (!t.subjects.length && !t.activities.length) { showToast(`ยังไม่มีตารางสอนของ${t.label}`); return; }
      d.rows.teaching = t.subjects.map(s => ({ name: s.name, hours: String(s.hours) }));
      d.rows.activities = t.activities.map(s => ({ name: s.name, hours: String(s.hours) }));
      if (stillHere()) { await sarRenderFormView(); showToast(`ดึงจากตารางสอน ${t.label} แล้ว — เติมห้อง/จำนวนนักเรียนเอง`); }
    } catch (e) { showToast('ดึงตารางสอนไม่สำเร็จ: ' + e.message, 'error'); }
  });
  ['sar-back-btn', 'sar-cancel-btn'].forEach(id => document.getElementById(id)?.addEventListener('click', () => { sarCollect(); SAR.view = 'list'; sarRenderListView(); }));
  document.getElementById('sar-print-btn')?.addEventListener('click', () => { sarCollect(); SAR.previewId = SAR.docId; SAR.view = 'preview'; sarRenderPreviewView(SAR.docId); });
  document.getElementById('sar-save-btn')?.addEventListener('click', async () => {
    sarCollect();
    const btn = document.getElementById('sar-save-btn');
    btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
    try { await sarSave(d); SAR.list = null; showToast('บันทึกแล้ว'); }
    catch (e) { showToast('บันทึกไม่สำเร็จ: ' + e.message, 'error'); }
    btn.disabled = false; btn.textContent = 'บันทึก SAR';
  });
  document.getElementById('sar-del-btn')?.addEventListener('click', async () => {
    if (!confirm('ลบ SAR นี้?')) return;
    try {
      await sarCol(AppState.user.uid).doc(SAR.docId).delete();
      SAR.docId = null; SAR.doc = null; SAR.list = null; SAR.view = 'list';
      sarRenderListView();
    } catch (e) { showToast('ลบไม่สำเร็จ: ' + e.message, 'error'); }
  });
}

// ---------------- รายการ ----------------
async function sarRenderListView() {
  const sys = docSystem(), root = docMount(), seq = sys.state.seq;
  docShowLoading(root);
  try {
    if (!SAR.list) SAR.list = await sarLoadList();
    if (docStale(root, seq, sys) || sys.state.tab !== 'sar' || SAR.view !== 'list') return;
    const list = SAR.list;
    root.innerHTML = docListHtml({
      list, icon: IDP_ICO_DOC, hue: 'blue', title: sarTitle, sub: d => idpUpdatedAt(d), actions: ['print', 'dup', 'edit', 'del'],
      emptyTitle: 'ยังไม่มี SAR', emptySub: 'กดปุ่มด้านล่างเพื่อสร้างรายงานผลการปฏิบัติงานและการประเมินตนเอง (SAR)', newLabel: 'สร้าง SAR ใหม่',
    });
    docSwapIn(root);
    const open = (id, dup) => {
      const found = list.find(x => x.id === id);
      if (!found) return null;
      const d = sarNormalize(JSON.parse(JSON.stringify(found)));
      if (dup) { ['id', 'createdAt', 'updatedAt'].forEach(k => delete d[k]); d.status = 'draft'; }
      return d;
    };
    const edit = (id, dup) => {
      const d = open(id, dup); if (!d) return;
      SAR.docId = dup ? null : id; SAR.doc = d; SAR.view = 'form';
      sarRenderFormView();
      if (dup) showToast('คัดลอกแล้ว — แก้ไขแล้วกด “บันทึก” จะได้เป็นฉบับใหม่');
    };
    docBindList(root, {
      create: () => { SAR.docId = null; SAR.doc = sarNormalize({}); SAR.view = 'form'; sarRenderFormView(); },
      open: id => edit(id), edit: id => edit(id), dup: id => edit(id, true),
      print: id => { SAR.previewId = id; SAR.view = 'preview'; sarRenderPreviewView(id); },
      del: async id => { await sarCol(AppState.user.uid).doc(id).delete(); SAR.list = null; await sarRenderListView(); },
    });
  } catch (e) {
    if (!root.isConnected) return;
    docSwapIn(root);
    root.innerHTML = `<div class="doc-error">โหลดรายการไม่สำเร็จ: ${sarEsc(e.message)}</div>`;
  }
}

function sarRenderView() {
  if (SAR.view === 'form') return sarRenderFormView();
  if (SAR.view === 'preview') return sarRenderPreviewView(SAR.previewId);
  return sarRenderListView();
}
function sarBeforeLeave() { if (SAR.view === 'form') sarCollect(); }

// ---------------- CSS / HTML ต้นฉบับ (ใช้ร่วมกันระหว่างพิมพ์และตัวอย่างบนจอ) ----------------
const SAR_PRINT_CSS = `
@page{size:A4 portrait;margin:1.6cm 1.4cm}
body{font-family:'TH SarabunPSK','TH Sarabun PSK','THSarabunPSK','TH Sarabun New','PA Sarabun','Noto Sans Thai',Tahoma,sans-serif;font-size:14pt;line-height:1.3}
h1,h2,h3{margin:.6em 0 .2em}h1{font-size:18pt;text-align:center}h2{font-size:15pt}h3{font-size:14pt}
table{border-collapse:collapse;width:100%;margin:.3em 0}th,td{border:1px solid #000;padding:2px 5px;vertical-align:top}th{text-align:center}.c{text-align:center}.sg{margin:2em 0 0 auto;width:9cm;text-align:center;break-inside:avoid}p{margin:.2em 0}`;

// สร้าง HTML เนื้อหา SAR (ใช้ทั้งตอนพิมพ์และตอนแสดงตัวอย่างบนจอ)
function sarBuildBodyHtml(d, prof) {
  const pi = idpProfileInfo(prof), s = sarStats(d), f = d.f || {}, R = d.rows || {}, L = d.lv || {};
  const E = sarEsc, cell = v => (v === '' || v == null ? '' : E(v));
  const tbl = (key, extra) => `<table><tr>${sarCols(key).map(c => `<th>${E(c[1])}</th>`).join('')}</tr>${(R[key] || []).filter(r => Object.values(r).some(Boolean)).map(r => `<tr>${sarCols(key).map(([c]) => `<td>${cell(r[c])}</td>`).join('')}</tr>`).join('')}${extra || ''}</table>`;
  const mx = (group, items, levels) => `<table><tr><th>รายการ</th>${levels.map(l => `<th>${l}</th>`).join('')}</tr>${items.map((t, i) => `<tr><td>${E(t)}</td>${levels.map(l => `<td class="c">${(L[group] || [])[i] === l ? '✓' : ''}</td>`).join('')}</tr>`).join('')}</table>`;
  const para = (k, l) => f[k] ? `<h3>${E(l)}</h3><p>${docNl(f[k])}</p>` : '';
  const at = ['late', 'sick', 'biz', 'ord', 'mat'].map((k, i) => `<tr><td>${['มาสาย', 'ลาป่วย', 'ลากิจ', 'ลาอุปสมบท', 'ลาคลอด'][i]}</td><td class="c">${cell(f.at?.[k + 'T']) || '-'}</td><td class="c">${cell(f.at?.[k + 'D']) || '-'}</td></tr>`).join('');
  const gr = s.gradeTot, gradeFoot = (R.grades || []).length ? `<tr><th colspan="3">รวม</th>${SAR_G.map(([k]) => `<th>${gr[k]}</th>`).join('')}<th>${gr.r}</th><th>${gr.ms}</th></tr>` : '';
  return `
  <h1>รายงานผลการปฏิบัติงานและการประเมินตนเองรายบุคคล<br>Self-Assessment Report : SAR</h1>
  <p class="c">ภาคเรียนที่ ${E(d.semester)} ปีการศึกษา ${E(d.year)}${f.period ? ` (${E(f.period)})` : ''}</p>
  <p class="c">${E(pi.name)} ตำแหน่ง ${E(pi.position)}<br>${E(pi.school)} ${E(pi.affiliation)}</p>
  <h2>ส่วนที่ 1 ข้อมูลพื้นฐาน</h2>
  <p>ชื่อ ${E(pi.name)} กลุ่มสาระการเรียนรู้ ${E(pi.subjectGroup)} อายุ ${E(f.age)} ปี อายุราชการ ${E(f.svcY)} ปี ${E(f.svcM)} เดือน คุณวุฒิสูงสุด ${E(f.degree)} วิชาเอก ${E(f.major)} จาก ${E(f.inst)} ตำแหน่ง ${E(pi.position)} วิทยฐานะ ${E(f.rank)} ตำแหน่งเลขที่ ${E(f.posNo)} สถานศึกษา ${E(pi.school)}</p>
  <h3>1.2.1 ปฏิบัติการสอน</h3>${tbl('teaching', `<tr><th colspan="2">รวม</th><th>${s.teachN}</th><th>${sarFmt(s.teachHours, 1)}</th></tr>`)}
  <h3>1.2.2 กิจกรรมพัฒนาผู้เรียน</h3>${tbl('activities')}
  <h3>1.2.3 ครูที่ปรึกษา</h3><p>ชั้น ${E(f.hmCls)} ชาย ${E(f.hmM)} คน หญิง ${E(f.hmF)} คน รวม ${s.homeN} คน</p>
  <h3>1.2.4 เวลาการมาปฏิบัติหน้าที่ราชการ</h3><table><tr><th>ประเภท</th><th>ครั้ง</th><th>วัน</th></tr>${at}</table>
  <h2>ส่วนที่ 2 ผลงานที่เกิดจากการปฏิบัติหน้าที่</h2>
  ${SAR_NARR.slice(0, 7).map(([k, l]) => para(k, l)).join('')}
  <h3>1.2.4.1 ผลสัมฤทธิ์ทางวิชาการของผู้เรียน</h3>
  <table><tr><th>วิชา</th><th>ห้อง</th><th>N</th>${SAR_G.map(g => `<th>${g[1]}</th>`).join('')}<th>ร</th><th>มส.</th><th>เฉลี่ย</th></tr>
  ${(R.grades || []).map((r, i) => `<tr><td>${cell(r.name)}</td><td>${cell(r.room)}</td><td>${cell(r.n)}</td>${SAR_G.map(([k]) => `<td class="c">${cell(r[k]) || '-'}</td>`).join('')}<td class="c">${cell(r.r) || '-'}</td><td class="c">${cell(r.ms) || '-'}</td><td class="c">${s.rowG[i].all ? sarFmt(s.rowG[i].avg) : ''}</td></tr>`).join('')}${gradeFoot ? gradeFoot.replace('</tr>', `<th>${sarFmt(s.gt.avg)}</th></tr>`) : ''}</table>
  <p>ร้อยละของนักเรียนที่ได้ผลการเรียน 3 ขึ้นไป ${sarFmt(s.pHigh)} · 1–2.5 ${sarFmt(s.pMid)} · 0, ร, มส ${sarFmt(s.pLow)}</p>
  <h3>1.2.4.2 คุณลักษณะอันพึงประสงค์ของผู้เรียน</h3>${tbl('traits')}
  <h3>1.2.5 รูปแบบ/วิธีการจัดกิจกรรมการเรียนการสอน</h3><p>${SAR_METHODS.filter((m, i) => f.m?.[i]).map(E).join(', ')}${f.mOther ? ', ' + E(f.mOther) : ''}<br>จำนวน ${s.methodN + (f.mOther ? 1 : 0)} วิธี</p>
  <h3>1.2.6 สภาพการปฏิบัติงานสอน</h3>${mx('cond', SAR_COND, [5, 4, 3, 2, 1])}
  <h3>1.2.7 ผลการประเมินการสอนของครูโดยนักเรียน</h3>${mx('survey', SAR_SURVEY, [5, 4, 3, 2, 1])}<p>อยู่ในระดับ ${s.svLabel} (ค่าเฉลี่ย ${s.sv ? sarFmt(s.sv) : '—'})</p>
  <h3>1.6 การประเมินตนเองเกี่ยวกับการจัดทำแผนการจัดการเรียนรู้ที่เน้นผู้เรียนเป็นสำคัญ</h3>${mx('plan', SAR_PLAN, [4, 3, 2, 1])}<p>อยู่ในระดับคุณภาพ ${s.plLabel}</p>
  <h3>3.1 การพัฒนาตนเอง</h3>${tbl('training', `<tr><th colspan="4">รวม</th><th>${sarFmt(s.trainHours, 1)}</th></tr>`)}
  ${f.plc ? `<h3>3.2 การพัฒนาวิชาชีพ</h3><p>${E(f.plc)}</p>` : ''}
  <h3>4. รางวัล / ประกาศเกียรติคุณ / ผลงานดีเด่น</h3>${tbl('awards')}
  <h3>5. งานอื่น ๆ ที่ได้รับมอบหมาย</h3>${SAR_DUTY.map((t, i) => `<p><b>${E(t)}</b></p>${(R['duty' + i] || []).filter(r => r.name).map((r, j) => `<p>5.${i + 1}.${j + 1} ${E(r.name)}</p>`).join('')}${f['dq' + i] ? `<p>ระดับคุณภาพการปฏิบัติงาน ${E(f['dq' + i])}</p>` : ''}`).join('')}
  ${para('guide', '6. แนวทางการพัฒนาคุณภาพผู้เรียน (ในภาคเรียนต่อไป)')}
  <h2>ส่วนที่ 3 ผลการดำเนินงานตามมาตรฐานการศึกษาขั้นพื้นฐาน</h2>
  ${SAR_STD.map(([t, items], i) => `<h3>${E(t)}</h3>${mx('std' + i, items, [5, 4, 3, 2, 1])}<p>คะแนนรวม ${s.std[i].sum} ÷ ${s.std[i].total} = ${s.std[i].answered ? sarFmt(s.std[i].avg) : '—'} ระดับคุณภาพ ${s.std[i].label}</p>`).join('')}
  <p>ข้าพเจ้าขอรับรองว่าข้อมูลที่ได้ประเมินตนเองทั้งหมดถูกต้องตรงตามเอกสารหลักฐานที่มีอยู่จริง</p>
  <div class="sg">ลงชื่อ ……………………………… ผู้รายงาน<br>(${E(pi.name)})<br>ตำแหน่ง ${E(pi.position)}</div>
  ${[['หัวหน้ากลุ่มสาระการเรียนรู้', prof?.subjectHead], ['รองผู้อำนวยการฝ่ายวิชาการ', prof?.deputyAcademic], ['ผู้อำนวยการสถานศึกษา', prof?.director]].map(([t, n]) => `<div class="sg">ลงชื่อ ……………………………… ผู้รับรอง<br>(${E(n || '………………………')})<br>ตำแหน่ง ${E(t)}</div>`).join('')}`;
}

async function sarPrint(d) {
  const prof = await idpGetProfile();
  const html = sarBuildBodyHtml(d, prof);
  return docPrintWindow({ title: sarTitle(d), css: SAR_PRINT_CSS, html });
}

// ---------------- ตัวอย่าง/พิมพ์บนจอ (docRenderPreview) ----------------
const SAR_SHEET = { port: { w: 210, h: 297, pad: [16, 14, 16, 14], label: 'A4 แนวตั้ง' } };

async function sarRenderPreviewView(pickId) {
  const sys = docSystem();
  return docRenderPreview({
    sys, tab: 'sar',
    load: async () => {
      const open = SAR.view === 'form' ? SAR.doc : null;
      let list = [];
      try { list = await sarLoadList(); } catch (e) { /* โหลดรายการไม่ได้ → ดูได้เฉพาะรายงานที่เปิดอยู่ */ }
      const openKey = open ? (SAR.docId || '__open__') : null;
      const items = [];
      if (open) items.push({ id: openKey, label: `${sarTitle(open)} · ${SAR.docId ? 'กำลังแก้ไข' : 'ฉบับที่ยังไม่บันทึก'}` });
      list.filter(x => x.id !== openKey).forEach(x => items.push({ id: x.id, label: sarTitle(x) }));
      if (!items.length) return { items };
      const pid = items.some(x => x.id === pickId) ? pickId : items[0].id;
      const d = pid === openKey ? open : sarNormalize(JSON.parse(JSON.stringify(list.find(x => x.id === pid))));
      const profile = await idpGetProfile();
      return { items, pickId: pid, d, open, openKey, profile };
    },
    selectLabel: 'เลือก SAR',
    empty: { icon: IDP_ICO_DOC, title: 'ยังไม่มี SAR', sub: 'สร้างรายงานผลการปฏิบัติงานก่อน แล้วดูตัวอย่างและพิมพ์ที่นี่', gotoLabel: 'ไปที่แบบฟอร์ม', gotoTab: 'sar' },
    hint: () => 'ตัวอย่าง SAR แบบ A4 แนวตั้ง — กด "พิมพ์ / บันทึกเป็น PDF" ในหน้าต่างพิมพ์ได้',
    sheets: ctx => ({
      html: () => docSheetsHtml(SAR_PRINT_CSS, `<div class="sar1">${sarBuildBodyHtml(ctx.d, ctx.profile)}</div>`),
      specs: SAR_SHEET, bodyClass: 'sar1',
      keep: 'h2,h3',
      fonts: [...DOC_FONT_SPECS],
    }),
    onPick: id => { SAR.previewId = id; sarRenderPreviewView(id); },
    onEdit: ctx => {
      if (ctx.pickId !== ctx.openKey) {
        if (ctx.open && !confirm('เปิด SAR นี้เพื่อแก้ไข? ส่วนที่แก้ในรายงานที่เปิดอยู่และยังไม่ได้บันทึกจะหายไป')) return;
        SAR.docId = ctx.pickId;
        SAR.doc = ctx.d;
      }
      SAR.view = 'form';
      sarRenderFormView();
    },
    onPrint: (ctx, view) => {
      const frame = view.querySelector('.doc-preview-frame');
      frame?.contentWindow?.focus();
      frame?.contentWindow?.print();
    },
  });
}
