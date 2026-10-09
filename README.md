# MyScore — ระบบบันทึกคะแนนสำหรับครู

เว็บ HTML/CSS/JavaScript (vanilla) เชื่อม Firebase (Authentication + Firestore) · ใช้งานออฟไลน์ได้ (PWA)

> สร้างหน้าใหม่ / แก้ UI: อ่าน [STYLE-GUIDE.md](STYLE-GUIDE.md) ก่อน (คลาส สี การ์ด ตาราง แท็บ ตัวโหลด)

## กฎ CSS (สำคัญ)

**ห้ามเขียน CSS ใน JS** — สไตล์ทั้งหมดอยู่ที่ `css/style.css` ที่เดียว แล้วรัน `./build-css.sh`

- ห้ามใส่ `<style>…</style>` ในสตริง HTML/template ของไฟล์ `js/*.js`
- ห้ามสร้าง stylesheet ด้วย JS (`createElement('style')`, `insertRule`, `adoptedStyleSheets`)
- ห้ามฝัง `style="…"` ที่เป็นค่าคงที่ และห้ามตั้ง `el.style.*` — ใช้คลาส (`u-*`, `.hidden`, `is-ok` / `is-bad` / `is-clickable`)
- ค่าที่มาจากข้อมูล ส่งผ่านตัวแปร CSS เท่านั้น: `style="--c:…"` (สี) · `--p` (ความกว้าง %) · `--w` (สีวิดเจ็ต) แล้วให้ CSS เป็นคนนำไปใช้
- สีใช้ `var(--…)` เท่านั้น ห้ามเขียนรหัสสีตรงๆ (โหมดมืดจะไม่ทำงาน)
- `!important` ใช้ได้เฉพาะ `.hidden` และ `prefers-reduced-motion`
- แก้ `css/style.css` เท่านั้น ห้ามแก้ `style.min.css` ด้วยมือ

ตัวเช็ก `tools/check-inline.js` (รันใน `build-css.sh`) ตรวจเฉพาะ `style="…"` ที่เป็นค่าคงที่ใน `js/*.js` และ `!important` ใน CSS ส่วน `<style>` ในไฟล์ JS และ `el.style.*` ยังต้องดูเองตอนรีวิว

## ติดตั้ง

1. ใส่ Firebase config จริงใน `js/firebase-config.js` (Firebase Console → Project settings → Your apps)
2. เปิด Google Sign-In (Authentication → Sign-in method)
3. สร้าง Firestore แล้ววางกฎจาก `firestore.rules` ในแท็บ Rules (ครูแต่ละคนเข้าถึงได้เฉพาะข้อมูลของตัวเอง)
4. รันผ่าน http/https เท่านั้น ไม่ใช่ `file://` เช่น `npx serve .` หรือ `firebase deploy`

## Build และทดสอบ

```sh
npm install              # ครั้งแรก: ติดตั้งเครื่องมือเวอร์ชันที่ล็อกไว้ + เปิด git hook
./build-css.sh           # ตรวจกฎ (inline style, sw.js, CSS ซ้ำ) แล้วสร้าง css/style.min.css
./build-css.sh --check   # ตรวจว่า .min ตรงกับ style.css (ใช้ก่อน deploy / ใน CI)
npm test                 # tests/score-logic.test.js
npm run test:sw          # จำลอง Service Worker + เน็ตเปิด/ปิด
npm run test:tt          # ตารางสอนแยกภาคเรียน + วิดเจ็ตหน้าแรก
npm run test:rec         # แท็บอบรม/เกียรติบัตร/รางวัล
```

- หน้าเว็บโหลด `css/style.min.css` · commit `.min` และ `package-lock.json` ด้วย
- `csso-cli`, `postcss`, `jsdom` ล็อกเวอร์ชันเป๊ะใน `package.json` (ไม่ใช้ `^`/`~`)
- `.githooks/pre-commit` สร้าง `.min` ให้เองเมื่อ commit แตะ `style.css` (เปิดอัตโนมัติจาก `npm install` หรือ `git config core.hooksPath .githooks`)
- เพิ่ม/ลบ/เปลี่ยนชื่อไฟล์ใน `js/`, `css/`, `assets/icons/` → แก้ `PRECACHE` ใน `sw.js` และ **เพิ่มเลข `VERSION`** แล้วรัน `npm run check:sw`

