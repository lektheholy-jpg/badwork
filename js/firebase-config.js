// ==========================================================================
// วางค่า Firebase config ของโปรเจกต์คุณตรงนี้
// หาได้จาก Firebase Console > Project settings > General > Your apps > SDK setup
// ==========================================================================
const firebaseConfig = {
  apiKey: "AIzaSyANOCrtJ8lfNj_yLFsEMhRwFmzPgoyLSiE",
  authDomain: "mywork-lektheholy.firebaseapp.com",
  projectId: "mywork-lektheholy",
  storageBucket: "mywork-lektheholy.firebasestorage.app",
  messagingSenderId: "556231214049",
  appId: "1:556231214049:web:90a10308d23f022dcdc8a0",
  measurementId: "G-45DZX5VS76"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ==========================================================================
// ออฟไลน์: เก็บแคช + คิวเขียนไว้ใน IndexedDB ของเครื่อง
//   - คะแนนที่พิมพ์ตอนไม่มีเน็ตจะค้างในคิว (รอดแม้รีเฟรช/ปิดแท็บ) แล้วส่งขึ้นเองเมื่อกลับมาออนไลน์
//   - เปิดหลายแท็บพร้อมกันได้ (synchronizeTabs)
//   - ต้องเรียกก่อนใช้ db อย่างอื่นทุกอย่าง จึงอยู่ในไฟล์นี้
// FS_PERSISTENCE: 'pending' (กำลังเปิด) | 'on' | 'off' (เบราว์เซอร์ไม่รองรับ/โหมดส่วนตัว) | 'single-tab'
// ส่วนอื่นของแอปอ่านค่านี้เพื่อบอกผู้ใช้ตามจริงว่าคะแนน "บันทึกในเครื่องแล้ว" หรือไม่
// ==========================================================================
let FS_PERSISTENCE = 'pending';
const FS_PERSISTENCE_READY = db.enablePersistence({ synchronizeTabs: true })
  .then(() => { FS_PERSISTENCE = 'on'; })
  .catch((err) => {
    // failed-precondition = เปิดหลายแท็บแบบไม่ซิงค์กัน (เวอร์ชันเก่า) · unimplemented = เบราว์เซอร์ไม่รองรับ
    FS_PERSISTENCE = err && err.code === 'failed-precondition' ? 'single-tab' : 'off';
    console.warn('Firestore persistence ใช้ไม่ได้:', err && err.code);
  });
const googleProvider = new firebase.auth.GoogleAuthProvider();
