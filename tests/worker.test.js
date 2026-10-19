// ทดสอบ worker/worker.js: ตรวจ token (รวม email_verified) · rate limit ต่อ uid · ส่งคีย์ผ่าน header · ไม่แตะเครือข่ายจริง
// worker.js เป็น ESM แต่โปรเจกต์เป็น CJS → คัดลอกเป็น .mjs ชั่วคราวแล้ว import
const fs = require('fs'), os = require('os'), path = require('path'), { webcrypto: crypto } = require('crypto');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m); };
const b64u = b => Buffer.from(b).toString('base64url');

(async () => {
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wk-')), 'worker.mjs');
  fs.copyFileSync(path.join(__dirname, '..', 'worker', 'worker.js'), tmp);
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

  // ---- ตัวคุมค่าใช้จ่าย: โดเมนอีเมล · โควตารายวัน ----
  const kv = () => { const m = new Map(); return { m, get: async k => m.has(k) ? m.get(k) : null, put: async (k, v) => { m.set(k, v) } } };
  upstream = null;
  r = await worker.fetch(await mk(await token({ email: 'a@school.ac.th' })), env({ ALLOWED_EMAIL_DOMAINS: 'school.ac.th' }));
  ok(r.status === 200, 'โดเมนตรงที่อนุญาต → ผ่าน');
  upstream = null;
  r = await worker.fetch(await mk(await token({ email: 'a@gmail.com' })), env({ ALLOWED_EMAIL_DOMAINS: 'school.ac.th' }));
  ok(r.status === 403 && !upstream, 'Gmail ส่วนตัวเมื่อจำกัดโดเมน → 403 และไม่ยิง Gemini');
  r = await worker.fetch(await mk(await token({ email: 'a@evil.school.ac.th' })), env({ ALLOWED_EMAIL_DOMAINS: 'school.ac.th' }));
  ok(r.status === 403, 'โดเมนย่อย/ปลอมที่ลงท้ายคล้ายกัน → 403');
  r = await worker.fetch(await mk(await token({ email: 'a@school.ac.th.evil.com' })), env({ ALLOWED_EMAIL_DOMAINS: 'school.ac.th' }));
  ok(r.status === 403, 'school.ac.th.evil.com → 403');
  r = await worker.fetch(await mk(await token({ email: undefined })), env({ ALLOWED_EMAIL_DOMAINS: 'school.ac.th' }));
  ok(r.status === 403, 'token ไม่มีอีเมลเมื่อจำกัดโดเมน → 403');
  r = await worker.fetch(await mk(await token({ email: 'a@gmail.com' })), env());
  ok(r.status === 200, 'ไม่ตั้ง ALLOWED_EMAIL_DOMAINS → ไม่จำกัด (พฤติกรรมเดิม)');

  let QUOTA = kv();
  const q = () => env({ QUOTA, DAILY_LIMIT_PER_USER: '2' });
  const sts = [];
  for (let i = 0; i < 3; i++) sts.push((await worker.fetch(await mk(await token()), q())).status);
  ok(sts.join() === '200,200,429', 'โควตารายวันต่อคน: ครั้งที่ 3 → 429 (ได้ ' + sts.join() + ')');
  upstream = null;
  r = await worker.fetch(await mk(await token()), q());
  ok(r.status === 429 && !upstream && r.headers.get('Retry-After') === '3600', 'เกินโควตา → ไม่ยิง Gemini + Retry-After');
  r = await worker.fetch(await mk(await token({ sub: 'u2' })), q());
  ok(r.status === 200, 'ผู้ใช้อื่นไม่โดนโควตาของ u1');

  QUOTA = kv();
  const g = () => env({ QUOTA, DAILY_LIMIT_GLOBAL: '2' });
  const gs = [];
  for (const sub of ['a', 'b', 'c']) gs.push((await worker.fetch(await mk(await token({ sub })), g())).status);
  ok(gs.join() === '200,200,429', 'เพดานรวมทุกคน: คนที่ 3 → 429 (ได้ ' + gs.join() + ')');

  const { dayKey, takeDaily } = await import(tmp);
  QUOTA = kv();
  const e1 = env({ QUOTA, DAILY_LIMIT_PER_USER: '1' });
  const t0 = Date.UTC(2026, 9, 19, 12, 0, 0);
  ok(await takeDaily(e1, 'x', t0) && !(await takeDaily(e1, 'x', t0)), 'ใช้ครบ 1 ครั้ง → ครั้งต่อไปไม่ได้');
  ok(await takeDaily(e1, 'x', t0 + 24 * 3600 * 1000), 'ขึ้นวันใหม่ → โควตารีเซ็ต');
  ok(dayKey(Date.UTC(2026, 9, 19, 17, 30)) === '2026-10-20' && dayKey(Date.UTC(2026, 9, 19, 16, 30)) === '2026-10-19', 'ตัดวันที่เที่ยงคืนเวลาไทย (17:00 UTC)');
  ok(await takeDaily(env({ DAILY_LIMIT_PER_USER: '1' }), 'x'), 'ไม่มี KV binding → ข้าม (ไม่ล้ม)');

  console.log(`\nผลรวม: ผ่าน ${pass}, ไม่ผ่าน ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
