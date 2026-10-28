// ==========================================================================
// Score structure: summary boxes (เก็บ/กลางภาค/ปลายภาค)
// + editable list of รายการคะแนนเก็บ, drag to reorder
// + หมวดหมู่หลัก (เช่น ก่อนกลางภาค / หลังกลางภาค) — เลื่อนงานเข้าไปเป็นหมวดหมู่ย่อยได้
//   เก็บรายชื่อหมวดหมู่ไว้ที่ settings/structure และให้แต่ละงานอ้างด้วย groupId
// + หน่วยการเรียนรู้ (units) ซ้อนอยู่ในหมวดหมู่: หมวด → หน่วย → ชิ้นงาน
//   เก็บที่ settings/structure.units = [{ id, name, groupId }] และให้แต่ละงานอ้างด้วย unitId (ไม่ใส่ = งานอยู่ใต้หมวดโดยตรง เหมือนเดิม)
//   งานที่มี unitId ต้องมี groupId ตรงกับหมวดของหน่วยเสมอ
// + วิชาที่ยังไม่เคยบันทึกโครงสร้างจะได้หมวด ก่อนกลางภาค / หลังกลางภาค ให้อัตโนมัติ (วิชาเก่าที่บันทึกไว้แล้วไม่ถูกแตะ)
// ==========================================================================

const MIDTERM_NAME = 'สอบกลางภาค';
const FINAL_NAME = 'สอบปลายภาค';
const DEFAULT_GROUP_NAMES = ['ก่อนกลางภาค', 'หลังกลางภาค']; // หมวดหมู่หลักมาตรฐานของวิชาที่ยังไม่เคยบันทึกโครงสร้าง

// ==========================================================================
// สื่อ/ใบงานที่แนบกับรายการคะแนน (assessment.attachments) — ไว้จำว่าคะแนนช่องนี้ใช้สื่อไหน
//   [{ id, kind: 'link' | 'file', title, url, path?, size?, type? }]  (สูงสุด ATT_MAX_PER_ITEM อันต่อรายการ)
//   link = ลิงก์ (Google Form / Drive / YouTube ฯลฯ) · file = ใบงาน PDF/รูป ใน Firebase Storage: users/{uid}/attachments/{แม่แบบหรือวิชา}/{ไฟล์}
//   แนบที่แม่แบบ → ถูกคัดลอกไปกับโครงสร้างตอนสร้างรายวิชา/อัปเดตตามแม่แบบ (ใช้ไฟล์เดียวกัน)
//   จึง "ไม่ลบไฟล์ใน Storage" ตอนเอาออกจากรายการ — อาจมีรายวิชาอื่นยังอ้างถึงอยู่ (ไฟล์ทั้งหมดถูกลบตอนลบบัญชี: recDeleteAllFiles)
// ==========================================================================
const ATT_MAX_FILE = 10 * 1024 * 1024; // ต้องตรงกับ storage.rules

let _attStoragePromise = null;
function attStorage() {
  if (!_attStoragePromise) {
    _attStoragePromise = new Promise((resolve, reject) => {
      if (firebase.storage) { resolve(firebase.storage()); return; }
      const s = document.createElement('script');
      s.src = 'https://www.gstatic.com/firebasejs/13.0.0/firebase-storage-compat.js';
      s.onload = () => resolve(firebase.storage());
      s.onerror = () => { _attStoragePromise = null; reject(new Error('โหลดตัวส่งไฟล์ไม่สำเร็จ (ต้องมีอินเทอร์เน็ต)')); };
      document.head.appendChild(s);
    });
  }
  return _attStoragePromise;
}

