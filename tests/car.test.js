// ทดสอบระบบเอกสาร "วิจัยในชั้นเรียน" (js/car-config.js · js/car.js · js/car-ai.js) ด้วย jsdom — สร้างโดย tools/new-doc-system.js
// วิธีรัน: node tests/car.test.js   (หรือ npm run test:car)
// ตรวจ: ลงทะเบียน/collection · normalize · โครงฟอร์ม (หัว/ท้าย/ปุ่ม) · เก็บค่ากลับ · ตัวต่อ AI (ปุ่ม/ช่อง/บริบท) ·
//        ลงทะเบียนไฟล์ใน utils.js / sw.js / app.js / index.html / firestore.rules ครบ
// เพิ่มเทสต์ของช่อง/ตัวอย่างพิมพ์ของเอกสารจริงต่อท้ายไฟล์นี้ (ดูรูปแบบจาก tests/idp-list.test.js · tests/idp-ai.test.js)
const fs=require('fs'),vm=require('vm'),path=require('path');const {JSDOM}=require('jsdom');
const ROOT=process.env.PA_ROOT?path.resolve(process.env.PA_ROOT):path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const dom=new JSDOM('<!doctype html><body><div id="view"></div></body>',{url:'http://localhost/'});const w=dom.window;
const PROFILE={prefix:'นาย',firstName:'ทดสอบ',lastName:'ตัวอย่าง',position:'ครู',school:'รร.'};
const q=()=>{const o={where:()=>o,orderBy:()=>o,limit:()=>o,get:async()=>({docs:[]})};return o};
const col=()=>({...q(),doc:id=>({id,get:async()=>({exists:false,data:()=>undefined}),set:async()=>{},update:async()=>{},delete:async()=>{}}),add:async()=>({id:'n'})});
const ctx={window:w,document:w.document,console,setTimeout,clearTimeout,setInterval,clearInterval,navigator:{onLine:true},location:{hostname:'x'},
 db:{collection:()=>({doc:()=>({collection:col})})},AppState:{user:{uid:'u1'},teacherProfile:PROFILE},
 firebase:{firestore:{FieldValue:{serverTimestamp:()=>'TS'}},app:()=>({options:{}})},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
 Promise,JSON,Date,Math,Object,Array,Set,Map,String,Number,Error,RegExp,URL,encodeURIComponent,
 escapeHtml:s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
 pageHeaderHtml:t=>`<h1>${t}</h1>`,initNavPill(){},clearLoading(){},loaderHtml:()=>'',_loadTimers:new Map(),showToast(){},showLoading(){},islandSave(){},islandUndo(){},
 openModal(){},closeModal(){},confirm:()=>true,requestAnimationFrame:f=>setTimeout(f,0),loadModule:async()=>{},loadModules:async()=>{},loadTeacherProfile:async()=>PROFILE,
 loadTimetable:async()=>({term:1}),ttTermLabel:()=>'ภาคเรียนที่ 1',ttStats:()=>({placed:[]}),navigate(){},getComputedStyle:w.getComputedStyle.bind(w),CSS:{escape:s=>s},Event:w.Event,HTMLElement:w.HTMLElement};
