---
name: new-scraper
description: Use when writing, editing, or debugging a scraper function for a new website, or when a scraping/extraction script needs to parse HTML into clean content. Covers readability-style parsing, stripping nav/footer/ads, returning plain text + title + metadata, and gracefully handling HTML structure changes so the whole system doesn't crash.
---

# New Scraper

ช่วยเขียนหรือแก้ไข scraper function ให้รองรับเว็บไซต์เนื้อหา (นิยาย/บทความ)
ใหม่ ได้อย่าง robust โดยเน้นการแยกแยะ "เนื้อหาที่แท้จริง" ออกจากองค์ประกอบ
เชิงโครงสร้างของหน้าเว็บ พร้อมคืนค่าเป็นข้อมูลที่สะอาดและต้านทานการเปลี่ยน
โครงสร้าง HTML

## เมื่อต้องใช้

- ต้องเพิ่ม scraper สำหรับเว็บไซต์ใหม่
- scraper เดิมดึงเนื้อหาได้ไม่ครบ / ดึงส่วนที่ไม่ใช่เนื้อหาเข้ามาด้วย
- ต้องการดึง title + metadata จากหน้าเว็บ
- ต้องการให้นี่ทำงานต่อไปแม้โครงสร้าง HTML ของแหล่งที่มาจะเปลี่ยน

## หลักการที่ต้องปฏิบัติ

### 1. Parse แบบ readability-style เสมอ

ห้าม return หน้า HTML ดิบ หรือ string ที่ต่อกันจาก `$('body').text()` ตรงๆ
ให้ใช้หลักการอ่านค่าความหนาแน่นของข้อความ (text density) เพื่อหา "main content":

- จัดลำดับคะแนนให้กับ candidate elements โดยพิจารณาจาก
  - จำนวนข้อความแท้จริง (ไม่นับ whitespace / script / style)
  - อัตราส่วนข้อความต่อ tag (text-to-tag ratio)
  - จำนวน link/`<a>` ย่อย ที่บ่งบอกว่าเป็น list/ลิงก์หัวข้อ มากกว่าบทความ
- เลือก node ที่มีคะแนนสูงสุดเป็นเนื้อหาหลัก
- ถ้าไม่พบ candidate ที่ดีพอ ให้ return `null` แทนที่จะเดาและส่งเนื้อหาที่ผิด

### 2. ตัดส่วนที่ไม่ใช่เนื้อหาออกเสมอ

- `nav`, `header`, `footer`, `aside`, `sidebar`, `menu`, `breadcrumb`
- โฆษณา: element ที่มี class/id/attr ตรงกับ pattern เช่น `ad`, `ads`, `sponsor`, `promo`, `banner`, `affiliate`
- `script`, `style`, `noscript`, `iframe`, `form`, `button`
- element ที่ซ่อนอยู่: `hidden`, `display:none`, `aria-hidden="true"`, `sr-only`, `visually-hidden`
- ข้อความสั้นซ้ำๆ เช่น ปุ่ม "อ่านต่อ" "แชร์" "ต่อไป" ที่เกาะกับเนื้อหา

ตัวตัด (removal) ให้ทำแบบ recursive: ลบ node ที่ไม่เข้าเงื่อนไขออก
เรียกซ้ำกับทุก subtree ก่อนจะเก็บข้อความสุดท้าย

### 3. รูปแบบการคืนค่า

scraper ต้องคืน object ที่มีโครงสร้างคงที่ (schema เดียวกันทุกเว็บ) เช่น:

```ts
type ScrapeResult = {
  ok: boolean;
  url: string;
  title?: string;        // จาก <title> หรือ og:title อย่างใดอย่างหนึ่ง
  content?: string;      // plain text ของเนื้อหาหลัก, normalize whitespace
  html?: string;         // (optional) HTML ที่ตัดแล้วของเนื้อหาหลัก
  metadata?: {
    author?: string;
    publishedAt?: string;
    description?: string;
    siteName?: string;
    image?: string;
  };
  error?: { code: string; message: string };
}
```

- `content` ต้องเป็น **plain text** (ไม่ฝัง markup) และ normalize ให้
  - แทน tag ขึ้นบรรทัดใหม่ด้วย `\n` ตาม block element
  - ตัด whitespace/บรรทัดว่างซ้ำๆ ทิ้ง
- `metadata` ให้ดึงจาก `<meta>` tag: `og:title`, `og:description`,
  `og:image`, `article:author`, `article:published_time`, `twitter:*` ฯลฯ
- เก็บ `url` เดิมไว้เสมอเพื่อใช้ debug

### 4. Handle โครงสร้าง HTML เปลี่ยนแบบ graceful (ไม่ crash ทั้งระบบ)

HTML ของเว็บภายนอกเปลี่ยนได้เสมอ:
- ดึง element ด้วย selector ที่ยืดหยุ่น: ตรวจหลาย selector สำรอง, ใช้
  `??`/`||` หันไปหา fallback แทนที่จะ throw
- ทุกการเข้าถึง node ให้ทำ guard ว่า node นั้นมีอยู่จริงก่อน (null-safe)
- ห่อ logic การ parse ไว้ใน try/catch ระดับบนสุด แล้ว return
  `{ ok: false, error: { code: "PARSE_FAILED", message } }` แทนการ throw
- ถ้าได้ HTML ที่ผิดประเภท/ว่าง (เช่น login page, captcha) ให้ return
  `{ ok: false, error: { code: "NOT_CONTENT" } }` — กติกาที่ชัดเจน เพื่อให้
  caller ตัดสินใจต่อ (ดู skill `debug-fetch-error`)
- กำหนด timeout ต่อ request และ size limit สำหรับ response เพื่อกันหน้าเว็บ
  ที่มีเนื้อหามหาศาลหรือค้างคา

### 5. การใช้งาน HTML parser

ให้ใช้ parser ที่มีอยู่แล้วในโปรเจกต์ (cheerio / jsdom / 그리고
`@mozilla/readability` ถ้าต้องการ) ไม่ใช่เขียน regex หวานๆ สำหรับแยก HTML —
regex ใช้ได้แค่กับข้อความ/attr ที่ชัดเจน

## ตัวอย่างโครงสร้างฟังก์ชัน (อ้างอิงแนวคิด)

```ts
export async function scrape(url: string): Promise<ScrapeResult> {
  try {
    const html = await fetchWithTimeout(url, 15000);
    const doc = loadHtml(html);

    if (isLoginOrBlocked(doc)) return fail("NOT_CONTENT", url);
    if (isEmpty(doc)) return fail("EMPTY", url);

    const title = pickTitle(doc);
    const content = extractMainContent(doc); // readability-style + cut noise
    if (!content) return fail("NO_MAIN_CONTENT", url);

    return {
      ok: true,
      url,
      title,
      content: normalizeText(content),
      metadata: extractMetadata(doc),
    };
  } catch (err) {
    return fail("PARSE_FAILED", url, String(err));
  }
}
```

## Checklist เมื่อเขียน/แก้ไข scraper

- [ ] ส่งคืน schema เดียวกันกับ scraper ตัวอื่นในโปรเจกต์
- [ ] ตัด nav/footer/ads/script/style แล้วจริง
- [ ] คืน `{ ok:false, error }` ไม่ throw เมื่อ HTML แปลก
- [ ] มี timeout + size limit
- [ ] metadata ถูกดึงจาก `<meta>`/og tags
- [ ] มี test อย่างน้อย 1 ไฟล์ HTML จริงที่ verify ว่าได้ content ถูกต้อง
