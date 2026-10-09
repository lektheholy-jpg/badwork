// ==========================================================================
// การอบรม / เกียรติบัตร / รางวัล — แท็บในหน้าข้อมูลส่วนตัว (js/profile.js เรียก renderRecordsTab)
// เก็บแยกตามปีการศึกษา: users/{uid}/records/{id}
//   { type: 'training'|'certificate'|'award', title, org, date (YYYY-MM-DD), year (ปีการศึกษา พ.ศ. คำนวณจากวันที่),
//     hours (เฉพาะการอบรม), note, thumb (รูปย่อ ~320px เป็น data URL เก็บในเอกสาร ดูออฟไลน์ได้),
//     file: { path, name, size, type } | null (ต้นฉบับใน Firebase Storage), createdAt, updatedAt }
// ต้นฉบับ: users/{uid}/records/{id}/{เวลา}.{นามสกุล} ใน Storage · โหลด SDK ของ Storage แบบ lazy ตอนอัปโหลด/ดูต้นฉบับครั้งแรก
// ฟิลด์ต้องตรงกับ validRecord ใน firestore.rules และ storage.rules · ไฟล์นี้ต้องใช้งานเดี่ยวได้ (privacy.js เรียก recDeleteAllFiles)
// ==========================================================================

const REC_TYPES = [['training', 'การอบรม'], ['certificate', 'เกียรติบัตร'], ['award', 'รางวัล']];
const REC_HUES = { training: 'blue', certificate: 'teal', award: 'amber' };
const REC_THUMB_PX = 320;
const REC_THUMB_MAX_CHARS = 60000; // ความยาว data URL สูงสุดของรูปย่อ (~45 KB) — เอกสาร Firestore จำกัด 1 MB
const REC_MAX_ORIGINAL = 10 * 1024 * 1024;
const REC_RESIZE_ABOVE = 8 * 1024 * 1024; // รูปใหญ่กว่านี้ย่อลงก่อนอัปโหลด (ด้านยาว 2600px)
const REC_YEAR_SPAN = 10; // ตัวเลือกปีย้อนหลัง
const REC_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

// ---------- ข้อมูลทั่วไป ----------
function recText(v, max = 200) {
  return String(v == null ? '' : v).replace(/\u0E4D\u0E32/g, '\u0E33').replace(/\s+/g, ' ').trim().slice(0, max);
}
function recTypeLabel(t) { return (REC_TYPES.find(x => x[0] === t) || ['', ''])[1]; }

