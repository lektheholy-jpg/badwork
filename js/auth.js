// ==========================================================================
// Auth: Google Sign-In / Sign-Out
// ==========================================================================

const AppState = {
  user: null,            // firebase user object
  currentRoute: 'dashboard',
  currentCourseId: null,
  currentCourse: null,
  currentSectionId: null,
  currentTab: 'overview',
  courses: [],            // cache รายวิชาทั้งหมดของครู
  sections: [],            // cache ห้องของวิชาที่เปิดอยู่
};

document.getElementById('google-signin-btn').addEventListener('click', async () => {
  try {
    await auth.signInWithPopup(googleProvider);
  } catch (err) {
    // popup ถูกบล็อก (มือถือบางรุ่น / PWA mode / iOS Safari) — ใช้ redirect แทน
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-cancelled-by-user') {
      try {
        await auth.signInWithRedirect(googleProvider);
        return; // redirect จะโหลดหน้าใหม่เอง
      } catch (redirectErr) {
        showToast('เข้าสู่ระบบไม่สำเร็จ: ' + (redirectErr.message || redirectErr));
        return;
      }
    }
    showToast('เข้าสู่ระบบไม่สำเร็จ: ' + (err.message || err));
  }
});

// ==========================================================================
// ซิงค์ "หน้าตา" ตามบัญชี Google → users/{uid}.appearance
//   ครอบคลุม: โหมดสว่าง/มืด · พื้นหลัง · สีหลัก · ความโปร่งใส/เบลอ · ชุดตั้งค่าของฉัน (ตรรกะค่าอยู่ที่ js/theme.js: getAppearance / setAppearance / resetAppearance)
//   หลักการ: localStorage เป็นแหล่งแรกเสมอ (เปิดแอปได้ทันที/ออฟไลน์) แล้วค่อยซิงค์กับคลาวด์
//     - ล็อกอิน: มีค่าบนคลาวด์ → ใช้ค่าบนคลาวด์ · ยังไม่มี → อัปโหลดค่าในเครื่อง (ครั้งแรกหลังเปิดฟีเจอร์นี้)
//     - แก้ค่า: รอ 0.8 วินาทีแล้วส่งขึ้นครั้งเดียว (แถบเลื่อนปรับรัว ๆ ไม่ยิงทุกขีด)
//     - เครื่องที่ใช้ร่วมกัน: จำ uid เจ้าของค่าในเครื่อง (OWNER) ถ้าเป็นบัญชีอื่นและยังไม่มีค่าบนคลาวด์ → กลับค่าเริ่มต้น ไม่เอาหน้าตาของคนก่อนหน้ามาใช้/อัปโหลด
//     - DIRTY = มีการแก้ในเครื่องที่ยังไม่ยืนยันว่าขึ้นคลาวด์ (ปิดแท็บเร็ว/ออฟไลน์) → ล็อกอินครั้งต่อไปส่งค่าในเครื่องขึ้นก่อน ไม่ถูกค่าเก่าบนคลาวด์ทับ
//   ซิงค์ไม่สำเร็จ (ออฟไลน์/rules ยังไม่ deploy) = ใช้ค่าในเครื่องต่อตามปกติ ไม่ขัดการใช้งาน
//   หลายอุปกรณ์: ดึงค่าตอนล็อกอิน/เปิดแอป (ไม่ฟังแบบเรียลไทม์) · แก้พร้อมกันหลายเครื่อง = ครั้งที่ส่งทีหลังชนะ
// ==========================================================================
const appearanceSync = (() => {
  const OWNER = 'myscore-appearance-owner';
  const DIRTY = 'myscore-appearance-dirty';
  const DELAY = 800;
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* โหมดส่วนตัว/เต็ม: ข้าม */ } };
  let ready = false, timer = 0, version = 0;

  function pushNow() {
    clearTimeout(timer); timer = 0;
    const u = AppState.user;
    if (!u || !ready || typeof getAppearance !== 'function') return Promise.resolve();
    const sent = version, a = getAppearance();
    return db.collection('users').doc(u.uid).set({
      appearance: { theme: a.theme, bg: a.bg, look: a.look, presets: a.presets, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
    }, { merge: true }).then(() => {
      // เคลียร์ DIRTY เฉพาะเมื่อไม่มีการแก้เพิ่มระหว่างรอ และยังเป็นบัญชีเดิม
      if (sent === version && AppState.user && AppState.user.uid === u.uid) lsSet(DIRTY, null);
    }).catch(err => console.warn('ซิงค์หน้าตาขึ้นบัญชีไม่สำเร็จ (ค่ายังอยู่ในเครื่อง):', err && err.code));
  }

  // ผู้ใช้แก้หน้าตา (theme.js ส่งเหตุการณ์นี้ ยกเว้นตอนนำค่าจากคลาวด์มาใช้)
  document.addEventListener('myscore:appearance', () => {
    version++;
    lsSet(DIRTY, '1');
    clearTimeout(timer);
    timer = setTimeout(pushNow, DELAY);
  });
  // ปิด/ซ่อนแท็บระหว่างรอ → ส่งทันที (ถ้าส่งไม่ทัน DIRTY ยังอยู่ ครั้งหน้าจะส่งต่อ)
  const flushIfPending = () => { if (timer) pushNow(); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushIfPending(); });
  window.addEventListener('pagehide', flushIfPending);

  async function onLogin(user) {
    ready = false;
    if (typeof setAppearance !== 'function') return;
    let snap;
    try { snap = await db.collection('users').doc(user.uid).get(); }
    catch (err) { console.warn('อ่านหน้าตาจากบัญชีไม่สำเร็จ (ใช้ค่าในเครื่องไปก่อน):', err && err.code); return; }
    if (!AppState.user || AppState.user.uid !== user.uid) return; // ระหว่างรอมีการออกจากระบบ/เปลี่ยนบัญชี
    const owner = lsGet(OWNER), mine = owner === user.uid, dirty = lsGet(DIRTY) === '1';
    const cloud = snap.exists ? snap.get('appearance') : null;
    const hasCloud = !!cloud && typeof cloud === 'object';
    let needPush = false;
    if (mine && dirty) needPush = true;                       // ในเครื่องใหม่กว่า (ยังไม่ทันขึ้นคลาวด์)
    else if (hasCloud) {                                      // ใช้ค่าจากคลาวด์
      setAppearance(cloud);
      if (AppState.currentRoute === 'settings' && typeof renderSettings === 'function') renderSettings(); // เปิดหน้าตั้งค่าค้างอยู่ → วาดใหม่ให้ตรงค่า
    } else if (mine || !owner) needPush = true;               // บัญชีนี้ยังไม่มีค่าบนคลาวด์ → อัปโหลดค่าในเครื่อง
    else resetAppearance();                                   // ค่าในเครื่องเป็นของบัญชีอื่น → เริ่มจากค่าเริ่มต้น
    lsSet(OWNER, user.uid);
    ready = true;
    if (needPush) pushNow();
  }

  return { onLogin, flush: pushNow };
})();

