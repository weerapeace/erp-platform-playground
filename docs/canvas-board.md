# CanvasBoard — กระดาน Section + การ์ด (ของกลาง)

`components/canvas-board/index.tsx` · ใช้จริง: `/master/design-sheets` · ตัวอย่างโค้ด: `app/_demos/canvas-board-demo/page.tsx` (โฟลเดอร์ `_demos` ถูกซ่อนจาก URL ตามนโยบายซ่อนหน้าเดโม่ — เปิดดูของจริงที่ Design Sheets ได้เลย)

## ใช้ทำอะไร

กระดานแบบ miro อย่างง่าย: แบ่งเป็น **โซน (section)** ซ้อนกันแนวตั้ง การ์ดเรียงต่อกันในโซน
**ลากการ์ดข้ามโซน** = ย้ายหมวด (เช่น ย้ายแบรนด์ ย้ายแผนก ย้ายสถานะ) — โมดูลกำหนดหน้าตาการ์ดเองทั้งใบผ่าน `renderCard`

## ใช้เมื่อไหร่ / ห้ามใช้เมื่อไหร่

- ✅ ข้อมูลจัดกลุ่มตาม "หมวดเดียว" และอยากให้ user ลากย้ายหมวดได้เห็นภาพ (แบรนด์ / แผนก / สถานะ)
- ✅ อยากได้มุมมองการ์ดคู่กับตาราง (ทำปุ่มสลับมุมมองในหน้า เช่น Design Sheets)
- ❌ ต้องการตำแหน่งอิสระจริงแบบ whiteboard (จุด x,y) — แบบนั้นคือ pattern ของ work-board (ยังไม่ได้รวมเข้าตัวนี้)
- ❌ ห้ามสร้างบอร์ดลาก-วางใหม่เองในโมดูล — ใช้ตัวนี้

## Props หลัก

| prop | ความหมาย |
|---|---|
| `zones: CanvasZone[]` | โซนทั้งหมด `{ id, title, color?, hint? }` — color = สีคาดหัวโซน (เช่นสีแบรนด์) |
| `items: T[]` | ข้อมูลการ์ด (type อะไรก็ได้) |
| `getItemId(item)` | คืน id การ์ด |
| `getZoneId(item)` | การ์ดอยู่โซนไหน (ต้องตรงกับ `zones[].id`) |
| `renderCard(item, dragging)` | หน้าตาการ์ด (โมดูลกำหนดเอง) |
| `onMove(item, toZoneId)` | ปล่อยการ์ดลงโซนใหม่ — ไม่ส่ง = ลากไม่ได้ |
| `onCardClick(item)` | คลิกการ์ด (เปิด modal แก้ ฯลฯ) |
| `canDrag` | ปิดการลากตาม permission (`canDrag={canEdit}`) |
| `cardWidth` | ความกว้างการ์ด px (default 184) |
| `hideEmptyZones` | ซ่อนโซนว่าง (default โชว์ไว้ให้ลากลง) |

## ตัวอย่าง (จาก Design Sheets)

```tsx
<CanvasBoard<DesignSheetListItem>
  zones={[...brands.map(b => ({ id: b.id, title: b.name, color: b.color })), { id: "__none__", title: "ไม่ระบุแบรนด์" }]}
  items={sheets}
  getItemId={(it) => it.id}
  getZoneId={(it) => it.brand_id ?? "__none__"}
  canDrag={canEdit}
  onMove={(it, to) => patchBrand(it, to)}   // PATCH ผ่าน API กลาง + optimistic + toast
  onCardClick={openEdit}
  renderCard={(it, dragging) => <MyCard item={it} dragging={dragging} />}
/>
```

## Permission / Audit

ตัวบอร์ดไม่รู้จัก permission เอง — หน้าที่ของโมดูล:
- ส่ง `canDrag={canEdit}` เพื่อปิดการลากของคนไม่มีสิทธิ์
- ใน `onMove` ให้บันทึกผ่าน API กลางที่มี guardApi + writeAudit (เช่น Design Sheets PATCH brand_id → audit "update")
- แนะนำทำ optimistic update + ดึงการ์ดกลับเมื่อบันทึกไม่สำเร็จ (ดู `moveBrand` ใน design-sheets/page.tsx)

## ข้อจำกัดที่รู้แล้ว

- ลากจัดลำดับการ์ด "ในโซนเดียวกัน" ยังไม่รองรับ (ตอนนี้เรียงตามลำดับ items ที่ส่งเข้า)
- work-board (บอร์ดจ่ายงาน) ยังใช้โค้ดลากแบบตำแหน่งอิสระของตัวเอง — แผน: ย้ายมาใช้ CanvasBoard หลังงานค้างฝั่งนั้น commit แล้ว (ตัดสินใจไม่แตะระหว่างมีงานค้าง)
