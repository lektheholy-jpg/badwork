// ==========================================================================
// ผู้ช่วย AI (Gemini) สำหรับหน้าสร้างPersonal Agreement — ร่าง/เติม/ปรับสำนวนได้ทุกช่อง
//   เรียก Gemini ผ่าน Firebase AI Logic (ไม่มี API key ในโค้ด · ป้องกันด้วย App Check + reCAPTCHA v3)
//   - ปุ่มใต้ช่องส่วนที่ 2 (ประเด็นท้าทาย) : ช่วยเขียน/เติม · ปรับสำนวน · ทำให้กระชับ
//   - ปุ่มใต้งานมาตรฐานตำแหน่งแต่ละข้อ (1.1–3.3) : ช่วยเขียนช่องที่ว่าง · ปรับสำนวนทั้งข้อ
//   - ปุ่มบนสุดของฟอร์ม : ร่างช่องส่วนที่ 2 ที่ยังว่างในครั้งเดียว (1 คำขอ) โดยอ่านจากข้อมูลที่มีอยู่ในเอกสาร
//   ข้อความจาก AI แสดงในหน้าต่าง (.modal) ให้ตรวจ/แก้ก่อน "ใช้" เสมอ · สไตล์อยู่ที่ css/style.css (ส่วน .pa-ai-*) · ไม่บันทึกอัตโนมัติ · ตัวเลขที่ไม่มีข้อมูลให้เป็น "…"
//   การ์ดบนสุดมี "บริบทงานของฉัน" (ระดับชั้น/ห้อง/นักเรียน/ปัญหา/ผลปีก่อน/จุดเน้น) เก็บใน doc.aiCtx · ส่งเข้าพร้อต์เฉพาะส่วนที่เกี่ยวกับช่องนั้น (PA_CONFIG.ai.prompts.scope)
//   โหลดแบบ lazy: SDK ของ Firebase AI จะถูกดึงเมื่อกดปุ่ม AI ครั้งแรกเท่านั้น
//   ต้องโหลดหลัง pa.js · pa.js เรียก paAiMount(view, form) ท้าย renderPAFormView
// ==========================================================================

// รวมบริบทที่ชุดช่องนี้ต้องใช้ (ช่องงาน key = "1.1.s1" → ข้อ "1.1" · ช่องส่วนที่ 2 = "part2")
function paAiScope(fields) {
  const sys = docSystem();
  const set = new Set();
  fields.forEach(f => {
    const id = f.group ? f.key.slice(0, f.key.lastIndexOf('.')) : 'part2';
    (sys.config.ai.prompts.scope[id] || sys.config.ai.prompts.scope.part2).forEach(k => set.add(k));
  });
  return set;
}

