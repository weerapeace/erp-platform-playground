# ตัวแยกไฟล์ ERP (File Sorter)

โยนโฟลเดอร์งาน 1 โฟลเดอร์ แล้วระบบแยกไฟล์ไปเก็บให้เองตาม "สูตรแยกไฟล์":

| ที่เก็บ | เก็บอะไร | ทำโดย |
|---|---|---|
| คลังไฟล์กลาง (`/master/assets` หมวด Artwork) | การ์ดงาน + รูปตัวอย่าง 1 รูป (ย่อแล้ว) + ลิงก์ Drive + path Z: | API `/api/assets` (มีอยู่แล้ว) |
| Google Drive | ไฟล์ต้นฉบับ (PNG/PSD/AI/PDF …) โครง แบรนด์ › ซับตามชนิด › ชื่องาน | โปรแกรมส่งตรงเข้า Google ด้วยลิงก์จาก `POST /api/drive` |
| Synology Z: | ไฟล์ทั้งชุด โครงเดียวกับ Drive ใต้ "ที่เก็บบน Z:" (ค่าเริ่ม `Z:\Assets`) | โปรแกรมก๊อปผ่านวงแลน |

เบราว์เซอร์เขียนลงไดรฟ์ Z: ไม่ได้ จึงต้องมี **โปรแกรมบนเครื่อง** (ขั้น 2) · ฝั่งเว็บ (ขั้น 1 = ไฟล์นี้) เป็นที่เก็บสูตรและเป็น "ประตู" ให้โปรแกรมคุยกับระบบ

## ใช้เมื่อไหร่ / ห้ามใช้เมื่อไหร่
- ใช้: ลงงานออกแบบ (โลโก้, ลายพิมพ์, แพทเทิร์น, Packaging, ม็อกอัป) ที่มีไฟล์หลายนามสกุลในโฟลเดอร์เดียว
- ห้าม: รูปสินค้าลงช่องรูป SKU → ใช้ "จัดรูปสินค้าหลายโฟลเดอร์" (`components/product-image-router`) · ไฟล์งานพิมพ์ → Drive อย่างเดียว ([print-files-drive-only](print-files-drive-only.md))

## สูตรแยกไฟล์ (ตั้งที่เว็บ ที่เดียว ทุกเครื่องใช้สูตรเดียวกัน)
- หน้าตั้ง: คลังไฟล์ › หมวด Artwork › ปุ่ม **ตัวแยกไฟล์** (สิทธิ์ `assets.manage`) → `components/asset-library/file-sort-settings.tsx`
- เก็บใน `ui_config` key `admin_file_sort_config` (ไม่มีตารางใหม่ · ขึ้นต้น `admin_` = API กลาง `/api/ui-config` แก้ได้เฉพาะแอดมิน)
- โครง (lib/file-sort `FileSortConfig`): `profiles[]` ละ `{ key, label, nasRoot, rules:[{ext, library, drive, nas}], other:{drive, nas} }`
  - `library` = ใช้เป็นรูปตัวอย่างได้ (เฉพาะ jpg/jpeg/png/webp) · เลือกแค่ 1 รูป: แถวบนในสูตรก่อน → ไฟล์ชั้นบนก่อน → ชื่อเรียงตามตัวอักษร
  - `other` = นามสกุลที่ไม่อยู่ในตาราง (ค่าเริ่ม: ลง Z: อย่างเดียว)
  - ไฟล์ระบบ (Thumbs.db, desktop.ini, .DS_Store, `~$…`, `._…`) ข้ามเสมอ
- ค่าเริ่ม (สูตร `artwork`): JPG/JPEG/WEBP = รูปตัวอย่าง + Z: · PNG = รูปตัวอย่างสำรอง + Drive + Z: · PSD/AI/PDF/EPS/SVG/TIF = Drive + Z:
- ชื่อโฟลเดอร์แบรนด์/ซับชนิด **ใช้ชุดเดียวกับ Drive** (ตั้งที่ ⚙️ โฟลเดอร์มาตรฐาน: `erp_brand_drive_folders.folder_label` · `erp_artwork_drive_folders.subfolder_name`) → path Z: = `nasRoot\[โฟลเดอร์แบรนด์]\[ซับชนิด]\[ชื่องาน]` · แบรนด์ที่ยังไม่ตั้งโฟลเดอร์ = ส่งลง Z: ไม่ได้ (มีคำเตือน)

