// ==========================================================================
// ตัวต่อผู้ช่วย AI ของแท็บ SAR (ส่วนที่ 2 ผลงานที่เกิดจากการปฏิบัติหน้าที่) — บอกแกน (js/badwork-ai.js) ว่า SAR มีช่องอะไรให้ AI เขียน · ประกอบพร้อต์ยังไง · ฝังปุ่มตรงไหน · เก็บบริบทที่ไหน
//   รูปแบบเดียวกับ js/idp-ai.js / js/tra-ai.js (README ข้อ 6 ของหัวข้อ "เพิ่มระบบเอกสารใหม่")
//   • SAR เป็นแท็บในระบบ 'idp' แต่มีเอกสารเป็นของตัวเอง (SAR.doc / SAR.docId / SAR.list ใน js/sar.js · คอลเลกชัน idp_sar)
//     แกน AI อ่านเอกสารจาก sys.state จึงใช้ "ระบบจำลอง" sarAiSys() ที่ชี้ state เข้า SAR แล้วลงทะเบียนตัวต่อเป็น id 'sar' — ไม่ต้องแก้แกน และไม่ชนกับตัวต่อ 'idp' ของแท็บแผน
//   • ช่องที่ให้ AI เขียน = textarea 8 ช่องของส่วนที่ 2 (id = sar-<รหัส> : n11 n12 n13 n14 n15 n21 n22 guide) — รายการ/พร้อต์/ขอบเขตบริบทอยู่ที่ IDP_CONFIG.sarAi (js/idp-config.js)
//     ไม่แตะตารางตัวเลข ระดับคุณภาพ และกล่องติ๊ก (ครูกรอก/ระบบคำนวณเอง) — แต่ส่งค่าสรุปจากตารางเหล่านั้นให้ AI เป็นข้อมูลประกอบ เพื่อให้ข้อความตรงกับตัวเลขจริง
//   • ปุ่ม: แถวปุ่มที่หัวช่อง (ขวามือของชื่อช่อง ใน .doc-item-h เหมือน PA/ID-Plan) act write / polish / shorten + ปุ่มบนสุด "ร่างช่องที่ว่างของส่วนที่ 2" (act all)
//   • ผูกกับ ID-Plan: โหลดแผนของภาคเรียน/ปีเดียวกัน (วิธีการ · เป้าหมายของสมรรถนะที่เกี่ยวกับช่องนั้น) ส่งให้ AI เป็นกรอบ — แผน = สิ่งที่จะทำ ไม่ใช่หลักฐานว่าทำแล้ว
//   • ไม่เขียนทับช่องที่กรอกแล้ว · ปุ่มเขียนเติมเฉพาะช่องที่ว่าง · ปุ่มปรับสำนวน/ย่อทำเฉพาะช่องที่มีข้อความ · ผลทุกครั้งผ่านหน้าต่างตรวจทาน ไม่บันทึกให้เอง
//   • บริบทงานเก็บใน doc.aiCtx ของเอกสารในคอลเลกชัน 'sar' (idp_sar)
//   โหลดหลัง js/sar.js · js/idp-config.js · js/badwork-ai.js (LAZY_BUNDLES.idp) · ท้ายไฟล์ลงทะเบียน registerDocAi('sar', …)
//   ทุกฟังก์ชันรับ sys เป็นตัวแรก (แกนส่งตัวที่ถือไว้ตอนเริ่มงาน)
//
//   ไม่ต้องการผู้ช่วย AI ใน SAR: ลบไฟล์นี้ + เอา 'sar-ai' ออกจาก LAZY_MODULES/LAZY_BUNDLES (js/utils.js) และ PRECACHE (sw.js) — ฟอร์ม SAR ทำงานตามเดิม (sar.js เช็ก typeof sarAiSys ก่อนเรียก)
// ==========================================================================

// ระบบจำลองของ SAR: id 'sar' (ให้แกนหาตัวต่อเจอ) · config = IDP_CONFIG.sarAi · state ชี้เข้า SAR ของ js/sar.js
const SAR_AI_STATE = {
  get doc() { return SAR.doc; },
  set doc(v) { SAR.doc = v; },
  get docId() { return SAR.docId; },
  get list() { return SAR.list; },
};
let _sarAiSys = null;
function sarAiSys() {
  if (!_sarAiSys) {
    const idp = docSystem('idp');
    _sarAiSys = { id: 'sar', config: idp.config.sarAi, state: SAR_AI_STATE, col: (kind, uid) => idp.col(kind, uid) };
  }
  return _sarAiSys;
}