// ช่องงานตามมาตรฐานตำแหน่ง 15 ข้อ × 4 ช่อง (ids = ระบุเฉพาะบางข้อ หรือ null = ทั้งหมด)
function paAiWorkSpecs(ids) {
  const sys = docSystem();
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

// ------------------------------------------------------------------
// เรียก Gemini (โหลด SDK ตอนใช้ครั้งแรก)
// ------------------------------------------------------------------
let paAiModelP = null;

// รุ่นที่เลือกอยู่ (ไม่ตรงรายการ/อ่านไม่ได้ → ใช้ค่าเริ่มต้น PA_CONFIG.ai.model) · อ่านตอนเรียกทุกครั้ง เปลี่ยนรุ่นแล้วมีผลทันทีโดยไม่ต้องโหลด SDK ใหม่
function paAiModelId() {
  const sys = docSystem();
  let v = null;
  try { v = localStorage.getItem(sys.config.ai.storageKeys.model); } catch (err) { /* ใช้ storage ไม่ได้ — ใช้ค่าเริ่มต้น */ }
  return sys.config.ai.models.some(m => m.id === v) ? v : sys.config.ai.model;
}
// Gemini 3 ใช้ thinkingLevel · Gemini 2.5 ใช้ thinkingBudget (ส่ง thinkingLevel ให้ 2.5 จะถูกปฏิเสธ)
function paAiThinking(aiMod, id) {
  return /^gemini-3/.test(id) ? { thinkingLevel: aiMod.ThinkingLevel.LOW } : { thinkingBudget: 512 };
}
function paAiLoadModel() {
  const sys = docSystem();
  if (!paAiModelP) {
    paAiModelP = (async () => {
      const [appMod, checkMod, aiMod] = await Promise.all([
        import(`${sys.config.ai.sdk}/firebase-app.js`),
        import(`${sys.config.ai.sdk}/firebase-app-check.js`),
        import(`${sys.config.ai.sdk}/firebase-ai.js`),
      ]);
      const app = appMod.initializeApp(firebase.app().options, 'pa-ai'); // แอปแยกจาก compat — ใช้ config เดียวกัน
      // ทดสอบบนเครื่อง: ให้ App Check พิมพ์ debug token ใน Console ของเบราว์เซอร์ แล้วนำไปลงทะเบียนใน Firebase Console
      if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
      checkMod.initializeAppCheck(app, { provider: new checkMod.ReCaptchaEnterpriseProvider(sys.config.ai.siteKey), isTokenAutoRefreshEnabled: true });
      const ai = aiMod.getAI(app, { backend: new aiMod.GoogleAIBackend() });
      return () => {
        const id = paAiModelId();
        return aiMod.getGenerativeModel(ai, {
          model: id,
          systemInstruction: sys.config.ai.prompts.system,
          generationConfig: { responseMimeType: 'application/json', temperature: 0.6, thinkingConfig: paAiThinking(aiMod, id) },
        }, { timeout: sys.config.ai.timeout });
      };
    })().catch(err => { paAiModelP = null; throw err; });
  }
  return paAiModelP;
}

function paAiParseJson(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const o = JSON.parse(t);
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('รูปแบบคำตอบไม่ถูกต้อง');
  return o;
}

async function paAiGenerate(prompt) {
  const sys = docSystem();
  const makeModel = await paAiLoadModel();
  let timer;
  const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), sys.config.ai.timeout + 5000); });
  try {
    const res = await Promise.race([makeModel().generateContent(prompt), timeout]);
    return paAiParseJson(res.response.text());
  } finally { clearTimeout(timer); }
}

