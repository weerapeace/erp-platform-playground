# ตัวเลือกใบงานออกแบบ (DesignSheetPickerModal)

> ป๊อปเลือกใบงานออกแบบ 1 ใบ (ใบงานใน Design Dashboard) — ค้นหาได้ มีรูปทุกใบ สลับการ์ดรูป/รายการ
> โค้ด: `components/design-sheet-picker` · เพิ่มเมื่อ 2026-11-13 (เจ้าของขอ "design dashboard ต้อง search ได้ และมีรูปโชว์ด้วย อยากได้แบบ view grid ด้วย")

## ใช้ทำอะไร

- ให้ผู้ใช้ชี้ใบงานออกแบบใบเดียว แล้วกดยืนยัน — ใช้ที่แรก: หน้า **SAMPLE Images** (`/tasks/samples`) ย้ายรูปตัวอย่างเข้าใบงาน
- ค้นรหัส / ชื่องาน / แบรนด์ (ไม่สนตัวพิมพ์ · ไฮไลต์คำที่ตรง) · ปุ่มกรองแบรนด์ · ซ่อนงานปิดแล้ว (ค่าเริ่ม — สถานะปิดงานตามที่ตั้งใน workflow ของใบงาน)
- มุมมอง **การ์ดรูป** (รูปปกเดียวกับการ์ด Design Dashboard · เลือกจำนวนการ์ดต่อแถว 3–8 ด้วยของกลาง `gallery-columns`) ↔ **รายการ** (รูปเล็ก + แบรนด์ + กำหนดส่ง) — จำต่อคน (`user-prefs` key `design_sheet_picker_view`)
- **ใช้ล่าสุด** โผล่บนสุด (`lib/recent-picks` key `RECENT_KEYS.designSheets`) — จำตอนกดยืนยันสำเร็จ
- เลือกแล้วด้านล่างบอก "จะย้ายไป …" · กดยืนยันโดยยังไม่เลือก = เตือน "เลือกใบงานก่อน" · ระหว่าง `onConfirm` ทำงาน ปุ่มขึ้น "กำลังทำ…" กันกดซ้ำ

## ห้ามใช้เมื่อไหร่

- เลือกหลายใบพร้อมกัน → `SearchMultiPick` (เช่น ตัวเลือกใบงานบนกระดานแคมเปญ `app/tasks/campaigns/[id]/multi-picks.tsx`)
- เปิดดู/แก้ใบงาน → `DesignSheetsDetail` (`components/design-sheet-detail`)

## วิธีใช้

```tsx
import { DesignSheetPickerModal } from "@/components/design-sheet-picker";

<DesignSheetPickerModal
  open={open}
  onClose={() => setOpen(false)}
  title="ย้าย 3 รูปไปใบงานไหน?"
  confirmText="ย้าย 3 รูป"
  head={<รูปย่อของที่จะย้าย />}          // ไม่ส่งก็ได้
  initialBrand="Good Goods"               // เปิดมากรองแบรนด์นี้ไว้ (ชื่อแบรนด์ตามใบงาน) · ไม่มีใบงานแบรนด์นี้ = ดูทุกแบรนด์เอง
  onConfirm={async (sheet) => { /* sheet = { id, code, name, brand_name, cover_url } */ }}
/>
```

## ข้อมูล / สิทธิ์

- ข้อมูลชุดเดียวกับหน้า Design Dashboard: `GET /api/design-sheets?limit=500` (ใบที่ยังไม่เก็บเข้ากรุ) + `GET /api/design-sheets/statuses` (ชื่อ/สีสถานะ)
- อ่านต้องมี `products.view` (ด่านเดียวกับ Design Dashboard) · ตัวเลือกไม่เขียนข้อมูลเอง — ที่ที่เอาไปใช้บันทึก/ลงประวัติเอง

## ข้อจำกัด

- โหลดสูงสุด 500 ใบที่ยังไม่เก็บเข้ากรุ (ตอนทำมี 87 ใบ) แล้วค้นในเครื่อง — ใบในกรุเลือกไม่ได้
