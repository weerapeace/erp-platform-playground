# อัลบั้ม Contents (คลังไฟล์ › Contents)

อัลบั้มรูป/วิดีโอจากการถ่าย 1 ครั้ง → แตกเป็นโพสต์ในปฏิทินคอนเทนต์ได้หลายโพสต์ (เจ้าของเลือก "แบบ ข" 2026-11-03)

## ใช้ทำอะไร / ใช้เมื่อไหร่

- ทีมถ่ายลากรูป/วิดีโอเข้าอัลบั้ม → ไฟล์ตัวจริงขึ้น **Google Drive ของแบรนด์** (`<แบรนด์>/Content/อัลบั้ม/<YYYY-MM ชื่อ>`) · ระบบเก็บแค่รูปย่อ/ภาพปกวิดีโอใน R2 ไว้โชว์
- คนวางแผนเลือกแพลตฟอร์ม + เขียนแคปชั่นร่าง → กด **ส่งเข้าปฏิทิน** → ได้โพสต์ร่างที่แนบไฟล์ที่เลือก (ชี้ไฟล์เดิมใน Drive ไม่ก๊อป)
- โพสต์ลงแล้ว → สถานะอัลบั้มขยับเอง ไม่ต้องมีใครกด

**ห้ามใช้เมื่อ:** ไฟล์ที่ต้องโชว์บนเว็บร้าน/สินค้า (ใช้รูปที่อัปเอง/รูปสินค้าในคลัง) · ไฟล์งานพิมพ์ (ใช้แถบงานพิมพ์ — Drive อย่างเดียว)

## สถานะ (ไม่เก็บ — คิดสด)

กติกา `lib/content-album-status.ts` (ทะเบียน workflow key `content-album`) ใช้ความพร้อมโพสต์ตัวเดียวกับปฏิทิน (`lib/content-readiness.ts`)

| สถานะ | เมื่อไหร่ |
|---|---|
| รอจัดการ | ยังไม่มีไฟล์ / ยังไม่เลือกแพลตฟอร์ม / โพสต์ยังไม่มีรูป |
| รอหา Caption | แพลตฟอร์มไหนยังไม่มีแคปชั่น (แคปชั่นร่างว่าง หรือโพสต์ยังไม่เขียน) |
| รอลง Social | พร้อม / ตั้งเวลาแล้ว / โพสต์อัตโนมัติล้ม |
| ลงแล้ว | ทุกแพลตฟอร์มที่ไม่ข้าม โพสต์แล้ว |
| ปิดแล้ว | กด "ปิดอัลบั้ม" เอง |

ชิปต่อแพลตฟอร์มโชว์ "ไปไกลสุด" (มีโพสต์ลง FB แล้ว = FB ลงแล้ว) · สถานะอัลบั้มดู "ช้าสุด"

## ข้อมูล

- `asset_collections` (ชื่อ/คำอธิบาย/ปก) 1:1 `content_albums` (แบรนด์ · ผู้รับผิดชอบ · วันที่ต้องลง · แพลตฟอร์มที่ตั้งใจลง · แคปชั่นร่าง · โฟลเดอร์ Drive · รูปที่เลือก · ปิด/ถังขยะ) — migration `202611120600_content_albums`
- ไฟล์ = `assets` source `content` ผ่าน `asset_collection_map` · `drive_file_id` = ตัวจริง · `r2_key` = รูปย่อ (ไม่มีภาพปก = `drive:<id>`) · `duration_sec` · `drive_missing_at` (ตัวตรวจรายวัน — เฟส 2)
- โพสต์ = `erp_creative_content.album_id` · ไฟล์แนบโพสต์ = `erp_creative_attachments` (รูป: r2_key + drive_file_id · วิดีโอ: url `drive:<id>`) + `asset_usages` module `creative_content` field `album`
- อัลบั้ม Contents ไม่โชว์ในรายการอัลบั้มปกติของคลัง (`/api/assets/collections` กรองออก)

## API · สิทธิ์ · ประวัติ

| | สิทธิ์ |
|---|---|
| `GET /api/content-albums` · `GET /api/content-albums/[id]` · `GET …/drive` | assets.view |
| `POST /api/content-albums` · `PATCH …/[id]` · `POST …/drive` · `POST …/files` | assets.upload |
| `DELETE …/files?asset_id=&drive=1` | assets.delete |
| `DELETE …/[id]` (ถังขยะ · กู้ด้วย PATCH `{restore:true}`) | assets.manage |
| สร้างโพสต์จากอัลบั้ม = `POST /api/creative-content` + `album_id` + `album_asset_ids` | tasks.create |

audit_logs entity `content_album`: create · update (เก่า→ใหม่) · trash · restore · file_add · file_remove · post_create

## หน้าจอ (ของกลางที่ใช้)

`components/asset-library/contents/` — `ContentAlbumsBoard` (การ์ด + แท็บสถานะ + ชิปแบรนด์ + ถังขยะ) · `AlbumDetailModal` (ERPModal · ลากวาง · UploadProgress · runBackgroundTask · ConfirmDialog) · `AlbumFormModal` (ERPForm · BrandSelect · UserPicker · PlatformIcon) · ส่งเข้าปฏิทินใช้ `ContentCreateModal` กลาง (preset.album)
อัปไฟล์ `uploadFilesToAlbum` (./data): รูปย่อ (`prepareResizedImage`) / ภาพปกวิดีโอ (`lib/video-poster`) → `/api/admin/upload` no_library → ตรวจรูปซ้ำ `askDuplicateUploads` → Drive ทีละชิ้น `uploadFileToDrive` → ลงทะเบียน
ลิงก์ตรง `/master/assets?source=contents&album=<id>` (ป้าย "จากอัลบั้ม" ในป๊อปโพสต์) · การ์ดปฏิทินมีไอคอนอัลบั้ม

## ข้อจำกัด (ยังไม่ทำ — เฟส 2)

- ปิดแท็บระหว่างอัป = ไฟล์ที่ยังไม่เสร็จต้องอัปใหม่ (ยังไม่จำจุดค้าง)
- ไฟล์ที่ลบ/ใส่เองใน Drive ระบบยังไม่รู้ (ยังไม่มีตัวตรวจรายวัน / ปุ่มดึงไฟล์ใหม่จาก Drive)
- วิดีโอยังไม่ตรวจซ้ำ · HEIC ไม่มีรูปย่อ (ขึ้นไอคอน)
- แบรนด์ที่ยังไม่ตั้งโฟลเดอร์ Drive อัปไม่ได้ (ตั้งที่ แอปจัดการงาน › ตั้งค่า › โฟลเดอร์ต่อแบรนด์)
- ลิงก์รูปย่อ/วิดีโอเปิดได้โดยไม่ล็อกอินถ้ารู้รหัสไฟล์ (เหมือน /api/r2-image — ให้ Meta ดึงไปโพสต์ได้)