async function attUpload(ownerKey, file, onProgress) {
  const isPdf = file.type === 'application/pdf';
  if (!isPdf && !/^image\//.test(file.type)) throw new Error('แนบได้เฉพาะไฟล์ PDF หรือรูปภาพ');
  if (file.size > ATT_MAX_FILE) throw new Error('ไฟล์ใหญ่เกิน 10 MB');
  const st = await attStorage();
  const ext = ((/\.([a-z0-9]{1,5})$/i.exec(file.name || '') || [])[1] || (isPdf ? 'pdf' : 'jpg')).toLowerCase();
  const path = `users/${AppState.user.uid}/attachments/${ownerKey}/${Date.now()}-${uid4()}.${ext}`;
  const task = st.ref(path).put(file, { contentType: file.type });
  await new Promise((resolve, reject) => task.on('state_changed',
    s => { if (onProgress && s.totalBytes) onProgress(s.bytesTransferred / s.totalBytes); }, reject, resolve));
  const url = await st.ref(path).getDownloadURL();
  return { path, url, size: file.size, type: file.type };
}

// แก้ไขสื่อของรายการ (หน้าโครงสร้าง) — แก้ item.attachments ในหน่วยความจำ แล้วเรียก onChange() ให้หน้าวาดใหม่
// ต้องกด "บันทึกโครงสร้างวิชา" จึงเขียนลง Firestore (ไฟล์ที่อัปโหลดแล้วอยู่ใน Storage ทันที)
function openAttachmentsModal(item, ownerKey, onChange) {
  if (!Array.isArray(item.attachments)) item.attachments = [];
  openModal(`
    <h2>สื่อ / ใบงาน: ${escapeHtml(item.name || 'รายการ')}</h2>
    <div class="modal-sub">แนบลิงก์ (Google Form, Drive, YouTube ฯลฯ) หรืออัปโหลดใบงาน PDF/รูป ไม่เกิน 10 MB ได้สูงสุด ${ATT_MAX_PER_ITEM} อัน — แนบเสร็จแล้วอย่าลืมกด "บันทึกโครงสร้างวิชา"</div>
    <div id="att-list"></div>
    <div class="field">
      <label>เพิ่มลิงก์</label>
      <div class="field-row">
        <div class="field"><input id="att-link-title" maxlength="120" placeholder="ชื่อที่จะแสดง เช่น แบบทดสอบหลังเรียน"></div>
        <div class="field"><input id="att-link-url" inputmode="url" placeholder="https://forms.gle/..."></div>
      </div>
      <button type="button" class="btn btn-ghost btn-sm" id="att-add-link">+ เพิ่มลิงก์</button>
    </div>
    <div class="field">
      <label>อัปโหลดใบงาน (PDF หรือรูป)</label>
      <input type="file" id="att-file" accept="application/pdf,image/*">
      <div class="field-hint" id="att-status"></div>
    </div>
    <div class="modal-actions"><button class="btn btn-primary" id="att-done">เสร็จสิ้น</button></div>
  `);
  const $ = (id) => document.getElementById(id);
  const full = () => item.attachments.length >= ATT_MAX_PER_ITEM;
  const refresh = () => {
    $('att-list').innerHTML = attListHtml(item.attachments, { removable: true });
    $('att-list').querySelectorAll('.att-remove').forEach(btn => btn.addEventListener('click', () => {
      item.attachments = item.attachments.filter(a => a.id !== btn.dataset.attId);
      refresh(); if (onChange) onChange();
    }));
  };
  refresh();

  $('att-add-link').addEventListener('click', () => {
    if (full()) { showToast(`แนบได้สูงสุด ${ATT_MAX_PER_ITEM} อันต่อรายการ`); return; }
    const url = attSafeUrl($('att-link-url').value);
    if (!url) { showToast('กรุณาใส่ลิงก์ที่ถูกต้อง (ขึ้นต้นด้วย https://)'); return; }
    const a = { id: uid4(), kind: 'link', url, title: '' };
    a.title = $('att-link-title').value.trim() || attKind(a);
    item.attachments.push(a);
    $('att-link-title').value = ''; $('att-link-url').value = '';
    refresh(); if (onChange) onChange();
  });

  $('att-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (full()) { showToast(`แนบได้สูงสุด ${ATT_MAX_PER_ITEM} อันต่อรายการ`); e.target.value = ''; return; }
    const status = $('att-status');
    e.target.disabled = true;
    status.textContent = 'กำลังอัปโหลด...';
    try {
      const up = await attUpload(ownerKey, file, p => { status.textContent = `กำลังอัปโหลด ${Math.round(p * 100)}%`; });
      item.attachments.push({ id: uid4(), kind: 'file', title: file.name.slice(0, 120), ...up });
      status.textContent = 'อัปโหลดแล้ว';
      refresh(); if (onChange) onChange();
    } catch (err) {
      console.error(err);
      status.textContent = '';
      showToast(err.message && !/^(storage|Firebase)/i.test(err.message) ? err.message : 'อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      e.target.value = '';
      e.target.disabled = false;
    }
  });
  $('att-done').addEventListener('click', closeModal);
}

// ที่อยู่ข้อมูลของ "วิชา" ที่กำลังแก้โครงสร้าง: แม่แบบวิชา (course.isTemplate) อยู่ที่ courseTemplates
// ส่วนรายวิชาที่เปิดสอนในเทอมอยู่ที่ courses — โครงสร้างย่อยหน้าตาเหมือนกัน (assessments + settings/structure)
function courseBaseRef(course) {
  return db.collection('users').doc(AppState.user.uid)
    .collection(course.isTemplate ? 'courseTemplates' : 'courses').doc(course.id);
}

// opts.readOnly = true → แสดงอย่างเดียว (หน้ารายวิชาของฉัน): แก้โครงสร้างได้เฉพาะที่หน้า "ตั้งค่าโครงสร้างวิชา" (แม่แบบวิชา)
async function renderStructureTab(container, course, opts = {}) {
  const ro = !!opts.readOnly;
  showLoading('cat-sm', container);
  const courseRef = courseBaseRef(course);
  const colRef = courseRef.collection('assessments');
  const structRef = courseRef.collection('settings').doc('structure');
  const [snap, structDoc] = await Promise.all([colRef.orderBy('order', 'asc').get(), structRef.get()]);
  const allItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // หมวดหมู่หลัก: [{ id, name }] เรียงตามลำดับที่แสดง
  // วิชาที่ยังไม่เคยบันทึกหมวดหมู่ (ไม่มีเอกสาร structure หรือไม่มีฟิลด์ groups) → สร้างหมวดมาตรฐานให้ในหน้าจอ (บันทึกลงฐานข้อมูลเมื่อกดบันทึก)
  // วิชาที่เคยบันทึกแล้ว (แม้ groups ว่าง) คงตามเดิม ไม่เติมให้เอง
  const sd = structDoc.exists ? structDoc.data() : null;
  let groups = sd && Array.isArray(sd.groups)
    ? sd.groups.map(g => ({ id: g.id, name: g.name || '' }))
    : DEFAULT_GROUP_NAMES.map(name => ({ id: 'g' + uid4(), name }));
  const validGroup = (gid) => groups.some(g => g.id === gid);

  // หน่วยการเรียนรู้: [{ id, name, groupId }] groupId = null → อยู่ใต้ "ยังไม่จัดหมวดหมู่"
  let units = sd && Array.isArray(sd.units)
    ? sd.units.map(u => ({ id: u.id, name: u.name || '', groupId: validGroup(u.groupId) ? u.groupId : null }))
    : [];
  const unitById = (uid) => units.find(u => u.id === uid);

  let collectItems = allItems.filter(i => i.category === 'collect')
    .map(i => {
      const u = unitById(i.unitId);
      return { ...i, unitId: u ? u.id : null, groupId: u ? u.groupId : (validGroup(i.groupId) ? i.groupId : null) };
    });
  let midterm = allItems.find(i => i.category === 'midterm') || { id: 'new-mid', name: MIDTERM_NAME, max: 20, category: 'midterm' };
  let final = allItems.find(i => i.category === 'final') || { id: 'new-final', name: FINAL_NAME, max: 30, category: 'final' };

  const itemsOf = (gid) => collectItems.filter(i => (i.groupId || null) === gid);            // ทุกงานในหมวด (รวมที่อยู่ในหน่วย)
  const looseOf = (gid) => itemsOf(gid).filter(i => !i.unitId);                                // งานที่อยู่ใต้หมวดโดยตรง
  const unitsOf = (gid) => units.filter(u => (u.groupId || null) === gid);
  const itemsOfUnit = (uid) => collectItems.filter(i => i.unitId === uid);
  // ลำดับแสดงผล: ยังไม่จัดหมวด → แต่ละหมวดตามลำดับหมวด · ในหมวด: งานที่ไม่อยู่หน่วยก่อน แล้วตามด้วยแต่ละหน่วยพร้อมชิ้นงาน
  const displayItems = () => [null, ...groups.map(g => g.id)].flatMap(gid => [...looseOf(gid), ...unitsOf(gid).flatMap(u => itemsOfUnit(u.id))]);
  const sumMax = (items) => items.reduce((s, i) => s + (Number(i.max) || 0), 0);
  const groupLabel = (g) => g.name.trim() || 'หมวดหมู่ (ยังไม่ตั้งชื่อ)';
  const unitLabel = (u) => u.name.trim() || 'หน่วยการเรียนรู้ (ยังไม่ตั้งชื่อ)';

  function collectTotal() { return sumMax(collectItems); }
  function grandTotal() { return collectTotal() + (Number(midterm.max) || 0) + (Number(final.max) || 0); }

  function statText(items, isUnit, plain) {
    return items.length ? `${items.length} ชิ้นงาน · ${sumMax(items)} คะแนน`
      : plain ? 'ไม่มีรายการ'
      : (isUnit ? 'ยังไม่มีชิ้นงาน — กด "+ ชิ้นงาน" หรือลากงานมาวางใต้หน่วยนี้' : 'ยังไม่มีรายการ — ลากงานมาวางใต้หัวข้อนี้ หรือเลือกที่ช่อง "ที่อยู่" ของงาน');
  }

  function draw() {
    const gt = grandTotal();
    const hasGroups = groups.length > 0 || units.length > 0; // มีหมวดหรือหน่วย → แสดงหัวข้อ + ช่อง "ที่อยู่"
    const cols = (hasGroups ? 8 : 7) - (ro ? (hasGroups ? 3 : 2) : 0); // โหมดอ่านอย่างเดียวไม่มีคอลัมน์ลาก/ลบ/ที่อยู่
    const ordered = displayItems();

    // ตัวเลือก "ที่อยู่" ของงาน: ยังไม่จัดหมวด / หมวด / หน่วยในหมวด (ค่า '' | 'g:<id>' | 'u:<id>')
    const locationOptions = (it) => {
      const cur = it.unitId ? 'u:' + it.unitId : it.groupId ? 'g:' + it.groupId : '';
      const opt = (val, text) => `<option value="${val}" ${cur === val ? 'selected' : ''}>${escapeHtml(text)}</option>`;
      const unitOpts = (gid) => unitsOf(gid).map(u => opt('u:' + u.id, '\u3000└ ' + unitLabel(u))).join('');
      return opt('', '— ยังไม่จัดหมวด —') + unitOpts(null)
        + groups.map(g => opt('g:' + g.id, groupLabel(g)) + unitOpts(g.id)).join('');
    };

    // ----- โหมดอ่านอย่างเดียว -----
    const attBtnHtml = (id, it) => {
      const n = (it.attachments || []).length;
      if (ro && !n) return '';
      return `<button type="button" class="btn btn-ghost btn-sm att-btn" data-id="${id}" title="${ro ? 'ดูลิงก์/ใบงาน' : 'แนบลิงก์/ใบงาน'}">${icon('clip')} ${n || 'แนบ'}</button>`;
    };
    const itemRowRo = (it, idx) => `
      <tr data-type="item" data-id="${it.id}">
        <td>${idx + 1}</td>
        <td${it.unitId ? ' style="padding-left:28px"' : ''}>${escapeHtml(it.name || '—')}</td>
        <td class="muted">${escapeHtml(it.detail || '')}</td>
        <td class="att-col">${attBtnHtml(it.id, it)}</td>
        <td class="num-col">${Number(it.max) || 0}</td>
      </tr>`;

    const itemRowEdit = (it, idx) => `
      <tr draggable="false" data-type="item" data-id="${it.id}">
        <td class="handle-col" title="ลากเพื่อเรียงลำดับ / ย้ายหมวดหมู่">☰</td>
        <td>${idx + 1}</td>
        <td><input class="row-name" data-id="${it.id}" data-field="name" value="${escapeHtml(it.name)}" placeholder="ชื่อรายการ"></td>
        <td><input class="row-detail" data-id="${it.id}" data-field="detail" value="${escapeHtml(it.detail || '')}" placeholder="รายละเอียด/จุดประสงค์ (ถ้ามี)"></td>
        <td class="att-col"><button type="button" class="btn btn-ghost btn-sm att-btn" data-id="${it.id}" title="แนบลิงก์/ใบงาน">${icon('clip')} ${(it.attachments || []).length || 'แนบ'}</button></td>
        ${hasGroups ? `<td class="group-col">
          <select class="row-group" data-id="${it.id}" aria-label="หมวดหมู่/หน่วยของรายการนี้">
            ${locationOptions(it)}
          </select>
        </td>` : ''}
        <td class="num-col"><input class="row-max" type="number" data-id="${it.id}" value="${it.max}"></td>
        <td class="del-col"><button class="btn btn-danger-ghost btn-sm del-item" data-id="${it.id}">ลบ</button></td>
      </tr>`;
    const itemRow = (it, idx) => ro ? itemRowRo(it, idx) : itemRowEdit(it, idx);

    const ungroupedHeader = () => ro ? `
      <tr class="group-row ungrouped" data-type="ungrouped"><td colspan="${cols}">
        <div class="group-bar">
          <span class="group-title muted">ยังไม่จัดหมวดหมู่</span>
          <span class="group-stat">${statText(itemsOf(null), false, true)}</span>
        </div>
      </td></tr>` : `
      <tr class="group-row ungrouped" data-type="ungrouped"><td colspan="${cols}">
        <div class="group-bar">
          <span class="group-title muted">ยังไม่จัดหมวดหมู่</span>
          <span class="group-stat" data-stat-for="">${statText(itemsOf(null))}</span>
          <span class="group-actions"><button class="btn btn-ghost btn-sm unit-new" data-gid="">+ หน่วยการเรียนรู้</button><button class="btn btn-ghost btn-sm group-add" data-gid="">+ เพิ่มรายการ</button></span>
        </div>
      </td></tr>`;

    const groupHeader = (g, gi) => ro ? `
      <tr class="group-row" data-type="group" data-gid="${g.id}"><td colspan="${cols}">
        <div class="group-bar">
          <span class="group-icon">${icon('folder')}</span>
          <span class="group-title">${escapeHtml(groupLabel(g))}</span>
          <span class="group-stat">${statText(itemsOf(g.id), false, true)}</span>
        </div>
      </td></tr>` : `
      <tr class="group-row" data-type="group" data-gid="${g.id}"><td colspan="${cols}">
        <div class="group-bar">
          <span class="group-icon">${icon('folder')}</span>
          <input class="group-name" data-gid="${g.id}" value="${escapeHtml(g.name)}" placeholder="ชื่อหมวดหมู่ เช่น ก่อนกลางภาค" aria-label="ชื่อหมวดหมู่">
          <span class="group-stat" data-stat-for="${g.id}">${statText(itemsOf(g.id))}</span>
          <span class="group-actions">
            <button class="btn btn-ghost btn-sm unit-new" data-gid="${g.id}">+ หน่วยการเรียนรู้</button>
            <button class="btn btn-ghost btn-sm group-add" data-gid="${g.id}">+ เพิ่มรายการ</button>
            <button class="btn btn-ghost btn-sm group-up" data-gid="${g.id}" title="เลื่อนหมวดขึ้น" ${gi === 0 ? 'disabled' : ''}>↑</button>
            <button class="btn btn-ghost btn-sm group-down" data-gid="${g.id}" title="เลื่อนหมวดลง" ${gi === groups.length - 1 ? 'disabled' : ''}>↓</button>
            <button class="btn btn-danger-ghost btn-sm group-del" data-gid="${g.id}" title="ลบหมวดหมู่ (งานในหมวดจะไม่ถูกลบ)">ลบหมวด</button>
          </span>
        </div>
      </td></tr>`;

    const unitHeader = (u, ui, siblings) => ro ? `
      <tr class="group-row unit-row" data-type="unit" data-uid="${u.id}" data-gid="${u.groupId || ''}"><td colspan="${cols}">
        <div class="group-bar unit-bar">
          <span class="group-icon">${icon('folder')}</span>
          <span class="group-title">${escapeHtml(unitLabel(u))}</span>
          <span class="group-stat unit-stat">${statText(itemsOfUnit(u.id), true, true)}</span>
        </div>
      </td></tr>` : `
      <tr class="group-row unit-row" data-type="unit" data-uid="${u.id}" data-gid="${u.groupId || ''}"><td colspan="${cols}">
        <div class="group-bar unit-bar">
          <span class="group-icon">${icon('folder')}</span>
          <input class="unit-name" data-uid="${u.id}" value="${escapeHtml(u.name)}" placeholder="ชื่อหน่วยการเรียนรู้ เช่น หน่วยที่ 1" aria-label="ชื่อหน่วยการเรียนรู้">
          <span class="group-stat unit-stat" data-unit-stat-for="${u.id}">${statText(itemsOfUnit(u.id), true)}</span>
          <span class="group-actions">
            <button class="btn btn-ghost btn-sm unit-add" data-uid="${u.id}">+ ชิ้นงาน</button>
            <button class="btn btn-ghost btn-sm unit-up" data-uid="${u.id}" title="เลื่อนหน่วยขึ้น" ${ui === 0 ? 'disabled' : ''}>↑</button>
            <button class="btn btn-ghost btn-sm unit-down" data-uid="${u.id}" title="เลื่อนหน่วยลง" ${ui === siblings - 1 ? 'disabled' : ''}>↓</button>
            <button class="btn btn-danger-ghost btn-sm unit-del" data-uid="${u.id}" title="ลบหน่วย (ชิ้นงานในหน่วยจะไม่ถูกลบ)">ลบหน่วย</button>
          </span>
        </div>
      </td></tr>`;

    // เรียงแถว: ไม่มีหมวด → แถวงานเรียงตามปกติ / มีหมวด → หัวข้อหมวด + งานของหมวดนั้น (งานใต้หมวดโดยตรงก่อน แล้วตามด้วยแต่ละหน่วย)
    let bodyRows = '';
    if (!hasGroups) {
      bodyRows = ordered.map((it, i) => itemRow(it, i)).join('');
    } else {
      let n = 0;
      const unitBlocks = (gid) => { const us = unitsOf(gid); return us.map((u, ui) => unitHeader(u, ui, us.length) + itemsOfUnit(u.id).map(it => itemRow(it, n++)).join('')).join(''); };
      bodyRows += ungroupedHeader() + looseOf(null).map(it => itemRow(it, n++)).join('') + unitBlocks(null);
      groups.forEach((g, gi) => {
        bodyRows += groupHeader(g, gi) + looseOf(g.id).map(it => itemRow(it, n++)).join('') + unitBlocks(g.id);
      });
    }

    const quickNames = ['ก่อนกลางภาค', 'หลังกลางภาค'].filter(n => !groups.some(g => g.name.trim() === n));

    const roNotice = !ro ? '' : `
      <div class="u-note u-flex u-items-center u-gap-8 u-wrap u-mb-12">
        <span>โครงสร้างคะแนนแสดงเพื่อดูอย่างเดียว — แก้ไขได้เฉพาะที่หน้า "ตั้งค่าโครงสร้างวิชา"</span>
        ${course.templateId ? '<button type="button" class="btn btn-primary btn-sm u-ml-auto" id="struct-ro-edit">ไปแก้ที่ตั้งค่าโครงสร้างวิชา</button>' : ''}
      </div>`;

    container.innerHTML = `
      ${roNotice}
      <div class="struct-summary-row">
        <div class="struct-summary-box readonly">
          <div class="lbl">รวมคะแนนเก็บ</div>
          <input type="text" value="${collectTotal()}" readonly>
        </div>
        <div class="struct-summary-box">
          <div class="lbl">สอบกลางภาค</div>
          <input type="number" id="mid-max-input" value="${midterm.max}" ${ro ? 'readonly' : ''}>
          ${attBtnHtml('mid', midterm)}
        </div>
        <div class="struct-summary-box">
          <div class="lbl">สอบปลายภาค</div>
          <input type="number" id="final-max-input" value="${final.max}" ${ro ? 'readonly' : ''}>
          ${attBtnHtml('final', final)}
        </div>
      </div>

      <div class="card">
        <div class="struct-panel-header u-flex u-between">
          <span>รายละเอียดคะแนนเก็บ (งาน/ชิ้นงาน/แบบฝึกหัด)</span>
          <span class="u-semibold ${gt === 100 ? 'is-ok' : 'is-bad'}">รวมทั้งหมด ${gt} / 100</span>
        </div>
        <div class="card-pad">
          ${ro ? '' : `<div class="group-creator">
            <div class="group-creator-label">หมวดหมู่หลัก <span>แต่ละหมวดเพิ่ม "หน่วยการเรียนรู้" แล้วสร้างชิ้นงานในหน่วยได้ · ลากแถวงานหรือเลือกที่ช่อง "ที่อยู่" เพื่อย้าย</span></div>
            <div class="group-creator-row">
              <input id="new-group-name" placeholder="ชื่อหมวดหมู่ เช่น ก่อนกลางภาค" maxlength="60">
              <button class="btn btn-primary btn-sm" id="add-group-btn">+ เพิ่มหมวดหมู่</button>
            </div>
            ${quickNames.length ? `<div class="group-quick">ตัวอย่าง: ${quickNames.map(n => `<button type="button" class="chip quick-group" data-name="${n}">+ ${n}</button>`).join('')}</div>` : ''}
          </div>`}

          ${ordered.length === 0 && !hasGroups ? `<div class="empty-state u-p-20">ยังไม่มีรายการคะแนนเก็บ</div>` : `
            <div class="struct-table-wrap">
            <table class="struct-table ${hasGroups ? 'has-groups' : ''}">
              <thead><tr>
                ${ro ? '' : '<th class="u-w-24"></th>'}
                <th>#</th>
                <th>รหัส/ชื่อรายการ</th>
                <th>รายละเอียด / จุดประสงค์</th>
                <th class="att-col">สื่อ/ใบงาน</th>
                ${hasGroups && !ro ? `<th class="group-col">ที่อยู่ (หมวด / หน่วย)</th>` : ''}
                <th class="num-col">คะแนนเก็บ</th>
                ${ro ? '' : '<th class="del-col"></th>'}
              </tr></thead>
              <tbody id="struct-tbody">${bodyRows}</tbody>
            </table>
            </div>
          `}
          ${ro ? '' : `<div class="u-mt-12 u-flex u-gap-8">
            <button class="btn btn-ghost btn-sm" id="add-item-btn">+ เพิ่มแถว</button>
            <button class="btn btn-primary u-ml-auto" id="save-structure-btn">บันทึกโครงสร้างวิชา</button>
          </div>`}
        </div>
      </div>
    `;

    if (ro) {
      container.querySelectorAll('.att-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const it = btn.dataset.id === 'mid' ? midterm : btn.dataset.id === 'final' ? final : collectItems.find(x => x.id === btn.dataset.id);
          if (it) openAttachmentsViewer(it);
        });
      });
      container.querySelector('#struct-ro-edit')?.addEventListener('click', () => {
        AppState.structureOpenOnce = course.templateId; // app.js อ่านค่านี้ครั้งเดียวแล้วล้าง → เปิดแม่แบบวิชานี้ตรง ๆ
        AppState.structureTab = 'score';
        navigate('structure-page');
      });
      return;
    }

    document.getElementById('mid-max-input').addEventListener('input', (e) => {
      midterm.max = Number(e.target.value) || 0;
      updateTotals();
    });
    document.getElementById('final-max-input').addEventListener('input', (e) => {
      final.max = Number(e.target.value) || 0;
      updateTotals();
    });
    document.getElementById('add-item-btn').addEventListener('click', () => {
      collectItems.push({ id: 'new-' + uid4(), name: '', max: 10, detail: '', category: 'collect', groupId: null, unitId: null });
      draw();
    });

    // ----- หมวดหมู่หลัก -----
    const newGroupInput = document.getElementById('new-group-name');
    function addGroup(name) {
      name = (name || '').trim();
      if (!name) { newGroupInput.focus(); return; }
      if (groups.some(g => g.name.trim() === name)) { showToast('มีหมวดหมู่ชื่อนี้อยู่แล้ว'); return; }
      groups.push({ id: 'g' + uid4(), name });
      draw();
      document.getElementById('new-group-name')?.focus();
    }
    document.getElementById('add-group-btn').addEventListener('click', () => addGroup(newGroupInput.value));
    newGroupInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addGroup(newGroupInput.value); } });
    container.querySelectorAll('.quick-group').forEach(b => b.addEventListener('click', () => addGroup(b.dataset.name)));

    container.querySelectorAll('.group-name').forEach(inp => {
      inp.addEventListener('input', () => {
        const g = groups.find(x => x.id === inp.dataset.gid);
        g.name = inp.value;
        // อัปเดตชื่อในช่องเลือกหมวดของทุกแถวทันที โดยไม่ redraw (กัน focus หลุดระหว่างพิมพ์)
        container.querySelectorAll(`select.row-group option[value="g:${g.id}"]`).forEach(o => { o.textContent = groupLabel(g); });
      });
    });
    container.querySelectorAll('.group-add').forEach(btn => {
      btn.addEventListener('click', () => {
        collectItems.push({ id: 'new-' + uid4(), name: '', max: 10, detail: '', category: 'collect', groupId: btn.dataset.gid || null, unitId: null });
        draw();
      });
    });
    container.querySelectorAll('.group-up, .group-down').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = groups.findIndex(g => g.id === btn.dataset.gid);
        const j = btn.classList.contains('group-up') ? i - 1 : i + 1;
        if (j < 0 || j >= groups.length) return;
        [groups[i], groups[j]] = [groups[j], groups[i]];
        draw();
      });
    });
    container.querySelectorAll('.group-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const g = groups.find(x => x.id === btn.dataset.gid);
        const n = itemsOf(g.id).length;
        if ((n > 0 || unitsOf(g.id).length > 0) && !confirm(`ลบหมวด "${groupLabel(g)}" ?\nงาน ${n} รายการและหน่วยในหมวดนี้จะไม่ถูกลบ แต่จะกลับไปอยู่ที่ "ยังไม่จัดหมวดหมู่"`)) return;
        collectItems.forEach(i => { if (i.groupId === g.id) i.groupId = null; }); // งานในหน่วยของหมวดนี้ยังอยู่ในหน่วยเดิม (หน่วยย้ายไป "ยังไม่จัดหมวด")
        units.forEach(u => { if (u.groupId === g.id) u.groupId = null; });
        groups = groups.filter(x => x.id !== g.id);
        draw();
      });
    });
    container.querySelectorAll('select.row-group').forEach(sel => {
      sel.addEventListener('change', () => {
        const it = collectItems.find(x => x.id === sel.dataset.id);
        const [kind, id] = sel.value.split(':');
        if (kind === 'u' && unitById(id)) { it.unitId = id; it.groupId = unitById(id).groupId; }
        else { it.unitId = null; it.groupId = kind === 'g' && validGroup(id) ? id : null; }
        draw();
      });
    });

    // ----- หน่วยการเรียนรู้ -----
    container.querySelectorAll('.unit-new').forEach(btn => {
      btn.addEventListener('click', () => {
        units.push({ id: 'u' + uid4(), name: '', groupId: btn.dataset.gid || null });
        draw();
        const inputs = container.querySelectorAll('.unit-name');
        inputs[inputs.length - 1]?.focus();
      });
    });
    container.querySelectorAll('.unit-name').forEach(inp => {
      inp.addEventListener('input', () => {
        const u = unitById(inp.dataset.uid);
        u.name = inp.value;
        container.querySelectorAll(`select.row-group option[value="u:${u.id}"]`).forEach(o => { o.textContent = '\u3000└ ' + unitLabel(u); });
      });
    });
    container.querySelectorAll('.unit-add').forEach(btn => {
      btn.addEventListener('click', () => {
        const u = unitById(btn.dataset.uid);
        collectItems.push({ id: 'new-' + uid4(), name: '', max: 10, detail: '', category: 'collect', groupId: u.groupId, unitId: u.id });
        draw();
      });
    });
    container.querySelectorAll('.unit-up, .unit-down').forEach(btn => {
      btn.addEventListener('click', () => {
        const u = unitById(btn.dataset.uid);
        const sib = unitsOf(u.groupId || null);
        const k = sib.indexOf(u) + (btn.classList.contains('unit-up') ? -1 : 1);
        if (k < 0 || k >= sib.length) return;
        const a = units.indexOf(u), b = units.indexOf(sib[k]);
        [units[a], units[b]] = [units[b], units[a]];
        draw();
      });
    });
    container.querySelectorAll('.unit-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const u = unitById(btn.dataset.uid);
        const n = itemsOfUnit(u.id).length;
        if (n > 0 && !confirm(`ลบหน่วย "${unitLabel(u)}" ?\nชิ้นงาน ${n} รายการในหน่วยนี้จะไม่ถูกลบ แต่จะอยู่ใต้หมวดโดยตรง`)) return;
        collectItems.forEach(i => { if (i.unitId === u.id) i.unitId = null; });
        units = units.filter(x => x.id !== u.id);
        draw();
      });
    });

    // ----- สื่อ/ใบงานที่แนบ -----
    container.querySelectorAll('.att-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const it = btn.dataset.id === 'mid' ? midterm : btn.dataset.id === 'final' ? final : collectItems.find(x => x.id === btn.dataset.id);
        if (it) openAttachmentsModal(it, course.id, draw);
      });
    });

    // ----- แถวงาน -----
    container.querySelectorAll('.row-name, .row-detail').forEach(inp => {
      inp.addEventListener('input', () => {
        const it = collectItems.find(x => x.id === inp.dataset.id);
        it[inp.dataset.field] = inp.value;
      });
    });
    container.querySelectorAll('.row-max').forEach(inp => {
      inp.addEventListener('input', () => {
        collectItems.find(x => x.id === inp.dataset.id).max = Number(inp.value) || 0;
        updateTotals();
      });
    });
    container.querySelectorAll('.del-item').forEach(btn => {
      btn.addEventListener('click', () => {
        collectItems = collectItems.filter(x => x.id !== btn.dataset.id);
        draw();
      });
    });

    const tbody = container.querySelector('#struct-tbody');
    if (tbody) setupDragReorder(tbody, collectItems, draw);

    document.getElementById('save-structure-btn').addEventListener('click', () =>
      saveStructure(course, displayItems(), groups, units, midterm, final, colRef, structRef));
  }

  function updateTotals() {
    // อัปเดตเฉพาะตัวเลขรวม โดยไม่ redraw ทั้งหมด เพื่อไม่ให้เสีย focus ของช่องที่กำลังพิมพ์
    const gt = grandTotal();
    const readonlyBox = container.querySelector('.struct-summary-box.readonly input');
    if (readonlyBox) readonlyBox.value = collectTotal();
    const header = container.querySelector('.struct-panel-header span:last-child');
    if (header) {
      header.textContent = `รวมทั้งหมด ${gt} / 100`;
      header.classList.toggle('is-ok', gt === 100);
      header.classList.toggle('is-bad', gt !== 100);
    }
    container.querySelectorAll('.group-stat:not(.unit-stat)').forEach(el => {
      el.textContent = statText(itemsOf(el.dataset.statFor || null));
    });
    container.querySelectorAll('.unit-stat').forEach(el => {
      el.textContent = statText(itemsOfUnit(el.dataset.unitStatFor), true);
    });
  }

  draw();
}

