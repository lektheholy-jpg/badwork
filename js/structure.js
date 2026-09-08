// ==========================================================================
// Score structure: flexible list of assessment items, drag to reorder
// ==========================================================================

const CATEGORY_LABELS = { collect: 'คะแนนเก็บ', midterm: 'กลางภาค', final: 'ปลายภาค' };

async function renderStructureTab(container, course) {
  container.innerHTML = `<div class="empty-state">กำลังโหลด...</div>`;
  const uid = AppState.user.uid;
  const colRef = db.collection('users').doc(uid).collection('courses').doc(course.id).collection('assessments');
  const snap = await colRef.orderBy('order', 'asc').get();
  let items = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  function totalOf(cat) {
    return items.filter(i => i.category === cat).reduce((s, i) => s + (Number(i.max) || 0), 0);
  }
  function grandTotal() { return items.reduce((s, i) => s + (Number(i.max) || 0), 0); }

  function draw() {
    const total = grandTotal();
    container.innerHTML = `
      <div class="card card-pad">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
          <div style="font-weight:600; font-size:14px;">รายการคะแนน</div>
          <button class="btn btn-primary btn-sm" id="add-item-btn">+ เพิ่มรายการ</button>
        </div>
        ${items.length === 0 ? `<div class="empty-state" style="padding:30px;"><div class="icon">🧮</div>ยังไม่มีรายการคะแนน เริ่มเพิ่มรายการแรกได้เลย</div>` : `
          <div class="struct-list" id="struct-list">
            ${items.map(i => `
              <div class="struct-item" draggable="true" data-id="${i.id}">
                <span class="handle">☰</span>
                <select class="item-cat" data-id="${i.id}">
                  ${Object.entries(CATEGORY_LABELS).map(([k, v]) => `<option value="${k}" ${i.category === k ? 'selected' : ''}>${v}</option>`).join('')}
                </select>
                <span class="item-name" contenteditable="true" data-id="${i.id}" data-field="name">${escapeHtml(i.name)}</span>
                <input class="item-score" type="number" value="${i.max}" data-id="${i.id}">
                <button class="btn btn-danger-ghost btn-sm del-item" data-id="${i.id}">ลบ</button>
              </div>
            `).join('')}
          </div>
          <div class="struct-total-row ${total === 100 ? 'balanced' : 'unbalanced'}">
            <span>รวมทั้งหมด (${Object.entries(CATEGORY_LABELS).map(([k, v]) => `${v} ${totalOf(k)}`).join(' + ')})</span>
            <span>${total} / 100</span>
          </div>
          ${total !== 100 ? `<div style="font-size:12.5px; color:var(--danger); margin-top:6px;">คะแนนรวมยังไม่ครบ 100 คะแนน กรุณาปรับให้ครบก่อนใช้บันทึกคะแนน</div>` : ''}
          <div class="modal-actions" style="justify-content:flex-start; margin-top:18px;">
            <button class="btn btn-primary" id="save-structure-btn">บันทึกโครงสร้างคะแนน</button>
          </div>
        `}
      </div>
    `;

    document.getElementById('add-item-btn').addEventListener('click', () => {
      items.push({ id: 'new-' + uid4(), name: 'รายการใหม่', max: 10, category: 'collect', order: items.length, _new: true });
      draw();
    });

    if (items.length > 0) {
      container.querySelectorAll('.item-score').forEach(inp => {
        inp.addEventListener('input', () => {
          const it = items.find(x => x.id === inp.dataset.id);
          it.max = Number(inp.value) || 0;
          // อัปเดตเฉพาะแถวรวม โดยไม่ redraw ทั้งหมดเพื่อไม่ให้เสีย focus
          const total = grandTotal();
          const totalRow = container.querySelector('.struct-total-row');
          totalRow.className = `struct-total-row ${total === 100 ? 'balanced' : 'unbalanced'}`;
          totalRow.innerHTML = `
            <span>รวมทั้งหมด (${Object.entries(CATEGORY_LABELS).map(([k, v]) => `${v} ${totalOf(k)}`).join(' + ')})</span>
            <span>${total} / 100</span>`;
        });
      });
      container.querySelectorAll('.item-cat').forEach(sel => {
        sel.addEventListener('change', () => {
          items.find(x => x.id === sel.dataset.id).category = sel.value;
          draw();
        });
      });
      container.querySelectorAll('.item-name').forEach(el => {
        el.addEventListener('blur', () => {
          items.find(x => x.id === el.dataset.id).name = el.textContent.trim();
        });
      });
      container.querySelectorAll('.del-item').forEach(btn => {
        btn.addEventListener('click', () => {
          items = items.filter(x => x.id !== btn.dataset.id);
          draw();
        });
      });
      setupDragReorder(container.querySelector('#struct-list'), items);
      document.getElementById('save-structure-btn').addEventListener('click', () => saveStructure(course, items, colRef));
    }
  }

  draw();
}

function setupDragReorder(listEl, items) {
  let dragEl = null;
  listEl.querySelectorAll('.struct-item').forEach(el => {
    el.addEventListener('dragstart', () => { dragEl = el; el.classList.add('dragging'); });
    el.addEventListener('dragend', () => { el.classList.remove('dragging'); reorderFromDom(listEl, items); });
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      const after = getDragAfterElement(listEl, e.clientY);
      if (!dragEl) return;
      if (after == null) listEl.appendChild(dragEl);
      else listEl.insertBefore(dragEl, after);
    });
  });
}
function getDragAfterElement(container, y) {
  const els = [...container.querySelectorAll('.struct-item:not(.dragging)')];
  return els.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: -Infinity }).element;
}
function reorderFromDom(listEl, items) {
  const ids = [...listEl.querySelectorAll('.struct-item')].map(el => el.dataset.id);
  items.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
}

async function saveStructure(course, items, colRef) {
  const uid = AppState.user.uid;
  const existingSnap = await colRef.get();
  const batch = db.batch();
  existingSnap.docs.forEach(d => batch.delete(d.ref));
  items.forEach((it, idx) => {
    const ref = colRef.doc();
    batch.set(ref, { name: it.name, max: Number(it.max) || 0, category: it.category, order: idx });
  });
  await batch.commit();
  showToast('บันทึกโครงสร้างคะแนนสำเร็จ');
  renderStructureTab(document.getElementById('course-tab-body'), course);
}
