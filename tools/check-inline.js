#!/usr/bin/env node
// ตรวจกฎ "ห้ามสู้กันด้วย !important / ห้ามฝังสไตล์ใน JS"
//  1) style="…" ในสตริง HTML ของ js/*.js ต้องมีเฉพาะตัวแปร CSS (--c, --p, --w, …) — ค่าคงที่ให้ใช้คลาส u-* หรือคลาสของคอมโพเนนต์
//  2) css/style.css ห้ามมี !important นอกรายการที่อนุญาต (.hidden, prefers-reduced-motion)
// ใช้: node tools/check-inline.js   (exit 1 ถ้าพบ)
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const problems = [];

for (const f of fs.readdirSync(path.join(root, 'js')).filter(n => n.endsWith('.js'))) {
  fs.readFileSync(path.join(root, 'js', f), 'utf8').split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/style="([^"]*)"/g)) {
      const bad = m[1].split(';').map(s => s.trim()).filter(Boolean).filter(d => !d.startsWith('--'));
      if (bad.length) problems.push(`js/${f}:${i + 1}  style="${m[1]}"  → ใช้คลาส หรือส่งเป็นตัวแปร --xxx`);
    }
  });
}

const ALLOW = [/^\s*\.hidden\b/, /prefers-reduced-motion/];
fs.readFileSync(path.join(root, 'css/style.css'), 'utf8').split('\n').forEach((line, i) => {
  if (/!important/.test(line) && !/^\s*(\/\*|\*)/.test(line) && !ALLOW.some(re => re.test(line))) {
    problems.push(`css/style.css:${i + 1}  !important  → แก้ที่ต้นทาง (specificity/ลำดับ) แทน`);
  }
});

if (problems.length) {
  console.error(`✗ พบ ${problems.length} จุด\n\n  ` + problems.join('\n  '));
  process.exit(1);
}
console.log('✓ ไม่มี inline style แบบค่าคงที่ใน JS และไม่มี !important นอกรายการที่อนุญาต');
