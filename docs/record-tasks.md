# ✅ เช็กลิสต์กลาง (Record Tasks) — ของกลาง

เช็กลิสต์ผูกกับ "หน้า/โมดูล" หรือ "เรคคอร์ดใดก็ได้" เก็บที่ตารางเดียว `erp_record_tasks` ผ่าน API กลาง `/api/record-tasks`
สถานะง่าย ๆ: ☐ ค้าง (`open`) / ✓ เสร็จ (`resolved` — ตาราง check constraint ไม่มีค่า `done`)

## ใช้เมื่อไหร่ / ห้ามใช้เมื่อไหร่
- ใช้: รายการสั้น ๆ ที่ติ๊กเสร็จได้ เช่น "รออะไรอยู่" ของใบงาน · เช็กลิสต์ส่วนกลางของหน้า
- ไม่ใช้: งานเต็มรูปแบบที่มีผู้รับผิดชอบ/กำหนดส่ง/ไฟล์แนบ → โมดูลงาน (erp_creative_tasks) · เช็กลิสต์ผลิตของบอร์ดจ่ายงาน (มีระบบของตัวเอง)

## หน้าตา 3 แบบ (ใช้ hook เดียวกัน `useRecordTasks`)
| แบบ | ใช้ที่ | ไฟล์ |
|---|---|---|
| `RecordTasksButton` ปุ่ม + Drawer | หัวหน้า Design Sheets (เช็กลิสต์ส่วนกลาง) | `components/record-tasks/index.tsx` |
| `RecordChecklist` ฝังในฟอร์ม | ใบงานออกแบบ "⏳ รออะไรอยู่" (คอม + มือถือ) | `components/record-tasks/checklist.tsx` |
| `RecordChecklistChip` แถบบนการ์ด | การ์ดใน Design Dashboard (บอร์ด + แกลเลอรี) | `components/record-tasks/checklist.tsx` |

```tsx
<RecordChecklist moduleKey="design_sheet_waiting" recordType="design_sheet" recordId={sheet.id}
  canEdit={canEdit} presetType="design_sheet_waiting" label="⏳ รออะไรอยู่" />

<RecordChecklistChip moduleKey=... recordId={sheet.id} summary={sheet.waiting_items}
  canEdit={canEdit} onChange={(s) => updateCard(sheet.id, s)} />
```

- **RecordChecklist**: ติ๊ก · กดข้อความเพื่อแก้ · ✕ ลบ (ชี้แถวถึงเห็น · จอสัมผัสเห็นตลอด) · พิมพ์ + Enter เพิ่ม · ปุ่มลัด "ใช้บ่อย" (ซ่อนข้อที่มีอยู่แล้ว) · ⚙️ ตั้งค่าปุ่มลัด · ข้อที่เสร็จพับเป็น "เสร็จแล้ว N ข้อ" · ทุกข้อโชว์ใครเพิ่ม/ใครติ๊ก + เมื่อไหร่ · บันทึกทันทีทีละข้อ (ไม่ผูกกับปุ่มบันทึกของฟอร์ม)
- **RecordChecklistChip**: ไม่มีรายการ = ไม่โชว์ · มีค้าง = "⏳ ข้อแรก +N" กดแล้วเด้งกล่องติ๊ก/เพิ่ม (ข้อที่เพิ่งติ๊กยังโชว์ขีดฆ่าจนปิดกล่อง กดผิดแก้ได้) · เสร็จครบ = "✓ ไม่มีอะไรรอแล้ว" · กันคลิก/พิมพ์ไหลไปเปิดการ์ด
- สรุปบนการ์ดมาจาก API รายการ (`loadChecklistSummaries` ใน `lib/record-tasks-server.ts` — ยิงครั้งเดียวทุกใบ) ไม่ยิงทีละการ์ด · ติ๊กบนการ์ดแล้ว `onChange` ส่งสรุปใหม่ให้หน้าแม่

## ค่าที่ใช้บ่อย (ปุ่มลัด)
- เก็บเป็นค่ากลาง `erp_lookups` ชนิด `presetType` · ลำดับ = `sort_order`
- แก้ได้จากหน้างานเลย: `LookupValuesEditor` (`components/lookup-values-editor`) — เพิ่ม / กดชื่อแก้ / ✕ เอาออก (ปิดใช้ เรียกคืนได้ที่ ตั้งค่า → ค่ากลาง) / ลากเรียง · ใช้ได้กับค่ากลางชนิดไหนก็ได้
- `useLookupNames(type)` = ชื่อที่เปิดใช้ (แคชร่วมทั้งหน้า แก้แล้วทุกช่องอัปเดตเอง)

## ข้อมูล
- `erp_record_tasks`: `module_key` (ชนิดเช็กลิสต์) · `record_type` · `record_id` (ข้อความ · ส่วนกลางของหน้า = `""` เพราะ NOT NULL) · `title` (≤300) · `status` · `created_by` / `resolved_by` (ชื่อคน) · `resolved_at`
- มีช่อง `assigned_to` / `due_at` / `priority` รองรับอยู่แล้ว (ยังไม่มีหน้าจอ — ถ้าจะเพิ่ม "รอใคร / ภายในวันไหน" ต่อยอดได้เลย)
- ใบงานออกแบบ: ค่าคงที่ชุดเดียวที่ `lib/design-sheet-waiting.ts` (`DESIGN_WAITING`) — ใช้ทั้งฟอร์ม/การ์ด/hover/API รายการ/อีเมลรายงาน
- migration `202610300500_design_sheet_waiting_checklist.sql`: สร้างชนิดค่ากลาง + ค่าตั้งต้น 5 ค่า + ย้ายข้อความ `design_sheets.waiting_for` เดิมเป็นข้อแรก (ช่องเดิมไม่ลบ เก็บสำรอง · รันซ้ำได้)

## สิทธิ์ / ประวัติ
- อ่าน `products.view` · เพิ่ม/ติ๊ก/แก้/ลบ `products.edit` (guardApi)
- audit `record_task` create / update / delete (ลบเก็บข้อความที่ลบไว้ในประวัติ)
- ค่าที่ใช้บ่อย: API ค่ากลางใช้ RLS (ผู้ใช้ที่ login แก้ได้) · ปุ่ม ⚙️ โชว์เฉพาะคนที่แก้ใบงานได้

## ข้อจำกัด
- ฟอร์มกับกล่องบนการ์ดเป็นคนละชุดข้อมูลในเครื่อง — แก้ที่หนึ่ง อีกที่เห็นตอนเปิดใหม่/หน้า Dashboard รีเฟรชหลังปิดใบงาน
- ใบงานใหม่ที่ยังไม่บันทึก เพิ่มสิ่งที่รอไม่ได้ (ยังไม่มีเลขใบ) — บันทึกก่อน
- ยังไม่มีการติ๊กผ่าน Discord (คุยแล้ว: ระดับ 1 = ลิงก์ · ระดับ 2 = บอท + ผูกบัญชี)