## API (สำหรับโปรแกรม · ต้องล็อกอิน Bearer token เดียวกับเว็บ)
| เรียก | สิทธิ์ | ทำอะไร |
|---|---|---|
| `GET /api/file-sort/config` | assets.view | สูตร + รายชื่อแบรนด์ (พร้อมชื่อโฟลเดอร์) + ชนิด artwork + ต่อ Drive แล้วไหม — ครบในคำขอเดียว |
| `PUT /api/file-sort/config` | assets.manage | บันทึกสูตร + ประวัติ `file_sort_config.update` (บอกว่านามสกุลไหนเปลี่ยนจากอะไรเป็นอะไร) |
| `POST /api/file-sort/plan` | assets.upload | ส่งรายชื่อไฟล์ → ได้ไฟล์ละปลายทาง, รูปตัวอย่าง, โฟลเดอร์ Z:, path Drive, คำเตือน, **การ์ดเดิมของงานนี้** (กันสร้างซ้ำ) · ไม่สร้างอะไร |
| `POST /api/drive` | assets.upload | สร้าง/ใช้โฟลเดอร์ Drive ตามโครงกลาง + ลิงก์อัปต่อไฟล์ (ไม่เกิน 100 ไฟล์/ครั้ง) · ไฟล์เดิมเนื้อเดียวกัน = `exists` ไม่ต้องอัปซ้ำ · ชื่อซ้ำเนื้อต่าง = ต่อท้าย `_2` |
| `POST /api/assets` / `PATCH /api/assets/[id]` | assets.upload / edit | สร้าง/แก้การ์ด Artwork (`source=artwork`, `master_path` = โฟลเดอร์ Z:, `master_url` = ลิงก์โฟลเดอร์ Drive) — รูปตัวอย่างต้องย่อให้ ≤ 4MB ก่อนส่ง |
| `POST /api/file-sort/log` | assets.upload | จดประวัติ `file_sort.upload` หลังจบงาน (ใคร · งานไหน · ก๊อป/ย้าย · ไปที่ไหนกี่ไฟล์ · พลาดอะไร) |

## ตัวโปรแกรม (ขั้น 2)
- ซอร์ส + ทดสอบ: `tools/file-sorter/` ในโฟลเดอร์โปรเจกต์บน Google Drive (ไม่อยู่ใน git เหมือนเครื่องมืออื่นใน tools/) · ไฟล์ใช้งาน `dist/ERP File Sorter.bat`
- ล็อกอิน: Supabase password grant ด้วยคีย์สาธารณะ (อีเมล+รหัสผ่าน หรือ ชื่อผู้ใช้→`@pin.local`+PIN) · เก็บแค่ refresh token เข้ารหัส DPAPI ใน `%APPDATA%ERP File Sorter`
- ปุ่ม "เปิดการ์ดในคลัง" = `/master/assets?source=artwork&asset=<id>` (หน้าคลังเปิดการ์ดให้เอง)

## ลำดับที่โปรแกรมทำ
1. `GET config` → ให้เลือกแบรนด์/ชนิด/กรอกชื่องาน
2. `POST plan` → โชว์ว่าไฟล์ไหนไปไหน + คำเตือน
3. ก๊อปลง Z: แล้วตรวจขนาดไฟล์ → `POST /api/drive` แล้ว PUT ไฟล์เข้า Google → ย่อรูปตัวอย่างแล้วสร้าง/แก้การ์ด
4. ถ้าเลือก "ย้าย" และทุกที่สำเร็จ → ส่งต้นฉบับลงถังขยะ (กู้ได้) · พลาดที่ไหน = ไม่แตะต้นฉบับ
5. `POST log`

