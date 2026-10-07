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
    console.error(err);
    showToast('เข้าสู่ระบบไม่สำเร็จ: ' + err.message);
  }
});

// มีคะแนน/ข้อมูลที่ยังไม่ขึ้นเซิร์ฟเวอร์หรือไม่ (รอสั้น ๆ — ถ้าไม่ค้างจะเสร็จทันที)
async function hasUnsyncedWrites() {
  if (typeof db === 'undefined' || !db.waitForPendingWrites) return false;
  return Promise.race([
    db.waitForPendingWrites().then(() => false, () => false),
    new Promise(r => setTimeout(() => r(true), 1500)),
  ]);
}

document.getElementById('logout-btn').addEventListener('click', async () => {
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

auth.onAuthStateChanged(async (user) => {
  AppState.user = user;
  const loginScreen = document.getElementById('login-screen');
  const app = document.getElementById('app');

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

    navigate('dashboard');
    if (typeof islandCheckPending === 'function') islandCheckPending();
  } else {
    loginScreen.classList.remove('hidden');
    app.classList.add('hidden');
  }
});
