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
