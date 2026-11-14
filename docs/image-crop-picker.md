# ✂️ ImageCropPicker — ครอปรูปจากรูปสินค้า (ของกลาง)

`components/image-crop-picker.tsx`

**ใช้ทำอะไร** — ให้ผู้ใช้เลือกรูป (จัดกลุ่ม เช่น SKU ละกลุ่ม) → ลากกรอบ + ซูม → ได้ "รูปใหม่เฉพาะส่วนนั้น" อัปขึ้น R2 แล้วคืน `r2Key`

**ใช้ที่** — ทะเบียนสี: แบบ "รูปลาย" → ปุ่ม ✂️ ครอปจากรูปสินค้า (รูปของทุก SKU ที่ใช้สีนั้น: ปก · แกลเลอรี · รูปเว็บ จาก `GET /api/color-swatches?images=ชื่อ1|ชื่อ2`)

```tsx
<ImageCropPicker
  open={open} onClose={() => setOpen(false)}
  groups={groups /* null = กำลังโหลด */} error={err}
  aspect={1} outSize={320} folder="color-swatches"
  onDone={(r2Key) => save(r2Key)}
/>
```

| config | ความหมาย |
|---|---|
| `groups` | `{ key, label, sub?, badge?, images: r2Key[] }[]` · `null` = โหลดอยู่ |
| `aspect` | สัดส่วนกรอบ กว้าง/สูง (1 = จัตุรัส) |
| `outSize` | ความกว้างรูปผลลัพธ์ (px) — เก็บเป็น webp |
| `folder` | โฟลเดอร์ R2 (`/api/admin/upload`, ไม่ลงคลังกลาง `no_library=1`) |

- ย่อ/ขยายกรอบ = จับมุมกรอบลาก (มุมตรงข้ามอยู่กับที่ · ของกลาง ImageCropBox `resizable`) หรือหมุนลูกกลิ้งเมาส์บนรูป (100–1000%) · ตัวอย่างผลลัพธ์ (วงกลม/สี่เหลี่ยม) ที่แถบล่าง
- ตัดพิกเซลจริงบน canvas จาก `/api/r2-image?w=2000` (โดเมนเดียวกัน) — ห้ามส่ง URL ข้ามโดเมน (canvas อ่านไม่ได้)
- ใช้ `ImageCropBox` + `canvasBgWindow` ตัวเดียวกับครอปพื้นหลังผืนผ้าใบ → กรอบที่เห็น = ส่วนที่ได้จริง
- **ห้ามใช้** เมื่อแค่อยาก "เลื่อน/ซูมการแสดงผล" ของรูปเดิม (ไม่สร้างไฟล์ใหม่) → ใช้ `ImageCropBox` เก็บ `{x,y,zoom}` แทน
- สิทธิ์: อัปโหลดต้องล็อกอิน (`/api/admin/upload`) · การบันทึกค่าที่ได้ เป็นหน้าที่ของผู้เรียก (เช่น ทะเบียนสีเขียน audit)

## ✂️ โหมดกรอบอิสระ — `ImageFreeCropModal` (2026-11-14)

รูปเดียว · กรอบสัดส่วนอะไรก็ได้ · หมุน 90° ซ้าย/ขวา · นอกกรอบมืดลง = ส่วนที่ถูกตัดทิ้ง · กรอบเริ่ม = เต็มรูป (กดใช้ทันที = ไม่สร้างรูปใหม่)

```tsx
<ImageFreeCropModal open src={blobUrlOrR2Url} onClose={close}
  onDone={({ blob, w, h, rotation, rect }) => { /* อัป blob เอง · rotation = หมุนตามเข็มกี่ครั้ง · rect = % ของรูปหลังหมุน */ }} />
```

- `src` = blob URL ของไฟล์ในเครื่อง (ยังไม่อัป) หรือ `/api/r2-image?key=…&w=3200` (รูปที่อัปแล้ว — ขอ CORS จาก erp-img ให้อัตโนมัติ)
- ผลลัพธ์เป็น JPEG ด้านยาว ≤ `maxSide` (ค่าเริ่ม 2400) · **ไม่อัปเอง** ผู้เรียกอัป (เช่น ผ่าน `uploadImagesWithDupCheck` + `UploadProgress`)
- มีจุด/กรอบบนรูปเดิม → เลื่อนตามด้วย `rotateRect90` (หมุนตาม rotation ครั้ง) แล้ว `remapToCrop(rect)` จาก `lib/sku-swatch.ts`
- ตัวช่วยที่ใช้ซ้ำได้: `cropImageSource(src, win)` (ตัดส่วน 0–1 ของรูป → Blob) · `rotateImageSource(src, turns)` (→ blob URL ผู้เรียก revoke เอง) · `loadImageEl(src)`
- กรอบลากได้ = ของกลาง `ImageRegions` โหมด edit (1 กรอบ) + `overlay` พื้นมืด
- ใช้ที่: แผงผ้า Swatch (`components/sku-swatch-browser/board-editor.tsx`) — ครอปรูปตอนเพิ่มแผ่น / ตั้งค่าแผ่น
