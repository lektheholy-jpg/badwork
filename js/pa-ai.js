// ==========================================================================
// ตัวต่อผู้ช่วย AI ของระบบ PA — บอกแกน (js/badwork-ai.js) ว่า PA มีช่องอะไรให้ AI เขียน · ประกอบพร้อต์ยังไง · ฝังปุ่มตรงไหน · เก็บบริบทที่ไหน
//   ย้ายมาจาก js/badwork-ai.js (ไม่เปลี่ยนพร้อต์/HTML/ข้อความใดๆ — tests/pa-config.test.js เทียบ golden ให้)
//   • ช่องส่วนที่ 2 (ประเด็นท้าทาย) และงานตามมาตรฐานตำแหน่ง 15 ข้อ × 4 ช่อง (1.1–3.3) · ชื่อภาคเรียนจาก paTermLabels
//   • ข้อมูลประกอบพร้อต์อ่านจากโครง d.load / d.aiCtx ของ PA · พร้อต์/ช่อง/ตารางบริบทอยู่ที่ sys.config.ai.prompts (js/pa-config.js)
//   • ปุ่ม: ใต้ช่องส่วนที่ 2 (data-key) · ใต้งานแต่ละข้อ (.pa-witem · data-item) · ปุ่มบนสุด "ร่างส่วนที่ 2 ที่ว่าง"
//   • บริบทงานเก็บใน doc.aiCtx ของเอกสารในคอลเลกชัน 'agreements'
//   โหลดหลัง js/pa.js และ js/badwork-ai.js (LAZY_BUNDLES.pa) · ท้ายไฟล์ลงทะเบียน registerDocAi('pa', …)
//   ทุกฟังก์ชันรับ sys เป็นตัวแรก (แกนส่งตัวที่ถือไว้ตอนเริ่มงาน)
// ==========================================================================

// ช่องงานตามมาตรฐานตำแหน่ง 15 ข้อ × 4 ช่อง (ids = ระบุเฉพาะบางข้อ หรือ null = ทั้งหมด)
function paAiWorkSpecs(sys, ids) {
  const [t1, t2] = paTermLabels(sys.state.doc?.fiscalYear);
  const defs = [
    ['s1', `งานที่จะดำเนินการ · ${t1}`, sys.config.ai.prompts.workHints.s1],
    ['s2', `งานที่จะดำเนินการ · ${t2}`, sys.config.ai.prompts.workHints.s2],
    ['outcome', 'ผลลัพธ์ (Outcomes) ที่คาดหวังกับผู้เรียน', sys.config.ai.prompts.workHints.outcome],
    ['indicator', 'ตัวชี้วัด (Indicators)', sys.config.ai.prompts.workHints.indicator],
  ];
  const out = [];
  sys.config.workItems.forEach(([, , items]) => items.forEach(([id, label]) => {
    if (ids && !ids.includes(id)) return;
    defs.forEach(([f, fl, hint]) => out.push({
      key: `${id}.${f}`, el: `pa-wi-${id.replace('.', '_')}-${f}`, group: id[0],
      item: `${id} ${label}`, fieldLabel: fl,
      label: `ข้อ ${id} ${label} — ${fl}`, hint,
    }));
  }));
  return out;
}

// รวมบริบทที่ชุดช่องนี้ต้องใช้ (ช่องงาน key = "1.1.s1" → ข้อ "1.1" · ช่องส่วนที่ 2 = "part2")
function paAiScope(sys, fields) {
  const set = new Set();
  fields.forEach(f => {
    const id = f.group ? f.key.slice(0, f.key.lastIndexOf('.')) : 'part2';
    (sys.config.ai.prompts.scope[id] || sys.config.ai.prompts.scope.part2).forEach(k => set.add(k));
  });
  return set;
}