// ลากแถวงานเพื่อเรียงลำดับ — และลากข้ามหัวข้อหมวดหมู่เพื่อย้ายไปเป็นหมวดย่อยของหมวดนั้น
// (หมวดของแถว = หัวข้อหมวดที่อยู่เหนือแถวนั้นที่สุดใน DOM)
// ลากได้เฉพาะตอนจับที่ไอคอน ☰ เพื่อไม่ให้ไปรบกวนการคลิก/เลือกข้อความในช่องกรอก
function setupDragReorder(tbodyEl, items, onChange) {
  let dragEl = null;

  tbodyEl.querySelectorAll('tr[data-type="item"]').forEach(el => {
    const handle = el.querySelector('.handle-col');
    handle.addEventListener('mousedown', () => { el.draggable = true; });
    handle.addEventListener('mouseup', () => { el.draggable = false; });
    el.addEventListener('dragstart', (e) => {
      dragEl = el;
      el.classList.add('dragging');
      if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', el.dataset.id); }
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      el.draggable = false;
      dragEl = null;
      tbodyEl.querySelectorAll('.drop-target').forEach(x => x.classList.remove('drop-target'));
      reorderFromDom(tbodyEl, items);
      if (onChange) onChange();
    });
  });

  tbodyEl.addEventListener('dragover', (e) => {
    if (!dragEl) return;
    e.preventDefault();
    let after = getDragAfterElement(tbodyEl, e.clientY);
    // แถว "ยังไม่จัดหมวดหมู่" อยู่บนสุดเสมอ — ห้ามวางงานไว้เหนือมัน
    if (after && after.dataset.type === 'ungrouped') after = after.nextElementSibling;
    if (after == null) tbodyEl.appendChild(dragEl);
    else if (after !== dragEl) tbodyEl.insertBefore(dragEl, after);
    highlightDropGroup(tbodyEl, dragEl);
  });
}
function highlightDropGroup(tbodyEl, dragEl) {
  tbodyEl.querySelectorAll('.group-row.drop-target').forEach(x => x.classList.remove('drop-target'));
  let prev = dragEl.previousElementSibling;
  while (prev && prev.dataset.type === 'item') prev = prev.previousElementSibling;
  if (prev) prev.classList.add('drop-target');
}
function getDragAfterElement(container, y) {
  const els = [...container.querySelectorAll('tr:not(.dragging)')];
  return els.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: -Infinity }).element;
}
function reorderFromDom(tbodyEl, items) {
  // อ่านลำดับ หมวด และหน่วยจาก DOM: หัวข้อหมวดกำหนด groupId · หัวข้อหน่วยกำหนด unitId (และหมวดของหน่วย) ให้แถวงานที่ตามมา
  let currentGroup = null, currentUnit = null;
  const ordered = [];
  tbodyEl.querySelectorAll('tr').forEach(tr => {
    if (tr.dataset.type === 'ungrouped') { currentGroup = null; currentUnit = null; }
    else if (tr.dataset.type === 'group') { currentGroup = tr.dataset.gid; currentUnit = null; }
    else if (tr.dataset.type === 'unit') { currentUnit = tr.dataset.uid; currentGroup = tr.dataset.gid || null; }
    else if (tr.dataset.type === 'item') {
      const it = items.find(x => x.id === tr.dataset.id);
      if (it) { it.groupId = currentGroup; it.unitId = currentUnit; ordered.push(it); }
    }
  });
  // แก้ array เดิมในที่ (closure ของ renderStructureTab ถืออ้างอิงอยู่)
  const rest = items.filter(i => !ordered.includes(i));
  items.length = 0;
  items.push(...ordered, ...rest);
}

