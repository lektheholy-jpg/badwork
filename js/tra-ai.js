// ==========================================================================
// ตัวต่อผู้ช่วย AI ของระบบ แผนการอบรม — บอกแกน (js/badwork-ai.js) ว่าระบบนี้มีช่องอะไรให้ AI เขียน · ประกอบพร้อต์ยังไง · ฝังปุ่มตรงไหน · เก็บบริบทที่ไหน
//   สร้างโดย tools/new-doc-system.js · รูปแบบเดียวกับ js/idp-ai.js / js/pa-ai.js (README ข้อ 6 ของหัวข้อ "เพิ่มระบบเอกสารใหม่")
//   • ช่องที่ให้ AI เขียน = ช่องใน config.ai.prompts.fields · id ของ textarea = tra-<ช่อง> (เช่น tra-body) — ใส่ไว้ใน traRenderFormView (js/tra.js)
//   • พร้อต์/ช่อง/ตารางบริบทอยู่ที่ sys.config.ai.prompts (js/tra-config.js)
//   • ปุ่ม: แถวปุ่มใต้ป้ายของแต่ละช่อง (act write / polish) + ปุ่มบนสุด "ร่างช่องที่ว่างทั้งหมด" (act all)
//   • ไม่เขียนทับช่องที่กรอกแล้ว · ปุ่มเขียนเติมเฉพาะช่องที่ว่าง · ปุ่มปรับสำนวนทำเฉพาะช่องที่มีข้อความ
//   • บริบทงานเก็บใน doc.aiCtx ของเอกสารในคอลเลกชัน 'docs' (tra_docs)
//   โหลดหลัง js/tra.js และ js/badwork-ai.js (LAZY_BUNDLES.tra) · ท้ายไฟล์ลงทะเบียน registerDocAi('tra', …)
//   ทุกฟังก์ชันรับ sys เป็นตัวแรก (แกนส่งตัวที่ถือไว้ตอนเริ่มงาน)
//
//   ไม่ต้องการผู้ช่วย AI: ลบไฟล์นี้ + เอา 'tra-ai' ออกจาก LAZY_MODULES/LAZY_BUNDLES (js/utils.js) และ PRECACHE (sw.js) — ฟอร์มทำงานตามเดิม
// ==========================================================================

// ช่องที่ให้ AI เขียนทั้งหมด · ไม่มีผลข้างเคียง (แกนเรียกซ้ำเพื่อดูตัวอย่างขอบเขตของปุ่ม)
function traAiSpecs(sys) {
  return sys.config.ai.prompts.fields.map(([f, fl, hint]) => ({
    key: f, el: `tra-${f}`, group: f, field: f,
    item: fl, subs: [], fieldLabel: fl, label: fl, hint,
  }));
}

// รวมบริบทที่ชุดช่องนี้ต้องใช้ (scope ของ config ใช้ชื่อช่องเป็นคีย์)
function traAiScope(sys, fields) {
  const set = new Set();
  fields.forEach(f => (sys.config.ai.prompts.scope[f.field] || []).forEach(k => set.add(k)));
  return set;
}

// บรรทัดบริบทเรียงลำดับคงที่เสมอ (ส่วนที่ซ้ำกันอยู่ต้นข้อความ → ช่วย implicit caching) · scope = Set ของส่วนที่ต้องส่ง (null = ทุกส่วน)
function traAiContext(sys, known = {}, scope = null) {
  traCollect(); // ดึงค่าที่พิมพ์ค้างในฟอร์มเข้า sys.state.doc
  const d = sys.state.doc, c = d.aiCtx || {};
  let p = {};
  try { p = AppState.teacherProfile || {}; } catch (err) { /* ไม่มีโปรไฟล์ — ข้าม */ }
  const want = k => !scope || scope.has(k);
  const lines = [
    `ภาคเรียนที่ ${d.semester || '-'} ปีการศึกษา ${d.year || '-'}`,
    `ตำแหน่ง: ${p.position || 'ครู'}${p.academicStanding ? ' วิทยฐานะ' + p.academicStanding : ''}`,
    d.title && `ชื่อเอกสาร: ${d.title}`,
    want('note') && c.note && `ข้อมูลประกอบจากครู: ${c.note}`,
  ];
  return lines.filter(Boolean).join('\n');
}

// แนวทางของช่อง ส่งครั้งเดียวต่อคำขอ เฉพาะชนิดช่องที่มีในคำขอ
function traAiGuide(sys, fields) {
  const used = new Set(fields.map(f => f.field));
  const hints = sys.config.ai.prompts.fields.filter(([f]) => used.has(f)).map(([f, fl, h]) => `- .${f} (${fl}): ${h}`);
  if (!hints.length) return '';
  return `\n\nแนวทางช่อง (ตามส่วนท้ายของคีย์):\n${hints.join('\n')}`;
}

// หัวกลุ่มของแต่ละช่อง (พิมพ์ครั้งเดียวต่อกลุ่ม) — ให้ AI เห็นหัวข้อที่กำลังเขียน
function traAiHeading(spec) {
  return `หัวข้อ: ${spec.item}`;
}

