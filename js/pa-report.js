// ==========================================================================
// ตัวอย่าง / พิมพ์ PA 1/ส (แท็บที่สองของหน้า "ข้อตกลง PA")
// แสดงข้อตกลงที่เลือกในรูปแบบเอกสารตามแบบ สพฐ. + ปุ่มพิมพ์/บันทึกเป็น PDF
// ตัวสร้างเอกสาร (paBuildDocHtml, paPrint, PA1_CSS) อยู่ใน pa.js
// ==========================================================================

// ------------------------------------------------------------------
// โหลดข้อมูล (ใช้ paCol ที่นิยามใน pa.js)
// ------------------------------------------------------------------
async function paReportLoadList() {
  const uid = AppState.user?.uid;
  if (!uid) return [];
  const snap = await paCol(uid).orderBy('createdAt', 'desc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ข้อมูลแบบเดิมที่แบบ PA 1/ส ไม่มีช่องรองรับ (tasks / selfDev) — แสดงแยกไว้ ไม่ปนในเอกสารพิมพ์
function paReportLegacyHtml(d) {
  const tasks = (Array.isArray(d.tasks) ? d.tasks : []).filter(t => t && t.name).map((t, i) =>
    `งานที่ ${i + 1}: ${t.name}` + [['เป้าหมาย', t.goal], ['ตัวชี้วัด', t.indicator], ['วิธีการ', t.method], ['กำหนดเวลา', t.timeline]]
      .filter(x => x[1]).map(x => `\n   ${x[0]}: ${x[1]}`).join('')).join('\n\n');
  const text = [tasks, d.selfDev && 'การพัฒนาตนเอง: ' + d.selfDev].filter(Boolean).join('\n\n');
  if (!text) return '';
  return `<details class="parp-legacy"><summary>ข้อมูลแบบเดิมในเอกสารนี้ (ไม่อยู่ในแบบ PA 1/ส — ยังเก็บไว้ ไม่ถูกลบ)</summary><div class="parp-legacy-text">${escapeHtml(text)}</div></details>`;
}

// ------------------------------------------------------------------
// คัดลอกเอกสาร PA ไปวางใน Word / Google Docs — ได้ทั้งแบบมีรูปแบบ (HTML) และข้อความล้วน
//   CSS ของเอกสารเป็นคลาส ซึ่งหายตอนวางข้ามแอป จึงฝังสไตล์ที่คำนวณแล้วลงทุกองค์ประกอบในสำเนา
// ------------------------------------------------------------------
const PA_COPY_PROPS = ['font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'text-align', 'text-indent',
  'margin-top', 'margin-bottom', 'margin-left', 'padding-left', 'text-decoration-line', 'white-space'];

async function paCopyDoc(pg) {
  const text = pg.innerText.replace(/\n{3,}/g, '\n\n').trim();
  const clone = pg.cloneNode(true);
  const src = [pg, ...pg.querySelectorAll('*')], dst = [clone, ...clone.querySelectorAll('*')];
  src.forEach((el, i) => {
    const cs = getComputedStyle(el);
    dst[i].setAttribute('style', PA_COPY_PROPS.map(k => [k, cs.getPropertyValue(k)]).filter(([, v]) => v).map(([k, v]) => `${k}:${v}`).join(';'));
    dst[i].removeAttribute('class');
  });
  clone.removeAttribute('style'); // ตัดความกว้าง A4 / zoom ของหน้าจอออก
  const html = clone.outerHTML;
  try {
    if (!(navigator.clipboard && window.ClipboardItem)) throw new Error('no-rich-clipboard');
    await navigator.clipboard.write([new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([text], { type: 'text/plain' }),
    })]);
  } catch (err) { // เบราว์เซอร์ไม่รองรับ/ไม่อนุญาต → เลือกเนื้อหาในหน้าแล้วสั่งคัดลอก
    const sel = getSelection(), range = document.createRange();
    range.selectNodeContents(pg);
    sel.removeAllRanges(); sel.addRange(range);
    const ok = document.execCommand('copy');
    sel.removeAllRanges();
    if (!ok) throw new Error('คัดลอกไม่สำเร็จ — ลองกด “พิมพ์ / บันทึกเป็น PDF” แทน');
  }
}

