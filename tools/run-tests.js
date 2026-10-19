// รันทุกชุดเทสต์ใน tests/*.test.js ทีละชุด แล้วสรุปผล — ใช้ใน `npm test` และ CI (.github/workflows/ci.yml)
//   node tools/run-tests.js            รันทั้งหมด
//   node tools/run-tests.js tra worker  รันเฉพาะไฟล์ที่ชื่อมีคำเหล่านี้
// ชุดใหม่ที่เพิ่มใน tests/ จะถูกรันเองอัตโนมัติ (ไม่ต้องมาแก้รายการที่นี่)
// รันทีละชุด (ไม่ขนาน) เพราะบางชุดพึ่งเวลา (sleep) และอาจเพี้ยนถ้าเครื่องโหลดหนัก
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'tests');
const only = process.argv.slice(2);
const TIMEOUT_MS = 120000;

const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.js'))
  .filter(f => !only.length || only.some(k => f.includes(k)))
  .sort();
if (!files.length) { console.error('ไม่พบไฟล์เทสต์' + (only.length ? ' ที่ตรงกับ: ' + only.join(', ') : '')); process.exit(1); }

const failed = [];
const t0 = Date.now();
for (const f of files) {
  const args = [path.join('tests', f)];
  if (f === 'score-logic.test.js') args.push('.');       // ชุดนี้รับพาธโปรเจกต์เป็นอาร์กิวเมนต์
  const s = Date.now();
  const r = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: TIMEOUT_MS });
  const ms = Date.now() - s;
  const good = r.status === 0 && !r.error;
  console.log(`${good ? '✓' : '✗'} ${f} (${(ms / 1000).toFixed(1)}s)`);
  if (!good) {
    failed.push(f);
    const out = ((r.stdout || '') + (r.stderr || '')).trim().split('\n');
    const bad = out.filter(l => /✗|Error|FAIL|ไม่ผ่าน/.test(l));
    console.log((bad.length ? bad : out.slice(-8)).slice(0, 12).map(l => '    ' + l).join('\n'));
    if (r.error) console.log('    ' + (r.error.code === 'ETIMEDOUT' ? `หมดเวลา ${TIMEOUT_MS / 1000}s` : r.error.message));
  }
}
console.log(`\n${files.length - failed.length}/${files.length} ชุดผ่าน · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (failed.length) { console.log('ไม่ผ่าน: ' + failed.join(', ')); process.exit(1); }
