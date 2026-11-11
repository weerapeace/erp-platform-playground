# ตัวเสิร์ฟรูปบน Cloudflare (erp-img)

> เริ่มใช้ 2026-11-10 — เจ้าของอนุมัติ "ย้ายรูปไป Cloudflare" หลังพบว่าค่า Vercel พุ่ง (รูปวิ่งผ่าน Vercel 38.7 GB ใน 9 วัน และแคชรูปของ Vercel หายทุกครั้งที่ deploy)

## ใช้ทำอะไร

เสิร์ฟรูป/วิดีโอจากที่เก็บ R2 (`odoo-product-images`) ให้เบราว์เซอร์ โดยไม่ผ่านเซิร์ฟเวอร์ Vercel

- URL: `https://erp-img.weerapeace.workers.dev/api/r2-image?key=<r2 key>[&w=&q=&sq=1&pad=34][&meta=1]` — ช่องเหมือน `/api/r2-image` ของแอปทุกตัว
- ไม่ย่อ / วิดีโอ / GIF / SVG → อ่าน R2 ตรง (รองรับ Range: วิดีโอกรอได้ · 304 ถ้าเบราว์เซอร์มีตัวล่าสุด)
- ย่อ (`?w=`) → หาใน `_variants/<key>/<etag>/w..-q..` ใน R2 ก่อน · ไม่มี = ขอแอปย่อ (sharp) **ครั้งเดียว** แล้วเก็บ → ครั้งต่อไปไม่แตะ Vercel
  - ต้นฉบับถูกเขียนทับ = etag ใหม่ = ย่อใหม่เอง (ไม่ค้างรูปเก่า)
- `imgset/<id>` (ชุดรูปกลาง) และ `meta=1` → ส่งต่อให้แอปตอบ (ต้องใช้ฐานข้อมูล)
- เบราว์เซอร์เก็บรูปไว้ 1 วัน · ใช้ข้ามโดเมนได้ (`Access-Control-Allow-Origin: *` — เว็บร้าน / canvas)

## ใครชี้มาที่นี่

| ที่ | ทำยังไง |
|---|---|
| หน้า ERP ทั้งหมด | `next.config.ts` redirect `/api/r2-image` → erp-img **เฉพาะคำขอที่มีหัว `Sec-Fetch-Dest: image`** (เบราว์เซอร์โหลดรูปมาแสดง) — ไม่ต้องแก้ 189 ไฟล์ที่เขียน `/api/r2-image?key=` ไว้ |
| เว็บร้าน (Louis Montini / Pixie Dustie) | env `NEXT_PUBLIC_ERP_IMAGE_BASE` = `https://erp-img.weerapeace.workers.dev` |

**ไม่ถูกส่งต่อ (ยังวิ่ง Vercel เหมือนเดิม):** ระบบภายนอกที่ดึงรูปด้วย URL (LINE, Lazada, Shopee, Facebook — ไม่มีหัว Sec-Fetch-Dest) · `fetch()` ในหน้า · `<video>` · Safari เก่ากว่า 16.4 · ตัว erp-img เองตอนขอให้ย่อ (หัว `x-img-worker`)

## ⚠️ วาดรูปลง canvas แล้ว "อ่านกลับ" ต้องใส่ crossOrigin

รูป `/api/r2-image` ที่เบราว์เซอร์โหลดมาแสดงถูกส่งต่อมาที่ erp-img = **คนละโดเมนกับ ERP** → ถ้าวาดลง canvas แล้วอ่านกลับ (`getImageData` / `toBlob` / `toDataURL` เช่น ดูดสี ตัดรูป วัดความคม) เบราว์เซอร์จะห้าม เว้นแต่โหลดรูปแบบขออนุญาตข้ามโดเมน:

```ts
const img = new Image();
img.crossOrigin = "anonymous";   // ต้องใส่ก่อนตั้ง src
img.src = `/api/r2-image?key=...`;
```

erp-img ตอบ `Access-Control-Allow-Origin: *` ทุกรูปอยู่แล้ว จึงใส่บรรทัดเดียวพอ · แค่แสดงรูป (`<img>`) ไม่ต้องใส่ · ใช้ `fetch()` → blob ก็ได้ (ไม่ถูกส่งต่อ แต่วิ่งผ่าน Vercel)

