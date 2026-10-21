// สร้างคู่คีย์ VAPID สำหรับแจ้งเตือนคาบสอน (Web Push)
//   node tools/gen-vapid.js
// public key  → ใส่ใน worker/wrangler.toml (VAPID_PUBLIC_KEY) และ js/timetable.js (TT_PUSH.vapidKey)
// private key → ห้ามใส่ในไฟล์/คอมมิต · ตั้งด้วย  npx wrangler secret put VAPID_PRIVATE_KEY
const { webcrypto: c } = require('crypto');
(async () => {
  const kp = await c.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = Buffer.from(await c.subtle.exportKey('raw', kp.publicKey)).toString('base64url');
  const priv = (await c.subtle.exportKey('jwk', kp.privateKey)).d;
  console.log('VAPID public key  (ใส่ในโค้ดได้):\n' + pub + '\n');
  console.log('VAPID private key (เก็บเป็นความลับ · ตั้งด้วย wrangler secret put VAPID_PRIVATE_KEY):\n' + priv + '\n');
})();
