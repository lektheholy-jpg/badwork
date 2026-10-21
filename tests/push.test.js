// ทดสอบแจ้งเตือนก่อนเริ่มคาบ (Web Push): worker/worker.js (เข้ารหัส RFC 8291 · VAPID · /push/sync · cron) + sw.js + js/timetable.js
// ไม่แตะเครือข่ายจริง — ถอดรหัสข้อความที่ Worker เข้ารหัสด้วยกุญแจฝั่ง "เบราว์เซอร์จำลอง" เพื่อพิสูจน์ว่าเบราว์เซอร์จริงถอดได้
const fs = require('fs'), os = require('os'), path = require('path'), { webcrypto: crypto } = require('crypto');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m); };
const b64u = b => Buffer.from(b).toString('base64url');
const fromB64u = s => new Uint8Array(Buffer.from(s, 'base64url'));
const te = new TextEncoder(), td = new TextDecoder();
const cat = (...a) => Buffer.concat(a.map(x => Buffer.from(x)));

async function hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8));
}
// ถอดรหัสแบบที่เบราว์เซอร์ทำ (RFC 8291 ส่วนผู้รับ) — เขียนแยกจากฝั่งเข้ารหัสโดยตั้งใจ
async function decrypt(body, uaPriv, uaPubRaw, authSecret) {
  const salt = body.slice(0, 16), rs = new DataView(body.buffer, body.byteOffset).getUint32(16), idlen = body[20];
  const asPub = body.slice(21, 21 + idlen), ct = body.slice(21 + idlen);
  const asKey = await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, uaPriv, 256));
  const ikm = await hkdf(authSecret, secret, cat(te.encode('WebPush: info\0'), uaPubRaw, asPub), 32);
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), ct));
  return { rs, text: td.decode(plain.slice(0, plain.lastIndexOf(2))) };
}

