// ==========================================================================
// ตัวต่อผู้ช่วย AI ของระบบ วิจัยในชั้นเรียน — บอกแกน (js/badwork-ai.js) ว่าระบบนี้มีช่องอะไรให้ AI เขียน · ประกอบพร้อต์ยังไง · ฝังปุ่มตรงไหน · เก็บบริบทที่ไหน
//   สร้างโดย tools/new-doc-system.js · รูปแบบเดียวกับ js/idp-ai.js / js/pa-ai.js (README ข้อ 6 ของหัวข้อ "เพิ่มระบบเอกสารใหม่")
//   • ช่องที่ให้ AI เขียน = ช่องใน config.ai.prompts.fields · id ของ textarea = car-<ช่อง> (เช่น car-body) — ใส่ไว้ใน carRenderFormView (js/car.js)
//   • พร้อต์/ช่อง/ตารางบริบทอยู่ที่ sys.config.ai.prompts (js/car-config.js)
//   • ปุ่ม: แถวปุ่มที่หัวช่อง (ขวามือของชื่อช่อง ใน .doc-item-h เหมือน PA/ID-Plan/SAR) (act write / polish) + ปุ่มบนสุด "ร่างช่องที่ว่างทั้งหมด" (act all)
//   • ไม่เขียนทับช่องที่กรอกแล้ว · ปุ่มเขียนเติมเฉพาะช่องที่ว่าง · ปุ่มปรับสำนวนทำเฉพาะช่องที่มีข้อความ
//   • บริบทงานเก็บใน doc.aiCtx ของเอกสารในคอลเลกชัน 'docs' (car_docs)
//   โหลดหลัง js/car.js และ js/badwork-ai.js (LAZY_BUNDLES.car) · ท้ายไฟล์ลงทะเบียน registerDocAi('car', …)
//   ทุกฟังก์ชันรับ sys เป็นตัวแรก (แกนส่งตัวที่ถือไว้ตอนเริ่มงาน)
//
//   ไม่ต้องการผู้ช่วย AI: ลบไฟล์นี้ + เอา 'car-ai' ออกจาก LAZY_MODULES/LAZY_BUNDLES (js/utils.js) และ PRECACHE (sw.js) — ฟอร์มทำงานตามเดิม
// ==========================================================================

// ช่องที่ให้ AI เขียนทั้งหมด · ไม่มีผลข้างเคียง (แกนเรียกซ้ำเพื่อดูตัวอย่างขอบเขตของปุ่ม)
function carAiSpecs(sys) {
  return sys.config.ai.prompts.fields.map(([f, fl, hint]) => ({
    key: f, el: `car-${f}`, group: f, field: f,
    item: fl, subs: [], fieldLabel: fl, label: fl, hint,
  }));
}

// รวมบริบทที่ชุดช่องนี้ต้องใช้ (scope ของ config ใช้ชื่อช่องเป็นคีย์)
function carAiScope(sys, fields) {
  const set = new Set();
  fields.forEach(f => (sys.config.ai.prompts.scope[f.field] || []).forEach(k => set.add(k)));
  return set;
}

