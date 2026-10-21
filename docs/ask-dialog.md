# askText / askConfirm — ป๊อปถามผู้ใช้ "จากฟังก์ชัน" (ของกลาง)

ไฟล์: `components/modal/ask-dialog.tsx` · ตัวอย่างกดเล่น: `/_demos/popup-playground` (การ์ด 💬 askText / ❓ askConfirm)

## ใช้ทำอะไร
ถามเหตุผล / ถามยืนยัน จากโค้ดที่ **ไม่ใช่หน้าจอ React** (เช่น `app/tasks/task-actions.ts` ที่ใช้ร่วม บอร์ด/Canvas/แคมเปญ/ปฏิทิน/drawer)
โดยไม่ต้องวาง `<ConfirmDialog>` ไว้ทุกหน้า — ใช้แทน `window.prompt` / `window.confirm` ของเบราว์เซอร์

```ts
import { askText, askConfirm } from "@/components/modal/ask-dialog";

const reason = await askText({ title: "เหตุผลที่ไม่ผ่าน", required: true, variant: "danger", confirmText: "ไม่ผ่าน" });
if (reason === null) return;           // กดยกเลิก / Esc / คลิกพื้นหลัง = null → ต้องหยุด ไม่ทำต่อ

if (!(await askConfirm({ title: "ปิดงานนี้?", message: "...", variant: "danger" }))) return;
```

## ทำไมต้องมี
`window.prompt(...) || ""` เคยทำให้ **กดยกเลิกแล้วงานยังถูกตีกลับ** (ค่าว่างถูกส่งต่อ) — askText คืน `null` ชัดเจนเมื่อยกเลิก
และหน้าตาเป็นป๊อปกลางของระบบ (ConfirmDialog: Esc/พื้นหลัง = ยกเลิก, 2 ภาษา)

## ตัวเลือก
| ค่า | ใช้กับ | ความหมาย |
|---|---|---|
| `title` | ทั้งคู่ | หัวป๊อป |
| `message` | ทั้งคู่ | ข้อความอธิบาย (ข้อความหรือ JSX) |
| `variant` | ทั้งคู่ | `"danger"` = ปุ่มแดง (ลบ/ไม่ผ่าน/ยกเลิกของ) |
| `confirmText` / `cancelText` | ทั้งคู่ | ข้อความปุ่ม |
| `required` | askText | ต้องพิมพ์ก่อนกดยืนยัน (ขึ้นเตือนใต้ช่อง) |
| `placeholder` / `initial` / `rows` | askText | ตัวอย่างในช่อง / ค่าเริ่ม / ความสูงช่อง |

## ห้ามใช้เมื่อ
- ฟอร์มหลายช่อง → ใช้ `ERPModal` + ฟอร์มกลาง
- อนุมัติเอกสารที่มีทั้ง "อนุมัติ/ปฏิเสธ" ในป๊อปเดียว → ใช้ `ApprovalDialog`

## ข้อจำกัด
- เปิดบน root แยก (createRoot) → อ่าน context ของหน้า (เช่น `useT`) ไม่ได้ ข้อความ 2 ภาษาให้ใช้ `tr()` จาก `@/lib/lang`
- ไม่มีสิทธิ์/ประวัติในตัว — คนเรียกต้องตรวจสิทธิ์และ server ต้องเขียน audit เอง
