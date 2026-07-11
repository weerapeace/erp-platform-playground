# Loan & OD Playground (Phase 0 — Mock UI)

หน้าตัวอย่าง (mock) ของโมดูล **บริหารเงินกู้ & วงเงิน OD** ตามสเปก
`docs/loan-od-management-module-spec.md` — สร้างไว้ให้เจ้าของโปรเจกต์ดู/ให้ feedback
เรื่องคำ ปุ่ม และลำดับข้อมูล **ก่อน** ต่อฐานข้อมูลจริง (Phase 1)

- **URL:** `/loan-od-playground`
- **ข้อมูล:** mock ทั้งหมด (ไฟล์ `mock.ts`) — ยังไม่แตะ Supabase
- **ใช้ของกลาง:** `PlaygroundShell`, `DataTable`, `ERPForm`, `ERPModal/ConfirmDialog/Drawer`
  (ไม่มีการสร้าง table/modal/form เฉพาะโมดูล)

## หน้าจอที่มี (ตามสเปกข้อ 33)

| เมนู | สิ่งที่โชว์ |
|---|---|
| 📊 Dashboard | การ์ดสรุป, เงินที่ต้องเตรียมจ่าย 7/15/30/90 วัน, แถบใช้ OD, การแจ้งเตือน |
| 📄 สัญญาเงินกู้ | DataTable + Saved Views, รายละเอียด (สถานะ 4 ชั้น + ตารางผ่อน + Journal Preview), ฟอร์มสร้าง |
| 💸 การจ่าย/ตัดยอด | รายการจ่าย + Drawer ตัดยอด (เงินต้น/ดอกเบี้ย/ค่าธรรมเนียม/ค่าปรับ) + ConfirmDialog กลับรายการ |
| 🏦 วงเงิน OD | รายการ + แถบ % ใช้วงเงิน, รายละเอียด, Statement Import Wizard (preview + กันซ้ำ) |
| 📈 กระทบยอดดอกเบี้ย | เทียบประมาณการ vs ธนาคารหักจริง + ปุ่มยอมรับส่วนต่าง |
| 🏛️ หลักประกัน | ตารางหลักประกัน/ผู้ค้ำ (1 ชิ้นผูกหลายสัญญา) |
| 🔐 Permission | ตารางสิทธิ์ Role × Permission + ตัวอย่างฟิลด์ที่ซ่อน |
| ⚙️ สถานะหน้าจอ | Loading / Empty / Filtered / Error / Permission denied / Import partial |

## โครงไฟล์

```
app/loan-od-playground/
  page.tsx        — shell + เมนูย่อยโมดูล + สลับ view
  mock.ts         — types + ข้อมูล mock ทั้งหมด
  workflow.ts     — config สถานะ 4 ชั้น (lifecycle / drawdown / repayment health / accounting) + สีป้าย
  ui.tsx          — helper เล็ก (StatusChip, CardBox, Field, UtilizationBar)
  views-loan.tsx  — Dashboard, สัญญาเงินกู้ (list/detail/form), การจ่าย/ตัดยอด
  views-od.tsx    — OD, Statement Import, กระทบยอด, หลักประกัน, Permission, States
```

## ยังไม่ทำใน Phase 0 (ไปทำ Phase 1+)

ต่อ Supabase, Field Registry จริง, Workflow/Approval engine กลาง, Numbering กลาง,
Attachment/Audit จริง, การคำนวณดอกเบี้ย/ตารางผ่อนจริง — ทำหลังเจ้าของอนุมัติหน้าตา
