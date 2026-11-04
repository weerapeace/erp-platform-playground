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
  - **ส่งเข้าปฏิทิน = เลือกวันก่อน (2026-11-04):** ปฏิทินกลาง `DocCalendar` (`onPickDay` · `selectedDay` = วันที่ต้องลงภายใน · `disablePast`) โชว์โพสต์เดิมของแบรนด์ (สีม่วง = จากอัลบั้มนี้) → กดวัน = เปิดฟอร์มที่ใส่วัน (+เวลาแนะนำ) แบรนด์ ชื่อ แพลตฟอร์ม ประเภท ไฟล์ แคปชั่น สินค้า · ไม่ได้แท็กสินค้า = เดาจากรหัสในชื่ออัลบั้ม (`codeLike` + `findParentSkuByCode` ตรงรหัสเป๊ะ) · ปุ่ม "ยังไม่กำหนดวัน" = เปิดฟอร์มไม่มีวัน
  - กริดไฟล์อยู่บนสุด (ต่อจากแถบ Drive) · โชว์เต็มรูปไม่ครอป (`FileThumb fit="contain"`) · ช่องลากไฟล์อยู่ใต้กริด
  - **แก้ข้อมูลในหน้า + แคปชั่นแยกแพลตฟอร์ม (2026-11-04 · เจ้าของอนุญาต DB):** ไม่มีป๊อป "แก้ข้อมูล" แล้ว — ส่วน "ข้อมูลอัลบั้ม" = ชุดช่องกลาง `AlbumInfoFields` (`album-info-fields.tsx` · ใช้ร่วมกับป๊อปสร้างอัลบั้มใหม่) · ตัวเลือกบันทึกทันที ข้อความบันทึกตอนออกจากช่อง (ป้าย กำลังบันทึก/บันทึกแล้ว ที่หัว)
    - "แคปชั่นตามแพลตฟอร์ม" = `CaptionCard` ตัวเดียวกับหน้าลงโพสต์ โหมด `draft` (ซ่อนสถานะโพสต์/path/รูปแบบ/รูป/ปุ่มไปโพสต์) → `content_albums.caption_drafts jsonb` (migration `202611130200`) · บันทึกเองหลังหยุดพิมพ์ 0.8 วิ (ปิดหน้าต่าง/ส่งเข้าปฏิทิน = บันทึกที่ค้างทันที) · ของกลาง pure `lib/content-album-captions` (normalize · captionForPlatform → ไม่มีของแพลตฟอร์มใช้ caption_draft เดิม · hasAnyCaption นับสถานะ)
    - AI เขียนรายแพลตฟอร์ม (`/ai-caption` รับ `platform` → prompt + ลิมิตของแพลตฟอร์ม) · "AI เขียนทุกแพลตฟอร์ม" = เรียกทีละแพลตฟอร์ม เฉพาะที่ยังว่าง (ว่างหมดไม่มี = ถามทับทั้งหมด) · ใช้กับทุกแพลตฟอร์ม (ยืนยันก่อนทับ) · ดึงจากแพลตฟอร์มอื่น (`PullCaptionModal`)
    - ส่งเข้าปฏิทิน: `preset.album.captions` → ContentCreateModal ใส่แคปชั่น+แฮชแท็ก+แม่แบบของแต่ละแพลตฟอร์มเข้าโพสต์ · audit ย่อ "แก้แคปชั่น: instagram, x"
  - **ลากเรียงลำดับไฟล์** (กดค้างที่รูปแล้วลาก หรือ ‹ ›) → `content_albums.file_order uuid[]` (migration `202611130100` · เจ้าของอนุญาต 2026-11-04) · ว่าง = เวลาที่เพิ่ม ใหม่ก่อน · ไฟล์ที่ไม่อยู่ในรายการ (อัปทีหลัง) ต่อท้าย · ของกลาง pure `lib/content-album-order` (applyFileOrder + test) · ใช้ทั้งกริด · การ์ด (ปกสำรอง/รูปย่อ) · ส่งเข้าปฏิทิน · zip · AI ร่างแคปชั่น · audit บอกแค่ "จัดลำดับใหม่ N ไฟล์"