**ไลบรารีที่โหลดรูปเอง (เราใส่ `crossOrigin` ให้ไม่ได้)** → ใช้ตัวช่วยกลางใน `lib/r2-image.ts`:

| กรณี | ใช้ | ตัวอย่างที่ใช้อยู่ |
|---|---|---|
| ไลบรารีรับ URL แล้วโหลดเองแบบธรรมดา | `fetchR2Blob(url)` → `URL.createObjectURL(blob)` (ได้ `blob:` = โดเมนเดียวกัน อ่านกลับได้ · ดึงจาก erp-img ตรง ไม่ผ่าน Vercel) | กระดานวาด `exportableFiles()` ใน `components/canvas-sketch/utils.ts` (ถ่ายภาพกระดานลงใบพิมพ์ · จับภาพส่ง LINE) |
| ไลบรารีขออนุญาตข้ามโดเมนให้เอง เฉพาะรูปที่ "เห็นว่าเป็นโดเมนอื่น" (html2canvas `useCORS`) | `r2ReadableUrl(url)` → URL ชี้ตรงไป erp-img | ปุ่ม "บันทึกเป็นรูป" ใบสั่งซื้อ `app/purchasing/orders/page.tsx` |

หน้าเว็บรู้โดเมน erp-img จาก `NEXT_PUBLIC_IMG_WORKER_URL` (next.config ตั้งให้จาก `IMG_WORKER_URL` · ปิดตัวเสิร์ฟรูป = ค่าว่าง = ตัวช่วยคืน URL เดิม)

เคยพัง 2026-11-11: ดูดสีจากรูป ("โหลดรูปไม่ได้ หรือรูปนี้อ่านสีไม่ได้") · ตัดรูปเป็นสี/ไอคอน · ช่วยคัดรูปในอัลบั้ม · โลโก้กลาง QR หน้าพิมพ์บาร์โค้ด · ภาพกระดานวาดในใบพิมพ์/จับภาพส่ง LINE · บันทึกใบสั่งซื้อเป็นรูป (ไล่เช็กทั้งระบบแล้ว: จุดที่อ่านรูปกลับ 31 ไฟล์ + ทดสอบรูปจริง 38 ประเภท ตอบตรงกับของเดิม)

## ห้ามใช้เมื่อไหร่

- ไฟล์ส่วนตัว/เอกสารที่ต้องล็อกอิน — erp-img เปิดสาธารณะเหมือน `/api/r2-image` เดิม (ต้องรู้ชื่อไฟล์)
- อัปโหลด / ลบไฟล์ — ทำผ่านแอปเหมือนเดิม (erp-img อ่านอย่างเดียว + เขียนแค่ `_variants/`)

## ย้อนกลับ

- หน้า ERP: ตั้ง env `IMG_WORKER_URL=off` ใน Vercel แล้ว redeploy → รูปกลับไปวิ่ง Vercel ทั้งหมด
- เว็บร้าน: ตั้ง `NEXT_PUBLIC_ERP_IMAGE_BASE` กลับเป็น `https://erp-platform-playground.vercel.app` แล้ว redeploy

## โค้ด / deploy

- `workers/img/src/index.ts` (ตัวเสิร์ฟ) · `workers/img/src/rules.ts` (กติกา pure + เทสต์ `workers/img/src/__tests__/rules.test.ts`)
- deploy อัตโนมัติ: `.github/workflows/deploy-img.yml` (push `workers/img/**` บน feat/host-portable) · secret CF ชุดเดียวกับ collab worker
- ข้อจำกัด: Cache API ใช้ไม่ได้บน `*.workers.dev` จึงเก็บรูปย่อใน R2 (ถ้ามีโดเมนของเองบน Cloudflare ในอนาคต = เพิ่มแคชขอบเครือข่ายได้อีกชั้น)
- ค่าใช้จ่าย: อยู่ในแพ็กเกจ Workers Paid $5 (10M requests/เดือน) · R2 ไม่คิดค่าส่งข้อมูลออก · รูปย่อกินพื้นที่ R2 เพิ่ม (ดูไม่ให้เกินโควตาฟรี 10 GB)