กดซ้ำได้เสมอ: Z: ไฟล์ที่มีแล้ว (ขนาดเท่ากัน) ข้าม · Drive ไฟล์เนื้อเดียวกันข้าม · การ์ดเดิมถูกแก้แทนการสร้างใหม่

## สูตร "งานสินค้า" (ขั้น 3A เว็บ · 2026-11-08)
โยนโฟลเดอร์รุ่น 1 โฟลเดอร์ (เช่น `Z:\Work In Process\[01] New Product\BSD15`) → รูปลงช่องรูปของสินค้าใน ERP · ที่เหลืออยู่บน Z:
- ตัวคิด: `lib/file-sort-product` `planProductSort` — ใช้ตัวจับคู่/ตรวจกลางของปุ่ม 📂 จัดรูปหลายโฟลเดอร์ (`lib/product-image-routing` groupRouteFiles + applyRowMode + planRoute) และตัวโหลดสินค้ากลาง `lib/product-image-catalog-server` (ย้ายมาจาก /api/product-images/catalog)
- กติกา: โฟลเดอร์รหัสรุ่น → แกลเลอรี Parent · รหัสสี → แกลเลอรี SKU (รูป 1 = ปก) · `[01] Description` → รูป Description (Ver.N ล่าสุด) · ไฟล์ชื่อ = รหัส SKU → ปก · `.png` ชื่อรหัส → รูปตัด PNG · Images/Rawfiles/PSD/RAW/จับคู่ไม่ได้/เกินเพดาน → ไม่ลงระบบ
- ขนาดย่อตามช่อง `RESIZE_AUTO` (Description 1200 · รูปสินค้า 1500 · PNG 2000) เหมือนปุ่มในเว็บ
- ทุกไฟล์ (ยกเว้นไฟล์ระบบ) `nas: true` = ต้องอยู่บน Z: · โฟลเดอร์อยู่บน Z: แล้ว = โปรแกรมไม่ทำอะไร · ไม่อยู่ = ก๊อปไป `nas_folder` (= `product.nasRoot\<รุ่น>`) · **สูตรนี้ไม่ลบ/ไม่ย้ายต้นฉบับ**
- `POST /api/file-sort/plan` `{ profile:"product", job_folder, mode?, files }` (assets.upload + products.view) → `files[]` (rel · erp · dest · slotKey · width · nas · why · note) + `slots[]` (kind · parentId · skuId · rels ปกหน้าสุด · coverRel · replaces · remove{attachments,desc} · entity) + groups + warnings
- โหมดแทนที่: `slots[].remove` = รูปเดิมที่ต้องเอาออกก่อน (แกลเลอรี: DELETE /api/attachments/[id] · Description: DELETE /api/assets/description) แล้วจดใน undo_info (`replaced` / `descReplaced`) ของชุดอัป → ย้อนทั้งชุดได้จากปุ่ม 📂 ในเว็บ
- ค่าตั้ง `FileSortConfig.product` = { nasRoot, roleFolders{desc,archive}, mode } · หน้าตั้ง: แท็บ "งานสินค้า"
- ขั้น 3B (โปรแกรม): ลงรูปตาม slots ผ่าน API กลางชุดเดียวกับปุ่มในเว็บ + บันทึกชุดอัป (/api/product-images/batches)

