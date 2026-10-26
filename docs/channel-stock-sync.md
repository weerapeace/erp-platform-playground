# 🔄 ซิงค์สต๊อกหลายช่องทาง (ของกลาง) — เฟส 1: ฐานกลาง + เทียบยอด

หน้า: `/master/stock-sync` (แอป "ช่องทางขาย" → งานขายออนไลน์ → 🔄 ซิงค์สต๊อก (เทียบยอด))
ปลายทางแรก: **IG International × BigSeller** · migration `supabase/migrations/202610310100_stock_sync_phase1.sql`

## ใช้ทำอะไร
ให้ **ERP เป็นตัวเลขสต๊อกจริงที่เดียว** แล้วค่อยส่งยอดไปทุกช่องทาง (Zortout/BigSeller-style)
เฟส 1 = เตรียมฐาน **ยังไม่ส่งอะไรออกไปเลย**:
1. นำเข้าไฟล์จาก BigSeller → จับคู่รหัสของ BigSeller ↔ SKU ใน ERP + เก็บยอดของ BigSeller ไว้เทียบ
2. ใช้ยอด BigSeller เป็นยอดตั้งต้นของคลังออนไลน์ (ผ่านรอบนับสต๊อก — ผู้ใช้ยืนยันเอง)
3. ตารางเทียบ "พร้อมขาย ERP" กับ "พร้อมขาย BigSeller" ไม่ตรงขึ้นสี

## คำศัพท์
| คำ | ความหมาย |
|---|---|
| ปลายทางซิงค์ | ที่ที่ระบบจะส่งยอดไป (แบรนด์ × โปรแกรม/ร้าน) — ตาราง `stock_sync_channels` |
| คลังต้นทาง | คลังที่ "ขายออนไลน์" (IG = `WH-ONLINE`) — งานผลิตเบิกของจากคลังอื่นไม่กระทบหน้าร้าน |
| ยอดกันไว้ | เหลือเท่านี้ให้ถือว่าหมด (กันขายเกินตอนออเดอร์เข้าพร้อมกันหลายร้าน) |
| ยอดพร้อมขาย | ในคลังต้นทาง − จองแล้ว − กันไว้ (ไม่ติดลบ) |
| โหมด | `off` ปิด · `compare` เทียบอย่างเดียว · `dry_run` คำนวณสิ่งที่จะส่ง · `live` ส่งจริง — **เฟส 1 เปิดได้แค่ off/compare** (API กัน) |

## ข้อมูลอยู่ที่ไหน
- **ทะเบียนจับคู่ SKU** = `marketplace_sku_mappings` ตารางเดิม (ไม่สร้างตารางที่ 3) · แถวของหน้านี้ = `platform='bigseller'` + `channel_id`
  ช่องใหม่: `sku_id` · `brand_id` · `qty_per_unit` · `is_combo` · `sync_enabled` (ปิดเป็นค่าเริ่มต้น) · `external_qty` (พร้อมขายที่ปลายทาง) · `external_on_hand` (ในคลังที่ปลายทาง) · `external_qty_at` · `external_warehouse` · `match_method` code/barcode/manual · `source`
  แถวของหน้าการตลาดเดิม (platform shopee/lazada ระดับ item) ไม่กระทบ
- **มุมมองเทียบยอด** = `v_channel_stock_compare` (security_invoker · อ่านผ่าน API เท่านั้น) — สถานะ: `match` · `erp_more` · `erp_less` · `unmatched` · `not_in_channel` (มีของใน ERP แต่ไม่มีรหัสในไฟล์) · `duplicate` (SKU เดียวถูกจับคู่หลายรหัส) · `no_data` · `combo`
- **จับคู่รหัส** = RPC `erp_stock_sync_find_skus(text[])` — รหัส SKU ไม่สนตัวพิมพ์/ช่องว่าง (เฉพาะตัวที่ใช้งาน) → บาร์โค้ด · service_role เท่านั้น

## API
| เส้น | ทำอะไร | สิทธิ์ |
|---|---|---|
| `GET /api/stock-sync/channels` | ปลายทาง + ชื่อแบรนด์/คลัง + นับตามสถานะ | `products.platforms.view` |
| `PATCH /api/stock-sync/channels` | ยอดกันไว้ / โหมด (off·compare) + audit `setting_change` | `products.platforms.edit` |
| `GET /api/stock-sync/compare?channel_id=` | แถวตารางเทียบ (ป้อนตารางกลาง) | `products.platforms.view` |
| `POST /api/stock-sync/bigseller-import?channel_id=&warehouse=` | รับแถวจาก ImportWizard → จับคู่ → บันทึกยอด + audit `import` | `products.platforms.edit` |
| `POST /api/stock-sync/match` | จับคู่/ยกเลิกทีละแถว (`manual`) + audit | `products.platforms.edit` |
| `POST /api/inventory/count` action `import_lines` | **ของกลางใหม่**: เติมยอดนับจากรายการเข้ารอบนับ (มีแล้ว=ทับ · ยังไม่มี=เพิ่ม) + audit | `stock.view` (ยืนยันปรับต้อง `stock.adjust`) |

