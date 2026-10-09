# 🎯 SKU การตลาด (`/marketing/skus`)

แสดง **ทุกรุ่นสินค้า (Parent SKU ที่เปิดใช้งาน)** ให้ทีมการตลาดติดป้าย/หมายเหตุ — ไม่ต้องเลือกรุ่นเข้ารายการ (เดิมต้องเลือก · เลิกแล้ว 2026-10-09)

## ใช้ทำอะไร
- แยกแท็บตาม **แบรนด์** อัตโนมัติ (อ่านจาก `parent_skus_v2.brand_id`) · เรียงแท็บตามจำนวนรุ่นมาก→น้อย · รุ่นที่ไม่มีแบรนด์อยู่แท็บ "ไม่มีแบรนด์"
- ติด **ป้าย** ได้ 1 ป้ายต่อรุ่น เช่น 🔥 Hero / 🏷️ Clearance / 👜 Accessories — แอดมินเพิ่ม/แก้/ลบ/เรียงได้เองที่ "🏷️ ตั้งค่าป้าย"
- **หมายเหตุ** ต่อรุ่น (เช่น "ดันช่วง 11.11")
- **🎨 SKU ที่เหลือ** = สี/แบบ (SKU ย่อย) ที่ **เปิดในระบบ และทีมการตลาดไม่ได้ปิด** / ทั้งหมด เช่น 3/5 แบบ · กดแล้วเด้งรายการสี (โหลดตอนกด) มี **สวิตช์ เปิด/ปิด ทีละสี = เฉพาะการตลาด** (ตาราง `marketing_sku_variant_off` — ไม่แตะ `skus_v2.is_active` สียังขาย/สั่งซื้อ/ผลิตได้) · สีที่ปิดที่หน้า SKU = 🔒 ล็อก · สีปุ่ม: ครบ=เทา บางส่วน=เหลือง ไม่เหลือ=แดง · ⚠️ ไม่ใช่จำนวนชิ้นในคลัง
- **2 มุมมอง ☰ ตาราง / ▦ การ์ด** — สลับแล้วจำเป็นค่าเริ่มต้นรายคน (`useViewPref` key `marketing_skus_view`) · การ์ดเลือกจำนวนต่อแถว 3-8 (`useGalleryColumns` · มือถือ 2 ใบ)
- **ค้นหา · เรียง · แบ่งหน้า ใช้ร่วมทั้ง 2 มุมมอง** — เรียง: ตามป้าย (จัดกลุ่มตามป้าย) / รหัส A→Z / SKU ที่เหลือน้อยก่อน / แก้ล่าสุด · หน้าละ 50/100/200 รุ่น (ของกลาง `Pager`)

## แก้ / ล้าง อยู่ตรงไหน
| ทำอะไร | ตรงไหน |
|---|---|
| ติด/เปลี่ยนป้าย | ช่องเลือกในคอลัมน์ "ป้าย" (หรือบนการ์ด) |
| เปลี่ยนป้ายหลายรุ่น | ติ๊กแถว/การ์ด (หรือหัวกลุ่ม) → แถบสีฟ้า "เปลี่ยนป้ายเป็น" · มีลิงก์ "เลือกทั้งหมด N รุ่นที่กรองอยู่" · ≥20 รุ่น = ถามยืนยัน · ≥200 รุ่น = ต้องพิมพ์ CONFIRM |
| ล้างป้าย | เลือก "— ไม่มีป้าย —" |
| หมายเหตุ | คลิกช่องหมายเหตุ → ป๊อปแก้ (ลบข้อความทั้งหมด = ลบหมายเหตุ) |
| ป้าย | "🏷️ ตั้งค่าป้าย": เพิ่ม · แก้ชื่อ/ไอคอน/สี/คำอธิบาย แล้วกด "บันทึก" ต่อแถว · ลาก ⋮⋮ เรียงลำดับ · 🗑 ลบ (รุ่นที่ติดป้ายนั้นกลายเป็น "ยังไม่มีป้าย") |
| รุ่นที่ไม่อยากเห็น | ปิดใช้งาน Parent SKU ที่หน้าสินค้า (หน้านี้แสดงเฉพาะรุ่นที่เปิดใช้งาน) |

