// ทดสอบผู้ช่วย AI ของ ID-Plan (js/idp-ai.js + แกน js/badwork-ai.js) ด้วย jsdom — วาดฟอร์ม ID-Plan จริงแล้วตรวจ
// วิธีรัน: node tests/idp-ai.test.js   (หรือ npm run test:idpai)
// ตรวจ: id ช่องส่วนที่ 2 ครบ 33 ช่อง · ปุ่มขึ้นครบ 11 แถว · ปุ่มทำงานถูก (ช่องว่าง/วิธีมาตรฐาน/ปรับสำนวน) · พร้อต์ส่งเฉพาะบริบทที่เกี่ยวข้อง ·
//        เก็บ/ตัด aiCtx · ไม่เปลี่ยนคีย์ความยินยอมร่วม · ลงทะเบียนไฟล์ใน utils.js / sw.js ครบ
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
for(const f of ['js/doc-system.js','js/doc-shell.js','js/idp-config.js','js/idp.js','js/badwork-ai-config.js','js/badwork-ai.js','js/idp-ai.js'])vm.runInContext(read(f),ctx,{filename:f});
const settle=()=>new Promise(r=>setTimeout(r,30));
let fail=0;const ok=(c,m)=>{console.log(c?'  ✓':'  ✗',m);if(!c)fail++};

