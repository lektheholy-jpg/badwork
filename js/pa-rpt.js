// ==========================================================================
// แบบฟอร์มรายงานผลข้อตกลง (Personal Agreement) — แท็บ 'rpt' ในหน้า Personal Agreement
// รูปแบบตาม "แบบรายงานผลข้อตกลงในการพัฒนางาน (PA)" ของ สพฐ. · Firestore: users/{uid}/pa_reports/{docId}
// โครงเอกสาร: ข้อมูลผู้รายงาน (คะแนนประเมินตนเอง · ชั่วโมงสอน · วันลา) → ผลการปฏิบัติงาน 15 ข้อ (รายละเอียด + เอกสารอ้างอิง)
//            → 4. ประเด็นท้าทาย → 5. งานที่ได้รับมอบหมาย → ลงนาม → ตารางเอกสารอ้างอิง
// ฟิลด์ระดับบน (≤ 30 ตาม firestore.rules validDoc): fiscalYear, status, selfScore, teachHours, leave{}, items{},
//   challengeTitle, problem, method, outcomeQuant, outcomeQual, assigned, signDate, owner{}, agreementId
// พึ่งพา pa.js (PAState, paMount, paSwapIn, PA_WORK_ITEMS, PA1_CSS, paFontCss, ไอคอน/ตัวช่วย) — โหลดหลัง pa.js
// ==========================================================================

const PARptState = {
  view: 'list',  // 'list' | 'form'
  docId: null,   // null = สร้างใหม่
  doc: null,
  list: null,
  previewId: null, // เอกสารที่เลือกดู/พิมพ์ในแท็บ 'rptprev'
};

function parptCol(uid) {
  return db.collection('users').doc(uid).collection('pa_reports');
}

// เติมค่าเริ่มต้นให้ครบทุกฟิลด์
function parptNormalize(d) {
  d = d || {};
  const s = k => String(d[k] == null ? '' : d[k]);
  const lv = d.leave && typeof d.leave === 'object' ? d.leave : {};
  const out = {
    fiscalYear: s('fiscalYear'),
    status: d.status === 'submitted' ? 'submitted' : 'draft',
    selfScore: s('selfScore'),
    teachHours: s('teachHours'),
    leave: {
      sickTimes: String(lv.sickTimes == null ? '' : lv.sickTimes), sickDays: String(lv.sickDays == null ? '' : lv.sickDays),
      bizTimes: String(lv.bizTimes == null ? '' : lv.bizTimes), bizDays: String(lv.bizDays == null ? '' : lv.bizDays),
    },
    items: {},
  };
  const it = d.items && typeof d.items === 'object' ? d.items : {};
  Object.keys(it).forEach(k => { out.items[k] = { text: String((it[k] && it[k].text) || ''), ref: String((it[k] && it[k].ref) || '') }; });
  ['challengeTitle', 'problem', 'method', 'outcomeQuant', 'outcomeQual', 'assigned', 'signDate', 'agreementId'].forEach(k => { out[k] = s(k); });
  if (d.owner && typeof d.owner === 'object') out.owner = d.owner;
  return out;
}

// คัดลอกแบบรายงานผลเป็นฉบับร่างใหม่ (ยังไม่บันทึกจนกว่าจะกดบันทึก) — เหมือน paDuplicate ของฝั่งข้อตกลง
function parptDuplicate(src) {
  const d = parptNormalize(JSON.parse(JSON.stringify(src)));
  ['id', 'createdAt', 'updatedAt', 'owner'].forEach(k => { delete d[k]; }); // owner ดึงจากโปรไฟล์ปัจจุบันตอนบันทึก
  d.status = 'draft';
  d.signDate = '';
  PARptState.docId = null;
  PARptState.doc = d;
  PARptState.view = 'form';
  parptRenderForm();
  showToast('คัดลอกแล้ว — แก้ไขตามต้องการ แล้วกด “บันทึกแบบรายงานผล” จะได้เป็นฉบับใหม่');
}

function parptBlank() {
  return parptNormalize({ fiscalYear: String(paFiscalYear()), status: 'draft' });
}