// แผน ID-Plan ของภาคเรียน/ปีเดียวกับ SAR — แกนประกอบพร้อต์แบบ sync จึงโหลดล่วงหน้าเก็บไว้ (ตอนวาดฟอร์ม · ตอนเปลี่ยนภาค/ปี) · ไม่พบแผน/โหลดไม่ได้ = ไม่ส่งส่วนนี้ ส่วนอื่นทำงานตามเดิม
//   ID-Plan = แผนที่ "จะทำ" · SAR = ผลที่ "ทำแล้ว" — พร้อต์บอก AI ว่าแผนไม่ใช่หลักฐานว่าทำแล้ว (IDP_CONFIG.sarAi system ข้อ 8)
let _sarAiPlan = { key: '', plan: null };
const sarAiPlanKey = d => `${String(d.semester).trim()}|${String(d.year).trim()}`;
async function sarAiLoadPlan(sys) {
  const uid = AppState.user?.uid, d = sys.state.doc;
  if (!uid || !d) return;
  const key = sarAiPlanKey(d);
  _sarAiPlan = { key, plan: null };
  try {
    const snap = await docSystem('idp').col('plans', uid).orderBy('createdAt', 'desc').get();
    const hit = snap.docs.map(x => x.data()).find(x => sarAiPlanKey(x) === key); // เรียงใหม่→เก่า: ใช้ฉบับล่าสุดของภาคนั้น
    if (_sarAiPlan.key === key) _sarAiPlan = { key, plan: hit || null };
  } catch (err) { console.error('SAR AI plan:', err); }
}
// ฟอร์ม SAR เรียกหลัง badworkAiMount — โหลดแผนทันที และโหลดใหม่เมื่อเปลี่ยนภาคเรียน/ปีการศึกษา
function sarAiAttach(form, sys) {
  sarAiLoadPlan(sys);
  form.addEventListener('change', e => { if (e.target.id === 'sar-semester' || e.target.id === 'sar-year') sarCollect(), sarAiLoadPlan(sys); });
  form.querySelector('#sar-year')?.addEventListener('input', () => { clearTimeout(sarAiAttach.t); sarAiAttach.t = setTimeout(() => { sarCollect(); sarAiLoadPlan(sys); }, 600); });
}

// ช่องของส่วนที่ 2 ทั้งหมด · ไม่มีผลข้างเคียง (แกนเรียกซ้ำเพื่อดูตัวอย่างขอบเขตของปุ่ม)
function sarAiSpecs(sys) {
  return sys.config.ai.prompts.fields.map(([k, label, hint]) => ({
    key: k, el: `sar-${k}`, group: k, field: k,
    item: label, subs: [], fieldLabel: label, label, hint,
  }));
}

// รวมบริบทที่ชุดช่องนี้ต้องใช้ (scope ของ config ใช้รหัสช่องเป็นคีย์)
function sarAiScope(sys, fields) {
  const set = new Set();
  const P = sys.config.ai.prompts;
  fields.forEach(f => {
    (P.scope[f.field] || []).forEach(k => set.add(k));
    if (f.field in P.planMap) { set.add('plan'); (P.planMap[f.field] || ['*']).forEach(c => set.add('plan:' + c)); } // null = ทุกสมรรถนะ
  });
  return set;
}