## ที่เก็บบน Z: แบบแม่แบบ + เพิ่มสี / แก้สี (ขั้น 4 · 2026-11-08)
- **แม่แบบที่เก็บบน Z:** ตั้งในหน้าตั้งค่า — ช่องเติมคำ `{แบรนด์}` `{ชนิด}` `{ชื่องาน}` `{รุ่น}` `{ปี}` `{เดือน}` `{โฟลเดอร์}` (`lib/file-sort` `fillNasPattern` · ช่องที่ว่างตัดชั้นนั้นทิ้ง · ต้องขึ้นต้นด้วยไดรฟ์/UNC · ปี/เดือนเวลาไทย)
  - Artwork: `nasPattern` (ค่าตั้งต้น `Z:\Assets\{แบรนด์}\{ชนิด}\{ชื่องาน}`) + `nasByType` แยกตามชนิด artwork (ชื่อชนิด → แม่แบบ) · `{แบรนด์}` บังคับ (แบรนด์ยังไม่ตั้งโฟลเดอร์ = ส่งลง Z: ไม่ได้ ยกเว้นเลือกที่เก็บเองในโปรแกรม)
  - สินค้า: `product.nasPatterns` = { new, color, edit } (ค่าตั้งต้น `Z:\Work In Process\[01] New Product\{รุ่น}`) — ใช้เฉพาะโฟลเดอร์ที่ยังไม่อยู่บน Z:
  - ค่าเดิม `nasRoot` แปลงเป็นแม่แบบอัตโนมัติ (ผลเหมือนเดิม) · `nasRoot` ยังคำนวณให้ (ส่วนต้นก่อนช่องเติมคำ) เพื่อโปรแกรมรุ่นเก่า
- **โปรแกรมเลือกที่เก็บเองรายงานได้** (ปุ่ม "เลือกที่เก็บเอง…") — ทับค่าจากแม่แบบเฉพาะงานนั้น
- **ชนิดงานย่อยของสูตรสินค้า** (`variant` ตรงกับแท็บ Create Folder Tool):
  - `new` สินค้าใหม่ = ทุกช่อง
  - `color` เพิ่มสี = เฉพาะแกลเลอรีของสีที่ **ยังไม่มีรูปในระบบ** · Parent / Description / สีเดิม / PNG = `why: "scope"` ไม่แตะ · สีใหม่ที่ยังไม่มี SKU ในระบบ → เตือน "สร้าง SKU ก่อน"
  - `edit` แก้สี = เฉพาะแกลเลอรีของสีที่อยู่ในโฟลเดอร์ (แทนที่/ต่อท้ายตามโหมด) · Parent / Description / PNG ไม่แตะ
  - `POST /api/file-sort/plan` `{ profile:"product", variant, … }` → `nas_folder` ตามแม่แบบของ variant
- โปรแกรมกันเลือกโฟลเดอร์งานเอง (หรือข้างใน) เป็นที่เก็บ · โหมดย้าย + ที่เก็บ = โฟลเดอร์ต้นฉบับ → ไม่ลบต้นฉบับ · ประวัติจด `nas_custom` / `variant`

## สูตร Content → อัลบั้มในหน้า Contents (ขั้น 5 · 2026-11-08)
- ค่าตั้ง `content` = `{ nasPattern, rawFolders, albumExts }` (แท็บ Content ในหน้าตั้งค่า · ค่าตั้งต้น `Z:\Work In Process\[01] New Product\[02] Contents\{โฟลเดอร์}` = ที่เดียวกับ Create Folder Tool แท็บ Contents)
- ตัวคิด `lib/file-sort-content` `planContentSort`:
  - รูป/วิดีโอ (`albumExts`) → ลงอัลบั้ม · ในโฟลเดอร์ไฟล์ดิบ (`rawFolders` เช่น `00_rawfiles`, `00_rawfiles_1`) → `why:"raw"` · นามสกุลอื่น (PSD …) → `why:"not_media"` · ทั้งหมดอยู่บน Z:
  - โฟลเดอร์ชั้นบนชื่อแพลตฟอร์ม (`01_Instagram` `02_Facebook` `03_X` …) → `platforms` (รหัสชุดเดียวกับ `lib/creative-tasks` PLATFORMS) → `planned_platforms` ของอัลบั้มใหม่ · `04_Shop Decoration` ไม่ผูกแพลตฟอร์ม
  - ชื่อไฟล์ชนกันคนละโฟลเดอร์ย่อย → `albumName` นำหน้าด้วยโฟลเดอร์ (`01_Images_2_1.jpg`)
  - อัลบั้มชื่อเดียวกัน + แบรนด์เดียวกัน (ไม่อยู่ถังขยะ) มีแล้ว → `album` = เติมไฟล์ใส่ · ไฟล์ที่ชื่อ + ขนาดตรงกับในอัลบั้ม → `why:"already"` (กดซ้ำได้)
- `POST /api/file-sort/plan` `{ profile:"content", brand_id, name, job_folder, files }` → `{ album, album_name, drive_ok, nas_folder, files, platforms, counts, warnings }` · `drive_ok:false` = แบรนด์ยังไม่ตั้งโฟลเดอร์ Drive / ระบบยังไม่ต่อ Drive (ลงอัลบั้มไม่ได้ ก๊อป Z: ได้)
- โปรแกรมลงอัลบั้มผ่าน API อัลบั้มตัวจริงชุดเดียวกับหน้า Contents: `POST /api/content-albums` (ไม่มีอัลบั้ม) → รูปย่อ `/api/admin/upload` (folder `content-albums`, `no_library=1`) → `POST /api/content-albums/[id]/drive` (ลิงก์อัป) → ส่งตรงขึ้น Google Drive ทีละชิ้น → `POST /api/content-albums/[id]/files` → `POST …/upload-done` (กระดิ่งแจ้งเตือน)
  - วิดีโอจากโปรแกรมยังไม่มีภาพปก (r2_key = `drive:<id>`) — ตั้งปกคลิปได้ที่หน้าอัลบั้มในเว็บ · รูปไม่มี phash (ตัวช่วยหารูปหน้าตาเหมือนไม่เห็นรูปชุดนี้)
  - ไม่ลบ/ไม่ย้ายต้นฉบับ · โฟลเดอร์อยู่บน Z: แล้ว = อยู่ที่เดิม (เลือกที่เก็บเอง = ก๊อปไปที่เลือก)
- ประวัติ `file_sort.upload` profile `content` entity `content_album`

## ย้ายโฟลเดอร์ Rawfiles / Images หลังลงรูปเสร็จ (ขั้น 6 · 2026-11-08)
- ค่าตั้ง `product.moves` = { raw, images } แต่ละตัว `{ mode: "stay" | "move", pattern }` + `product.moveFolders` (ชื่อโฟลเดอร์ชั้นบน ไม่สนเลขนำหน้า · มีเลขต่อท้ายก็นับ)
  - ค่าตั้งต้น = ที่เดียวกับปุ่ม Arrange ของ Create Folder Tool: Rawfiles ย้ายไป `Z:\Raw Files\{แบรนด์}\{รุ่น}_rawfiles` · Images อยู่ที่เดิม
- `lib/file-sort-product` `planProductMoves` → plan `moves[]` `{ role, folder, files, bytes, mode, target, reason }` · `{แบรนด์}` = `erp_brand_drive_folders.folder_label` ของแบรนด์รุ่น (รุ่นที่ชื่อตรงโฟลเดอร์ก่อน) · รุ่นไม่มีแบรนด์ = target null + เตือน (ไม่เดา — ณ 2026-11-08 มี 31/1,515 รุ่นไม่มีแบรนด์ เช่น JEAN10)
- โปรแกรม (v1.4.0): ย้ายหลังลงรูปเข้า ERP ไม่มีพลาดเท่านั้น · ติ๊กปิด/เปลี่ยนที่ได้ทีละงาน
  - ชื่อโฟลเดอร์แบรนด์บน Z:\Raw Files ไม่ตรงกับระบบทุกตัว (`[04] RisaraJaKissa` vs `[05] Risara Ja Kissa`, `[10] Goodgoods` vs `[06] Goodgoods`) → โปรแกรมหาโฟลเดอร์ที่ชื่อเหมือนกันเมื่อตัดเลข/เว้นวรรค (ไม่สร้างโฟลเดอร์แบรนด์ซ้ำ) · ไม่เจอ = สร้างใหม่
  - ต้นทางและปลายทางอยู่บน Z: ทั้งคู่ = ย้ายแบบเปลี่ยนที่อยู่ (ทันที) · ต้นทางอยู่ในเครื่อง = ก๊อป + ตรวจขนาด แล้วต้นฉบับในเครื่องลงถังขยะ · ปลายทางมีแล้ว = `_v.2` · มีปุ่ม "ย้ายกลับ" (เฉพาะที่ย้ายบน Z:)
  - โฟลเดอร์ที่ย้ายไม่ถูกก๊อปลงที่เก็บงานบน Z: ซ้ำ · ประวัติ `file_sort.upload` จด `moves` (from/to/how)

