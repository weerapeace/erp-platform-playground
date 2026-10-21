# DrawerShell — โครง drawer กลาง (สำหรับ drawer ที่ออกแบบหัว/เนื้อหาเอง)

ไฟล์: `components/modal/index.tsx` (export `DrawerShell`) · เพิ่ม 2026-10-21 (audit แอปจัดการงาน Y2)

## ใช้ทำอะไร
แผงเลื่อนจากขวา "เฉพาะโครง" — พื้นหลังมืด · ขึ้นบนสุด (portal) · กด Esc ปิด (เฉพาะชั้นบนสุด ถ้ามีป๊อปซ้อน) · กดพื้นหลังแบบตั้งใจถึงปิด
ส่วนหัว/เนื้อหา/ปุ่ม วางเองทั้งหมด → ใช้แทนการเขียน `<div className="fixed inset-0 ...">` + `<div className="fixed right-0 ...">` เองในแต่ละไฟล์

```tsx
import { DrawerShell } from "@/components/modal";

<DrawerShell onClose={requestClose} width={drawerW}>          {/* width จาก useDrawerResize ได้ */}
  <div className="h-1 shrink-0" style={{ background: accent }} />
  ...หัว/เนื้อหา/ท้าย ของตัวเอง...
</DrawerShell>

<DrawerShell onClose={onClose} className="w-[600px]">...</DrawerShell>   {/* ความกว้างคงที่ */}
```

| ค่า | ความหมาย |
|---|---|
| `onClose` | เรียกตอนกดพื้นหลัง/Esc — ใส่ด่าน "ยังไม่บันทึก" ของตัวเองในฟังก์ชันนี้ (เช่น `dirty ? undefined : onClose()`) |
| `width` / `className` / `style` | ความกว้าง/หน้าตาแผง |
| `open` | ค่าเริ่ม true |
| `closeOnBackdrop` / `closeOnEsc` | ปิดพฤติกรรมนั้น ๆ ได้ |

## กติกา
- กด Esc ตอนกำลังพิมพ์ในช่อง (input/textarea/select/แก้ข้อความ) = **ไม่ปิด** (กันพิมพ์หาย — ช่องใช้ Esc ยกเลิกของตัวเองได้)
- หัว/ท้ายแบบมาตรฐานพอ → ใช้ `<Drawer>` แทน (มีหัว ปุ่มปิด ลากขยาย จำขนาด ด่านยังไม่บันทึกให้ครบ)

## ใช้อยู่ที่
drawer งาน (task-detail-drawer) · drawer คอนเทนต์ (content.tsx) · drawer แคมเปญ · คลังความรู้ · ตารางบนกระดาน (table-drawer) · หน้าแคมเปญ (รายละเอียดสินค้า/ไฟล์บนกระดาน 2 จุด)
