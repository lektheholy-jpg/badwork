// ==========================================================================
// โครงสร้างรายวิชา (Course Syllabus) — ตารางหน่วยการเรียนรู้ตามแบบ "โครงสร้างรายวิชา" ของหลักสูตร
//   (หัวเอกสาร · หน่วยที่/ชื่อหน่วย · มาตรฐาน/ตัวชี้วัด · สาระการเรียนรู้ย่อยพร้อมเวลา · น้ำหนักคะแนน ·
//    อัตราส่วนระหว่างภาค:ปลายภาค · รวมชั่วโมง/คะแนน) หน้าตาและตัวช่วยเดียวกับฟอร์มคำอธิบายรายวิชา (js/course-desc.js)
//   • อยู่ในหน้า "ตั้งค่าโครงสร้างวิชา" → แท็บ "โครงสร้างรายวิชา" ต่อจากแท็บโครงสร้างคะแนน (js/picker-pages.js) — แท็บเดียวสลับ 2 มุมมอง: แก้ไข ↔ ตัวอย่าง/พิมพ์
//   • ที่มาของข้อมูล (ตารางจึงตรงกับคะแนนจริงเสมอ):
//       แม่แบบวิชา            → รหัส · ชื่อวิชา · ระดับชั้น · หน่วยกิต
//       settings/structure    → หน่วยการเรียนรู้ (ลำดับ · ชื่อ) · น้ำหนักคะแนนต่อหน่วย (รวม max ของชิ้นงานในหน่วย) · กลางภาค · ปลายภาค
//       settings/description  → ประเภทวิชา (พื้นฐาน/เพิ่มเติม) · กลุ่มสาระฯ (ใช้เป็นค่าเริ่มต้น) · ตัวชี้วัดสำหรับปุ่มดึงมาใส่
//       settings/syllabus     → ที่ครูกรอกเอง: กลุ่มสาระฯ · ต่อหน่วย (อ้าง id หน่วย): มาตรฐาน/ตัวชี้วัด + สาระย่อยพร้อมชั่วโมง
//   • Firestore: users/{uid}/courseTemplates/{templateId}/settings/syllabus (อ้างผ่าน courseBaseRef) — firestore.rules เดิมของ courseTemplates/{document=**} ครอบคลุมอยู่แล้ว
//     หน่วยที่ถูกลบออกจากโครงสร้างคะแนน → ข้อมูลของหน่วยนั้นถูกข้าม (ยังเก็บไว้) · หน่วยใหม่ → แถวว่างให้กรอก · เปลี่ยนชื่อหน่วย → ชื่อในตารางเปลี่ยนตาม
//   • สาระย่อย (1.1, 1.2) ใช้จัดเวลาอย่างเดียว ไม่ผูกกับชิ้นงานที่เก็บคะแนน
//   • หน้าวิชาที่เปิดสอน (แท็บภาพรวม) แสดงการ์ดอ่านอย่างเดียวจากแม่แบบ (js/courses.js · syllabusCardHtml) และพิมพ์ผ่าน syPrintCourse
//   • lazy: loadModules(LAZY_BUNDLES.syll) (doc-system → doc-shell → course-desc → syllabus) — ใช้ cdGroupIndicators/cdLevelText/cdNormalize/cdRef ของ course-desc.js
// ==========================================================================

const SY_DOC_ID = 'syllabus';   // settings/syllabus
const SY_MAX = { area: 80, std: 200, title: 150, hours: 5, topics: 12, units: 40 };
const SY_CREDIT_HOURS = 40;     // 1 หน่วยกิต = 40 ชั่วโมง (0.5 = 20 · 1.5 = 60)
const SY_COLS = [8, 18, 15, 36, 11, 12]; // ความกว้างคอลัมน์ (%) หน่วยที่ · ชื่อหน่วย · มาตรฐาน · สาระ · เวลา · น้ำหนัก
const SY_SAVE_LABEL = 'บันทึกโครงสร้างรายวิชา';

// มีค่าที่พิมพ์ค้างยังไม่บันทึกหรือไม่ — หน้าที่สลับแท็บเรียกถามก่อนทิ้ง (js/picker-pages.js)
let _syDirty = false;
function syIsDirty() { return _syDirty; }
// สถานะของแท็บที่เปิดอยู่: ข้อมูลที่โหลด + ร่างที่พิมพ์ค้าง (เก็บข้ามมุมมองแก้ไข ↔ ตัวอย่าง)
const SY = { id: null, course: null, struct: null, desc: null, saved: null, draft: null, onScore: null };
function syDiscard() { SY.draft = null; _syDirty = false; }

const syStr = (v, n) => String(v == null ? '' : v).slice(0, n);
const syRound1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
const syFmt = (n) => String(syRound1(n));

// ชั่วโมง: ตัวเลข ≥ 0 ทศนิยมไม่เกิน 1 ตำแหน่ง ไม่เกิน 999 — ค่าอื่น = ว่าง
function syHours(v) {
  const s = String(v == null ? '' : v).trim();
  const n = Number(s);
  if (!s || !isFinite(n) || n < 0) return '';
  return String(syRound1(Math.min(n, 999)));
}

// ทำให้เอกสารที่บันทึกไว้ครบทุกช่อง: ตัดช่องว่าง/ความยาว/จำนวน · ทิ้งสาระย่อยที่ว่าง · ทิ้งหน่วยที่ไม่มีเนื้อหา/id ซ้ำ
//   กลุ่มสาระฯ ที่ไม่เคยบันทึก (ไม่มีฟิลด์ area) → ใช้ค่าจากคำอธิบายรายวิชา (descArea) · เคยบันทึกเป็นค่าว่างแล้ว = ว่างตามนั้น
function syNormalize(d, descArea) {
  d = d && typeof d === 'object' ? d : {};
  const seen = new Set();
  const units = (Array.isArray(d.units) ? d.units : []).slice(0, SY_MAX.units).map(u => ({
    id: syStr(u && u.id, 80),
    standard: syStr(u && u.standard, SY_MAX.std).trim(),
    topics: (Array.isArray(u && u.topics) ? u.topics : []).slice(0, SY_MAX.topics)
      .map(t => ({ title: syStr(t && t.title, SY_MAX.title).trim(), hours: syHours(t && t.hours) }))
      .filter(t => t.title || t.hours),
  })).filter(u => {
    if (!u.id || seen.has(u.id) || !(u.standard || u.topics.length)) return false;
    seen.add(u.id);
    return true;
  });
  return { area: syStr(d.area != null ? d.area : descArea, SY_MAX.area).trim(), units };
}

// หน่วย/คะแนนจากโครงสร้างคะแนน (ฟังก์ชันล้วน — ทดสอบได้) — items = เอกสารใน assessments · sd = settings/structure
//   ลำดับหน่วย = เหมือนหน้าโครงสร้างคะแนน: หน่วยที่ยังไม่จัดหมวด → แต่ละหมวดตามลำดับหมวด (ในหมวดตามลำดับหน่วย)
//   คืน { units: [{ id, name, weight }], outside: คะแนนเก็บนอกหน่วย, collect, midterm, final }
function syStructFrom(items, sd) {
  items = Array.isArray(items) ? items : [];
  const gids = Array.isArray(sd && sd.groups) ? sd.groups.map(g => g && g.id) : [];
  const all = (Array.isArray(sd && sd.units) ? sd.units : []).filter(u => u && u.id)
    .map(u => ({ id: u.id, name: String(u.name || ''), groupId: gids.includes(u.groupId) ? u.groupId : null }));
  const ordered = [null, ...gids].flatMap(gid => all.filter(u => u.groupId === gid));
  const max = (i) => Number(i && i.max) || 0;
  const collect = items.filter(i => i.category === 'collect');
  const ids = new Set(ordered.map(u => u.id));
  const one = (cat) => max(items.find(i => i.category === cat));
  return {
    units: ordered.map(u => ({ id: u.id, name: u.name, weight: syRound1(collect.filter(i => i.unitId === u.id).reduce((s, i) => s + max(i), 0)) })),
    outside: syRound1(collect.filter(i => !ids.has(i.unitId)).reduce((s, i) => s + max(i), 0)),
    collect: syRound1(collect.reduce((s, i) => s + max(i), 0)),
    midterm: one('midterm'),
    final: one('final'),
  };
}

async function syLoadStruct(course) {
  const base = courseBaseRef(course);
  const [snap, sdoc] = await Promise.all([base.collection('assessments').get(), base.collection('settings').doc('structure').get()]);
  return syStructFrom(snap.docs.map(d => ({ id: d.id, ...d.data() })), sdoc.exists ? sdoc.data() : null);
}

// เจ้าของเอกสาร syllabus/description: วิชาที่เปิดสอนในเทอมอ่านจากแม่แบบที่ผูกอยู่ (ใช้ร่วมทุกเทอม) · ไม่ผูกแม่แบบ = ของวิชานั้นเอง
function syOwner(course) {
  return course.templateId ? { id: course.templateId, isTemplate: true } : course;
}

// โหลดทุกอย่างที่ตารางต้องใช้ — โครงสร้างคะแนนอ่านจาก `course` (วิชาที่เปิดสอนมีโครงสร้างของตัวเอง) · syllabus/คำอธิบายอ่านจาก `owner`
async function syLoad(course, owner = course) {
  const set = courseBaseRef(owner).collection('settings');
  const [sSnap, dSnap, struct] = await Promise.all([set.doc(SY_DOC_ID).get(), set.doc('description').get(), syLoadStruct(course)]);
  const desc = cdNormalize(dSnap.exists ? dSnap.data() : {}, owner);
  return { struct, desc, saved: syNormalize(sSnap.exists ? sSnap.data() : {}, desc.area) };
}

// โมเดลของตาราง: หัวเอกสาร + แถวหน่วย + ยอดรวม + คำเตือน
function syModel(course, struct, saved, desc) {
  const c = course || {}, dsc = desc || {};
  const s = syNormalize(saved, dsc.area);
  const byId = new Map(s.units.map(u => [u.id, u]));
  const units = struct.units.map((u, i) => {
    const sv = byId.get(u.id) || { standard: '', topics: [] };
    return {
      n: i + 1, id: u.id, name: u.name.trim() || `หน่วยที่ ${i + 1}`, standard: sv.standard, topics: sv.topics,
      hours: syRound1(sv.topics.reduce((a, t) => a + (Number(t.hours) || 0), 0)), weight: u.weight,
    };
  });
  const hoursTotal = syRound1(units.reduce((a, u) => a + u.hours, 0));
  const credit = Number(c.credit);
  const hoursExpected = credit > 0 ? syRound1(credit * SY_CREDIT_HOURS) : null;
  const grand = syRound1(struct.collect + struct.midterm + struct.final);
  const warnings = [];
  if (!units.length) warnings.push('ยังไม่มีหน่วยการเรียนรู้ในโครงสร้างคะแนน — เพิ่มหน่วยที่แท็บ “โครงสร้างคะแนน” แล้วกลับมากรอกที่นี่');
  if (hoursExpected != null && hoursTotal !== hoursExpected) warnings.push(`ชั่วโมงรวม ${syFmt(hoursTotal)} ไม่เท่ากับ ${syFmt(credit)} หน่วยกิต × ${SY_CREDIT_HOURS} = ${syFmt(hoursExpected)} ชั่วโมง`);
  if (grand !== 100) warnings.push(`คะแนนรวมทั้งสิ้น ${syFmt(grand)} ไม่ครบ 100 (แก้ที่แท็บ “โครงสร้างคะแนน”)`);
  return {
    code: String(c.code || ''), name: String(c.name || ''), level: String(c.level || ''), credit: String(c.credit == null ? '' : c.credit),
    type: CD_TYPES.includes(dsc.type) ? dsc.type : CD_TYPES[0], area: s.area,
    units, outside: struct.outside, collect: struct.collect, midterm: struct.midterm, final: struct.final, grand,
    ratio: [syRound1(struct.collect + struct.midterm), struct.final], hoursTotal, hoursExpected, warnings,
  };
}

// ---------------------------------------------------------------- ตัวอย่างก่อนพิมพ์ / พิมพ์
// เอกสาร A4 แนวตั้ง ขอบ 15 มม. — ตารางกว้างจึงใช้ขอบแคบ · SY1_CSS = สไตล์ของ "กระดาษ" (ตัวอย่าง + หน้าต่างพิมพ์) ไม่ใช่สไตล์ของหน้าเว็บ — ธรรมเนียมเดียวกับ CD1_CSS
// 1 หน่วย = 1 แถวของตาราง (สาระย่อย+ชั่วโมงเป็นกริดซ้อนในเซลล์ ไม่ใช้ rowspan) — docPaginate ตัดตารางทีละแถวและซ้ำหัวตารางทุกแผ่น หน่วยจึงไม่ถูกตัดกลาง
const SY_SHEET = { port: { w: 210, h: 297, pad: [15, 15, 15, 15], label: 'A4 แนวตั้ง' } }; // mm [บน, ขวา, ล่าง, ซ้าย] — ต้องตรงกับ SY_PAGE
const SY_PAGE = '@page{size:A4 portrait;margin:15mm}html,body{margin:0;background:#fff}';
const SY_TG = (SY_COLS[3] / (SY_COLS[3] + SY_COLS[4]) * 100).toFixed(3); // สัดส่วนช่องสาระ : ช่องเวลา ในเซลล์รวมของแถวหน่วย — ให้เส้นตรงกับคอลัมน์ของหัวตาราง

const SY1_CSS = `
.sy1{background:#fff;color:#000;font-family:'TH SarabunPSK','TH Sarabun PSK','THSarabunPSK','TH Sarabun New','THSarabunNew','PA Sarabun','Noto Sans Thai',Tahoma,sans-serif;font-size:16pt;line-height:1.28}
.sy1 *{box-sizing:border-box}
.sy1 .sy-title{text-align:center;font-weight:700;font-size:18pt;margin-bottom:.3em;overflow-wrap:anywhere}
.sy1 .sy-l{display:flex;justify-content:space-between;gap:1em;font-weight:700;padding:0 1mm;overflow-wrap:anywhere}
.sy1 .sy-l>span:last-child{text-align:right}
.sy1 table{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:.4em}
.sy1 col{width:var(--w)}
.sy1 th,.sy1 td{border:.75pt solid #aaa;padding:.1em .3em;vertical-align:middle;overflow-wrap:anywhere}
.sy1 th{font-weight:700;text-align:center}
.sy1 tr{break-inside:avoid;page-break-inside:avoid}
.sy1 td.sy-c{text-align:center}
.sy1 td.sy-tc{padding:0;vertical-align:top}
.sy1 .sy-tr{display:grid;grid-template-columns:${SY_TG}% ${(100 - SY_TG).toFixed(3)}%}
.sy1 .sy-tr+.sy-tr{border-top:.75pt solid #555}
.sy1 .sy-tt{padding:.1em .3em;overflow-wrap:anywhere}
.sy1 .sy-th{padding:.1em .3em;text-align:center;border-left:.75pt solid #aaa}
.sy1 tr.sy-sum td{font-weight:700;text-align:center}
`;

// ข้อความหลายบรรทัด (ช่องมาตรฐาน/ตัวชี้วัด) → <br>
const syLines = (t) => String(t || '').split(/\r?\n/).map(escapeHtml).join('<br>');

// เนื้อกระดาษ (<section>) — หัวเรื่อง · ชื่อวิชา/รหัส/กลุ่มสาระ · ชั้น/เวลา/หน่วยกิต · ตารางหน่วยการเรียนรู้ · สรุปอัตราส่วนและยอดรวม
//   ช่องที่ยังว่างแสดงจุดไข่ปลา เหมือนฟอร์มราชการที่รอกรอก
function sySheetBodyHtml(m) {
  const e = escapeHtml, dots = n => '…'.repeat(n), f = syFmt;
  const area = m.area.replace(/^กลุ่มสาระการเรียนรู้\s*/, '').trim(); // กันพิมพ์คำนำมาซ้ำกับที่กระดาษใส่ให้
  const hours = m.hoursTotal > 0 ? f(m.hoursTotal) : (m.hoursExpected != null ? f(m.hoursExpected) : '');
  const topicRows = (u) => (u.topics.length ? u.topics : [{ title: '', hours: '' }])
    .map((t, i) => `<div class="sy-tr"><span class="sy-tt">${t.title ? `${u.n}.${i + 1} ${e(t.title)}` : '&nbsp;'}</span><span class="sy-th">${e(t.hours)}</span></div>`).join('');
  const unitRow = (u) => `<tr class="sy-u"><td class="sy-c">${u.n}</td><td class="sy-c">${e(u.name)}</td><td class="sy-c">${syLines(u.standard)}</td><td class="sy-tc" colspan="2">${topicRows(u)}</td><td class="sy-c">${f(u.weight)}</td></tr>`;
  const sum = (label, h, w) => `<tr class="sy-sum"><td colspan="4">${label}</td><td>${h}</td><td>${w}</td></tr>`;
  return `<section class="pg-port">
  <div class="sy-title">โครงสร้างรายวิชา${e(m.type)}${e(area)}</div>
  <div class="sy-l"><span>${e(m.name) || dots(20)} ${e(m.code) || dots(6)}</span> <span>กลุ่มสาระการเรียนรู้${e(area) || dots(12)}</span></div>
  <div class="sy-l"><span>${e(cdLevelText(m.level)) || 'ชั้น' + dots(12)} เวลา ${hours || dots(3)} ชั่วโมง</span> <span>จำนวน ${e(m.credit) || dots(3)} หน่วยกิต</span></div>
  <table>
    <colgroup>${SY_COLS.map(w => `<col style="--w:${w}%">`).join('')}</colgroup>
    <thead><tr><th>หน่วย<br>ที่</th><th>ชื่อหน่วยการเรียนรู้</th><th>มาตรฐาน/<br>ตัวชี้วัด</th><th>สาระการเรียนรู้ (เนื้อหา)</th><th>เวลา<br>(ชั่วโมง)</th><th>น้ำหนัก<br>คะแนน</th></tr></thead>
    <tbody>
      ${m.units.map(unitRow).join('\n      ')}
      ${m.outside > 0 ? sum('คะแนนเก็บนอกหน่วย', '', f(m.outside)) : ''}
      <tr class="sy-sum"><td colspan="6">อัตราส่วนระหว่างภาค : ปลายภาค ${f(m.ratio[0])} : ${f(m.ratio[1])} คะแนน</td></tr>
      ${sum('รวมชั่วโมง/คะแนนระหว่างภาค', '', f(m.collect))}
      ${sum('รวมชั่วโมง/คะแนนกลางภาค', '', f(m.midterm))}
      ${sum('รวมชั่วโมง/คะแนนปลายภาค', '', f(m.final))}
      ${sum('รวมทั้งสิ้น', f(m.hoursTotal), f(m.grand))}
    </tbody>
  </table>
</section>`;
}

function syDocTitle(c) { return ['โครงสร้างรายวิชา', c.code, c.name].filter(Boolean).join(' '); }

// พิมพ์ / บันทึกเป็น PDF ผ่านหน้าต่างใหม่ (docPrintWindow ต้องถูกเรียกจากการคลิกโดยตรง)
function syPrint(m) {
  return docPrintWindow({ title: syDocTitle(m), css: SY1_CSS, page: SY_PAGE, html: `<div class="sy1">${sySheetBodyHtml(m)}</div>` });
}

// พิมพ์จากหน้าวิชาที่เปิดสอน (js/courses.js) — window.open ต้องมาก่อน await จึงส่ง html เป็นฟังก์ชัน (docPrintWindow เปิดหน้าต่างก่อนแล้วค่อยเรียก) · โหลดข้อมูลหลังคลิกได้
function syPrintCourse(course) {
  return docPrintWindow({
    title: syDocTitle(course), css: SY1_CSS, page: SY_PAGE,
    html: async () => {
      const d = await syLoad(course, syOwner(course));
      return `<div class="sy1">${sySheetBodyHtml(syModel(course, d.struct, d.saved, d.desc))}</div>`;
    },
  });
}

// หน้าตัวอย่าง: แผ่น A4 ตัดหน้าด้วยโครงกลาง (docRenderSheets) · โครงกลางดูแท็บจาก sys.state.tab เพื่อเลิกฟัง resize — ส่ง sys จำลอง
const SY_PREVIEW_SYS = { state: { tab: 'syll' } };
function syShowPreview(container, m, fromDraft) {
  container.innerHTML = `
    <div class="doc-preview-bar">
      <div class="doc-preview-actions">
        <button type="button" class="btn btn-ghost btn-sm" id="sy-prev-edit">${DOC_ICO_EDIT} แก้ไข</button>
        <button type="button" class="btn btn-primary btn-sm" id="sy-prev-print">${DOC_ICO_PRINT} พิมพ์ / บันทึกเป็น PDF</button>
      </div>
    </div>
    <div class="u-note doc-preview-hint">${fromDraft ? 'ตัวอย่างนี้รวมส่วนที่ยังไม่ได้บันทึก (ยังไม่ถูกเก็บลงแม่แบบ) · ' : ''}กดพิมพ์แล้วเลือก "บันทึกเป็น PDF" ในหน้าต่างพิมพ์ได้ · ใช้ Chrome/Edge จะแบ่งหน้าได้ถูกต้องที่สุด</div>
    ${m.warnings.length ? `<div class="sy-warn" role="status">${m.warnings.map(escapeHtml).join('<br>')}</div>` : ''}
    <div class="doc-preview-frame-wrap"><iframe class="doc-preview-frame is-fit" title="ตัวอย่างโครงสร้างรายวิชา"></iframe></div>`;
  container.querySelector('#sy-prev-edit').addEventListener('click', () => syShowForm(container));
  container.querySelector('#sy-prev-print').addEventListener('click', () => syPrint(m));
  const body = sySheetBodyHtml(m);
  docRenderSheets(SY_PREVIEW_SYS, 'syll', container, null, { // ไม่รอ — แถบแสดงไปก่อน กระดาษตามมา
    html: () => docSheetsHtml(SY1_CSS, `<div class="sy1">${body}</div>`),
    specs: SY_SHEET, bodyClass: 'sy1', keep: '.sy-title', kindOf: () => 'port',
  }).catch(err => console.error('syShowPreview:', err));
}

// ---------------------------------------------------------------- ฟอร์ม (มุมมองแก้ไข)
function syTopicRowHtml(t = {}) {
  return `<div class="doc-lrow sy-trow">
    <input class="input-sm sy-t-title" type="text" maxlength="${SY_MAX.title}" placeholder="เช่น ถูกต้อง ปลอดภัย ใช่เลย" value="${escapeHtml(t.title || '')}" aria-label="ชื่อสาระการเรียนรู้ย่อย">
    <input class="input-sm sy-t-hours" type="text" inputmode="decimal" maxlength="${SY_MAX.hours}" placeholder="ชม." value="${escapeHtml(t.hours || '')}" aria-label="เวลา (ชั่วโมง)">
    <button type="button" class="btn btn-danger-ghost btn-sm doc-l-del sy-t-del" title="ลบแถว" aria-label="ลบแถว">${DOC_ICO_DEL}</button>
  </div>`;
}

// ตัวเลือกดึงตัวชี้วัดจากคำอธิบายรายวิชา: รวมตามมาตรฐาน "ว 4.2" + "ม.2/1","ม.2/2" → "ว4.2 / ม.2/1, ม.2/2" (ตัดช่องว่างหลังตัวอักษรนำหน้าตามแบบ · ครูแก้ในช่องได้)
function syIndicatorChoices(desc) {
  return cdGroupIndicators(desc && desc.indicators).map(g => {
    const head = g.head.replace(/^([ก-ฮ]+)\s+/, '$1');
    return g.subs.length ? `${head} / ${g.subs.join(', ')}` : head;
  });
}

function syUnitHtml(u, choices) {
  const pick = choices.length
    ? `<select class="input-sm sy-pick" aria-label="ดึงตัวชี้วัดจากคำอธิบายรายวิชา"><option value="">ดึงจากคำอธิบายรายวิชา…</option>${choices.map((c, i) => `<option value="${i}">${escapeHtml(c)}</option>`).join('')}</select>` : '';
  return `<div class="sy-unit" data-unit="${escapeHtml(u.id)}">
    <div class="sy-unit-h"><span class="sy-unit-n">หน่วยที่ ${u.n}</span><span class="sy-unit-name">${escapeHtml(u.name)}</span><span class="sy-unit-w">น้ำหนักคะแนน ${syFmt(u.weight)}</span></div>
    <div class="field"><label>มาตรฐาน/ตัวชี้วัด
      <textarea class="input-sm sy-std" rows="2" maxlength="${SY_MAX.std}" placeholder="เช่น ว4.2 / ม.2/4">${escapeHtml(u.standard)}</textarea>
    </label>${pick}</div>
    <div class="doc-lblock sy-topics">
      <div class="doc-lhead" aria-hidden="true"><span>สาระการเรียนรู้ย่อย</span><span>เวลา (ชม.)</span><span></span></div>
      <div class="doc-lrows sy-trows">${u.topics.map(syTopicRowHtml).join('')}</div>
      <button type="button" class="btn btn-ghost btn-sm doc-l-add sy-t-add">${DOC_ICO_ADD} เพิ่มสาระย่อย</button>
    </div>
  </div>`;
}

function syCheckHtml(m) {
  const stat = (k, v) => `<div class="sy-stat"><span>${k}</span><b>${v}</b></div>`;
  return `<div class="sy-stats">
    ${stat('ชั่วโมงรวม', syFmt(m.hoursTotal) + (m.hoursExpected != null ? ' / ' + syFmt(m.hoursExpected) : ''))}
    ${stat('คะแนนระหว่างภาค', syFmt(m.collect))}${stat('กลางภาค', syFmt(m.midterm))}${stat('ปลายภาค', syFmt(m.final))}${stat('รวมทั้งสิ้น', syFmt(m.grand))}
  </div>${m.outside > 0 ? `<div class="u-note u-mt-4">มีคะแนนเก็บนอกหน่วย ${syFmt(m.outside)} คะแนน — จะแสดงเป็นแถว “คะแนนเก็บนอกหน่วย” ในตาราง</div>` : ''}
  ${m.warnings.map(w => `<div class="sy-warn" role="status">${escapeHtml(w)}</div>`).join('')}`;
}

// ค่าในฟอร์ม → เอกสาร · หน่วยที่ไม่อยู่ในโครงสร้างคะแนนแล้ว (ข้อมูลเดิมที่ถูกข้าม) ยังเก็บไว้ ไม่ถูกลบตอนบันทึก — กลับมาใช้ได้ถ้าเพิ่มหน่วยนั้นคืน
function syCollect(form) {
  const live = [...form.querySelectorAll('.sy-unit')].map(el => ({
    id: el.dataset.unit,
    standard: el.querySelector('.sy-std').value,
    topics: [...el.querySelectorAll('.sy-trow')].map(r => ({ title: r.querySelector('.sy-t-title').value, hours: r.querySelector('.sy-t-hours').value })),
  }));
  const inStruct = new Set(SY.struct.units.map(u => u.id));
  const orphans = ((SY.saved && SY.saved.units) || []).filter(u => !inStruct.has(u.id));
  return syNormalize({ area: form.querySelector('#sy-area').value, units: [...live, ...orphans] }, '');
}

function syCurrent() { return SY.draft || SY.saved; }

function syShowForm(container) {
  const data = syCurrent(), c = SY.course;
  const m = syModel(c, SY.struct, data, SY.desc);
  const choices = syIndicatorChoices(SY.desc);
  container.innerHTML = `
  <div class="doc-preview-bar">
    <div class="doc-preview-actions"><button type="button" class="btn btn-ghost btn-sm" id="sy-to-preview">${DOC_ICO_PRINT} ดูตัวอย่าง / พิมพ์</button></div>
  </div>
  <div class="u-note u-mb-12">กรอกโครงสร้างรายวิชาตามแบบของหลักสูตร — หน่วยการเรียนรู้และน้ำหนักคะแนนดึงจากแท็บ “โครงสร้างคะแนน” อัตโนมัติ (แก้ที่นั่น) · ข้อมูลเก็บไว้กับแม่แบบวิชานี้ และแสดงในหน้ารายวิชาของทุกเทอมที่เปิดสอน · <a href="#" id="sy-goto-score">ไปแท็บโครงสร้างคะแนน</a></div>
  <form id="sy-form" class="doc-form" autocomplete="off" novalidate>
    <section class="doc-section">
      <h2 class="doc-sec-title">ส่วนที่ 1  หัวเอกสาร</h2>
      <div class="sy-head-ro">${escapeHtml([c.code, c.name].filter(Boolean).join(' ')) || 'ยังไม่มีชื่อวิชา'} · ${escapeHtml(c.level || 'ไม่ระบุระดับชั้น')}${c.credit ? ' · ' + escapeHtml(String(c.credit)) + ' หน่วยกิต' : ''}<span class="doc-sec-note"> แก้ที่ปุ่ม “แก้ไขข้อมูลวิชา”</span></div>
      <div class="field u-mt-4"><label for="sy-area">กลุ่มสาระการเรียนรู้</label><input id="sy-area" type="text" maxlength="${SY_MAX.area}" placeholder="เช่น วิทยาศาสตร์และเทคโนโลยี" value="${escapeHtml(data.area)}"></div>
    </section>
    <section class="doc-section">
      <h2 class="doc-sec-title">ส่วนที่ 2  หน่วยการเรียนรู้</h2>
      ${m.units.length ? m.units.map(u => syUnitHtml(u, choices)).join('') : '<div class="empty-state">ยังไม่มีหน่วยการเรียนรู้ — เพิ่มหน่วยที่แท็บ “โครงสร้างคะแนน” (ปุ่ม + หน่วยการเรียนรู้) แล้วกลับมากรอกที่นี่</div>'}
    </section>
    <section class="doc-section"><h2 class="doc-sec-title">สรุปและตรวจสอบ</h2><div id="sy-check">${syCheckHtml(m)}</div></section>
    <div class="pa-form-footer"><button type="button" class="btn btn-primary" id="sy-save-btn">${SY_SAVE_LABEL}</button></div>
  </form>`;
  const form = container.querySelector('#sy-form');
  const recheck = () => { form.querySelector('#sy-check').innerHTML = syCheckHtml(syModel(c, SY.struct, syCollect(form), SY.desc)); };
  const touch = () => { _syDirty = true; recheck(); };
  form.addEventListener('input', touch);
  form.addEventListener('change', touch);

  form.addEventListener('click', (e) => {
    const add = e.target.closest('.sy-t-add'), del = e.target.closest('.sy-t-del');
    if (add) {
      const box = add.closest('.sy-unit').querySelector('.sy-trows');
      if (box.children.length >= SY_MAX.topics) { showToast(`เพิ่มสาระย่อยได้สูงสุด ${SY_MAX.topics} รายการต่อหน่วย`); return; }
      box.insertAdjacentHTML('beforeend', syTopicRowHtml());
      box.lastElementChild.querySelector('input').focus();
      touch();
    } else if (del) { del.closest('.sy-trow').remove(); touch(); }
  });
  form.addEventListener('change', (e) => { // ดึงตัวชี้วัดจากคำอธิบายรายวิชา: ช่องว่าง = ใส่ · มีค่าแล้ว = ต่อบรรทัดใหม่
    const sel = e.target.closest('.sy-pick');
    if (!sel) return;
    const text = choices[Number(sel.value)];
    sel.value = '';
    if (!text) return;
    const ta = sel.closest('.field').querySelector('.sy-std');
    ta.value = (ta.value.trim() ? ta.value.trim() + '\n' : '') + text;
    touch();
  });

  container.querySelector('#sy-goto-score').addEventListener('click', (e) => { e.preventDefault(); if (SY.onScore) SY.onScore(); });
  container.querySelector('#sy-to-preview').addEventListener('click', () => {
    const doc = syCollect(form);
    if (_syDirty) SY.draft = doc; // มีค่าค้าง → ตัวอย่างใช้ค่านี้ แล้วกลับมาแก้ต่อได้ไม่หาย
    syShowPreview(container, syModel(c, SY.struct, doc, SY.desc), _syDirty);
  });

  const saveBtn = form.querySelector('#sy-save-btn');
  saveBtn.addEventListener('click', async () => {
    const doc = syCollect(form);
    saveBtn.disabled = true;
    saveBtn.textContent = 'กำลังบันทึก…';
    try {
      await courseBaseRef(SY.course).collection('settings').doc(SY_DOC_ID).set({ ...doc, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      SY.saved = doc;
      SY.draft = null;
      _syDirty = false;
      showToast('บันทึกโครงสร้างรายวิชาสำเร็จ');
    } catch (err) {
      console.error(err);
      showToast('บันทึกไม่สำเร็จ: ' + (err.message || ''), 'error');
    }
    saveBtn.disabled = false;
    saveBtn.textContent = SY_SAVE_LABEL;
  });
}

// แท็บ "โครงสร้างรายวิชา" ของแม่แบบวิชา — โหลดใหม่ทุกครั้งที่เข้าแท็บ (โครงสร้างคะแนนอาจเพิ่งแก้) · onScore() = ลิงก์พากลับแท็บโครงสร้างคะแนน
async function renderSyllabusTab(container, course, onScore) {
  showLoading('cat-sm', container);
  syDiscard();
  let data;
  try { data = await syLoad(course, course); }
  catch (err) {
    console.error(err);
    if (container.isConnected) container.innerHTML = `<div class="card"><div class="empty-state">โหลดโครงสร้างรายวิชาไม่สำเร็จ: ${escapeHtml(err.message || '')}</div></div>`;
    return;
  }
  if (!container.isConnected) return; // ผู้ใช้สลับแท็บ/ออกจากหน้าไปแล้ว
  Object.assign(SY, { id: course.id, course, struct: data.struct, desc: data.desc, saved: data.saved, draft: null, onScore: onScore || null });
  syShowForm(container);
}