// บรรทัดบริบทเรียงลำดับคงที่เสมอ (ส่วนที่ซ้ำกันอยู่ต้นข้อความ → ช่วย implicit caching) · scope = Set ของส่วนที่ต้องส่ง (null = ทุกส่วน)
function paAiContext(sys, known = {}, scope = null) {
  paCollectFormData(); // ดึงค่าที่พิมพ์ค้างในฟอร์มเข้า sys.state.doc
  const d = sys.state.doc, L = d.load || {}, c = d.aiCtx || {};
  let p = {};
  try { p = AppState.teacherProfile || {}; } catch (err) { /* ไม่มีโปรไฟล์ — ข้าม */ }
  const rows = a => (a || []).map(r => `${r.name}${r.hours ? ` (${docFmtH(r.hours)} ชม./สัปดาห์)` : ''}`).join('; ') || '-';
  const types = sys.config.classroomTypes.filter(([k]) => d.classroomTypes[k]).map(([, l]) => l).join(', ') || '-';
  const [t1, t2] = paTermLabels(d.fiscalYear);
  const cls = [c.level && `ระดับชั้น ${c.level}`, c.rooms && `${c.rooms} ห้อง`, c.students && `นักเรียนรวม ${c.students} คน`].filter(Boolean).join(' · ');
  const names = { challengeTitle: 'ประเด็นท้าทาย', problem: 'สภาพปัญหา', method: 'วิธีดำเนินการ', outcomeQuant: 'ผลลัพธ์เชิงปริมาณ', outcomeQual: 'ผลลัพธ์เชิงคุณภาพ' };
  const part2 = keys => keys.map(k => {
    const v = String(known[k] ?? d[k] ?? '').trim();
    return v ? `${names[k]} (มีอยู่แล้วในเอกสาร): ${v.slice(0, 400)}` : '';
  });
  const want = k => !scope || scope.has(k);
  const lines = [
    `ปีงบประมาณ พ.ศ. ${d.fiscalYear || '-'} (${t1} และ ${t2})`,
    `ตำแหน่ง: ${p.position || 'ครู'}${p.academicStanding ? ' วิทยฐานะ' + p.academicStanding : ''}`,
    want('group') && `กลุ่มสาระการเรียนรู้: ${L.group || '-'}`,
    want('types') && `ประเภทห้องเรียน: ${types}`,
    want('subjects') && `รายวิชาที่สอน: ${rows(L.subjects)}`,
    want('activities') && `กิจกรรมพัฒนาผู้เรียน: ${rows(L.activities)}`,
    want('support') && `งานส่งเสริมและสนับสนุนการจัดการเรียนรู้ (1.2): ${rows(L.support)}`,
    want('quality') && `งานพัฒนาคุณภาพการจัดการศึกษาของสถานศึกษา (1.3): ${rows(L.quality)}`,
    want('policy') && `งานตอบสนองนโยบายและจุดเน้น (1.4): ${rows(L.policy)}`,
    want('class') && cls && `ห้องเรียนที่รับผิดชอบ: ${cls}`,
    want('problems') && c.problems && `ปัญหาหลักที่ครูพบจริง: ${c.problems}`,
    want('prev') && c.prev && `ผลปีก่อน: ${c.prev}`,
    want('focus') && c.focus && `จุดเน้นของโรงเรียน: ${c.focus}`,
    ...(scope === null || scope.has('part2') ? part2(Object.keys(names)) : scope.has('title') ? part2(['challengeTitle']) : []),
  ];
  return lines.filter(Boolean).join('\n');
}

// แนวทางช่องงาน 4 แบบ ส่งครั้งเดียวต่อคำขอ (เฉพาะเมื่อมีช่องงานในคำขอ)
function paAiGuide(sys, fields) {
  return fields.some(f => f.group)
    ? `\n\nแนวทางช่องงาน (ใช้กับทุกข้อ ตามส่วนท้ายของคีย์):\n${Object.entries(sys.config.ai.prompts.workHints).map(([k, v]) => `- .${k}: ${v}`).join('\n')}`
    : '';
}

