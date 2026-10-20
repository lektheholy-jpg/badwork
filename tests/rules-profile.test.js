// กันลืม deploy/แก้ firestore.rules ให้ตรงกับฟิลด์โปรไฟล์ในโค้ด
// ทดสอบ: ฟิลด์ใน PROFILE_FIELDS (js/profile.js) + education + logo ต้องตรงกับ hasOnly(...) ของ validTeacherProfile ใน firestore.rules
// และทุกฟิลด์ข้อความต้องมี okStr(...) กำกับความยาว · วิธีรัน: npm run test:rules
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (!c && x !== undefined ? ' ' + JSON.stringify(x) : '')); };
const root = path.join(__dirname, '..');
const rules = fs.readFileSync(process.env.RULES_PATH || path.join(root, 'firestore.rules'), 'utf8').replace(/\r\n/g, '\n');
const prof = fs.readFileSync(path.join(root, 'js', 'profile.js'), 'utf8').replace(/\r\n/g, '\n');

const pf = prof.match(/const PROFILE_FIELDS = \[([\s\S]*?)\];/);
ok(!!pf, 'พบ PROFILE_FIELDS ใน js/profile.js');
const codeFields = pf ? [...pf[1].replace(/\/\/.*$/gm, '').matchAll(/'([^']+)'/g)].map(m => m[1]) : [];
const expected = [...codeFields, 'education', 'logo'];

const fn = rules.match(/function validTeacherProfile\(p\)[\s\S]*?\n    }\n/);
ok(!!fn, 'พบ validTeacherProfile ใน firestore.rules');
const body = fn ? fn[0] : '';
const ho = body.match(/hasOnly\(\[([\s\S]*?)\]\)/);
const ruleFields = ho ? [...ho[1].matchAll(/'([^']+)'/g)].map(m => m[1]) : [];

ok(ruleFields.length > 0, 'อ่านรายชื่อฟิลด์จาก hasOnly ใน rules ได้');
const missingInRules = expected.filter(f => !ruleFields.includes(f));
const extraInRules = ruleFields.filter(f => !expected.includes(f));
ok(!missingInRules.length, 'ทุกฟิลด์ที่แอปเขียนมีอยู่ใน rules (ถ้าไม่ครบ = ผู้ใช้จะเจอ permission-denied)', missingInRules);
ok(!extraInRules.length, 'rules ไม่มีฟิลด์เกินที่โค้ดไม่ได้ใช้', extraInRules);

const unchecked = ruleFields.filter(f => f !== 'education' && f !== 'salary' && !new RegExp(`okStr\\(p\\.get\\('${f}'`).test(body));
ok(!unchecked.length, 'ทุกฟิลด์ข้อความมี okStr จำกัดความยาว', unchecked);

console.log(`\n${pass} ผ่าน · ${fail} ไม่ผ่าน`);
process.exit(fail ? 1 : 0);
