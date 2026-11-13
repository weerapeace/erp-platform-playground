# SAMPLE Images (`/tasks/samples`)

> ที่พักรูปตัวอย่าง (Sample) ก่อนย้ายเข้าใบงานใน Design Dashboard
> ทางเข้า: ปุ่มทางลัด **SAMPLE Images** บนหน้าแรกแอป "จัดการงาน" · เพิ่มเมื่อ 2026-11-13 (เจ้าของขอจากแผนผังการเก็บไฟล์: Sample Photoshoot → แปลง JPEG → R2 → Design Dashboard)
> โค้ด: หน้า `app/tasks/samples/page.tsx` → `components/sample-images` (UI + `api.ts`) · ตรรกะล้วน + เทสต์ `lib/sample-images.ts` · API `app/api/sample-images/route.ts`

## ทำอะไรได้

1. ลากรูปมาวางทีละหลายรูป (ทั้งโฟลเดอร์ก็ได้ — `useFileDrop` folders) หรือกด "เลือกรูป"
   - ย่อด้านยาวไม่เกิน **2,400px** + แปลงเป็น **JPEG** ทุกไฟล์ (`prepareResizedImage(file, 2400, { jpeg: true })` · พื้นโปร่งเป็นขาว · HEIC จาก iPhone แปลงได้)
   - RAW จากกล้อง (CR2/NEF/ARW…) / PSD / AI / TIFF = ข้าม + แจ้ง (เบราว์เซอร์แปลงไม่ได้)
   - ระหว่างลง: แถบ `UploadProgress` (รูป 3/20 · ย่อ/อัปโหลด · ปุ่มหยุด)
2. ระบบหา/สร้าง **อัลบั้มของวันนี้** ชื่อ `SAMPLE 13 พ.ย. 2569` (เวลาไทย) — โยนหลายรอบในวันเดียว = อัลบั้มเดียว
3. แต่ละอัลบั้ม 3 แท็บ: **รอย้าย** · **ย้ายแล้ว** (ป้าย `→ DS-xxxx` กดเปิดใบงาน) · **ถังขยะ**
4. เลือกรูป → **ย้ายไป Design Dashboard** → ตัวเลือกใบงานกลาง `DesignSheetPickerModal` (docs/design-sheet-picker.md) → รูปไปอยู่ช่องรูปของใบงาน (แกลเลอรีด้านซ้ายในป๊อปใบงาน)
   - 1 รูปย้ายเข้าได้หลายใบงาน · ย้ายซ้ำใบเดิม = ข้าม (`photosToMove`)
5. ลบ = ไปถังขยะ (เอากลับได้) · รูปที่ใช้อยู่ที่อื่นในระบบ ระบบไม่ยอมลบ

## เก็บที่ไหน (ไม่มีตารางใหม่)

| ส่วน | เก็บที่ |
|---|---|
| ไฟล์รูป | R2 ผ่านคลังไฟล์กลาง — `POST /api/assets` (`source = "sample"`) · ไฟล์เดียวกันเป๊ะที่เคยลงแล้ว = ใช้แถวเดิม ไม่อัปซ้ำ (แจ้ง "เคยลงไว้ ใช้รูปเดิม") |
| อัลบั้ม | `asset_collections` ที่ `description = "sample-images"` (`SAMPLE_ALBUM_MARK`) + `asset_collection_map` — โผล่ในคลังไฟล์กลางด้วย |
| ย้ายเข้าใบงาน | `POST /api/attachments/from-library` → แถวไฟล์แนบของใบงานชี้ไฟล์เดิม (ไม่ก๊อป) + `asset_usages` (กันลบไฟล์ที่ใช้อยู่) |
| ถังขยะ | `assets.status = trashed` (`DELETE /api/assets/[id]`) · เอากลับ `PATCH {restore:true}` |

**สถานะคิดสด ไม่เก็บ** (`sampleStatusOf`): ถังขยะ > ย้ายแล้ว (มีใบงานที่แนบไฟล์นี้อยู่ — ดูจาก `erp_playground_attachments` entity `design_sheet` · ใบงานเอารูปออก = กลับมา "รอย้าย") > รอย้าย

## สิทธิ์ / ประวัติ

| ทำอะไร | สิทธิ์ | ประวัติ (audit) |
|---|---|---|
| ดูหน้า | `assets.view` | — |
| ลงรูป / สร้างอัลบั้มของวัน | `assets.upload` | `create asset` · `create asset_collection` |
| ย้ายเข้าใบงาน | `attachments.upload` (ตรวจใน DB) + `assets.view` | `attach` ที่ใบงาน (จาก DB) |
| ลบ (ถังขยะ) | `assets.delete` (ตอนทำ: admin · manager) | `delete asset` |
| เอากลับ | `assets.edit` | `restore asset` |

## ข้อจำกัด

- รายการอัลบั้มโชว์ 60 อัลบั้มล่าสุด
- หน้าเว็บเขียนไฟล์ลงโฟลเดอร์ในเครื่อง/NAS (`Z:\Work In Process\SAMPLE`) ไม่ได้ — ไฟล์ตรงนั้นอยู่เหมือนเดิม หน้านี้เก็บสำเนา JPEG ไว้ใช้ในระบบ
- ยังไม่มีเมนูในแถบแอป (มีแค่ปุ่มทางลัด) — เพิ่มเมนูต้องแก้ข้อมูลเมนูจริง (ขออนุญาตเจ้าของก่อน)