(async () => {
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wkp-')), 'worker.mjs');
  fs.copyFileSync(path.join(__dirname, '..', 'worker', 'worker.js'), tmp);
  const W = await import(tmp), worker = W.default;

  // ---- เบราว์เซอร์จำลอง: คู่กุญแจ + auth secret ----
  const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const uaPub = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey));
  const authSecret = crypto.getRandomValues(new Uint8Array(16));
  const EP = 'https://fcm.googleapis.com/fcm/send/abc123';
  const sub = { endpoint: EP, keys: { p256dh: b64u(uaPub), auth: b64u(authSecret) } };

  // ---- VAPID คู่กุญแจ (ทำเหมือน tools/gen-vapid.js) ----
  const vk = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const VPUB = b64u(await crypto.subtle.exportKey('raw', vk.publicKey)), VPRIV = (await crypto.subtle.exportKey('jwk', vk.privateKey)).d;
  const VENV = { VAPID_PUBLIC_KEY: VPUB, VAPID_PRIVATE_KEY: VPRIV, VAPID_SUBJECT: 'mailto:t@example.com' };

  console.log('เข้ารหัส/ถอดรหัส');
  const msg = JSON.stringify({ t: 'อีก 5 นาที · คณิตศาสตร์', b: 'ม.2/1 · 08:40 น.', tag: 'tt-1-08:40' });
  const enc = await W.pushEncrypt(sub, msg);
  const dec = await decrypt(enc, ua.privateKey, uaPub, authSecret);
  ok(dec.text === msg, 'เบราว์เซอร์ถอดได้ข้อความเดิม (รวมภาษาไทย)');
  ok(dec.rs === 4096 && enc[20] === 65, 'ส่วนหัว: record size 4096 · key length 65');
  ok(b64u(await W.pushEncrypt(sub, msg)) !== b64u(enc), 'ทุกครั้งใช้ salt/กุญแจชั่วคราวใหม่ (ไม่ซ้ำ)');
  const wrong = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  let bad = false; try { await decrypt(enc, wrong.privateKey, uaPub, authSecret); } catch (e) { bad = true; }
  ok(bad, 'เครื่องอื่นที่ไม่มีกุญแจถอดไม่ได้');

  console.log('VAPID');
  const hdr = await W.vapidAuth(VENV, EP);
  const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(hdr);
  ok(!!m && m[4] === VPUB, 'รูปแบบ Authorization ถูกต้อง และแนบ public key');
  const claims = JSON.parse(td.decode(fromB64u(m[2])));
  ok(claims.aud === 'https://fcm.googleapis.com' && claims.sub === 'mailto:t@example.com' && claims.exp > Date.now() / 1000 && claims.exp <= Date.now() / 1000 + 86400, 'aud = origin ของ push service · exp ไม่เกิน 24 ชม.');
  ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, vk.publicKey, fromB64u(m[3]), te.encode(m[1] + '.' + m[2])), 'ลายเซ็น ES256 ตรวจผ่านด้วย public key');

  console.log('ตรวจ endpoint / ข้อมูลที่ส่งมา');
  ok(W.pushEndpointOk(EP) && W.pushEndpointOk('https://updates.push.services.mozilla.com/wpush/v2/x') && W.pushEndpointOk('https://web.push.apple.com/x') && W.pushEndpointOk('https://wns2-par02p.notify.windows.com/w/?token=x'), 'รับ endpoint ของ Chrome/Firefox/Safari/Edge');
  ok(!W.pushEndpointOk('http://fcm.googleapis.com/x') && !W.pushEndpointOk('https://evil.example/x') && !W.pushEndpointOk('https://fcm.googleapis.com.evil.example/x') && !W.pushEndpointOk('https://169.254.169.254/') && !W.pushEndpointOk('nope'), 'ปฏิเสธ http · โดเมนอื่น · โดเมนสวมรอย · IP ภายใน');
  const good = { subscription: sub, lead: 5, items: [{ day: 1, start: '8:40', title: '  คณิต   ศาสตร์ ', cls: 'ม.2/1', room: '301' }, { day: 6, start: '09:00', title: 'x' }, { day: 2, start: '25:00', title: 'x' }, { day: 2, start: '09:00', title: '' }] };
  const c = W.cleanSync(good);
  ok(c && c.items.length === 1 && c.items[0].start === '08:40' && c.items[0].title === 'คณิต ศาสตร์', 'ล้างข้อมูล: เวลาเติมศูนย์ · ตัดช่องว่างซ้ำ · ทิ้งรายการที่วัน/เวลา/ชื่อผิด');
  ok(W.cleanSync({ ...good, subscription: { ...sub, keys: { p256dh: 'AAAA', auth: sub.keys.auth } } }) === null, 'p256dh ความยาวผิด → ปฏิเสธ');
  ok(W.cleanSync({ ...good, lead: 9999 }).lead === 60 && W.cleanSync({ ...good, lead: 'x' }).lead === 5, 'lead จำกัด 1–60 · ค่าแปลก = 5');
  const meta = W.pushMeta(c);
  ok(meta.lead === 5 && meta.t.join() === '1@08:40', 'metadata เก็บเวลาเริ่มคาบไว้กรองตอน cron');
  // 120 รายการที่ วัน@เวลา ไม่ซ้ำกันเลย (เกินจริงมาก · ตารางครูจริงมักไม่ถึง 40) เพื่อดันให้เกินขีดจำกัด 1 KB ของ metadata
  const big = { lead: 5, items: Array.from({ length: 120 }, (_, i) => ({ day: 1 + i % 5, start: String(7 + Math.floor(i / 60)).padStart(2, '0') + ':' + String(i % 60).padStart(2, '0') })) };
  ok(new Set(big.items.map(i => i.day + '@' + i.start)).size === 120, 'ข้อมูลทดสอบไม่ซ้ำกัน 120 ค่า');
  ok(W.pushMeta(big).t === undefined, 'ตารางใหญ่จน metadata เกิน 1 KB → ตัด t ทิ้ง (cron จะอ่านเต็มแทน)');

  console.log('เวลาไทย');
  const th = (y, mo, d, h, mi) => Date.UTC(y, mo - 1, d, h - 7, mi);      // เวลาไทย → ms
  let tn = W.thaiNow(th(2026, 10, 21, 8, 35));                              // พุธ
  ok(tn.day === 3 && tn.hm === '08:35', 'แปลง UTC → เวลาไทย (พุธ 08:35)');
  ok(W.thaiNow(Date.UTC(2026, 9, 20, 18, 0)).day === 3, 'ข้ามเที่ยงคืน UTC แล้วเป็นวันถัดไปตามเวลาไทย');
  ok(W.addMin('08:35', 5) === '08:40' && W.addMin('09:57', 5) === '10:02' && W.addMin('23:58', 5) === null, 'บวกนาทีข้ามชั่วโมง · ข้ามเที่ยงคืน = null');

  // ---- worker.fetch: /push/sync · /push/unsubscribe ----
  const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', kp.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  const PID = 'proj', O = 'https://site.example';
  const token = async (sub_ = 'u1') => {
    const now = Math.floor(Date.now() / 1000), head = b64u(JSON.stringify({ alg: 'RS256', kid: 'k1' }));
    const pl = b64u(JSON.stringify({ aud: PID, iss: 'https://securetoken.google.com/' + PID, sub: sub_, iat: now - 5, exp: now + 3600, email_verified: true }));
    return `${head}.${pl}.${b64u(Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, te.encode(head + '.' + pl))))}`;
  };
  const sent = [];                      // push ที่ Worker ยิงออกไป
  let pushStatus = 201, geminiHit = 0;
  global.fetch = async (url, init) => {
    if (String(url).includes('securetoken')) return new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'cache-control': 'max-age=3600' } });
    if (String(url).includes('generativelanguage')) { geminiHit++; return new Response('{}'); }
    sent.push({ url: String(url), init });
    return new Response(null, { status: pushStatus });
  };
  const kv = () => {
    const m = new Map();
    return { m,
      get: async (k, t) => m.has(k) ? (t === 'json' ? JSON.parse(m.get(k).v) : m.get(k).v) : null,
      put: async (k, v, o) => { m.set(k, { v, o }); },
      delete: async k => { m.delete(k); },
      list: async ({ prefix }) => ({ keys: [...m].filter(([k]) => k.startsWith(prefix)).map(([name, x]) => ({ name, metadata: x.o && x.o.metadata })), list_complete: true }) };
  };
  const PUSH = kv();
  const env = { ALLOWED_ORIGINS: O, FIREBASE_PROJECT_ID: PID, GEMINI_API_KEY: 'S', PUSH, ...VENV };
  const call = async (p, body, tok, e = env) => worker.fetch(new Request('https://w.example' + p, { method: 'POST', headers: { Origin: O, Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), e);

  console.log('/push/sync · /push/unsubscribe');
  let r = await call('/push/sync', good, await token());
  ok(r.status === 200 && PUSH.m.size === 1, 'sync สำเร็จ → เก็บ 1 รายการ');
  const [k0, v0] = [...PUSH.m][0];
  ok(k0.startsWith('s:u1:') && v0.o.expirationTtl === 60 * 86400 && v0.o.metadata.t.join() === '1@08:40', 'คีย์ขึ้นต้นด้วย uid · มีอายุ 60 วัน · มี metadata');
  ok(!k0.includes('fcm.googleapis') && k0.length < 60, 'คีย์ไม่มี endpoint ดิบ (ใช้แฮช)');
  await call('/push/sync', good, await token());
  ok(PUSH.m.size === 1, 'ซิงก์ซ้ำจากเครื่องเดิม = เขียนทับ ไม่เพิ่มแถว');
  await call('/push/sync', good, await token('u2'));
  ok(PUSH.m.size === 2, 'คนละ uid แยกกัน');
  r = await call('/push/sync', { ...good, subscription: { ...sub, endpoint: 'https://evil.example/x' } }, await token());
  ok(r.status === 400 && PUSH.m.size === 2, 'endpoint นอกรายชื่อ → 400 ไม่เก็บ');
  r = await call('/push/sync', good, 'garbage');
  ok(r.status === 401, 'ไม่มี token ที่ถูกต้อง → 401');
  r = await call('/push/sync', good, await token(), { ...env, PUSH: undefined });
  ok(r.status === 503, 'ยังไม่ตั้ง KV → 503 (ไม่ล้ม)');
  r = await call('/push/unsubscribe', { endpoint: EP }, await token('u2'));
  ok(r.status === 200 && PUSH.m.size === 1 && [...PUSH.m][0][0].startsWith('s:u1:'), 'unsubscribe ลบเฉพาะของ uid ตัวเอง');
  geminiHit = 0;
  r = await call('/', { model: 'gemini-x', contents: [] }, await token());
  ok(r.status === 200 && geminiHit === 1, 'เส้นทางเดิม (Gemini) ยังทำงานตามเดิม');

  console.log('cron ส่งแจ้งเตือน');
  await call('/push/sync', { ...good, items: [{ day: 3, start: '08:40', title: 'คณิตศาสตร์', cls: 'ม.2/1', room: '301' }, { day: 3, start: '09:30', title: 'ภาษาไทย' }, { day: 4, start: '10:00', title: 'วิทย์' }] }, await token());
  sent.length = 0;
  let res = await W.runReminders(env, th(2026, 10, 21, 8, 35));            // พุธ 08:35 → คาบ 08:40 พอดี
  ok(res.sent === 1 && sent.length === 1 && sent[0].url === EP, 'พุธ 08:35 → ส่ง 1 ครั้งไป endpoint ของเครื่อง');
  const body = new Uint8Array(sent[0].init.body);
  const out = JSON.parse((await decrypt(body, ua.privateKey, uaPub, authSecret)).text);
  ok(out.t === 'อีก 5 นาที · คณิตศาสตร์' && out.b === 'ม.2/1 · 301 · 08:40 น.' && out.tag === 'tt-3-08:40', 'เนื้อหาที่ได้: หัวข้อ/ห้อง/เวลา ถูกต้อง');
  const h = sent[0].init.headers;
  ok(/^vapid t=.+, k=/.test(h.Authorization) && h['Content-Encoding'] === 'aes128gcm' && h.TTL === '240' && h.Urgency === 'high', 'ส่วนหัวครบ: vapid · aes128gcm · TTL 4 นาที · urgency high');
  sent.length = 0;
  for (const [hh, mm] of [[8, 34], [8, 36], [8, 40]]) await W.runReminders(env, th(2026, 10, 21, hh, mm));
  ok(sent.length === 0, 'นาทีอื่น (08:34 / 08:36 / 08:40) ไม่ส่ง');
  await W.runReminders(env, th(2026, 10, 22, 8, 35));                       // พฤหัส — คาบนี้เป็นของวันพุธ
  ok(sent.length === 0, 'วันอื่นที่เวลาเดียวกันไม่ส่ง');
  await W.runReminders(env, th(2026, 10, 24, 8, 35));                       // เสาร์
  ok(sent.length === 0, 'เสาร์–อาทิตย์ไม่ส่ง');
  await W.runReminders(env, th(2026, 10, 21, 9, 25));                       // 09:30 − 5
  ok(sent.length === 1, 'คาบที่สองของวันเดียวกัน (09:30) ส่งแยกตามเวลาของมัน');
  sent.length = 0;
  res = await W.runReminders({ ...env, PUSH: undefined }, th(2026, 10, 21, 8, 35));
  ok(res.sent === 0 && sent.length === 0, 'ไม่มี KV → ไม่ทำอะไร ไม่ error');
  res = await W.runReminders({ ...env, VAPID_PRIVATE_KEY: '' }, th(2026, 10, 21, 8, 35));
  ok(res.sent === 0 && sent.length === 0, 'ไม่มี VAPID private key → ไม่ส่ง');

  // ตารางใหญ่ (ไม่มี t ใน metadata) ต้องยังส่งถูกเวลา
  PUSH.m.clear();
  await call('/push/sync', { ...good, items: [{ day: 3, start: '08:40', title: 'วิชา0' }, ...big.items.filter(i => i.start !== '08:40').slice(0, 110).map((i, n) => ({ ...i, day: 3, title: 'วิชา' + (n + 1) }))] }, await token());
  ok(PUSH.m.size === 1 && !('t' in [...PUSH.m][0][1].o.metadata), 'ตารางใหญ่เก็บแบบไม่มี t');
  sent.length = 0;
  await W.runReminders(env, th(2026, 10, 21, 8, 35));
  ok(sent.length === 1, 'ตารางใหญ่ (ไม่มี metadata) ยังส่งถูกเวลา');

  // เครื่องที่เลิกรับ (410) ถูกลบ
  pushStatus = 410; sent.length = 0;
  await W.runReminders(env, th(2026, 10, 21, 8, 35));
  ok(PUSH.m.size === 0, 'push service ตอบ 410 → ลบ subscription ทิ้ง');
  pushStatus = 201;

  // scheduled() ใช้เวลาของ cron
  await call('/push/sync', { ...good, items: [{ day: 3, start: '08:40', title: 'คณิต' }] }, await token());
  sent.length = 0; const waits = [];
  await worker.scheduled({ scheduledTime: th(2026, 10, 21, 8, 35) }, env, { waitUntil: p => waits.push(p) });
  await Promise.all(waits);
  ok(sent.length === 1, 'scheduled() ส่งตามเวลา event.scheduledTime');

  console.log('sw.js · js/timetable.js · config');
  const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  ok(/addEventListener\('push'/.test(sw) && /showNotification\(/.test(sw), 'sw.js: รับ push แล้วแสดงการแจ้งเตือนทุกครั้ง');
  ok(/addEventListener\('notificationclick'/.test(sw) && /openWindow\(SCOPE\)/.test(sw), 'sw.js: กดการแจ้งเตือนแล้วเปิด/โฟกัสแอป');
  const tt = fs.readFileSync(path.join(__dirname, '..', 'js', 'timetable.js'), 'utf8');
  ok(/userVisibleOnly: true/.test(tt) && /applicationServerKey/.test(tt), 'timetable.js: สมัครรับแบบ userVisibleOnly + VAPID key');
  ok(/lead: 5/.test(tt), 'ตั้งเตือนล่วงหน้า 5 นาที');
  ok(/function saveTimetable[\s\S]*?ttPushSync\(\)/.test(tt), 'บันทึกตารางแล้วซิงก์ให้ตัวส่งแจ้งเตือน');
  const toml = fs.readFileSync(path.join(__dirname, '..', 'worker', 'wrangler.toml'), 'utf8');
  ok(/\* 0-10 \* \* 1-5/.test(toml), 'wrangler.toml: มีตัวอย่าง cron (UTC 00–10 = 07:00–17:59 ไทย · จ.–ศ.)');
  ok(!/VAPID_PRIVATE_KEY\s*=/.test(toml), 'private key ไม่อยู่ในไฟล์ตั้งค่า');

  console.log(`\n${pass} ผ่าน · ${fail} ไม่ผ่าน`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
