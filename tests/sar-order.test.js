// ทดสอบลำดับและถ้อยคำหัวข้อของ SAR (js/sar.js: sarBuildBodyHtml · sarNormalize) ให้ตรงตัวอย่าง SAR-2-2568
// วิธีรัน: node tests/sar-order.test.js   (หรือ npm run test:sarorder)
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = process.env.PA_ROOT ? path.resolve(process.env.PA_ROOT) : path.join(__dirname, '..');
const ctx = {
  console, Promise, JSON, Date, Math, Object, Array, Set, Map, String, Number,
  escapeHtml: s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'),
  docNl: s => String(s).replace(/\n/g, '<br>'),
  idpProfileInfo: () => ({ name: 'นางสาวยุพิน ช่วยรัมย์', position: 'ครู', school: 'โรงเรียนหนองกี่พิทยาคม', affiliation: '', subjectGroup: 'คณิตศาสตร์' }),
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/sar.js'), 'utf8'), ctx, { filename: 'js/sar.js' });
const run = code => vm.runInContext(code, ctx);
let fail = 0; const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗', m); if (!c) fail++; };

// ลำดับหัวข้อในตัวอย่าง SAR-2-2568 (ขึ้นต้นด้วยเลขข้อ / "ส่วนที่" / "มาตรฐานที่")
const EXPECT = ['ส่วนที่ 1', '1.1', '1.2', '1.2.1', '1.2.2', '1.2.3', '1.2.4',
  'ส่วนที่ 2', '1.', '1.1', '1.2', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.4.1', '1.2.4.2', '1.2.5', '1.2.6', '1.2.7', '1.6', '1.3', '1.4', '1.5',
  '2.', '2.1', '2.2', '3.', '3.1', '3.2', '4.', '5.', '5.1', '5.2', '5.3', '5.4', '5.5', '6.',
  'ส่วนที่ 3', 'มาตรฐานที่ 1', 'มาตรฐานที่ 2', 'มาตรฐานที่ 3'];
const heads = html => [...html.matchAll(/<h([23])[^>]*>([\s\S]*?)<\/h\1>/g)].map(m => m[2].replace(/<[^>]+>/g, '').trim());
const key = h => (h.match(/^(ส่วนที่ \d|มาตรฐานที่ \d)/) || h.match(/^(\d+(?:\.\d+)*\.?)(?=\s)/) || [''])[0];
const build = d => run('(d => sarBuildBodyHtml(sarNormalize(d), {}))')(d);

console.log('A · ฟอร์มว่าง: หัวข้อครบและเรียงตามตัวอย่าง (หัวข้อไม่หายเมื่อช่องว่าง)');
{
  const h = heads(build({ semester: '2', year: '2568' }));
  const got = h.map(key);
  ok(got.join('|') === EXPECT.join('|'), 'ลำดับหัวข้อตรงตัวอย่าง ' + EXPECT.length + ' หัวข้อ' + (got.join('|') === EXPECT.join('|') ? '' : '\n    ได้: ' + got.join(' ')));
}

console.log('B · ถ้อยคำหัวข้อ');
{
  const html = build({ semester: '2', year: '2568', f: { period: '1 ตุลาคม 2568 ถึง 30 เมษายน 2569' } });
  const h = heads(html);
  const has = t => h.some(x => x.includes(t));
  ok(has('1.2.1 ปฏิบัติการสอนภาคเรียนที่ 2 ปีการศึกษา 2568'), '1.2.1 มีภาคเรียน/ปีการศึกษาต่อท้าย');
  ok(has('1.2.2 กิจกรรมพัฒนาผู้เรียน ที่ปฏิบัติการพัฒนาผู้เรียนภาคเรียนที่ 2 ปีการศึกษา 2568'), '1.2.2 ตามตัวอย่าง');
  ok(has('1.2.4 ข้อมูลเกี่ยวกับเวลาการมาปฏิบัติหน้าที่ราชการ(1 ตุลาคม 2568 ถึง 30 เมษายน 2569)'), '1.2.4 มีช่วงเวลาที่รายงานในวงเล็บ');
  ok(has('3. ด้านการพัฒนาตนเองและพัฒนาวิชาชีพ (1 ตุลาคม 2568 ถึง 30 เมษายน 2569)'), 'หัวข้อ 3 มีช่วงเวลาที่รายงานในวงเล็บ');
  ok(has('1. ด้านการจัดการเรียนการสอน') && html.includes('สายครูผู้สอน)'), 'หัวข้อ 1 มีข้อความกำกับ');
  ok(has('1.3 การสร้างและหรือพัฒนาสื่อ นวัตกรรม เทคโนโลยีทางการศึกษา และแหล่งเรียนรู้'), '1.3 ครบ "ทางการศึกษา"');
  ok(has('1.5 ศึกษา วิเคราะห์ สังเคราะห์ และหรือวิจัย เพื่อแก้ปัญหาหรือพัฒนาการเรียนรู้ที่ส่งผลต่อคุณภาพผู้เรียน'), '1.5 ครบ "ที่ส่งผลต่อคุณภาพผู้เรียน"');
  ok(has('ด้านสถานศึกษา / ครู / นักเรียน'), 'หัวข้อ 4 ครบท้ายหัวข้อ');
  ok(has('เพื่อการประกันคุณภาพภายในของสถานศึกษา'), 'ส่วนที่ 3 ครบท้ายหัวข้อ');
  ok(html.includes('สรุปได้ว่า ระดับคุณภาพการปฏิบัติงาน') && (html.match(/สรุปได้ว่า ระดับคุณภาพการปฏิบัติงาน/g) || []).length === 5, 'งานอื่น ๆ: "สรุปได้ว่า…" ครบ 5 กลุ่ม');
  ok(!html.includes('(ออกแบบหน่วยการเรียนรู้ ·'), 'ไม่มีวงเล็บรวมสามหัวข้อต่อท้าย 1.2 แบบเดิม');
}

console.log('C · เนื้อหาอยู่ใต้หัวข้อที่ถูกต้อง');
{
  const html = build({ semester: '2', year: '2568', f: { n11: 'AAA', n121: 'BBB', n122: 'CCC', n123: 'DDD', n13: 'EEE', n14: 'FFF', n15: 'GGG', n21: 'HHH', n22: 'III', guide: 'JJJ' }, rows: { duty0: [{ name: 'สอนตามคำสั่ง' }], duty1: [{ name: 'ครูที่ปรึกษา' }, { name: 'เวร' }] }, lv: { survey: [5], plan: [4] } });
  const at = t => html.indexOf(t);
  const order = ['AAA', 'BBB', 'CCC', 'DDD', 'ผลสัมฤทธิ์ทางวิชาการของผู้เรียน', 'ระดับคุณภาพ ดีมาก', 'EEE', 'FFF', 'GGG', 'HHH', 'III', '5.1.1 สอนตามคำสั่ง', '5.2.2 เวร', 'JJJ'].map(at);
  ok(order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1])), 'n11 → n121–n123 → ตาราง 1.2.4 → 1.6 → n13–n15 → n21–n22 → งานอื่น → guide เรียงถูก');
}