// ------------------------------------------------------------------
// ปุ่ม: ฝังที่ไหน · กดแล้วทำอะไร
// ------------------------------------------------------------------
function paAiSlots(sys, form) {
  const out = [];
  // ส่วนที่ 2: แถวปุ่มอยู่ที่หัวช่อง (ขวามือของชื่อช่อง) · ปุ่มแตะเฉพาะช่องนั้น
  sys.config.ai.prompts.part2.forEach(f => {
    const ta = form.querySelector('#' + f.el);
    if (!ta) return;
    const fld = ta.closest('.field');
    out.push({ host: fld.querySelector('.pa-field-h') || fld, buttons: [
      { act: 'f-write', label: 'เขียน/เติมให้', icon: 'write', data: { key: f.key } },
      { act: 'f-polish', label: 'ปรับสำนวน', icon: 'polish', quiet: true, data: { key: f.key } },
      { act: 'f-shorten', label: 'ย่อให้กระชับ', icon: 'shorten', quiet: true, data: { key: f.key } },
    ] });
  });
  // งานตามมาตรฐานตำแหน่งแต่ละข้อ: แถวปุ่มอยู่ที่หัวกล่องของข้อ (ขวามือของชื่อข้อ) — ปุ่มใช้กับทั้งกล่อง 4 ช่อง จึงอยู่ในกรอบเดียวกับชื่อข้อ
  form.querySelectorAll('.pa-witem').forEach(w => {
    const id = w.querySelector('[data-wi]')?.dataset.wi;
    if (!id) return;
    out.push({ host: w.querySelector('.pa-witem-h') || w, buttons: [
      { act: 'i-write', label: 'เขียนช่องที่ว่าง', icon: 'write', data: { item: id } },
      { act: 'i-polish', label: 'ปรับสำนวนทั้งข้อ', icon: 'polish', quiet: true, data: { item: id } },
    ] });
  });
  return out;
}

// act: 'all' = ปุ่มบนสุด · 'f-<โหมด>' = ปุ่มใต้ช่องส่วนที่ 2 · 'i-<โหมด>' = ปุ่มใต้งานแต่ละข้อ
// ปุ่มบนสุด: ร่างเฉพาะช่องส่วนที่ 2 ที่ยังว่าง (5 ช่อง = 1 คำขอ) · ช่องงาน 1.1–3.3 ใช้ปุ่มใต้แต่ละข้อ (ข้อละ 4 ช่อง) ไม่ยิงทั้ง 60 ช่องในครั้งเดียว
function paAiResolve(sys, a, b) {
  const part2 = sys.config.ai.prompts.part2;
  if (a === 'all') {
    const pick = part2.filter(s => !badworkAiFilled(s));
    if (!pick.length) return { toast: 'ช่องส่วนที่ 2 มีข้อความครบแล้ว — ใช้ปุ่มปรับสำนวนใต้แต่ละช่อง หรือปุ่มของแต่ละข้อในส่วนงานตามมาตรฐานตำแหน่งได้' };
    return { specs: pick, mode: 'write' };
  }
  if (a.startsWith('f-')) {
    const mode = a.slice(2), spec = part2.find(s => s.key === b.dataset.key);
    if (!spec) return null;
    if (mode !== 'write' && !badworkAiFilled(spec)) return { toast: 'ช่องนี้ยังว่าง — กด “ช่วยเขียน/เติม” ก่อน' };
    return { specs: [spec], mode };
  }
  if (a.startsWith('i-')) {
    const mode = a.slice(2), specs = paAiWorkSpecs(sys, [b.dataset.item]);
    const pick = mode === 'write' ? specs.filter(s => !badworkAiFilled(s)) : specs.filter(badworkAiFilled);
    if (!pick.length) return { toast: mode === 'write' ? 'ช่องในข้อนี้มีข้อความครบแล้ว — ใช้ “ปรับสำนวนทั้งข้อ” ได้' : 'ข้อนี้ยังไม่มีข้อความให้ปรับสำนวน' };
    return { specs: pick, mode, total: specs.length };
  }
  return null; // act อื่น (เช่น ตัวฟอร์มเองที่มี data-doc-ai เป็นตัวกันติดซ้ำ) — ไม่ทำอะไร
}

