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

## มุมมอง "ตามชุด" (หน้า /sales/orders)
- `GET /api/so-orders/batches` → ชุด + ขั้นของทุกรายการ · ขั้นคิดสดที่ `lib/so-order-stage.ts` (soLineStage) จาก `lib/mo-dispatch` → `moProgress` — **ไม่มีสถานะชุดที่ตั้งเอง**
- ขั้น: รอเปิดผลิต → เปิดผลิตแล้ว → กำลังผลิต (จ่ายงานแล้ว) → ทำเสร็จ (ส่งครบ/ปิดใบ) → ส่งลูกค้าแล้ว (ใบสั่งขาย shipped) · ทั้งชุด = ขั้นของรายการที่ช้าที่สุด
- ปุ่มทั้งชุด: เปิดใบสั่งผลิต (`open_mo` + `group_id` ทีละใบสั่งขาย) · พิมพ์ใบซื้อ-ตัด (`familyPrintUrl({ ids })`) · ส่งของ (เฉพาะใบสั่งขายที่ทุกรายการอยู่ชุดนี้และทำเสร็จครบ)
- **จ่ายงานชุดนี้** (สิทธิ์ `work_board.dispatch`, มีรายการที่เปิดผลิตแล้วแต่ยังไม่จ่าย) → `/master/work-board?view=shop&group=<ชื่อชุด>` · บอร์ดรับ `?group=` แล้วกรองกลุ่มให้ทั้งช้อปจ่ายงาน / widget รอจ่าย / ปฏิทิน / เมนูพิมพ์ (prop `initialGroup` ของ DispatchShop / BoardCalendar)
- รายการยังไม่มี SKU → ปุ่ม "เลือก SKU ใน SO-…" / กดเลขใบสั่งขายในตาราง = เปิดฟอร์มใบนั้น (onOpenOrder) ไปเลือก SKU ในแถวด้วย SkuPicker เดิม

## ลงออเดอร์จาก Design Dashboard
- แถบเครื่องมือ "ลงออเดอร์" = โหมดติ๊กเลือกเดิม (pickPurpose `order`, สูงสุด 30 ใบ) · ในป๊อปใบงานมีปุ่ม "ลงออเดอร์" ทีละใบ
- `seedsFromDesignSheets()` — ใบที่มี Parent SKU กางทุกสี/แบบ (`/api/design-sheets/[id]/skus`) · ยังไม่มี SKU = ลงเป็นชื่อ + ป้ายเตือน (เปิดผลิตไม่ได้)
- ลูกค้าตามแบรนด์: จำต่อผู้ใช้ที่ `/api/user-prefs` key `so_order_brand_customer` (ครั้งแรกเลือกเอง ครั้งต่อไปเติมให้ แก้ได้)

## ภาษีขาย (VAT)
- ของกลาง `VatModeToggle` + `vatRateForCompany()` ใน `components/sales-line-items` — "มี VAT 7% / ไม่มี VAT" + "ราคารวม VAT แล้ว"
- บริษัทที่ไม่ได้จด VAT (`companies.vat_registered = false`) → ตั้ง 0 ให้เองและกด "มี VAT" ไม่ได้ · ใช้ทั้งป๊อปลงออเดอร์และฟอร์มใบสั่งขาย
- ยอดเงินใบสั่งขาย (`computeTotals` ใน app/api/so-orders/shared.ts) เก็บเป็น **บาท** — เครื่องคิดเงินกลางคืนสตางค์ ต้อง `toMajor` ก่อนเก็บ (เทสต์ lib/__tests__/so-order-totals.test.ts)

## สิทธิ์ / audit
- บันทึกใบสั่งขาย = `so.create` (สร้างชุดใหม่ใช้สิทธิ์นี้ ไม่ต้องมี products.edit) · ดูรายการชุด = `/api/mo/groups` (products.view)
- audit: `create so_order` (+new_groups) · `create mo_group` (from so_order) · `so_order.open_mo` (+grouped)

## ข้อจำกัด
- ป๊อปไม่มีส่วนลดท้ายบิล / ค่าส่ง / หัก ณ ที่จ่าย — แก้ต่อได้ในฟอร์มใบ
- ผู้ใช้ที่ไม่มี products.view จะไม่เห็นรายการชุดในตัวเลือก
