// ==========================================================================
// ตัวอย่าง / พิมพ์ PA 1/ส (แท็บที่สองของหน้า "Personal Agreement")
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
// render แท็บ "ตัวอย่าง / พิมพ์ PA 1" — วาดลงพื้นที่เนื้อหาของหน้า PA (โครงหน้า+แท็บอยู่ใน pa.js)
// ------------------------------------------------------------------
async function renderPAReportView() {
  const sys = docSystem();
  return docRenderPreview({ // โครงกลางใน js/doc-shell.js (แถบเลือก · ปุ่ม · สถานะว่าง · ย่อกระดาษ)
    sys, tab: 'report',
    load: async () => {
      const list = await paReportLoadList();
      // เอกสารรุ่นเก่าไม่มีสำเนาข้อมูลผู้จัดทำ → ใช้ข้อมูลปัจจุบันจากหน้าข้อมูลส่วนตัวแทน
      let live = {};
      try { await loadModule('profile'); live = paOwnerFromProfile(await loadTeacherProfile()); } catch (err) { /* ใช้ค่าว่าง */ }
      const d = list.find(x => x.id === sys.state.previewId) || list[0] || null;
      return {
        list, d, owner: d && (d.owner || live), pickId: d && d.id,
        items: list.map(x => ({ id: x.id, label: paDocTitle(x) + (x.status === 'submitted' ? ' · ส่งแล้ว' : ' · ร่าง') })),
      };
    },
    shown: ctx => { sys.state.previewId = ctx.pickId; },
    selectLabel: 'เลือกข้อตกลง',
    empty: { icon: PA_ICO_PA, title: 'ยังไม่มีPersonal Agreement', sub: 'สร้างPersonal Agreement ก่อน แล้วดูตัวอย่างและพิมพ์ที่นี่', gotoLabel: 'ไปที่Personal Agreement', gotoTab: 'agreement' },
    hint: ctx => `ตัวอย่างตามแบบ PA 1/ส — กดพิมพ์แล้วเลือก "บันทึกเป็น PDF" ในหน้าต่างพิมพ์ได้ · ช่องลงนามและความเห็น ผอ. เว้นไว้ให้เซ็นบนกระดาษ${ctx.d.owner ? '' : ' · เอกสารนี้ยังไม่มีสำเนาข้อมูลผู้จัดทำ จึงใช้ข้อมูลปัจจุบันจากข้อมูลส่วนตัว (จะเก็บสำเนาเมื่อบันทึกใหม่)'}`,
    paperHtml: ctx => `<style>${docFontCss()}${PA1_CSS}</style>${paBuildDocHtml(ctx.d, ctx.owner)}`,
    fitPage: '.pa1',
    afterHtml: ctx => paReportLegacyHtml(ctx.d),
    onPick: id => { sys.state.previewId = id; renderPAReportView(); },
    onPrint: ctx => paPrint(ctx.d, ctx.owner),
    onEdit: ctx => {
      sys.state.docId = ctx.d.id;
      sys.state.doc = paNormalize(JSON.parse(JSON.stringify(ctx.d)));
      sys.state.view = 'form';
      docSwitchTab('agreement'); // docSwitchTab วาดฟอร์มให้เอง (sys.state.view = 'form')
    },
  });
}