console.log('D · ข้อมูลเก่า (ช่อง n12 เดิม) ไม่หาย');
{
  const d = JSON.parse(JSON.stringify(run('sarNormalize')({ f: { n12: 'ข้อความเก่า 1.2' } })));
  ok(d.f.n121 === 'ข้อความเก่า 1.2' && !('n12' in d.f) && d._n12 === true, 'n12 → n121 ทั้งก้อน · ลบ n12 · ตั้งธงแจ้งในฟอร์ม');
  const e = JSON.parse(JSON.stringify(run('sarNormalize')({ f: { n12: 'เก่า', n122: 'ใหม่' } })));
  ok(e.f.n122 === 'ใหม่' && !e.f.n121 && !('n12' in e.f) && !e._n12, 'ถ้ามีช่องใหม่อยู่แล้ว ไม่เขียนทับ');
  const g = JSON.parse(JSON.stringify(run('sarNormalize')({ f: { n12: '' } })));
  ok(!('n12' in g.f) && !g._n12, 'n12 ว่าง: ลบทิ้งเงียบ ๆ ไม่ขึ้นแจ้งเตือน');
  const again = run('sarNormalize')(run('sarNormalize')({ f: { n12: 'เก่า' } }));
  ok(again.f.n121 === 'เก่า' && again._n12 === true, 'normalize ซ้ำ (วาดฟอร์มซ้ำ) ผลคงเดิม');
}

console.log(fail ? `\nไม่ผ่าน ${fail}` : '\nALL PASS');
process.exit(fail ? 1 : 0);
