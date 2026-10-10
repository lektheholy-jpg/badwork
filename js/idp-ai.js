// ==========================================================================
// ตัวต่อผู้ช่วย AI ของระบบ ID-Plan — บอกแกน (js/badwork-ai.js) ว่า ID-Plan มีช่องอะไรให้ AI เขียน · ประกอบพร้อต์ยังไง · ฝังปุ่มตรงไหน · เก็บบริบทที่ไหน
//   รูปแบบเดียวกับ js/pa-ai.js (README ข้อ 6 ของหัวข้อ "เพิ่มระบบเอกสารใหม่")
//   • ช่องที่ให้ AI เขียน = ส่วนที่ 2 รายละเอียดการพัฒนาตนเอง · 11 สมรรถนะ × 3 ช่อง
//       วิธีการ / รูปแบบการพัฒนา (method) · เป้าหมาย (goal) · ประโยชน์ที่คาดว่าจะได้รับ (benefit)
//     ไม่แตะ อันดับความสำคัญ / ระยะเวลา (ครูตัดสินใจเอง) และไม่แตะส่วนที่ 3 (ตารางสรุป)
//   • id ของ textarea = idp-<รหัสสมรรถนะ>-<ช่อง> (เช่น idp-c1-method) — ใส่ไว้ใน idpRenderFormView (js/idp.js)
//   • พร้อต์/ช่อง/ตารางบริบทอยู่ที่ sys.config.ai.prompts (js/idp-config.js)
//   • ปุ่ม: แถวปุ่มใต้ชื่อสมรรถนะแต่ละแถว (act c-write / c-polish · data-cid) + ปุ่มบนสุด "ร่างช่องที่ว่างของทุกสมรรถนะ" (act all)
//   • วิธีการมาตรฐานของ สพฐ. ที่ระบบเติมให้แผนใหม่ (idpBlankDoc) ถือเป็น "ยังไม่ได้ปรับ" → ปุ่มเขียนจะปรับให้ตรงงานจริงของครู
//     (ปุ่มบนสุดไม่แตะ — ยิงเฉพาะช่องที่ว่างจริง จำกัดจำนวนช่องต่อคำขอ)
//   • บริบทงานเก็บใน doc.aiCtx ของเอกสารในคอลเลกชัน 'plans' (idp_plans)
//   โหลดหลัง js/idp.js และ js/badwork-ai.js (LAZY_BUNDLES.idp) · ท้ายไฟล์ลงทะเบียน registerDocAi('idp', …)
//   ทุกฟังก์ชันรับ sys เป็นตัวแรก (แกนส่งตัวที่ถือไว้ตอนเริ่มงาน)
// ==========================================================================

// ช่องของทุกสมรรถนะ (ids = ระบุเฉพาะบางสมรรถนะ หรือ null = ทั้งหมด) · ไม่มีผลข้างเคียง (แกนเรียกซ้ำเพื่อดูตัวอย่างขอบเขตของปุ่ม)
function idpAiSpecs(sys, ids) {
  const out = [];
  sys.config.competencies.forEach(([cid, , full, subs, std]) => {
    if (ids && !ids.includes(cid)) return;
    sys.config.ai.prompts.fields.forEach(([f, fl, hint]) => out.push({
      key: `${cid}.${f}`, el: `idp-${cid}-${f}`, group: cid, cid, field: f,
      item: full, subs: subs || [], fieldLabel: fl, label: `${full} — ${fl}`, hint,
      std: (std || []).join('\n'), // วิธีการมาตรฐานของสมรรถนะนี้ที่ระบบเติมให้ (ใช้ดูว่าครูยังไม่ได้ปรับช่อง method)
    }));
  });
  return out;
}

const idpAiNorm = v => String(v || '').replace(/\r/g, '').trim();
// ช่องวิธีการที่ยังเป็นข้อความมาตรฐานเดิมทุกตัวอักษร (ครูยังไม่ได้แก้)
function idpAiIsStd(spec) {
  const v = idpAiNorm(document.getElementById(spec.el)?.value);
  return spec.field === 'method' && !!spec.std && v !== '' && v === idpAiNorm(spec.std);
}

// รวมบริบทที่ชุดช่องนี้ต้องใช้ (ช่อง key = "c1.goal" → สมรรถนะ "c1")
function idpAiScope(sys, fields) {
  const set = new Set();
  fields.forEach(f => (sys.config.ai.prompts.scope[f.cid] || []).forEach(k => set.add(k)));
  return set;
}

// บรรทัดบริบทเรียงลำดับคงที่เสมอ (ส่วนที่ซ้ำกันอยู่ต้นข้อความ → ช่วย implicit caching) · scope = Set ของส่วนที่ต้องส่ง (null = ทุกส่วน)
function idpAiContext(sys, known = {}, scope = null) {
  idpCollect(); // ดึงค่าที่พิมพ์ค้างในฟอร์มเข้า sys.state.doc
  const d = sys.state.doc, c = d.aiCtx || {};
  let p = {};
  try { p = AppState.teacherProfile || {}; } catch (err) { /* ไม่มีโปรไฟล์ — ข้าม */ }
  const rows = a => (a || []).map(r => `${r.name}${r.hours ? ` (${docFmtH(r.hours)} ชม./สัปดาห์)` : ''}`).join('; ') || '-';
  const want = k => !scope || scope.has(k);
  const lines = [
    `ภาคเรียนที่ ${d.semester || '-'} ปีการศึกษา ${d.year || '-'}`,
    `ตำแหน่ง: ${p.position || 'ครู'}${p.academicStanding ? ' วิทยฐานะ' + p.academicStanding : ''}`,
    want('subjects') && `รายวิชาที่สอน: ${rows(d.subjects)}`,
    want('activities') && `กิจกรรมพัฒนาผู้เรียน: ${rows(d.activities)}`,
    want('level') && c.level && `ระดับชั้นที่สอน: ${c.level}`,
    want('problems') && c.problems && `ปัญหาหลักที่ครูพบจริง: ${c.problems}`,
    want('wish') && c.wish && `สิ่งที่ครูอยากพัฒนาตนเอง/วิธีที่ทำได้จริง: ${c.wish}`,
    want('prev') && c.prev && `ผลปีก่อน: ${c.prev}`,
    want('focus') && c.focus && `จุดเน้นของโรงเรียน: ${c.focus}`,
  ];
  return lines.filter(Boolean).join('\n');
}

// แนวทางของช่อง ส่งครั้งเดียวต่อคำขอ เฉพาะชนิดช่องที่มีในคำขอ
function idpAiGuide(sys, fields) {
  const used = new Set(fields.map(f => f.field));
  const hints = sys.config.ai.prompts.fields.filter(([f]) => used.has(f)).map(([f, fl, h]) => `- .${f} (${fl}): ${h}`);
  if (!hints.length) return '';
  return `\n\nแนวทางช่อง (ใช้กับทุกสมรรถนะ ตามส่วนท้ายของคีย์):\n${hints.join('\n')}\n- เป้าหมายและประโยชน์ของสมรรถนะหนึ่งต้องสอดคล้องกับวิธีการของสมรรถนะนั้น`;
}

// หัวกลุ่มของแต่ละสมรรถนะ (พิมพ์ครั้งเดียวต่อสมรรถนะ) — ให้ AI เห็นสมรรถนะย่อย + วิธีการ/ระยะเวลาที่ครูตั้งไว้แล้ว (ถ้ามี)
function idpAiHeading(spec) {
  const subs = (spec.subs || []).map(([no, nm]) => `${no} ${nm}`).join('; ');
  let h = `สมรรถนะ: ${spec.item}${subs ? ` (สมรรถนะย่อย: ${subs})` : ''}`;
  const m = document.getElementById(`idp-${spec.cid}-method`);
  const mv = idpAiNorm(m?.value);
  if (mv && !idpAiIsStd({ el: m.id, field: 'method', std: spec.std })) h += `\n  วิธีการที่ครูตั้งไว้: ${mv.slice(0, 400)}`;
  const dv = f => document.querySelector(`[data-comp-id="${spec.cid}"][data-comp-field="${f}"]`)?.value.trim();
  const s = dv('startDate'), e = dv('endDate');
  if (s || e) h += `\n  ระยะเวลา: ${s || '…'} – ${e || '…'}`;
  return h;
}