// ------------------------------------------------------------------
// render แท็บ "ตัวอย่าง / พิมพ์ PA 1" — วาดลงพื้นที่เนื้อหาของหน้า PA (โครงหน้า+แท็บอยู่ใน pa.js)
// ------------------------------------------------------------------
async function renderPAReportView() {
  const view = paMount();
  showLoading('list', view);

  let list = [];
  try {
    list = await paReportLoadList();
  } catch (err) {
    if (!view.isConnected || PAState.tab !== 'report') return; // ผู้ใช้สลับแท็บ/ออกจากหน้าไปแล้ว
    clearLoading(view);
    view.classList.remove('is-switching');
    view.innerHTML = `<div class="card card-pad"><div class="empty-state">โหลดข้อมูลไม่สำเร็จ: ${escapeHtml(err.message)}</div></div>`;
    return;
  }

  // เอกสารรุ่นเก่าไม่มีสำเนาข้อมูลผู้จัดทำ → ใช้ข้อมูลปัจจุบันจากหน้าข้อมูลส่วนตัวแทน
  let live = {};
  try { await loadModule('profile'); live = paOwnerFromProfile(await loadTeacherProfile()); } catch (err) { /* ใช้ค่าว่าง */ }

  if (!view.isConnected || PAState.tab !== 'report') return; // สลับไปแท็บอื่นระหว่างรอข้อมูล — ไม่วาดทับ

  if (list.length === 0) {
    view.innerHTML = `
      <div class="card">
        <div class="empty-state">
          <div class="icon icon-violet">${PA_ICO_PA}</div>
          <div class="empty-title">ยังไม่มีข้อตกลง PA</div>
          <div class="empty-sub">สร้างข้อตกลง PA ก่อน แล้วดูตัวอย่างและพิมพ์ที่นี่</div>
          <button type="button" class="btn btn-primary par-goto-pa">ไปที่ข้อตกลง PA</button>
        </div>
      </div>`;
    view.querySelector('.par-goto-pa').addEventListener('click', () => paSwitchTab('agreement'));
    view.classList.remove('is-switching');
    paSwapIn(view);
    return;
  }

  const d = list.find(x => x.id === PAState.previewId) || list[0];
  PAState.previewId = d.id;
  const owner = d.owner || live;

  view.innerHTML = `
    <div class="parp-bar">
      <select id="parp-select" aria-label="เลือกข้อตกลง">
        ${list.map(x => `<option value="${escapeHtml(x.id)}"${x.id === d.id ? ' selected' : ''}>${escapeHtml(paDocTitle(x))}${x.status === 'submitted' ? ' · ส่งแล้ว' : ' · ร่าง'}</option>`).join('')}
      </select>
      <div class="parp-actions">
        <button type="button" class="btn btn-ghost btn-sm parp-edit">${PA_ICO_EDIT} แก้ไข</button>
        <button type="button" class="btn btn-ghost btn-sm parp-copy">${PA_ICO_COPY} คัดลอก</button>
        <button type="button" class="btn btn-primary btn-sm parp-print">${PA_ICO_PRINT} พิมพ์ / บันทึกเป็น PDF</button>
      </div>
    </div>
    <div class="u-note parp-hint">ตัวอย่างตามแบบ PA 1/ส — กดพิมพ์แล้วเลือก "บันทึกเป็น PDF" ในหน้าต่างพิมพ์ได้ หรือกด “คัดลอก” ไปวางใน Word/Google Docs · ช่องลงนามและความเห็น ผอ. เว้นไว้ให้เซ็นบนกระดาษ${d.owner ? '' : ' · เอกสารนี้ยังไม่มีสำเนาข้อมูลผู้จัดทำ จึงใช้ข้อมูลปัจจุบันจากข้อมูลส่วนตัว (จะเก็บสำเนาเมื่อบันทึกใหม่)'}</div>
    <div class="parp-paper"><style>${paFontCss()}${PA1_CSS}</style>${paBuildDocHtml(d, owner)}</div>
    ${paReportLegacyHtml(d)}
    <style>
      .parp-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:8px}
      .parp-bar select{min-width:0;max-width:100%}
      .parp-actions{display:flex;gap:8px}
      .parp-actions .ico{width:16px;height:16px}
      .parp-hint{margin-bottom:12px}
      .parp-paper{background:#fff;color:#000;border-radius:var(--radius-s);box-shadow:0 0 0 1px var(--border);overflow-x:auto}
      .parp-paper .pa1{box-sizing:border-box;width:210mm;padding:16mm 14mm}
      .parp-legacy{margin-top:14px}
      .parp-legacy>summary{cursor:pointer;font-weight:600;font-size:13.5px;color:var(--ink-soft)}
      .parp-legacy-text{white-space:pre-wrap;margin-top:8px;font-size:13.5px;padding:10px 12px;border-radius:var(--radius-s);background:var(--surface-sunken)}
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
  const onResize = () => { if (!view.isConnected || PAState.tab !== 'report') window.removeEventListener('resize', onResize); else fit(); };
  window.addEventListener('resize', onResize);

  view.querySelector('#parp-select').addEventListener('change', e => {
    PAState.previewId = e.target.value;
    renderPAReportView();
  });
  view.querySelector('.parp-print').addEventListener('click', () => paPrint(d, owner));
  view.querySelector('.parp-copy').addEventListener('click', async () => {
    const pg = view.querySelector('.parp-paper .pa1');
    if (!pg) return;
    try { await paCopyDoc(pg); showToast('คัดลอกฟอร์ม PA แล้ว — ไปวางใน Word หรือ Google Docs ได้เลย'); }
    catch (err) { showToast(err.message || 'คัดลอกไม่สำเร็จ'); }
  });
  view.querySelector('.parp-edit').addEventListener('click', () => {
    PAState.docId = d.id;
    PAState.doc = paNormalize(JSON.parse(JSON.stringify(d)));
    PAState.view = 'form';
    paSwitchTab('agreement'); // paSwitchTab วาดฟอร์มให้เอง (PAState.view = 'form')
  });

  view.classList.remove('is-switching');
  paSwapIn(view);
}