## เก็บทั้งโฟลเดอร์เข้า Collection (ขั้น 7 · 2026-11-09 · แบบปุ่ม Arrange ของ Create Folder Tool)
- ค่าตั้ง `product.collection` = `{ mode: "stay" | "move", pattern, byBrand: { <id แบรนด์>: แม่แบบ }, tidy }` (ค่าตั้งต้น mode = move · tidy = true)
  - ที่เก็บต่อแบรนด์: `byBrand[id]` → ค่าตั้งต้นตามชื่อแบรนด์ `COLLECTION_BRAND_DEFAULTS` → `pattern` (ว่าง = ไม่เก็บ) · สินค้าไม่มีแบรนด์ = ไม่เก็บ + เตือน (ไม่เดา)
  - ค่าตั้งต้นตามชื่อ (โครงจริงใน Z:\Collection): Louis Montini / Pixie Dustie = `Z:\Collection\{กลุ่ม}\{รุ่น}` · IG International = `…\[01] สินค้าร้าน IG (IG Products)\{กลุ่ม}\{รุ่น}` · Nekomeow = `…\[05] Nekomeow\{รุ่น}` · Risara Ja Kissa = `…\[06] Risara Ja Kissa\[01] Risara Ja Kissa Products\{กลุ่ม}\{รุ่น}`
  - Good Goods / Cansooba / Findig / อื่นๆ ยังไม่มีที่ใน Z:\Collection (เช็ก 2026-11-09) → ไม่มีค่าตั้งต้น ต้องตั้งในหน้าตั้งค่าก่อน
- `{กลุ่ม}` = โฟลเดอร์กลุ่ม — เว็บคงไว้ในแผน โปรแกรมหาจากโฟลเดอร์จริงบน Z: (`Find-CollectionGroup`): ชื่อตรงตัวอักษรหน้ารหัส (BSD) → ขึ้นต้นด้วยตัวนั้น + วรรค/วงเล็บ (`BD (สร้อยข้อมือ)` · `[01] TTN (สีทาขอบ)`) → กลุ่มที่มีรุ่นนี้/รุ่นพี่น้อง (JEAN10 → JEANS · กลุ่มไม่เกิน 30 ตัวดูลึก 2 ชั้น เช่น IG `[06] อะไหล่\คอสุนัข1`) → ไม่เจอ = สร้างชื่อตัวอักษรหน้ารหัส
  - เช็กกับรหัสจริง 2026-11-09: Louis 98% · Pixie 37/38 · Risara 11/12 · IG 65% เจอกลุ่มเดิม (ที่เหลือสร้างกลุ่มใหม่ใต้ IG Products) · จำรายชื่อโฟลเดอร์ 5 นาที (ครั้งแรกของ IG ~1 วิ)
