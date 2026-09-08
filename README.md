# MyScore — ระบบบันทึกคะแนนสำหรับครู

ระบบเว็บ HTML/CSS/JavaScript (vanilla) เชื่อมต่อ Firebase (Authentication + Firestore)

## อัปเดตในเวอร์ชันนี้

- **สร้างวิชาครั้งเดียว หลายห้อง**: ตอนสร้างรายวิชา เลือกได้ว่าจะ "ระบุจำนวนห้อง" (ระบบสร้างห้อง 1,2,3... ให้อัตโนมัติ) หรือ "พิมพ์เลขห้องเอง" (เช่น `1,2,3` หรือ `1-5` หรือ `ม.6/1, ม.6/2`)
- **โครงสร้างคะแนนใช้ร่วมกันทุกห้อง**: ตั้งสัดส่วนคะแนนเก็บ/กลางภาค/ปลายภาคที่ระดับวิชา ไม่ต้องตั้งซ้ำทุกห้อง
- **นักเรียน/คะแนน/รายงาน แยกตามห้อง**: ในหน้ารายวิชาจะมีแถบเลือกห้อง (room pills) ด้านบน สลับห้องได้ทันที เพิ่มห้องเพิ่มเติมภายหลังได้ที่ปุ่ม "+ เพิ่มห้อง"
- **ดีไซน์เอิร์ธโทน มินิมอล responsive**: ปรับชุดสีเป็นโทนธรรมชาติ (เขียวมอส/สีดิน/สีทราย) พร้อมเมนูแบบ hamburger สำหรับหน้าจอมือถือ (สลับ sidebar เป็น drawer เลื่อนเข้า-ออกได้จริง)

## โครงสร้างข้อมูลใหม่ (Firestore)

```
users/{uid}/courses/{courseId}                    ข้อมูลวิชา (รหัส/ชื่อ/ระดับชั้น/ภาคเรียน) + โครงสร้างคะแนน
  /assessments/{id}                                รายการคะแนนเก็บ/กลางภาค/ปลายภาค (ใช้ร่วมกันทุกห้อง)
  /settings/grading                                เกณฑ์เกรด (ใช้ร่วมกันทุกห้อง)
  /sections/{sectionId}                            ห้องเรียนแต่ละห้อง { room, order }
    /students/{id}                                 นักเรียนของห้องนั้น
    /scores/{studentId}                             คะแนนของนักเรียนในห้องนั้น
```

firestore.rules เดิมเป็น wildcard recursive อยู่แล้ว ครอบคลุมโครงสร้างใหม่โดยไม่ต้องแก้ไข

## วิธีติดตั้ง

1. **ใส่ค่า Firebase ของคุณ**
   เปิดไฟล์ `js/firebase-config.js` แล้วแทนที่ค่าด้วย config จริงจาก
   Firebase Console → Project settings → General → Your apps → SDK setup

2. **เปิดใช้ Google Sign-In**
   ไปที่ Firebase Console → Authentication → Sign-in method → เปิดใช้งาน Google

3. **สร้าง Firestore Database**
   ไปที่ Firebase Console → Firestore Database → Create database
   จากนั้นนำกฎใน `firestore.rules` ไปวางในแท็บ Rules (บังคับให้ครูแต่ละคนเข้าถึงได้เฉพาะข้อมูลของตัวเอง)

4. **รันเว็บ**
   เปิด `index.html` ผ่าน local server ใดก็ได้ (Firebase Auth ต้องรันผ่าน http/https ไม่ใช่ file://)
   เช่น `npx serve .` หรือใช้ Firebase Hosting: `firebase deploy`

## โครงสร้างไฟล์

```
index.html             หน้าเว็บหลัก (SPA shell) + hamburger menu
css/style.css           ธีมเอิร์ธโทนมินิมอล + responsive
js/firebase-config.js   ใส่ Firebase config ของคุณตรงนี้
js/utils.js             toast, modal, CSV parsing, คำนวณเกรด, room-list parser, mobile nav
js/auth.js              Google Sign-In / Sign-Out
js/app.js                router + hamburger wiring
js/dashboard.js         หน้าหลัก (รวมนักเรียน/ความคืบหน้าทุกห้องทุกวิชา)
js/courses.js            รายวิชา: สร้าง (เลือกจำนวน/พิมพ์เลขห้อง), ห้องเรียน, ภาพรวม
js/students.js          นักเรียนรายห้อง (เพิ่มทีละคน / นำเข้า CSV-Excel)
js/structure.js         โครงสร้างคะแนนระดับวิชา (ใช้ร่วมทุกห้อง, ลากจัดลำดับได้)
js/scores.js             บันทึกคะแนนรายห้องแบบ spreadsheet + autosave
js/report.js             สรุปผลรายห้อง + Export CSV + ตั้งเกณฑ์เกรด
js/picker-pages.js       หน้าเลือกวิชา/ห้องแบบ dropdown (โครงสร้างวิชา, บันทึกคะแนน)
firestore.rules          กฎความปลอดภัย (แยกข้อมูลตามครูแต่ละคน, ครอบคลุมโครงสร้างใหม่)
```

## ยังไม่ได้ทำ (Phase ถัดไป)

- Export เป็น Excel (.xlsx) และ PDF โดยตรง (ตอนนี้มี CSV ซึ่งเปิดใน Excel ได้)
- แบบฟอร์ม ปพ.5
- Firebase Storage สำหรับไฟล์แนบ
- ย้าย/รวมนักเรียนข้ามห้อง (ตอนนี้เพิ่มได้เฉพาะทีละห้อง)