// ------------------------------------------------------------------
// ปุ่ม: ฝังที่ไหน · กดแล้วทำอะไร
// ------------------------------------------------------------------
function idpAiSlots(sys, form) {
  const out = [];
  // แถวปุ่มอยู่ใต้ชื่อสมรรถนะ (คอลัมน์แรกของแต่ละแถว) — ปุ่มใช้กับทั้ง 3 ช่องของแถวนั้น
  form.querySelectorAll('#idp-comps-body tr').forEach(tr => {
    const cid = tr.querySelector('[data-comp-id]')?.dataset.compId;
    const host = tr.querySelector('td');
    if (!cid || !host) return;
    out.push({ host, buttons: [
      { act: 'c-write', label: 'เขียนช่องที่ว่าง / ปรับวิธีมาตรฐานให้ตรงงานของฉัน', icon: 'write', data: { cid } },
      { act: 'c-polish', label: 'ปรับสำนวนทั้งแถว', icon: 'polish', quiet: true, data: { cid } },
    ] });
  });
  return out;
}

// act: 'all' = ปุ่มบนสุด · 'c-<โหมด>' = ปุ่มใต้ชื่อสมรรถนะแต่ละแถว
// ปุ่มบนสุด: เฉพาะช่องที่ "ว่างจริง" (ไม่รวมวิธีมาตรฐาน) ไม่เกิน 33 ช่อง/คำขอ · ปุ่มของแต่ละแถวรวมวิธีมาตรฐานที่ยังไม่ได้ปรับด้วย
function idpAiResolve(sys, a, b) {
  if (a === 'all') {
    const pick = idpAiSpecs(sys).filter(s => !badworkAiFilled(s));
    if (!pick.length) return { toast: 'ทุกช่องในส่วนที่ 2 มีข้อความแล้ว — ใช้ปุ่มของแต่ละสมรรถนะเพื่อปรับวิธีมาตรฐานให้ตรงงานของคุณ หรือปรับสำนวนได้' };
    return { specs: pick, mode: 'write' };
  }
  if (a.startsWith('c-')) {
    const mode = a.slice(2), specs = idpAiSpecs(sys, [b.dataset.cid]);
    if (!specs.length) return null;
    const pick = mode === 'write'
      ? specs.filter(s => !badworkAiFilled(s) || idpAiIsStd(s))
      : specs.filter(s => badworkAiFilled(s) && !idpAiIsStd(s)); // ไม่ปรับสำนวนข้อความมาตรฐานของ สพฐ.
    if (!pick.length) return { toast: mode === 'write' ? 'ช่องของสมรรถนะนี้มีข้อความที่คุณเขียนเองครบแล้ว — ใช้ “ปรับสำนวนทั้งแถว” ได้' : 'สมรรถนะนี้ยังไม่มีข้อความที่คุณเขียนให้ปรับสำนวน' };
    return { specs: pick, mode, total: specs.length };
  }
  return null; // act อื่น (เช่น ตัวฟอร์มเองที่มี data-doc-ai เป็นตัวกันติดซ้ำ) — ไม่ทำอะไร
}

