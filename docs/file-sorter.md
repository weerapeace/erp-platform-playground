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

## ข้อจำกัดที่รู้
- Drive ดูไฟล์เดิมในโฟลเดอร์ได้ 100 ไฟล์แรก (โฟลเดอร์งานเดียวไม่ควรเกินนี้)
- `/api/drive` POST ไม่ได้มีไว้ให้เบราว์เซอร์ (Google บล็อก CORS) — เว็บใช้ `/api/drive/upload-chunk` แทน
- การ์ดที่สร้างจากเว็บเดิม `master_path` เป็น path G:\Shared drives… · การ์ดจากโปรแกรมเป็น path Z:
