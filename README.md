# MyScore — ระบบบันทึกคะแนนสำหรับครู

ระบบเว็บ HTML/CSS/JavaScript (vanilla) เชื่อมต่อ Firebase (Authentication + Firestore) ตามสเปคที่วางไว้ใน Phase 1–2

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
index.html            หน้าเว็บหลัก (SPA shell)
css/style.css          ธีม Modern Education Dashboard
js/firebase-config.js  ใส่ Firebase config ของคุณตรงนี้
js/utils.js            toast, modal, CSV parsing, คำนวณเกรด
js/auth.js             Google Sign-In / Sign-Out
js/app.js              router
js/dashboard.js        หน้าหลัก
js/courses.js          รายวิชา (สร้าง/แก้ไข/แท็บภาพรวม)
js/students.js         นักเรียน (เพิ่มทีละคน / นำเข้า CSV-Excel)
js/structure.js        โครงสร้างคะแนน (ลากจัดลำดับได้)
js/scores.js           บันทึกคะแนนแบบ spreadsheet + autosave
js/report.js           สรุปผล + Export CSV + ตั้งเกณฑ์เกรด
firestore.rules        กฎความปลอดภัย (แยกข้อมูลตามครูแต่ละคน)
```

## ทำงานได้แล้วในเวอร์ชันนี้ (Phase 1–2)

- Google Sign-In และแยกข้อมูลของครูแต่ละคนด้วย UID
- Dashboard สรุปจำนวนวิชา/นักเรียน/ความคืบหน้า
- สร้าง/ดูรายวิชา
- เพิ่มนักเรียนทีละคน หรือ นำเข้าแบบวางจาก Excel/CSV พร้อม preview ตรวจสอบข้อมูลก่อนนำเข้า
- โครงสร้างคะแนนที่ยืดหยุ่น ลากจัดลำดับได้ ปรับหมวดคะแนนเก็บ/กลางภาค/ปลายภาคได้เอง
- หน้าบันทึกคะแนนแบบ spreadsheet: พิมพ์แล้ว autosave, กด Tab/Enter/ลูกศรเลื่อนช่อง, วางคะแนนหลายช่องพร้อมกันจาก Excel, ค้นหานักเรียน, เตือนเมื่อคะแนนเกิน max
- คำนวณคะแนนรวมและเกรดอัตโนมัติ ตั้งเกณฑ์เกรดเองได้
- หน้าสรุปผล: ค่าเฉลี่ย/สูงสุด/ต่ำสุด, กราฟการกระจายเกรด, Export CSV

## ยังไม่ได้ทำ (Phase ถัดไป ตามที่แนะนำในเอกสาร)

- Export เป็น Excel (.xlsx) และ PDF โดยตรง (ตอนนี้มี CSV ซึ่งเปิดใน Excel ได้)
- แบบฟอร์ม ปพ.5 (แนะนำให้ทำหลังระบบคะแนนเสถียรแล้ว)
- Firebase Storage สำหรับไฟล์แนบ