## โครงสร้างไฟล์

```
index.html            SPA shell
sw.js                 Service Worker — รายการ PRECACHE ต้องตรงกับไฟล์จริง
css/style.css         สไตล์ทั้งหมด (style.min.css สร้างจากไฟล์นี้)
js/firebase-config.js ใส่ config + เปิดแคช/คิวออฟไลน์ของ Firestore
js/pwa.js             ลงทะเบียน sw.js + แจ้งเมื่อมีเวอร์ชันใหม่
js/island.js          Dynamic Island: showToast, islandSave/Undo/Progress/SetPage
js/theme.js           ธีมสว่าง/มืด พื้นหลัง สีหลัก ความโปร่งใส
js/utils.js           modal, loadModule (lazy), snapshot/restore เลิกทำ, CSV, คำนวณเกรด
js/auth.js            Google Sign-In / Sign-Out
js/app.js             router + เมนู
js/dashboard.js       หน้าหลัก + loadCoursesWithGrades (มีแคช)
js/courses.js         รายวิชา ห้องเรียน ภาพรวม
js/students.js        นักเรียนรายห้อง (เพิ่มทีละคน / นำเข้า CSV-Excel)
js/structure.js       โครงสร้างคะแนนระดับวิชา (ใช้ร่วมทุกห้อง ลากจัดลำดับได้)
js/scores.js          บันทึกคะแนนแบบสเปรดชีต + autosave
js/picker-pages.js    หน้าเลือกวิชา/ห้อง
js/report-page.js     หน้ารายงาน
js/pa.js              ฟอร์มข้อตกลง PA 1/ส (lazy — โหลดตอนเข้าหน้า PA พร้อม pa-ai/pa-report/pa-rpt ผ่าน LAZY_BUNDLES.pa)
js/pa-ai.js           ผู้ช่วย AI ในฟอร์ม PA
js/pa-report.js       ตัวอย่าง/พิมพ์ PA
js/pa-rpt.js          แบบฟอร์มรายงานผล Personal Agreement (แท็บที่ 3) + แท็บ ตัวอย่าง/พิมพ์ รายงานผล (แท็บที่ 4)
js/report.js          [lazy] สรุปผลรายห้อง ส่งออก CSV/ปพ.5/SGS เกณฑ์เกรด แปลงคะแนน NextSchool
js/tools.js           [lazy] เครื่องมือในห้องเรียน
js/privacy.js         [lazy] ส่งออก/ลบข้อมูลของฉัน
js/profile.js         [lazy] ข้อมูลส่วนตัวของครู + แท็บ
js/timetable.js       [lazy] ตารางสอน (แยกภาคเรียน) + วิดเจ็ตหน้าแรก (อ่านอย่างเดียว)
js/records.js         [lazy] แท็บอบรม/เกียรติบัตร/รางวัล (รูปย่อใน Firestore + ต้นฉบับใน Storage)
js/vendor/            xlsx.mini.min.js (โหลดเมื่อนำเข้า/ส่งออกไฟล์)
tools/                check-inline.js · check-css.js · check-sw.js
tests/                score-logic.test.js · sw.test.js
firestore.rules       กฎความปลอดภัย (Firestore)
storage.rules         กฎความปลอดภัย (Firebase Storage) — วางใน Console → Storage → Rules
```

## ธีมและการตั้งค่าหน้าตา

ตัวแปรสีทั้งหมดอยู่ที่ `:root` และ `:root[data-theme="dark"]` ใน `style.css` · ตั้งค่าของผู้ใช้เก็บใน localStorage และตรวจค่าก่อนใช้ทุกครั้ง (logic ทั้งหมดอยู่ใน `js/theme.js`)

