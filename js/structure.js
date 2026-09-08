// ==========================================================================
// Score structure: summary boxes (เก็บ/กลางภาค/ปลายภาค)
// + editable list of รายการคะแนนเก็บ, drag to reorder
// ==========================================================================

const CATEGORY_LABELS = { collect: 'คะแนนเก็บ', midterm: 'กลางภาค', final: 'ปลายภาค' };
const MIDTERM_NAME = 'สอบกลางภาค';
const FINAL_NAME = 'สอบปลายภาค';

async function renderStructureTab(container, course) {
  container.innerHTML = `<div class="empty-state">กำลังโหลด...</div>`;
  const uid = AppState.user.uid;
  const colRef = db.collection('users').doc(uid).collection('courses').doc(course.id).collection('assessments');
  const snap = await colRef.orderBy('order', 'asc').get();
  const allItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  let collectItems = allItems.filter(i => i.category === 'collect');
  let midterm = allItems.find(i => i.category === 'midterm') || { id: 'new-mid', name: MIDTERM_NAME, max: 20, category: 'midterm' };
  let final = allItems.find(i => i.category === 'final') || { id: 'new-final', name: FINAL_NAME, max: 30, category: 'final' };

  function collectTotal() { return collectItems.reduce((s, i) => s + (Number(i.max) || 0), 0); }
  function grandTotal() { return collectTotal() + (Number(midterm.max) || 0) + (Number(final.max) || 0); }

  function draw() {
    const gt = grandTotal();
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
          <span>📋 รายละเอียดคะแนนเก็บ (งาน/ชิ้นงาน/แบบฝึกหัด)</span>
          <span style="font-weight:600; color:${gt === 100 ? 'var(--success)' : 'var(--danger)'};">รวมทั้งหมด ${gt} / 100</span>
        </div>
        <div class="card-pad">
          ${collectItems.length === 0 ? `<div class="empty-state" style="padding:20px;">ยังไม่มีรายการคะแนนเก็บ</div>` : `
            <table class="struct-table">
              <thead><tr>
                <th style="width:24px;"></th>
                <th>#</th>
                <th>รหัส/ชื่อรายการ</th>
                <th>รายละเอียด / จุดประสงค์</th>
                <th class="num-col">คะแนนเก็บ</th>
                <th class="del-col"></th>
              </tr></thead>
              <tbody id="struct-tbody">
                ${collectItems.map((it, idx) => `
                  <tr draggable="true" data-id="${it.id}">
                    <td class="handle-col">☰</td>
                    <td>${idx + 1}</td>
                    <td><input class="row-name" data-id="${it.id}" data-field="name" value="${escapeHtml(it.name)}" placeholder="ชื่อรายการ"></td>
                    <td><input class="row-detail" data-id="${it.id}" data-field="detail" value="${escapeHtml(it.detail || '')}" placeholder="รายละเอียด/จุดประสงค์ (ถ้ามี)"></td>
                    <td class="num-col"><input class="row-max" type="number" data-id="${it.id}" value="${it.max}"></td>
                    <td class="del-col"><button class="btn btn-danger-ghost btn-sm del-item" data-id="${it.id}">ลบ</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
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
      collectItems.push({ id: 'new-' + uid4(), name: '', max: 10, detail: '', category: 'collect' });
      draw();
    });

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
    if (tbody) setupDragReorder(tbody, collectItems);

    document.getElementById('save-structure-btn').addEventListener('click', () =>
      saveStructure(course, collectItems, midterm, final, colRef));
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
  }

  draw();
}

function setupDragReorder(tbodyEl, items) {
  let dragEl = null;
  tbodyEl.querySelectorAll('tr').forEach(el => {
    el.addEventListener('dragstart', () => { dragEl = el; el.classList.add('dragging'); });
    el.addEventListener('dragend', () => { el.classList.remove('dragging'); reorderFromDom(tbodyEl, items); });
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      const after = getDragAfterElement(tbodyEl, e.clientY);
      if (!dragEl) return;
      if (after == null) tbodyEl.appendChild(dragEl);
      else tbodyEl.insertBefore(dragEl, after);
    });
  });
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
  const ids = [...tbodyEl.querySelectorAll('tr')].map(el => el.dataset.id);
  items.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
}

async function saveStructure(course, collectItems, midterm, final, colRef) {
  const uid = AppState.user.uid;
  const existingSnap = await colRef.get();
  const batch = db.batch();
  existingSnap.docs.forEach(d => batch.delete(d.ref));
  collectItems.forEach((it, idx) => {
    const ref = colRef.doc();
    batch.set(ref, { name: it.name || `รายการที่ ${idx + 1}`, max: Number(it.max) || 0, detail: it.detail || '', category: 'collect', order: idx });
  });
  const midRef = colRef.doc();
  batch.set(midRef, { name: midterm.name || MIDTERM_NAME, max: Number(midterm.max) || 0, category: 'midterm', order: collectItems.length });
  const finalRef = colRef.doc();
  batch.set(finalRef, { name: final.name || FINAL_NAME, max: Number(final.max) || 0, category: 'final', order: collectItems.length + 1 });
  await batch.commit();
  showToast('บันทึกโครงสร้างวิชาสำเร็จ');
  renderStructureTab(document.getElementById('course-tab-body'), course);
}
