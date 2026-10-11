// ทดสอบผู้ช่วย AI ของ SAR ส่วนที่ 2 (js/sar-ai.js + แกน js/badwork-ai.js) ด้วย jsdom — วาดฟอร์ม SAR จริงแล้วตรวจ
// วิธีรัน: node tests/sar-ai.test.js   (หรือ npm run test:sarai)
// ตรวจ: textarea ส่วนที่ 2 ครบ 8 ช่อง + แถวปุ่มที่หัวช่อง (.doc-item-h เหมือน PA/ID-Plan) · การ์ดบนสุด · ปุ่มทำงานถูก (ช่องว่าง/ปรับสำนวน/ย่อ) ·
//        พร้อต์ส่งเฉพาะบริบทที่เกี่ยวข้อง ไม่ส่งชื่อครู · เก็บ/ตัด aiCtx · บันทึกไม่เก็บคีย์ _ · ไม่ชนกับตัวต่อ 'idp' · ลงทะเบียนไฟล์ใน utils.js / sw.js ครบ
const fs=require('fs'),vm=require('vm'),path=require('path');const {JSDOM}=require('jsdom');
const ROOT=process.env.PA_ROOT?path.resolve(process.env.PA_ROOT):path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const dom=new JSDOM('<!doctype html><body><div id="view"></div></body>',{url:'http://localhost/'});const w=dom.window;
const PROFILE={prefix:'นาย',firstName:'ทดสอบ',lastName:'ตัวอย่าง',position:'ครู',school:'รร.'};
const q=()=>{const o={where:()=>o,orderBy:()=>o,limit:()=>o,get:async()=>({docs:planDocs.map(x=>({id:'p',data:()=>x}))})};return o};
const writes=[];let planDocs=[];
const col=()=>({...q(),doc:id=>({id,get:async()=>({exists:false,data:()=>undefined}),set:async()=>{},update:async d=>{writes.push({op:'update',id,d})},delete:async()=>{}}),add:async d=>{writes.push({op:'add',d});return {id:'n'}}});
const ctx={window:w,document:w.document,console,setTimeout,clearTimeout,setInterval,clearInterval,navigator:{onLine:true},location:{hostname:'x'},
 db:{collection:()=>({doc:()=>({collection:col})})},AppState:{user:{uid:'u1'},teacherProfile:PROFILE},
 firebase:{firestore:{FieldValue:{serverTimestamp:()=>'TS'}},app:()=>({options:{}})},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
 Promise,JSON,Date,Math,Object,Array,Set,Map,String,Number,Error,RegExp,URL,encodeURIComponent,
 escapeHtml:s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
 pageHeaderHtml:t=>`<h1>${t}</h1>`,initNavPill(){},clearLoading(){},loaderHtml:()=>'',_loadTimers:new Map(),showToast(){},showLoading(){},islandSave(){},islandUndo(){},
 openModal(){},closeModal(){},confirm:()=>true,requestAnimationFrame:f=>setTimeout(f,0),loadModule:async()=>{},loadModules:async()=>{},loadTeacherProfile:async()=>PROFILE,
 loadTimetable:async()=>({term:1}),ttTermLabel:()=>'ภาคเรียนที่ 1',ttStats:()=>({placed:[]}),navigate(){},getComputedStyle:w.getComputedStyle.bind(w),CSS:{escape:s=>s},Event:w.Event,HTMLElement:w.HTMLElement};
vm.createContext(ctx);
for(const f of ['js/doc-system.js','js/doc-shell.js','js/idp-config.js','js/idp.js','js/sar.js','js/records.js','js/badwork-ai-config.js','js/badwork-ai.js','js/idp-ai.js','js/sar-ai.js'])vm.runInContext(read(f),ctx,{filename:f});
const settle=()=>new Promise(r=>setTimeout(r,30));
let fail=0;const ok=(c,m)=>{console.log(c?'  ✓':'  ✗',m);if(!c)fail++};