| เรื่อง | ที่เก็บ / จุดแก้ |
| --- | --- |
| ธีม ตามระบบ / สว่าง / มืด (ตั้งค่า → ธีม) | `js/theme.js` |
| พื้นหลังสำเร็จรูป (สีทึบ/ไล่สี) | ตัวแปร `--bgp-*` ใน `:root` (มีชุดมืดแยก) ใช้ผ่าน `--page-bg` · เพิ่มสีใหม่ = เพิ่ม `--bgp-ชื่อ` ทั้งสองธีม + `BG_IDS` / `BG_OPTIONS` แล้ว build |
| ชุดสีเพิ่มเติม (ไล่สีเส้นตรง) | `PRESET_CFG` + `BG_OPTIONS.preset` ใน `theme.js` (ไม่ต้องเพิ่ม `--bgp-*`) |
| พื้นหลังปรับเอง (สีเดียว/ไล่สี/ลาย 8 แบบ) | `myscore-bg` (JSON) ตรวจด้วย `cleanCfg` · ลายสร้างจาก CSS gradient ไม่โหลดรูป |
| สีหลัก + ความโปร่งใสการ์ด/เมนู + ความเบลอ | `myscore-look` (JSON) ตรวจด้วย `cleanLook` · ตั้ง `--primary*` `--on-primary` `--glass` `--glass-blur` `--card-glass*` ทับค่าที่ `applyTone` คำนวณจากพื้นหลัง · ปุ่ม "คืนค่าเริ่มต้น" ล้างทั้งหมด |
| สีตัวหนังสือบนพื้นหลัง | `theme.js` คำนวณคอนทราสต์ (WCAG 4.5:1) แล้วตั้ง `--on-brand` `--on-bg*` · ถ้าพื้นสวนธีมหรือเป็นลาย จะเพิ่มความทึบ `--card-glass` |
| สีวิดเจ็ต / ไอคอน | `--w` ต่อการ์ด + ชุด `--hue-*` |
| สีกราฟ / ตาราง | `--viz-*` · สีระดับชั้น `LEVEL_COLORS` ใน `js/utils.js` |

**คอลัมน์ตรึงในตารางคะแนน**: ความกว้างอยู่ที่ `--c1-w` (เลขที่) `--c2-w` (รหัส) `--c3-w` (นักเรียน) `--r1-w` (รวม) `--r2-w` (เกรด) ของ `table.sheet` ตำแหน่ง `left`/`right` คำนวณที่กฎ `table.sheet :is(th, td).sticky-*` ที่เดียว ห้ามตั้งให้ทุกช่องเหมือนกัน (เคยทำให้ รวม/เกรด ซ้อนกัน) · มือถือ (≤860px) ตั้งค่าใหม่ในบล็อก `@media`

**Dynamic Island** (`js/island.js`, สไตล์ `.island`): แคปซูลดำกลางบนจอ ตอนพักแสดงวัน · เวลา และชื่อหน้าที่เปิด (`islandSetPage()` ถูกเรียกจาก `setActiveNav()`) ตอนใช้งานความสูงคงที่ ข้อความยาวขยายออกด้านข้างเท่านั้น

- `showToast(msg)` · ข้อความลงท้าย `...` = สถานะโหลด · ระบุชนิดเองได้ `showToast(msg, 'error')`
- ใช้สำหรับ: บันทึกอัตโนมัติ · ปุ่ม "เลิกทำ" 5 วินาทีหลังลบนักเรียน/ห้อง/วิชา (`snapshot*` / `restore*` ใน `utils.js`) · แถบความคืบหน้านำเข้า/ส่งออก · ออนไลน์/ออฟไลน์

## ข้อมูล (Firestore)

```
users/{uid}                                  profile (map) ข้อมูลส่วนตัวครู
users/{uid}/courses/{courseId}               วิชา + โครงสร้างคะแนน
  /assessments/{id}                          รายการคะแนนเก็บ/กลางภาค/ปลายภาค (ใช้ร่วมทุกห้อง)
  /settings/grading                          เกณฑ์เกรด (ใช้ร่วมทุกห้อง)
  /sections/{sectionId}                      ห้อง { room, order }
    /students/{id}                           นักเรียนของห้อง
    /scores/{studentId}                      คะแนนของนักเรียน
users/{uid}/timetable/{ปี}-{ภาค}              ตารางสอนแยกภาคเรียน เช่น 2569-1 (main = แบบเดิมก่อนแยกภาค)
users/{uid}/records/{id}                      อบรม/เกียรติบัตร/รางวัล (แยกปีการศึกษาด้วยฟิลด์ year)
Storage: users/{uid}/records/{id}/{เวลา}/{วันที่พ.ศ.}_{ชื่อเรื่อง}.{นามสกุล}  ไฟล์ต้นฉบับ (รูป/PDF ไม่เกิน 10 MB)
users/{uid}/pa_agreements/{docId}            Personal Agreement
users/{uid}/pa_reports/{docId}               แบบรายงานผล Personal Agreement
```

**แก้ฟิลด์ใดๆ ต้อง deploy `firestore.rules` ล่าสุดก่อน** ไม่เช่นนั้นบันทึกแล้วจะขึ้นว่าถูกปฏิเสธสิทธิ์

- **profile**: ฟิลด์ตาม `PROFILE_FIELDS` ใน `js/profile.js` (เพิ่ม/ลบต้องแก้ rules `validTeacherProfile` ด้วย) · ดึงไปใช้ `await loadModule('profile')` แล้ว `loadTeacherProfile()` / `profileSummary(p)`
- **timetable**: เอกสารละภาคเรียน รหัส `{ปีการศึกษา}-{1|2}` (ปี/ภาคอยู่ที่รหัส ไม่มีฟิลด์เพิ่ม จึงไม่ต้องแก้ rules) · เนื้อหา `{ periods: [{start, end}] (≤14 คาบ), entries: [{ id, kind: "class"|"activity", day: 1-5, period, span, code, title, cls, room, hue, courseId }], updatedAt }` · แก้ฟิลด์ใน entry ที่ `ttCleanEntry` + rules `validTimetable` · ดึงไปใช้ `await loadModule('timetable')` แล้ว `loadTimetable()` (ได้ `{ term, periods, entries }` ของภาคเรียนปัจจุบัน) · ตารางแบบเดิม `main` ใช้เป็นตั้งต้นของภาคเรียนปัจจุบันจนกว่าจะบันทึกครั้งแรก (ไม่ลบ/ไม่แก้ main)
- **PA**: ฟิลด์ระดับบนต้องไม่เกิน 30 ตาม `validDoc` ใน rules · ข้อมูลผู้จัดทำดึงจากโปรไฟล์ ชั่วโมงสอนดึงจากตารางสอน
- ส่งออก/ลบข้อมูลของฉัน (`js/privacy.js`) ครอบคลุม profile ตารางสอน และวิชา **ยังไม่รวม Personal Agreement (`pa_agreements`) และแบบรายงานผล (`pa_reports`)** — ถ้าเพิ่มคอลเลกชันใหม่ ต้องเพิ่มที่ไฟล์นี้ด้วย

### ตารางสอนและวิดเจ็ตหน้าแรก

- **แยกปีการศึกษา/ภาคเรียน**: ตัวเลือก ปีการศึกษา + ภาคเรียนที่ 1/2 บนสุดของแท็บ · แต่ละภาคมีเวลาคาบและรายการคาบของตัวเอง · ภาคใหม่เริ่มว่าง (ใช้เวลาคาบของภาคล่าสุด) หรือกด "คัดลอกจากภาคเรียนอื่น" (ผูกวิชารหัสเดียวกันของภาคใหม่ให้เอง) · รายวิชาที่เลือกได้กรองตามปี/ภาคที่ตั้งในรายวิชา · ภาคเรียนปัจจุบันเดาจากเดือน (พ.ค.–ต.ค. = ภาค 1, พ.ย.–เม.ย. = ภาค 2) ที่ `ttCurrentTerm`
- แท็บ "ตารางสอน" ในหน้าข้อมูลส่วนตัว: แถว = วัน (จ.–ศ.) คอลัมน์ = คาบ · แตะช่องว่างเพื่อเพิ่ม แตะคาบเพื่อแก้/ลบ · คาบวิชาเลือกจากรายวิชาของฉันได้ · คาบติดกันรวมช่องได้ · กันคาบชนกัน · ตั้งเวลาคาบเองได้ (ค่าเริ่มต้น 10 คาบ 07:50–16:00) · ส่งออก CSV
- บันทึกแบบ optimistic (อัปเดตก่อน เขียน Firestore ทีหลัง พลาดจะคืนค่าเดิม) · ลบ/ล้างมีปุ่ม "เลิกทำ" · กรอกโปรไฟล์ค้างแล้วสลับแท็บจะมีหน้าต่างเตือน (`AppState.profileDirty`)
- วิดเจ็ตหน้าแรก (`#tt-widget`, `initTimetableWidget()`): **อ่านอย่างเดียว ไม่มีปุ่มแก้ไข** — กดคาบที่ผูกกับรายวิชา = ไปหน้าบันทึกคะแนน (กิจกรรม/คาบพิมพ์เอง แสดงอย่างเดียว) · แก้ตารางที่ปุ่ม "ดูทั้งสัปดาห์" · ใช้ตารางของภาคเรียนปัจจุบัน (ยังไม่ตั้ง → ใช้ของภาคก่อนหน้าไปก่อน) · แสดงคาบของวันที่เลือก พร้อมป้าย "กำลังสอน" / "ถัดไป" · โหลดแบบ lazy หลังหน้าแรกวาดเสร็จ ใช้แคช `AppState.timetable`
- `js/timetable.js` ต้องใช้งานเดี่ยวได้ (หน้าแรกไม่โหลด `profile.js`) — ห้ามเรียกฟังก์ชันของ `profile.js` จากไฟล์นี้

### อบรม / เกียรติบัตร / รางวัล

- แท็บที่ 3 ในหน้าข้อมูลส่วนตัว · เลือกปีการศึกษา + กรองประเภท · สรุปชั่วโมงอบรมรวม/จำนวนต่อประเภทของปีนั้น · ปีการศึกษาของแต่ละรายการคำนวณจากวันที่ (`recAcadYear`: พ.ค.–ธ.ค. = ปีนั้น, ม.ค.–เม.ย. = ปีก่อนหน้า)
- รูป: **รูปย่อ ~320px (WebP/JPEG ≤ ~45 KB) เก็บในเอกสาร** `thumb` → รายการดูได้ออฟไลน์ · **ต้นฉบับอยู่ใน Storage** (`file.path`) เปิดดูเมื่อกดรายการ (รูปสลับจากรูปย่อเป็นภาพเต็ม · PDF เปิดแท็บใหม่) · รูปใหญ่เกิน 8 MB ย่อด้านยาวเหลือ 2600px ก่อนอัปโหลด · HEIC ทำรูปย่อไม่ได้ (แนบเฉพาะต้นฉบับ)
- Storage SDK โหลดแบบ lazy ตอนอัปโหลด/ดูต้นฉบับครั้งแรก (`recStorage()`) · ออฟไลน์อัปโหลดไม่ได้: รายการ + รูปย่อยังบันทึกเข้าคิว Firestore แต่ไฟล์ต้นฉบับต้องแนบใหม่ตอนออนไลน์ (แก้ไขรายการ → เลือกไฟล์)
- ลบรายการมี "เลิกทำ" · ไฟล์ใน Storage ลบหลังพ้น 7 วินาที (ถ้าปิดแท็บก่อนครบ จะมีไฟล์ค้างโดยไม่มีรายการ) · เปลี่ยนไฟล์ = ลบไฟล์เก่าหลังบันทึกสำเร็จ
- ส่งออกข้อมูลของฉันรวม `records` (รูปย่อ + ชื่อ/path ไฟล์ — ไม่รวมไฟล์ต้นฉบับ) · ลบบัญชีลบไฟล์ใน Storage ก่อน (พลาด = หยุด ไม่ลบบัญชี)
- **ต้อง deploy ทั้ง `firestore.rules` และ `storage.rules` ก่อนใช้งาน**

