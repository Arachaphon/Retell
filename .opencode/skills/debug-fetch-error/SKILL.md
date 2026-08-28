---
name: debug-fetch-error
description: Use when fetching content from a URL errors, times out, returns an empty/unexpected result, or yields HTML that doesn't match expectations (login wall, blocked by bot-protection, captcha, region/geo restrictions, or the site changed its HTML structure). Helps diagnose and decide the next step for the fetch/scraper pipeline.
---

# Debug Fetch Error

ใช้เมื่อดึงเนื้อหาจาก URL แล้วเจอปัญหา: error, timeout, หน้าเพจจ์ผิด
(ต้อง login, โดน block, captcha) หรือได้ HTML ที่ไม่ตรงกับที่คาด
เช่น โครงสร้างเว็บเปลี่ยน

## เมื่อต้องใช้

- `/fetch` หรือ scraper คืน error / timeout
- ได้ HTML กลับมาแต่เป็นหน้า login / captcha / bot-wall / เปล่า
- content ที่แยกได้ไม่ตรงกับหน้าเว็บจริง (อีกเพจ, หายไป, ปนเพจอื่น)
- ต้องตัดสินใจว่าจะสู้ต่อ (เพิ่ม header/retry) หรือถอย (คืนข้อความบอกผู้ใช้)

## ขั้นตอนการ debug (ไล่ตามลำดับ)

### 1. ระบุประเภทความผิดปกติก่อน

ดูที่ผลลัพธ์ (HTML / status / error message) แล้วจัดหมวด:

| อาการ | สาเหตุที่น่าจะเป็น |
|-------|--------------------|
| `403` / `429` / captcha / "unusual traffic" | โดน bot-protection (Cloudflare, Akamai) หรือ rate-limited |
| หน้า "Sign in / Login required" | ต้อง auth / paywall |
| ได้ HTML แต่ content ว่าง / เจอแค่ nav/footer | Selector ถูกแต่โครงสร้างเปลี่ยน หรือ JS-render |
| HTML ผิดภาษา / เป็นเพจอื่น / 404 | URL เปลี่ยน / dynamic route / redirect |
| timeout / connection reset | เซิร์ฟเวอร์ช้า, ถูก block ที่ IP, Geo-block |
| ได้ JSON แต่เป็น error envelope | API เปลี่ยน schema |

### 2. ตรวจ request headers และการตั้งค่า client

สาเหตุ block จำนวนมากแก้ด้วย "ทำให้เหมือน browser จริง":

- ตั้ง `User-Agent` ที่สมจริง (ไม่ใช่ของ library/scraper) เช่น UA ของ
  Chrome/Firefox ล่าสุด พร้อม version
- ส่ง `Accept`, `Accept-Language`, `sec-ch-ua`, `Referer` ที่เหมาะสม
- คัดลอก `Cookie` จากเบราว์เซอร์มาลอง (แต่ alert ผู้ใช้ว่ามีอายุ/ความเสี่ยง)
- ลอง `setTimeout`/`timeout` ให้สูงขึ้นกับเว็บที่ช้า
- ตรวจว่า code ตั้ง `redirect: follow` ครบ รองรับ 301/302/307

### 3. ตรวจว่าเป็นหน้าแบบไหน (static HTML หรือ JS-render)

- ถ้าเปิดในเครื่องมือ devtools แล้วเห็น content อยู่ใน HTML ต้นฉบับ
  (View Source) → เป็น static → ปัญหาอยู่ที่ selector/logic
- ถ้า content เกิดจาก JavaScript หลังโหลด → ต้อง render อีกชั้น
  (headless browser / SSR ของเว็บ / ค้นหา data ใน `window.__NUXT__`,
  `JSON-LD`, tag `<script type="application/ld+json">`, หรือ embedded JSON)
- หลายเว็บฝัง JSON ของเนื้อหาไว้ใน `<script>` — ลองหา key ของ JSON นั้น
  ก่อนไปใช้ headless browser (ถูกกว่า/เร็วกว่า)

### 4. ตรวจว่าโครงสร้าง HTML เปลี่ยนหรือไม่

- เปรียบเทียบกับ HTML เวอร์ชันก่อนหน้า (ถ้ามี snapshot/cache)
- ลองใช้ selector สำรองหลายตัว (ดู skill `new-scraper` — graceful fallback)
- ค้นหา element ด้วย text/ตำแหน่ง (เช่น หา tag ที่มีข้อความยาวสุด) แทน
  อาศัย class ชื่อเดียวที่อาจเปลี่ยน

### 5. คิดเรื่อง IP / region / rate limit

- ถ้า IP โดน block รายงานว่าเป็น `BLOCKED` และแนะนำ proxy/retry-with-backoff
- ถ้าเป็น Geo-block เหนือความรับผิดชอบของ proxy → บอกผู้ใช้ตรงๆ ว่าดึงไม่ได้
- ใช้ retry แบบ exponential backoff + jitter อย่ายิงซ้ำแบบถล่ม

## กลยุทธ์เมื่อตัดสินใจ

ให้ decision tree ไว้ตอบผู้ใช้ ไม่ใช่แค่ crash:

```
ถ้า BLOCKED / captcha / login-wall:
  → ถ้าสู้ต่อได้ (เพิ่ม header, cookie, proxy) → ลอง 1 ครั้งแบบจำกัด
  → ถ้ายังไม่ได้ → คืน error ที่อ่านเข้าใจ: "ต้องเข้าสู่ระบบ / ถูกบล็อก"
      แล้วให้ทางเลือก (paste เนื้อหามือ, หรือลองอีก URL)

ถ้า HTML เปลี่ยน / selector ไม่ match:
  → แก้ selector หรือใช้ fallback
  → เก็บ diff/ตัวอย่าง HTML ไว้เพื่ออ้างอิงตอนแก้

ถ้า timeout / mạng:
  → retry + backoff 2-3 ครั้ง
  → ถ้าล้มเหลวซ้ำ → คืน timeout message
```

## ถามข้อมูลที่จำเป็นก่อนแก้

- ตัวอย่าง HTML ต้นฉบับที่ผิด (2-5 บรรทัด) หรือ URL ที่ส่งผล error
- status code / error message ที่ precise
- request headers ปัจจุบันที่ใช้
- โปรเจกต์ใช้ headless browser แล้วหรือยัง (เล่นwright/puppeteer)

## Checklist เมื่อจบ debug

- [ ] ระบุหมวดของปัญหาได้ชัดเจน (block / auth / JS-render / structure / network)
- [ ] เปลี่ยน request headers/client ตามข้อสงสัย แล้ว re-test
- [ ] ถ้า JS-render ลองเจอ JSON ฝังในหน้า ก่อนไป headless browser
- [ ] ตรวจ selector/fallback เข้ากับ `new-scraper` (graceful, ไม่ crash)
- [ ] มี retry + backoff + timeout
- [ ] คืน error ที่ผู้ใช้อ่านแล้วรู้ว่าจะทำอะไรต่อ
