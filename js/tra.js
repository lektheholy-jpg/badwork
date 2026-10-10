// ==========================================================================
// แผนการอบรม (ระบบเอกสาร "tra") — รายการ · ฟอร์ม · ตัวอย่าง/พิมพ์
//   สร้างโดย tools/new-doc-system.js · โครงเดียวกับ js/idp.js (ใช้ doc-system.js / doc-shell.js ร่วมกับ PA และ ID-Plan)
//   Firestore: users/{uid}/tra_docs/{docId} (อ้างผ่าน sys.col('docs', uid) — ชื่อ collection อยู่ที่ js/tra-config.js)
//   โหลดหลัง js/tra-config.js เสมอ (LAZY_BUNDLES.tra ใน js/utils.js)
//
//   TODO หลังสร้าง
//     1) เพิ่มช่องของเอกสารจริง: traNormalize (ค่าเริ่มต้น) · traCollect (อ่านจากฟอร์ม) · traRenderFormView (HTML) · traBuildPreviewHtml (หน้าพิมพ์)
//        ช่องที่ให้ AI เขียนต้องมี id = tra-<ช่อง> และเพิ่มใน prompts.fields (js/tra-config.js) + traAiSpecs (js/tra-ai.js)
//     2) ถ้ามีรายการหลายแถว (รายวิชา ฯลฯ) ใช้ตัวสร้างกลาง docLBlockHtml / docLBind / docLRows ใน js/doc-shell.js แทนการเขียนเอง
//     3) ฟังก์ชันบันทึกต้องตัดคีย์ที่ขึ้นต้น _ (ข้อมูลชั่วคราว) — traSave ทำให้แล้ว
// ==========================================================================

const TRA_ICO_DOC = `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><g fill="currentColor" stroke="none"><path opacity=".55" d="M7 2.5h7l5.5 5.5v11A2.5 2.5 0 0 1 17 21.5H7A2.5 2.5 0 0 1 4.5 19V5A2.5 2.5 0 0 1 7 2.5Z"/><rect x="8" y="9" width="8" height="1.5" rx=".75"/><rect x="8" y="12" width="8" height="1.5" rx=".75"/><rect x="8" y="15" width="5" height="1.5" rx=".75"/></g></svg>`;
const TRA_SAVE_LABEL = 'บันทึก แผนการอบรม'; // ป้ายปุ่มบันทึก (ข้อความล้วน อยู่ท้ายฟอร์ม) — ตัวต่อ AI ใช้ข้อความเดียวกัน (copy.saveLabel)

