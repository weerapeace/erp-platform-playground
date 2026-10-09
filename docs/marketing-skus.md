# 🎯 SKU การตลาด (`/marketing/skus`)

รายการ **รุ่นสินค้า (Parent SKU)** ที่ทีมการตลาดเลือกทำตลาด — ไม่ใช่ SKU ทั้งหมดในระบบ

## ใช้ทำอะไร
- เลือกรุ่นที่จะดันขาย (ครั้งแรกหน้าว่าง → ปุ่ม "เลือกสินค้าที่จะทำการตลาด")
- แยกแท็บตาม **แบรนด์** อัตโนมัติ (อ่านจาก `parent_skus_v2.brand_id` — ไม่เก็บซ้ำ) · รุ่นที่ยังไม่มีแบรนด์อยู่แท็บ "ไม่มีแบรนด์"
- ติด **ป้าย** ได้ 1 ป้ายต่อรุ่น เช่น 🔥 Hero / 🏷️ Clearance / 👜 Accessories — แอดมินเพิ่ม/แก้/ลบ/เรียงได้เองที่ปุ่ม "🏷️ ตั้งค่าป้าย"
- หมายเหตุต่อรุ่น (เช่น "ดันช่วง 11.11")

## เพิ่ม / แก้ / ลบ อยู่ตรงไหน
| ทำอะไร | ตรงไหน |
|---|---|
| เพิ่มรุ่น | ปุ่ม "＋ เลือกสินค้า" (ถ้าอยู่แท็บแบรนด์ ตัวเลือกจะโชว์เฉพาะรุ่นของแบรนด์นั้น) → เลือกป้ายตั้งต้น → เพิ่ม |
| เปลี่ยนป้าย | dropdown ในคอลัมน์ "ป้าย" · หรือติ๊กหลายแถว → แถบด้านบน "เปลี่ยนป้ายเป็น" |
| หมายเหตุ | คลิกช่องหมายเหตุ → ป๊อปแก้ (ลบข้อความทั้งหมด = ลบหมายเหตุ) |
| เอาออก | 🗑 ท้ายแถว หรือ ติ๊กหลายแถว → "🗑 เอาออก" (ไม่ลบตัวสินค้า เพิ่มกลับได้) |
| ป้าย | "🏷️ ตั้งค่าป้าย": เพิ่มป้ายใหม่ · แก้ชื่อ/ไอคอน/สี/คำอธิบาย แล้วกด "บันทึก" ต่อแถว · ลาก ⋮⋮ เรียงลำดับ · 🗑 ลบ (รุ่นที่ติดป้ายนั้นกลายเป็น "ยังไม่มีป้าย") |

## ข้อมูล
- `marketing_sku_labels` — ป้าย (name unique ไม่สนตัวพิมพ์, icon, color hex, description, sort_order)
- `marketing_skus` — 1 แถว/รุ่น (`parent_sku_id` unique) + `label_id` (ลบป้าย → null) + `note`
- migration: `supabase/migrations/202610091200_marketing_skus.sql` · RLS เปิด no-policy → เข้าผ่าน API (service role)

## API
- `GET/POST/PATCH/DELETE /api/marketing/skus` — รายการ + ป้าย + แบรนด์ / เพิ่มหลายรุ่น / เปลี่ยนป้าย-หมายเหตุหลายแถว / เอาออก
- `GET/POST/PATCH/DELETE /api/marketing/sku-labels` — ป้าย (PATCH `{order:[ids]}` = เรียงลำดับ)
- ตัวช่วย pure: `lib/marketing/sku-list.ts` (type + `cleanIds`/`cleanColor`/`countBy`)

## สิทธิ์ + ประวัติ
| สิทธิ์ | ใคร (ค่าเริ่มต้น) | ทำอะไรได้ |
|---|---|---|
| `marketing.sku.view` | admin / manager / staff | เปิดดูหน้า |
| `marketing.sku.manage` | admin / manager / staff | เพิ่ม/เอาออก/ติดป้าย/หมายเหตุ |
| `marketing.label.manage` | admin / manager | ตั้งค่าป้าย |

ทุกการเปลี่ยนแปลงลง `audit_logs` (`marketing.sku.add|update|remove`, `marketing.label.create|update|reorder|delete`) พร้อมค่าก่อนแก้

## ของกลางที่ใช้ / ที่ปรับ
- MiniTable (ค้นหา/เรียง/จัดกลุ่มตามป้าย/ติ๊กหลายแถว) — **เพิ่ม prop `groupOrder`** ให้กลุ่มเรียงตามลำดับป้าย
- ParentSkuMultiPickerModal — **เพิ่ม prop `brandId`** (+ `/api/pickers/parent-skus?brand_id=` / `none`)
- ERPModal · ConfirmDialog · SearchableSelect · ColorInput · useDragReorder · HoverImage · Toast

## ยังไม่ทำ (ก้อนถัดไป)
- ก้อน 2: คอลัมน์ยอดขาย/ออเดอร์ 7·30 วัน ต่อรุ่น (ต้องผูกรหัส Shopee ↔ SKU ก่อน — ตอนนี้ผูกแล้ว 0)
- ก้อน 3: Dashboard แยกแบรนด์ (จับคู่ร้าน ↔ แบรนด์)
