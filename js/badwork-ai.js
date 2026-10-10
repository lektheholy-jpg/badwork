// ==========================================================================
// แกนผู้ช่วย AI (Gemini) ของฟอร์มเอกสาร — ใช้ร่วมกันทุกระบบเอกสาร (PA · ID-Plan · …) · ไม่รู้จักชื่อระบบใดเลย
//   แกนทำ: เรียก Gemini (เลือกรุ่น · โหมดคิด · แปลง JSON · จัดการ error · ผ่านพร็อกซีหรือตรง) · ประกอบโครงพร้อต์ ·
//          ขอความยินยอม · ตัวกันกดซ้ำ · หน้าต่างตรวจทานก่อน "ใช้" · เก็บ/สำรอง/หยิบบริบทงาน (doc.aiCtx) · ฝังการ์ดบนสุด+ปุ่ม+ตัวฟัง
//   ข้อความจาก AI แสดงในหน้าต่าง (.modal) ให้ตรวจ/แก้ก่อน "ใช้" เสมอ · ไม่บันทึกอัตโนมัติ · ไม่โหลด SDK เพิ่ม ใช้ fetch ธรรมดา
//
// สิ่งที่แกนอ่าน
//   • BADWORK_AI_CONFIG (js/badwork-ai-config.js)  การเชื่อมต่อ · รายชื่อรุ่น · คีย์รุ่นที่เลือก · คีย์ความยินยอม — ค่าเดียวกันทุกระบบ
//   • sys = docSystem() ของระบบที่กำลังแสดง (js/doc-system.js)  sys.state.doc / docId / list และ sys.config.aiCtx = { fields, maxLen, idPrefix }
//   • ตัวต่อ (adapter) ของระบบนั้น — ลงทะเบียนด้วย registerDocAi('<id>', adapter) ที่ท้ายไฟล์ตัวต่อ (ตัวอย่าง: js/pa-ai.js)
//
// ตัวต่อ (adapter) ต้องมี — ทุกเมธอดรับ sys เป็นตัวแรก (แกนส่งตัวที่ถือไว้ตอนเริ่มงาน ไม่เรียก docSystem() ซ้ำหลัง await)
//   พร้อต์
//     systemPrompt(sys)               → string   คำสั่งระบบของ Gemini
//     task(sys, mode, current)        → string   คำสั่งงานของโหมด 'write' | 'polish' | 'shorten' (current = ข้อความเดิมของช่อง · '' = ใช้หาคำสั่งกลางของคำขอ)
//     context(sys, known, scope)      → string   บล็อก "ข้อมูลประกอบ" (scope = ผลของ scope() · null = ทุกส่วน) — ดึงค่าที่พิมพ์ค้างในฟอร์มเข้า sys.state.doc เองได้ที่นี่
//     scope(sys, fields)              → Set|null ส่วนของข้อมูลประกอบที่ช่องเหล่านี้ต้องใช้ (ส่งเฉพาะที่เกี่ยวข้อง)
//     guide(sys, fields)              → string   บล็อกแนวทางกลางที่ส่งครั้งเดียวต่อคำขอ ('' ถ้าไม่มี)
//     itemHeading(spec)               → string   บรรทัดหัวของกลุ่มช่อง (ใช้กับช่องที่มี spec.item)
//   ข้อความที่ผู้ใช้เห็น (copy)
//     consent · saveLabel · topPoints[] · topWarn · topButton · ctxTitle · ctxNote   (string)
//     reviewGroup(spec)               → { id, title }  หัวกลุ่มในหน้าต่างตรวจทาน
//   บริบทงาน
//     ctxBody(sys, c, h)              → string   HTML ช่องกรอกของการ์ดบริบท (h.one(key, placeholder, { numeric }) · h.many(key, placeholder))
//     ctxStorageKey(sys)              → string   คีย์ localStorage ที่สำรองบริบทล่าสุด — ต้องไม่ซ้ำกับระบบอื่น
//   ฟอร์ม
//     docRef(sys, uid, id)            → Firestore doc ref ของเอกสาร (ใช้เขียนเฉพาะ aiCtx)
//     slots(sys, form)                → [{ host: Element, buttons: [{ act, label, quiet?, data? }] }]  ฝังแถวปุ่มที่ไหนบ้าง
//     resolve(sys, act, btn)          → { specs, mode } | { toast } | null   ปุ่มที่กด (data-pa-ai = act) ต้องทำอะไร
//
// spec ของช่อง (ตัวต่อเป็นคนสร้าง) = { key, el (id ขององค์ประกอบ), label, hint?, item?, fieldLabel?, … }
//   มี item = ช่องในกลุ่มเดียวกัน (หัวกลุ่มพิมพ์ครั้งเดียว ใช้ fieldLabel ต่อช่อง) · ไม่มี item = พิมพ์ชื่อช่อง+แนวทางของช่องนั้นเอง
//
// กติกาการเขียนในไฟล์นี้: ฟังก์ชันที่เป็นจุดเข้า (เรียกจากนอก/เทสต์) รับ sys เป็นพารามิเตอร์ท้ายแบบ sys = docSystem() · ฟังก์ชันภายในส่ง sys ต่อเสมอ
//
// ชื่อ class/id/data-attribute ของ UI ยังขึ้นต้น pa-ai- (สไตล์อยู่ที่ css/style.css) — รอเปลี่ยนเป็นชื่อกลางพร้อมแก้ CSS ในขั้นถัดไป
// ต้องโหลดหลัง js/badwork-ai-config.js · ตัวต่อของแต่ละระบบโหลดหลังไฟล์นี้ · ระบบเรียก badworkAiMount(view, form, sys) ท้ายการวาดฟอร์ม
// ==========================================================================