// ------------------------------------------------------------------
// ปุ่ม: ฝังที่ไหน · กดแล้วทำอะไร
// ------------------------------------------------------------------
function traAiSlots(sys, form) {
  const out = [];
  traAiSpecs(sys).forEach(s => {
    const host = form.querySelector(`#${s.el}`)?.closest('.field');
    if (!host) return;
    out.push({ host, buttons: [
      { act: 'write', label: `เขียน${s.fieldLabel}`, icon: 'write', data: { field: s.field } },
      { act: 'polish', label: 'ปรับสำนวน', icon: 'polish', quiet: true, data: { field: s.field } },
    ] });
  });
  return out;
}

// act: 'all' = ปุ่มบนสุด · 'write' / 'polish' = ปุ่มใต้ป้ายของแต่ละช่อง (data-field)
function traAiResolve(sys, a, b) {
  if (a === 'all') {
    const pick = traAiSpecs(sys).filter(s => !badworkAiFilled(s));
    if (!pick.length) return { toast: 'ทุกช่องมีข้อความแล้ว — ใช้ปุ่มปรับสำนวนของแต่ละช่องได้' };
    return { specs: pick, mode: 'write' };
  }
  if (a === 'write' || a === 'polish') {
    const specs = traAiSpecs(sys).filter(s => s.field === b.dataset.field);
    if (!specs.length) return null;
    const pick = a === 'write' ? specs.filter(s => !badworkAiFilled(s)) : specs.filter(badworkAiFilled);
    if (!pick.length) return { toast: a === 'write' ? 'ช่องนี้มีข้อความแล้ว — ใช้ “ปรับสำนวน” ได้' : 'ช่องนี้ยังไม่มีข้อความให้ปรับสำนวน' };
    return { specs: pick, mode: a, total: specs.length };
  }
  return null; // act อื่น (เช่น ตัวฟอร์มเองที่มี data-doc-ai เป็นตัวกันติดซ้ำ) — ไม่ทำอะไร
}

// ------------------------------------------------------------------
// ลงทะเบียนตัวต่อ (รูปแบบเดียวกับ registerDocUi ท้าย js/tra.js)
// ------------------------------------------------------------------
registerDocAi('tra', {
  systemPrompt: sys => sys.config.ai.prompts.system,
  task: (sys, mode, current) => sys.config.ai.prompts.modes[mode](current),
  context: traAiContext,
  scope: traAiScope,
  guide: traAiGuide,
  itemHeading: traAiHeading,

  copy: {
    consent: 'ข้อความใน แผนการอบรม นี้ (ชื่อเอกสาร ข้อความที่กรอกไว้ และ "บริบทงานของฉัน" ไม่รวมชื่อ-นามสกุล) จะถูกส่งไปประมวลผลที่ Google Gemini เฉพาะส่วนที่เกี่ยวกับช่องที่กด\n\n'
      + 'โปรดอย่าพิมพ์ชื่อหรือข้อมูลที่ระบุตัวนักเรียนลงในช่อง (ใช้เป็นตัวเลขรวมเท่านั้น) และตรวจทานข้อความที่ AI เสนอทุกครั้งก่อนใช้\n\nต้องการดำเนินการต่อหรือไม่?',
    saveLabel: TRA_SAVE_LABEL,
    topPoints: [
      'อ่านจากข้อมูลที่มีในเอกสารนี้ และบริบทงานด้านล่าง',
      'เสนอให้ตรวจก่อนใช้เสมอ ไม่เขียนทับช่องที่กรอกแล้ว และไม่บันทึกให้เอง',
      'ปุ่มนี้ร่างช่องที่ว่างทั้งหมด · ปุ่มใต้ป้ายของแต่ละช่องทำเฉพาะช่องนั้น',
    ],
    topWarn: 'อย่าพิมพ์ชื่อหรือข้อมูลที่ระบุตัวนักเรียนลงในช่อง',
    topButton: 'ร่างช่องที่ว่างทั้งหมด',
    reviewNote: '“…” คือตัวเลขที่ครูต้องกรอกเอง',
    placeholder: { mark: '…', toast: ' · มี “…” ที่ต้องกรอกตัวเลข' }, // พร้อต์ให้ AI ใช้ “…” แทนตัวเลขที่ไม่รู้
    ctxTitle: 'บริบทงานของฉัน',
    ctxNote: 'ยิ่งระบุตามจริง AI ยิ่งเขียนตรงงาน และไม่ต้องกด “สร้างใหม่” หลายรอบ · ว่างไว้ได้ AI จะเขียนกว้าง ๆ และใช้ “…” แทนตัวเลข · ส่งให้ AI เฉพาะส่วนที่เกี่ยวกับช่องที่กด',
    reviewGroup: spec => ({ id: spec.group, title: spec.item }),
  },

  ctxBody: (sys, c, h) => [
    h.many('note', 'เช่น ข้อมูลที่อยากให้ AI รู้ก่อนเขียน'),
  ].join('\n    '),
  ctxStorageKey: sys => sys.config.ai.storageKeys.ctx,

  docRef: (sys, uid, id) => sys.col('docs', uid).doc(id),
  slots: traAiSlots,
  resolve: traAiResolve,
});
