# ดูรูปแบ่งกลุ่ม (GroupedImageViewer) — ดูอย่างเดียว

ของกลาง `components/grouped-image-viewer` · ทะเบียน `grouped-image-viewer` (lib/shared-parts-registry.ts)

## ใช้ทำอะไร
ป๊อปดูรูปทั้งชุดของเรื่องหนึ่งแบบ **ดูอย่างเดียว** แบ่งเป็นกลุ่ม → เจ้าของรูป → รูป
- ชิปด้านบน: ทั้งหมด / แต่ละกลุ่ม (พร้อมจำนวนรูป)
- เจ้าของรูปที่ยังไม่มีรูป → ขึ้นเตือนสีเหลือง "X ยังไม่มีรูป" (ปิดได้ต่อเจ้าของด้วย `warnWhenEmpty: false`)
- กดรูป → จอเต็ม `ImageLightbox` พร้อม **ชิปกลุ่ม** (กระโดดไปกลุ่มอื่น) + **แถบรูปเล็ก** · ซูม/ปัดนิ้ว/คัดลอก/โหลด JPG ได้เหมือนเดิม
- กด Esc ตอนดูเต็มจอ = ปิดแค่จอเต็ม ป๊อปยังอยู่

## ใช้เมื่อไหร่
- ให้คนตรวจงาน/ดูรูปทั้งชุดเร็ว ๆ โดยไม่แก้ เช่น ปุ่ม "ดูรูป" ในลิ้นชักงาน Task Manager

## ห้ามใช้เมื่อไหร่
- จัดการรูปสินค้า (เรียง/ลบ/ตั้งปก) → `ProductImageGallery`
- เลือกรูปไปใช้ต่อ → `AssetPicker`
- รูปชุดเดียว ไม่ต้องแบ่งกลุ่ม → `ImageLightbox` ตรง ๆ

## ค่าที่ส่ง
```tsx
<GroupedImageViewer open onClose={close}
  title="ดูรูป · PIX47" description="ดูอย่างเดียว"
  loading={!data} error={err} onRetry={reload}
  emptyTitle="ยังไม่มีรูป" emptyHint="..."
  groups={[
    { key: "parent", label: "Parent SKU", icon: "package", owners: [{ key: id, label: "PIX47", images: [{ url, thumbUrl, cover: true }] }] },
    { key: "sku", label: "SKU", icon: "tag", owners: [{ key: skuId, label: "PIX47-01", hint: "ดำ", images: [] }] },   // ไม่มีรูป → เตือน
    { key: "content", label: "คอนเทนต์", icon: "mobile", hideWhenEmpty: true, owners: [] },                         // ไม่มีเจ้าของ → ซ่อนกลุ่ม
  ]} />
```
- `icon` = ชื่อไอคอนกลาง (`<Icon name>`) · `hint` = ป้ายต่อท้ายชื่อ (เช่น ชื่อสี)
- รูปย่อ: ส่ง `thumbUrl` (เช่น `r2ImageUrl(key, 360)`) — ไม่ส่งใช้ `url`

## ImageLightbox ที่เสริมให้ (ไม่บังคับ — หน้าเดิมไม่ส่ง = หน้าตาเหมือนเดิม)
- `groups: { key, label }[]` + รูปแต่ละใบมี `group` → ชิปกลุ่มด้านล่าง · หัวบอก "กลุ่ม 2/5"
- `thumbnails` → แถบรูปเล็กด้านล่าง (รูปเล็กใช้ `thumbUrl`)

## ตัวที่ใช้อยู่: ปุ่ม "ดูรูป" ในลิ้นชักงาน
- หัวลิ้นชักงาน (ข้างปุ่มแก้ไข) + กดรูปปกฝั่งขวา → `app/tasks/task-images-viewer.tsx`
- ข้อมูล: `GET /api/creative-tasks/[id]/images` → `lib/task-images.ts` (pure + เทสต์ `lib/__tests__/task-images.test.ts`)
  - Parent ของงาน = Parent หลัก + Parent ที่ผูกเพิ่ม + Parent ของ SKU ที่ผูกงาน (สูงสุด 10)
  - ลำดับ/ตัดรูปซ้ำ ใช้ `assembleParentImages` (lib/parent-sku-images) ตัวเดียวกับตัวเลือกรูป: รูปหลักก่อน → ลำดับที่เรียงไว้ · รูปเดียวกันโชว์ครั้งเดียว
  - SKU ที่ปิดใช้แล้วไม่แสดง · คอนเทนต์ที่ลบแล้วไม่แสดง · แสดงเฉพาะรูป (ไม่รวมวิดีโอ)
  - คอนเทนต์ = รูปใน `erp_creative_attachments.content_id`

## สิทธิ์ / ประวัติ
- API ใช้สิทธิ์ `tasks.view` (ใครเปิดงานได้ = ดูรูปได้) · อ่านอย่างเดียว ไม่แก้ข้อมูล → ไม่บันทึกประวัติ

## ข้อจำกัด
- ปุ่มยังไม่บอกจำนวนรูป (โหลดตอนกดเท่านั้น กันลิ้นชักช้า)
- รูปที่อยู่ทั้ง Parent และ SKU (ไฟล์เดียวกัน) โชว์แค่ในกลุ่ม Parent