อัปไฟล์ `uploadFilesToAlbum` (./data): รูปย่อ (`prepareResizedImage`) / ภาพปกวิดีโอ (`lib/video-poster`) → `/api/admin/upload` no_library → ตรวจรูปซ้ำ `askDuplicateUploads` → Drive ทีละชิ้น `uploadFileToDrive` → ลงทะเบียน
ลิงก์ตรง `/master/assets?source=contents&album=<id>` (ป้าย "จากอัลบั้ม" ในป๊อปโพสต์) · การ์ดปฏิทินมีไอคอนอัลบั้ม

## เฟส 2

- **อัปต่อจากที่ค้าง:** ลิงก์อัปของแต่ละไฟล์จำใน localStorage `erp.contentAlbum.pendingUploads.v1` (เครื่องเดิม ≤6 วัน · จับคู่ชื่อ+ขนาด+เวลาแก้ไฟล์) → ลากไฟล์เดิมมาวาง = ถาม Google ว่ารับถึงไหน (`/api/drive/upload-chunk` หัว `x-status: 1` · `queryDriveUpload`) แล้วส่งต่อ · ลิงก์หมดอายุ = เริ่มส่งใหม่ (รูปย่อเดิมใช้ต่อ) · ระหว่างอัปเตือนก่อนปิดแท็บ
- **วิดีโอซ้ำ:** `POST /api/content-albums/check-videos {sizes}` — ขนาดไฟล์ตรงกันทุกไบต์ (≥1MB) กับวิดีโอบน Drive ที่เคยอัป → ถาม "ใช้ไฟล์เดิม / อัปใหม่" (ไม่เทียบชื่อไฟล์)
- **ดึงไฟล์ใหม่จาก Drive:** `POST …/[id]/drive-sync` — ไฟล์รูป/วิดีโอที่ใส่เองในโฟลเดอร์อัลบั้ม → ลงอัลบั้ม (รูปทำรูปย่อ ≤1600 ลง R2 · checksum = sha256 จาก Drive) ทีละ 12 ไฟล์ จอวนเรียกจนครบ · ไฟล์ที่เคยเอาออกจากอัลบั้มไม่ดึงกลับ · อ่านได้ 100 ไฟล์แรกของโฟลเดอร์
- **ตัวตรวจไฟล์หาย:** `checkDriveFiles` (lib/content-albums-server) → `assets.drive_missing_at` · cron รายวัน `/api/cron/content-drive-check` 04:15 UTC (vercel.json · ครั้งละ 800 ไฟล์ วนวันละช่วง) + ทุกครั้งที่กด "ดึงไฟล์ใหม่จาก Drive" · ไฟล์กู้คืนแล้ว = ป้ายหายเอง · Drive ตอบไม่ได้ = ไม่แตะ
- **ปฏิทิน:** กล่อง "อัลบั้มรอลง" (`app/tasks/content-calendar/albums-box.tsx`) ลากอัลบั้มลงวัน = ป๊อปสร้างโพสต์พร้อมไฟล์ (`albumPostPreset` ใช้ร่วมกับปุ่มในอัลบั้ม) · มือถือ: กดช่องวัน → "หรือสร้างโพสต์จากอัลบั้ม" · ตัวเรียก API เบาแยกไว้ `contents/api.ts` (ปฏิทินไม่ต้องโหลดตัวอัปไฟล์)

## เฟส 3