// ------------------------------------------------------------------
// ทะเบียนตัวต่อ (หนึ่งระบบเอกสาร = หนึ่งตัวต่อ) — รูปแบบเดียวกับ registerDocUi ใน js/doc-shell.js
// ------------------------------------------------------------------
const DOC_AI = {};
const DOC_AI_METHODS = ['systemPrompt', 'task', 'context', 'scope', 'guide', 'itemHeading', 'ctxBody', 'ctxStorageKey', 'docRef', 'slots', 'resolve'];
const DOC_AI_COPY = ['consent', 'saveLabel', 'topPoints', 'topWarn', 'topButton', 'ctxTitle', 'ctxNote'];

function registerDocAi(id, adapter) {
  const miss = [];
  DOC_AI_METHODS.forEach(k => { if (!adapter || typeof adapter[k] !== 'function') miss.push(k); });
  DOC_AI_COPY.forEach(k => { if (!adapter || !adapter.copy || !adapter.copy[k]) miss.push('copy.' + k); });
  if (!adapter || !adapter.copy || typeof adapter.copy.reviewGroup !== 'function') miss.push('copy.reviewGroup');
  if (miss.length) throw new Error(`ตัวต่อ AI ของระบบเอกสาร "${id}" ไม่ครบ: ${miss.join(', ')}`);
  if (DOC_AI[id]) throw new Error(`ตัวต่อ AI ของระบบเอกสาร "${id}" ลงทะเบียนซ้ำ`);
  DOC_AI[id] = adapter;
  return adapter;
}
function docAiFind(sys) { return DOC_AI[sys.id] || null; }
function docAi(sys = docSystem()) {
  const ad = docAiFind(sys);
  if (!ad) throw new Error(`ระบบเอกสาร "${sys.id}" ยังไม่ได้ลงทะเบียนตัวต่อ AI (registerDocAi)`);
  return ad;
}

// ช่องนี้มีข้อความอยู่แล้วหรือยัง (ตัวต่อใช้แยกช่องว่าง/ช่องที่มีข้อความ ตอนตัดสินใจว่าปุ่มไหนทำอะไร)
function badworkAiFilled(spec) { return !!(document.getElementById(spec.el)?.value || '').trim(); }

