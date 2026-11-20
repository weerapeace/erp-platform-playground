# ปฏิทินรวมทุกแผนก (แท็บ "รวมทุกปฏิทิน" ใน /calendar)

**ใช้ทำอะไร:** ทุกอย่างที่มีวันที่ในระบบอยู่ในปฏิทินเดียว — กรองตามประเภท/คน · ลากเปลี่ยนวัน · กด + เพิ่มงานแผนทีมในวันนั้น · กดรายการเปิดหน้าเดิมเป็นป๊อป
เข้าได้จาก: เมนู "ปฏิทินรวม" (แท็บแรก) · ปุ่ม "ปฏิทินรวม" ในหน้าแผนงานทีม

| แหล่ง | ตาราง / วันที่ | สิทธิ์ดู | เลื่อนวัน (API เดิม) |
|---|---|---|---|
| แผนงานทีม | erp_record_tasks (team_plan) `due_at` | tasks.view | tasks.edit → PATCH /api/team-plan/[id] |
| งาน Task | erp_creative_tasks `due_date` | tasks.view | tasks.edit → PATCH /api/creative-tasks/[id] |
| คอนเทนต์ | erp_creative_content `scheduled_at` | tasks.view | tasks.edit → PATCH /api/creative-content/[id] |
| ผลิต (นัดส่ง) | manufacturing_orders `due_date` | products.view | products.edit → POST /api/mo/set-due-date |
| ใบงานออกแบบ | design_sheets `deadline` | products.view | products.edit → PATCH /api/design-sheets/[id] |
| ใบวางบิล | billing_notes `due_date` | customers.view | ดูอย่างเดียว (วันครบกำหนดเงิน) |
| ส่งของ (SO) | sales_orders `expected_ship_date` | customers.view | ดูอย่างเดียว |
| ของเข้า (PO) | purchase_orders_v2 `expected_date` | pr.view | ดูอย่างเดียว |

- แอดมินผ่านทุกสิทธิ์ = เห็นทุกแหล่ง · คนอื่นเห็นเฉพาะแหล่งที่มีสิทธิ์ดู · ปุ่มเลื่อนตามสิทธิ์แก้ (API เดิมเช็กซ้ำอีกชั้น)
- **ประวัติ (audit log)** เขียนโดย API เดิมของแต่ละโมดูล (มี changes จากอะไรเป็นอะไร) — ปฏิทินรวมไม่เขียนซ้ำ
- **ย้อนกลับ:** หลังลากมีแจ้งผลปุ่ม "ย้อนกลับ" 8 วินาที (บันทึกค่าเดิมกลับผ่าน API เดิม = ลงประวัติด้วย)
- แผนงานทีม/คอนเทนต์ เป็น timestamp → เลื่อนวันคงเวลาเดิม (ไม่มีเวลา: แผน 18:00 · คอนเทนต์ 10:00)
- กล่อง "ยังไม่กำหนดวัน" = แผนทีม / Task / คอนเทนต์ ที่ยังไม่ลงวัน (สูงสุด 300 ต่อแหล่ง)

**ไฟล์:** `lib/unified-calendar.ts` (แหล่ง/สี/สิทธิ์/คำขอเลื่อน · เทสต์ `lib/__tests__/unified-calendar.test.ts`) · `app/api/calendar/unified/route.ts` · `app/calendar/unified-calendar.tsx` (ScheduleBoard + toast.undo + EmbedModal + AddToPlanModal)

**เพิ่มแหล่งใหม่:** เติม `CAL_SOURCES` + loader ใน route + `moveRequest`/`itemLink`