// ปีการศึกษา (พ.ศ.) จากวันที่ YYYY-MM-DD: พ.ค.–ธ.ค. = ปี พ.ศ. ของปีนั้น · ม.ค.–เม.ย. = ปีก่อนหน้า (ตรงกับภาคเรียนใน timetable.js)
function recAcadYear(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ''));
  if (!m) return null;
  const y = +m[1], mo = +m[2];
  if (y < 1900 || y > 2200 || mo < 1 || mo > 12) return null;
  return mo >= 5 ? y + 543 : y + 542;
}
function recCurrentYear(now = new Date()) { return recAcadYear(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`); }
function recDateTh(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ''));
  return m ? `${+m[3]} ${REC_MONTHS[+m[2] - 1]} ${+m[1] + 543}` : '';
}
function recHoursText(h) { return Number.isInteger(h) ? String(h) : String(Math.round(h * 100) / 100); }

function recCol() {
  return db.collection('users').doc(AppState.user.uid).collection('records');
}

function recCleanFile(f) {
  if (!f || typeof f !== 'object' || typeof f.path !== 'string' || !f.path) return null;
  return { path: f.path.slice(0, 300), name: recText(f.name, 120), size: Number(f.size) || 0, type: recText(f.type, 60) };
}
// เอกสารดิบจาก Firestore → รายการที่ผ่านการตรวจแล้ว (คืน null ถ้าไม่มีชื่อ/วันที่)
function recClean(raw, id) {
  if (!raw || typeof raw !== 'object') return null;
  const title = recText(raw.title), date = /^\d{4}-\d{2}-\d{2}$/.test(raw.date || '') ? raw.date : '';
  if (!title) return null;
  const type = REC_TYPES.some(t => t[0] === raw.type) ? raw.type : 'training';
  const hours = type === 'training' && Number.isFinite(Number(raw.hours)) ? Math.max(0, Math.min(Number(raw.hours), 9999)) : 0;
  const thumb = typeof raw.thumb === 'string' && raw.thumb.startsWith('data:image/') && raw.thumb.length <= REC_THUMB_MAX_CHARS * 1.5 ? raw.thumb : '';
  return {
    id, type, title, date,
    org: recText(raw.org), note: recText(raw.note, 500), hours, thumb,
    year: Number(raw.year) || recAcadYear(date) || 0,
    file: recCleanFile(raw.file),
    createdAt: raw.createdAt || null,
  };
}

async function recLoadYear(year) {
  const snap = await recCol().where('year', '==', year).get();
  return snap.docs.map(d => recClean(d.data(), d.id)).filter(Boolean).sort(recNewestFirst);
}
function recNewestFirst(a, b) { return (b.date || '').localeCompare(a.date || '') || a.title.localeCompare(b.title); }

async function recSave(item) {
  islandSave('saving');
  try {
    await recCol().doc(item.id).set({
      type: item.type, title: item.title, org: item.org, date: item.date, year: item.year, hours: item.hours,
      note: item.note, thumb: item.thumb, file: item.file,
      createdAt: item.createdAt || firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    islandSave('saved');
    return true;
  } catch (err) {
    console.error(err);
    showToast(err.code === 'permission-denied'
      ? 'บันทึกไม่สำเร็จ: ถูกปฏิเสธสิทธิ์ (ต้องอัปเดต firestore.rules ก่อน)'
      : 'บันทึกไม่สำเร็จ: ' + (err.message || err), 'error');
    return false;
  }
}
async function recRemove(id) {
  try { await recCol().doc(id).delete(); return true; } catch (err) {
    console.error(err);
    showToast('ลบไม่สำเร็จ: ' + (err.message || err), 'error');
    return false;
  }
}

// ---------- Firebase Storage (โหลด SDK ตอนต้องใช้) ----------
let _recStoragePromise = null;
function recStorage() {
  if (!_recStoragePromise) {
    _recStoragePromise = new Promise((resolve, reject) => {
      if (firebase.storage) { resolve(firebase.storage()); return; }
      const s = document.createElement('script');
      s.src = 'https://www.gstatic.com/firebasejs/10.13.0/firebase-storage-compat.js';
      s.onload = () => resolve(firebase.storage());
      s.onerror = () => { _recStoragePromise = null; reject(new Error('โหลดตัวส่งไฟล์ไม่สำเร็จ (ต้องมีอินเทอร์เน็ต)')); };
      document.head.appendChild(s);
    });
  }
  return _recStoragePromise;
}

function recFileOk(file) { return !!file && (/^image\//.test(file.type) || file.type === 'application/pdf'); }

function recLoadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('เปิดรูปไม่ได้')); };
    img.src = url;
  });
}
function recCanvasOf(img, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * scale));
  c.height = Math.max(1, Math.round(img.naturalHeight * scale));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}
// รูปย่อสำหรับเก็บในเอกสาร: WebP (ถ้าเบราว์เซอร์ทำได้) ไม่งั้น JPEG · ลดคุณภาพจนไม่เกินขนาดที่กำหนด · PDF/รูปที่เปิดไม่ได้ (เช่น HEIC) = ''
async function recMakeThumb(file) {
  if (!file || !/^image\//.test(file.type)) return '';
  try {
    const c = recCanvasOf(await recLoadImage(file), REC_THUMB_PX);
    for (const q of [0.8, 0.65, 0.5, 0.35]) {
      let url = c.toDataURL('image/webp', q);
      if (!url.startsWith('data:image/webp')) url = c.toDataURL('image/jpeg', q);
      if (url.length <= REC_THUMB_MAX_CHARS) return url;
    }
  } catch (err) { console.error(err); }
  return '';
}
// ต้นฉบับที่จะอัปโหลด: รูปใหญ่เกิน 8 MB ย่อก่อน · เกิน 10 MB (หลังย่อ) หรือ PDF ใหญ่เกินไป = ปฏิเสธ
async function recPrepareOriginal(file) {
  let blob = file;
  if (/^image\//.test(file.type) && file.size > REC_RESIZE_ABOVE) {
    try {
      const c = recCanvasOf(await recLoadImage(file), 2600);
      blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.88)) || file;
    } catch (err) { console.error(err); }
  }
  if (blob.size > REC_MAX_ORIGINAL) throw new Error('ไฟล์ใหญ่เกิน 10 MB');
  return blob;
}
async function recUpload(id, blob, name, onProgress) {
  const st = await recStorage();
  const ext = ((/\.([a-z0-9]{1,5})$/i.exec(name || '') || [])[1] || (blob.type === 'application/pdf' ? 'pdf' : 'jpg')).toLowerCase();
  const path = `users/${AppState.user.uid}/records/${id}/${Date.now()}.${ext}`;
  const task = st.ref(path).put(blob, { contentType: blob.type });
  await new Promise((resolve, reject) => task.on('state_changed',
    s => { if (onProgress && s.totalBytes) onProgress(s.bytesTransferred / s.totalBytes); }, reject, resolve));
  return { path, name: recText(name, 120), size: blob.size, type: blob.type };
}
async function recDeleteFile(path) {
  if (!path) return;
  try { await (await recStorage()).ref(path).delete(); } catch (err) {
    if (err.code !== 'storage/object-not-found') console.error(err);
  }
}
async function recFileUrl(path) { return (await recStorage()).ref(path).getDownloadURL(); }

// ลบไฟล์ทั้งหมดของครูใน Storage (ใช้ตอนลบบัญชี — js/privacy.js) · ไม่ปิดเสียงข้อผิดพลาด ให้ผู้เรียกหยุดก่อนลบบัญชี
async function recDeleteAllFiles(uid) {
  const st = await recStorage();
  const walk = async ref => {
    const list = await ref.listAll();
    await Promise.all(list.items.map(i => i.delete()));
    for (const p of list.prefixes) await walk(p);
  };
  await walk(st.ref(`users/${uid}/records`));
}

// ---------- หน้าต่างรายละเอียด (ดูต้นฉบับ) ----------
function recViewModal(ctx, item) {
  const { editItem, deleteItem } = ctx;
  const f = item.file, isPdf = !!f && f.type === 'application/pdf';
  const meta = [item.org, recDateTh(item.date), item.type === 'training' && item.hours ? `${recHoursText(item.hours)} ชั่วโมง` : ''].filter(Boolean);
  openModal(`
    <h2>${escapeHtml(item.title)}</h2>
    <div class="modal-sub">${escapeHtml(recTypeLabel(item.type))} · ปีการศึกษา ${item.year}</div>
    ${item.thumb ? `<img class="rec-big" id="rec-big" alt="${escapeHtml(item.title)}">` : `<div class="rec-big rec-nopic" id="rec-nopic">${isPdf ? 'PDF' : 'ไม่มีรูป'}</div>`}
    ${f ? `<div class="u-note-sm u-mb-12" id="rec-file-note">${isPdf ? 'ไฟล์ PDF' : 'กำลังโหลดภาพต้นฉบับ...'} · ${escapeHtml(f.name || '')}</div>` : '<div class="u-note-sm u-mb-12">ยังไม่มีไฟล์ต้นฉบับ — แตะ "แก้ไข" เพื่อแนบไฟล์</div>'}
    ${meta.length ? `<div class="u-note u-mb-12">${meta.map(escapeHtml).join(' · ')}</div>` : ''}
    ${item.note ? `<div class="rec-note">${escapeHtml(item.note)}</div>` : ''}
    <div class="modal-actions">
      <button type="button" class="btn btn-danger-ghost tt-del" id="rec-del-btn">ลบ</button>
      ${f ? `<a id="rec-open-btn" target="_blank" rel="noopener" class="btn btn-ghost hidden">เปิดต้นฉบับ</a>` : ''}
      <button type="button" class="btn btn-ghost" id="rec-edit-btn">แก้ไข</button>
      <button type="button" class="btn btn-primary" id="rec-close-btn">ปิด</button>
    </div>
  `);
  const $ = id => document.getElementById(id);
  const big = $('rec-big');
  if (big) big.src = item.thumb;
  $('rec-close-btn').addEventListener('click', closeModal);
  $('rec-edit-btn').addEventListener('click', () => { closeModal(); editItem(item); });
  $('rec-del-btn').addEventListener('click', () => { closeModal(); deleteItem(item); });
  if (!f) return;

  // กดเปิดแล้วค่อยโหลดต้นฉบับ: รูป = สลับจากรูปย่อเป็นภาพเต็มเมื่อโหลดเสร็จ · PDF = ปุ่มเปิดในแท็บใหม่
  const note = $('rec-file-note'), openBtn = $('rec-open-btn');
  const fail = msg => { if (note && note.isConnected) note.textContent = msg; };
  recFileUrl(f.path).then(url => {
    if (!openBtn || !openBtn.isConnected) return;
    openBtn.href = url; openBtn.classList.remove('hidden');
    if (isPdf) return;
    const img = new Image();
    img.onload = () => {
      if (!big || !big.isConnected) return;
      big.src = url; note.textContent = `ภาพต้นฉบับ · ${f.name || ''}`;
    };
    img.onerror = () => fail('โหลดภาพต้นฉบับไม่สำเร็จ — ใช้ปุ่ม "เปิดต้นฉบับ" แทน');
    img.src = url;
  }).catch(err => {
    console.error(err);
    fail(navigator.onLine === false ? 'ออฟไลน์อยู่ — เห็นเฉพาะรูปย่อ ต้องต่ออินเทอร์เน็ตเพื่อดูต้นฉบับ' : 'โหลดต้นฉบับไม่สำเร็จ');
  });
}

// ---------- หน้าต่างเพิ่ม/แก้ไข ----------
function recEditModal(ctx, { item = null, year }) {
  const isEdit = !!item;
  const e = item || { id: '', type: 'training', title: '', org: '', date: '', hours: 0, note: '', thumb: '', file: null, year, createdAt: null };
  let kind = e.type, picked = null;
  const kindBtns = REC_TYPES.map(([k, label]) => `<button type="button" class="theme-opt" data-kind="${k}" aria-pressed="${k === kind}">${label}</button>`).join('');
  openModal(`
    <h2>${isEdit ? 'แก้ไขรายการ' : 'เพิ่มรายการ'}</h2>
    <div class="modal-sub">ปีการศึกษาคำนวณจากวันที่ (พ.ค.–ธ.ค. = ปีนั้น · ม.ค.–เม.ย. = ปีการศึกษาก่อนหน้า) · แนบรูปหรือ PDF ได้ 1 ไฟล์ (ไม่เกิน 10 MB)</div>
    <div class="theme-seg" id="rec-kind" role="group" aria-label="ประเภท">${kindBtns}</div>
    <div class="field"><label for="rec-title" id="rec-title-label">ชื่อเรื่อง</label><input id="rec-title" maxlength="200" autocomplete="off" value="${escapeHtml(e.title)}"></div>
    <div class="field"><label for="rec-org" id="rec-org-label">หน่วยงาน</label><input id="rec-org" maxlength="200" autocomplete="off" value="${escapeHtml(e.org)}"></div>
    <div class="field-row">
      <div class="field"><label for="rec-date">วันที่</label><input id="rec-date" type="date" value="${escapeHtml(e.date)}"></div>
      <div class="field" id="rec-hours-field"><label for="rec-hours">จำนวนชั่วโมง</label><input id="rec-hours" type="number" min="0" max="9999" step="0.5" inputmode="decimal" value="${e.hours || ''}"></div>
    </div>
    <div class="field"><label for="rec-note">บันทึกเพิ่มเติม</label><textarea id="rec-note" rows="2" maxlength="500">${escapeHtml(e.note)}</textarea></div>
    <div class="field">
      <label for="rec-file">${isEdit && e.file ? 'เปลี่ยนไฟล์ (เลือกใหม่เพื่อแทนที่)' : 'ไฟล์เกียรติบัตร/หลักฐาน (รูปหรือ PDF)'}</label>
      <input id="rec-file" type="file" accept="image/*,application/pdf">
      <div class="u-note-sm u-mt-4" id="rec-file-hint">${isEdit && e.file ? `ไฟล์เดิม: ${escapeHtml(e.file.name || '')}` : ''}</div>
      <img class="rec-pick hidden" id="rec-pick" alt="">
    </div>
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" id="rec-cancel-btn">ยกเลิก</button>
      <button type="button" class="btn btn-primary" id="rec-save-btn">บันทึก</button>
    </div>
  `);
  const $ = id => document.getElementById(id);
  const kindSeg = $('rec-kind');
  initNavPill(kindSeg, '.theme-opt', 'seg-pill', { activeSel: '[aria-pressed="true"]', watch: true });
  const syncKind = () => {
    kindSeg.querySelectorAll('[data-kind]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.kind === kind)));
    $('rec-hours-field').classList.toggle('hidden', kind !== 'training');
    $('rec-title-label').textContent = kind === 'training' ? 'ชื่อโครงการ/หลักสูตรอบรม' : kind === 'certificate' ? 'ชื่อเกียรติบัตร' : 'ชื่อรางวัล';
    $('rec-org-label').textContent = kind === 'training' ? 'หน่วยงานที่จัด' : 'หน่วยงานที่มอบ';
  };
  kindSeg.querySelectorAll('[data-kind]').forEach(b => b.addEventListener('click', () => { kind = b.dataset.kind; syncKind(); }));
  syncKind();

  $('rec-file').addEventListener('change', async () => {
    const f = $('rec-file').files[0], hint = $('rec-file-hint'), pic = $('rec-pick');
    pic.classList.add('hidden'); picked = null;
    if (!f) return;
    if (!recFileOk(f)) { hint.textContent = 'รองรับเฉพาะรูปภาพ (JPG/PNG/WebP) หรือ PDF — ถ้าเป็น HEIC ให้บันทึกเป็น JPG ก่อน'; $('rec-file').value = ''; return; }
    picked = f;
    hint.textContent = `${f.name} · ${(f.size / 1048576).toFixed(1)} MB`;
    const t = await recMakeThumb(f);
    if (picked !== f || !pic.isConnected) return;
    if (t) { pic.src = t; pic.classList.remove('hidden'); } else if (/^image\//.test(f.type)) hint.textContent += ' · ทำรูปย่อไม่ได้ (จะแนบเฉพาะต้นฉบับ)';
  });

  $('rec-cancel-btn').addEventListener('click', closeModal);
  $('rec-save-btn').addEventListener('click', async () => {
    const title = recText($('rec-title').value), date = $('rec-date').value;
    if (!title) { showToast('กรอกชื่อเรื่องก่อน'); $('rec-title').focus(); return; }
    const acad = recAcadYear(date);
    if (!acad) { showToast('เลือกวันที่ก่อน'); $('rec-date').focus(); return; }
    const hours = kind === 'training' ? Math.max(0, Math.min(Number($('rec-hours').value) || 0, 9999)) : 0;
    const id = e.id || recCol().doc().id;
    const next = { id, type: kind, title, org: recText($('rec-org').value), date, year: acad, hours, note: recText($('rec-note').value, 500), thumb: e.thumb, file: e.file, createdAt: e.createdAt };
    const saveBtn = $('rec-save-btn'), cancelBtn = $('rec-cancel-btn');
    let oldPath = '', warn = '';
    if (picked) {
      saveBtn.disabled = true; cancelBtn.disabled = true; saveBtn.textContent = 'กำลังอัปโหลด...';
      const thumb = await recMakeThumb(picked);
      try {
        const blob = await recPrepareOriginal(picked);
        const meta = await recUpload(id, blob, picked.name, p => showToast(`กำลังอัปโหลดต้นฉบับ ${Math.round(p * 100)}%...`));
        oldPath = e.file ? e.file.path : '';
        next.file = meta; next.thumb = thumb;
      } catch (err) {
        console.error(err);
        if (isEdit) warn = `เปลี่ยนไฟล์ไม่สำเร็จ (${err.message || err}) — ยังใช้ไฟล์เดิม`;
        else { next.thumb = thumb; next.file = null; warn = `บันทึกรายการแล้ว แต่ส่งต้นฉบับไม่สำเร็จ (${err.message || err}) — แตะรายการ → แก้ไข เพื่อแนบไฟล์อีกครั้ง`; }
      }
    }
    closeModal();
    const ok = await ctx.commitItem(next);
    if (ok && oldPath && oldPath !== (next.file && next.file.path)) recDeleteFile(oldPath);
    if (warn) showToast(warn, 'warn');
  });
}

// ---------- แท็บ ----------
function recStatsHtml(list) {
  const card = (label, value) => `<div class="stat-card"><div class="label">${label}</div><div class="value">${value}</div></div>`;
  const training = list.filter(r => r.type === 'training');
  const hours = training.reduce((s, r) => s + r.hours, 0);
  return card('ชั่วโมงอบรมรวม', recHoursText(hours)) + card('การอบรม', training.length)
    + card('เกียรติบัตร', list.filter(r => r.type === 'certificate').length) + card('รางวัล', list.filter(r => r.type === 'award').length);
}
function recCardHtml(r) {
  const meta = [r.org, recDateTh(r.date)].filter(Boolean).map(escapeHtml).join(' · ');
  const pic = r.thumb ? `<img src="${escapeHtml(r.thumb)}" alt="" loading="lazy">` : `<span>${r.file && r.file.type === 'application/pdf' ? 'PDF' : 'ไม่มีรูป'}</span>`;
  return `
    <button type="button" class="rec-card" data-id="${escapeHtml(r.id)}" style="--w:var(--hue-${REC_HUES[r.type]})" aria-label="ดูรายละเอียด ${escapeHtml(r.title)}">
      <div class="rec-thumb">${pic}</div>
      <div class="rec-body">
        <span class="rec-type">${escapeHtml(recTypeLabel(r.type))}${r.type === 'training' && r.hours ? ` · ${recHoursText(r.hours)} ชม.` : ''}</span>
        <span class="rec-title">${escapeHtml(r.title)}</span>
        ${meta ? `<span class="rec-meta">${meta}</span>` : ''}
      </div>
    </button>`;
}

async function renderRecordsTab(body, isActive = () => true) {
  const cur = recCurrentYear();
  const state = { year: Number(AppState.recYear) || cur, filter: 'all', cache: new Map(), items: [] };
  state.items = await recLoadYear(state.year);
  if (!isActive()) return;
  state.cache.set(state.year, state.items);

  body.innerHTML = `<div id="rec-root">
    <div class="toolbar tt-term-bar">
      <div class="toolbar-left">
        <label for="rec-year" class="u-fs-13 u-semibold">ปีการศึกษา</label>
        <select id="rec-year" class="gs-select"></select>
        <div class="theme-seg" id="rec-filter" role="group" aria-label="ประเภท">
          <button type="button" class="theme-opt" data-f="all" aria-pressed="true">ทั้งหมด</button>
          ${REC_TYPES.map(([k, label]) => `<button type="button" class="theme-opt" data-f="${k}" aria-pressed="false">${label}</button>`).join('')}
        </div>
      </div>
      <button type="button" class="btn btn-primary btn-sm" id="rec-add-btn">+ เพิ่มรายการ</button>
    </div>
    <div class="tt-stats rec-stats" id="rec-stats"></div>
    <div class="rec-grid" id="rec-grid"></div>
  </div>`;
  const root = body.querySelector('#rec-root');

  const yearEl = body.querySelector('#rec-year'), filterEl = body.querySelector('#rec-filter'), gridEl = body.querySelector('#rec-grid');
  initNavPill(filterEl, '.theme-opt', 'seg-pill', { activeSel: '[aria-pressed="true"]', watch: true });

  const drawYears = () => {
    const years = new Set([state.year]);
    for (let y = cur + 1; y > cur - REC_YEAR_SPAN; y--) years.add(y);
    yearEl.innerHTML = [...years].sort((a, b) => b - a).map(y => `<option value="${y}"${y === state.year ? ' selected' : ''}>${y}</option>`).join('');
  };
  const redraw = () => {
    body.querySelector('#rec-stats').innerHTML = recStatsHtml(state.items);
    filterEl.querySelectorAll('[data-f]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.f === state.filter)));
    const list = state.items.filter(r => state.filter === 'all' || r.type === state.filter);
    gridEl.innerHTML = list.length ? list.map(recCardHtml).join('')
      : `<div class="card"><div class="empty-state">${state.items.length ? 'ไม่มีรายการในประเภทนี้' : `ยังไม่มีรายการของปีการศึกษา ${state.year}<br><button type="button" class="btn btn-primary btn-sm u-mt-12" id="rec-empty-add">+ เพิ่มรายการแรก</button>`}</div></div>`;
  };
  const setYear = async year => {
    state.year = year; AppState.recYear = year;
    drawYears();
    if (state.cache.has(year)) state.items = state.cache.get(year);
    else {
      state.items = [];
      showLoading('list', gridEl);
      try { state.items = await recLoadYear(year); state.cache.set(year, state.items); } catch (err) {
        console.error(err); showToast('โหลดรายการไม่สำเร็จ: ' + (err.message || err), 'error');
      }
      if (!isActive() || state.year !== year) return;
      clearLoading(gridEl);
    }
    redraw();
  };

  // แทรก/แทนที่รายการในรายการของปีนั้น (รวมปีที่ยังไม่เคยเปิด = ข้าม ให้โหลดสดตอนเปิด)
  const putLocal = item => {
    const list = state.cache.get(item.year);
    if (list) { const i = list.findIndex(r => r.id === item.id); if (i >= 0) list[i] = item; else list.push(item); list.sort(recNewestFirst); }
  };
  const dropLocal = (id, year) => {
    const list = state.cache.get(year);
    if (list) { const i = list.findIndex(r => r.id === id); if (i >= 0) list.splice(i, 1); }
  };
  const refreshView = () => { state.items = state.cache.get(state.year) || []; redraw(); };

  // บันทึกแบบ optimistic: อัปเดตจอก่อน เขียน Firestore ทีหลัง (ออฟไลน์เข้าคิวเอง) — พลาดก็คืนค่าเดิม
  const commitItem = async item => {
    const before = [...state.cache.values()].flat().find(r => r.id === item.id) || null;
    if (before) dropLocal(before.id, before.year);
    putLocal(item);
    if (item.year !== state.year) { showToast(`รายการอยู่ในปีการศึกษา ${item.year} — สลับไปดูให้แล้ว`); await setYear(item.year); } else refreshView();
    const ok = await recSave(item);
    if (!ok) {
      dropLocal(item.id, item.year);
      if (before) putLocal(before);
      refreshView();
    }
    return ok;
  };
  const deleteItem = async item => {
    dropLocal(item.id, item.year); refreshView();
    if (!(await recRemove(item.id))) { putLocal(item); refreshView(); return; }
    // ไฟล์ต้นฉบับลบหลังพ้นช่วง "เลิกทำ" (ถ้ากดเลิกทำ จะไม่ลบ)
    let undone = false;
    const timer = setTimeout(() => { if (!undone) recDeleteFile(item.file && item.file.path); }, 7000);
    islandUndo('ลบรายการแล้ว', async () => {
      if (!(await recSave(item))) throw new Error('กู้คืนไม่สำเร็จ');
      undone = true; clearTimeout(timer);
      putLocal(item);
      if (state.year === item.year) refreshView();
    });
  };
  const ctx = { commitItem, deleteItem, editItem: item => recEditModal(ctx, { item, year: state.year }) };

  yearEl.addEventListener('change', () => setYear(Number(yearEl.value)));
  filterEl.addEventListener('click', ev => {
    const b = ev.target.closest('[data-f]'); if (!b) return;
    state.filter = b.dataset.f; redraw();
  });
  body.querySelector('#rec-add-btn').addEventListener('click', () => recEditModal(ctx, { year: state.year }));
  root.addEventListener('click', ev => {
    if (ev.target.closest('#rec-empty-add')) { recEditModal(ctx, { year: state.year }); return; }
    const card = ev.target.closest('.rec-card'); if (!card) return;
    const item = state.items.find(r => r.id === card.dataset.id);
    if (item) recViewModal(ctx, item);
  });

  drawYears();
  redraw();
}