// ------------------------------------------------------------------
// เรียก Gemini
// ------------------------------------------------------------------
function badworkAiModelId() {
  const ai = BADWORK_AI_CONFIG;
  let v = null;
  try { v = localStorage.getItem(ai.storageKeys.model); } catch (err) { /* ใช้ storage ไม่ได้ — ใช้ค่าเริ่มต้น */ }
  return ai.models.some(m => m.id === v) ? v : ai.model;
}
// Gemini 3 ใช้ thinkingLevel · Gemini 2.5 ใช้ thinkingBudget (ส่ง thinkingLevel ให้ 2.5 จะถูกปฏิเสธ)
function badworkAiThinking(id) {
  return /^gemini-3/.test(id) ? { thinkingLevel: 'low' } : { thinkingBudget: 512 };
}

function badworkAiParseJson(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const o = JSON.parse(t);
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('รูปแบบคำตอบไม่ถูกต้อง');
  return o;
}

async function badworkAiGenerate(prompt, sys = docSystem()) {
  const ai = BADWORK_AI_CONFIG;
  const id = badworkAiModelId();
  const body = {
    systemInstruction: { parts: [{ text: docAi(sys).systemPrompt(sys) }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.6, thinkingConfig: badworkAiThinking(id) },
  };
  const headers = { 'Content-Type': 'application/json' };
  let url;
  if (ai.proxyUrl) {
    // โหมดพร็อกซี: คีย์อยู่ที่เซิร์ฟเวอร์ · แนบ Firebase ID token เพื่อให้พร็อกซีตรวจว่าเป็นผู้ใช้ที่ล็อกอินจริง
    url = ai.proxyUrl;
    body.model = id;
    let user = null;
    try { user = firebase.auth().currentUser; } catch (err) { /* ไม่มี auth — ส่งโดยไม่แนบ token */ }
    if (user) headers.Authorization = 'Bearer ' + await user.getIdToken();
  } else {
    // โหมดตรง: คีย์อยู่ในหน้าเว็บ (ใครเปิด DevTools ก็เห็น) — ต้องจำกัด HTTP referrer ที่ Google Cloud Console
    if (!ai.apiKey) throw new Error('ยังไม่ได้ตั้ง API key (js/badwork-ai-config.js > apiKey)');
    url = `${ai.endpoint}/models/${encodeURIComponent(id)}:generateContent`;
    headers['x-goog-api-key'] = ai.apiKey;
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ai.timeout);
  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ctl.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`[${res.status}] ${(data.error && data.error.message) || res.statusText}`);
    const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    const text = parts.map(x => x.text || '').join('');
    if (!text) throw new Error('รูปแบบคำตอบไม่ถูกต้อง'); // ถูกบล็อก/ไม่มีข้อความ
    return badworkAiParseJson(text);
  } catch (err) {
    if (err && err.name === 'AbortError') throw new Error('timeout');
    throw err;
  } finally { clearTimeout(timer); }
}