- **AI ร่างแคปชั่น:** `POST …/[id]/ai-caption` (สิทธิ์ `ai.caption`) — ดูรูปที่เลือกใช้ ≤4 รูป (รูปย่อ R2) + `brandProfileBlock` + สินค้าที่แท็ก + โน้ต · prompt จากทะเบียนเดิม (`pickPrompt` · ลงแพลตฟอร์มเดียวใช้ prompt แพลตฟอร์มนั้น) · ไม่บันทึกเอง ใส่ช่องแคปชั่นร่างให้ตรวจ · audit `ai_caption` entity `content_album` (นับเข้าการ์ดค่าใช้จ่าย AI)
- **แท็กสินค้า:** `content_albums.parent_sku_codes` (รหัส Parent SKU) → API คืน `products[{id,code,name,image_key}]` · ป๊อปข้อมูลอัลบั้มใช้ `ParentSkuPicker` · ยังไม่เลือกแบรนด์ = เดาแบรนด์จากสินค้า (`resolveBrandFromProduct`) · สินค้าแรก = สินค้าหลักของโพสต์ที่สร้างจากอัลบั้ม (`preset.parent`) · ค้นหาด้วยรหัสสินค้าได้
- **เตือนอัลบั้มค้าง:** กติกา `albumReminder` (lib/content-album-status · เลยวันที่ต้องลง / ต้องลงพรุ่งนี้ / รอจัดการ ≥3 วัน · ลงแล้ว/ปิดแล้วไม่เตือน · วันตามเวลาไทย `bangkokToday`) ใช้ทั้งป้ายบนการ์ด + cron `/api/cron/content-album-reminders` 09:30 ไทย → กระดิ่ง `erp_notify` event `content_album.reminder` คนละ 1 ข้อความ/วัน (ผู้รับผิดชอบ · ไม่มี = ผู้จัดการ+แอดมิน) · `?dry=1` ดูก่อน
- **ดาวน์โหลด zip:** รูปที่เลือกใช้ (ไม่เลือก = ทั้งอัลบั้ม) ต้นฉบับจาก Drive (`/api/drive-video/<id>` · เกิน 30MB/หายจาก Drive = รูปย่อ) ผ่าน `downloadImagesAsZip` · วิดีโอไม่รวม · รวมเกิน 600MB ถามก่อน
- **ช่วยคัดรูป:** `lib/content-album-cull` (pure + เทสต์) — อาจเบลอ = ความคม (variance ของ Laplacian บนรูปย่อ 256px) ต่ำกว่า 40% ของค่ากลางในอัลบั้ม (≥4 รูป) · คล้าย = `assets.phash` ห่าง ≤6 บิต · แนะนำเก็บ = ไม่เบลอ + กลุ่มละรูปคมสุด · วัดในเบราว์เซอร์ (`contents/cull.ts`) ไม่มีค่าใช้จ่าย · "เลือกใช้ตามที่แนะนำ" = ตั้งรูปที่เลือก (วิดีโอคงเดิม)

## ลากไฟล์/ทั้งโฟลเดอร์ที่หน้ารวม (2026-11-03)

- หน้า Contents ทั้งหน้าเป็นช่องลากวาง (`useFileDrop` ของกลาง · `folders: true` ไล่ไฟล์ทุกชั้น · ≤2000 ไฟล์) + ปุ่ม "เลือกไฟล์" / "เลือกทั้งโฟลเดอร์" (`PickMediaButtons` · input webkitdirectory)
- วางแล้วเด้ง `UploadTargetModal` "ลงอัลบั้มไหน?": **สร้างใหม่** (ชื่อตั้งต้น = ชื่อโฟลเดอร์ · ต้องเลือกแบรนด์ · ลากหลายโฟลเดอร์ = ติ๊ก "แยก 1 โฟลเดอร์ = 1 อัลบั้ม") หรือ **อัลบั้มที่มีอยู่** (ค้นหาได้ · ไม่โชว์ที่ปิดแล้ว)
- อัปผ่าน `startAlbumUploadTask` (data.ts · ใช้ร่วมกับช่องลากวางในอัลบั้ม) — หลายอัลบั้ม = ต่อคิวทีละอัลบั้ม · ความคืบหน้าออกช่องกลาง `onAlbumUpload` (หน้าในอัลบั้มที่เปิดอยู่เห็นแถบอัป/ไฟล์ใหม่ ไม่ว่าเริ่มจากไหน) · แบรนด์ยังไม่ตั้งโฟลเดอร์ Drive = สร้างอัลบั้มแต่ไม่อัป + บอกเหตุผล
- ช่องลากวางในอัลบั้มรับทั้งโฟลเดอร์ด้วย · หน้าคลังไฟล์ปิดตัวรับลากวางเดิมตอนอยู่แถบ Contents (ไม่เด้งป๊อปอัปโหลดของคลัง)

