// ==========================================================================
// Score structure: summary boxes (เก็บ/กลางภาค/ปลายภาค)
// + editable list of รายการคะแนนเก็บ, drag to reorder
// + หมวดหมู่หลัก (เช่น ก่อนกลางภาค / หลังกลางภาค) — เลื่อนงานเข้าไปเป็นหมวดหมู่ย่อยได้
//   เก็บรายชื่อหมวดหมู่ไว้ที่ settings/structure และให้แต่ละงานอ้างด้วย groupId
// ==========================================================================

const CATEGORY_LABELS = { collect: 'คะแนนเก็บ', midterm: 'กลางภาค', final: 'ปลายภาค' };
const MIDTERM_NAME = 'สอบกลางภาค';
const FINAL_NAME = 'สอบปลายภาค';

async function renderStructureTab(container, course) {
  container.innerHTML = `<div class="empty-state">กำลังโหลด...</div>`;
  const uid = AppState.user.uid;
  const courseRef = db.collection('users').doc(uid).collection('courses').doc(course.id);
  const colRef = courseRef.collection('assessments');
  const structRef = courseRef.collection('settings').doc('structure');
  const [snap, structDoc] = await Promise.all([colRef.orderBy('order', 'asc').get(), structRef.get()]);
  const allItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // หมวดหมู่หลัก: [{ id, name }] เรียงตามลำดับที่แสดง
  let groups = structDoc.exists ? (structDoc.data().groups || []).map(g => ({ id: g.id, name: g.name || '' })) : [];
  const validGroup = (gid) => groups.some(g => g.id === gid);

  let collectItems = allItems.filter(i => i.category === 'collect')
    .map(i => ({ ...i, groupId: validGroup(i.groupId) ? i.groupId : null }));
  let midterm = allItems.find(i => i.category === 'midterm') || { id: 'new-mid', name: MIDTERM_NAME, max: 20, category: 'midterm' };
  let final = allItems.find(i => i.category === 'final') || { id: 'new-final', name: FINAL_NAME, max: 30, category: 'final' };

  const itemsOf = (gid) => collectItems.filter(i => (i.groupId || null) === gid);
  // ลำดับแสดงผล: งานที่ยังไม่จัดหมวด → แต่ละหมวดตามลำดับหมวด
  const displayItems = () => [...itemsOf(null), ...groups.flatMap(g => itemsOf(g.id))];
  const sumMax = (items) => items.reduce((s, i) => s + (Number(i.max) || 0), 0);
  const groupLabel = (g) => g.name.trim() || 'หมวดหมู่ (ยังไม่ตั้งชื่อ)';

  function collectTotal() { return sumMax(collectItems); }
  function grandTotal() { return collectTotal() + (Number(midterm.max) || 0) + (Number(final.max) || 0); }

  function statText(items) {
    return items.length ? `${items.length} รายการ · ${sumMax(items)} คะแนน` : 'ยังไม่มีรายการ — ลากงานมาวางใต้หัวข้อนี้ หรือเลือกหมวดที่ช่อง "หมวดหมู่" ของงาน';
  }

  function draw() {
    const gt = grandTotal();
    const hasGroups = groups.length > 0;
    const cols = hasGroups ? 7 : 6;
    const ordered = displayItems();

    const itemRow = (it, idx) => `
      <tr draggable="false" data-type="item" data-id="${it.id}">
        <td class="handle-col" title="ลากเพื่อเรียงลำดับ / ย้ายหมวดหมู่">☰</td>
        <td>${idx + 1}</td>
        <td><input class="row-name" data-id="${it.id}" data-field="name" value="${escapeHtml(it.name)}" placeholder="ชื่อรายการ"></td>
        <td><input class="row-detail" data-id="${it.id}" data-field="detail" value="${escapeHtml(it.detail || '')}" placeholder="รายละเอียด/จุดประสงค์ (ถ้ามี)"></td>
        ${hasGroups ? `<td class="group-col">
          <select class="row-group" data-id="${it.id}" aria-label="หมวดหมู่ของรายการนี้">
            <option value="">— ยังไม่จัดหมวด —</option>
            ${groups.map(g => `<option value="${g.id}" ${it.groupId === g.id ? 'selected' : ''}>${escapeHtml(groupLabel(g))}</option>`).join('')}
          </select>
        </td>` : ''}
        <td class="num-col"><input class="row-max" type="number" data-id="${it.id}" value="${it.max}"></td>
        <td class="del-col"><button class="btn btn-danger-ghost btn-sm del-item" data-id="${it.id}">ลบ</button></td>
      </tr>`;

    const ungroupedHeader = () => `
      <tr class="group-row ungrouped" data-type="ungrouped"><td colspan="${cols}">
        <div class="group-bar">
          <span class="group-title muted">ยังไม่จัดหมวดหมู่</span>
          <span class="group-stat" data-stat-for="">${statText(itemsOf(null))}</span>
          <span class="group-actions"><button class="btn btn-ghost btn-sm group-add" data-gid="">+ เพิ่มรายการ</button></span>
        </div>
      </td></tr>`;

    const groupHeader = (g, gi) => `
      <tr class="group-row" data-type="group" data-gid="${g.id}"><td colspan="${cols}">
        <div class="group-bar">
          <span class="group-icon">${icon('folder')}</span>
          <input class="group-name" data-gid="${g.id}" value="${escapeHtml(g.name)}" placeholder="ชื่อหมวดหมู่ เช่น ก่อนกลางภาค" aria-label="ชื่อหมวดหมู่">
          <span class="group-stat" data-stat-for="${g.id}">${statText(itemsOf(g.id))}</span>
          <span class="group-actions">
            <button class="btn btn-ghost btn-sm group-add" data-gid="${g.id}">+ เพิ่มรายการ</button>
            <button class="btn btn-ghost btn-sm group-up" data-gid="${g.id}" title="เลื่อนหมวดขึ้น" ${gi === 0 ? 'disabled' : ''}>↑</button>
            <button class="btn btn-ghost btn-sm group-down" data-gid="${g.id}" title="เลื่อนหมวดลง" ${gi === groups.length - 1 ? 'disabled' : ''}>↓</button>
            <button class="btn btn-danger-ghost btn-sm group-del" data-gid="${g.id}" title="ลบหมวดหมู่ (งานในหมวดจะไม่ถูกลบ)">ลบหมวด</button>
          </span>
        </div>
      </td></tr>`;

    // เรียงแถว: ไม่มีหมวด → แถวงานเรียงตามปกติ / มีหมวด → หัวข้อหมวด + งานของหมวดนั้น
    let bodyRows = '';
    if (!hasGroups) {
      bodyRows = ordered.map((it, i) => itemRow(it, i)).join('');
    } else {
      let n = 0;
      bodyRows += ungroupedHeader() + itemsOf(null).map(it => itemRow(it, n++)).join('');
      groups.forEach((g, gi) => {
        bodyRows += groupHeader(g, gi) + itemsOf(g.id).map(it => itemRow(it, n++)).join('');
      });
    }

    const quickNames = ['ก่อนกลางภาค', 'หลังกลางภาค'].filter(n => !groups.some(g => g.name.trim() === n));

    container.innerHTML = `
      <div class="struct-summary-row">
        <div class="struct-summary-box readonly">
          <div class="lbl">รวมคะแนนเก็บ</div>
          <input type="text" value="${collectTotal()}" readonly>
        </div>
        <div class="struct-summary-box">
          <div class="lbl">สอบกลางภาค</div>
          <input type="number" id="mid-max-input" value="${midterm.max}">
        </div>
        <div class="struct-summary-box">
          <div class="lbl">สอบปลายภาค</div>
          <input type="number" id="final-max-input" value="${final.max}">
        </div>
      </div>

      <div class="card">
        <div class="struct-panel-header" style="display:flex; justify-content:space-between;">
          <span>รายละเอียดคะแนนเก็บ (งาน/ชิ้นงาน/แบบฝึกหัด)</span>
          <span style="font-weight:600; color:${gt === 100 ? 'var(--success)' : 'var(--danger)'};">รวมทั้งหมด ${gt} / 100</span>
        </div>
        <div class="card-pad">
          <div class="group-creator">
            <div class="group-creator-label">หมวดหมู่หลัก <span>สร้างหมวดก่อน แล้วลากงานหรือเลือกหมวดที่แต่ละแถวเพื่อจัดเป็นหมวดย่อย</span></div>
            <div class="group-creator-row">
              <input id="new-group-name" placeholder="ชื่อหมวดหมู่ เช่น ก่อนกลางภาค" maxlength="60">
              <button class="btn btn-primary btn-sm" id="add-group-btn">+ เพิ่มหมวดหมู่</button>
            </div>
            ${quickNames.length ? `<div class="group-quick">ตัวอย่าง: ${quickNames.map(n => `<button type="button" class="chip quick-group" data-name="${n}">+ ${n}</button>`).join('')}</div>` : ''}
          </div>

          ${ordered.length === 0 && !hasGroups ? `<div class="empty-state" style="padding:20px;">ยังไม่มีรายการคะแนนเก็บ</div>` : `
            <div class="struct-table-wrap">
            <table class="struct-table ${hasGroups ? 'has-groups' : ''}">
              <thead><tr>
                <th style="width:24px;"></th>
                <th>#</th>
                <th>รหัส/ชื่อรายการ</th>
                <th>รายละเอียด / จุดประสงค์</th>
                ${hasGroups ? `<th class="group-col">หมวดหมู่</th>` : ''}
                <th class="num-col">คะแนนเก็บ</th>
                <th class="del-col"></th>
              </tr></thead>
              <tbody id="struct-tbody">${bodyRows}</tbody>
            </table>
            </div>
          `}
          <div style="margin-top:12px; display:flex; gap:8px;">
            <button class="btn btn-ghost btn-sm" id="add-item-btn">+ เพิ่มแถว</button>
            <button class="btn btn-primary" id="save-structure-btn" style="margin-left:auto;">บันทึกโครงสร้างวิชา</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('mid-max-input').addEventListener('input', (e) => {
      midterm.max = Number(e.target.value) || 0;
      updateTotals();
    });
    document.getElementById('final-max-input').addEventListener('input', (e) => {
      final.max = Number(e.target.value) || 0;
      updateTotals();
    });
    document.getElementById('add-item-btn').addEventListener('click', () => {
      collectItems.push({ id: 'new-' + uid4(), name: '', max: 10, detail: '', category: 'collect', groupId: null });
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
        container.querySelectorAll(`select.row-group option[value="${g.id}"]`).forEach(o => { o.textContent = groupLabel(g); });
      });
    });
    container.querySelectorAll('.group-add').forEach(btn => {
      btn.addEventListener('click', () => {
        collectItems.push({ id: 'new-' + uid4(), name: '', max: 10, detail: '', category: 'collect', groupId: btn.dataset.gid || null });
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
        if (n > 0 && !confirm(`ลบหมวด "${groupLabel(g)}" ?\nงาน ${n} รายการในหมวดนี้จะไม่ถูกลบ แต่จะกลับไปอยู่ที่ "ยังไม่จัดหมวดหมู่"`)) return;
        collectItems.forEach(i => { if (i.groupId === g.id) i.groupId = null; });
        groups = groups.filter(x => x.id !== g.id);
        draw();
      });
    });
    container.querySelectorAll('select.row-group').forEach(sel => {
      sel.addEventListener('change', () => {
        const it = collectItems.find(x => x.id === sel.dataset.id);
        it.groupId = sel.value || null;
        draw();
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
      saveStructure(course, displayItems(), groups, midterm, final, colRef, structRef));
  }

  function updateTotals() {
    // อัปเดตเฉพาะตัวเลขรวม โดยไม่ redraw ทั้งหมด เพื่อไม่ให้เสีย focus ของช่องที่กำลังพิมพ์
    const gt = grandTotal();
    const readonlyBox = container.querySelector('.struct-summary-box.readonly input');
    if (readonlyBox) readonlyBox.value = collectTotal();
    const header = container.querySelector('.struct-panel-header span:last-child');
    if (header) {
      header.textContent = `รวมทั้งหมด ${gt} / 100`;
      header.style.color = gt === 100 ? 'var(--success)' : 'var(--danger)';
    }
    container.querySelectorAll('.group-stat').forEach(el => {
      el.textContent = statText(itemsOf(el.dataset.statFor || null));
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
  // อ่านลำดับและหมวดจาก DOM: หัวข้อหมวดกำหนด groupId ให้แถวงานที่ตามมา
  let currentGroup = null;
  const ordered = [];
  tbodyEl.querySelectorAll('tr').forEach(tr => {
    if (tr.dataset.type === 'ungrouped') currentGroup = null;
    else if (tr.dataset.type === 'group') currentGroup = tr.dataset.gid;
    else if (tr.dataset.type === 'item') {
      const it = items.find(x => x.id === tr.dataset.id);
      if (it) { it.groupId = currentGroup; ordered.push(it); }
    }
  });
  // แก้ array เดิมในที่ (closure ของ renderStructureTab ถืออ้างอิงอยู่)
  const rest = items.filter(i => !ordered.includes(i));
  items.length = 0;
  items.push(...ordered, ...rest);
}

async function saveStructure(course, collectItems, groups, midterm, final, colRef, structRef) {
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
  collectItems.forEach((it, idx) => {
    write(it, {
      name: it.name || `รายการที่ ${idx + 1}`,
      max: Number(it.max) || 0,
      detail: it.detail || '',
      category: 'collect',
      groupId: groupIds.has(it.groupId) ? it.groupId : null,
      order: idx,
    });
  });
  write(midterm, { name: midterm.name || MIDTERM_NAME, max: Number(midterm.max) || 0, category: 'midterm', order: collectItems.length });
  write(final, { name: final.name || FINAL_NAME, max: Number(final.max) || 0, category: 'final', order: collectItems.length + 1 });

  existingSnap.docs.forEach(d => { if (!keepIds.has(d.id)) batch.delete(d.ref); });

  batch.set(structRef, {
    groups: groups.map((g, i) => ({ id: g.id, name: g.name.trim() || `หมวดหมู่ ${i + 1}` })),
  });

  await batch.commit();
  showToast('บันทึกโครงสร้างวิชาสำเร็จ');
  renderStructureTab(document.getElementById('course-tab-body') || document.getElementById('structure-page-body'), course);
}