## ข้อมูล
- view `marketing_sku_overview` (security_invoker, ปิดสิทธิ์ anon/authenticated) = `parent_skus_v2` (is_active) + `marketing_skus` + จำนวน SKU ย่อย (index `idx_skus_v2_parent_active` → นับ ~3 ms)
- `marketing_sku_labels` — ป้าย (name unique ไม่สนตัวพิมพ์, icon, color hex, description, sort_order)
- `marketing_skus` — ค่าการตลาดต่อรุ่น (`parent_sku_id` unique) + `label_id` (ลบป้าย → null) + `note` · สร้างแถวเมื่อติดป้าย/หมายเหตุครั้งแรก (upsert)
- `marketing_sku_variant_off` — สีที่ทีมการตลาดปิด (มีแถว = ปิด · เปิด = ลบแถว)
- migration: `202610091200_marketing_skus.sql`, `202610091400_marketing_sku_overview.sql`, `202610091600_marketing_variant_off.sql`

## API
- `GET /api/marketing/skus` — ทุกรุ่น (ไล่ดึงทีละ 1,000) + ป้าย + แบรนด์
- `PATCH /api/marketing/skus` `{ parent_sku_ids, label_id?, note? }` — upsert (ครั้งละ ≤500 รุ่น · หน้าเว็บแบ่งส่งให้เอง)
- `GET /api/marketing/skus/variants?parent_id=` — สี/แบบของรุ่น (ตอนกดดู) · `PATCH {sku_id, open}` — เปิด/ปิดสีเฉพาะการตลาด (สิทธิ์ marketing.sku.manage · audit `marketing.variant.open|close`)
- `GET/POST/PATCH/DELETE /api/marketing/sku-labels` — ป้าย (PATCH `{order:[ids]}` = เรียงลำดับ)
- ตัวช่วย pure: `lib/marketing/sku-list.ts` (type + `cleanIds`/`cleanColor`/`countBy`/`sortMarketingSkus`)

## สิทธิ์ + ประวัติ
| สิทธิ์ | ใคร (ค่าเริ่มต้น) | ทำอะไรได้ |
|---|---|---|
| `marketing.sku.view` | admin / manager / staff | เปิดดูหน้า |
| `marketing.sku.manage` | admin / manager / staff | ติดป้าย/หมายเหตุ |
| `marketing.label.manage` | admin / manager | ตั้งค่าป้าย |

ทุกการเปลี่ยนแปลงลง `audit_logs` (`marketing.sku.update`, `marketing.label.create|update|reorder|delete`) พร้อมค่าก่อนแก้

## ของกลางที่ใช้ / ที่ปรับ
- MiniTable (จัดกลุ่มตามป้าย/ติ๊กหลายแถว) — **เพิ่ม prop `groupOrder`** · Pager · Popover · SearchableSelect · ColorInput · useDragReorder · HoverImage · ERPModal · ConfirmDialog (requireTyped) · Toast · useViewPref · GalleryColumns
- ParentSkuMultiPickerModal — **เพิ่ม prop `brandId`** (+ `/api/pickers/parent-skus?brand_id=` / `none`) — ทำไว้ตอนยังมีขั้นเลือกรุ่น ยังใช้ได้กับหน้าอื่น

## ยังไม่ทำ
- ยอดขาย/ออเดอร์ 7·30 วัน ต่อรุ่น (ต้องผูกรหัส Shopee ↔ SKU ก่อน — ตอนนี้ผูกแล้ว 0)
- Dashboard แยกแบรนด์ (จับคู่ร้าน ↔ แบรนด์)
