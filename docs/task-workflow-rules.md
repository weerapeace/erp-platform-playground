# กติกาสถานะงาน (Task Manager) — ใครทำอะไรได้ (อัปเดต 2026-10-21 จาก audit แอปจัดการงาน)

ของกลางฝั่ง server: `lib/creative-statuses-server.ts` (findTransition / REVIEW_KINDS / terminalStatusKeys / approvedStatusKeys)
ฝั่งหน้าเว็บ: `app/tasks/task-actions.ts` (applyTaskTransition — ทุกจุดที่เปลี่ยนสถานะงานต้องผ่านตัวนี้)

## งานหลัก (`PATCH /api/creative-tasks/[id]`)
| การกระทำ | ต้องมีสิทธิ์ |
|---|---|
| เปลี่ยนสถานะตามเส้นทางธรรมดา | `tasks.edit` |
| เส้นทางชนิด อนุมัติ / ไม่ผ่าน / ให้แก้ (`approve/reject/revise`) | `tasks.approve` |
| ย้ายข้ามขั้นตอน (`force` — Canvas "ย้ายอิสระ", แอดมินตั้งสถานะ) | `tasks.approve` |
| เปลี่ยนผู้ตรวจ (`reviewer_ids` / `reviewer_id` / `approver_id`) | คนสร้างงาน หรือ `tasks.approve` |

- ย้ายเข้า **สถานะที่ปิดใช้แล้ว** ไม่ได้ (เส้นทางที่ชี้ไปสถานะปิดใช้ถูกตัดทั้ง server และปุ่มบนจอ)
- **ปิดงาน** (ไปสถานะจบ) ทั้งที่ยังมีงานย่อย todo/in_progress/submitted/revision_requested → ตอบ 409 `code: "open_subtasks"`
  หน้าเว็บถามผู้ใช้ → ยืนยันแล้วส่ง `close_open_subtasks: true` = ยกเลิกงานย่อยที่ค้าง + audit `subtask:auto_cancel`
- **สร้างงาน** ในสถานะจบ/สถานะผ่านการตรวจแล้ว (เช่น อนุมัติแล้ว) ไม่ได้

## งานย่อย (`PATCH /api/creative-tasks/[id]/subtasks` + ลิงก์อนุมัติใน LINE `/api/approve`)
- อนุมัติได้: หัวหน้า/แอดมิน · ผู้ตรวจของงาน · ผู้มีสิทธิ์ `task_subtask.approve`
- **ห้ามอนุมัติงานที่ตัวเองทำ** (ยกเว้นหัวหน้า/แอดมิน/`task_subtask.approve`) — ดูจาก `isSubtaskWorker()`
- งานหลักปิดแล้ว → ส่ง/อนุมัติงานย่อยต่อไม่ได้ (กันรูป/ข้อความเก่าถูกดันเข้าหน้าสินค้า)
- "เริ่มงาน" ตั้งช่องผู้รับผิดชอบเดี่ยว (`assignee_id`) เป็นคนกดด้วย · ถอนตัว/ยกเลิกเริ่ม คืนค่าให้ตรง

## รายการที่อ่าน
- คิวรอตรวจ (`/api/creative-tasks/review-queue`) และ "งานย่อยของฉัน" (`/my-subtasks`) ไม่โชว์งานย่อยของงานที่ปิดแล้ว
- "งานย่อยของฉัน" ใช้รายชื่อผู้รับผิดชอบหลายคนเป็นหลัก ช่องเดี่ยวระบบเก่านับเฉพาะงานย่อยที่ยังไม่มีรายชื่อเลย

## แจ้งเตือนกำหนดส่ง (`lib/creative-reminders.ts`)
สรุปวันละครั้งต่อคนต่อชนิด (เกินกำหนด / ใกล้กำหนด) · ไม่เตือนงานจบแล้วและงานที่ผ่านการตรวจแล้ว · "วันนี้" ตามเวลาไทย

## ป้าย/สีสถานะงานย่อย (`app/tasks/subtask-status.ts`)
แหล่งเดียวของป้าย 2 ภาษา · จุดสี · ป้ายกรอบ · ลำดับเรียง — `subStatusLabel` `subStatusDot` `subStatusBadge` `subStatusRank` `isSubDone` `normalizeSubStatus`
- ค่าเก่าในฐานข้อมูล `doing/done/posted` แปลงเป็น `in_progress/approved` ให้เอง
- ห้ามเขียนแผนที่สถานะงานย่อยเองในหน้าใหม่ (เดิมมี 6 ชุดไม่ตรงกัน → หน้าคิวงานโชว์ "ยังไม่เริ่ม" ให้งานที่ถูกขอแก้)

## แจ้งเตือนมุมจอ
ทุกหน้าในแอปจัดการงานใช้ toast กลาง (`components/toast`) — หน้าที่ส่ง `pushToast(type, msg)` ต่อให้ลูก ใช้ `usePushToast()` · ชนิด prop ใช้ `PushToast` / `ToastVariant` · ห้ามทำกองแจ้งเตือนเองในหน้า