## รายการที่อยากได้ + Reference (2026-11-04)

- **รายการที่อยากได้ = อัลบั้มที่ยังไม่ถ่าย** (`content_albums.phase = wish` · migration `202611130300_content_album_wishlist`) — ใช้ช่องเดิม (ชื่อ/แบรนด์/รุ่น/วันที่อยากได้/คนถ่าย/แพลตฟอร์ม/รายละเอียด = description) + `content_types` (POST_TYPES)
- สถานะคิดเอง `wishStage` (lib/content-album-status): ไม่มีคนถ่าย = รอหาคนถ่าย · มี = นัดถ่ายแล้ว · เตือนรายวันเฉพาะวันที่ (ไม่เตือน "รอจัดการนาน")
- **แปลงเป็นอัลบั้ม** = PATCH `{phase: "album"}` (id เดิม · Reference ติดไป · ย้อนกลับได้เฉพาะตอนยังไม่มีไฟล์) · ลากไฟล์จากการถ่ายแล้วเลือกรายการที่อยากได้ในป๊อป "ลงอัลบั้มไหน?" = แปลงให้เอง
- **Reference** ตาราง `content_album_refs` (1 แถว = รูป `r2_key` content-refs/ · ลิงก์ `url`+provider+title+thumb_url · ข้อความ `body` · โน้ต "ชอบตรงไหน") · API `/api/content-albums/[id]/refs` (GET assets.view · POST/PATCH/DELETE assets.upload · audit ref_add/ref_update/ref_remove)
- ลิงก์: `lib/content-album-refs` (refProvider · refEmbedUrl: YouTube/TikTok เต็ม/Pinterest เล่นในหน้า · ลิงก์สั้น/IG = เปิดลิงก์) · พรีวิวก่อนบันทึก: TikTok/Pinterest ผ่าน `/api/social-embed` · อื่น ๆ `/api/link-preview`
- หน้าจอ: แท็บ "อัลบั้ม | อยากได้" ที่หน้า Contents (จำแท็บในเครื่อง) · ฟอร์ม = `AlbumFormModal phase="wish"` · `WishDetailModal` · กระดาน `RefBoard` (ใช้ซ้ำในอัลบั้ม ส่วน "Reference ที่ขอไว้") · การ์ดปะ Reference 4 ชิ้น (`RefTile`)

## ข้อจำกัด

- HEIC ไม่มีรูปย่อ (ขึ้นไอคอน) · วิดีโอที่ดึงจาก Drive ไม่มีภาพปก · ช่วยคัดรูป/AI ไม่นับรูปที่ไม่มีรูปย่อ
- รูปที่ดึงจาก Drive / อัปก่อนมีลายนิ้วมือ ไม่มี phash = ไม่ถูกจับกลุ่มรูปคล้าย
- อัปต่อจากที่ค้างได้เฉพาะเครื่อง/เบราว์เซอร์เดิม
- แบรนด์ที่ยังไม่ตั้งโฟลเดอร์ Drive อัปไม่ได้ (ตั้งที่ แอปจัดการงาน › ตั้งค่า › โฟลเดอร์ต่อแบรนด์)
- ลิงก์รูปย่อ/วิดีโอเปิดได้โดยไม่ล็อกอินถ้ารู้รหัสไฟล์ (เหมือน /api/r2-image — ให้ Meta ดึงไปโพสต์ได้)