### ฟอร์ม PA และผู้ช่วย AI

- `js/pa.js` ฟอร์มตามแบบ PA 1/ส ของ สพฐ. (ส่วนที่ 1: ภาระงาน + งานตามมาตรฐานตำแหน่ง 15 ข้อ · ส่วนที่ 2: ประเด็นท้าทาย) · `js/pa-report.js` ตัวอย่างและพิมพ์/บันทึก PDF
- `js/pa-ai.js` เรียก Gemini ผ่าน Firebase AI Logic (ไม่มี API key ในโค้ด ป้องกันด้วย App Check + reCAPTCHA) · SDK โหลดตอนกดปุ่ม AI ครั้งแรก · ชื่อรุ่นแก้ที่ `PA_AI.MODEL`
- ปุ่มบนสุดร่างเฉพาะส่วนที่ 2 ที่ว่าง (1 คำขอ) · งานข้อ 1.1–3.3 ใช้ปุ่มใต้แต่ละข้อ (ข้อละ 4 ช่อง) · ไม่เขียนทับช่องที่กรอกแล้ว · ข้อความที่ AI เสนอแสดงในหน้าต่างให้ตรวจก่อนใช้ ไม่บันทึกอัตโนมัติ
- ประหยัดโควต้า: คำแนะนำช่องงานอยู่ที่ `PA_AI_WORK_HINTS` (ส่งครั้งเดียวต่อคำขอ) · จำกัดความยาวเป็นตัวอักษรใน `PA_AI_WORK_HINTS` / `PA_AI_PART2` · อย่าเพิ่มปุ่มที่ยิงหลายสิบช่องในคำขอเดียว
- ข้อความผู้ใช้ส่งไปประมวลผลที่ Google · ต้องมีหน้าต่างขอความยินยอมก่อนใช้ครั้งแรก (`pa-ai-consent-v1`) · ห้ามกรอกชื่อ/ข้อมูลที่ระบุตัวนักเรียนลงในช่อง

## ออฟไลน์ (Service Worker + แคช Firestore)

| ชั้น | ไฟล์ | หน้าที่ |
| --- | --- | --- |
| ตัวแอป (HTML/CSS/JS/ฟอนต์/Firebase SDK) | `sw.js`, `js/pwa.js` | เปิดแอปได้ตอนไม่มีเน็ต |
| ข้อมูล (คะแนน นักเรียน วิชา) | `js/firebase-config.js` | Firestore เก็บแคช + คิวเขียนใน IndexedDB |

- **คะแนนที่พิมพ์ตอนออฟไลน์** เข้าคิวในเครื่อง รอดแม้รีเฟรช/ปิดแท็บ แล้วส่งเองเมื่อกลับมาออนไลน์ (`enablePersistence({ synchronizeTabs: true })`) · สถานะอยู่ที่ global `FS_PERSISTENCE` (`'on'` / `'off'` / `'single-tab'`) ถ้าไม่ใช่ `'on'` (เช่น โหมดส่วนตัว) แอปจะเตือนว่า "ยังไม่ได้บันทึก"
- **สถานะในหน้าคะแนน** (`js/scores.js`): `กำลังบันทึก...` → `บันทึกในเครื่องแล้ว · รอซิงค์ N ช่อง` (ออฟไลน์หรือเซิร์ฟเวอร์เงียบเกิน 4 วินาที) → `บันทึกแล้ว` · ปิดหน้าตอนรอซิงค์ได้โดยไม่ถูกเตือน
- **เปิดแอปแล้วยังมีคิวค้าง**: Island แจ้ง "มีคะแนนที่บันทึกในเครื่องรอซิงค์" (`checkCarriedOverWrites`) แล้วแจ้ง "ซิงค์แล้ว" เมื่อหมดคิว
- **ออกจากระบบ** (`js/auth.js`): ถ้ามีคะแนนค้างคิวจะถามยืนยัน แล้วล้างแคชในเครื่อง (กันข้อมูลนักเรียนค้างบนเครื่องที่ใช้ร่วมกัน)
- ล็อกอินครั้งแรกหรือหลังออกจากระบบต้องมีเน็ต · อ่านออฟไลน์ได้เฉพาะวิชา/ห้องที่เคยเปิดไว้ตอนมีเน็ต

**แคชของ `sw.js`**: ไฟล์แอป = เน็ตก่อนแล้วถอยไปแคช (ไฟล์ไม่มี hash) · รูปใน `assets/` = แคชก่อนแล้วอัปเดตเบื้องหลัง · Firebase SDK/ฟอนต์ = แคชก่อน · **Firestore, Auth, สภาพอากาศ, Google Sign-In ไม่ผ่าน SW** · มีเวอร์ชันใหม่ = Island ขึ้น "มีเวอร์ชันใหม่ของแอป [อัปเดต]" ไม่รีโหลดเองกลางคัน

**กติกาโค้ด**
- ลืมแก้ `PRECACHE` / `VERSION` = หน้านั้นเปิดตอนออฟไลน์ไม่ได้
- **อย่า `await` การเขียน Firestore (`set/update/add/delete`) ในจุดที่บล็อกการแสดงหน้า** — ออฟไลน์ promise จะค้างจนเซิร์ฟเวอร์ตอบ ให้เรียกแล้วไม่ต้องรอ หรือใส่ `.catch()` (การอ่านไม่เป็นปัญหา)
- เรียก `invalidateCourseData()` **ทันทีที่สั่งเขียน** ไม่ใช่หลัง `await`
- ทดสอบจริง: DevTools → Application → Service Workers → ติ๊ก Offline แล้วรีเฟรช (ต้องรันผ่าน https หรือ localhost)

## โหลดสคริปต์แบบ lazy

`report.js`, `privacy.js`, `tools.js`, `profile.js`, `timetable.js` **ไม่อยู่ใน `index.html`** — โหลดครั้งแรกที่ใช้ผ่าน `loadModule(name)` (`LAZY_MODULES` ใน `js/utils.js`) เป็น `<script>` ธรรมดา จึงใช้ฟังก์ชัน global ร่วมกับไฟล์อื่นได้

| ไฟล์ | โหลดเมื่อ |
| --- | --- |
| `report.js` | เข้าหน้ารายงาน หรือเปิดแท็บรายงานในวิชา (`ROUTE_MODULES` ใน `app.js`, `renderCourseShell()`) |
| `tools.js` | เข้าหน้าเครื่องมือ |
| `privacy.js` | กดส่งออก/ลบข้อมูลในหน้าตั้งค่า |
| `profile.js` | กดไอคอนบัญชีมุมซ้ายล่าง |
| `timetable.js` | เปิดแท็บตารางสอน หรือเปิดหน้าแรก (วิดเจ็ต) |

- ไฟล์อื่นเรียกฟังก์ชันในนี้ต้อง `await loadModule('ชื่อ')` ก่อนเสมอ (เรียกซ้ำปลอดภัย)
- เพิ่มไฟล์ lazy ใหม่ = ใส่ใน `LAZY_MODULES` ห้ามใส่ `<script>` ใน `index.html`
- `navigate()` เช็ก `AppState.currentRoute` หลังโหลด ผู้ใช้ไปหน้าอื่นระหว่างรอจะไม่ถูกวาดทับ

## แคชข้อมูลรายวิชา

`loadCoursesWithGrades()` (`js/dashboard.js`) เก็บผลใน `AppState.courseDataCache` อายุ 5 นาที และโหลดวิชา/ห้องแบบขนาน · ใช้ร่วมกับหน้ารายงาน