// ------------------------------------------------------------------
// ลงทะเบียนตัวต่อ (รูปแบบเดียวกับ registerDocUi ท้าย js/idp.js)
// ------------------------------------------------------------------
registerDocAi('idp', {
  systemPrompt: sys => sys.config.ai.prompts.system,
  task: (sys, mode, current) => sys.config.ai.prompts.modes[mode](current),
  context: idpAiContext,
  scope: idpAiScope,
  guide: idpAiGuide,
  itemHeading: idpAiHeading,

  copy: {
    consent: 'ข้อความในแผน ID-Plan นี้ (รายวิชา ชั่วโมงสอน ข้อความที่กรอกไว้ในส่วนที่ 2 และ "บริบทงานของฉัน" เช่น ระดับชั้น ปัญหาหลัก สิ่งที่อยากพัฒนา ผลปีก่อน จุดเน้น ไม่รวมชื่อ-นามสกุล) จะถูกส่งไปประมวลผลที่ Google Gemini เฉพาะส่วนที่เกี่ยวกับช่องที่กด\n\n'
      + 'โปรดอย่าพิมพ์ชื่อหรือข้อมูลที่ระบุตัวนักเรียนลงในช่อง (ใช้เป็นตัวเลขรวมเท่านั้น) และตรวจทานข้อความที่ AI เสนอทุกครั้งก่อนใช้\n\nต้องการดำเนินการต่อหรือไม่?',
    saveLabel: 'บันทึก',
    topPoints: [
      'อ่านจากข้อมูลที่มีในแผนนี้ เช่น รายวิชา ชั่วโมงสอน สมรรถนะย่อย และบริบทงานด้านล่าง',
      'เสนอให้ตรวจก่อนใช้เสมอ ไม่เขียนทับช่องที่กรอกแล้ว และไม่บันทึกให้เอง',
      'ปุ่มนี้ร่างช่องที่ว่างของส่วนที่ 2 · ปุ่มใต้ชื่อสมรรถนะแต่ละแถวช่วยปรับวิธีมาตรฐานให้ตรงงานของคุณ',
    ],
    topWarn: 'อย่าพิมพ์ชื่อหรือข้อมูลที่ระบุตัวนักเรียนลงในช่อง',
    topButton: 'ร่างช่องที่ว่างของทุกสมรรถนะ',
    reviewNote: '“…” คือตัวเลขที่ครูต้องกรอกเอง',
    placeholder: { mark: '…', toast: ' · มี “…” ที่ต้องกรอกตัวเลข' }, // พร้อต์ให้ AI ใช้ “…” แทนตัวเลขที่ไม่รู้
    ctxTitle: 'บริบทงานของฉัน',
    ctxNote: 'ยิ่งระบุตามจริง AI ยิ่งเขียนตรงงาน และไม่ต้องกด “สร้างใหม่” หลายรอบ · ว่างไว้ได้ AI จะเขียนกว้าง ๆ และใช้ “…” แทนตัวเลข · ส่งให้ AI เฉพาะส่วนที่เกี่ยวกับช่องที่กด',
    reviewGroup: spec => ({ id: spec.cid, title: spec.item }),
  },

  ctxBody: (sys, c, h) => [
    h.one('level', 'เช่น ม.2'),
    h.many('problems', 'เช่น นักเรียนมีส่วนร่วมในกิจกรรมน้อย · ใช้สื่อดิจิทัลยังไม่คล่อง'),
    h.many('wish', 'เช่น อยากใช้ AI ช่วยออกแบบแผนการสอน · เข้าร่วม PLC ของกลุ่มสาระ · อบรมออนไลน์'),
    h.one('prev', 'เช่น ผ่านเกณฑ์ ร้อยละ 62 · เกรดเฉลี่ย 2.41'),
    h.one('focus', 'เช่น ส่งเสริมการอ่านออกเขียนได้'),
  ].join('\n    '),
  ctxStorageKey: sys => sys.config.ai.storageKeys.ctx,

  docRef: (sys, uid, id) => sys.col('plans', uid).doc(id),
  slots: idpAiSlots,
  resolve: idpAiResolve,
});