function paAiError(err) {
  console.error('PA AI:', err);
  const m = String((err && (err.message || err.code)) || err);
  const code = (m.match(/\[(\d{3})\b/) || m.match(/\b(4\d\d|5\d\d)\b/) || [])[1]; // รหัส HTTP ถ้ามี
  const tag = code ? ` (รหัส ${code})` : '';
  let msg;
  if (!navigator.onLine || /Failed to fetch|dynamically imported module|NetworkError/i.test(m)) msg = 'ใช้ AI ไม่ได้ — ไม่มีอินเทอร์เน็ตหรือโหลดชุดคำสั่งไม่สำเร็จ';
  else if (/app-?check|recaptcha/i.test(m)) msg = 'AI ไม่ผ่านการตรวจ App Check/reCAPTCHA — ตรวจ Site key โดเมน และ debug token (ดูรายละเอียดใน Console)';
  else if (code === '404' || /not found|is not supported|no longer available/i.test(m)) msg = `ไม่พบโมเดล ${paAiModelId()}${tag} — ลองเลือกรุ่นอื่นในการ์ดผู้ช่วย AI หรือตรวจชื่อรุ่นใน js/pa-config.js (PA_CONFIG.ai.models)`;
  else if (code === '403' || /PERMISSION_DENIED|API has not been used|API_KEY_SERVICE_BLOCKED|not enabled/i.test(m)) msg = `AI ถูกปฏิเสธสิทธิ์${tag} — ตรวจว่าเปิด AI Logic แล้ว และ API key ของโปรเจกต์อนุญาต Firebase AI Logic API`;
  else if (code === '429' || /RESOURCE_EXHAUSTED|quota exceeded|too many requests|rate limit/i.test(m)) msg = `โควตา AI เต็มหรือเรียกถี่เกิน${tag} — รอ 1 นาทีแล้วลองใหม่ (ดูโควตาใน Firebase Console > AI Logic)`;
  else if (/timeout/i.test(m)) msg = 'AI ตอบช้าเกินไป ลองใหม่อีกครั้ง';
  else if (/JSON|รูปแบบคำตอบ/i.test(m)) msg = 'AI ตอบในรูปแบบที่อ่านไม่ได้ ลองใหม่อีกครั้ง';
  else msg = `เรียก AI ไม่สำเร็จ${tag}: ` + m.slice(0, 120);
  showToast(msg);
}

// ------------------------------------------------------------------
// สร้างคำสั่ง
// ------------------------------------------------------------------
// บรรทัดบริบทเรียงลำดับคงที่เสมอ (ส่วนที่ซ้ำกันอยู่ต้นข้อความ → ช่วย implicit caching) · scope = Set ของส่วนที่ต้องส่ง (null = ทุกส่วน)
function paAiContext(known = {}, scope = null) {
  const sys = docSystem();
  paCollectFormData(); // ดึงค่าที่พิมพ์ค้างในฟอร์มเข้า sys.state.doc
  const d = sys.state.doc, L = d.load || {}, c = d.aiCtx || {};
  let p = {};
  try { p = AppState.teacherProfile || {}; } catch (err) { /* ไม่มีโปรไฟล์ — ข้าม */ }
  const rows = a => (a || []).map(r => `${r.name}${r.hours ? ` (${paFmtH(r.hours)} ชม./สัปดาห์)` : ''}`).join('; ') || '-';
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

// ขอข้อความสำหรับกลุ่มช่องหนึ่งชุด → [{...spec, el, current, proposed}]
async function paAiBatch(specs, mode, known) {
  const sys = docSystem();
  const fields = specs.map(s => {
    const el = document.getElementById(s.el);
    return { ...s, el, current: (el?.value || '').trim() };
  }).filter(f => f.el);
  if (!fields.length) return [];
  // ลำดับพร้อต์: ส่วนที่ซ้ำกันทุกคำขอ (ข้อมูลประกอบ → แนวทางช่องงาน) ก่อน · ส่วนที่เปลี่ยนตามคำขอ (โหมด/รายชื่อช่อง) ท้ายสุด
  // งานหลักบอกครั้งเดียว · ช่องที่มี "ข้อความเดิม" บอกซ้ำเฉพาะเมื่อคำสั่งต่างจากค่าตั้งต้น (เช่น โหมดต่อเติม)
  const base = sys.config.ai.prompts.modes[mode]('');
  const lines = [];
  let lastItem = '';
  fields.forEach(f => {
    if (f.group) { // ช่องงาน: ชื่อข้อใส่ครั้งเดียวต่อข้อ · แนวทางอยู่ในบล็อกกลาง
      if (f.item !== lastItem) { lines.push(`ข้อ ${f.item}`); lastItem = f.item; }
      lines.push(`- "${f.key}" ${f.fieldLabel}`);
    } else {
      lastItem = '';
      lines.push(`- "${f.key}" ชื่อช่อง: ${f.label}\n  แนวทาง: ${f.hint}`);
    }
    if (f.current) {
      const t = sys.config.ai.prompts.modes[mode](f.current);
      lines.push((t !== base ? `  งาน: ${t}\n` : '') + `  ข้อความเดิม: """${f.current.slice(0, 2000)}"""`);
    }
  });
  const guide = fields.some(f => f.group)
    ? `\n\nแนวทางช่องงาน (ใช้กับทุกข้อ ตามส่วนท้ายของคีย์):\n${Object.entries(sys.config.ai.prompts.workHints).map(([k, v]) => `- .${k}: ${v}`).join('\n')}`
    : '';
  const prompt = `ข้อมูลประกอบ:\n${paAiContext(known, paAiScope(fields))}${guide}\n\nงาน (ทุกช่อง): ${base}\n\nช่องที่ต้องการ:\n${lines.join('\n')}\n\nตอบเป็น JSON object ที่มีคีย์เหล่านี้เท่านั้น: ${JSON.stringify(fields.map(f => f.key))}`;
  const out = await paAiGenerate(prompt);
  return fields.map(f => ({ ...f, proposed: String(out[f.key] ?? '').trim() })).filter(f => f.proposed);
}

// ------------------------------------------------------------------
// ความยินยอม + ตัวกันกดซ้ำ
// ------------------------------------------------------------------
function paAiConsent() {
  const sys = docSystem();
  try { if (localStorage.getItem(sys.config.ai.storageKeys.consent) === '1') return true; } catch (err) { /* ใช้ storage ไม่ได้ — ถามทุกครั้ง */ }
  const ok = confirm('ข้อความในฟอร์ม PA นี้ (รายวิชา ชั่วโมงสอน ข้อความที่กรอกไว้ และ "บริบทงานของฉัน" เช่น ระดับชั้น จำนวนห้อง/นักเรียนรวม ปัญหาหลัก ผลปีก่อน จุดเน้น ไม่รวมชื่อ-นามสกุล) จะถูกส่งไปประมวลผลที่ Google Gemini เฉพาะส่วนที่เกี่ยวกับช่องที่กด\n\n'
    + 'โปรดอย่าพิมพ์ชื่อหรือข้อมูลที่ระบุตัวนักเรียนลงในช่อง (ใช้เป็นตัวเลขรวมเท่านั้น) และตรวจทานข้อความที่ AI เสนอทุกครั้งก่อนใช้\n\nต้องการดำเนินการต่อหรือไม่?');
  if (ok) { try { localStorage.setItem(sys.config.ai.storageKeys.consent, '1'); } catch (err) { /* ข้าม */ } }
  return ok;
}

let paAiBusy = false;
async function paAiGuard(btn, fn) {
  if (paAiBusy) { showToast('AI กำลังทำงานอยู่ รอสักครู่'); return undefined; }
  if (!paAiConsent()) return undefined;
  paAiBusy = true;
  // ปิดปุ่ม AI ทุกปุ่มระหว่างรอ ให้เห็นชัดว่ากำลังทำงานอยู่ (ไม่ต้องรอให้กดซ้ำแล้วเจอ toast)
  const all = [...(btn.closest('form') || document).querySelectorAll('[data-pa-ai]')];
  const old = btn.innerHTML;
  all.forEach(b => { b.disabled = true; });
  btn.innerHTML = 'กำลังคิด<span class="loader-dots" aria-hidden="true"><i></i><i></i><i></i></span>';
  try { return await fn(t => { btn.textContent = t; }); }
  catch (err) { paAiError(err); return undefined; }
  finally { paAiBusy = false; all.forEach(b => { b.disabled = false; }); btn.innerHTML = old; }
}

// ------------------------------------------------------------------
// หน้าต่างตรวจทานข้อความที่ AI เสนอ (ใช้ .modal มาตรฐานของแอป)
// ------------------------------------------------------------------
function paAiReview(items, warn) {
  const prev = document.activeElement;
  let lastGrp = '';
  const body = items.map((it, i) => {
    let head = '';
    const grp = it.group ? it.item : 'part2'; // หัวกลุ่ม: แต่ละข้อของส่วนที่ 1 · ช่องส่วนที่ 2 รวมเป็นกลุ่มเดียว
    if (grp !== lastGrp) { head = `<div class="pa-ai-grp">${it.group ? 'ข้อ ' + escapeHtml(it.item) : 'ส่วนที่ 2 ประเด็นท้าทาย'}</div>`; lastGrp = grp; }
    const name = it.group ? it.fieldLabel : it.label;
    return `${head}<div class="pa-ai-item">
      <label class="pa-check"><input type="checkbox" data-i="${i}" checked> ${escapeHtml(name)}</label>
      ${it.current ? `<details class="pa-ai-old"><summary>ข้อความเดิม (จะถูกแทนที่ถ้าเลือกช่องนี้)</summary><div class="pa-ai-old-text">${escapeHtml(it.current)}</div></details>` : ''}
      <div class="field"><textarea data-t="${i}" rows="4" aria-label="${escapeHtml(name)}">${escapeHtml(it.proposed)}</textarea></div>
    </div>`;
  }).join('');

  openModal(`<h2>ข้อความที่ AI เสนอ</h2>
    <div class="modal-sub">${items.length} ช่อง · แก้ไขในกล่องได้ก่อนกด “ใช้ที่เลือก” · ข้อความจะยังไม่ถูกบันทึกจนกว่าจะกด “บันทึกPersonal Agreement”</div>
    ${warn ? `<div class="pa-ai-warn">${escapeHtml(warn)}</div>` : ''}
    <div class="pa-ai-bar">
      <span class="u-note-sm">“…” คือตัวเลขที่ครูต้องกรอกเอง · AI อาจผิดพลาด โปรดตรวจทาน</span>
      <div class="u-flex u-gap-8">
        <button type="button" class="btn btn-ghost btn-sm" data-x="all">เลือกทั้งหมด</button>
        <button type="button" class="btn btn-ghost btn-sm" data-x="none">ไม่เลือก</button>
      </div>
    </div>
    <div class="pa-ai-list">${body}</div>
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" data-x="close">ยกเลิก</button>
      <button type="button" class="btn btn-primary" data-x="apply">ใช้ที่เลือก</button>
    </div>`);

  const modal = document.querySelector('#modal-root .modal');
  modal.classList.add('modal-wide', 'pa-ai-modal');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'ข้อความที่ AI เสนอ');

  const checks = [...modal.querySelectorAll('input[data-i]')];
  const areas = [...modal.querySelectorAll('textarea[data-t]')];
  const applyBtn = modal.querySelector('[data-x="apply"]');
  const upd = () => {
    const n = checks.filter(c => c.checked).length;
    applyBtn.textContent = `ใช้ที่เลือก (${n})`;
    applyBtn.disabled = !n;
  };
  const restoreFocus = () => { if (prev && prev.isConnected) prev.focus(); };
  const close = () => { closeModal(); restoreFocus(); };
  const onKey = e => {
    if (!modal.isConnected) { document.removeEventListener('keydown', onKey); return; } // ปิดด้วยทางอื่นแล้ว
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);
  document.getElementById('modal-backdrop').addEventListener('click', e => { if (e.target.id === 'modal-backdrop') restoreFocus(); });
  upd();

  modal.addEventListener('change', e => { if (e.target.matches('input[data-i]')) upd(); });
  modal.addEventListener('click', e => {
    const a = e.target.closest('[data-x]')?.dataset.x;
    if (!a) return;
    if (a === 'close') close();
    else if (a === 'all' || a === 'none') { checks.forEach(c => { c.checked = a === 'all'; }); upd(); }
    else if (a === 'apply') {
      let n = 0, dots = false, lost = 0;
      checks.forEach((c, i) => {
        if (!c.checked) return;
        const it = items[i], v = areas[i].value.trim();
        if (!it.el.isConnected) { lost++; return; } // ฟอร์มถูกวาดใหม่ระหว่างรอ
        it.el.value = v;
        it.el.dispatchEvent(new Event('input', { bubbles: true }));
        it.el.closest('details')?.setAttribute('open', '');
        if (v.includes('…')) dots = true;
        n++;
      });
      close();
      showToast(lost ? `ใส่ได้ ${n} ช่อง (${lost} ช่องหายไปเพราะฟอร์มถูกโหลดใหม่ — ลองกดใหม่)`
        : `ใส่ข้อความ ${n} ช่องแล้ว${dots ? ' · มี “…” ที่ต้องกรอกตัวเลข' : ''} · ตรวจแล้วกด “บันทึกPersonal Agreement”`);
    }
  });
  areas[0]?.focus();
}

// ------------------------------------------------------------------
// การทำงานของปุ่ม
// ------------------------------------------------------------------
async function paAiRunFields(btn, specs, mode) {
  const items = await paAiGuard(btn, () => paAiBatch(specs, mode, {}));
  if (!items) return; // error แสดงไปแล้ว
  if (!items.length) { showToast('AI ไม่ได้ส่งข้อความกลับมา ลองอีกครั้ง'); return; }
  paAiReview(items);
}

// ปุ่มบนสุด: ร่างเฉพาะช่องส่วนที่ 2 ที่ยังว่าง (5 ช่อง = 1 คำขอ)
// ช่องงาน 1.1–3.3 ใช้ปุ่มใต้แต่ละข้อ (ข้อละ 4 ช่อง) ไม่ยิงทั้ง 60 ช่องในครั้งเดียวอีกต่อไป
async function paAiDraftAll(btn) {
  const sys = docSystem();
  const empty = s => !((document.getElementById(s.el)?.value || '').trim());
  const pick = sys.config.ai.prompts.part2.filter(empty);
  if (!pick.length) { showToast('ช่องส่วนที่ 2 มีข้อความครบแล้ว — ใช้ปุ่มปรับสำนวนใต้แต่ละช่อง หรือปุ่มของแต่ละข้อในส่วนงานตามมาตรฐานตำแหน่งได้'); return; }
  await paAiRunFields(btn, pick, 'write');
}

// ------------------------------------------------------------------
// ติดปุ่มเข้ากับฟอร์ม (เรียกจาก renderPAFormView)
// ------------------------------------------------------------------
const PA_AI_ICON = `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z"/></svg>`;

// ------------------------------------------------------------------
// บันทึกบริบทอัตโนมัติ: มีเอกสารแล้ว → เขียนเฉพาะ aiCtx ลง Firestore ทันที (ไม่แตะช่องอื่นที่ยังพิมพ์ค้าง)
//   ยังเป็นเอกสารใหม่ → สำรองในเครื่อง แล้วเก็บเข้าเอกสารเมื่อกดบันทึก · เอกสารใหม่ถัดไปจะหยิบบริบทล่าสุดมาให้แก้ต่อ
// ------------------------------------------------------------------
function paAiCtxValues() {
  const sys = docSystem();
  const v = {};
  Object.keys(sys.config.aiCtx.fields).forEach(k => { v[k] = (document.getElementById('pa-ctx-' + k)?.value || '').trim().slice(0, sys.config.aiCtx.maxLen[k]); });
  return v;
}

function paAiCtxLoadLocal() {
  const sys = docSystem();
  try {
    const o = JSON.parse(localStorage.getItem(sys.config.ai.storageKeys.ctx) || 'null');
    return o && typeof o === 'object' ? o : null;
  } catch (err) { return null; }
}

// เอกสารใหม่ที่ยังไม่มีบริบท → หยิบจากเอกสารล่าสุดที่มี (รายการเรียงใหม่→เก่า) หรือที่สำรองในเครื่อง · ทำครั้งเดียวต่อเอกสาร
function paAiSeedCtx(d) {
  const sys = docSystem();
  if (sys.state.docId || d._ctxSeeded || paAiCtxCount(d.aiCtx || {})) return;
  d._ctxSeeded = true; // ขึ้นต้น _ → paSave ตัดทิ้ง
  const last = (sys.state.list || []).find(x => x.aiCtx && paAiCtxCount(x.aiCtx));
  const src = last ? last.aiCtx : paAiCtxLoadLocal();
  if (!src) return;
  d.aiCtx = {};
  Object.entries(sys.config.aiCtx.maxLen).forEach(([k, n]) => { d.aiCtx[k] = String(src[k] || '').slice(0, n); });
}

let paAiCtxTimer = null;
async function paAiCtxSave(statusEl) {
  const sys = docSystem();
  clearTimeout(paAiCtxTimer);
  paAiCtxTimer = null;
  const v = paAiCtxValues();
  sys.state.doc.aiCtx = v;
  try { localStorage.setItem(sys.config.ai.storageKeys.ctx, JSON.stringify(v)); } catch (err) { /* ใช้ storage ไม่ได้ — ข้าม */ }
  const uid = AppState.user?.uid, id = sys.state.docId;
  if (!id || !uid) { if (statusEl) statusEl.textContent = 'จะเก็บกับเอกสารเมื่อกดบันทึก'; return; }
  try {
    await paRef(uid, id).update({ aiCtx: v });
    if (statusEl?.isConnected) statusEl.textContent = 'บันทึกอัตโนมัติแล้ว';
  } catch (err) {
    console.error('PA AI ctx save:', err);
    if (statusEl?.isConnected) statusEl.textContent = 'บันทึกอัตโนมัติไม่สำเร็จ — กด “บันทึกPersonal Agreement” เพื่อเก็บ';
  }
}

// การ์ดพับได้ "บริบทงานของฉัน" — เปิดไว้เมื่อยังว่าง · พับเมื่อกรอกแล้ว
function paAiCtxCount(c) { const sys = docSystem(); return Object.keys(sys.config.aiCtx.fields).filter(k => String(c[k] || '').trim()).length; }

function paAiCtxHtml(c) {
  const sys = docSystem();
  const n = paAiCtxCount(c), total = Object.keys(sys.config.aiCtx.fields).length;
  const L = sys.config.aiCtx.fields, mx = sys.config.aiCtx.maxLen;
  const one = (k, ph) => `<div class="field"><label for="pa-ctx-${k}">${L[k]}</label><input id="pa-ctx-${k}" type="text" maxlength="${mx[k]}"${k === 'rooms' || k === 'students' ? ' inputmode="numeric"' : ''} value="${escapeHtml(c[k] || '')}" placeholder="${ph}"></div>`;
  const many = (k, ph) => `<div class="field"><label for="pa-ctx-${k}">${L[k]}</label><textarea id="pa-ctx-${k}" rows="2" maxlength="${mx[k]}" placeholder="${ph}">${escapeHtml(c[k] || '')}</textarea></div>`;
  return `<details class="pa-ai-ctx"${n ? '' : ' open'}>
    <summary><b>บริบทงานของฉัน</b> <span class="u-note-sm" data-ctx-count>กรอกแล้ว ${n}/${total}</span> <span class="u-note-sm" data-ctx-save role="status"></span></summary>
    <div class="u-note pa-ai-ctx-note">ยิ่งระบุตามจริง AI ยิ่งเขียนตรงงาน และไม่ต้องกด “สร้างใหม่” หลายรอบ · ว่างไว้ได้ AI จะเขียนกว้าง ๆ และใช้ “…” แทนตัวเลข · ส่งให้ AI เฉพาะส่วนที่เกี่ยวกับช่องที่กด</div>
    <div class="pa-ai-ctx-grid">${one('level', 'เช่น ม.2')}${one('rooms', 'เช่น 4')}${one('students', 'เช่น 148')}</div>
    ${many('problems', 'เช่น นักเรียนอ่านโจทย์ปัญหาไม่คล่อง · ส่งงานไม่ครบ')}
    ${many('prev', 'เช่น ผ่านเกณฑ์ ร้อยละ 62 · เกรดเฉลี่ย 2.41')}
    ${one('focus', 'เช่น ส่งเสริมการอ่านออกเขียนได้')}
  </details>`;
}

function paAiMount(view, form) {
  const sys = docSystem();
  if (!form || form.dataset.paAi) return;
  form.dataset.paAi = '1';
  paAiSeedCtx(sys.state.doc);

  // 1) การ์ดบนสุด: อธิบายสั้นๆ + ร่างส่วนที่ 2
  const top = document.createElement('div');
  top.className = 'card card-pad pa-ai-top';
  top.innerHTML = `<div class="pa-ai-head">
      <span class="course-chip pa-ai-chip">${PA_AI_ICON}</span>
      <div>
        <h2 class="card-title">ผู้ช่วย AI</h2>
        <div class="u-note">ช่วยร่าง ปรับสำนวน และย่อข้อความ โดยใช้ Gemini</div>
      </div>
    </div>
    <ul class="pa-ai-points u-note">
      <li>อ่านจากข้อมูลที่มีในเอกสารนี้ เช่น รายวิชา ชั่วโมงสอน ข้อความที่กรอกไว้ และบริบทงานด้านล่าง</li>
      <li>เสนอให้ตรวจก่อนใช้เสมอ ไม่เขียนทับช่องที่กรอกแล้ว และไม่บันทึกให้เอง</li>
      <li>ปุ่มนี้ร่างส่วนที่ 2 ที่ว่าง · งานข้อ 1.1–3.3 กดปุ่มใต้แต่ละข้อ</li>
    </ul>
    ${paAiCtxHtml(sys.state.doc.aiCtx || {})}
    <div class="field pa-ai-model">
      <label for="pa-ai-model">โมเดล AI</label>
      <select id="pa-ai-model">${sys.config.ai.models.map(m => `<option value="${m.id}"${m.id === paAiModelId() ? ' selected' : ''}>${m.label}</option>`).join('')}</select>
      <div class="field-hint" data-model-hint>${escapeHtml((sys.config.ai.models.find(m => m.id === paAiModelId()) || {}).hint || '')}</div>
    </div>
    <div class="pa-ai-warn">อย่าพิมพ์ชื่อหรือข้อมูลที่ระบุตัวนักเรียนลงในช่อง</div>
    <button type="button" class="btn btn-primary" data-pa-ai="all">${PA_AI_ICON} ร่างส่วนที่ 2 ที่ว่าง</button>`;
  form.insertBefore(top, form.firstChild);
  top.querySelector('#pa-ai-model').addEventListener('change', e => {
    const m = sys.config.ai.models.find(x => x.id === e.target.value);
    if (!m) return;
    try { localStorage.setItem(sys.config.ai.storageKeys.model, m.id); } catch (err) { /* ใช้ storage ไม่ได้ — มีผลเฉพาะครั้งนี้ */ }
    top.querySelector('[data-model-hint]').textContent = m.hint;
    showToast('ใช้ ' + m.label + ' แล้ว');
  });
  // นับช่องบริบทที่กรอกแล้วแบบสด
  const ctxBox = top.querySelector('.pa-ai-ctx');
  const saveEl = ctxBox?.querySelector('[data-ctx-save]');
  ctxBox?.addEventListener('input', () => {
    const cnt = ctxBox.querySelector('[data-ctx-count]');
    if (cnt) cnt.textContent = `กรอกแล้ว ${paAiCtxCount(paAiCtxValues())}/${Object.keys(sys.config.aiCtx.fields).length}`;
    if (saveEl) saveEl.textContent = 'กำลังบันทึก…';
    clearTimeout(paAiCtxTimer);
    paAiCtxTimer = setTimeout(() => paAiCtxSave(saveEl), 700);
  });
  ctxBox?.addEventListener('focusout', () => { if (paAiCtxTimer) paAiCtxSave(saveEl); }); // ออกจากช่อง = บันทึกทันที ไม่รอ

  // 2) ใต้ช่องส่วนที่ 2
  sys.config.ai.prompts.part2.forEach(f => {
    const ta = form.querySelector('#' + f.el);
    if (!ta) return;
    ta.closest('.field').insertAdjacentHTML('beforeend', `<div class="pa-ai-row">
      <span class="pa-ai-tag">${PA_AI_ICON} ผู้ช่วย AI</span>
      <button type="button" class="btn btn-ghost btn-sm" data-pa-ai="f-write" data-key="${f.key}">เขียน/เติมให้</button>
      <button type="button" class="btn btn-sm pa-ai-quiet" data-pa-ai="f-polish" data-key="${f.key}">ปรับสำนวน</button>
      <button type="button" class="btn btn-sm pa-ai-quiet" data-pa-ai="f-shorten" data-key="${f.key}">ย่อให้กระชับ</button>
    </div>`);
  });

  // 3) ใต้งานตามมาตรฐานตำแหน่งแต่ละข้อ (ชื่อข้ออยู่ในหัวกล่องอยู่แล้ว ไม่ต้องพูดซ้ำในปุ่ม)
  form.querySelectorAll('.pa-witem').forEach(w => {
    const id = w.querySelector('[data-wi]')?.dataset.wi;
    if (!id) return;
    w.insertAdjacentHTML('beforeend', `<div class="pa-ai-row">
      <span class="pa-ai-tag">${PA_AI_ICON} ผู้ช่วย AI</span>
      <button type="button" class="btn btn-ghost btn-sm" data-pa-ai="i-write" data-item="${id}">เขียนช่องที่ว่าง</button>
      <button type="button" class="btn btn-sm pa-ai-quiet" data-pa-ai="i-polish" data-item="${id}">ปรับสำนวนทั้งข้อ</button>
    </div>`);
  });

  form.addEventListener('click', e => {
    const b = e.target.closest('[data-pa-ai]');
    if (!b) return;
    const a = b.dataset.paAi;
    const has = s => !!(document.getElementById(s.el)?.value || '').trim();
    if (a === 'all') { paAiDraftAll(b); return; }
    if (a.startsWith('f-')) {
      const mode = a.slice(2), spec = sys.config.ai.prompts.part2.find(s => s.key === b.dataset.key);
      if (!spec) return;
      if (mode !== 'write' && !has(spec)) { showToast('ช่องนี้ยังว่าง — กด “ช่วยเขียน/เติม” ก่อน'); return; }
      paAiRunFields(b, [spec], mode);
    } else if (a.startsWith('i-')) {
      const mode = a.slice(2), specs = paAiWorkSpecs([b.dataset.item]);
      const pick = mode === 'write' ? specs.filter(s => !has(s)) : specs.filter(has);
      if (!pick.length) { showToast(mode === 'write' ? 'ช่องในข้อนี้มีข้อความครบแล้ว — ใช้ “ปรับสำนวนทั้งข้อ” ได้' : 'ข้อนี้ยังไม่มีข้อความให้ปรับสำนวน'); return; }
      paAiRunFields(b, pick, mode);
    }
  });
}