function traUpdatedAt(d) {
  const t = d.updatedAt || d.createdAt;
  const dt = t && typeof t.toDate === 'function' ? t.toDate() : null;
  return dt ? 'แก้ไขล่าสุด ' + dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

// ข้อมูลผู้จัดทำดึงจากหน้า "ข้อมูลส่วนตัว" (อ่านไม่ได้ = null → ตัวอย่างพิมพ์ใช้จุดไข่ปลาแทน)
async function traGetProfile() {
  try {
    await loadModule('profile');
    return await loadTeacherProfile();
  } catch (e) {
    return AppState.teacherProfile || null;
  }
}
function traProfileInfo(p) {
  p = p || {};
  const name = [(p.prefix || '') + (p.firstName || ''), p.lastName || ''].filter(Boolean).join(' ');
  const position = [p.position, p.academicStanding].filter(Boolean).join(' ');
  return { name, position, school: p.school || '', affiliation: p.affiliation || '' };
}

// ------------------------------------------------------------------
// Firestore
// ------------------------------------------------------------------
function traCol(uid) {
  return docSystem('tra').col('docs', uid);
}

async function traLoadList() {
  const uid = AppState.user?.uid;
  if (!uid) return [];
  const snap = await traCol(uid).orderBy('createdAt', 'desc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// อย่า await การเขียนในจุดที่บล็อกการแสดงหน้า (ออฟไลน์ promise ค้าง) — ที่นี่ผู้เรียกรอเพื่อแสดงสถานะ "กำลังบันทึก…" เท่านั้น (เหมือน idpSave)
async function traSave(data) {
  const sys = docSystem('tra');
  const uid = AppState.user?.uid;
  if (!uid) throw new Error('ยังไม่ได้เข้าสู่ระบบ');
  const now = firebase.firestore.FieldValue.serverTimestamp();
  const { id: _id, createdAt: _c, updatedAt: _u, ...clean } = data;
  Object.keys(clean).forEach(k => { if (k[0] === '_') delete clean[k]; }); // คีย์ขึ้นต้น _ = ข้อมูลชั่วคราว ไม่บันทึก
  if (sys.state.docId) {
    await traCol(uid).doc(sys.state.docId).update({ ...clean, updatedAt: now });
    return sys.state.docId;
  }
  const ref = await traCol(uid).add({ ...clean, createdAt: now, updatedAt: now });
  sys.state.docId = ref.id;
  return ref.id;
}

async function traDelete(docId) {
  const sys = docSystem('tra');
  const uid = AppState.user?.uid;
  if (!uid) return;
  await traCol(uid).doc(docId).delete();
  sys.state.list = null;
}

// ------------------------------------------------------------------
// Normalize / blank doc
// ------------------------------------------------------------------
function traNormalize(d) {
  d = d || {};
  d.semester = String(d.semester || '1');
  d.year     = String(d.year || String(new Date().getFullYear() + 543));
  d.signDate = String(d.signDate || '');
  d.title    = String(d.title || '');
  d.body     = String(d.body || '');
  d.status   = d.status || 'draft';
  d.aiCtx    = d.aiCtx && typeof d.aiCtx === 'object' ? d.aiCtx : {};
  return d;
}

function traBlankDoc() {
  return traNormalize({ semester: '1', year: String(new Date().getFullYear() + 543), status: 'draft' });
}

function traDocTitle(d) {
  const term = `ภาคเรียนที่ ${d.semester || '—'} ปีการศึกษา ${d.year || '—'}`;
  return d.title ? `${d.title} · ${term}` : term;
}

// ------------------------------------------------------------------
// Collect form data → state.doc
// ------------------------------------------------------------------
function traCollect() {
  const sys = docSystem();
  if (!document.getElementById('tra-form')) return;
  const get = id => (document.getElementById(id)?.value || '').trim();
  const doc = sys.state.doc;

  doc.semester = get('tra-semester');
  doc.year     = get('tra-year');
  doc.signDate = get('tra-signDate');
  doc.title    = get('tra-title');
  doc.body     = get('tra-body');
  if (document.getElementById('tra-status')) doc.status = document.getElementById('tra-status').value || 'draft';

  // บริบทงานของผู้ช่วย AI — ช่องอยู่ในการ์ดที่ badwork-ai.js ติดให้ · ถ้าไม่มีช่อง (ไม่ได้โหลดไฟล์ AI) คงค่าเดิมไว้
  const ax = sys.config.aiCtx, aiCtx = {};
  Object.entries(ax.maxLen).forEach(([k, n]) => {
    aiCtx[k] = document.getElementById(ax.idPrefix + k) ? get(ax.idPrefix + k).slice(0, n) : (doc.aiCtx?.[k] || '');
  });
  doc.aiCtx = aiCtx;
}

// ------------------------------------------------------------------
// LIST VIEW
// ------------------------------------------------------------------
async function traRenderListView() {
  const sys = docSystem();
  const root = docMount();
  const seq = sys.state.seq;
  docShowLoading(root);

  try {
    if (!sys.state.list) sys.state.list = await traLoadList();
    if (docStale(root, seq, sys) || sys.state.tab !== 'form' || sys.state.view !== 'list') return;
    const list = sys.state.list;
    root.innerHTML = docListHtml({
      list, icon: TRA_ICO_DOC, hue: 'orange',
      title: d => traDocTitle(d),
      sub: d => traUpdatedAt(d),
      actions: ['print', 'dup', 'edit', 'del'],
      emptyTitle: 'ยังไม่มี แผนการอบรม',
      emptySub: 'กดปุ่มด้านล่างเพื่อสร้าง แผนการอบรม ฉบับแรก',
      newLabel: 'สร้าง แผนการอบรม ใหม่',
    });
    docSwapIn(root);

    const openEdit = id => {
      const found = list.find(d => d.id === id);
      if (!found) return;
      sys.state.docId = id;
      sys.state.doc = traNormalize(JSON.parse(JSON.stringify(found)));
      sys.state.view = 'form';
      traRenderFormView();
    };
    docBindList(root, {
      create: () => {
        sys.state.doc = traBlankDoc();
        sys.state.docId = null;
        sys.state.view = 'form';
        traRenderFormView();
      },
      open: openEdit,
      edit: openEdit,
      dup: id => {
        const found = list.find(d => d.id === id);
        if (!found) return;
        const d = traNormalize(JSON.parse(JSON.stringify(found)));
        ['id', 'createdAt', 'updatedAt'].forEach(k => { delete d[k]; });
        d.status = 'draft';
        sys.state.docId = null;
        sys.state.doc = d;
        sys.state.view = 'form';
        traRenderFormView();
        showToast('คัดลอกแล้ว — แก้ไขตามต้องการ แล้วกด “บันทึก” จะได้เป็นฉบับใหม่');
      },
      print: id => {
        const found = list.find(d => d.id === id);
        if (!found) return;
        sys.state.docId = id;
        sys.state.doc = traNormalize(JSON.parse(JSON.stringify(found)));
        sys.state.view = 'form'; // ตัวอย่าง/พิมพ์ อ่านจากเอกสารที่เปิดอยู่
        docSwitchTab('preview');
      },
      del: async id => { await traDelete(id); await traRenderListView(); },
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
async function traRenderFormView() {
  const sys = docSystem();
  const root = docMount();
  const seq = sys.state.seq;

  const doc = sys.state.doc || traBlankDoc();
  sys.state.doc = doc;

  root.innerHTML = `
  <div class="pa-form-head">
    <button type="button" class="btn btn-ghost btn-sm" id="tra-back-btn">← กลับ</button>
    <div>
      <h2 class="pa-form-title">แผนการอบรม · ${sys.state.docId ? 'แก้ไขเอกสาร' : 'สร้างเอกสารใหม่'}</h2>
    </div>
  </div>
  <form id="tra-form" class="doc-form" autocomplete="off" novalidate>

    <!-- แถบบนฟอร์ม -->
    <div class="doc-form-header">
      <div class="doc-form-meta">
        <label>ภาคเรียนที่
          <select id="tra-semester">
            <option value="1"${doc.semester === '1' ? ' selected' : ''}>1</option>
            <option value="2"${doc.semester === '2' ? ' selected' : ''}>2</option>
          </select>
        </label>
        <label>ปีการศึกษา
          <input id="tra-year" type="text" inputmode="numeric" maxlength="4" value="${escapeHtml(doc.year)}">
        </label>
        <label>วันที่ลงนาม
          <input id="tra-signDate" type="text" placeholder="เช่น 8 มิ.ย. 2569" value="${escapeHtml(doc.signDate)}">
        </label>
        <label>สถานะ
          <select id="tra-status">
            <option value="draft"${(doc.status || 'draft') === 'draft' ? ' selected' : ''}>ร่าง</option>
            <option value="submitted"${doc.status === 'submitted' ? ' selected' : ''}>ส่งแล้ว</option>
          </select>
        </label>
      </div>
    </div>

    <!-- ส่วนที่ 1: เนื้อหา (ตัวอย่างโครง — แทนด้วยหัวข้อจริงของเอกสาร) -->
    <section class="doc-section">
      <h2 class="doc-sec-title">ส่วนที่ 1  เนื้อหา</h2>
      <div class="field"><label for="tra-title">ชื่อเอกสาร / เรื่อง</label>
        <input id="tra-title" type="text" maxlength="120" value="${escapeHtml(doc.title)}">
      </div>
      <div class="field u-mt-4"><label for="tra-body">เนื้อหา</label>
        <textarea id="tra-body" rows="6">${escapeHtml(doc.body)}</textarea>
      </div>
    </section>

    <div class="pa-form-footer">
      ${sys.state.docId ? `<button type="button" class="btn btn-danger-ghost" id="tra-del-btn">${DOC_ICO_DEL} ลบ</button>` : ''}
      <button type="button" class="btn btn-ghost" id="tra-cancel-btn">ยกเลิก</button>
      <button type="button" class="btn btn-primary" id="tra-save-btn">${TRA_SAVE_LABEL}</button>
    </div>

  </form>`;
  docSwapIn(root);
  if (typeof badworkAiMount === 'function') badworkAiMount(root, document.getElementById('tra-form'), sys); // ปุ่มผู้ช่วย AI (js/badwork-ai.js + ตัวต่อ js/tra-ai.js) — ไม่มีไฟล์นี้ฟอร์มก็ทำงานตามเดิม

  ['tra-back-btn', 'tra-cancel-btn'].forEach(id => document.getElementById(id)?.addEventListener('click', () => {
    traCollect();
    sys.state.view = 'list';
    traRenderListView();
  }));

  document.getElementById('tra-save-btn')?.addEventListener('click', async () => {
    traCollect();
    const btn = document.getElementById('tra-save-btn');
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก…';
    try {
      sys.state.doc.status = sys.state.doc.status || 'draft';
      await traSave(sys.state.doc);
      sys.state.list = null; // force reload list
      showToast('บันทึกแล้ว');
    } catch (e) {
      showToast('บันทึกไม่สำเร็จ: ' + e.message, 'error');
    }
    btn.disabled = false;
    btn.textContent = TRA_SAVE_LABEL;
  });

  document.getElementById('tra-del-btn')?.addEventListener('click', async () => {
    if (!confirm('ลบ แผนการอบรม นี้?')) return;
    try {
      await traDelete(sys.state.docId);
      sys.state.docId = null;
      sys.state.doc = null;
      sys.state.view = 'list';
      traRenderListView();
    } catch (e) {
      showToast('ลบไม่สำเร็จ: ' + e.message, 'error');
    }
  });
}

// ------------------------------------------------------------------
// PRINT CSS — A4 แนวตั้งหน้าเดียวขึ้นไป (ขอบ 2/2/2/2.5 ซม. เหมือน ID-Plan หน้าแรก)
//   ใช้ named page (@page tra-port) ให้ตรงกับ TRA_SHEET.port ด้านล่าง · ต้องการหน้าแนวนอนให้เพิ่ม @page tra-land + .pg-land (ดู IDP1_CSS ใน js/idp.js)
// ------------------------------------------------------------------
const TRA1_CSS = `
@page{size:A4 portrait;margin:2cm 2cm 2cm 2.5cm}
@page tra-port{size:A4 portrait;margin:2cm 2cm 2cm 2.5cm}
.tra1 .pg-port{page:tra-port}
.tra1{background:#fff;color:#000;font-family:'TH SarabunPSK','TH Sarabun PSK','THSarabunPSK','TH Sarabun New','THSarabunNew','PA Sarabun','Noto Sans Thai',Tahoma,sans-serif;font-size:16pt;line-height:1.22}
.tra1 *{box-sizing:border-box}
.tra1 b{font-weight:700}
.tra1 .d1-c{text-align:center;font-weight:700}
.tra1 .d1-h{font-weight:700;margin-top:.7em;break-after:avoid;page-break-after:avoid}
.tra1 .d1-h.d1-h0{margin-top:0}
.tra1 .d1-body{margin-top:.5em;overflow-wrap:anywhere}
.tra1 .d1-sign{margin:2em 2cm 0 auto;width:9cm;text-align:center;break-inside:avoid;page-break-inside:avoid}
.tra1 .d1-break{break-before:page;page-break-before:always;height:0}
.tra1 .d1-mt3{margin-top:.3em}
@media screen{
  .tra1 .pg-port{padding:.4em 1em}
}
`;

// ------------------------------------------------------------------
// Build preview HTML — เนื้อหาตัวอย่างโครง (หัวเรื่อง + เนื้อหา + ลงชื่อผู้จัดทำ) แทนด้วยแบบฟอร์มจริงของเอกสาร
// ------------------------------------------------------------------
function traBuildPreviewHtml(d, profile) {
  d = traNormalize(d);
  const pi = traProfileInfo(profile);
  const dots = n => '…'.repeat(n);
  const name = pi.name || dots(20);
  const nl = t => escapeHtml(t || '').replace(/\n/g, '<br>');
  const term = `ภาคเรียนที่ ${escapeHtml(d.semester)} ประจำปีการศึกษา ${escapeHtml(d.year)}`;

  return docSheetsHtml(TRA1_CSS, `<div class="tra1">

<section class="pg-port">
  <div class="d1-c">${escapeHtml(d.title || 'แผนการอบรม')}</div>
  <div class="d1-c">${term}</div>
  <div class="d1-h">ส่วนที่ 1  เนื้อหา</div>
  <div class="d1-body">${d.body ? nl(d.body) : dots(40)}</div>

  <div class="d1-sign">
    <div>ผู้จัดทำ</div>
    <div>(${escapeHtml(name)})</div>${d.signDate ? `
    <div class="d1-mt3">วันที่ ${escapeHtml(d.signDate)}</div>` : ''}
  </div>
</section>

</div>`);
}

// ------------------------------------------------------------------
// PREVIEW VIEW — แผ่นกระดาษ A4 เหมือนตอนพิมพ์ (ชุดเดียวกับ PA/ID-Plan — docRenderPreview({ sheets }))
//   อ่านจากเอกสารที่เปิดอยู่ (รวมฉบับที่ยังไม่บันทึก) · เลือกดูฉบับอื่นที่บันทึกไว้ได้จากรายการด้านบน
// ------------------------------------------------------------------
const TRA_SHEET = {
  port: { w: 210, h: 297, pad: [20, 20, 20, 25], label: 'A4 แนวตั้ง' }, // mm [บน, ขวา, ล่าง, ซ้าย] — ต้องตรงกับ @page tra-port
};

async function traRenderPreviewView(pickId) {
  const sys = docSystem();
  return docRenderPreview({ // โครงกลางใน js/doc-shell.js (แถบเลือก · ปุ่ม · สถานะว่าง · แผ่นกระดาษตัดหน้า)
    sys, tab: 'preview',
    load: async () => {
      const open = sys.state.doc && sys.state.view === 'form' ? sys.state.doc : null;
      let list = [];
      try { list = await traLoadList(); } catch (e) { /* โหลดรายการไม่ได้ → ดูได้เฉพาะเอกสารที่เปิดอยู่ */ }
      // รายการให้เลือก: เอกสารที่เปิดอยู่มาก่อน (ฉบับที่ยังไม่บันทึกก็ดูได้) ตามด้วยที่บันทึกไว้
      const openKey = open ? (sys.state.docId || '__open__') : null;
      const items = [];
      if (open) items.push({ id: openKey, label: `${traDocTitle(open)} · ${sys.state.docId ? 'กำลังแก้ไข' : 'ฉบับที่ยังไม่บันทึก'}` });
      list.filter(x => x.id !== openKey).forEach(x => items.push({ id: x.id, label: traDocTitle(x) }));
      if (!items.length) return { items };
      const pid = items.some(x => x.id === pickId) ? pickId : items[0].id;
      const d = pid === openKey ? open : traNormalize(JSON.parse(JSON.stringify(list.find(x => x.id === pid))));
      const profile = await traGetProfile(); // อ่านล่าสุดทุกครั้งที่เปิดตัวอย่าง — แก้ข้อมูลส่วนตัวแล้วพิมพ์ได้เลย
      return { items, pickId: pid, d, open, openKey, profile };
    },
    selectLabel: 'เลือกเอกสาร',
    empty: { icon: TRA_ICO_DOC, title: 'ยังไม่มี แผนการอบรม', sub: 'สร้างเอกสารก่อน แล้วดูตัวอย่างและพิมพ์ที่นี่', gotoLabel: 'ไปที่แบบฟอร์ม', gotoTab: 'form' },
    hint: () => 'กดพิมพ์แล้วเลือก "บันทึกเป็น PDF" ในหน้าต่างพิมพ์ได้ · ใช้ Chrome/Edge จะแบ่งหน้าได้ถูกต้องที่สุด',
    sheets: ctx => ({ // แผ่นกระดาษตัดโดยโครงกลาง (docPaginate)
      html: () => traBuildPreviewHtml(ctx.d, ctx.profile),
      specs: TRA_SHEET, bodyClass: 'tra1', keep: '.d1-h', breakSel: '.d1-break',
      kindOf: () => 'port',
      fonts: [...DOC_FONT_SPECS, "13pt 'PA Sarabun'"],
    }),
    onPick: id => traRenderPreviewView(id),
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
// ลงทะเบียน UI ของระบบ แผนการอบรม
// ------------------------------------------------------------------
registerDocUi('tra', {
  tabs: {
    preview: () => traRenderPreviewView(),
    default: sys => sys.state.view === 'form' ? traRenderFormView() : traRenderListView(),
  },
  beforeLeave(sys) {
    if (sys.state.tab === 'form' && sys.state.view === 'form') traCollect();
  },
});