const R=code=>vm.runInContext(code,ctx);
const calls=[];let reply={};
ctx.AbortController=w.AbortController;
ctx.fetch=async(url,opt)=>{calls.push({url,body:JSON.parse(opt.body)});return {ok:true,status:200,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(reply)}]}}]})}};
const prompt=()=>calls[calls.length-1].body.contents[0].parts[0].text;
(async()=>{
 R(`docActivate('idp'); const s=docSystem('idp'); s.state.tab='sar'; SAR.view='form'; SAR.docId='s1'; SAR.doc=sarNormalize({semester:'1',year:'2569'});
   Object.assign(SAR.doc.rows,{teaching:[{name:'ค22101 คณิตศาสตร์',room:'ม.2/1',n:'40',hours:'3'}],
     grades:[{name:'ค22101 คณิตศาสตร์',room:'ม.2/1',n:'40',g4:'10',g35:'10',g3:'10',g25:'5',g2:'5',g15:'0',g1:'0',g0:'0',r:'0',ms:'0'}],
     training:[{date:'1 ก.ค. 2569',topic:'อบรมการวัดผล',hours:'6'}]});
   SAR.doc.f.m={0:true,10:true}; SAR.doc.f.hmCls='ม.2/1'; SAR.doc.f.hmM='20'; SAR.doc.f.hmF='20'; sarRenderFormView();`);
 await settle();
 const d=w.document, form=d.getElementById('sar-form');
 const IDS=['n11','n12','n13','n14','n15','n21','n22','guide'];
 // ---- โครงฟอร์ม ----
 ok(IDS.every(k=>d.getElementById('sar-'+k)&&d.getElementById('sar-'+k).tagName==='TEXTAREA'),'textarea ส่วนที่ 2 ครบ 8 ช่อง (id sar-n11 … sar-guide)');
 ok(!!d.querySelector('#sar-form > .doc-ai-top')&&form.firstElementChild.classList.contains('doc-ai-top')&&d.querySelectorAll('.doc-ai-top').length===1,'การ์ดผู้ช่วย AI อยู่หัวฟอร์ม (เหมือนหน้าอื่น) และมีใบเดียว');
 ok(d.querySelector('.doc-ai-top [data-doc-ai="all"]').textContent.includes('ร่างช่องที่ว่างของส่วนที่ 2'),'ป้ายปุ่มบนสุด');
 ok(IDS.every(k=>{const h=d.getElementById('sar-'+k).closest('.field').querySelector('.doc-item-h');return h&&h.querySelector('label[for="sar-'+k+'"]')&&h.querySelectorAll('.doc-ai-row [data-doc-ai]').length===3}),'ทุกช่อง: แถวปุ่ม 3 ปุ่ม (เขียน/ปรับสำนวน/ย่อ) อยู่ใน .doc-item-h ขวามือของชื่อช่อง');
 ok(d.querySelectorAll('.doc-ai-row').length===8,'ไม่มีแถวปุ่มเกิน (ส่วนอื่นของ SAR ไม่มีปุ่ม)');
 ok(['level','did','media','care','problems','prev'].every(k=>d.getElementById('sar-ctx-'+k)),'การ์ดบริบทมีช่อง sar-ctx-* ครบ 6 ช่อง');
 ok(!d.querySelector('[id^="idp-ctx-"],[id^="pa-ctx-"]'),'ไม่มีช่องบริบทของระบบอื่นปนเข้ามา');
 ok(!!form.querySelector('.pa-form-footer #sar-save-btn'),'ปุ่มบันทึกเดิมยังอยู่');
 // ---- ปุ่มทำอะไร ----
 const rs=(act,f)=>R(`docAi(sarAiSys()).resolve(sarAiSys(),${JSON.stringify(act)},{dataset:{field:${JSON.stringify(f||'')}}})`);
 let r=rs('all');
 ok(r.mode==='write'&&r.specs.length===8,'ปุ่มบนสุด (ช่องว่างหมด): ร่างครบ 8 ช่อง');
 ok(rs('write','n11').specs.length===1&&rs('polish','n11').toast&&rs('shorten','n11').toast,'ช่องว่าง: เขียนได้ · ปรับสำนวน/ย่อ = แจ้งว่าไม่มีข้อความ');
 d.getElementById('sar-n11').value='ปรับคำอธิบายรายวิชาคณิตศาสตร์';d.getElementById('sar-n11').dispatchEvent(new w.Event('input',{bubbles:true}));
 await settle();
 ok(R('SAR.doc.f.n11')==='ปรับคำอธิบายรายวิชาคณิตศาสตร์','พิมพ์/ใส่ข้อความแล้ว sarCollect เก็บเข้า SAR.doc.f ตามเดิม');
 r=rs('all');ok(r.specs.length===7&&!r.specs.some(s=>s.key==='n11'),'ปุ่มบนสุด ข้ามช่องที่มีข้อความแล้ว (ไม่เขียนทับ): 7 ช่อง');
 ok(rs('write','n11').toast&&rs('polish','n11').specs[0].key==='n11'&&rs('shorten','n11').mode==='shorten','ช่องมีข้อความ: เขียนซ้ำ = แจ้ง · ปรับสำนวน/ย่อ ทำได้');
 ok(rs('xyz')===null,'act ที่ไม่รู้จักไม่ทำอะไร');
 // ---- พร้อต์ ----
 reply={n14:'ใช้การวัดผลหลายวิธี',n21:'จัดทำข้อมูลสารสนเทศ'};
 R(`badworkAiBatch(docAi(sarAiSys()).resolve(sarAiSys(),'all').specs.filter(s=>['n14','n21'].includes(s.key)),'write',{},sarAiSys())`);
 await settle();
 let p=prompt();
 ok(p.includes('รายวิชาที่สอน: ค22101 คณิตศาสตร์ ม.2/1 (40 คน 3 ชม./สัปดาห์)'),'n14: ส่งรายวิชา/ห้อง/จำนวนคน/ชั่วโมงจากตาราง');
 ok(/ผลสัมฤทธิ์ทางการเรียนรวม: เกรดเฉลี่ย 3\.\d\d/.test(p)&&p.includes('นักเรียนรวม 40 คน'),'n14: ส่งผลสัมฤทธิ์รวม (ค่าที่ระบบคำนวณ)');
 ok(p.includes('ครูที่ปรึกษา: ชั้น ม.2/1 นักเรียนรวม 40 คน'),'n21: ส่งชั้นที่ปรึกษา');
 ok(!p.includes('รูปแบบ/วิธีจัดการเรียนการสอนที่ครูเลือกไว้')&&!p.includes('การอบรม/พัฒนาตนเอง'),'ส่งเฉพาะบริบทที่เกี่ยวกับช่องที่กด (n14/n21 ไม่เห็นวิธีสอน/การอบรม)');
 ok(!p.includes('ทดสอบ')&&!p.includes('ตัวอย่าง'),'ไม่ส่งชื่อ-นามสกุลครู');
 ok(calls[calls.length-1].body.systemInstruction.parts[0].text.includes('ห้ามแต่ง')&&calls[calls.length-1].body.systemInstruction.parts[0].text.includes('ได้ดำเนินการแล้ว'),'พร้อต์ระบบ: เขียนเป็นสิ่งที่ทำแล้ว · ห้ามแต่งข้อมูล');
 reply={n12:'x'};
 R(`badworkAiBatch(docAi(sarAiSys()).resolve(sarAiSys(),'all').specs.filter(s=>s.key==='n12'),'write',{},sarAiSys())`);
 await settle();
 p=prompt();
 ok(p.includes('รูปแบบ/วิธีจัดการเรียนการสอนที่ครูเลือกไว้: การอธิบาย, การถามตอบ')&&!p.includes('การอบรม/พัฒนาตนเอง'),'n12: เห็นวิธีสอนที่ติ๊ก แต่ไม่เห็นการอบรม');
 reply={guide:'x'};
 R(`badworkAiBatch(docAi(sarAiSys()).resolve(sarAiSys(),'all').specs.filter(s=>s.key==='guide'),'write',{},sarAiSys())`);
 await settle();
 p=prompt();
 ok(p.includes('การอบรม/พัฒนาตนเอง: อบรมการวัดผล (รวม 6.0 ชั่วโมง)')&&p.includes('แผนที่ \"จะทำ\"'),'guide: เห็นการอบรม · แนวทางบอกให้เขียนเป็นอนาคตเฉพาะข้อนี้');
 // ---- บริบท aiCtx ----
 d.getElementById('sar-ctx-did').value='ทำแผนแบบสืบเสาะ 3 หน่วย';d.getElementById('sar-ctx-level').value='ม.2';
 R(`badworkAiCtxSave(null,sarAiSys())`);await settle();
 ok(R('SAR.doc.aiCtx.did')==='ทำแผนแบบสืบเสาะ 3 หน่วย'&&R('SAR.doc.aiCtx.level')==='ม.2','บริบทเข้า SAR.doc.aiCtx');
 ok(writes.some(x=>x.op==='update'&&x.id==='s1'&&x.d.aiCtx&&x.d.aiCtx.did==='ทำแผนแบบสืบเสาะ 3 หน่วย'&&Object.keys(x.d).join()==='aiCtx'),'เอกสารที่บันทึกแล้ว: เขียนเฉพาะ aiCtx ลง idp_sar (ไม่แตะช่องอื่น)');
 reply={n15:'x'};
 R(`badworkAiBatch(docAi(sarAiSys()).resolve(sarAiSys(),'all').specs.filter(s=>s.key==='n15'),'write',{},sarAiSys())`);await settle();
 ok(prompt().includes('สิ่งที่ครูทำจริงในภาคเรียนนี้: ทำแผนแบบสืบเสาะ 3 หน่วย')&&prompt().includes('ระดับชั้นที่สอน: ม.2'),'บริบทที่ครูกรอกเข้าพร้อต์');
 // ---- ผูกกับ ID-Plan ----
 R(`sarAiLoadPlan(sarAiSys())`);await settle();
 reply={n14:'x'};
 R(`badworkAiBatch(docAi(sarAiSys()).resolve(sarAiSys(),'all').specs.filter(s=>s.key==='n14'),'write',{},sarAiSys())`);await settle();
 ok(!prompt().includes('แผน ID-Plan'),'ไม่มีแผนของภาคนี้: ไม่ส่งส่วนแผน (ทำงานเหมือนเดิม)');
 planDocs=[{semester:'2',year:'2569',comps:{c6:{method:'แผนผิดภาค',goal:'x'}}},{semester:'1',year:'2569',comps:{c1:{method:'1. ใช้ข้อสอบวิเคราะห์',goal:'ร้อยละ … ผ่านเกณฑ์'},c6:{method:'1. ทดลองแผนสืบเสาะ',goal:'ออกแบบแผนได้'},c8:{method:'1. ทำข้อตกลงชั้นเรียน',goal:''}}}];
 R(`sarAiLoadPlan(sarAiSys())`);await settle();
 const gen=k=>{reply={[k]:'x'};R(`badworkAiBatch(docAi(sarAiSys()).resolve(sarAiSys(),'all').specs.filter(s=>s.key===${JSON.stringify(k)}),'write',{},sarAiSys())`);return settle().then(prompt)};
 p=await gen('n14');
 ok(p.includes('แผน ID-Plan ของภาคเรียนนี้')&&p.includes('ไม่ใช่ผลที่ทำแล้ว')&&p.includes('ใช้ข้อสอบวิเคราะห์')&&p.includes('ทดลองแผนสืบเสาะ'),'n14: เห็นแผน ID-Plan ของสมรรถนะที่เกี่ยวข้อง (c1 · c6) พร้อมคำเตือนว่าเป็นแผน');
 ok(!p.includes('ข้อตกลงชั้นเรียน')&&!p.includes('แผนผิดภาค'),'n14: ไม่เห็นสมรรถนะที่ไม่เกี่ยว (c8) และไม่ปนแผนของภาคอื่น');
 p=await gen('n21');ok(p.includes('ทำข้อตกลงชั้นเรียน')&&!p.includes('ใช้ข้อสอบวิเคราะห์'),'n21: เห็นเฉพาะแผนของ c8');
 p=await gen('guide');ok(p.includes('ใช้ข้อสอบวิเคราะห์')&&p.includes('ทำข้อตกลงชั้นเรียน'),'guide: เห็นแผนทุกสมรรถนะที่มีข้อความ');
 ok(calls[calls.length-1].body.systemInstruction.parts[0].text.includes('ไม่ใช่หลักฐานว่าทำแล้ว'),'พร้อต์ระบบ: แผนไม่ใช่หลักฐานว่าทำแล้ว');
 d.getElementById('sar-semester').value='2';p=await gen('n14');ok(!p.includes('ใช้ข้อสอบวิเคราะห์'),'เปลี่ยนภาคเรียนแต่ยังไม่โหลดแผนใหม่: ไม่ส่งแผนของภาคเดิม');
 d.getElementById('sar-semester').value='1';planDocs=[];
 // ---- ดึงอบรม/รางวัลจากข้อมูลส่วนตัว ----
 ok(!!d.getElementById('sar-rec-pull'),'มีปุ่มดึงอบรม/รางวัลจากข้อมูลส่วนตัว');
 R(`recLoadYear=async y=>y===2569?[
   {type:'award',title:'ครูดีเด่น',org:'สพม.',date:'2026-03-01',file:{name:'a.pdf'}},
   {type:'certificate',title:'เกียรติบัตรผู้สอน',org:'สพฐ.',date:'2025-11-02',file:null},
   {type:'training',title:'อบรมการวัดผล',org:'สพท.',date:'2025-07-10',hours:6},
   {type:'training',title:'อบรม AI',org:'',date:'2025-06-01',hours:0}]:[]`);
 let rr=await R(`(async()=>{const r=await sarPullRecords(SAR.doc);return JSON.stringify({r,t:SAR.doc.rows.training,a:SAR.doc.rows.awards})})()`);rr=JSON.parse(rr);
 ok(rr.r.train===2&&rr.r.award===2&&rr.t[0].topic==='อบรม AI'&&rr.t[1].topic==='อบรมการวัดผล'&&rr.t[1].hours==='6'&&rr.t[0].hours===''&&rr.t[1].org==='สพท.'&&rr.t[1].place==='','อบรม: ดึงชื่อ/หน่วยงาน/ชั่วโมง เรียงเก่า→ใหม่ · ไม่มีสถานที่');
 ok(rr.t[1].date==='10 ก.ค. 2568'&&rr.a.length===2&&rr.a[0].title==='เกียรติบัตรผู้สอน'&&rr.a[1].title==='ครูดีเด่น'&&rr.a[1].evidence==='a.pdf'&&rr.a[0].evidence==='','รางวัล: รวมเกียรติบัตร+รางวัล · วันที่ไทย · หลักฐาน = ชื่อไฟล์แนบ');
 R(`SAR.doc.year='2570'`);let r2=JSON.parse(await R(`(async()=>{const before=JSON.stringify(SAR.doc.rows.training);const r=await sarPullRecords(SAR.doc);return JSON.stringify({r,same:before===JSON.stringify(SAR.doc.rows.training)})})()`));
 ok(r2.r.train===0&&r2.r.award===0&&r2.same,'ปีที่ไม่มีข้อมูล: ไม่แตะตารางที่กรอกไว้');
 R(`SAR.doc.year='2569'`);
 // ---- บันทึก/ตัดค่า ----
 writes.length=0;
 R(`SAR.doc._ctxSeeded=true; sarSave(SAR.doc)`);await settle();
 const wr=writes.find(x=>x.op==='update'&&x.id==='s1');
 ok(!!wr&&!Object.keys(wr.d).some(k=>k.startsWith('_'))&&wr.d.aiCtx&&wr.d.aiCtx.level==='ม.2'&&wr.d.f&&wr.d.rows,'sarSave: ตัดคีย์ขึ้นต้น _ · เก็บ aiCtx · ช่องเดิมครบ');
 ok(R(`(()=>{const o=sarNormalize({aiCtx:{level:'x'.repeat(99),did:'y'.repeat(999),zzz:'ไม่ควรมี'}});return o.aiCtx.level.length===40&&o.aiCtx.did.length===300&&!('zzz' in o.aiCtx)&&Object.keys(o.aiCtx).length===6})()`),'sarNormalize: ตัด aiCtx ตาม maxLen · ทิ้งคีย์แปลก · เหลือ 6 ช่อง');
 ok(R(`Object.keys(sarNormalize({}).aiCtx).length===6&&sarNormalize({}).aiCtx.did===''`),'SAR เก่าที่ไม่มี aiCtx: ได้ค่าว่างครบ 6 ช่อง');
 // ---- วาดซ้ำ/แยกจากแผน ID-Plan ----
 R(`sarRenderFormView()`);await settle();
 ok(d.querySelectorAll('.doc-ai-top').length===1&&d.querySelectorAll('.doc-ai-row').length===8&&d.getElementById('sar-ctx-did').value==='ทำแผนแบบสืบเสาะ 3 หน่วย','วาดฟอร์มซ้ำ (เช่น หลังกดดึงข้อมูล): ไม่ติดปุ่มซ้ำ · บริบทไม่หาย');
 ok(R(`typeof DOC_AI.sar==='object'&&typeof DOC_AI.idp==='object'&&DOC_AI.sar!==DOC_AI.idp`),'ตัวต่อ sar ลงทะเบียนแยกจาก idp');
 ok(R(`sarAiSys().id==='sar'&&sarAiSys().config.aiCtx.idPrefix==='sar-ctx-'&&sarAiSys().config.ai.storageKeys.ctx==='sar-ai-ctx-v1'&&docSystem('idp').config.aiCtx.idPrefix==='idp-ctx-'`),'คีย์ AI (idPrefix · storageKeys) ของ SAR ไม่ซ้ำของแผน ID-Plan');
 ok(R(`docSystem('idp').config.ai.storageKeys.ctx!==docSystem('idp').config.sarAi.ai.storageKeys.ctx`),'คีย์ localStorage ของบริบท SAR ไม่ซ้ำ ID-Plan');
 // ---- ลงทะเบียนไฟล์ ----
 const U=read('js/utils.js'),SW=read('sw.js');
 ok(/'sar-ai':\s*'js\/sar-ai\.js'/.test(U),'utils.js: LAZY_MODULES มี sar-ai');
 const b=(U.match(/idp:\s*\[([^\]]*)\]/)||[])[1]||'';const order=[...b.matchAll(/'([^']+)'/g)].map(x=>x[1]);
 ok(order.indexOf('sar-ai')>order.indexOf('sar')&&order.indexOf('sar-ai')>order.indexOf('idp-config')&&order.indexOf('sar-ai')>order.indexOf('badwork-ai'),'LAZY_BUNDLES.idp: sar-ai โหลดหลัง sar · idp-config · badwork-ai');
 ok(SW.includes("'js/sar-ai.js'"),'sw.js PRECACHE มี js/sar-ai.js');
 console.log(fail?'\nFAIL '+fail:'\nALL PASS');process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
