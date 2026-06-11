# CanvasSketch — กระดานวาด Excalidraw (ของกลาง)

`components/canvas-sketch/index.tsx` · API: `/api/canvas-sketch` · ตาราง: `erp_canvas_sketches` · ใช้จริง: Design Sheets แท็บ "🖌 กระดาน"

## ใช้ทำอะไร

กระดานวาดแบบ miro ผูกกับเอกสาร 1 ใบ: วางรูปจาก clipboard (Ctrl+V) / ลากไฟล์รูป, กล่อง, ลูกศร, ข้อความ, วาดเส้นอิสระ
ตอนบันทึกระบบ **ถ่ายภาพกระดานเป็น PNG เก็บใน R2** อัตโนมัติ → ใบพิมพ์/การ์ดเอาภาพไปแปะได้

## วิธีใช้ (โมดูลไหนก็ได้)

```tsx
import { CanvasSketch } from "@/components/canvas-sketch";

<CanvasSketch entityType="design_sheet" entityId={sheetId} editable={canEdit} height="58vh" />
```

- 1 เอกสาร = 1 กระดาน (unique entity_type + entity_id)
- component จัดการโหลด/บันทึกเองทั้งหมด — **บันทึกอัตโนมัติ**: หยุดวาด ~2.5 วิ → save เอง + flush ตอนปิดแท็บ/ปิด modal · มีตัวบอกสถานะ (รอบันทึก/กำลังบันทึก/✓ แล้ว) · บันทึกพลาด (เน็ตสะดุด) → ขึ้น ⚠ + ปุ่มลองใหม่ และจะลองซ้ำเองเมื่อแก้ครั้งถัดไป
- ภาพถ่ายกระดาน: key ตายตัว `canvas-sketch/<type>/<id>.png` — บันทึกใหม่ทับของเก่า **ไม่มีไฟล์ขยะใน R2**
- ดึงภาพไปใช้: GET `/api/canvas-sketch?entity_type=..&entity_id=..` → `preview_url`

## ข้อจำกัด / ข้อควรรู้

- ขนาดกระดานจำกัด 8MB (รูปที่วางฝังใน scene) — วางรูปใหญ่หลายรูปมากๆ จะเตือน
- ไม่มีตารางสำเร็จรูป (วาดกล่องเรียงแทน)
- ตัวเสริม: `@excalidraw/excalidraw` v0.18 — โหลดเฉพาะหน้าที่ใช้ (dynamic import) ไม่ถ่วงหน้าอื่น
- สิทธิ์ API ตอนนี้ใช้ products.view/products.edit — โมดูลอื่นที่ต้องการสิทธิ์แยก ค่อยเพิ่ม param ภายหลัง
- ลบเอกสารแม่ ไม่ได้ลบกระดานอัตโนมัติ (entity_id เป็น text ไม่มี FK) — ยอมรับได้: กระดานเก่าไม่โผล่ที่ไหน