const R=code=>vm.runInContext(code,ctx);
const calls=[];let reply={};
ctx.AbortController=w.AbortController;
ctx.fetch=async(url,opt)=>{calls.push({url,body:JSON.parse(opt.body)});return {ok:true,status:200,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(reply)}]}}]})}};
const prompt=()=>calls[calls.length-1].body.contents[0].parts[0].text;
(async()=>{
 R(`docActivate('idp'); const s=docSystem('idp'); s.state.tab='form'; s.state.view='form'; s.state.docId='p1'; s.state.doc=idpBlankDoc(); Object.assign(s.state.doc,{semester:'1',year:'2569',subjects:[{name:'ค22101 คณิตศาสตร์',hours:3}],activities:[{name:'ชุมนุม',hours:1}]}); idpRenderFormView();`);
 await settle();
 const d=w.document;
 // ---- โครงฟอร์ม ----
 const cids=R(`docSystem('idp').config.competencies.map(c=>c[0])`);
 const ids=[];cids.forEach(c=>['method','goal','benefit'].forEach(f=>ids.push(`idp-${c}-${f}`)));
 ok(ids.length===33&&ids.every(i=>d.getElementById(i)),'ช่องส่วนที่ 2 มี id ครบ 33 ช่อง (11 สมรรถนะ × วิธีการ/เป้าหมาย/ประโยชน์)');
 ok(ids.every(i=>{const t=d.getElementById(i);return t.dataset.compId&&i===`idp-${t.dataset.compId}-${t.dataset.compField}`}),'id ตรงกับ data-comp-id/data-comp-field (idpCollect ยังอ่านช่องเดิมได้)');
 ok(!!d.querySelector('#idp-form > .doc-ai-top')&&!!d.querySelector('.doc-ai-top [data-doc-ai="all"]'),'การ์ดผู้ช่วย AI + ปุ่มบนสุดขึ้นที่หัวฟอร์ม');
 ok(d.querySelector('.doc-ai-top [data-doc-ai="all"]').textContent.includes('ร่างช่องที่ว่างของทุกสมรรถนะ'),'ป้ายปุ่มบนสุด');
 const rows=[...d.querySelectorAll('#idp-comps-body tr')];
 ok(rows.length===11&&rows.every(tr=>tr.querySelectorAll('td:first-child .doc-ai-row [data-doc-ai]').length===2),'ปุ่ม AI 2 ปุ่มใต้ชื่อสมรรถนะครบทั้ง 11 แถว');
 ok(d.querySelectorAll('#idp-comps-body .doc-ai-row').length===11&&d.querySelectorAll('.doc-ai-row').length===11,'ไม่มีแถวปุ่มเกิน (ส่วนที่ 1 และ 3 ไม่มีปุ่ม)');
 ok(['level','problems','wish','prev','focus'].every(k=>d.getElementById('idp-ctx-'+k)),'การ์ดบริบทงานมีช่อง idp-ctx-* ครบ 5 ช่อง (ไม่ชนกับ pa-ctx-*)');
 ok(!d.querySelector('[id^="pa-ctx-"]'),'ไม่มีช่องของ PA ปนเข้ามา');

 // ---- ปุ่มทำอะไร ----
 const rs=(act,cid)=>R(`(()=>{const s=docSystem('idp');return docAi(s).resolve(s,${JSON.stringify(act)},{dataset:{cid:${JSON.stringify(cid||'')}}})})()`);
 const keys=r=>r.specs.map(s=>s.key).join();
 let r=rs('all');
 ok(r.mode==='write'&&r.specs.length===22&&r.specs.every(s=>s.field!=='method'),'ปุ่มบนสุด (แผนใหม่): เป้าหมาย+ประโยชน์ที่ว่าง 22 ช่อง · ไม่ยิงวิธีมาตรฐาน 11 ช่อง');
 r=rs('c-write','c1');
 ok(r.mode==='write'&&keys(r)==='c1.method,c1.goal,c1.benefit'&&r.total===3,'ปุ่มเขียนของแถว: วิธีมาตรฐานที่ยังไม่ได้ปรับ + ช่องว่าง → 3 ช่อง');
 r=rs('c-polish','c1');
 ok(!!r.toast&&!r.specs,'ปรับสำนวน: ข้อความมาตรฐานของ สพฐ. ไม่ถูกปรับ · ไม่มีอะไรให้ปรับ → toast');
 // ครูเขียนเอง
 d.getElementById('idp-c1-goal').value='เพิ่มทักษะการวางแผนการสอน';
 d.getElementById('idp-c1-method').value='1. เข้าร่วม PLC กลุ่มสาระ';
 r=rs('c-write','c1'); ok(keys(r)==='c1.benefit','เขียนเอง method/goal แล้ว → ปุ่มเขียนเหลือ benefit ช่องเดียว (ไม่เขียนทับ)');
 r=rs('c-polish','c1'); ok(r.mode==='polish'&&keys(r)==='c1.method,c1.goal','ปุ่มปรับสำนวน: เฉพาะช่องที่ครูเขียนเอง');
 d.getElementById('idp-c1-benefit').value='นักเรียนเรียนรู้ได้ดีขึ้น';
 r=rs('c-write','c1'); ok(!!r.toast&&/ครบแล้ว/.test(r.toast),'ครบทุกช่อง → toast ไม่ยิง AI');
 ok(rs('all').specs.length===20,'ปุ่มบนสุดนับช่องว่างจริงหลังกรอก (22 − goal/benefit ของ c1 ที่กรอกแล้ว 2 = 20)');
 ok(rs('x-unknown','c1')===null&&rs('c-write','zz')===null,'act ที่ไม่รู้จัก/สมรรถนะที่ไม่มี → null (ไม่ทำอะไร)');
 // คืนค่า c1 เป็นแผนใหม่เพื่อทดสอบพร้อต์
 d.getElementById('idp-c1-goal').value='';d.getElementById('idp-c1-benefit').value='';
 d.getElementById('idp-c1-method').value=R(`docSystem('idp').config.competencies[0][4].join('\\n')`);

 // ---- พร้อต์ ----
 d.getElementById('idp-ctx-level').value='ม.2';
 d.getElementById('idp-ctx-problems').value='นักเรียนส่งงานไม่ครบ';
 d.getElementById('idp-ctx-wish').value='อยากใช้ AI ช่วยออกแบบแผนการสอน';
 reply={'c1.method':'1. วิเคราะห์ภารกิจ\\n2. เข้าร่วม PLC','c1.goal':'ออกแบบแผนการสอนได้ …แผน','c1.benefit':'นักเรียนส่งงานครบมากขึ้น'};
 R(`globalThis.__s=docSystem('idp')`);
 const items=await R(`badworkAiBatch(idpAiSpecs(__s,['c1']),'write',{},__s)`);
 const p1=prompt();
 ok(items.length===3&&items.every(i=>i.proposed)&&items.map(i=>i.key).join()==='c1.method,c1.goal,c1.benefit','ได้ข้อความกลับครบ 3 ช่อง ตามคีย์ c1.*');
 ok(p1.includes('รายวิชาที่สอน: ค22101 คณิตศาสตร์ (3 ชม./สัปดาห์)')&&p1.includes('ระดับชั้นที่สอน: ม.2')&&p1.includes('ปัญหาหลักที่ครูพบจริง: นักเรียนส่งงานไม่ครบ'),'สมรรถนะ c1 ได้รายวิชา · ระดับชั้น · ปัญหาหลัก (idpCollect ดึงค่าที่พิมพ์ค้างเข้า doc)');
 ok(p1.includes('สมรรถนะย่อย: 1.1 ความสามารถในการวางแผนการปฏิบัติงาน')&&p1.includes('1.4 ความสามารถในการพัฒนาการปฏิบัติงานให้มีคุณภาพ'),'หัวสมรรถนะแนบสมรรถนะย่อยจาก config');
 ok(['"c1.method"','"c1.goal"','"c1.benefit"'].every(k=>p1.includes(k))&&p1.includes('แนวทางช่อง')&&p1.includes('.method (วิธีการ / รูปแบบการพัฒนา)')&&p1.includes('.benefit (ประโยชน์ที่คาดว่าจะได้รับ)'),'พร้อต์มีคีย์ช่อง + แนวทางครั้งเดียว');
 ok(p1.includes('ข้อความเดิม')&&p1.includes('ปรับและต่อเติมข้อความเดิมให้ตรงกับงานจริง')&&p1.includes('วิเคราะห์ภารกิจงานเพื่อวางแผน'),'วิธีมาตรฐานถูกส่งเป็น "ข้อความเดิม" พร้อมคำสั่งปรับให้ตรงงานจริง');
 ok(!p1.includes('วิธีการที่ครูตั้งไว้'),'วิธีมาตรฐานไม่ถูกนับเป็น "วิธีการที่ครูตั้งไว้"');
 ok(calls[calls.length-1].body.systemInstruction.parts[0].text.includes('ID-Plan')&&calls[calls.length-1].body.model===R('badworkAiModelId()'),'คำสั่งระบบเป็นของ ID-Plan · ส่งผ่านพร็อกซีด้วยรุ่นที่เลือก');
 // c5: ไม่ส่งข้อมูลผู้เรียน/รายวิชา
 reply={'c5.goal':'ปฏิบัติตนตามจรรยาบรรณ','c5.benefit':'เป็นแบบอย่างที่ดี'};
 await R(`badworkAiBatch(idpAiSpecs(__s,['c5']).filter(s=>s.field!=='method'),'write',{},__s)`);
 const p5=prompt();
 ok(p5.includes('สิ่งที่ครูอยากพัฒนาตนเอง/วิธีที่ทำได้จริง: อยากใช้ AI ช่วยออกแบบแผนการสอน')&&!p5.includes('รายวิชาที่สอน')&&!p5.includes('ปัญหาหลักที่ครูพบจริง')&&!p5.includes('ระดับชั้นที่สอน'),'c5 (จริยธรรม) ส่งเฉพาะ wish — ไม่ส่งรายวิชา/ระดับชั้น/ปัญหา');
 ok(!p5.includes('.method (')&&p5.includes('.goal (เป้าหมาย)'),'แนวทางส่งเฉพาะชนิดช่องที่ขอ');
 // เติมวิธี + ระยะเวลาแล้ว ขอเฉพาะ goal → AI ต้องเห็นวิธี/ระยะเวลา
 d.getElementById('idp-c6-method').value='1. ทดลองใช้ PBL ในรายวิชา ค22101';
 d.querySelector('[data-comp-id="c6"][data-comp-field="startDate"]').value='ต.ค. 69';
 d.querySelector('[data-comp-id="c6"][data-comp-field="endDate"]').value='มี.ค. 70';
 reply={'c6.goal':'x'};
 await R(`badworkAiBatch(idpAiSpecs(__s,['c6']).filter(s=>s.field==='goal'),'write',{},__s)`);
 const p6=prompt();
 ok(p6.includes('วิธีการที่ครูตั้งไว้: 1. ทดลองใช้ PBL ในรายวิชา ค22101')&&p6.includes('ระยะเวลา: ต.ค. 69 – มี.ค. 70'),'ขอเฉพาะเป้าหมาย → AI เห็นวิธีการและระยะเวลาที่ครูตั้งไว้ของสมรรถนะนั้น');

 // ---- บริบทงานเก็บ/ตัดความยาว ----
 const doc=JSON.parse(R(`JSON.stringify(docSystem('idp').state.doc)`));
 ok(doc.aiCtx.level==='ม.2'&&doc.aiCtx.wish==='อยากใช้ AI ช่วยออกแบบแผนการสอน'&&doc.aiCtx.focus==='','idpCollect เก็บ aiCtx จากการ์ดบริบทเข้า doc');
 ok(doc.comps.c6.method==='1. ทดลองใช้ PBL ในรายวิชา ค22101','ช่องสมรรถนะยังเก็บเข้า doc.comps ตามเดิม');
 ok(R(`idpNormalize({aiCtx:{level:'x'.repeat(100),zzz:'no'}}).aiCtx.level.length`)===40&&R(`Object.keys(idpNormalize({}).aiCtx).join()`)==='level,problems,wish,prev,focus'&&R(`Object.keys(idpNormalize({aiCtx:'bad'}).aiCtx).length`)===5,'idpNormalize: ตัดตาม maxLen · ทิ้งคีย์แปลก · ค่าเสียกลายเป็นค่าว่าง 5 ช่อง');
 ok(R(`JSON.stringify(docSystem('idp').config.aiCtx.idPrefix)`)==='"idp-ctx-"'&&R(`docSystem('idp').config.ai.storageKeys.ctx`)==='idp-ai-ctx-v1','idPrefix/คีย์สำรองบริบทไม่ซ้ำ PA');
 // ---- ค่ากลางไม่ถูกแตะ ----
 ok(R(`BADWORK_AI_CONFIG.storageKeys.consent`)==='doc-ai-consent-v2'&&R(`BADWORK_AI_CONFIG.apiKey`)==='','คีย์ความยินยอมร่วมยังเป็น v2 · apiKey ว่าง');
 // ---- ลงทะเบียนไฟล์ ----
 const U=read('js/utils.js'),SW=read('sw.js');
 const bundle=U.match(/idp: \['doc-system'[^\]]*\]/)[0];
 ok(/'idp-ai': 'js\/idp-ai\.js'/.test(U)&&bundle.indexOf("'badwork-ai'")>0&&bundle.indexOf("'idp-ai'")>bundle.indexOf("'badwork-ai'")&&bundle.indexOf("'idp-ai'")>bundle.indexOf("'idp'"),'LAZY_MODULES + LAZY_BUNDLES.idp: idp-ai โหลดหลัง badwork-ai และ idp');
 ok(SW.includes("'js/idp-ai.js'"),'sw.js PRECACHE มี js/idp-ai.js');
 console.log(fail?'FAIL '+fail:'ALL PASS');process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