// บรรทัดบริบทเรียงลำดับคงที่เสมอ (ส่วนที่ซ้ำกันอยู่ต้นข้อความ → ช่วย implicit caching) · scope = Set ของส่วนที่ต้องส่ง (null = ทุกส่วน)
//   ส่งเฉพาะข้อมูลสรุป (ชื่อวิชา ห้อง จำนวนคน ค่าเฉลี่ย ร้อยละ) — ไม่ส่งชื่อ-นามสกุลครู และไม่มีข้อมูลรายบุคคลของนักเรียน
function sarAiContext(sys, known = {}, scope = null) {
  sarCollect(); // ดึงค่าที่พิมพ์ค้างในฟอร์มเข้า SAR.doc
  const d = sys.state.doc, c = d.aiCtx || {}, f = d.f || {}, R = d.rows || {}, s = sarStats(d);
  let p = {};
  try { p = AppState.teacherProfile || {}; } catch (err) { /* ไม่มีโปรไฟล์ — ข้าม */ }
  const want = k => !scope || scope.has(k);
  const has = r => r && Object.values(r).some(Boolean);
  const list = (a, fmt) => (a || []).filter(has).map(fmt).join('; ') || '-';
  const sub = r => `${r.name || '-'}${r.room ? ' ' + r.room : ''}${r.n ? ` (${r.n} คน` : ''}${r.hours ? `${r.n ? ' ' : ' ('}${r.hours} ชม./สัปดาห์` : ''}${r.n || r.hours ? ')' : ''}`;
  const methods = SAR_METHODS.filter((_, i) => f.m?.[i]).concat(f.mOther ? [f.mOther] : []);
  const gradeRows = (R.grades || []).map((r, i) => ({ r, g: s.rowG[i] })).filter(x => x.g && x.g.all);
  const hasHome = f.hmCls || f.hmM || f.hmF;
  const plan = want('plan') && _sarAiPlan.key === sarAiPlanKey(d) ? _sarAiPlan.plan : null;
  const planLines = [];
  if (plan) {
    const pick = k => !scope || scope.has('plan:*') || scope.has('plan:' + k);
    docSystem('idp').config.competencies.forEach(([cid, , full]) => {
      const c = (plan.comps || {})[cid];
      if (!c || !pick(cid) || !(c.method || c.goal)) return;
      planLines.push(`  - ${full}: วิธีการ: ${String(c.method || '-').replace(/\s+/g, ' ').slice(0, 300)} | เป้าหมาย: ${String(c.goal || '-').replace(/\s+/g, ' ').slice(0, 200)}`);
    });
  }
  const lines = [
    `ภาคเรียนที่ ${d.semester || '-'} ปีการศึกษา ${d.year || '-'}`,
    `ตำแหน่ง: ${p.position || 'ครู'}${p.academicStanding ? ' วิทยฐานะ' + p.academicStanding : ''}`,
    want('subjects') && `รายวิชาที่สอน: ${list(R.teaching, sub)}`,
    want('activities') && `กิจกรรมพัฒนาผู้เรียน: ${list(R.activities, sub)}`,
    want('homeroom') && hasHome && `ครูที่ปรึกษา: ชั้น ${f.hmCls || '-'} นักเรียนรวม ${s.homeN} คน`,
    want('grades') && s.gt.all && `ผลสัมฤทธิ์ทางการเรียนรวม: เกรดเฉลี่ย ${sarFmt(s.gt.avg)} · ผลการเรียน 3 ขึ้นไป ${sarFmt(s.pHigh)}% · 1–2.5 ${sarFmt(s.pMid)}% · 0/ร/มส ${sarFmt(s.pLow)}% (นักเรียนรวม ${s.gt.all} คน)`,
    want('grades') && gradeRows.length && `เกรดเฉลี่ยรายวิชา: ${gradeRows.map(({ r, g }) => `${r.name || '-'}${r.room ? ' ' + r.room : ''} ${sarFmt(g.avg)}`).join('; ')}`,
    want('traits') && s.traitN && `คุณลักษณะอันพึงประสงค์ (จำนวนคน): ${list(R.traits, r => `${r.room || '-'} ดีเยี่ยม ${r.g3 || 0} ดี ${r.g2 || 0} ผ่าน ${r.g1 || 0} ไม่ผ่าน ${r.g0 || 0}`)}`,
    want('methods') && methods.length && `รูปแบบ/วิธีจัดการเรียนการสอนที่ครูเลือกไว้: ${methods.join(', ')}`,
    want('eval') && s.sv && `ผลประเมินการสอนโดยนักเรียน: ค่าเฉลี่ย ${sarFmt(s.sv)} ระดับ${s.svLabel}`,
    want('eval') && s.pl && `ผลประเมินตนเองด้านแผนการจัดการเรียนรู้: ค่าเฉลี่ย ${sarFmt(s.pl)} ระดับ${s.plLabel}`,
    want('develop') && (R.training || []).some(has) && `การอบรม/พัฒนาตนเอง: ${list(R.training, r => r.topic || '-')} (รวม ${sarFmt(s.trainHours, 1)} ชั่วโมง)`,
    want('develop') && f.plc && `PLC: ${f.plc}`,
    want('develop') && (R.awards || []).some(has) && `รางวัล/เกียรติคุณ: ${list(R.awards, r => r.title || '-')}`,
    planLines.length && `แผน ID-Plan ของภาคเรียนนี้ (เป็นแผนที่วางไว้ ไม่ใช่ผลที่ทำแล้ว):\n${planLines.join('\n')}`,
    want('level') && c.level && `ระดับชั้นที่สอน: ${c.level}`,
    want('did') && c.did && `สิ่งที่ครูทำจริงในภาคเรียนนี้: ${c.did}`,
    want('media') && c.media && `สื่อ นวัตกรรม เทคโนโลยีที่ใช้จริง: ${c.media}`,
    want('care') && c.care && `การดูแลช่วยเหลือนักเรียน/บริหารชั้นเรียนที่ทำจริง: ${c.care}`,
    want('problems') && c.problems && `ปัญหาหลักที่ครูพบจริง: ${c.problems}`,
    want('prev') && c.prev && `ผลปีก่อน: ${c.prev}`,
  ];
  return lines.filter(Boolean).join('\n');
}

// แนวทางของช่อง ส่งครั้งเดียวต่อคำขอ เฉพาะช่องที่มีในคำขอ
function sarAiGuide(sys, fields) {
  const used = new Set(fields.map(f => f.field));
  const hints = sys.config.ai.prompts.fields.filter(([k]) => used.has(k)).map(([k, l, h]) => `- .${k} (${l}): ${h}`);
  if (!hints.length) return '';
  return `\n\nแนวทางช่อง (ตามส่วนท้ายของคีย์):\n${hints.join('\n')}`;
}

// หัวของแต่ละช่อง (พิมพ์ครั้งเดียวต่อกลุ่ม) — ให้ AI เห็นหัวข้อที่กำลังเขียน
function sarAiHeading(spec) {
  return `หัวข้อ: ${spec.item}`;
}

// ------------------------------------------------------------------
// ปุ่ม: ฝังที่ไหน · กดแล้วทำอะไร
// ------------------------------------------------------------------
function sarAiSlots(sys, form) {
  const out = [];
  // แถวปุ่มอยู่ที่หัวช่อง (ขวามือของชื่อช่อง — .doc-item-h เหมือน PA/ID-Plan) · ปุ่มแตะเฉพาะช่องนั้น
  sarAiSpecs(sys).forEach(s => {
    const fld = form.querySelector(`#${s.el}`)?.closest('.field');
    const host = fld && (fld.querySelector('.doc-item-h') || fld);
    if (!host) return;
    out.push({ host, buttons: [
      { act: 'write', label: 'เขียน/เติมให้', icon: 'write', data: { field: s.field } },
      { act: 'polish', label: 'ปรับสำนวน', icon: 'polish', quiet: true, data: { field: s.field } },
      { act: 'shorten', label: 'ย่อให้กระชับ', icon: 'shorten', quiet: true, data: { field: s.field } },
    ] });
  });
  return out;
}

// act: 'all' = ปุ่มบนสุด · 'write' / 'polish' / 'shorten' = ปุ่มที่หัวช่อง (data-field)
function sarAiResolve(sys, a, b) {
  if (a === 'all') {
    const pick = sarAiSpecs(sys).filter(s => !badworkAiFilled(s));
    if (!pick.length) return { toast: 'ทุกช่องในส่วนที่ 2 มีข้อความแล้ว — ใช้ปุ่มปรับสำนวนของแต่ละช่องได้' };
    return { specs: pick, mode: 'write' };
  }
  if (a === 'write' || a === 'polish' || a === 'shorten') {
    const specs = sarAiSpecs(sys).filter(s => s.field === b.dataset.field);
    if (!specs.length) return null;
    const pick = a === 'write' ? specs.filter(s => !badworkAiFilled(s)) : specs.filter(badworkAiFilled);
    if (!pick.length) return { toast: a === 'write' ? 'ช่องนี้มีข้อความแล้ว — ใช้ “ปรับสำนวน” หรือ “ย่อให้กระชับ” ได้' : 'ช่องนี้ยังไม่มีข้อความให้ปรับ' };
    return { specs: pick, mode: a, total: specs.length };
  }
  return null; // act อื่น (เช่น ตัวฟอร์มเองที่มี data-doc-ai เป็นตัวกันติดซ้ำ) — ไม่ทำอะไร
}

// ------------------------------------------------------------------
// ลงทะเบียนตัวต่อ (รูปแบบเดียวกับ registerDocAi ท้าย js/idp-ai.js)
// ------------------------------------------------------------------
registerDocAi('sar', {
  systemPrompt: sys => sys.config.ai.prompts.system,
  task: (sys, mode, current) => sys.config.ai.prompts.modes[mode](current),
  context: sarAiContext,
  scope: sarAiScope,
  guide: sarAiGuide,
  itemHeading: sarAiHeading,

  copy: {
    consent: 'ข้อความใน SAR นี้ (รายวิชา ห้อง จำนวนนักเรียน ผลการเรียนแบบสรุป การอบรม รางวัล ข้อความที่กรอกไว้ในส่วนที่ 2 และ "บริบทงานของฉัน" ไม่รวมชื่อ-นามสกุล) จะถูกส่งไปประมวลผลที่ Google Gemini เฉพาะส่วนที่เกี่ยวกับช่องที่กด\n\n'
      + 'โปรดอย่าพิมพ์ชื่อหรือข้อมูลที่ระบุตัวนักเรียนลงในช่อง (ใช้เป็นตัวเลขรวมเท่านั้น) และตรวจทานข้อความที่ AI เสนอทุกครั้งก่อนใช้ — SAR เป็นรายงานผลงานจริงของครู ต้องตรงกับสิ่งที่ทำ\n\nต้องการดำเนินการต่อหรือไม่?',
    saveLabel: 'บันทึก SAR',
    topPoints: [
      'อ่านจากข้อมูลที่มีใน SAR นี้ เช่น รายวิชา ผลการเรียนรวม วิธีจัดการเรียนการสอนที่ติ๊กไว้ และบริบทงานด้านล่าง',
      'เสนอให้ตรวจก่อนใช้เสมอ ไม่เขียนทับช่องที่กรอกแล้ว และไม่บันทึกให้เอง',
      'ปุ่มนี้ร่างช่องที่ว่างของส่วนที่ 2 ทั้งหมด · ปุ่มที่หัวช่องแต่ละช่องทำเฉพาะช่องนั้น',
    ],
    topWarn: 'AI ไม่รู้ว่าครูทำอะไรจริง — ใส่ข้อมูลในบริบทงานให้มากที่สุด แล้วแก้ข้อความให้ตรงกับผลงานจริงก่อนใช้ · อย่าพิมพ์ชื่อหรือข้อมูลที่ระบุตัวนักเรียน',
    topButton: 'ร่างช่องที่ว่างของส่วนที่ 2',
    reviewNote: '“…” คือตัวเลขหรือรายละเอียดที่ครูต้องกรอกเอง',
    placeholder: { mark: '…', toast: ' · มี “…” ที่ต้องกรอกเอง' }, // พร้อต์ให้ AI ใช้ “…” แทนสิ่งที่ไม่รู้
    ctxTitle: 'บริบทงานของฉัน',
    ctxNote: 'ยิ่งระบุตามจริง AI ยิ่งเขียนตรงงาน และไม่ต้องกด “สร้างใหม่” หลายรอบ · ว่างไว้ได้ AI จะเขียนเป็นกรอบกว้าง ๆ และใช้ “…” แทนรายละเอียด · ส่งให้ AI เฉพาะส่วนที่เกี่ยวกับช่องที่กด',
    reviewGroup: spec => ({ id: spec.group, title: spec.item }),
  },

  ctxBody: (sys, c, h) => [
    h.one('level', 'เช่น ม.2'),
    h.many('did', 'เช่น ปรับคำอธิบายรายวิชาให้สอดคล้องตัวชี้วัด · ใช้ข้อสอบกลางภาคแบบวิเคราะห์ · ทำแผนแบบสืบเสาะ 3 หน่วย'),
    h.many('media', 'เช่น ใบงาน · สื่อวิดีโอที่ทำเอง · Google Classroom · แบบฝึกออนไลน์'),
    h.many('care', 'เช่น เยี่ยมบ้าน · คัดกรองรายบุคคลด้วย SDQ · ติดตามนักเรียนขาดเรียนกับผู้ปกครอง'),
    h.many('problems', 'เช่น นักเรียนอ่านโจทย์ไม่แตกฉาน · ขาดเรียนบ่อย'),
    h.one('prev', 'เช่น ผ่านเกณฑ์ ร้อยละ 62 · เกรดเฉลี่ย 2.41'),
  ].join('\n    '),
  ctxStorageKey: sys => sys.config.ai.storageKeys.ctx,

  docRef: (sys, uid, id) => sarCol(uid).doc(id),
  slots: sarAiSlots,
  resolve: sarAiResolve,
});