ทุกครั้งที่เขียนข้อมูลวิชา/ห้อง/นักเรียน/คะแนน/โครงสร้าง/เกณฑ์เกรด ให้เรียก `invalidateCourseData(courseId)` (ล้างเฉพาะวิชา) หรือ `invalidateCourseData()` (ล้างทั้งหมด เมื่อรายการวิชาเปลี่ยน เช่น สร้าง/เก็บเข้าคลัง/ลบ) · บังคับโหลดใหม่ `loadCoursesWithGrades({ force: true })`

## กติกาคะแนน/เกรด

- ผลรวมคะแนนต้องผ่าน `roundScore()` (`js/utils.js`) เสมอ · `calcGrade()` ปัดให้แล้ว — กันทศนิยมลอยตัวทำให้เกรดผิดที่ขอบเกณฑ์ (เช่น 50 เป็น 49.99999999999999)
- ช่องคะแนนว่าง = ไม่มีฟิลด์ในฐานข้อมูล (ไม่ใช่ 0) แยก "ยังไม่กรอก" จาก "ได้ 0" · ล้างช่องลบฟิลด์ด้วย `FieldValue.delete()`
- คะแนนเกินคะแนนเต็มถูกปรับเป็นคะแนนเต็มทั้งตอนพิมพ์และวาง (ให้โบนัสโดยเพิ่มคะแนนเต็มที่หน้าโครงสร้างวิชา)
- วางจาก Excel: `parseDelimitedText(text, { keepBlank: true })` คงตำแหน่งแถว/ช่อง · ช่องว่าง = ล้างช่อง · ข้อความที่ไม่ใช่ตัวเลขถูกข้าม · รองรับ CSV ที่ครอบช่องด้วย `"..."`
- บันทึกพลาดลองซ้ำอัตโนมัติ 4 ครั้ง แล้วแสดง "บันทึกไม่สำเร็จ N ช่อง — แตะเพื่อลองใหม่" และเตือนก่อนปิดหน้า

## บันทึกการลดขนาด (2026-10-08)

- ลบรูป `assets/banner*.webp` (ซ้ำกับ `head-cat*.webp` ทุกไฟล์ และโค้ดไม่ได้เรียกใช้) และ `js/score-logic.test.js` (ฉบับเก่า — ใช้ `tests/score-logic.test.js`)
- กลุ่มหน้า PA (`pa.js`, `pa-ai.js`, `pa-report.js`, `pa-rpt.js`) ย้ายเป็น lazy: `LAZY_MODULES` + `LAZY_BUNDLES.pa` ใน `js/utils.js` โหลดตามลำดับด้วย `loadModules()` — ลด JS ตอนเปิดแอป ~174 KB (ยังอยู่ใน `PRECACHE` ออฟไลน์ได้เหมือนเดิม)
- ลบ CSS variable ที่ไม่มีใครใช้ 32 ตัว, คลาสที่ไม่มีใครใช้ 9 คลาส, ยุบ `--font-modern` เป็น `--font-head`
  (อย่าลบ `--bgp-*` — `theme.js` ประกอบชื่อตอนรัน: `'var(--bgp-' + id + ')'`)
- โลโก้ในหน้าแอปใช้ `assets/icons/logo-128.webp` (PNG 192/512 ยังอยู่สำหรับ manifest / iOS)
- `css/style.min.css` ถูกสร้างใหม่ด้วยสคริปต์ชั่วคราว (ผลเทียบกับ `style.css` ทีละ declaration ตรงกันทุกค่า) แต่ไม่ได้ผ่าน csso — **รัน `./build-css.sh` หนึ่งครั้งเพื่อให้ `--check` ผ่านและ commit ไฟล์ .min ที่ได้**
- `pa-ai.js` โหลด Firebase modular SDK 12.17.0 ด้วย `import()` เฉพาะตอนกดปุ่ม AI ครั้งแรก (ไม่กระทบตอนเปิดแอป) — คงไว้เพราะ Firebase AI Logic ไม่มีใน compat SDK