async function parptLoadList() {
  const uid = AppState.user?.uid;
  if (!uid) return [];
  const snap = await parptCol(uid).orderBy('createdAt', 'desc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function parptSave(data) {
  const uid = AppState.user?.uid;
  if (!uid) throw new Error('ยังไม่ได้เข้าสู่ระบบ');
  const now = firebase.firestore.FieldValue.serverTimestamp();
  const { id: _id, createdAt: _c, updatedAt: _u, ...clean } = data;
  Object.keys(clean).forEach(k => { if (k[0] === '_') delete clean[k]; });
  if (PARptState.docId) {
    await parptCol(uid).doc(PARptState.docId).update({ ...clean, updatedAt: now });
    return PARptState.docId;
  }
  const ref = await parptCol(uid).add({ ...clean, createdAt: now, updatedAt: now });
  PARptState.docId = ref.id;
  return ref.id;
}

async function parptDelete(id) {
  const uid = AppState.user?.uid;
  if (!uid) return;
  await parptCol(uid).doc(id).delete();
  PARptState.list = null;
}

// เติมช่องที่ยังว่างจาก Personal Agreement (ปีงบประมาณเดียวกัน ไม่มีก็ใช้ฉบับล่าสุด) — ไม่ทับสิ่งที่พิมพ์ไว้แล้ว
async function parptPullAgreement(doc) {
  const uid = AppState.user?.uid;
  const list = (await paCol(uid).orderBy('createdAt', 'desc').get()).docs.map(x => ({ id: x.id, ...x.data() }));
  const src = list.find(a => String(a.fiscalYear) === String(doc.fiscalYear)) || list[0];
  if (!src) return 0;
  const a = paNormalize(JSON.parse(JSON.stringify(src)));
  let n = 0;
  const put = (k, v) => { if (v && !doc[k]) { doc[k] = v; n++; } };
  ['challengeTitle', 'problem', 'method', 'outcomeQuant', 'outcomeQual'].forEach(k => put(k, a[k]));
  const hrs = paSum(a.load.subjects) + paSum(a.load.activities);
  put('teachHours', hrs ? paFmtH(hrs) : '');
  Object.keys(a.workItems).forEach(id => {
    const w = a.workItems[id];
    const txt = [w.s1, w.s2].filter(Boolean).join('\n');
    const cur = doc.items[id] || (doc.items[id] = { text: '', ref: '' });
    if (txt && !cur.text) { cur.text = txt; n++; }
  });
  doc.agreementId = src.id;
  return n;
}

// ------------------------------------------------------------------
// เอกสารสำหรับพิมพ์ (ใช้ PA1_CSS / paFontCss ร่วมกับแบบข้อตกลง)
// ------------------------------------------------------------------
function parptBuildDocHtml(d, o) {
  d = parptNormalize(d);
  o = o || {};
  const e = escapeHtml;
  const dots = '……………………………';
  const val = (v, fb = dots) => v ? `<b>${e(v)}</b>` : fb;
  const paras = (v, cls) => {
    const ls = String(v || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
    return ls.length ? ls.map(s => `<div class="${cls}">${e(s)}</div>`).join('') : `<div class="${cls}">${dots}</div>`;
  };
  const nm = String(o.name || '').trim().match(/^(\S+)\s*(.*)$/) || [];
  const lv = d.leave;
  const sd = paNum(lv.sickDays), bd = paNum(lv.bizDays);
  const leaveTotal = (sd || bd) ? paFmtH(sd + bd) : dots;
  const group = (o.subjectGroup || '');

  const sections = PA_WORK_ITEMS.map(([, gt, items]) =>
    `<div class="p1-h mt5">${e(gt)}</div>` + items.map(([id, label]) => {
      const w = d.items[id] || {};
      return `<div class="p1-ind1 keep-next mt3"><b>${id} ${e(label)}</b></div>${paras(w.text, 'p1-p')}`;
    }).join('')).join('');

  const refRows = PA_WORK_ITEMS.map(([, gt, items]) =>
    `<tr class="grp"><td colspan="3">${e(gt)}</td></tr>` + items.map(([id, label]) => {
      const w = d.items[id] || {};
      return `<tr><td>${id}</td><td>${e(label)}</td><td>${paNl(w.ref)}</td></tr>`;
    }).join('')).join('');

  const sign = (name, pos, role, date) => `<div class="p1-sign">
      <div>ลงชื่อ........................................................................</div>
      <div>(${e(name || '………………………………')})</div>
      <div>ตำแหน่ง ${e(pos || '………………')}</div>
      <div>${role}</div>${date !== undefined ? `<div>${e(date || '................/.............../...................')}</div>` : ''}
    </div>`;

  return `<div class="pa1">
    <div class="p1-c">แบบรายงานผลข้อตกลงในการพัฒนางาน (PA) ประจำปีงบประมาณ ${e(d.fiscalYear || '…………')}</div>
    <div class="p1-sp"></div>
    <div>ชื่อ ${val(nm[1])} สกุล ${val(nm[2])} ตำแหน่ง ${val(o.position || 'ครู')} วิทยฐานะ ${val(o.standing)}</div>
    <div>กลุ่มสาระการเรียนรู้ ${val(group)}</div>
    <div>คะแนนประเมินตนเอง ${val(d.selfScore)} คะแนน</div>
    <div>ชั่วโมงการสอน ${val(d.teachHours)} ชั่วโมง/สัปดาห์</div>
    <div>จำนวนวันลาในรอบการประเมิน ${(sd || bd) ? `<b>${leaveTotal}</b>` : dots} วัน ประกอบด้วย</div>
    <div class="p1-ind1">1) ลาป่วย จำนวน ${val(lv.sickTimes, '……')} ครั้ง ${val(lv.sickDays, '……')} วัน</div>
    <div class="p1-ind1">2) ลากิจ จำนวน ${val(lv.bizTimes, '……')} ครั้ง ${val(lv.bizDays, '……')} วัน</div>

    <div class="p1-h mt10">ผลการปฏิบัติงานตามมาตรฐานตำแหน่ง</div>
    ${sections}

    <div class="p1-h mt10">4. ความสำเร็จในการพัฒนางานที่เสนอเป็นประเด็นท้าทาย ในการพัฒนาผลลัพธ์การเรียนรู้ของผู้เรียน</div>
    <div class="p1-p">เรื่อง ${val(d.challengeTitle)}</div>
    <div class="p1-hd mt3">1. สภาพปัญหาของผู้เรียนและการจัดการเรียนรู้</div>${paras(d.problem, 'p1-p')}
    <div class="p1-hd mt3">2. วิธีการดำเนินการให้บรรลุผล</div>${paras(d.method, 'p1-p')}
    <div class="p1-hd mt3">3. ผลลัพธ์การพัฒนาที่คาดหวัง</div>
    <div class="p1-ind2 mt2">3.1 เชิงปริมาณ</div>${paras(d.outcomeQuant, 'p1-tx')}
    <div class="p1-ind2 mt2">3.2 เชิงคุณภาพ</div>${paras(d.outcomeQual, 'p1-tx')}

    <div class="p1-h mt10">5. ความสำเร็จที่ได้รับมอบหมายจากผู้บังคับบัญชา</div>${paras(d.assigned, 'p1-p')}

    ${sign(o.name, [o.position, o.standing].filter(Boolean).join(' วิทยฐานะ'), 'ผู้รายงาน', paThaiDate(d.signDate))}
    <div class="p1-dir">
      ${sign(o.director, 'ผู้อำนวยการ' + (o.school || ''), 'ผู้รับรอง')}
    </div>

    <div class="p1-break"></div>
    <div class="p1-c">เอกสารอ้างอิง</div>
    <table>
      <colgroup><col style="width:9%"><col style="width:50%"><col style="width:41%"></colgroup>
      <thead><tr><th><b>ข้อที่</b></th><th><b>รายละเอียด</b></th><th><b>เอกสารอ้างอิง</b></th></tr></thead>
      <tbody>${refRows}</tbody>
    </table>
  </div>`;
}

function parptPrint(d, o) {
  const w = window.open('', '_blank');
  if (!w) { showToast('เบราว์เซอร์บล็อกหน้าต่างพิมพ์ — อนุญาต pop-up แล้วลองใหม่'); return; }
  const title = `PA_Report_${(o && o.name) || ''}_${d.fiscalYear || ''}`.replace(/\s+/g, '_');
  w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
    <style>${paFontCss()}${PA1_CSS}@page{size:A4;margin:16mm 14mm}html,body{margin:0;background:#fff}</style></head>
    <body>${parptBuildDocHtml(d, o)}</body></html>`);
  w.document.close();
  w.focus();
  const go = () => { try { w.print(); } catch (err) { /* ผู้ใช้สั่งพิมพ์เองได้ */ } };
  const fl = w.document.fonts;
  if (fl && fl.load) {
    const loads = Promise.allSettled(["16pt 'PA Sarabun'", "bold 16pt 'PA Sarabun'"].map(f => fl.load(f, 'กa')));
    Promise.race([loads, new Promise(r => setTimeout(r, 2500))]).then(() => setTimeout(go, 150));
  } else setTimeout(go, 600);
}

// ------------------------------------------------------------------
// แท็บ "ตัวอย่าง / พิมพ์ รายงานผล" — ทำงานเหมือนแท็บ "ตัวอย่าง / พิมพ์ PA 1" (js/pa-report.js)
// แสดงแบบรายงานผลเป็นหน้า A4 + ปุ่มพิมพ์/บันทึกเป็น PDF (ใช้ parptBuildDocHtml / parptPrint ข้างบน)
// ------------------------------------------------------------------
async function renderPARptPreviewView() {
  const view = paMount();
  const seq = PAState.seq;
  paShowLoading(view);

  let list = [];
  try {
    list = await parptLoadList();
    PARptState.list = list;
  } catch (err) {
    if (paStale(view, seq) || PAState.tab !== 'rptprev') return;
    clearLoading(view);
    view.classList.remove('is-switching');
    view.innerHTML = `<div class="card card-pad"><div class="empty-state">โหลดข้อมูลไม่สำเร็จ: ${escapeHtml(err.message)}</div></div>`;
    return;
  }

  const d0 = list.find(x => x.id === PARptState.previewId) || list[0] || null;
  const { owner } = await parptOwner(d0);

  if (paStale(view, seq) || PAState.tab !== 'rptprev') return; // สลับแท็บระหว่างรอข้อมูล — ไม่วาดทับ

  if (!d0) {
    view.innerHTML = `
      <div class="card">
        <div class="empty-state">
          <div class="icon icon-violet">${PA_ICO_PA}</div>
          <div class="empty-title">ยังไม่มีแบบรายงานผล</div>
          <div class="empty-sub">สร้างแบบรายงานผลก่อน แล้วดูตัวอย่างและพิมพ์ที่นี่</div>
          <button type="button" class="btn btn-primary parp-goto-rpt">ไปที่แบบฟอร์มรายงานผล</button>
        </div>
      </div>`;
    view.querySelector('.parp-goto-rpt').addEventListener('click', () => paSwitchTab('rpt'));
    paSwapIn(view);
    return;
  }

  const d = d0;
  PARptState.previewId = d.id;

  view.innerHTML = `
    <div class="parp-bar">
      <select id="parp-select" aria-label="เลือกแบบรายงานผล">
        ${list.map(x => `<option value="${escapeHtml(x.id)}"${x.id === d.id ? ' selected' : ''}>${escapeHtml(paDocTitle(x))}${x.status === 'submitted' ? ' · ส่งแล้ว' : ' · ร่าง'}</option>`).join('')}
      </select>
      <div class="parp-actions">
        <button type="button" class="btn btn-ghost btn-sm parp-edit">${PA_ICO_EDIT} แก้ไข</button>
        <button type="button" class="btn btn-primary btn-sm parp-print">${PA_ICO_PRINT} พิมพ์ / บันทึกเป็น PDF</button>
      </div>
    </div>
    <div class="u-note parp-hint">ตัวอย่างแบบรายงานผลข้อตกลงในการพัฒนางาน (PA) — กดพิมพ์แล้วเลือก "บันทึกเป็น PDF" ในหน้าต่างพิมพ์ได้ · ช่องลงนามและความเห็น ผอ. เว้นไว้ให้เซ็นบนกระดาษ</div>
    <div class="parp-paper"><style>${paFontCss()}${PA1_CSS}</style>${parptBuildDocHtml(d, owner)}</div>
    <style>
      .parp-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:8px}
      .parp-bar select{min-width:0;max-width:100%}
      .parp-actions{display:flex;gap:8px}
      .parp-actions .ico{width:16px;height:16px}
      .parp-hint{margin-bottom:12px}
      .parp-paper{width:fit-content;max-width:100%;margin:0 auto;background:#fff;color:#000;border-radius:var(--radius-s);box-shadow:0 0 0 1px var(--border);overflow-x:auto}
      .parp-paper .pa1{box-sizing:border-box;width:210mm;padding:16mm 14mm}
      @media(max-width:600px){.parp-actions{width:100%}.parp-actions .btn{flex:1}}
    </style>`;

  // แสดงเป็นหน้า A4 ขนาดจริง แล้วย่อให้พอดีความกว้างจอ (zoom) — พิมพ์ออกมาเหมือนที่เห็น
  const fit = () => {
    const paper = view.querySelector('.parp-paper'), pg = paper && paper.querySelector('.pa1');
    if (!pg) return;
    pg.style.zoom = 1;
    pg.style.zoom = Math.min(1, paper.clientWidth / pg.offsetWidth);
  };
  requestAnimationFrame(fit);
  const onResize = () => { if (!view.isConnected || PAState.tab !== 'rptprev') window.removeEventListener('resize', onResize); else fit(); };
  window.addEventListener('resize', onResize);

  view.querySelector('#parp-select').addEventListener('change', e => {
    PARptState.previewId = e.target.value;
    renderPARptPreviewView();
  });
  view.querySelector('.parp-print').addEventListener('click', () => parptPrint(d, owner));
  view.querySelector('.parp-edit').addEventListener('click', () => {
    PARptState.docId = d.id;
    PARptState.doc = parptNormalize(JSON.parse(JSON.stringify(d)));
    PARptState.view = 'form';
    paSwitchTab('rpt'); // paSwitchTab วาดฟอร์มให้เอง (PARptState.view = 'form')
  });

  paSwapIn(view);
}

// ------------------------------------------------------------------
// เข้าแท็บ: รายการ | ฟอร์ม
// ------------------------------------------------------------------
function renderPARptView() {
  return PARptState.view === 'form' ? parptRenderForm() : parptRenderList();
}

// ข้อมูลผู้รายงานจากโปรไฟล์ (สำหรับพิมพ์) — เอกสารที่ส่งแล้วใช้สำเนาที่เก็บไว้
async function parptOwner(d) {
  let live = {};
  try { await loadModule('profile'); live = paOwnerFromProfile(await loadTeacherProfile()); } catch (err) { /* ใช้ค่าว่าง */ }
  return { live, owner: (d && d.status === 'submitted' && d.owner) ? d.owner : live };
}

const PARPT_LIST_CSS = `
.pa-toolbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.pa-list{display:flex;flex-direction:column;gap:10px}
.pa-row{display:flex;align-items:center;gap:12px;padding:14px 16px;cursor:pointer;transition:box-shadow .15s}
.pa-row:hover{box-shadow:0 0 0 2px var(--primary)}
.pa-row-icon .nav-icon{position:relative;isolation:isolate;width:40px;height:40px;border-radius:var(--radius-xs);display:grid;place-items:center;flex-shrink:0;overflow:hidden}
.pa-row-icon .nav-icon::after{content:'';position:absolute;inset:0;z-index:-1;background:linear-gradient(145deg,oklch(from var(--w) calc(l + .06) calc(c * 1.18) h),oklch(from var(--w) calc(l - .05) calc(c * 1.25) h));-webkit-mask:var(--squircle) center/100% 100% no-repeat;mask:var(--squircle) center/100% 100% no-repeat}
.pa-row-info{flex:1;min-width:0}
.pa-row-title{font-weight:600;font-size:15px;color:var(--ink)}
.pa-row-sub{font-size:13px;color:var(--ink-soft);margin-top:2px}
.pa-row-meta{flex-shrink:0}
.pa-row-actions{display:flex;gap:6px;flex-shrink:0}
.pa-row-actions .ico{width:16px;height:16px}
.badge{display:inline-block;padding:3px 10px;border-radius:var(--radius-pill);font-size:12px;font-weight:600}
@media(max-width:540px){.pa-row{flex-wrap:wrap}.pa-row-actions{width:100%;justify-content:flex-end}}
`;

async function parptRenderList() {
  const view = paMount();
  const seq = PAState.seq;
  paShowLoading(view);
  let list = [];
  try {
    list = await parptLoadList();
    PARptState.list = list;
  } catch (err) {
    if (paStale(view, seq) || PAState.tab !== 'rpt') return;
    clearLoading(view);
    view.classList.remove('is-switching');
    view.innerHTML = `<div class="card card-pad"><div class="empty-state">โหลดข้อมูลไม่สำเร็จ: ${escapeHtml(err.message)}</div></div>`;
    return;
  }
  if (paStale(view, seq) || PAState.tab !== 'rpt' || PARptState.view !== 'list') return;

  const rows = list.map(d => `
    <div class="pa-row card" data-id="${escapeHtml(d.id)}">
      <span class="pa-row-icon"><span class="nav-icon" style="--w:var(--hue-blue)">${PA_ICO_PA}</span></span>
      <div class="pa-row-info">
        <div class="pa-row-title">รายงานผล ${escapeHtml(paDocTitle(d))}</div>
        <div class="pa-row-sub">${escapeHtml(d.challengeTitle || '')}</div>
      </div>
      <div class="pa-row-meta">${paStatusBadge(d.status)}</div>
      <div class="pa-row-actions">
        <button type="button" class="btn btn-ghost btn-sm rpt-print-btn" data-id="${escapeHtml(d.id)}" title="พิมพ์ / บันทึกเป็น PDF">${PA_ICO_PRINT} พิมพ์</button>
        <button type="button" class="btn btn-ghost btn-sm rpt-dup-btn" data-id="${escapeHtml(d.id)}" title="คัดลอกเป็นฉบับใหม่เพื่อนำไปปรับแก้">${PA_ICO_COPY} คัดลอก</button>
        <button type="button" class="btn btn-ghost btn-sm rpt-edit-btn" data-id="${escapeHtml(d.id)}" title="แก้ไข">${PA_ICO_EDIT} แก้ไข</button>
        <button type="button" class="btn btn-danger-ghost btn-sm rpt-del-btn" data-id="${escapeHtml(d.id)}" title="ลบ">${PA_ICO_DEL}</button>
      </div>
    </div>`).join('');

  const empty = list.length === 0 ? `
    <div class="card">
      <div class="empty-state">
        <div class="icon">${PA_ICO_PA}</div>
        <div class="empty-title">ยังไม่มีแบบรายงานผล</div>
        <div class="empty-sub">สร้างแบบรายงานผลการปฏิบัติงานตาม Personal Agreement ประจำปีงบประมาณ</div>
        <button type="button" class="btn btn-primary rpt-new-btn">${PA_ICO_ADD} สร้างแบบรายงานผลใหม่</button>
      </div>
    </div>` : '';

  view.innerHTML = `
    <div class="pa-toolbar">
      <span class="u-note">${list.length > 0 ? `${list.length} รายการ` : ''}</span>
      ${list.length > 0 ? `<button type="button" class="btn btn-primary btn-sm rpt-new-btn">${PA_ICO_ADD} สร้างใหม่</button>` : ''}
    </div>
    ${empty}
    <div class="pa-list">${rows}</div>
    <style>${PARPT_LIST_CSS}</style>`;

  const open = (id) => {
    const d = id && PARptState.list?.find(x => x.id === id);
    PARptState.docId = d ? id : null;
    PARptState.doc = d ? parptNormalize(JSON.parse(JSON.stringify(d))) : parptBlank();
    PARptState.view = 'form';
    parptRenderForm();
  };
  view.querySelectorAll('.rpt-new-btn').forEach(b => b.addEventListener('click', () => open(null)));
  view.querySelectorAll('.pa-row').forEach(r => r.addEventListener('click', () => open(r.dataset.id)));
  view.querySelectorAll('.rpt-edit-btn').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); open(b.dataset.id); }));
  view.querySelectorAll('.rpt-dup-btn').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    const d = PARptState.list?.find(x => x.id === b.dataset.id);
    if (d) parptDuplicate(d);
  }));
  view.querySelectorAll('.rpt-print-btn').forEach(b => b.addEventListener('click', async e => {
    e.stopPropagation();
    PARptState.previewId = b.dataset.id;
    paSwitchTab('rptprev'); // เปิดแท็บตัวอย่าง/พิมพ์ รายงานผล (เหมือนปุ่มพิมพ์ของแท็บข้อตกลง)
  }));
  view.querySelectorAll('.rpt-del-btn').forEach(b => b.addEventListener('click', async e => {
    e.stopPropagation();
    const row = b.closest('.pa-row');
    if (!row.dataset.confirmDel) {
      row.dataset.confirmDel = '1';
      b.textContent = 'ยืนยันลบ?';
      b.classList.add('btn-danger'); b.classList.remove('btn-danger-ghost');
      setTimeout(() => { delete row.dataset.confirmDel; b.innerHTML = PA_ICO_DEL; b.classList.remove('btn-danger'); b.classList.add('btn-danger-ghost'); }, 3000);
      return;
    }
    b.disabled = true;
    try { await parptDelete(b.dataset.id); await parptRenderList(); }
    catch (err) { b.disabled = false; alert('ลบไม่สำเร็จ: ' + err.message); }
  }));

  paSwapIn(view);
}

// ------------------------------------------------------------------
// ฟอร์มรายงานผล
// ------------------------------------------------------------------
async function parptRenderForm() {
  const view = paMount();
  const seq = PAState.seq;
  const d = PARptState.doc = parptNormalize(PARptState.doc);
  const isNew = !PARptState.docId;
  paShowLoading(view);
  const { live, owner: o } = await parptOwner(d);
  if (paStale(view, seq) || PAState.tab !== 'rpt' || PARptState.view !== 'form') return;
  const frozen = d.status === 'submitted' && d.owner;

  const e = escapeHtml;
  const item = (label, v) => `<div class="pa-pf-item"><dt>${label}</dt><dd>${v ? e(v) : '—'}</dd></div>`;
  const inp = (id, label, v, ph, mode) => `<div class="field"><label for="${id}">${label}</label><input id="${id}" type="text" inputmode="${mode || 'decimal'}" maxlength="6" value="${e(v)}" placeholder="${e(ph || '')}"></div>`;
  const area = (id, label, v, rows, ph = '') => `<div class="field"><label for="${id}">${label}</label><textarea id="${id}" rows="${rows}" placeholder="${e(ph)}">${e(v || '')}</textarea></div>`;
  const riArea = (id, f, label, v, rows, ph = '') => `<div class="field"><label for="rpt-ri-${id.replace('.', '_')}-${f}">${label}</label><textarea id="rpt-ri-${id.replace('.', '_')}-${f}" rows="${rows}" data-ri="${id}" data-f="${f}" placeholder="${e(ph)}">${e(v || '')}</textarea></div>`;
  const lv = d.leave;

  view.innerHTML = `
    <div class="pa-form-head">
      <button type="button" class="btn btn-ghost btn-sm rpt-back-btn">← กลับ</button>
      <div>
        <h2 class="pa-form-title">แบบรายงานผล · ${isNew ? 'สร้างใหม่' : 'แก้ไข'}</h2>
        <div class="u-note">แบบรายงานผลข้อตกลงในการพัฒนางาน (PA) สำหรับข้าราชการครูและบุคลากรทางการศึกษา ตำแหน่ง ครู (สังกัด สพฐ.)</div>
      </div>
      ${isNew ? '' : `<button type="button" class="btn btn-ghost btn-sm rpt-dup-btn" title="คัดลอกข้อมูลในฟอร์มนี้เป็นฉบับร่างใหม่">${PA_ICO_COPY} คัดลอกเป็นฉบับใหม่</button>`}
    </div>

    <form id="rpt-form" class="pa-form" novalidate>
      <div class="card card-pad">
        <h2 class="card-title">ผู้รายงาน</h2>
        <dl class="pa-pf">
          ${item('ชื่อ-นามสกุล', o.name)}${item('ตำแหน่ง', o.position)}
          ${item('วิทยฐานะ', o.standing)}${item('กลุ่มสาระการเรียนรู้', o.subjectGroup)}
          ${item('สถานศึกษา', o.school)}${item('สังกัด', o.affiliation)}
        </dl>
        <div class="pa-pf-note">
          <span>${frozen ? 'เอกสารนี้ส่งแล้ว — ใช้ข้อมูลผู้รายงานที่บันทึกไว้ตอนส่ง (เปลี่ยนสถานะเป็น "ร่าง" เพื่อดึงข้อมูลล่าสุด)' : 'ข้อมูลนี้ดึงจากหน้าข้อมูลส่วนตัว'}</span>
          <button type="button" class="btn btn-ghost btn-sm rpt-goto-profile">ไปแก้ในข้อมูลส่วนตัว</button>
        </div>
        <div class="pa-pf-note u-mb-12">
          <span>เติมช่องที่ยังว่างจาก Personal Agreement (ประเด็นท้าทาย ผลลัพธ์ ชั่วโมงสอน และงานแต่ละข้อ) — ไม่ทับข้อความที่คุณพิมพ์ไว้แล้ว</span>
          <button type="button" class="btn btn-ghost btn-sm" id="rpt-pull">ดึงจาก Personal Agreement</button>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="rpt-fiscalYear">ปีงบประมาณ พ.ศ.</label>
            <input id="rpt-fiscalYear" type="text" inputmode="numeric" maxlength="4" value="${e(d.fiscalYear)}" placeholder="${paFiscalYear()}">
            <div class="field-hint" id="rpt-period">${e(paPeriodText(d.fiscalYear))}</div>
          </div>
          <div class="field">
            <label for="rpt-status">สถานะ</label>
            <select id="rpt-status">
              <option value="draft"${d.status === 'draft' ? ' selected' : ''}>ร่าง</option>
              <option value="submitted"${d.status === 'submitted' ? ' selected' : ''}>ส่งแล้ว</option>
            </select>
          </div>
        </div>
        <div class="field-row">
          ${inp('rpt-selfScore', 'คะแนนประเมินตนเอง (คะแนน)', d.selfScore, 'เช่น 98')}
          ${inp('rpt-teachHours', 'ชั่วโมงการสอน (ชั่วโมง/สัปดาห์)', d.teachHours, 'เช่น 27')}
        </div>
        <div class="pa-sub">จำนวนวันลาในรอบการประเมิน <b id="rpt-leave-total">${(paNum(lv.sickDays) || paNum(lv.bizDays)) ? paFmtH(paNum(lv.sickDays) + paNum(lv.bizDays)) : '0'}</b> วัน</div>
        <div class="field-row">
          ${inp('rpt-sickTimes', '1) ลาป่วย (ครั้ง)', lv.sickTimes, '0', 'numeric')}${inp('rpt-sickDays', 'ลาป่วย (วัน)', lv.sickDays, '0')}
        </div>
        <div class="field-row">
          ${inp('rpt-bizTimes', '2) ลากิจ (ครั้ง)', lv.bizTimes, '0', 'numeric')}${inp('rpt-bizDays', 'ลากิจ (วัน)', lv.bizDays, '0')}
        </div>
        <div class="field pa-field-date">
          <label for="rpt-signDate">วันที่ลงนามของผู้รายงาน</label>
          <input id="rpt-signDate" type="date" value="${e(d.signDate)}">
        </div>
      </div>

      <div class="card card-pad">
        <h2 class="card-title">ผลการปฏิบัติงานตามมาตรฐานตำแหน่ง</h2>
        <div class="u-note u-mb-12">แต่ละข้อ: เล่าสิ่งที่ปฏิบัติจริง และระบุเอกสารอ้างอิงที่ใช้เป็นหลักฐาน (ไปอยู่ในตารางท้ายเอกสาร) — ข้อที่เว้นว่างจะแสดงเป็นช่องว่างในเอกสาร</div>
        ${PA_WORK_ITEMS.map(([gid, gt, items]) => `
          <details class="pa-wgroup"${gid === '1' ? ' open' : ''}>
            <summary>${gt}</summary>
            ${items.map(([id, label]) => {
              const w = d.items[id] || {};
              return `<div class="pa-witem">
                <div class="pa-witem-h">${id} ${label}</div>
                ${riArea(id, 'text', 'รายละเอียดผลการปฏิบัติงาน', w.text, 4)}
                ${riArea(id, 'ref', 'เอกสารอ้างอิง', w.ref, 2, 'เช่น แผนการจัดการเรียนรู้ · รูปกิจกรรม · เกียรติบัตร')}
              </div>`;
            }).join('')}
          </details>`).join('')}
      </div>

      <div class="card card-pad">
        <h2 class="card-title">4. ความสำเร็จในการพัฒนางานที่เสนอเป็นประเด็นท้าทาย</h2>
        ${area('rpt-challengeTitle', 'เรื่อง', d.challengeTitle, 3)}
        ${area('rpt-problem', '1. สภาพปัญหาของผู้เรียนและการจัดการเรียนรู้', d.problem, 5)}
        ${area('rpt-method', '2. วิธีการดำเนินการให้บรรลุผล', d.method, 5)}
        ${area('rpt-outcomeQuant', '3.1 ผลลัพธ์การพัฒนา · เชิงปริมาณ', d.outcomeQuant, 4)}
        ${area('rpt-outcomeQual', '3.2 ผลลัพธ์การพัฒนา · เชิงคุณภาพ', d.outcomeQual, 4)}
      </div>

      <div class="card card-pad">
        <h2 class="card-title">5. ความสำเร็จที่ได้รับมอบหมายจากผู้บังคับบัญชา</h2>
        ${area('rpt-assigned', 'รายละเอียด', d.assigned, 5, 'เช่น งานที่ได้รับมอบหมายจากฝ่ายบริหาร การฝึกซ้อมนักเรียนเข้าร่วมการแข่งขัน')}
      </div>

      <div class="pa-form-footer">
        <button type="button" class="btn btn-ghost rpt-cancel-btn">ยกเลิก</button>
        <button type="submit" class="btn btn-primary" id="rpt-save-btn">บันทึกแบบรายงานผล</button>
      </div>
    </form>`;

  const form = view.querySelector('#rpt-form');
  view.querySelectorAll('.rpt-back-btn, .rpt-cancel-btn').forEach(b => b.addEventListener('click', () => { PARptState.view = 'list'; parptRenderList(); }));
  view.querySelector('.rpt-dup-btn')?.addEventListener('click', () => { parptCollect(); parptDuplicate(PARptState.doc); }); // คัดลอกค่าที่กรอกค้างอยู่
  view.querySelector('.rpt-goto-profile').addEventListener('click', () => { parptCollect(); navigate('profile'); });
  view.querySelector('#rpt-fiscalYear').addEventListener('input', ev => { view.querySelector('#rpt-period').textContent = paPeriodText(ev.target.value); });
  form.addEventListener('input', ev => {
    if (ev.target.id === 'rpt-sickDays' || ev.target.id === 'rpt-bizDays') {
      const t = paNum(form.querySelector('#rpt-sickDays').value) + paNum(form.querySelector('#rpt-bizDays').value);
      form.querySelector('#rpt-leave-total').textContent = paFmtH(t);
    }
  });

  view.querySelector('#rpt-pull').addEventListener('click', async () => {
    parptCollect();
    try {
      const n = await parptPullAgreement(PARptState.doc);
      if (!n) { showToast('ไม่พบข้อมูลใหม่ให้ดึง — สร้าง Personal Agreement ก่อน หรือช่องถูกกรอกไว้แล้ว'); return; }
      const y = window.scrollY;
      await parptRenderForm();
      window.scrollTo(0, y);
      showToast(`ดึงจาก Personal Agreement แล้ว ${n} ช่อง — ปรับถ้อยคำเป็นผลที่ทำได้จริงก่อนบันทึก`);
    } catch (err) {
      showToast('ดึงข้อมูลไม่สำเร็จ: ' + (err.message || err));
    }
  });

  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    parptCollect();
    if (!/^\d{4}$/.test(PARptState.doc.fiscalYear)) { showToast('ปีงบประมาณต้องเป็นตัวเลข 4 หลัก เช่น ' + paFiscalYear()); view.querySelector('#rpt-fiscalYear').focus(); return; }
    if (!(PARptState.doc.status === 'submitted' && PARptState.doc.owner)) PARptState.doc.owner = live;
    const btn = view.querySelector('#rpt-save-btn');
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก…';
    try {
      await parptSave(PARptState.doc);
      PARptState.list = null;
      if (typeof islandToast === 'function') islandToast('บันทึกแบบรายงานผลแล้ว', 'save');
      PARptState.view = 'list';
      await parptRenderList();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'บันทึกแบบรายงานผล';
      showToast(err.code === 'permission-denied' ? 'บันทึกไม่สำเร็จ: ถูกปฏิเสธสิทธิ์ (ต้องอัปเดต firestore.rules ก่อน)' : 'บันทึกไม่สำเร็จ: ' + (err.message || err));
    }
  });

  paSwapIn(view);
}

// เก็บค่าจากฟอร์มกลับเข้า PARptState.doc (เรียกก่อนสลับแท็บ/ไปหน้าอื่นด้วย เพื่อไม่ให้ที่พิมพ์ค้างหาย)
function parptCollect() {
  const form = document.getElementById('rpt-form');
  if (!form || !PARptState.doc) return;
  const g = id => (document.getElementById(id)?.value || '').trim();
  const items = {};
  form.querySelectorAll('[data-ri]').forEach(t => {
    const id = t.dataset.ri;
    if (!items[id]) items[id] = { text: '', ref: '' };
    items[id][t.dataset.f] = t.value.trim();
  });
  Object.keys(items).forEach(k => { if (!items[k].text && !items[k].ref) delete items[k]; });
  Object.assign(PARptState.doc, {
    fiscalYear: g('rpt-fiscalYear'),
    status: g('rpt-status') || 'draft',
    selfScore: g('rpt-selfScore'),
    teachHours: g('rpt-teachHours'),
    leave: { sickTimes: g('rpt-sickTimes'), sickDays: g('rpt-sickDays'), bizTimes: g('rpt-bizTimes'), bizDays: g('rpt-bizDays') },
    items,
    challengeTitle: g('rpt-challengeTitle'),
    problem: g('rpt-problem'),
    method: g('rpt-method'),
    outcomeQuant: g('rpt-outcomeQuant'),
    outcomeQual: g('rpt-outcomeQual'),
    assigned: g('rpt-assigned'),
    signDate: g('rpt-signDate'),
  });
}
