# ตัวเชื่อม Lazada (Open Platform API)

ร้านเชื่อมแบบ OAuth ต่อแบรนด์ (`platform_credentials` แบรนด์ × lazada · token เข้ารหัสด้วย `PLATFORM_SECRET_KEY`)
env บนโฮสต์: `LAZADA_APP_KEY` + `LAZADA_APP_SECRET` · callback `https://erp-platform-playground.vercel.app/api/lazada/callback`

## แผนทั้งหมด (เจ้าของอนุมัติทีละขั้น)

| ขั้น | ทำอะไร | แตะร้านจริงไหม | สถานะ |
|---|---|---|---|
| 0 | เจ้าของกด "เชื่อมต่อ Lazada" ที่ `/admin/platform-accounts` | — | รอเจ้าของ (หมดอายุตั้งแต่ 5 ส.ค. 2026) |
| 1 | ต่ออายุกุญแจอัตโนมัติ + ดึงสินค้าที่ลงไว้บน Lazada เข้า `/master/platform-catalog` | อ่านอย่างเดียว | ✅ ทำแล้ว |
| 2 | ลงสินค้าใหม่ (ส่งรูป → สร้างสินค้า → เก็บรหัส) จากหน้า 📤 ลงสินค้าบนแพลตฟอร์ม | เขียน | ยังไม่ทำ |
| 3 | ส่งสต๊อก/ราคา (ผ่านระบบซิงค์สต๊อก compare → dry_run → live) | เขียน | ยังไม่ทำ · ต้องมียอดตั้งต้นจริงก่อน |
| 4 | ดึงออเดอร์อัตโนมัติ + จอง/ตัดสต๊อก | — | ภายหลัง |

## กุญแจ (ขั้น 1)

- access_token อยู่ได้ ~7 วัน · refresh_token ~30 วัน (ข้อมูลจริงร้าน IG) → ไม่มีใครต่อ = หลุดเงียบ
- `lib/lazada.ts` `lazConnHealth(meta)` → none / connected / expiring (≤ 7 วัน) / expired · มี test
- `app/api/lazada/shared.ts`: `lazTokenOrReason` (ต่ออายุถ้าใกล้หมด · คืนเหตุผลภาษาคนเมื่อใช้ไม่ได้) · `refreshLazConn` · `ensureLazToken` (แบบเดิม คืน null)
- ตัวต่ออายุ `/api/cron/lazada-token` — Vercel Cron วันละครั้ง (`30 0 * * *` = 07:30 ไทย · vercel.json) · ต่ออายุทุกร้านที่ยังไม่หมด · บันทึกผลใน `audit_logs` (entity_type `platform_credentials`) · คนมีสิทธิ์ `products.platforms.edit` เรียกเองได้ (`?dry=1` = ดูอย่างเดียว)
- `/api/lazada/status` คืน `health` + `days_left` · `connected` = ใช้ได้จริงเท่านั้น (เดิมขึ้น "เชื่อมต่อแล้ว" ทั้งที่หมดอายุ)
- ⚠️ ยังไม่รู้ว่าการต่ออายุยืดอายุ refresh_token ด้วยไหม — ถ้าไม่ยืด เจ้าของต้องกดเชื่อมใหม่ทุก ~30 วัน (หน้าตั้งค่า/หน้าสินค้าบนแพลตฟอร์มเตือนล่วงหน้า 7 วัน) · ดูจาก `days_left` หลังตัวต่ออายุทำงาน

## ดึงสินค้าบนร้าน (ขั้น 1)

- `POST /api/lazada/sync-products {brand_id}` (`products.platforms.edit`) — `/products/get` filter=all ทีละ 50 · หมดเวลา 45 วิ = `partial` (กดอีกครั้งเติมต่อ)
- แปลงด้วย `lazProductToCatalogItem` (เก็บรหัส/ชื่อ/สถานะ/ราคา/สต๊อกต่อ SKU ใน `raw.lazada` · ไม่เก็บ HTML/รูป)
- บันทึกด้วยของกลาง `lib/platform-catalog-sync.ts` `upsertCatalogListings`: upsert ตาม item_id · จับคู่อัตโนมัติเฉพาะรหัสตรง (SKU ลูก > Parent) · ไม่ทับคู่เดิม · ไม่แตะ "ไม่ต้องจับคู่"
- ที่เหลือให้ตัวเดาคู่ (`lib/platform-match-suggest`) เสนอในหน้า สินค้าบนแพลตฟอร์ม (การ์ด "รอยืนยัน")

## ข้อควรรู้จาก Lazada

- รูปต้องย้ายไปเครื่อง Lazada ก่อนสร้างสินค้า (MigrateImage) · เปลี่ยนราคา ≥ 80% → สินค้ากลับไปรอตรวจ (QC)
- UpdatePriceQuantity ครั้งละ ≤ 50 (แนะนำ 20) · ช่วงแคมเปญใหญ่ (9.9 / 11.11 / 12.12) Lazada มักปิด API ส่งสต๊อก/ราคาชั่วคราว
- หมวดที่จับคู่ไว้ 8 หมวด เป็น leaf ในต้นไม้ API ทั้งหมด (เช็ก 2026-10-28) · 6938 = Fashion Accessories > Accessories > Belts (ใช้ได้ทั้งชาย/หญิง)
