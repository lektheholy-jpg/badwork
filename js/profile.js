// ==========================================================================
// ข้อมูลส่วนตัวของครู — เปิดจากไอคอนบัญชี (มุมซ้ายล่าง)
// เก็บที่ users/{uid}.profile (map) ฟิลด์ต้องตรงกับ validTeacherProfile ใน firestore.rules
// เก็บไว้ให้เอกสารอื่นดึงไปใช้ได้: await loadModule('profile') แล้วเรียก loadTeacherProfile() / profileSummary(p)
// ==========================================================================

const PROFILE_FIELDS = [
  'prefix', 'firstName', 'lastName', 'phone',
  'position', 'academicStanding', 'ksLevel', 'salary', 'positionNo', 'subjectGroup',
  'school', 'affiliation',
  'director', 'deputyAcademic', 'subjectHead', 'assessmentHead',
];
const PROFILE_PREFIXES = ['นาย', 'นาง', 'นางสาว'];
const PROFILE_POSITIONS = ['ครูผู้ช่วย', 'ครู'];
// วิทยฐานะ → คศ. ที่คู่กัน (ใช้เติมช่อง คศ. ให้เมื่อยังว่าง แก้เองได้เสมอ)
const PROFILE_STANDINGS = [
  ['ครูชำนาญการ', 'คศ.2'],
  ['ครูชำนาญการพิเศษ', 'คศ.3'],
  ['ครูเชี่ยวชาญ', 'คศ.4'],
  ['ครูเชี่ยวชาญพิเศษ', 'คศ.5'],
];
const PROFILE_KS_LEVELS = ['คศ.1', 'คศ.2', 'คศ.3', 'คศ.4', 'คศ.5'];

// ข้อความที่พิมพ์หรือคัดลอกมาจากเอกสารอาจใช้ "ํ"+"า" (สระอำแยกตัว) แทน "ำ" — รวมให้เป็นตัวเดียวกันก่อนเก็บ/เทียบ
function cleanProfileText(v) {
  return String(v == null ? '' : v).replace(/\u0E4D\u0E32/g, '\u0E33').replace(/\s+/g, ' ').trim();
}

async function loadTeacherProfile() {
  const snap = await db.collection('users').doc(AppState.user.uid).get();
  const raw = (snap.exists && snap.data().profile) || {};
  const p = {};
  PROFILE_FIELDS.forEach(k => { p[k] = raw[k] == null ? '' : raw[k]; });
  AppState.teacherProfile = p;
  return p;
}