// ------------------------------------------------------------------
// ลงทะเบียนตัวต่อ (รูปแบบเดียวกับ registerDocUi ท้าย js/pa.js)
// ------------------------------------------------------------------
registerDocAi('pa', {
  systemPrompt: sys => sys.config.ai.prompts.system,
  task: (sys, mode, current) => sys.config.ai.prompts.modes[mode](current),
  context: paAiContext,
  scope: paAiScope,
  guide: paAiGuide,
  itemHeading: spec => `ข้อ ${spec.item}`,

  copy: {
    consent: 'ข้อความในฟอร์ม PA นี้ (รายวิชา ชั่วโมงสอน ข้อความที่กรอกไว้ และ "บริบทงานของฉัน" เช่น ระดับชั้น จำนวนห้อง/นักเรียนรวม ปัญหาหลัก ผลปีก่อน จุดเน้น ไม่รวมชื่อ-นามสกุล) จะถูกส่งไปประมวลผลที่ Google Gemini เฉพาะส่วนที่เกี่ยวกับช่องที่กด\n\n'
      + 'โปรดอย่าพิมพ์ชื่อหรือข้อมูลที่ระบุตัวนักเรียนลงในช่อง (ใช้เป็นตัวเลขรวมเท่านั้น) และตรวจทานข้อความที่ AI เสนอทุกครั้งก่อนใช้\n\nต้องการดำเนินการต่อหรือไม่?',
    saveLabel: 'บันทึกPersonal Agreement',
    topPoints: [
      'อ่านจากข้อมูลที่มีในเอกสารนี้ เช่น รายวิชา ชั่วโมงสอน ข้อความที่กรอกไว้ และบริบทงานด้านล่าง',
      'เสนอให้ตรวจก่อนใช้เสมอ ไม่เขียนทับช่องที่กรอกแล้ว และไม่บันทึกให้เอง',
      'ปุ่มนี้ร่างส่วนที่ 2 ที่ว่าง · งานข้อ 1.1–3.3 กดปุ่มใต้แต่ละข้อ',
    ],
    topWarn: 'อย่าพิมพ์ชื่อหรือข้อมูลที่ระบุตัวนักเรียนลงในช่อง',
    topButton: 'ร่างส่วนที่ 2 ที่ว่าง',
    reviewNote: '“…” คือตัวเลขที่ครูต้องกรอกเอง',
    placeholder: { mark: '…', toast: ' · มี “…” ที่ต้องกรอกตัวเลข' }, // พร้อต์ของ PA ให้ AI ใช้ “…” แทนตัวเลขที่ไม่รู้
    ctxTitle: 'บริบทงานของฉัน',
    ctxNote: 'ยิ่งระบุตามจริง AI ยิ่งเขียนตรงงาน และไม่ต้องกด “สร้างใหม่” หลายรอบ · ว่างไว้ได้ AI จะเขียนกว้าง ๆ และใช้ “…” แทนตัวเลข · ส่งให้ AI เฉพาะส่วนที่เกี่ยวกับช่องที่กด',
    reviewGroup: spec => spec.group ? { id: spec.item, title: 'ข้อ ' + spec.item } : { id: 'part2', title: 'ส่วนที่ 2 ประเด็นท้าทาย' },
  },

  ctxBody: (sys, c, h) => [
    `<div class="doc-ai-ctx-grid">${h.one('level', 'เช่น ม.2')}${h.one('rooms', 'เช่น 4', { numeric: true })}${h.one('students', 'เช่น 148', { numeric: true })}</div>`,
    h.many('problems', 'เช่น นักเรียนอ่านโจทย์ปัญหาไม่คล่อง · ส่งงานไม่ครบ'),
    h.many('prev', 'เช่น ผ่านเกณฑ์ ร้อยละ 62 · เกรดเฉลี่ย 2.41'),
    h.one('focus', 'เช่น ส่งเสริมการอ่านออกเขียนได้'),
  ].join('\n    '),
  ctxStorageKey: sys => sys.config.ai.storageKeys.ctx,

  docRef: (sys, uid, id) => sys.col('agreements', uid).doc(id),
  slots: paAiSlots,
  resolve: paAiResolve,
});