function badworkAiError(err) {
  console.error('AI:', err);
  const m = String((err && (err.message || err.code)) || err);
  const code = (m.match(/\[(\d{3})\b/) || m.match(/\b(4\d\d|5\d\d)\b/) || [])[1]; // รหัส HTTP ถ้ามี
  const tag = code ? ` (รหัส ${code})` : '';
  let msg;
  if (!navigator.onLine || /Failed to fetch|dynamically imported module|NetworkError/i.test(m)) msg = 'ใช้ AI ไม่ได้ — ไม่มีอินเทอร์เน็ตหรือโหลดชุดคำสั่งไม่สำเร็จ';
  else if (/API key not valid|API_KEY_INVALID|ยังไม่ได้ตั้ง/i.test(m)) msg = `API key ไม่ถูกต้องหรือยังไม่ได้ตั้ง${tag} — ตรวจ apiKey ใน js/badwork-ai-config.js (สร้างคีย์ที่ aistudio.google.com/apikey)`;
  else if (code === '404' || /not found|is not supported|no longer available/i.test(m)) msg = `ไม่พบโมเดล ${badworkAiModelId()}${tag} — ลองเลือกรุ่นอื่นในการ์ดผู้ช่วย AI หรือตรวจชื่อรุ่นใน js/badwork-ai-config.js (BADWORK_AI_CONFIG.models)`;
  else if (code === '403' || /PERMISSION_DENIED|API has not been used|API_KEY_SERVICE_BLOCKED|not enabled/i.test(m)) msg = `AI ถูกปฏิเสธสิทธิ์${tag} — ตรวจว่า API key อนุญาต Generative Language API และโดเมนของเว็บอยู่ในรายการ HTTP referrer ที่อนุญาต`;
  else if (code === '429' || /RESOURCE_EXHAUSTED|quota exceeded|too many requests|rate limit/i.test(m)) msg = `โควตา AI เต็มหรือเรียกถี่เกิน${tag} — รอ 1 นาทีแล้วลองใหม่ (ดูโควตาใน Google AI Studio > Usage)`;
  else if (/timeout/i.test(m)) msg = 'AI ตอบช้าเกินไป ลองใหม่อีกครั้ง';
  else if (/JSON|รูปแบบคำตอบ/i.test(m)) msg = 'AI ตอบในรูปแบบที่อ่านไม่ได้ ลองใหม่อีกครั้ง';
  else msg = `เรียก AI ไม่สำเร็จ${tag}: ` + m.slice(0, 120);
  showToast(msg);
}

// ------------------------------------------------------------------
// สร้างคำสั่ง — โครงเป็นของแกน · เนื้อ (ข้อมูลประกอบ · แนวทาง · คำสั่งงาน · หัวกลุ่ม) มาจากตัวต่อ
// ------------------------------------------------------------------
// ขอข้อความสำหรับกลุ่มช่องหนึ่งชุด → [{...spec, el, current, proposed}]
async function badworkAiBatch(specs, mode, known, sys = docSystem()) {
  const ad = docAi(sys);
  const fields = specs.map(s => {
    const el = document.getElementById(s.el);
    return { ...s, el, current: (el?.value || '').trim() };
  }).filter(f => f.el);
  if (!fields.length) return [];
  // ลำดับพร้อต์: ส่วนที่ซ้ำกันทุกคำขอ (ข้อมูลประกอบ → แนวทางช่องงาน) ก่อน · ส่วนที่เปลี่ยนตามคำขอ (โหมด/รายชื่อช่อง) ท้ายสุด
  // งานหลักบอกครั้งเดียว · ช่องที่มี "ข้อความเดิม" บอกซ้ำเฉพาะเมื่อคำสั่งต่างจากค่าตั้งต้น (เช่น โหมดต่อเติม)
  const base = ad.task(sys, mode, '');
  const lines = [];
  let lastItem = '';
  fields.forEach(f => {
    if (f.item) { // ช่องในกลุ่ม: หัวกลุ่มใส่ครั้งเดียวต่อกลุ่ม · แนวทางอยู่ในบล็อกกลาง (ad.guide)
      if (f.item !== lastItem) { lines.push(ad.itemHeading(f)); lastItem = f.item; }
      lines.push(`- "${f.key}" ${f.fieldLabel}`);
    } else {
      lastItem = '';
      lines.push(`- "${f.key}" ชื่อช่อง: ${f.label}\n  แนวทาง: ${f.hint}`);
    }
    if (f.current) {
      const t = ad.task(sys, mode, f.current);
      lines.push((t !== base ? `  งาน: ${t}\n` : '') + `  ข้อความเดิม: """${f.current.slice(0, 2000)}"""`);
    }
  });
  const guide = ad.guide(sys, fields);
  const prompt = `ข้อมูลประกอบ:\n${ad.context(sys, known, ad.scope(sys, fields))}${guide}\n\nงาน (ทุกช่อง): ${base}\n\nช่องที่ต้องการ:\n${lines.join('\n')}\n\nตอบเป็น JSON object ที่มีคีย์เหล่านี้เท่านั้น: ${JSON.stringify(fields.map(f => f.key))}`;
  const out = await badworkAiGenerate(prompt, sys);
  return fields.map(f => ({ ...f, proposed: String(out[f.key] ?? '').trim() })).filter(f => f.proposed);
}

// ------------------------------------------------------------------
// ความยินยอม + ตัวกันกดซ้ำ
//   ยินยอมครั้งเดียวมีผลทุกระบบ (คีย์เดียว BADWORK_AI_CONFIG.storageKeys.consent) — ข้อความในหน้าต่างเป็นของระบบที่ผู้ใช้กดก่อน
// ------------------------------------------------------------------
function badworkAiConsent(sys = docSystem()) {
  const key = BADWORK_AI_CONFIG.storageKeys.consent;
  try { if (localStorage.getItem(key) === '1') return true; } catch (err) { /* ใช้ storage ไม่ได้ — ถามทุกครั้ง */ }
  const ok = confirm(docAi(sys).copy.consent);
  if (ok) { try { localStorage.setItem(key, '1'); } catch (err) { /* ข้าม */ } }
  return ok;
}

let badworkAiBusy = false; // ทั้งแอปทำได้ทีละคำขอ (กันโควตา) ไม่แยกตามระบบ
async function badworkAiGuard(btn, fn, sys = docSystem()) {
  if (badworkAiBusy) { showToast('AI กำลังทำงานอยู่ รอสักครู่'); return undefined; }
  if (!badworkAiConsent(sys)) return undefined;
  badworkAiBusy = true;
  // ปิดปุ่ม AI ทุกปุ่มระหว่างรอ ให้เห็นชัดว่ากำลังทำงานอยู่ (ไม่ต้องรอให้กดซ้ำแล้วเจอ toast)
  const all = [...(btn.closest('form') || document).querySelectorAll('[data-pa-ai]')];
  const old = btn.innerHTML;
  all.forEach(b => { b.disabled = true; });
  btn.innerHTML = 'กำลังคิด<span class="loader-dots" aria-hidden="true"><i></i><i></i><i></i></span>';
  try { return await fn(t => { btn.textContent = t; }); }
  catch (err) { badworkAiError(err); return undefined; }
  finally { badworkAiBusy = false; all.forEach(b => { b.disabled = false; }); btn.innerHTML = old; }
}

// ------------------------------------------------------------------
// หน้าต่างตรวจทานข้อความที่ AI เสนอ (ใช้ .modal มาตรฐานของแอป)
// ------------------------------------------------------------------
function badworkAiReview(items, warn, sys = docSystem()) {
  const copy = docAi(sys).copy;
  const prev = document.activeElement;
  let lastGrp = '';
  const body = items.map((it, i) => {
    let head = '';
    const g = copy.reviewGroup(it); // หัวกลุ่ม: ช่องที่อยู่กลุ่มเดียวกันใต้หัวเดียว
    if (g.id !== lastGrp) { head = `<div class="pa-ai-grp">${escapeHtml(g.title)}</div>`; lastGrp = g.id; }
    const name = it.item ? it.fieldLabel : it.label;
    return `${head}<div class="pa-ai-item">
      <label class="pa-check"><input type="checkbox" data-i="${i}" checked> ${escapeHtml(name)}</label>
      ${it.current ? `<details class="pa-ai-old"><summary>ข้อความเดิม (จะถูกแทนที่ถ้าเลือกช่องนี้)</summary><div class="pa-ai-old-text">${escapeHtml(it.current)}</div></details>` : ''}
      <div class="field"><textarea data-t="${i}" rows="4" aria-label="${escapeHtml(name)}">${escapeHtml(it.proposed)}</textarea></div>
    </div>`;
  }).join('');

  openModal(`<h2>ข้อความที่ AI เสนอ</h2>
    <div class="modal-sub">${items.length} ช่อง · แก้ไขในกล่องได้ก่อนกด “ใช้ที่เลือก” · ข้อความจะยังไม่ถูกบันทึกจนกว่าจะกด “${escapeHtml(copy.saveLabel)}”</div>
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
        : `ใส่ข้อความ ${n} ช่องแล้ว${dots ? ' · มี “…” ที่ต้องกรอกตัวเลข' : ''} · ตรวจแล้วกด “${copy.saveLabel}”`);
    }
  });
  areas[0]?.focus();
}

// ------------------------------------------------------------------
// การทำงานของปุ่ม
// ------------------------------------------------------------------
async function badworkAiRunFields(btn, specs, mode, sys = docSystem()) {
  const items = await badworkAiGuard(btn, () => badworkAiBatch(specs, mode, {}, sys), sys);
  if (!items) return; // error แสดงไปแล้ว
  if (!items.length) { showToast('AI ไม่ได้ส่งข้อความกลับมา ลองอีกครั้ง'); return; }
  badworkAiReview(items, undefined, sys);
}

// ------------------------------------------------------------------
// บันทึกบริบทอัตโนมัติ: มีเอกสารแล้ว → เขียนเฉพาะ aiCtx ลง Firestore ทันที (ไม่แตะช่องอื่นที่ยังพิมพ์ค้าง)
//   ยังเป็นเอกสารใหม่ → สำรองในเครื่อง แล้วเก็บเข้าเอกสารเมื่อกดบันทึก · เอกสารใหม่ถัดไปจะหยิบบริบทล่าสุดมาให้แก้ต่อ
//   ช่องบริบทมี id = sys.config.aiCtx.idPrefix + รหัสช่อง (ต้องไม่ซ้ำกับระบบอื่น)
// ------------------------------------------------------------------
function badworkAiCtxValues(sys = docSystem()) {
  const { fields, maxLen, idPrefix } = sys.config.aiCtx;
  const v = {};
  Object.keys(fields).forEach(k => { v[k] = (document.getElementById(idPrefix + k)?.value || '').trim().slice(0, maxLen[k]); });
  return v;
}

function badworkAiCtxLoadLocal(sys = docSystem()) {
  try {
    const o = JSON.parse(localStorage.getItem(docAi(sys).ctxStorageKey(sys)) || 'null');
    return o && typeof o === 'object' ? o : null;
  } catch (err) { return null; }
}

// เอกสารใหม่ที่ยังไม่มีบริบท → หยิบจากเอกสารล่าสุดที่มี (รายการเรียงใหม่→เก่า) หรือที่สำรองในเครื่อง · ทำครั้งเดียวต่อเอกสาร
function badworkAiSeedCtx(d, sys = docSystem()) {
  if (sys.state.docId || d._ctxSeeded || badworkAiCtxCount(d.aiCtx || {}, sys)) return;
  d._ctxSeeded = true; // ขึ้นต้น _ → ฟังก์ชันบันทึกของระบบต้องตัดทิ้ง (paSave ทำให้ PA)
  const last = (sys.state.list || []).find(x => x.aiCtx && badworkAiCtxCount(x.aiCtx, sys));
  const src = last ? last.aiCtx : badworkAiCtxLoadLocal(sys);
  if (!src) return;
  d.aiCtx = {};
  Object.entries(sys.config.aiCtx.maxLen).forEach(([k, n]) => { d.aiCtx[k] = String(src[k] || '').slice(0, n); });
}

let badworkAiCtxTimer = null;
async function badworkAiCtxSave(statusEl, sys = docSystem()) {
  const ad = docAi(sys);
  clearTimeout(badworkAiCtxTimer);
  badworkAiCtxTimer = null;
  // ฟอร์มถูกถอดไปแล้ว (สลับแท็บ/ระบบก่อนตัวหน่วงครบ) → ค่าที่อ่านได้จะว่างหมด ห้ามเขียนทับบริบทที่เก็บไว้
  if (!document.getElementById(sys.config.aiCtx.idPrefix + Object.keys(sys.config.aiCtx.fields)[0])) return;
  const v = badworkAiCtxValues(sys);
  sys.state.doc.aiCtx = v;
  try { localStorage.setItem(ad.ctxStorageKey(sys), JSON.stringify(v)); } catch (err) { /* ใช้ storage ไม่ได้ — ข้าม */ }
  const uid = AppState.user?.uid, id = sys.state.docId;
  if (!id || !uid) { if (statusEl) statusEl.textContent = 'จะเก็บกับเอกสารเมื่อกดบันทึก'; return; }
  try {
    await ad.docRef(sys, uid, id).update({ aiCtx: v });
    if (statusEl?.isConnected) statusEl.textContent = 'บันทึกอัตโนมัติแล้ว';
  } catch (err) {
    console.error('AI ctx save:', err);
    if (statusEl?.isConnected) statusEl.textContent = `บันทึกอัตโนมัติไม่สำเร็จ — กด “${ad.copy.saveLabel}” เพื่อเก็บ`;
  }
}

// การ์ดพับได้ "บริบทงานของฉัน" — เปิดไว้เมื่อยังว่าง · พับเมื่อกรอกแล้ว
function badworkAiCtxCount(c, sys = docSystem()) { return Object.keys(sys.config.aiCtx.fields).filter(k => String(c[k] || '').trim()).length; }

// ตัวช่วยสร้างช่องกรอกให้ ad.ctxBody — ป้ายชื่อ/ความยาวสูงสุด/ขึ้นต้น id มาจาก sys.config.aiCtx
function badworkAiCtxHelpers(c, sys) {
  const { fields: L, maxLen: mx, idPrefix: p } = sys.config.aiCtx;
  return {
    one: (k, ph, o = {}) => `<div class="field"><label for="${p}${k}">${L[k]}</label><input id="${p}${k}" type="text" maxlength="${mx[k]}"${o.numeric ? ' inputmode="numeric"' : ''} value="${escapeHtml(c[k] || '')}" placeholder="${ph}"></div>`,
    many: (k, ph) => `<div class="field"><label for="${p}${k}">${L[k]}</label><textarea id="${p}${k}" rows="2" maxlength="${mx[k]}" placeholder="${ph}">${escapeHtml(c[k] || '')}</textarea></div>`,
  };
}

function badworkAiCtxHtml(c, sys = docSystem()) {
  const ad = docAi(sys);
  const n = badworkAiCtxCount(c, sys), total = Object.keys(sys.config.aiCtx.fields).length;
  return `<details class="pa-ai-ctx"${n ? '' : ' open'}>
    <summary><b>${ad.copy.ctxTitle}</b> <span class="u-note-sm" data-ctx-count>กรอกแล้ว ${n}/${total}</span> <span class="u-note-sm" data-ctx-save role="status"></span></summary>
    <div class="u-note pa-ai-ctx-note">${ad.copy.ctxNote}</div>
    ${ad.ctxBody(sys, c, badworkAiCtxHelpers(c, sys))}
  </details>`;
}

// ------------------------------------------------------------------
// ติดปุ่มเข้ากับฟอร์ม (ระบบเรียกท้ายการวาดฟอร์ม — เช่น renderPAFormView) · ไม่มีตัวต่อ = ไม่ติดอะไร ฟอร์มทำงานตามเดิม
// ------------------------------------------------------------------
const BADWORK_AI_ICON = `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z"/></svg>`;

// แถวปุ่ม "ผู้ช่วย AI" ใต้ช่อง/ใต้กลุ่มช่อง — buttons = [{ act, label, quiet?, data? }]
function badworkAiRowHtml(buttons) {
  const attrs = d => Object.entries(d || {}).map(([k, v]) => ` data-${k}="${escapeHtml(v)}"`).join('');
  return `<div class="pa-ai-row">
      <span class="pa-ai-tag">${BADWORK_AI_ICON} ผู้ช่วย AI</span>
      ${buttons.map(b => `<button type="button" class="btn ${b.quiet ? 'btn-sm pa-ai-quiet' : 'btn-ghost btn-sm'}" data-pa-ai="${b.act}"${attrs(b.data)}>${b.label}</button>`).join('\n      ')}
    </div>`;
}

function badworkAiMount(view, form, sys = docSystem()) {
  const ad = docAiFind(sys);
  if (!ad || !form || form.dataset.paAi) return;
  const ai = BADWORK_AI_CONFIG;
  form.dataset.paAi = '1'; // ใช้เป็นตัวกันติดซ้ำ — ฟอร์มเองจึงตรง [data-pa-ai] ด้วย ตัวฟังคลิกต้องเมินค่า act ที่ไม่รู้จัก
  badworkAiSeedCtx(sys.state.doc, sys);

  // 1) การ์ดบนสุด: อธิบายสั้นๆ + บริบทงาน + เลือกรุ่น + ปุ่มหลัก
  const top = document.createElement('div');
  top.className = 'card card-pad pa-ai-top';
  top.innerHTML = `<div class="pa-ai-head">
      <span class="course-chip pa-ai-chip">${BADWORK_AI_ICON}</span>
      <div>
        <h2 class="card-title">ผู้ช่วย AI</h2>
        <div class="u-note">ช่วยร่าง ปรับสำนวน และย่อข้อความ โดยใช้ Gemini</div>
      </div>
    </div>
    <ul class="pa-ai-points u-note">
      ${ad.copy.topPoints.map(t => `<li>${t}</li>`).join('\n      ')}
    </ul>
    ${badworkAiCtxHtml(sys.state.doc.aiCtx || {}, sys)}
    <div class="field pa-ai-model">
      <label for="pa-ai-model">โมเดล AI</label>
      <select id="pa-ai-model">${ai.models.map(m => `<option value="${m.id}"${m.id === badworkAiModelId() ? ' selected' : ''}>${m.label}</option>`).join('')}</select>
      <div class="field-hint" data-model-hint>${escapeHtml((ai.models.find(m => m.id === badworkAiModelId()) || {}).hint || '')}</div>
    </div>
    <div class="pa-ai-warn">${ad.copy.topWarn}</div>
    <button type="button" class="btn btn-primary" data-pa-ai="all">${BADWORK_AI_ICON} ${ad.copy.topButton}</button>`;
  form.insertBefore(top, form.firstChild);
  top.querySelector('#pa-ai-model').addEventListener('change', e => {
    const m = ai.models.find(x => x.id === e.target.value);
    if (!m) return;
    try { localStorage.setItem(ai.storageKeys.model, m.id); } catch (err) { /* ใช้ storage ไม่ได้ — มีผลเฉพาะครั้งนี้ */ }
    top.querySelector('[data-model-hint]').textContent = m.hint;
    showToast('ใช้ ' + m.label + ' แล้ว');
  });
  // นับช่องบริบทที่กรอกแล้วแบบสด
  const ctxBox = top.querySelector('.pa-ai-ctx');
  const saveEl = ctxBox?.querySelector('[data-ctx-save]');
  ctxBox?.addEventListener('input', () => {
    const cnt = ctxBox.querySelector('[data-ctx-count]');
    if (cnt) cnt.textContent = `กรอกแล้ว ${badworkAiCtxCount(badworkAiCtxValues(sys), sys)}/${Object.keys(sys.config.aiCtx.fields).length}`;
    if (saveEl) saveEl.textContent = 'กำลังบันทึก…';
    clearTimeout(badworkAiCtxTimer);
    badworkAiCtxTimer = setTimeout(() => badworkAiCtxSave(saveEl, sys), 700);
  });
  ctxBox?.addEventListener('focusout', () => { if (badworkAiCtxTimer) badworkAiCtxSave(saveEl, sys); }); // ออกจากช่อง = บันทึกทันที ไม่รอ

  // 2) แถวปุ่มใต้ช่อง/กลุ่มช่อง — ตัวต่อบอกว่าฝังที่ไหน
  ad.slots(sys, form).forEach(s => s.host.insertAdjacentHTML('beforeend', badworkAiRowHtml(s.buttons)));

  // 3) คลิกปุ่ม — ตัวต่อบอกว่าปุ่มนี้ต้องส่งช่องไหนด้วยโหมดอะไร (หรือแจ้งว่าทำไม่ได้เพราะอะไร)
  form.addEventListener('click', e => {
    const b = e.target.closest('[data-pa-ai]');
    if (!b) return;
    const r = ad.resolve(sys, b.dataset.paAi, b);
    if (!r) return;
    if (r.toast) { showToast(r.toast); return; }
    badworkAiRunFields(b, r.specs, r.mode, sys);
  });
}
