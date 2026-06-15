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

### แทรกการ์ด/โซนจากภายนอก (controlsRef.insert)

ถือ `controlsRef` แล้วเรียก `insert(skeletons)` เพื่อแทรก element ลงกลางจอ (เช่นปุ่ม "เพิ่ม SKU Card / Section") — `skeletons` เป็น Excalidraw skeleton (`{type,x,y,...}`, x/y นับจาก 0 ระบบเลื่อนไปกลางจอให้) แล้วบันทึกอัตโนมัติเอง

```tsx
const ref = useRef<CanvasSketchControls | null>(null);
<CanvasSketch entityType="creative_board" entityId={boardId} controlsRef={ref} />
// ปุ่ม:
ref.current?.insert([
  { type: "rectangle", x: 0, y: 0, width: 250, height: 130, backgroundColor: "#fff", strokeColor: "#7c3aed", roundness: { type: 3 } },
  { type: "text", x: 14, y: 14, text: "📦 SKU-001\nชื่อสินค้า", fontSize: 16, strokeColor: "#1e293b" },
]);
```

ใช้จริง: Campaign Canvas (`app/tasks/campaigns/[id]`) — ปุ่ม Section (Frame) / SKU Card / Task Card

- 1 เอกสาร = 1 กระดาน (unique entity_type + entity_id)
- component จัดการโหลด/บันทึกเองทั้งหมด — **บันทึกอัตโนมัติ**: หยุดวาด ~2.5 วิ → save เอง + flush ตอนปิดแท็บ/ปิด modal · มีตัวบอกสถานะ (รอบันทึก/กำลังบันทึก/✓ แล้ว) · บันทึกพลาด (เน็ตสะดุด) → ขึ้น ⚠ + ปุ่มลองใหม่ และจะลองซ้ำเองเมื่อแก้ครั้งถัดไป
- ภาพถ่ายกระดาน: key ตายตัว `canvas-sketch/<type>/<id>.png` — บันทึกใหม่ทับของเก่า **ไม่มีไฟล์ขยะใน R2**
- ดึงภาพไปใช้: GET `/api/canvas-sketch?entity_type=..&entity_id=..` → `preview_url`

## ข้อจำกัด / ข้อควรรู้

- ขนาดกระดานจำกัด 8MB (รูปที่วางฝังใน scene) — วางรูปใหญ่หลายรูปมากๆ จะเตือน
- ไม่มีตารางสำเร็จรูป (วาดกล่องเรียงแทน)
- ตัวเสริม: `@excalidraw/excalidraw` v0.18 — โหลดเฉพาะหน้าที่ใช้ (dynamic import) ไม่ถ่วงหน้าอื่น
- สิทธิ์ API เลือกตาม entity_type ฝั่ง server (map `PERM` ใน route): `design_sheet`→products.* · `creative_board`→tasks.* · อื่นๆ default products.* (เพิ่ม entity ใหม่ก็เติม map — client ระบุสิทธิ์เองไม่ได้ กันสวมสิทธิ์ข้ามโมดูล)
- ลบเอกสารแม่ ไม่ได้ลบกระดานอัตโนมัติ (entity_id เป็น text ไม่มี FK) — ยอมรับได้: กระดานเก่าไม่โผล่ที่ไหน