// บรรทัดบริบทเรียงลำดับคงที่เสมอ (ส่วนที่ซ้ำกันอยู่ต้นข้อความ → ช่วย implicit caching) · scope = Set ของส่วนที่ต้องส่ง (null = ทุกส่วน)
function carAiContext(sys, known = {}, scope = null) {
  carCollect(); // ดึงค่าที่พิมพ์ค้างในฟอร์มเข้า sys.state.doc
  const d = sys.state.doc, c = d.aiCtx || {};
  let p = {};
  try { p = AppState.teacherProfile || {}; } catch (err) { /* ไม่มีโปรไฟล์ — ข้าม */ }
  const want = k => !scope || scope.has(k);
  const numList = a => (a && a.length ? a.map((x, i) => `${i + 1}) ${x}`).join(' ') : '');
  // ตัวเลขจากตารางการส่งงาน (ค่าเฉลี่ย/ร้อยละที่คำนวณแล้ว) — ให้ AI อ้างได้โดยไม่ต้องเดา · ไม่มีชื่อนักเรียน
  const calc = carStatCalc(d.stats || []);
  const a = calc.avg;
  const statLine = a && `ตารางการส่งงาน (${calc.count} ชิ้นงาน · ค่าเฉลี่ยทุกชิ้นงาน): นักเรียนทั้งหมด ${carFmtAvg(a.total)} คน · ส่งตามกำหนด ${carFmtAvg(a.on)} คน (ร้อยละ ${carFmtPct(a.pOn)}) · ส่งช้า ${carFmtAvg(a.late)} คน (ร้อยละ ${carFmtPct(a.pLate)}) · ไม่ส่ง ${carFmtAvg(a.none)} คน (ร้อยละ ${carFmtPct(a.pNone)})`;
  const lines = [
    `ภาคเรียนที่ ${d.semester || '-'} ปีการศึกษา ${d.year || '-'}`,
    `ตำแหน่ง: ${p.position || 'ครู'}${p.academicStanding ? ' วิทยฐานะ' + p.academicStanding : ''}`,
    d.title && `ชื่อเรื่องวิจัย: ${d.title}`,
    d.subject && `รายวิชา: ${d.subject}`,
    d.level && `ระดับชั้น: ${d.level}`,
    d.objectives && d.objectives.length && `วัตถุประสงค์การวิจัย: ${numList(d.objectives)}`,
    d.hypothesis && `สมมติฐาน: ${d.hypothesis}`,
    d.steps && d.steps.length && `วิธีดำเนินการ: ${numList(d.steps)}`,
    statLine,
    want('scores') && carScoreSummary(d.scoreSel), // คะแนนผลสัมฤทธิ์รายหัวข้อที่ครูเลือกจากรายวิชา (ตัวเลขรวม ไม่มีชื่อนักเรียน)
    want('note') && c.note && `ข้อมูลประกอบจากครู: ${c.note}`,
  ];
  return lines.filter(Boolean).join('\n');
}

// แนวทางของช่อง ส่งครั้งเดียวต่อคำขอ เฉพาะชนิดช่องที่มีในคำขอ
function carAiGuide(sys, fields) {
  const used = new Set(fields.map(f => f.field));
  const hints = sys.config.ai.prompts.fields.filter(([f]) => used.has(f)).map(([f, fl, h]) => `- .${f} (${fl}): ${h}`);
  if (!hints.length) return '';
  // มีข้อมูลคะแนนผลสัมฤทธิ์ → ช่องผลการวิเคราะห์/สรุปใช้ตัวเลขนั้น (ไม่ผูกกับตารางการส่งงาน)
  if (carScoreSummary(sys.state.doc && sys.state.doc.scoreSel) && (used.has('results') || used.has('conclusion'))) {
    const no = carScoreTableNo(sys.state.doc); // ตารางคะแนนพิมพ์ในรายงานเป็นตารางที่ 1 (ถ้าไม่มีตารางการส่งงาน) หรือ 2
    hints.push('- ข้อมูลคะแนนผลสัมฤทธิ์ในบริบท: ใช้ตัวเลขนั้นอธิบายผลตามวัตถุประสงค์ (หัวข้อที่คะแนนสูง/ต่ำ ร้อยละผู้ผ่านเกณฑ์) ห้ามแต่งตัวเลขเพิ่ม · '
      + `ตารางคะแนนในรายงานคือ “ตารางที่ ${no}” ใช้ “จากตารางที่ ${no} พบว่า” เมื่ออ้างตัวเลขคะแนน`
      + (no === 2 ? ' · ตารางที่ 1 คือตารางการส่งงาน (อย่าเอาตัวเลขคะแนนไปอ้างตารางที่ 1)' : ' · ยังไม่มีตารางการส่งงาน อย่าอ้างเรื่องการส่งงาน'));
  }
  return `\n\nแนวทางช่อง (ตามส่วนท้ายของคีย์):\n${hints.join('\n')}`;
}

// หัวกลุ่มของแต่ละช่อง (พิมพ์ครั้งเดียวต่อกลุ่ม) — ให้ AI เห็นหัวข้อที่กำลังเขียน
function carAiHeading(spec) {
  return `หัวข้อ: ${spec.item}`;
}

