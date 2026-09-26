# Device View — ดูหน้า dashboard แบบจอคอม / แท็บเล็ต / มือถือ + QR เปิดบนเครื่องจริง

ของกลาง: `components/device-view` (+ รูป QR ของกลาง `components/qr-code.tsx`)

## ใช้ทำอะไร

ให้หน้า dashboard/บอร์ดหนึ่งหน้า "เลือกดูได้ 3 แบบ" โดยไม่ต้องทำหน้าแยก:

| โหมด | เกิดขึ้นเมื่อ | หน้าตา |
|---|---|---|
| อัตโนมัติ (ค่าเริ่มต้น) | ไม่ได้เลือกอะไร | ดูจากความกว้างจอจริง: มือถือ ≤ 639px · แท็บเล็ต ≤ 1023px · ที่เหลือ = จอคอม |
| เลือกเอง 🖥️ / 📟 / 📱 | กดปุ่มที่หัวหน้า | URL ได้ `?device=phone` ฯลฯ → refresh/แชร์ลิงก์แล้วยังเป็นโหมดเดิม |
| พรีวิว + QR | เลือกโหมดที่ **แคบกว่าจอจริง** (เช่น อยู่จอคอมแล้วกด 📱) | เนื้อหาถูกครอบในกรอบเครื่อง (มือถือ 400px / แท็บเล็ต 834px) + แผง QR ข้าง ๆ สแกนแล้วเปิดหน้านี้บนเครื่องจริงในโหมดเดียวกัน (+ ปุ่มคัดลอกลิงก์) |

เปิดบนมือถือจริงในโหมดมือถือ = ไม่มีกรอบ ไม่มี QR (เรนเดอร์ตรง ๆ)

## วิธีใช้ในหน้าใหม่

```tsx
import { useViewportLayout, useDeviceMode, DeviceModeToggle, DevicePreviewFrame } from "@/components/device-view";

const viewport = useViewportLayout();                       // จอจริง
const { mode, setMode, layout } = useDeviceMode(viewport);  // โหมดที่เลือก + layout ที่ต้องเรนเดอร์
const isDesktop = layout === "desktop";

// ปุ่มสลับ วางที่หัวหน้า
<DeviceModeToggle mode={mode} viewport={viewport} onChange={setMode} compact={!isDesktop} />

// เนื้อหาหน้า ห่อด้วยกรอบ (ถ้าไม่ต้องพรีวิว จะคืน children ตรง ๆ)
<DevicePreviewFrame layout={layout} viewport={viewport}>{body}</DevicePreviewFrame>
```

**กฎสำคัญ:** ส่วนที่อยากให้ "พรีวิวตรงกับเครื่องจริง" ต้องตัดสินด้วย `layout` (เช่น `isPhone ? "grid-cols-2" : "grid-cols-4"`)
ห้ามใช้ `sm:`/`lg:` ของ Tailwind สำหรับส่วนนั้น เพราะ breakpoint ดูจอจริง ไม่ดูกรอบพรีวิว

## รูป QR ของกลาง

```tsx
import { QrCode, useQrDataUrl } from "@/components/qr-code";
<QrCode text={url} size={168} />
```
โหลดไลบรารี `qrcode` แบบ dynamic เฉพาะตอนใช้ · ห้าม `import("qrcode")` เองในหน้าอื่น

## ใช้แล้วที่ไหน

- Design Dashboard (`components/design-dashboard`): บอร์ดสถานะบนแท็บเล็ต/มือถือกลายเป็นแถวเลื่อนซ้าย-ขวา (snap ทีละคอลัมน์) + ชิปสถานะกดเลื่อนไปคอลัมน์ · แกลเลอรีมือถือ 2 ต่อแถว · ปิดลากการ์ด (ทัชลากไม่ได้ → เปลี่ยนสถานะในป๊อปอัป)

## ข้อจำกัด

- ป๊อปอัปรายละเอียดใบงาน (design-sheet-detail) ยังไม่ได้ปรับให้พอดีจอมือถือ (เปิดได้ แต่หน้าตาเป็นแบบจอคอม)
- กรอบพรีวิวจำลอง "ความกว้าง" เท่านั้น ไม่จำลองทัช/ความเร็วเครื่อง