- `lib/file-sort-product` `planProductCollection` → plan `collection { mode, target, reason, tidy, renames[{from,to}] }` · `planTidyRenames` = ชื่อมีคำว่า description → `[01] Description` (มีอยู่แล้ว = ไม่แตะ) · lifestyle/model → `[02] Images/<ชื่อเดิม>` · ข้าม Rawfiles/Images
- โปรแกรม (v1.5.0): ทำหลังลงรูปเข้า ERP ไม่มีพลาด + หลังย้าย Rawfiles · ติ๊กปิด/เปลี่ยนที่/ปิดจัดชื่อได้ทีละงาน · เลือกที่เก็บ Z: เอง = ไม่เก็บเข้า Collection
  - โฟลเดอร์งานอยู่บน Z: = จัดชื่อแล้วย้ายทั้งโฟลเดอร์ (ทันที) · มีรุ่นนี้ใน Collection แล้ว = รวมเข้าไป (`Merge-IntoFolder` แบบ Merge-Folder ของ Arrange: ชื่อชน `_v.2` · Description ` v.2` · `[02] Images` ชน → ซ้อน `Images v.2` · Thumbs.db ชน = ทิ้ง) แล้วลบโฟลเดอร์งานที่ว่าง
  - โฟลเดอร์งานอยู่ในเครื่อง = ก๊อปเข้า Collection แทน Work In Process (จัดชื่อตอนก๊อป · ต้นฉบับในเครื่องอยู่ที่เดิม)
  - ปุ่ม "ย้ายกลับที่เดิม" ทำย้อนทุกขั้นจากท้ายสุด (`res.ops`: Rawfiles → จัดชื่อ → Collection) · ประวัติ `moves[].what = collection`, `how = rename | merge | copy`

## ประวัติไฟล์ใน Task Manager (ขั้น 8 · 2026-11-09 · เจ้าของขอ "อยากรู้ว่าย้ายอะไรไปแล้วบ้าง")
- ข้อมูลอยู่ที่ประวัติกลาง `audit_logs` ที่เดียว (ไม่มีตารางใหม่): `file_sort.upload` (1 ครั้งที่ใช้) + `file_sort.undo` (กด "ย้ายกลับที่เดิม" ในโปรแกรม)
  - `/api/file-sort/log` รับ `run_id` (ผูกครั้งที่ลงไฟล์ ↔ ย้ายกลับ) · `model` (รหัสรุ่น/ชื่องาน) · `parent_ids` (สินค้าที่ลงรูป) · `status` · `event:"undo"` + `undone[]`
  - โปรแกรม v1.5.2 ขึ้นไปส่งครบ (รุ่นก่อนหน้าไม่มี run_id/parent_ids — ตอนเปิดใช้ยังไม่มีประวัติจริงเลย 0 ครั้ง)
- `GET /api/file-sort/history` (สิทธิ์ `tasks.view` หรือ `assets.view`) · ตัวกรอง q / profile / actor / days / before (หน้าถัดไป) · โหมดกล่องในหน้างาน `parent_ids` + `codes` · `include=actors`
  - `lib/file-sort-history` `mergeFileSortUndo` = ย้ายกลับที่เจอครั้งที่ลงไฟล์ของมัน → แนบ `undone_at/undone_by` เข้าแถวนั้น · `cleanHistoryTerm` (เก็บวรรณยุกต์ไทย `\p{M}`)
  - คำแปลภาษาคน: `lib/audit-format` `describeFileSort` (ลงไฟล์ / ย้ายกลับ · รหัสรุ่น · ชนิดงาน · ย้ายอะไรจากไหนไปไหน · ลงกี่รูป · ผล · ย้ายกลับแล้ว) — หน้าประวัติการใช้งานรวมก็อ่านได้ด้วย
- หน้าจอ: Task Manager › เมนูมุมมอง › **ประวัติไฟล์** (`app/tasks/file-history-view.tsx` `FileHistoryView` · `/tasks?view=files&q=PIX39`) + กล่อง "ประวัติไฟล์ของรุ่นนี้" ในหน้างานที่ผูก Parent SKU (`FileHistoryBox`) — แสดงด้วยไทม์ไลน์กลาง `ActivityFeed`

## ข้อจำกัดที่รู้
- Drive ดูไฟล์เดิมในโฟลเดอร์ได้ 100 ไฟล์แรก (โฟลเดอร์งานเดียวไม่ควรเกินนี้)
- `/api/drive` POST ไม่ได้มีไว้ให้เบราว์เซอร์ (Google บล็อก CORS) — เว็บใช้ `/api/drive/upload-chunk` แทน
- การ์ดที่สร้างจากเว็บเดิม `master_path` เป็น path G:\Shared drives… · การ์ดจากโปรแกรมเป็น path Z:
