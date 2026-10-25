// ==========================================================================
// คำอธิบายรายวิชา — ฟอร์มกรอกข้อมูลตามหน้า "คำอธิบายรายวิชา" ของหลักสูตร (ชื่อวิชา · ระดับชั้น · หน่วยกิต ·
//   ย่อหน้าคำอธิบาย · จุดประสงค์ · ตัวชี้วัด) หน้าตาและตัวช่วยเดียวกับฟอร์ม PA (doc-form · doc-section · doc-lblock)
//   • อยู่ในหน้า "ตั้งค่าโครงสร้างวิชา" → แท็บ "คำอธิบายรายวิชา" ของแม่แบบวิชาแต่ละวิชา (js/picker-pages.js)
//   • Firestore: users/{uid}/courseTemplates/{templateId}/settings/description (อ้างผ่าน courseBaseRef ของ js/structure.js
//     จึงใช้กับ courses/{id} ได้เหมือนกัน) — กฎ firestore.rules เดิมของ courseTemplates/{document=**} ครอบคลุมอยู่แล้ว
//   • ตัวอย่างก่อนพิมพ์: ปุ่ม "ตัวอย่างก่อนพิมพ์" ท้ายฟอร์ม → แผ่น A4 ตัดหน้าด้วยโครงกลางของ doc-shell (docSheetsHtml · docRenderSheets)
//     อ่านจากค่าในฟอร์มตอนนั้น (รวมที่ยังไม่บันทึก) · พิมพ์/บันทึก PDF ผ่าน docPrintWindow · cdPrint(d) ใช้ซ้ำที่แท็บภาพรวมของหน้าวิชา (js/courses.js)
//   • หน้าวิชาที่เปิดสอนในเทอม (แท็บภาพรวม) แสดงคำอธิบายนี้แบบอ่านอย่างเดียว โดยอ่านจากแม่แบบวิชาที่วิชานั้นผูกอยู่ (templateId)
//   • lazy: โหลดผ่าน loadModules(LAZY_BUNDLES.cdesc) (doc-system → doc-shell → course-desc) — doc-shell ดึง docs.min.css ตามมาเอง
// ==========================================================================

const CD_SAVE_LABEL = 'บันทึกคำอธิบายรายวิชา'; // ป้ายปุ่มบันทึก (ข้อความล้วน)
const CD_DOC_ID = 'description';              // settings/description
const CD_TYPES = ['พื้นฐาน', 'เพิ่มเติม'];
const CD_MAX = { code: 20, name: 150, level: 40, credit: 8, desc: 4000, indCode: 40, indText: 500, indRows: 60 };

// มีค่าที่พิมพ์ค้างยังไม่บันทึกหรือไม่ — หน้าที่สลับแท็บเรียกถามก่อนทิ้ง (js/picker-pages.js)
let _cdDirty = false;
function cdIsDirty() { return _cdDirty; }

const cdStr = (v, n) => String(v == null ? '' : v).slice(0, n);

// ทำให้ข้อมูลครบทุกช่อง (เอกสารเก่า/ว่าง → ค่าเริ่มต้น) · รับค่าเริ่มต้นจากข้อมูลวิชาเมื่อยังไม่เคยบันทึก
function cdNormalize(d, course) {
  d = d && typeof d === 'object' ? d : {};
  const c = course || {};
  const fresh = !Object.keys(d).length; // ยังไม่เคยบันทึก → ดึงจากข้อมูลวิชา
  const pick = (k, fallback, n) => cdStr(d[k] != null ? d[k] : (fresh ? fallback : ''), n);
  const sem = String(d.semester != null ? d.semester : (fresh ? c.semester : '') || '');
  return {
    codeTh: pick('codeTh', c.code, CD_MAX.code),
    nameTh: pick('nameTh', c.name, CD_MAX.name),
    codeEn: pick('codeEn', '', CD_MAX.code),
    nameEn: pick('nameEn', '', CD_MAX.name),
    level: pick('level', c.level, CD_MAX.level),
    semester: sem === '1' || sem === '2' ? sem : '',
    credit: pick('credit', c.credit, CD_MAX.credit),
    type: CD_TYPES.includes(d.type) ? d.type : CD_TYPES[0],
    descMain: cdStr(d.descMain, CD_MAX.desc),
    descPurpose: cdStr(d.descPurpose, CD_MAX.desc),
    indicators: (Array.isArray(d.indicators) ? d.indicators : []).slice(0, CD_MAX.indRows)
      .map(r => ({ code: cdStr(r && r.code, CD_MAX.indCode).trim(), text: cdStr(r && r.text, CD_MAX.indText).trim() }))
      .filter(r => r.code || r.text),
  };
}

function cdRef(course) {
  return courseBaseRef(course).collection('settings').doc(CD_DOC_ID);
}

// ---------------------------------------------------------------- ตัวชี้วัด (แถว: รหัส · ข้อความ · ลบ)
// ใช้คลาสโครงเดียวกับ docLBlockHtml (doc-lblock · doc-lhead · doc-lrows · doc-lrow) แต่แถวมี 2 ช่องข้อความ
// ซึ่ง docLRowHtml (ชื่อ + ชั่วโมง) ไม่รองรับ จึงมีตัวสร้าง/ตัวอ่านแถวของตัวเองไว้ที่นี่ที่เดียว
function cdIndRowHtml(r = {}) {
  return `<div class="doc-lrow cd-ind-row">
    <input class="input-sm cd-ind-code" type="text" maxlength="${CD_MAX.indCode}" placeholder="เช่น ท 1.1 ม.1/1" value="${escapeHtml(r.code || '')}" aria-label="รหัสตัวชี้วัด">
    <textarea class="input-sm cd-ind-text" rows="2" maxlength="${CD_MAX.indText}" placeholder="ข้อความตัวชี้วัด" aria-label="ข้อความตัวชี้วัด">${escapeHtml(r.text || '')}</textarea>
    <button type="button" class="btn btn-danger-ghost btn-sm doc-l-del cd-ind-del" title="ลบแถว" aria-label="ลบแถว">${DOC_ICO_DEL}</button>
  </div>`;
}

function cdReadIndicators(form) {
  return [...form.querySelectorAll('.cd-ind-row')]
    .map(r => ({ code: r.querySelector('.cd-ind-code').value.trim(), text: r.querySelector('.cd-ind-text').value.trim() }))
    .filter(r => r.code || r.text);
}

// แปลงข้อความที่วางมาทีละบรรทัด "ท 1.1 ม.1/1 : ข้อความ" → [{ code, text }]
// ตัดที่ ":" ตัวแรก (รวมแบบเต็มความกว้าง) · บรรทัดไม่มี ":" = เป็นข้อความต่อจากข้อก่อนหน้า (ข้อความยาวที่ขึ้นบรรทัดใหม่)
function cdParseIndicators(text) {
  const out = [];
  String(text || '').split(/\r?\n/).forEach(line => {
    line = line.trim();
    if (!line) return;
    const m = /^(.{1,40}?)\s*[:：]\s*(.*)$/.exec(line);
    if (m) out.push({ code: m[1].trim(), text: m[2].trim() });
    else if (out.length) out[out.length - 1].text = (out[out.length - 1].text + ' ' + line).trim();
    else out.push({ code: '', text: line });
  });
  return out;
}

// ---------------------------------------------------------------- ฟอร์ม
function cdFormHtml(d) {
  const sel = (v, cur) => (v === cur ? ' selected' : '');
  const txt = (id, label, val, max, extra = '') =>
    `<div class="field"><label for="${id}">${label}</label><input id="${id}" type="text" maxlength="${max}" value="${escapeHtml(val)}"${extra}></div>`;
  return `
  <div class="u-note u-mb-12">กรอกข้อมูลรายวิชาตามคำอธิบายรายวิชาของหลักสูตร — ข้อมูลเก็บไว้กับแม่แบบวิชานี้ และแสดงในหน้ารายวิชาของทุกเทอมที่เปิดสอนวิชานี้ · กด “ตัวอย่างก่อนพิมพ์” เพื่อดูหน้ากระดาษก่อนพิมพ์</div>
  <form id="cd-form" class="doc-form" autocomplete="off" novalidate>

    <div class="doc-form-header">
      <div class="doc-form-meta">
        <label>ระดับชั้น
          <input id="cd-level" type="text" maxlength="${CD_MAX.level}" placeholder="เช่น มัธยมศึกษาปีที่ 1" value="${escapeHtml(d.level)}">
        </label>
        <label>ภาคเรียนที่
          <select id="cd-semester">
            <option value=""${sel('', d.semester)}>ไม่ระบุ</option>
            <option value="1"${sel('1', d.semester)}>1</option>
            <option value="2"${sel('2', d.semester)}>2</option>
          </select>
        </label>
        <label>จำนวนหน่วยกิต
          <input id="cd-credit" type="text" inputmode="decimal" maxlength="${CD_MAX.credit}" placeholder="เช่น 1.5" value="${escapeHtml(d.credit)}">
        </label>
        <label>ประเภทวิชา
          <select id="cd-type">${CD_TYPES.map(t => `<option value="${t}"${sel(t, d.type)}>${t}</option>`).join('')}</select>
        </label>
      </div>
    </div>

    <section class="doc-section">
      <h2 class="doc-sec-title">ส่วนที่ 1  ชื่อรายวิชา</h2>
      <div class="cd-grid">
        ${txt('cd-codeTh', 'รหัสวิชา (ภาษาไทย)', d.codeTh, CD_MAX.code, ' placeholder="เช่น ท21102"')}
        ${txt('cd-nameTh', 'ชื่อวิชา (ภาษาไทย)', d.nameTh, CD_MAX.name, ' placeholder="เช่น ภาษาไทย 2 (วรรณคดีวิจักษ์ 1)"')}
        ${txt('cd-codeEn', 'รหัสวิชา (ภาษาอังกฤษ)', d.codeEn, CD_MAX.code, ' placeholder="เช่น TH21102"')}
        ${txt('cd-nameEn', 'ชื่อวิชา (ภาษาอังกฤษ)', d.nameEn, CD_MAX.name, ' placeholder="เช่น Thai Language 2 (Thai Literary Appreciation 1)"')}
      </div>
    </section>

    <section class="doc-section">
      <h2 class="doc-sec-title">ส่วนที่ 2  คำอธิบายรายวิชา</h2>
      <div class="field"><div class="doc-item-h"><label for="cd-descMain">คำอธิบายรายวิชา <span class="doc-sec-note">ย่อหน้าที่ 1 · มักขึ้นต้นด้วย “ศึกษา…”</span></label></div>
        <textarea id="cd-descMain" class="idp-ta" rows="8" maxlength="${CD_MAX.desc}">${escapeHtml(d.descMain)}</textarea>
      </div>
      <div class="field u-mt-4"><div class="doc-item-h"><label for="cd-descPurpose">จุดประสงค์ / ผลที่คาดหวัง <span class="doc-sec-note">ย่อหน้าที่ 2 · มักขึ้นต้นด้วย “เพื่อ…”</span></label></div>
        <textarea id="cd-descPurpose" class="idp-ta" rows="6" maxlength="${CD_MAX.desc}">${escapeHtml(d.descPurpose)}</textarea>
      </div>
    </section>

    <section class="doc-section">
      <h2 class="doc-sec-title">ส่วนที่ 3  ตัวชี้วัด</h2>
      <div class="doc-lblock cd-ind">
        <div class="doc-lhead" aria-hidden="true"><span>รหัสตัวชี้วัด</span><span>ตัวชี้วัด</span><span></span></div>
        <div class="doc-lrows" id="cd-ind-rows">${d.indicators.map(cdIndRowHtml).join('')}</div>
        <button type="button" class="btn btn-ghost btn-sm doc-l-add" id="cd-ind-add">${DOC_ICO_ADD} เพิ่มตัวชี้วัด</button>
      </div>
      <details class="cd-paste">
        <summary>วางตัวชี้วัดทั้งชุดจากเอกสารหลักสูตร</summary>
        <div class="field u-mt-6">
          <textarea id="cd-paste-text" class="idp-ta" rows="5" aria-label="วางตัวชี้วัดทั้งชุด" placeholder="วางทีละบรรทัด เช่น&#10;ท 1.1 ม.1/1 : อ่านออกเสียงบทร้อยแก้ว…&#10;ท 1.1 ม.1/2 : จับใจความสำคัญจากเรื่องที่อ่าน"></textarea>
          <div class="field-hint">ใช้ “:” คั่นระหว่างรหัสกับข้อความ · บรรทัดที่ไม่มี “:” จะต่อท้ายข้อความของข้อก่อนหน้า</div>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" id="cd-paste-add">เพิ่มเป็นแถว</button>
      </details>
    </section>

    <div class="pa-form-footer">
      <button type="button" class="btn btn-ghost" id="cd-preview-btn">${DOC_ICO_PRINT} ตัวอย่างก่อนพิมพ์</button>
      <button type="button" class="btn btn-primary" id="cd-save-btn">${CD_SAVE_LABEL}</button>
    </div>
  </form>`;
}

function cdCollect(form) {
  const get = id => (document.getElementById(id)?.value || '').trim();
  return cdNormalize({
    codeTh: get('cd-codeTh'), nameTh: get('cd-nameTh'), codeEn: get('cd-codeEn'), nameEn: get('cd-nameEn'),
    level: get('cd-level'), semester: get('cd-semester'), credit: get('cd-credit'), type: get('cd-type'),
    descMain: get('cd-descMain'), descPurpose: get('cd-descPurpose'),
    indicators: cdReadIndicators(form),
  }, null);
}

// ---------------------------------------------------------------- ตัวอย่างก่อนพิมพ์ / พิมพ์
// เอกสาร A4 แนวตั้ง ขอบ 2/2/2/2.5 ซม. (เหมือน แผนการอบรม) — ชื่อวิชา · ระดับชั้น/ภาคเรียน/หน่วยกิต · ย่อหน้าคำอธิบาย · ตารางตัวชี้วัด
// CD1_CSS = สไตล์ของ "กระดาษ" (ใช้ทั้งในตัวอย่างและหน้าต่างพิมพ์) ไม่ใช่สไตล์ของหน้าเว็บ — ธรรมเนียมเดียวกับ TRA1_CSS / PA1_CSS
const CD_SHEET = { port: { w: 210, h: 297, pad: [20, 20, 20, 25], label: 'A4 แนวตั้ง' } }; // mm [บน, ขวา, ล่าง, ซ้าย] — ต้องตรงกับ CD_PAGE
const CD_PAGE = '@page{size:A4 portrait;margin:2cm 2cm 2cm 2.5cm}html,body{margin:0;background:#fff}';
const CD_PARA_MAX = 900; // ย่อหน้ายาวกว่านี้ตัดเป็นท่อนๆ (ที่ช่องว่าง) — ตัวอย่างตัดหน้าทีละบล็อก บล็อกเดียวที่ยาวเกินหน้าจะถูกตัดขอบ (หน้าหนึ่งจุได้ราว 2,800 ตัวอักษร)

const CD1_CSS = `
.cd1{background:#fff;color:#000;font-family:'TH SarabunPSK','TH Sarabun PSK','THSarabunPSK','TH Sarabun New','THSarabunNew','PA Sarabun','Noto Sans Thai',Tahoma,sans-serif;font-size:16pt;line-height:1.22}
.cd1 *{box-sizing:border-box}
.cd1 .d1-c{text-align:center;overflow-wrap:anywhere}
.cd1 .d1-title{font-weight:700;font-size:18pt;margin-bottom:.3em}
.cd1 .d1-h{font-weight:700;margin-top:.8em;break-after:avoid;page-break-after:avoid}
.cd1 .d1-p{margin-top:.6em;text-indent:1.25cm;text-align:justify;overflow-wrap:anywhere}
.cd1 .d1-p.d1-cont{margin-top:0;text-indent:0}
.cd1 .d1-p.d1-more{text-align-last:justify}
.cd1 .d1-tbl{width:100%;border-collapse:collapse;margin-top:.4em}
.cd1 .d1-tbl th,.cd1 .d1-tbl td{border:1px solid #000;padding:.1em .4em;vertical-align:top;text-align:left;overflow-wrap:anywhere}
.cd1 .d1-tbl th{font-weight:700;text-align:center}
.cd1 .d1-tbl .d1-code{width:3.8cm}
.cd1 .d1-tbl thead{display:table-header-group}
.cd1 .d1-tbl tr{break-inside:avoid;page-break-inside:avoid}
.cd1 .d1-total{margin-top:.4em}
`;

// ตัดข้อความเป็นย่อหน้า (ตามบรรทัดใหม่) แล้วตัดย่อหน้ายาวเป็นท่อน ≤ max ที่ช่องว่างตัวสุดท้ายก่อนถึงขีด (ไม่มีช่องว่าง = ตัดตรงขีด)
// คืน [{ text, cont: เป็นท่อนต่อ (ไม่เยื้อง), more: ยังมีท่อนถัดไป }]
function cdChunks(text, max = CD_PARA_MAX) {
  const out = [];
  String(text || '').split(/\r?\n/).map(t => t.trim()).filter(Boolean).forEach(par => {
    let rest = par, first = true;
    while (rest.length > max) {
      let at = rest.lastIndexOf(' ', max);
      if (at < max / 2) at = max;
      out.push({ text: rest.slice(0, at).trim(), cont: !first, more: true }); // more = ยังมีท่อนต่อ → บรรทัดสุดท้ายกระจายเต็มความกว้าง รอยต่อไม่เห็น
      rest = rest.slice(at).trim();
      first = false;
    }
    if (rest) out.push({ text: rest, cont: !first, more: false });
  });
  return out;
}

// เนื้อหากระดาษ (<section>) — ช่องที่ยังว่างแสดงจุดไข่ปลา เหมือนฟอร์มราชการที่รอกรอก
function cdBuildBodyHtml(d) {
  d = cdNormalize(d, null);
  const e = escapeHtml, dots = n => '…'.repeat(n);
  const para = t => cdChunks(t).map(c => `<div class="d1-p${c.cont ? ' d1-cont' : ''}${c.more ? ' d1-more' : ''}">${e(c.text)}</div>`).join('');
  const meta = [
    d.level && `ระดับชั้น ${e(d.level)}`,
    d.semester && `ภาคเรียนที่ ${e(d.semester)}`,
    d.credit && `จำนวน ${e(d.credit)} หน่วยกิต`,
    `รายวิชา${e(d.type)}`,
  ].filter(Boolean).join('&emsp;');
  const en = d.codeEn || d.nameEn
    ? `<div class="d1-c">Course Code ${e(d.codeEn) || dots(6)}&emsp;Course Title ${e(d.nameEn) || dots(12)}</div>` : '';
  const inds = d.indicators.length ? `
  <div class="d1-h">ตัวชี้วัด</div>
  <table class="d1-tbl">
    <colgroup><col class="d1-code"><col></colgroup>
    <thead><tr><th>รหัสตัวชี้วัด</th><th>ตัวชี้วัด</th></tr></thead>
    <tbody>${d.indicators.map(r => `<tr><td>${e(r.code)}</td><td>${e(r.text)}</td></tr>`).join('')}</tbody>
  </table>
  <div class="d1-total">รวมทั้งหมด ${d.indicators.length} ตัวชี้วัด</div>` : '';
  return `<section class="pg-port">
  <div class="d1-c d1-title">คำอธิบายรายวิชา</div>
  <div class="d1-c">รหัสวิชา ${e(d.codeTh) || dots(6)}&emsp;ชื่อรายวิชา ${e(d.nameTh) || dots(20)}</div>
  ${en}
  <div class="d1-c">${meta}</div>
  ${para(d.descMain) || `<div class="d1-p">${dots(60)}</div>`}
  ${para(d.descPurpose)}${inds}
</section>`;
}

function cdDocTitle(d) { return ['คำอธิบายรายวิชา', d.codeTh, d.nameTh].filter(Boolean).join(' '); }

// พิมพ์ / บันทึกเป็น PDF ผ่านหน้าต่างใหม่ (docPrintWindow ต้องถูกเรียกจากการคลิกโดยตรง) — ใช้ซ้ำที่หน้าวิชา
function cdPrint(d) {
  d = cdNormalize(d, null);
  return docPrintWindow({ title: cdDocTitle(d), css: CD1_CSS, page: CD_PAGE, html: `<div class="cd1">${cdBuildBodyHtml(d)}</div>` });
}

// หน้าตัวอย่างแทนที่ฟอร์มในกล่องเดิม: แผ่น A4 ตัดหน้าด้วยโครงกลาง (docRenderSheets) · "กลับไปแก้ไข" วาดฟอร์มกลับด้วยค่าเดิม
//   โครงกลางเรียกดูแท็บจาก sys.state.tab เพื่อเลิกฟัง resize — หน้านี้ไม่ใช่ระบบเอกสาร จึงส่ง sys จำลอง (ฟังจนกรอบหลุดจากหน้า)
const CD_PREVIEW_SYS = { state: { tab: 'cdesc' } };
function cdShowPreview(container, course, d) {
  container.innerHTML = `
    <div class="doc-preview-bar">
      <button type="button" class="btn btn-ghost btn-sm" id="cd-prev-back">${DOC_ICO_EDIT} กลับไปแก้ไข</button>
      <div class="doc-preview-actions">
        <button type="button" class="btn btn-primary btn-sm" id="cd-prev-print">${DOC_ICO_PRINT} พิมพ์ / บันทึกเป็น PDF</button>
      </div>
    </div>
    <div class="u-note doc-preview-hint">ตัวอย่างจากค่าในฟอร์มตอนนี้ (รวมส่วนที่ยังไม่ได้บันทึก) · กดพิมพ์แล้วเลือก "บันทึกเป็น PDF" ในหน้าต่างพิมพ์ได้ · ใช้ Chrome/Edge จะแบ่งหน้าได้ถูกต้องที่สุด</div>
    <div class="doc-preview-frame-wrap"><iframe class="doc-preview-frame is-fit" title="ตัวอย่างคำอธิบายรายวิชา"></iframe></div>`;
  container.querySelector('#cd-prev-back').addEventListener('click', () => cdShowForm(container, course, d));
  container.querySelector('#cd-prev-print').addEventListener('click', () => cdPrint(d));
  const body = cdBuildBodyHtml(d);
  docRenderSheets(CD_PREVIEW_SYS, 'cdesc', container, null, { // ไม่รอ — แถบแสดงไปก่อน กระดาษตามมา
    html: () => docSheetsHtml(CD1_CSS, `<div class="cd1">${body}</div>`),
    specs: CD_SHEET, bodyClass: 'cd1', keep: '.d1-h', kindOf: () => 'port',
  }).catch(err => console.error('cdShowPreview:', err));
}

async function renderCourseDescTab(container, course) {
  showLoading('cat-sm', container);
  _cdDirty = false;
  let data;
  try {
    const snap = await cdRef(course).get();
    data = cdNormalize(snap.exists ? snap.data() : {}, course);
  } catch (err) {
    console.error(err);
    if (container.isConnected) container.innerHTML = `<div class="card"><div class="empty-state">โหลดคำอธิบายรายวิชาไม่สำเร็จ: ${escapeHtml(err.message || '')}</div></div>`;
    return;
  }
  if (!container.isConnected) return; // ผู้ใช้สลับแท็บ/ออกจากหน้าไปแล้ว
  cdShowForm(container, course, data);
}

// วาดฟอร์มลงกล่อง — ใช้ทั้งตอนเปิดแท็บ และตอนกลับจากหน้าตัวอย่าง (data = ค่าที่พิมพ์ค้างไว้ ไม่ทิ้ง · ธงค่าค้าง _cdDirty ไม่ถูกแตะ)
function cdShowForm(container, course, data) {
  container.innerHTML = cdFormHtml(data);
  const form = container.querySelector('#cd-form');
  const rows = form.querySelector('#cd-ind-rows');

  form.addEventListener('input', () => { _cdDirty = true; });
  form.addEventListener('change', () => { _cdDirty = true; });

  const addRows = (list) => {
    const room = CD_MAX.indRows - rows.querySelectorAll('.cd-ind-row').length;
    if (room <= 0) { showToast(`เพิ่มตัวชี้วัดได้สูงสุด ${CD_MAX.indRows} รายการ`); return 0; }
    const use = list.slice(0, room);
    rows.insertAdjacentHTML('beforeend', use.map(cdIndRowHtml).join(''));
    if (use.length < list.length) showToast(`เพิ่มได้เพียง ${use.length} จาก ${list.length} รายการ (สูงสุด ${CD_MAX.indRows})`);
    _cdDirty = true;
    return use.length;
  };
  form.querySelector('#cd-ind-add').addEventListener('click', () => {
    if (addRows([{}])) rows.lastElementChild.querySelector('input').focus();
  });
  rows.addEventListener('click', (e) => {
    const del = e.target.closest('.cd-ind-del');
    if (!del) return;
    del.closest('.cd-ind-row').remove();
    _cdDirty = true;
  });
  form.querySelector('#cd-paste-add').addEventListener('click', () => {
    const box = form.querySelector('#cd-paste-text');
    const list = cdParseIndicators(box.value);
    if (!list.length) { box.focus(); return; }
    if (addRows(list)) { box.value = ''; showToast(`เพิ่มตัวชี้วัด ${list.length} รายการแล้ว`); }
  });

  form.querySelector('#cd-preview-btn').addEventListener('click', () => cdShowPreview(container, course, cdCollect(form)));

  const saveBtn = form.querySelector('#cd-save-btn');
  saveBtn.addEventListener('click', async () => {
    const doc = cdCollect(form);
    saveBtn.disabled = true;
    saveBtn.textContent = 'กำลังบันทึก…';
    try {
      await cdRef(course).set({ ...doc, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      _cdDirty = false;
      showToast('บันทึกคำอธิบายรายวิชาสำเร็จ');
    } catch (err) {
      console.error(err);
      showToast('บันทึกไม่สำเร็จ: ' + (err.message || ''), 'error');
    }
    saveBtn.disabled = false;
    saveBtn.textContent = CD_SAVE_LABEL;
  });
}