function formatSalary(n) {
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

// ข้อความหัวเอกสาร เช่น "นายสมชาย ใจดี ตำแหน่ง ครู วิทยฐานะ ครูชำนาญการ สถานศึกษา ... สังกัด ... รับเงินเดือนในตำแหน่ง คศ.2 อัตราเงินเดือน 32,290 บาท"
function profileSummary(p) {
  const name = [(p.prefix || '') + (p.firstName || ''), p.lastName || ''].filter(Boolean).join(' ');
  const hasSalary = p.salary !== '' && p.salary != null;
  return [
    name,
    p.position && 'ตำแหน่ง ' + p.position,
    p.academicStanding && 'วิทยฐานะ ' + p.academicStanding,
    p.school && 'สถานศึกษา ' + p.school,
    p.affiliation && 'สังกัด ' + p.affiliation,
    p.ksLevel && 'รับเงินเดือนในตำแหน่ง ' + p.ksLevel,
    hasSalary && 'อัตราเงินเดือน ' + formatSalary(p.salary) + ' บาท',
  ].filter(Boolean).join(' ');
}

function pfInput(id, label, value, { ph = '', list = '', mode = '', opt = false, hint = '' } = {}) {
  return `
    <div class="field">
      <label for="pf-${id}">${escapeHtml(label)}${opt ? ' <span class="profile-opt">(ไม่บังคับ)</span>' : ''}</label>
      <input id="pf-${id}" type="text" maxlength="200" autocomplete="off" value="${escapeHtml(value)}" placeholder="${escapeHtml(ph)}"${list ? ` list="pf-dl-${list}"` : ''}${mode ? ` inputmode="${mode}"` : ''}>
      ${hint ? `<div class="field-hint">${escapeHtml(hint)}</div>` : ''}
    </div>`;
}

function pfDatalist(id, items) {
  return `<datalist id="pf-dl-${id}">${items.map(v => `<option value="${escapeHtml(v)}"></option>`).join('')}</datalist>`;
}

function profileFormHtml(p) {
  const u = AppState.user;
  const ksOptions = `<option value="">— ไม่ระบุ —</option>` +
    PROFILE_KS_LEVELS.map(k => `<option value="${k}"${k === p.ksLevel ? ' selected' : ''}>${k}</option>`).join('');
  const salaryText = p.salary === '' || p.salary == null ? '' : formatSalary(p.salary);
  return `
    <div class="profile-grid" id="profile-form">
      <div class="card card-pad">
        <h2 class="card-title">ชื่อและการติดต่อ</h2>
        <div class="settings-profile">
          <img src="${escapeHtml(safePhotoUrl(u.photoURL, u.displayName))}" alt="" referrerpolicy="no-referrer" class="u-avatar-48">
          <div>
            <div class="u-semibold">${escapeHtml(u.displayName || '')}</div>
            <div class="u-note-sm">${escapeHtml(u.email || '')}</div>
          </div>
        </div>
        <div class="field-row-3">
          ${pfInput('prefix', 'คำนำหน้า', p.prefix, { ph: 'นาย', list: 'prefix' })}
          ${pfInput('firstName', 'ชื่อ', p.firstName)}
          ${pfInput('lastName', 'นามสกุล', p.lastName)}
        </div>
        ${pfInput('phone', 'เบอร์โทรศัพท์', p.phone, { mode: 'tel', opt: true })}
      </div>

      <div class="card card-pad">
        <h2 class="card-title">ตำแหน่งและเงินเดือน</h2>
        ${pfInput('position', 'ตำแหน่ง', p.position, { ph: 'ครู', list: 'position' })}
        ${pfInput('academicStanding', 'วิทยฐานะ', p.academicStanding, { ph: 'ครูชำนาญการ', list: 'standing' })}
        <div class="field-row">
          <div class="field">
            <label for="pf-ksLevel">รับเงินเดือนในตำแหน่ง</label>
            <select id="pf-ksLevel">${ksOptions}</select>
          </div>
          ${pfInput('salary', 'อัตราเงินเดือน (บาท)', salaryText, { ph: '32,290', mode: 'decimal' })}
        </div>
        ${pfInput('positionNo', 'เลขที่ตำแหน่ง', p.positionNo, { opt: true, hint: 'บางแบบฟอร์มของ ก.ค.ศ. ขอข้อมูลนี้' })}
        ${pfInput('subjectGroup', 'กลุ่มสาระการเรียนรู้ / กลุ่มงาน', p.subjectGroup, { ph: 'คณิตศาสตร์', opt: true })}
      </div>

      <div class="card card-pad">
        <h2 class="card-title">สถานศึกษา</h2>
        ${pfInput('school', 'สถานศึกษา', p.school, { ph: 'โรงเรียน...' })}
        ${pfInput('affiliation', 'สังกัด', p.affiliation, { ph: 'สำนักงานเขตพื้นที่การศึกษา...' })}
      </div>

      <div class="card card-pad">
        <h2 class="card-title">ผู้ลงนามในเอกสาร <span class="profile-opt">(ไม่บังคับ)</span></h2>
        <div class="u-note u-mb-12">ท้ายแบบรายงานผลการเรียนมักมีช่องลงนามหลายตำแหน่ง ตามแบบของแต่ละโรงเรียน</div>
        ${pfInput('subjectHead', 'หัวหน้ากลุ่มสาระการเรียนรู้', p.subjectHead)}
        ${pfInput('assessmentHead', 'หัวหน้างานวัดผลและประเมินผล', p.assessmentHead)}
        ${pfInput('deputyAcademic', 'รองผู้อำนวยการฝ่ายวิชาการ', p.deputyAcademic)}
        ${pfInput('director', 'ผู้อำนวยการสถานศึกษา', p.director)}
      </div>

      <div class="card card-pad profile-wide">
        <h2 class="card-title">ตัวอย่างข้อความหัวเอกสาร</h2>
        <div class="u-note">แสดงตามที่กรอกอยู่ตอนนี้ ใช้ตรวจว่าสะกดและเรียงถูกก่อนบันทึก</div>
        <div class="profile-preview" id="pf-preview" aria-live="polite"></div>
        <div class="profile-actions u-mt-12">
          <button type="button" class="btn btn-primary" id="pf-save-btn">บันทึกข้อมูล</button>
        </div>
      </div>

      ${pfDatalist('prefix', PROFILE_PREFIXES)}
      ${pfDatalist('position', PROFILE_POSITIONS)}
      ${pfDatalist('standing', PROFILE_STANDINGS.map(s => s[0]))}
    </div>`;
}

// อ่านค่าจากฟอร์ม · คืน { data } เสมอ (ใช้โชว์ตัวอย่างได้ระหว่างพิมพ์) และมี { error, field } เพิ่มเมื่อเงินเดือนไม่ใช่ตัวเลข
function readProfileForm(form) {
  const data = {};
  PROFILE_FIELDS.forEach(k => { data[k] = cleanProfileText(form.querySelector('#pf-' + k).value); });

  const digits = data.salary.replace(/[๐-๙]/g, d => String(d.charCodeAt(0) - 0x0E50)).replace(/[,\s]|บาท/g, '');
  const n = Number(digits);
  if (digits === '') { data.salary = null; return { data }; }
  if (!isFinite(n) || n < 0 || n > 9999999) {
    data.salary = null;
    return { data, error: 'อัตราเงินเดือนต้องเป็นตัวเลข เช่น 32,290', field: 'salary' };
  }
  data.salary = n;
  return { data };
}

async function renderProfilePage() {
  const view = document.getElementById('view');
  showLoading('list');

  let p;
  try {
    p = await loadTeacherProfile();
  } catch (err) {
    console.error(err);
    view.innerHTML = `${pageHeaderHtml('ข้อมูลส่วนตัว')}<div class="card"><div class="empty-state">โหลดข้อมูลไม่สำเร็จ<br><button type="button" class="btn btn-ghost btn-sm" id="pf-retry-btn">ลองใหม่</button></div></div>`;
    document.getElementById('pf-retry-btn')?.addEventListener('click', () => navigate('profile'));
    return;
  }

  view.innerHTML = `${pageHeaderHtml('ข้อมูลส่วนตัว')}${profileFormHtml(p)}`;
  const form = document.getElementById('profile-form');
  const preview = form.querySelector('#pf-preview');
  const ksSelect = form.querySelector('#pf-ksLevel');
  const standingInput = form.querySelector('#pf-academicStanding');
  const saveBtn = form.querySelector('#pf-save-btn');

  const refreshPreview = () => {
    const text = profileSummary(readProfileForm(form).data);
    preview.textContent = text || 'ยังไม่ได้กรอกข้อมูล';
    preview.classList.toggle('is-empty', !text);
  };

  form.addEventListener('input', e => {
    if (e.target === standingInput && !ksSelect.value) {
      const hit = PROFILE_STANDINGS.find(s => s[0] === cleanProfileText(standingInput.value));
      if (hit) ksSelect.value = hit[1]; // เติม คศ. ให้เมื่อยังว่าง
    }
    refreshPreview();
  });
  form.addEventListener('change', refreshPreview);
  form.querySelector('#pf-salary').addEventListener('blur', e => {
    const { data } = readProfileForm(form);
    if (data.salary != null) e.target.value = formatSalary(data.salary); // จัดรูปแบบ 32290 → 32,290
  });

  saveBtn.addEventListener('click', async () => {
    const r = readProfileForm(form);
    if (r.error) { showToast(r.error); form.querySelector('#pf-' + r.field).focus(); return; }
    saveBtn.disabled = true;
    islandSave('saving');
    try {
      // mergeFields: แทนที่ฟิลด์ profile ทั้งก้อน (ช่องที่ล้างจะถูกล้างจริง) โดยไม่แตะฟิลด์อื่นของ users/{uid}
      await db.collection('users').doc(AppState.user.uid).set({ profile: r.data }, { mergeFields: ['profile'] });
      AppState.teacherProfile = r.data;
      islandSave('saved');
    } catch (err) {
      console.error(err);
      showToast(err.code === 'permission-denied'
        ? 'บันทึกไม่สำเร็จ: ถูกปฏิเสธสิทธิ์ (ต้องอัปเดต firestore.rules ก่อน)'
        : 'บันทึกไม่สำเร็จ: ' + (err.message || err));
    } finally {
      saveBtn.disabled = false;
    }
  });

  refreshPreview();
}