// มีคะแนน/ข้อมูลที่ยังไม่ขึ้นเซิร์ฟเวอร์หรือไม่ (รอสั้น ๆ — ถ้าไม่ค้างจะเสร็จทันที)
async function hasUnsyncedWrites() {
  if (typeof db === 'undefined' || !db.waitForPendingWrites) return false;
  return Promise.race([
    db.waitForPendingWrites().then(() => false, () => false),
    new Promise(r => setTimeout(() => r(true), 1500)),
  ]);
}

document.getElementById('logout-btn').addEventListener('click', async () => {
  appearanceSync.flush(); // หน้าตาที่เพิ่งแก้และยังรอส่ง → ส่งเข้าคิวก่อนออก (ให้ตรวจรวมกับคะแนนที่ค้างด้านล่าง)
  // ออกจากระบบแล้วคิวที่ค้างจะส่งขึ้นไม่ได้ (ไม่มีสิทธิ์) และข้อมูลจะหาย — เตือนก่อน
  if (await hasUnsyncedWrites()) {
    const sure = window.confirm('ยังมีคะแนนที่ยังไม่ซิงค์ขึ้นเซิร์ฟเวอร์ (อาจกำลังออฟไลน์)\nถ้าออกจากระบบตอนนี้ คะแนนเหล่านั้นจะหายไป\n\nต่อเมื่อเชื่อมต่ออินเทอร์เน็ตแล้วค่อยออกจากระบบจะปลอดภัยกว่า ต้องการออกเลยหรือไม่?');
    if (!sure) return;
  }
  await auth.signOut();
  closeMobileNav();
  // ล้างแคชข้อมูลครูคนนี้ออกจากเครื่อง (กันคนถัดไปบนเครื่องที่ใช้ร่วมกัน) แล้วโหลดหน้าใหม่
  try {
    await db.terminate();
    await db.clearPersistence();
  } catch (err) {
    console.warn('ล้างแคชในเครื่องไม่สำเร็จ (อาจเปิดหลายแท็บอยู่):', err && err.code);
  }
  location.reload();
});

// ผลลัพธ์จาก signInWithRedirect (กรณีที่ popup ถูกบล็อกแล้วใช้ redirect แทน)
// getRedirectResult จะ resolve ทันทีเป็น null ถ้าไม่ได้มาจาก redirect
auth.getRedirectResult().catch(err => {
  if (err && err.code !== 'auth/null-user') {
    showToast('เข้าสู่ระบบไม่สำเร็จ: ' + (err.message || err));
  }
});

auth.onAuthStateChanged(async (user) => {
  AppState.user = user;
  const loginScreen = document.getElementById('login-screen');
  const app = document.getElementById('app');
  // ซ่อน loading screen เมื่อ auth state พร้อมแล้ว
  const splash = document.getElementById('auth-loading');
  if (splash) { splash.classList.add('leaving'); setTimeout(() => splash.remove(), 400); } // เฟดออกนุ่มๆ แทนการหายวับ

  if (user) {
    loginScreen.classList.add('hidden');
    app.classList.remove('hidden');
    document.getElementById('user-name').textContent = user.displayName || 'ครู';
    document.getElementById('user-email').textContent = user.email || '';
    document.getElementById('user-photo').src = safePhotoUrl(user.photoURL, user.displayName);

    // สร้าง/อัปเดต profile document ของครูคนนี้
    // ไม่ await: ตอนออฟไลน์ promise ของ set() จะไม่จบจนกว่าเซิร์ฟเวอร์ตอบ ซึ่งจะบล็อกการเข้าแอป
    // (Firestore เก็บคิวไว้เองและส่งให้ทีหลัง)
    db.collection('users').doc(user.uid).set({
      displayName: user.displayName,
      email: user.email,
      photoURL: user.photoURL,
      lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true }).catch(err => console.warn('อัปเดตโปรไฟล์ไม่สำเร็จ:', err));

    appearanceSync.onLogin(user).catch(err => console.warn('ซิงค์หน้าตาไม่สำเร็จ:', err));
    navigate('dashboard');
    if (typeof islandCheckPending === 'function') islandCheckPending();
  } else {
    loginScreen.classList.remove('hidden');
    app.classList.add('hidden');
  }
});
