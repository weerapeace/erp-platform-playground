# การ์ดวันสำคัญ + เส้นเวลา (DateCards)

เจ้าของขอ 2026-11-07: "ออกแบบตรงวันที่นัดกับ deadline ให้ดูสวยหน่อย" (ใบงานออกแบบ แท็บข้อมูลงาน) — ดู widget แล้ว "สร้างเลย"

## ใช้ทำอะไร
โชว์วันสำคัญของเอกสาร 2-4 วันให้อ่านทันทีว่า "อีกกี่วัน / เลยกี่วันแล้ว" และกดการ์ดเพื่อเลือกวันได้เลย

## หน้าตา / การทำงาน
- การ์ดละ 1 วัน: เลขวันตัวใหญ่ · เดือน ปี พ.ศ. (ย่อ) · วันในสัปดาห์ · ป้ายสถานะ
  | ชนิด (`kind`) | ป้าย | สี |
  |---|---|---|
  | `since` (เช่น วันที่สั่ง) | ผ่านมา N วัน / วันนี้ | เทา |
  | `due` (วันนัด / Deadline) | อีก N วัน | เขียว (เหลือ > 3 วัน) · ส้ม (≤ 3 วัน / วันนี้) |
  | `due` เลยแล้ว | เลยมา N วัน | แดง |
  - `muted` = งานปิดแล้ว → ป้ายเทาทั้งหมด (ไม่เตือน)
- กดการ์ด = เปิดปฏิทินของเบราว์เซอร์ (`showPicker`) · ✕ = ล้างวัน · ไม่ส่ง `onChange` = ดูอย่างเดียว
- ยังไม่มีวัน = กรอบเส้นประ "+ ตั้งวัน"
- เส้นเวลา (`timeline`): จากการ์ด `from` → การ์ดตัวแรกใน `to` ที่มีวัน · ขีดดำ = วันนี้ · เลยกำหนด = แถบแดง + "เลยกำหนดมา N วัน"
- `compact` = ที่แคบ (เช่น กล่องถูกดันใน SplitPanes) → เรียงเป็นแถวเตี้ย ๆ

## ใช้ยังไง
```tsx
import { DateCards } from "@/components/date-cards";

<DateCards muted={finished} timeline={{ from: "order", to: ["due", "appt"] }} items={[
  { key: "order", label: "วันที่สั่ง", icon: "cart", kind: "since", value: form.order_date, onChange: canEdit ? (v) => patch({ order_date: v }) : undefined },
  { key: "appt", label: "วันนัด / ได้ตัวอย่าง", icon: "calendar", kind: "due", value: form.appointment_date, onChange: … },
  { key: "due", label: "Deadline ส่งงาน", icon: "flag", kind: "due", value: form.deadline, onChange: … },
]} />
```
- วันที่เป็น `"YYYY-MM-DD"` · นับวันด้วย `Date.UTC` + วันนี้ตามเวลาไทย (กันวันร่นตาม timezone)

## ห้ามใช้เมื่อไหร่
- ช่องกรอกวันที่ทั่วไปในฟอร์ม → `DateInput`
- มุมมองปฏิทินทั้งเดือน → ปฏิทินเอกสาร (`components/doc-calendar`)

## ไฟล์
- `components/date-cards/index.tsx` — หน้าจอ
- `lib/date-cards.ts` — pure (thaiDateParts / dateStatus / dateTimeline / todayIsoTh) · เทสต์ `lib/__tests__/date-cards.test.ts`
- ตัวอย่าง `app/_demos/date-cards-preview` · ทะเบียนของกลาง key `date-cards`

## ใช้ที่ไหนแล้ว
- ใบงานออกแบบ แท็บข้อมูลงาน (`components/design-sheet-detail/index.tsx`) — วันที่สั่ง (แก้ได้ตอนกด ✏️ แก้ไข) · วันนัด · Deadline · `muted` = สถานะปิดงาน (workflow is_terminal)

## สิทธิ์ / ประวัติ
ไม่มีของตัวเอง — แค่โชว์/เปลี่ยนค่าในฟอร์ม การบันทึกและประวัติเป็นของหน้าแม่
