// ทดสอบ js/worker.js: ตรวจ token (รวม email_verified) · rate limit ต่อ uid · ส่งคีย์ผ่าน header · ไม่แตะเครือข่ายจริง
// worker.js เป็น ESM แต่โปรเจกต์เป็น CJS → คัดลอกเป็น .mjs ชั่วคราวแล้ว import
const fs = require('fs'), os = require('os'), path = require('path'), { webcrypto: crypto } = require('crypto');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m); };
const b64u = b => Buffer.from(b).toString('base64url');

(async () => {
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wk-')), 'worker.mjs');
  fs.copyFileSync(path.join(__dirname, '..', 'js', 'worker.js'), tmp);
  const worker = (await import(tmp)).default;

  const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', kp.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  const PID = 'proj';
  const token = async (over = {}) => {
    const now = Math.floor(Date.now() / 1000);
    const head = b64u(JSON.stringify({ alg: 'RS256', kid: 'k1' }));
    const pl = b64u(JSON.stringify({ aud: PID, iss: 'https://securetoken.google.com/' + PID, sub: 'u1', iat: now - 5, exp: now + 3600, email_verified: true, ...over }));
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, new TextEncoder().encode(head + '.' + pl));
    return `${head}.${pl}.${b64u(Buffer.from(sig))}`;
  };

  let upstream = null;
  global.fetch = async (url, init) => {
    if (String(url).includes('securetoken')) return new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'cache-control': 'max-age=3600' } });
    upstream = { url: String(url), init };
    return new Response('{"ok":1}', { status: 200 });
  };

  const O = 'https://site.example';
  const mk = async (tok, body) => new Request('https://w.example', { method: 'POST', headers: { Origin: O, Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(body || { model: 'gemini-x', contents: [] }) });
  const env = (extra = {}) => ({ ALLOWED_ORIGINS: O, FIREBASE_PROJECT_ID: PID, GEMINI_API_KEY: 'SECRET', ...extra });

  let r = await worker.fetch(await mk(await token()), env());
  ok(r.status === 200, 'token ถูกต้อง + ยืนยันอีเมลแล้ว → ผ่าน');
  ok(upstream && !upstream.url.includes('SECRET') && !upstream.url.includes('key='), 'คีย์ไม่อยู่ใน URL');
  ok(upstream && upstream.init.headers['x-goog-api-key'] === 'SECRET', 'คีย์ส่งผ่าน header x-goog-api-key');

  r = await worker.fetch(await mk(await token({ email_verified: false })), env());
  ok(r.status === 401, 'อีเมลยังไม่ยืนยัน → 401');
  r = await worker.fetch(await mk(await token({ email_verified: undefined })), env());
  ok(r.status === 401, 'ไม่มีฟิลด์ email_verified → 401');
  r = await worker.fetch(await mk(await token({ aud: 'other' })), env());
  ok(r.status === 401, 'token ของโปรเจกต์อื่น → 401');

  const calls = [];
  const RATE_LIMITER = { limit: async ({ key }) => { calls.push(key); return { success: calls.length <= 2 }; } };
  const st = [];
  for (let i = 0; i < 3; i++) st.push((await worker.fetch(await mk(await token()), env({ RATE_LIMITER }))).status);
  ok(st.join() === '200,200,429', 'เกินโควตา → 429 (ได้ ' + st.join() + ')');
  ok(calls.every(k => k === 'u1'), 'นับโควตาแยกตาม uid');

  upstream = null;
  r = await worker.fetch(await mk(await token(), { model: '../evil', contents: [] }), env());
  ok(r.status === 400 && !upstream, 'ชื่อรุ่นแปลก → 400 และไม่ยิงต่อ');

  console.log(`\nผลรวม: ผ่าน ${pass}, ไม่ผ่าน ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
