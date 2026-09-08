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
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const googleProvider = new firebase.auth.GoogleAuthProvider();
