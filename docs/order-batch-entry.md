# ลงออเดอร์ทีละหลายรายการ + ชุด (OrderBatchEntryModal · MoGroupPicker)

## ใช้ทำอะไร
- **`OrderBatchEntryModal`** (`components/order-batch-entry`) — ป๊อปลงออเดอร์ลูกค้า (ใบสั่งขาย `so_orders`) ทีละหลายรายการ แล้วจับ "ชุด" ให้แต่ละรายการ
- **`MoGroupPicker`** (`components/mo-group-picker`) — ช่องเลือก "ชุด" (= กลุ่มใบสั่งงาน `mo_groups`) แบบ dropdown: ค้นหา · ชุดที่ใช้ล่าสุด · พิมพ์ชื่อแล้วสร้างชุดใหม่
- **`MoGroupOptions`** — รายการชุดแบบติ๊กเลือก (ตัวเดียวกับในป๊อป "จัดกลุ่มใบสั่งงาน" หน้าใบสั่งผลิต / บอร์ดจ่ายงาน)
- **`useMoGroups()`** — โหลดชุดที่ใช้งานอยู่ (แหล่งเดียว)

## ทางเพิ่มรายการ (ทุกทางเป็นตัวเลือกกลาง)
| ปุ่ม | ของกลาง |
|---|---|
| วางจาก Excel | `LineImportModal` |
| เลือกสินค้าหลายตัว | `SkuMultiPickerModal` |
| เลือกทั้งรุ่น (กางทุกสี) | `ParentSkuMultiPickerModal` → `/api/pickers/skus?parent_sku_id=` |
| ดึงจากใบเสนอราคา | `SourceDocPickerModal` mode `so_quote` |
| ดึงจากใบสั่งผลิต | `MoMultiPickerModal` → ราคาจาก `/api/so-orders/sources?type=mo&mo_nos=` |

ตารางรายการ = `SOLineEditor` (ตัวเดียวกับใบขาย) + prop `extraColumns` (ติ๊ก / ชุด) · ลูกค้า = `CustomerPicker` · วันที่ = `DateInput`

## กติกาชุด
- เก็บที่ `so_order_lines.mo_group_id` (migration `202611021300_so_order_lines_mo_group.sql`)
- ชุดใหม่ = ส่ง `lines[].mo_group_key` + `new_groups{key: ชื่อ}` → เซิร์ฟเวอร์สร้างตอนบันทึก (ชื่อซ้ำกับชุดที่มีอยู่ = ใช้ชุดเดิม) · กดยกเลิกไม่เหลือชุดว่าง
- เปิดใบสั่งผลิต (`app/api/so-orders/open-mo.ts`): ใบที่เปิดใหม่ → เข้าชุดของรายการ · ใบเดิมที่ดึงมาผูก → เข้าชุดเฉพาะใบที่ยังไม่อยู่กลุ่มไหน (ไม่แย่งกลุ่ม)
- `open_mo { group_id }` = เปิดเฉพาะรายการของชุดนั้น

## สิทธิ์ / audit
- บันทึกใบสั่งขาย = `so.create` (สร้างชุดใหม่ใช้สิทธิ์นี้ ไม่ต้องมี products.edit) · ดูรายการชุด = `/api/mo/groups` (products.view)
- audit: `create so_order` (+new_groups) · `create mo_group` (from so_order) · `so_order.open_mo` (+grouped)

## ข้อจำกัด
- ป๊อปตั้ง VAT 7% / ไม่มีส่วนลดท้ายบิล — แก้ต่อได้ในฟอร์มใบ (สร้างทีละใบ)
- ผู้ใช้ที่ไม่มี products.view จะไม่เห็นรายการชุดในตัวเลือก
