# Prompt สำหรับ opencode: เริ่มโปรเจกต์ Bilingual Fanfic Reader

อ่านไฟล์ `requirements.md` ในโฟลเดอร์เดียวกันนี้ก่อน เป็นสเปกฉบับเต็มของโปรเจกต์
แล้วเริ่มงานตามขั้นตอนด้านล่าง

## สิ่งที่ต้องทำก่อนเริ่มเขียนโค้ด

1. เสนอ **tech stack** ที่เหมาะกับ:
   - Deploy บน VPS ขนาดเล็ก, maintenance น้อย, ใช้คนเดียว (ดู requirements.md ข้อ 5)
   - รองรับ mobile-first responsive UI
   - ต้องเขียน parser แบบ pluggable ต่อเว็บได้ง่าย (ดูข้อ 1)
   อธิบายเหตุผลสั้นๆ ที่เลือก stack นี้ ก่อนเริ่มลงมือ

2. เสนอวิธีแปล (ดู requirements.md ข้อ 2) — เปรียบเทียบตัวเลือกที่เป็นไปได้
   (เช่น Claude API vs Google Translate vs DeepL) ในแง่คุณภาพงานแปลวรรณกรรม/บทสนทนา,
   ต้นทุน, ความง่ายในการต่อ พร้อมข้อเสนอแนะว่าจะใช้ตัวไหนและทำไม

3. ร่างโครงสร้างโปรเจกต์คร่าวๆ (folder structure) ให้ดูก่อน โดยเฉพาะจุดที่เป็น
   pluggable parser interface (เช่น `parsers/base.ts` + `parsers/ao3.ts` + `parsers/wattpad.ts`)

## ขอบเขต MVP (ทำตามลำดับนี้)

1. Parser interface + AO3 parser (ใส่ URL → ได้ชื่อเรื่อง/ผู้แต่ง/เนื้อหาแบ่งย่อหน้า)
2. Translation pipeline: แปลทีละย่อหน้า EN→TH พร้อม mapping ย่อหน้าต้นฉบับ↔แปล
3. Reading UI มือถือ-first:
   - โหมด side-by-side
   - โหมดสลับทีละย่อหน้า
   - ปุ่มสลับโหมดที่แตะง่ายบนจอสัมผัส
4. Wattpad parser (ต่อจาก interface เดิม)
5. Deploy script/คำแนะนำสำหรับ VPS

## ข้อควรระวัง
- **ห้าม** เพิ่มระบบ user account, database เก็บ progress, bookmark ใดๆ
  (ตาม non-goals ใน requirements.md) แม้จะดู "ง่ายถ้าทำไปด้วย" ก็ไม่ต้องทำ
- ถ้ามี caching ผลแปล ให้เป็นแบบ session/ephemeral ไม่ต้อง persist ถาวร
- เมื่อ parse เว็บที่มี rate-limit หรือ anti-bot (โดยเฉพาะ AO3/Wattpad) ให้แจ้งข้อจำกัด
  และเสนอวิธีรับมือ (เช่น delay, user-agent, หรือแจ้งว่าต้อง handle CAPTCHA เอง) แทนที่จะ
  พยายาม bypass มาตรการป้องกันของเว็บ

## Deliverable ของขั้นแรก
เริ่มจากข้อ 1-3 ด้านบน (stack + วิธีแปล + โครงสร้างโปรเจกต์) เป็นข้อเสนอให้ผู้ใช้ยืนยันก่อน
แล้วค่อยเริ่มเขียนโค้ดจริงตาม MVP scope