// ------------------------------------------------------------------
// ปุ่ม: ฝังที่ไหน · กดแล้วทำอะไร
// ------------------------------------------------------------------
function carAiSlots(sys, form) {
  const out = [];
  carAiSpecs(sys).forEach(s => {
    const fld = form.querySelector(`#${s.el}`)?.closest('.field');
    const host = fld && (fld.querySelector('.doc-item-h') || fld); // หัวช่อง: ชื่อซ้าย · แถวปุ่มขวา (เหมือน PA / ID-Plan / SAR)
    if (!host) return;
    out.push({ host, buttons: [
      { act: 'write', label: `เขียน${s.fieldLabel}`, icon: 'write', data: { field: s.field } },
      { act: 'polish', label: 'ปรับสำนวน', icon: 'polish', quiet: true, data: { field: s.field } },
    ] });
  });
  return out;
}

// act: 'all' = ปุ่มบนสุด · 'write' / 'polish' = ปุ่มใต้ป้ายของแต่ละช่อง (data-field)
function carAiResolve(sys, a, b) {
  if (a === 'all') {
    const pick = carAiSpecs(sys).filter(s => !badworkAiFilled(s));
    if (!pick.length) return { toast: 'ทุกช่องมีข้อความแล้ว — ใช้ปุ่มปรับสำนวนของแต่ละช่องได้' };
    return { specs: pick, mode: 'write' };
  }
  if (a === 'write' || a === 'polish') {
    const specs = carAiSpecs(sys).filter(s => s.field === b.dataset.field);
    if (!specs.length) return null;
    const pick = a === 'write' ? specs.filter(s => !badworkAiFilled(s)) : specs.filter(badworkAiFilled);
    if (!pick.length) return { toast: a === 'write' ? 'ช่องนี้มีข้อความแล้ว — ใช้ “ปรับสำนวน” ได้' : 'ช่องนี้ยังไม่มีข้อความให้ปรับสำนวน' };
    return { specs: pick, mode: a, total: specs.length };
  }
  return null; // act อื่น (เช่น ตัวฟอร์มเองที่มี data-doc-ai เป็นตัวกันติดซ้ำ) — ไม่ทำอะไร
}

// ------------------------------------------------------------------
// ลงทะเบียนตัวต่อ (รูปแบบเดียวกับ registerDocUi ท้าย js/car.js)
// ------------------------------------------------------------------
registerDocAi('car', {
  systemPrompt: sys => sys.config.ai.prompts.system,
  task: (sys, mode, current) => sys.config.ai.prompts.modes[mode](current),
  context: carAiContext,
  scope: carAiScope,
  guide: carAiGuide,
  itemHeading: carAiHeading,

  copy: {
    consent: 'ข้อความใน วิจัยในชั้นเรียน นี้ (ชื่อเรื่อง วัตถุประสงค์ ตัวเลขรวมในตารางการส่งงาน ตัวเลขสรุปคะแนนรายหัวข้อที่เลือกจากรายวิชา (ไม่มีชื่อ-รหัสนักเรียน) ข้อความที่กรอกไว้ และ "บริบทงานของฉัน" ไม่รวมชื่อ-นามสกุล) จะถูกส่งไปประมวลผลที่ Google Gemini เฉพาะส่วนที่เกี่ยวกับช่องที่กด\n\n'
      + 'โปรดอย่าพิมพ์ชื่อหรือข้อมูลที่ระบุตัวนักเรียนลงในช่อง (ใช้เป็นตัวเลขรวมเท่านั้น) และตรวจทานข้อความที่ AI เสนอทุกครั้งก่อนใช้\n\nต้องการดำเนินการต่อหรือไม่?',
    saveLabel: CAR_SAVE_LABEL,
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
    h.many('note', 'เช่น ปัญหาที่พบ นวัตกรรม/วิธีที่ใช้ ผลความพึงพอใจ (ตัวเลขรวม ไม่ระบุชื่อนักเรียน)'),
  ].join('\n    '),
  ctxStorageKey: sys => sys.config.ai.storageKeys.ctx,

  docRef: (sys, uid, id) => sys.col('docs', uid).doc(id),
  slots: carAiSlots,
  resolve: carAiResolve,
});