async function saveStructure(course, collectItems, groups, units, midterm, final, colRef, structRef) {
  const existingSnap = await colRef.get();
  const batch = db.batch();

  // รักษา id เดิมของรายการคะแนนไว้ (ไม่ลบแล้วสร้างใหม่) — คะแนนนักเรียนอ้างอิงด้วย id ของรายการ
  // ถ้า id เปลี่ยนทุกครั้งที่บันทึก คะแนนที่กรอกไว้จะหลุดจากรายการ
  const isNew = (id) => !id || String(id).startsWith('new-');
  const refFor = (it) => isNew(it.id) ? colRef.doc() : colRef.doc(it.id);
  const keepIds = new Set();
  const write = (it, data) => {
    const ref = refFor(it);
    keepIds.add(ref.id);
    batch.set(ref, data);
  };

  const groupIds = new Set(groups.map(g => g.id));
  const unitGroup = new Map(units.map(u => [u.id, groupIds.has(u.groupId) ? u.groupId : null]));
  collectItems.forEach((it, idx) => {
    const inUnit = unitGroup.has(it.unitId); // งานในหน่วย: หมวดต้องตรงกับหมวดของหน่วยเสมอ
    write(it, {
      name: it.name || `รายการที่ ${idx + 1}`,
      max: Number(it.max) || 0,
      detail: it.detail || '',
      attachments: cleanAttachments(it.attachments),
      category: 'collect',
      groupId: inUnit ? unitGroup.get(it.unitId) : (groupIds.has(it.groupId) ? it.groupId : null),
      unitId: inUnit ? it.unitId : null,
      order: idx,
    });
  });
  write(midterm, { name: midterm.name || MIDTERM_NAME, max: Number(midterm.max) || 0, category: 'midterm', attachments: cleanAttachments(midterm.attachments), order: collectItems.length });
  write(final, { name: final.name || FINAL_NAME, max: Number(final.max) || 0, category: 'final', attachments: cleanAttachments(final.attachments), order: collectItems.length + 1 });

  existingSnap.docs.forEach(d => { if (!keepIds.has(d.id)) batch.delete(d.ref); });

  batch.set(structRef, {
    groups: groups.map((g, i) => ({ id: g.id, name: g.name.trim() || `หมวดหมู่ ${i + 1}` })),
    units: units.map((u, i) => ({ id: u.id, name: u.name.trim() || `หน่วยที่ ${i + 1}`, groupId: groupIds.has(u.groupId) ? u.groupId : null })),
  });

  await batch.commit();
  invalidateCourseData(course.id);
  showToast(course.isTemplate ? 'บันทึกแม่แบบโครงสร้างวิชาสำเร็จ' : 'บันทึกโครงสร้างวิชาสำเร็จ');
  // หน้าแก้แม่แบบมีสองแท็บ — ถ้าระหว่างบันทึกผู้ใช้สลับไปแท็บคำอธิบายรายวิชาแล้ว ไม่วาดโครงสร้างทับ
  const target = document.getElementById('course-tab-body') || document.getElementById('structure-page-body');
  if (target && !(course.isTemplate && AppState.structureTab === 'desc')) renderStructureTab(target, course);
  // แก้แม่แบบ → ถามว่าจะอัปเดตรายวิชาของเทอมที่เปิดไปแล้วตามแม่แบบด้วยไหม (ไม่ถามถ้ายังไม่เคยเปิดสอน)
  if (course.isTemplate) offerTemplateSync(course);
}
