# 🕘 Record Versions — เก็บเวอร์ชันเก่าของสินค้า (ของกลาง)

## ใช้ทำอะไร
ทุกครั้งที่มีคนเปลี่ยนข้อมูล Parent SKU / SKU ระบบจะจด "ค่าเก่า" ไว้ให้อัตโนมัติ เพื่อดู เทียบ และย้อนกลับได้
ไม่ว่าจะแก้จากหน้า SKU ตรง ๆ หรือแก้จากในงาน Creative (ทุกทางผ่านตัวบันทึกกลางตัวเดียวกัน)

| สิ่งที่เปลี่ยน | จดที่ไหน | field_key |
|---|---|---|
| ชื่อ / คำอธิบาย (ข้อความ) | `PATCH /api/master-v2/[entity]/[id]` | ชื่อคอลัมน์ เช่น `description` |
| รูปปก | ตัวเดียวกัน | `cover` |
| ลบรูปออกจากแกลเลอรี | `DELETE /api/attachments/[id]` | `gallery` |
| เอารูปออกจาก Description (Parent) | `DELETE /api/assets/description` | `description_images` |

ฟิลด์ข้อความที่จด: ดู `VERSIONED_TEXT_FIELDS` ใน `lib/record-versions.ts` (เพิ่มคอลัมน์/ตารางได้ที่เดียว)

## ที่เก็บ
ตาราง `entity_field_history` (มีอยู่เดิม ต่อยอดด้วย migration `202610240100_record_versions.sql`)
- `kind` = `field` (ข้อความ: old_value/new_value เป็น jsonb) หรือ `image` (รูปเก่า: `r2_key`)
- `source` = master_edit / gallery_delete / description_image_remove / restore · `task_id` = งานที่เป็นต้นเหตุ (ใช้ในโหมดใหม่ของงาน)
- RLS เปิด ไม่มี policy → อ่าน/เขียนผ่าน API ฝั่ง server เท่านั้น

## กฎสำคัญ
- **ไฟล์รูปในเวอร์ชันไม่ถูกทิ้ง** — `lib/r2-refs` นับ `entity_field_history.r2_key` ว่า "ยังมีคนใช้" → ไม่ย้ายเข้าถังขยะ R2
- เก็บย้อนหลังจำกัด: ข้อความ/รูปปก 10 เวอร์ชันต่อช่อง · แกลเลอรี/รูป Description 30 รูปต่อสินค้า — เกินแล้วตัดของเก่าสุด และย้ายไฟล์ที่ไม่มีใครใช้เข้าถัง (กู้ได้ 30 วัน)
- จดแบบ best-effort: จดไม่สำเร็จจะไม่ทำให้การบันทึกสินค้าพัง (log อย่างเดียว)
- จดต้องเกิด "หลังบันทึกสำเร็จ แต่ก่อนเช็กย้ายไฟล์เข้าถัง"

## API
- `GET /api/record-versions?entity_type=parent_skus_v2&entity_id=<uuid>[&field_key=description]` (สิทธิ์ `products.view`) → `{ versions }` ใหม่ → เก่า พร้อม `image_url`

## ข้อจำกัด (ตอนนี้)
- เวอร์ชันเริ่มนับตั้งแต่วันที่ขึ้นระบบ (2026-10-18) ของก่อนหน้านั้นย้อนไม่ได้
- ยังไม่มีหน้าจอดู/ย้อนกลับ (ขั้นถัดไป: แถบเวอร์ชันในช่องแก้สินค้า)
- แก้หลายรายการพร้อมกัน (bulk edit) และงานแบบเดิมที่ส่งรูปเข้าสินค้าหลังอนุมัติ (มี ledger `erp_subtask_sync` ของตัวเอง) ยังไม่จดลงที่นี่