## ไฟล์ BigSeller
- Export จาก **Inventory List → Import & Export** (Excel/CSV) · อ่านด้วยของกลาง `ImportWizard` + schema `BIGSELLER_IMPORT_SCHEMA` (`lib/stock-sync/bigseller.ts`)
- คอลัมน์ที่ใช้: รหัส SKU (บังคับ) · ชื่อ · พร้อมขาย (Available) · ในคลัง (On Hand) · คลัง · ประเภท SKU — ชื่อหัวตารางจริงยังไม่ยืนยัน ระบบเดาทั้งไทย/อังกฤษ ถ้าไม่ตรงให้เลือกคอลัมน์เองในขั้น "Map คอลัมน์"
- รหัสเดียวกัน **ต่างคลัง** = รวมยอด · รหัสเดียวกัน **คลังเดียวกัน/ไม่มีคอลัมน์คลัง** = ของกองเดียวกันโผล่ซ้ำ → ไม่บวก ใช้ยอดที่มากกว่า · ระบุชื่อคลังในป๊อป = เอาเฉพาะคลังนั้น
- ไฟล์ 2 แบบจาก BigSeller:
  - **Inventory List** (Inventory → Import & Export) = ยอดในคลังจริง → ใช้ทั้งเทียบและ **ตั้งต้น**
  - **Online Products** (หัวตาราง ชื่อเล่นร้านค้า · Item ID · Parent SKU · ตัวเลือก · SKU · สต็อก · ราคา) = ยอดที่โชว์บนร้าน → เดาคอลัมน์ได้ (SKU · ชื่อสินค้า · สต็อก→ในคลัง) ใช้ **เทียบ** ได้ แต่ **ไม่ควรใช้ตั้งต้น** ถ้าร้านตั้งยอดลอย (ไฟล์ IG 2026-10-25: 505/2,118 SKU = 100 พอดี) · สินค้าเดียวลงขาย 2 หน้า → SKU โผล่ 2 แถว (IG มี 96) ไม่ถูกบวกซ้ำ
- เทียบใช้ "พร้อมขาย" (ไม่มีใช้ "ในคลัง") · ยอดตั้งต้นใช้ "ในคลัง" (ไม่มีใช้ "พร้อมขาย") เพราะ ERP หักที่จองเอง
- สินค้าชุด (Combination SKU) ไม่นำเข้ายอด — BigSeller คิดยอดชุดจากชิ้นย่อยเอง
- จับคู่เอง (`manual`) แล้ว นำเข้าไฟล์รอบหน้าจะไม่ทับการจับคู่ (อัปเดตแค่ยอด) · รหัสที่ไม่อยู่ในไฟล์ใหม่ = ยอดเดิมค้างไว้ (ดูวันที่ "ยอด BigSeller ณ")

## ยอดตั้งต้น (📦 ใช้เป็นยอดตั้งต้น)
เปิดรอบนับใหม่ของคลังต้นทาง → `import_lines` เติมยอด → พาไปหน้า `/inventory/count?id=` → ผู้ใช้ตรวจแล้วกด **ยืนยันปรับสต๊อก** (RPC เดิม `erp_stock_count_apply` ลง ledger เป็น adjust · ต้นทุนใช้ standard_price ตามกติกาเดิม)
ข้าม: ยังไม่จับคู่ · SKU ซ้ำหลายรหัส · สินค้าชุด · ไม่มียอด

## ห้าม
- ห้ามเปิดส่งยอดจริงทั้งที่โปรแกรมเดิม (BigSeller) ยังส่งยอดเองอยู่ — 2 ระบบจะส่งทับกันไปมา
- หลังเปิดส่งจริง (เฟส 2) **แก้สต๊อกที่ ERP ที่เดียว** ห้ามปรับยอดใน BigSeller
- ห้ามอ่านตาราง/มุมมองนี้จากหน้าเว็บตรง ๆ — ผ่าน API ฝั่งเซิร์ฟเวอร์เท่านั้น (ถอนสิทธิ์ anon แล้ว)

## ข้อจำกัด / เฟสถัดไป
- เฟส 2: ต่อ BigSeller Open API (บริการเสียเงิน) → ส่งยอดพร้อมขายเมื่อสต๊อกเปลี่ยน + ดึงออเดอร์มาจอง · ใช้ `sync_enabled` ราย SKU + โหมด dry_run ก่อน live
- ไฟล์ export อาจเปลี่ยนรูปแบบ — ถ้าเดาคอลัมน์ไม่ได้ เลือกเองได้เสมอ
- unique index เดิม `(platform, marketplace_sku)` → รหัสเดียวกันใช้ได้ปลายทาง BigSeller เดียว (API กันไม่ให้ทับข้ามปลายทาง)
