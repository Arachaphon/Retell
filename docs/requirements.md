# Requirements: Bilingual Fanfic Reader

## ภาพรวม
เว็บแอปส่วนตัว (single-user) สำหรับอ่านนิยาย/fanfic จาก AO3, Wattpad และเว็บอื่นๆ
พร้อมแปลภาษาอังกฤษ → ไทยแบบคู่ขนานหรือสลับย่อหน้า อ่านบนมือถือ/ไอแพดเป็นหลัก

## Requirement หลัก

### 1. แหล่งเนื้อหา (Content Source)
- รองรับ AO3 และ Wattpad เป็นอันดับแรก
- ออกแบบ parser แบบ **pluggable**: แต่ละเว็บมี parser module แยกกัน
  (เช่น `parsers/ao3.ts`, `parsers/wattpad.ts`) implement interface เดียวกัน
  เพื่อให้เพิ่มเว็บใหม่ในอนาคตได้โดยไม่แตะ core logic
- Input: ผู้ใช้วางลิงก์ (URL ของ fic/chapter) → ระบบ fetch + parse เนื้อหา
  (ชื่อเรื่อง, ผู้แต่ง, เนื้อหาแบ่งเป็นย่อหน้า, เลขบท ถ้ามีหลายบท)

### 2. การแปล
- คู่ภาษา: **อังกฤษ → ไทย** เท่านั้น (ไม่ต้องรองรับทิศทางอื่น)
- เลือกวิธีแปลเอง (Claude API หรืออื่นๆ) โดยพิจารณาจาก: คุณภาพงานแปลวรรณกรรม/บทสนทนา,
  ต้นทุนต่อคำ, ความเร็ว, ความง่ายในการต่อ API
- แปลทีละย่อหน้า เก็บ mapping ย่อหน้าต้นฉบับ ↔ ย่อหน้าแปล ไว้ใช้กับโหมดแสดงผลทั้งสองแบบ

### 3. การแสดงผล (Reading UI)
- สองโหมดให้ผู้ใช้สลับได้:
  1. **Side-by-side**: อังกฤษกับไทยคู่กัน (ซ้าย-ขวา บน desktop, บน-ล่างต่อย่อหน้าบนจอแคบ)
  2. **สลับทีละย่อหน้า**: ย่อหน้า EN ตามด้วยย่อหน้า TH แปลของย่อหน้านั้น เรียงต่อกันตลอดเรื่อง
- **Mobile-first**: ออกแบบเริ่มจากหน้าจอมือถือ/แท็บเล็ตก่อน แล้วขยายไป desktop
  - ตัวอักษรอ่านง่าย ปรับขนาดได้
  - ไม่พึ่ง hover สำหรับ interaction สำคัญ (ปุ่มสลับโหมด, เมนู ต้องแตะได้ตรงๆ)
  - รองรับ responsive layout: จอแคบ = คอลัมน์เดียว, จอกว้าง = คู่ขนานได้

### 4. ไม่มีระบบเก็บข้อมูลผู้ใช้
- ไม่เก็บประวัติการอ่าน
- ไม่มี bookmark/resume
- อ่านจบ = จบ ปิดแท็บแล้วไม่ต้องมีอะไรค้าง
- **ผลต่อ design**: ไม่ต้องมี user account, ไม่ต้องมี database เก็บ per-user state
  → ลด backend ให้เหลือแค่ fetch + parse + translate + serve เป็น stateless ให้มากที่สุด

### 5. Backend / Hosting
- Deploy บน VPS ขนาดเล็ก (เช่น 1-2 vCPU, 1-2GB RAM)
- ใช้คนเดียว → ไม่ต้องออกแบบรับ concurrent user เยอะ, ไม่ต้อง scale
- แนะนำ stack ที่ deploy ง่าย, maintenance น้อย (เช่น single binary/process,
  reverse proxy เดียว, ไม่ต้องมี queue/cache layer ซับซ้อนถ้าไม่จำเป็น)
- อาจ cache ผลแปลไว้ชั่วคราว (in-memory หรือไฟล์) เพื่อลดการเรียก translation API ซ้ำ
  ระหว่าง session เดียวกัน แต่ไม่ต้อง persist ข้ามการใช้งาน (ตาม requirement ข้อ 4)

## Non-goals (ไม่ทำ)
- ไม่มี user authentication/multi-user
- ไม่มี bookmark, reading history, progress tracking
- ไม่มี offline/download เก็บไฟล์ (นอกเหนือจากที่ opencode เห็นว่าจำเป็นต่อการอ่านระหว่าง session)
- ไม่ต้องรองรับภาษาอื่นนอกจาก EN→TH ในเวอร์ชันแรก
- ไม่ต้อง scale สำหรับผู้ใช้หลายคน

## ขอบเขตที่เปิดให้ opencode ตัดสินใจเอง
- เลือกวิธี/API สำหรับการแปล (พิจารณาคุณภาพ+ต้นทุน+ความง่าย)
- เลือก tech stack (framework, ภาษา) ที่เหมาะกับ VPS ขนาดเล็กและ maintenance ต่ำ
- โครงสร้าง caching เพื่อลดการเรียก translation API ซ้ำ
- วิธี deploy บน VPS (docker, systemd service, ฯลฯ)
