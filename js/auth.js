// ==========================================================================
// Auth: Google Sign-In / Sign-Out
// ==========================================================================

const AppState = {
  user: null,          // firebase user object
  currentRoute: 'dashboard',
  currentCourseId: null,
  courses: [],          // cache รายวิชาทั้งหมดของครู
};

document.getElementById('google-signin-btn').addEventListener('click', async () => {
  try {
    await auth.signInWithPopup(googleProvider);
  } catch (err) {
    console.error(err);
    showToast('เข้าสู่ระบบไม่สำเร็จ: ' + err.message);
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await auth.signOut();
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
    document.getElementById('user-photo').src = user.photoURL || 'https://api.dicebear.com/7.x/initials/svg?seed=' + encodeURIComponent(user.displayName || 'T');

    // สร้าง/อัปเดต profile document ของครูคนนี้
    await db.collection('users').doc(user.uid).set({
      displayName: user.displayName,
      email: user.email,
      photoURL: user.photoURL,
      lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    navigate('dashboard');
  } else {
    loginScreen.classList.remove('hidden');
    app.classList.add('hidden');
  }
});