vm.createContext(ctx);
for(const f of ['js/doc-system.js','js/doc-shell.js','js/car-config.js','js/car.js','js/badwork-ai-config.js','js/badwork-ai.js','js/car-ai.js'])vm.runInContext(read(f),ctx,{filename:f});
const settle=()=>new Promise(r=>setTimeout(r,30));
let fail=0;const ok=(c,m)=>{console.log(c?'  ✓':'  ✗',m);if(!c)fail++};
const R=code=>vm.runInContext(code,ctx);
(async()=>{
 // ---- ลงทะเบียน / config ----
 ok(R(`docSystemIds().includes('car')`),'ลงทะเบียน car ใน doc-system แล้ว');
 ok(R(`docSystem('car').config.collections.docs`)==='car_docs','collection = car_docs');
 ok(R(`docSystem('car').config.aiCtx.idPrefix`)==='car-ctx-'&&R(`docSystem('car').config.ai.storageKeys.ctx`)==='car-ai-ctx-v1','คีย์ AI (idPrefix · storageKeys) เป็นของระบบนี้');
 ok(R(`docSystem('car').config.tabs[0][0]`)==='form'&&R(`docSystem('car').state.tab`)==='form','แท็บแรก = form (แท็บเริ่มต้น)');

 // ---- normalize / blank ----
 const blank=JSON.parse(R(`JSON.stringify(carBlankDoc())`));
 ok(blank.status==='draft'&&blank.title===''&&blank.background===''&&blank.semester==='1'&&blank.stats.length===4&&blank.objectives.length===0,'เอกสารเปล่า: ร่าง · ช่องว่าง · ภาคเรียน 1 · ตารางสถิติ 4 แถว');
 ok(R(`carNormalize({background:'x'}).background`)==='x'&&R(`typeof carNormalize({aiCtx:'bad'}).aiCtx`)==='object','normalize คงค่าเดิม · aiCtx ผิดชนิดถูกแทนด้วยออบเจ็กต์');
 ok(R(`JSON.stringify(carNormalize({objectives:['ก','  ',null,'ข'],stats:[{total:16,on:13}]}))`).includes('"objectives":["ก","ข"]')&&R(`carNormalize({stats:[{total:16,on:13}]}).stats[0].late`)==='','normalize: รายการตัดช่องว่าง · แถวสถิติมีครบ 4 คีย์เป็นสตริง');

 // ---- รายการ (ว่าง) ----
 R(`docActivate('car'); const s=docSystem('car'); s.state.tab='form'; s.state.view='list'; carRenderListView();`);
 await settle();
 const d=w.document;
 ok(d.body.innerHTML.includes('ยังไม่มี วิจัยในชั้นเรียน'),'รายการว่างขึ้นข้อความ "ยังไม่มี วิจัยในชั้นเรียน"');

 // ---- ฟอร์ม ----
 R(`const s2=docSystem('car'); s2.state.view='form'; s2.state.docId='p1'; s2.state.doc=carBlankDoc(); carRenderFormView();`);
 await settle();
 const form=d.getElementById('car-form'),foot=form&&form.querySelector('.pa-form-footer'),head=d.querySelector('.pa-form-head');
 ok(!!form&&!!foot&&foot===form.lastElementChild&&foot.querySelector('#car-save-btn')&&foot.querySelector('#car-cancel-btn'),'ปุ่มบันทึก + ยกเลิกอยู่ใน .pa-form-footer ท้ายฟอร์ม (โครงเดียวกับ PA/ID-Plan)');
 ok(foot.querySelector('#car-save-btn').textContent.trim()==='บันทึก วิจัยในชั้นเรียน'&&foot.querySelector('#car-save-btn').classList.contains('btn-primary'),'ปุ่มบันทึกเป็นปุ่มหลัก ข้อความล้วน');
 ok(!!head&&head.nextElementSibling===form&&head.querySelector('#car-back-btn'),'ปุ่ม "← กลับ" อยู่ที่หัวหน้า (.pa-form-head) ก่อนฟอร์ม');
 ok(!!foot.querySelector('#car-del-btn')&&foot.firstElementChild.id==='car-del-btn','เอกสารที่บันทึกแล้ว: ปุ่มลบอยู่ซ้ายสุดของแถวปุ่มท้ายฟอร์ม');

 // ---- เก็บค่ากลับ ----
 d.getElementById('car-title').value=' เรื่องทดสอบ ';d.getElementById('car-background').value='ที่มา';d.getElementById('car-year').value='2570';
 d.querySelector('.doc-lrows[data-list="objectives"] .doc-l-name').value='เพื่อแก้ปัญหา';
 const rows0=d.querySelectorAll('#car-stat-body tr');
 const setRow=(tr,v)=>['total','on','late','none'].forEach((k,i)=>{tr.querySelector(`[data-k="${k}"]`).value=v[i]});
 setRow(rows0[0],['16','13','','3']);
 R(`carCollect()`);
 const got=JSON.parse(R(`JSON.stringify(docSystem('car').state.doc)`));
 ok(got.title==='เรื่องทดสอบ'&&got.background==='ที่มา'&&got.year==='2570','Collect: ตัดช่องว่างหัวท้าย · เก็บ title/background/year');
 ok(JSON.stringify(got.objectives)==='["เพื่อแก้ปัญหา"]','Collect: เก็บรายการวัตถุประสงค์ (ตัดแถวว่าง)');
 ok(got.stats.length===1&&got.stats[0].total==='16'&&got.stats[0].on==='13'&&got.stats[0].none==='3','Collect: เก็บตารางสถิติ (ตัดแถวว่างทั้งแถว)');

 // ---- ตารางสถิติ: คำนวณสด · เพิ่ม/ลบแถว ----
 setRow(rows0[1],['16','12','1','3']);
 rows0[0].querySelector('input').dispatchEvent(new w.Event('input',{bubbles:true}));
 const cellOf=(tr,p)=>tr.querySelector(`[data-p="${p}"]`).textContent;
 ok(cellOf(rows0[0],'pOn')==='81.25'&&cellOf(rows0[0],'pNone')==='18.75'&&cellOf(rows0[1],'pLate')==='6.25','ฟอร์ม: ร้อยละรายแถวคำนวณสดตอนพิมพ์ (13/16=81.25 · 3/16=18.75 · 1/16=6.25)');
 ok(d.querySelector('tfoot [data-a="on"]').textContent==='12.50'&&d.querySelector('tfoot [data-a="pOn"]').textContent==='78.13','ฟอร์ม: ค่าเฉลี่ยส่งตามกำหนด 12.50 คน = ร้อยละ 78.13 (เฉลี่ยจากแถวที่กรอก)');
 setRow(rows0[2],['16','10','1','1']); // 10+1+1 = 12 ≠ 16
 rows0[0].querySelector('input').dispatchEvent(new w.Event('input',{bubbles:true}));
 ok(d.getElementById('car-stat-warn').textContent.includes('ชิ้นงานที่ 3'),'ฟอร์ม: ผลรวมไม่เท่าจำนวนนักเรียน → เตือนเลขชิ้นงานที่ผิด');
 d.getElementById('car-add-row').click();
 ok(d.querySelectorAll('#car-stat-body tr').length===5&&d.querySelector('#car-stat-body tr:last-child .car-no').textContent==='5','กดเพิ่มชิ้นงาน → แถวใหม่ เลขลำดับต่อเนื่อง');
 d.querySelector('#car-stat-body tr .car-del-row').click();
 ok(d.querySelectorAll('#car-stat-body tr').length===4&&d.querySelector('#car-stat-body tr .car-no').textContent==='1','กดลบแถว → เลขลำดับเรียงใหม่');
 d.getElementById('car-fill-results').click();
 ok(d.getElementById('car-results').value.startsWith('จากตารางที่ 1 พบว่า'),'ปุ่ม "เติมข้อความจากตาราง" ใส่ประโยคสรุปจากตัวเลขจริง');
 d.getElementById('car-results').value='';

 // ---- ตัวต่อ AI ----
 ok(!!d.querySelector('#car-form > .doc-ai-top')&&!!d.querySelector('.doc-ai-top [data-doc-ai="all"]'),'การ์ดผู้ช่วย AI + ปุ่มบนสุดขึ้นที่หัวฟอร์ม');
 const specs=R(`carAiSpecs(docSystem('car')).map(s=>s.el)`);
 ok(specs.length>0&&specs.every(i=>d.getElementById(i)),'ทุกช่องที่ให้ AI เขียน มี textarea id ตรงกับ specs: '+specs);
 ok(d.querySelectorAll('.doc-ai-row [data-doc-ai]').length===specs.length*2,'ปุ่ม AI 2 ปุ่ม (เขียน/ปรับสำนวน) ใต้ป้ายของทุกช่อง');
 ok(!!d.getElementById('car-ctx-note')&&!d.querySelector('[id^="pa-ctx-"]')&&!d.querySelector('[id^="idp-ctx-"]'),'ช่องบริบท car-ctx-* ขึ้น ไม่มีช่องของระบบอื่นปน');
 const rs=(act,f)=>R(`(()=>{const s=docSystem('car');return docAi(s).resolve(s,${JSON.stringify(act)},{dataset:{field:${JSON.stringify(f||'')}}})})()`);
 d.getElementById('car-background').value='';
 let r=rs('all');
 ok(r&&r.mode==='write'&&r.specs.length===specs.length,'ปุ่มบนสุด: ช่องว่างทุกช่องถูกส่งไปเขียน');
 r=rs('polish',specs[0].replace('car-',''));
 ok(r&&r.toast&&!r.specs,'ปรับสำนวนช่องที่ว่าง → แจ้งว่ายังไม่มีข้อความ (ไม่เรียก AI)');
 d.getElementById('car-background').value='ข้อความเดิม';
 r=rs('write',specs[0].replace('car-',''));
 ok(r&&r.toast&&!r.specs,'เขียนช่องที่มีข้อความแล้ว → ไม่เขียนทับ');
 r=rs('polish',specs[0].replace('car-',''));
 ok(r&&r.mode==='polish'&&r.specs.length===1,'ปรับสำนวนช่องที่มีข้อความ → ส่งช่องนั้นช่องเดียว');
 ok(rs('unknown')===null,'act ที่ไม่รู้จัก → null');
 const prompt=R(`(()=>{const s=docSystem('car');return docAi(s).context(s,{},docAi(s).scope(s,carAiSpecs(s)))})()`);
 ok(prompt.includes('ภาคเรียนที่')&&prompt.includes('ตำแหน่ง'),'บริบทที่ส่ง AI มีภาคเรียน/ตำแหน่ง');

 // ---- สถิติ: ข้อมูลจากรายงานตัวอย่าง (16 คน · 4 ชิ้นงาน) ----
 const calc=JSON.parse(R(`JSON.stringify(carStatCalc([{total:'16',on:'13',late:'',none:'3'},{total:'16',on:'12',late:'1',none:'3'},{total:'16',on:'12',late:'1',none:'3'},{total:'16',on:'13',late:'1',none:'2'}]))`));
 ok(calc.count===4&&calc.rows.every(r=>!r.mismatch),'สถิติ: 4 ชิ้นงานผลรวมตรงจำนวนนักเรียนทุกแถว (ไม่เตือน)');
 ok(calc.rows[0].pOn===81.25&&calc.rows[3].pNone===12.5,'สถิติ: ร้อยละรายแถวตรงกับรายงานตัวอย่าง (81.25 · 12.5)');
 ok(calc.avg.on===12.5&&calc.avg.pOn===78.13&&calc.avg.none===2.75&&calc.avg.pNone===17.19,'สถิติ: ค่าเฉลี่ยส่งตามกำหนด 12.50 (78.13%) · ไม่ส่ง 2.75 (17.19%) ตรงกับรายงานตัวอย่าง');
 ok(calc.avg.late===0.75&&calc.avg.pLate===4.69&&Math.abs(calc.avg.pOn+calc.avg.pLate+calc.avg.pNone-100)<0.05,'สถิติ: ส่งช้าเฉลี่ยทุกชิ้นงาน 0.75 (4.69%) → ร้อยละรวม 3 กลุ่ม = 100 (ไม่เกินเหมือนการเฉลี่ยเฉพาะแถวที่มีค่า)');
 ok(R(`carStatCalc([{total:'',on:'',late:'',none:''}]).avg`)===null&&R(`carStatCalc([{total:'0',on:'0'}]).rows[0].pOn`)===null,'สถิติ: แถวว่าง = ไม่นับ · หารด้วย 0 = ไม่มีร้อยละ (ไม่เป็น NaN/Infinity)');
 ok(R(`carStatCalc([{total:'๑๖',on:'๑๓',late:'0',none:'๓'}]).rows[0].pOn`)===81.25&&R(`carNum('1,200')`)===1200&&R(`carNum('-3')`)===null&&R(`carNum('abc')`)===null,'ตัวเลข: รับเลขไทย · ตัดจุลภาค · ค่าติดลบ/ตัวอักษร = ไม่ใช่ตัวเลข');

 // ---- ตัวอย่างพิมพ์ ----
 const PD={semester:'1',year:'2568',title:'การแก้ปัญหาการส่งงาน',level:'มัธยมศึกษาปีที่ 2',location:'อำเภอแหลมสิงห์ จังหวัดจันทบุรี',background:'ย่อหน้าแรก\nย่อหน้าสอง',objectives:['เพื่อแก้ปัญหา','เพื่อศึกษาความพึงพอใจ'],tools:['แบบประเมิน'],
   statsTitle:'แสดงการส่งงานผ่านระบบ',stats:[{total:'16',on:'13',late:'',none:'3'},{total:'16',on:'12',late:'1',none:'3'}],conclusion:'สรุป',signDate:'8 มิ.ย. 2569'};
 const html=R(`carBuildPreviewHtml(${JSON.stringify(PD)},${JSON.stringify(PROFILE)})`);
 const pdoc=new JSDOM(html).window.document;
 const secs=pdoc.querySelectorAll('#doc-src section');
 ok(secs.length===1&&pdoc.querySelectorAll('#doc-src .d1-break').length===1,'พิมพ์: 1 section · มีตัวแบ่งหน้า 1 จุด (หลังปก)');
 ok([...secs[0].children].every(n=>n.tagName!=='UL'&&n.tagName!=='OL'),'พิมพ์: ทุกบล็อกเป็นลูกตรงของ section (ตัวตัดหน้าตัดทีละบล็อกได้)');
 const txt=pdoc.querySelector('#doc-src').textContent;
 ok(txt.includes('วิจัยในชั้นเรียน')&&txt.includes('เรื่อง การแก้ปัญหาการส่งงาน')&&txt.includes('ของนักเรียนระดับชั้นมัธยมศึกษาปีที่ 2')&&txt.includes('ประจำปีการศึกษา 2568'),'พิมพ์: ปกรายงาน (ชื่อเรื่อง · ระดับชั้น · ปีการศึกษา)');
 ok(txt.includes('นายทดสอบ ตัวอย่าง')&&txt.includes('ตำแหน่ง ครู')&&txt.includes('อำเภอแหลมสิงห์ จังหวัดจันทบุรี'),'พิมพ์: ผู้รายงาน/ตำแหน่ง ดึงจากข้อมูลส่วนตัว · อำเภอ/จังหวัดจากฟอร์ม');
 ok(['1. ความสำคัญและที่มา','2. วัตถุประสงค์ในการวิจัย','3. สมมติฐานสำหรับการวิจัย','4. ขอบเขตของการวิจัย','5. ประโยชน์ที่คาดว่าจะได้รับ','6. วิธีดำเนินการวิจัย','7. ผลการวิเคราะห์ข้อมูล','สรุปผล'].every(t=>txt.includes(t)),'พิมพ์: หัวข้อ 1–7 + สรุปผล ครบตามแบบรายงาน');
 ok(pdoc.querySelectorAll('.d1-li').length>=3&&txt.includes('1. เพื่อแก้ปัญหา')&&txt.includes('2. เพื่อศึกษาความพึงพอใจ')&&txt.includes('- แบบประเมิน'),'พิมพ์: รายการใส่เลขข้อให้เอง · เครื่องมือขึ้นต้นด้วยขีด');
 ok(pdoc.querySelectorAll('.d1-p').length>=2&&txt.includes('ย่อหน้าแรก')&&txt.includes('ย่อหน้าสอง'),'พิมพ์: ขึ้นบรรทัดใหม่ = แยกย่อหน้า');
 const tb=pdoc.querySelector('.d1-tb');
 ok(!!tb&&tb.parentElement===secs[0]&&tb.tHead.rows.length===2&&tb.tBodies[0].rows.length===3,'พิมพ์: ตารางที่ 1 เป็นลูกตรงของ section · หัว 2 ชั้น · 2 แถวข้อมูล + ค่าเฉลี่ย');
 ok(tb.tBodies[0].rows[0].cells[4].textContent==='-'&&tb.tBodies[0].rows[0].cells[5].textContent==='-','พิมพ์: ส่งช้า 0 คน แสดง "-" ทั้งจำนวนและร้อยละ (เหมือนรายงานตัวอย่าง)');
 ok(tb.tBodies[0].lastElementChild.cells[0].textContent==='ค่าเฉลี่ย'&&tb.tBodies[0].lastElementChild.cells[3].textContent==='78.13','พิมพ์: แถวค่าเฉลี่ยท้ายตาราง คำนวณจากแถวที่กรอก');
 ok(txt.includes('ตารางที่ 1 แสดงการส่งงานผ่านระบบ'),'พิมพ์: หัวตารางที่ 1 ใช้ชื่อตารางจากฟอร์ม');
 ok(txt.includes('วันที่ 8 มิ.ย. 2569'),'พิมพ์: วันที่ลงนามท้ายเอกสาร');
 const empty=new JSDOM(R(`carBuildPreviewHtml(carBlankDoc(),null)`)).window.document;
 ok(!empty.querySelector('.d1-tb')&&empty.querySelector('#doc-src').textContent.includes('…'),'พิมพ์: เอกสารเปล่า = ไม่มีตาราง · ช่องว่างเป็นจุดไข่ปลาให้เขียนเอง');
 ok(!html.includes('<script')&&!/>\s*<img/.test(html)&&html.includes('&lt;')===false,'พิมพ์: ไม่มีสคริปต์/รูป ในเอกสารที่ส่งให้ iframe');
 const evil=new JSDOM(R(`carBuildPreviewHtml(${JSON.stringify({title:'<img src=x onerror=1>',background:'<b>x</b>',objectives:['<script>1</script>'],stats:[{total:'1',on:'1'}],statsTitle:'<i>t</i>'})},null)`)).window.document;
 ok(!evil.querySelector('#doc-src img')&&!evil.querySelector('#doc-src script')&&evil.querySelectorAll('#doc-src b').length===1&&!evil.querySelector('#doc-src i')&&evil.querySelector('#doc-src').textContent.includes('<b>x</b>'),'พิมพ์: ข้อความที่กรอกถูก escape ทุกช่อง (ไม่ฉีด HTML ลงเอกสาร)');

 // ---- ลงทะเบียนไฟล์ครบทุกจุด (กันลืมแล้วหน้าเปิดไม่ได้/ออฟไลน์พัง) ----
 const U=read('js/utils.js'),SW=read('sw.js'),APP=read('js/app.js'),HTML=read('index.html'),RULES=read('firestore.rules');
 ok(['car-config','car-ai'].every(k=>new RegExp(`['"]?${k}['"]?:\\s*'js/${k}.js'`).test(U))&&/car:\s*'js\/car.js'/.test(U),'utils.js: LAZY_MODULES มีไฟล์ของระบบครบ 3 ไฟล์');
 ok(/car:\s*\['doc-system',\s*'doc-shell',\s*'car-config',\s*'car',\s*'badwork-ai-config',\s*'badwork-ai',\s*'car-ai'\]/.test(U),'utils.js: LAZY_BUNDLES.car เรียงลำดับ doc-system → doc-shell → config → UI → AI');
 ok(/docConfigs:\s*\[[^\]]*'car-config'/.test(U),'utils.js: docConfigs มี car-config (ส่งออก/ลบข้อมูลของระบบนี้ได้)');
 ok(['js/car-config.js','js/car.js','js/car-ai.js'].every(f=>SW.includes(`'${f}'`)),'sw.js PRECACHE มีไฟล์ของระบบครบ');
 ok(APP.includes("'car-page': LAZY_BUNDLES.car")&&/return renderDocPage\('car'\)/.test(APP)&&/\[[^\]]*'car-page'[^\]]*\]\.forEach\(addTile\)/.test(APP),'app.js: ROUTE_MODULES · renderRoute (return) · ไทล์เมนู "เพิ่มเติม" บนมือถือ');
 ok(HTML.includes('data-route="car-page"'),'index.html: มีปุ่มเมนู car-page');
 ok(/match \/car_docs\/\{docId\}/.test(RULES),'firestore.rules: มี collection car_docs');

 console.log(fail?'FAIL '+fail:'ALL PASS');process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
