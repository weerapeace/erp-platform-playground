# กฎที่เก็บไฟล์กลาง (Storage Policy)

> ไฟล์แต่ละหมวดเก็บที่ไหน: **R2 / Supabase Storage / Google Drive** — ตั้งที่เดียว ทุกช่องอัปทำตาม
> หน้าตั้งค่า: `/master/storage-rules` (เมนู Master Data → กฎที่เก็บไฟล์) · โค้ดกลาง: `lib/storage-policy.ts`

## ใช้ทำอะไร

เดิมแต่ละฟีเจอร์เลือกที่เก็บเองในโค้ด (คลังไฟล์ → R2, ไฟล์แนบ Parent SKU → Supabase, งานพิมพ์ → Drive …)
ไม่มีที่เดียวให้ดูว่า "ไฟล์แบบนี้ไปไหน" — ตารางกฎนี้รวมไว้ที่เดียว ให้เจ้าของดู/ปรับเองได้

## หลักเลือกที่เก็บ

| ที่เก็บ | เก่งเรื่อง | ไม่เหมาะกับ |
|---|---|---|
| **R2** | เปิดรูปเร็ว ไม่คิดค่าดึงไฟล์ ย่อรูปตอนแสดงได้ (`/api/r2-image?w=`) | ไฟล์ลับ — ลิงก์ `/api/r2-image` เปิดได้โดยไม่ต้อง login |
| **Supabase Storage** | ไฟล์ลับ (bucket private) เปิดผ่านลิงก์ชั่วคราว ผูกสิทธิ์ | รูปที่โชว์บ่อย — คิดค่าดึงไฟล์เมื่อเกินโควตา |
| **Google Drive** | ไฟล์ต้นฉบับที่ทีมเปิดแก้ในโปรแกรม (AI/PSD/PDF) พื้นที่เยอะ | รูปบนเว็บ — ช้า จำกัดจำนวนครั้งที่เรียก ย่อรูป/ค้นในระบบไม่ได้ |

จำง่าย: **โชว์บนจอบ่อย → R2 · ลับ/ผูกสิทธิ์ → Supabase · คนเปิดแก้ในโปรแกรม → Drive**
ไฟล์ที่อยู่ Drive ควรมีรูปตัวอย่างใน R2 คู่กัน (คลังโชว์การ์ดได้เร็ว — หมวด Artwork/งานพิมพ์ทำแบบนี้แล้ว)

## ข้อมูล

- ตาราง `erp_storage_rules` (migration `202611100600_storage_rules.sql`) — 1 แถว = 1 หมวด
  `rule_key, label, label_en, description, file_types[], provider, allowed_providers[], lock_reason, max_bytes, sort_order, updated_by`
- **ล็อก = `allowed_providers` มีตัวเดียว** — ฐานข้อมูลกันเปลี่ยนเองด้วย check `provider = any(allowed_providers)` (API แก้ไม่ได้ แม้ส่งตรง)
- RLS deny-all — อ่าน/เขียนผ่าน API ที่ตรวจสิทธิ์เท่านั้น
- ฟังก์ชัน `erp_storage_bucket_usage()` (security definer · เรียกได้เฉพาะ service_role) = พื้นที่ Supabase Storage แยก bucket

## API

| เส้นทาง | สิทธิ์ | ทำอะไร |
|---|---|---|
| `GET /api/storage-rules` | `assets.view` | ทุกหมวดที่เปิดใช้ |
| `PATCH /api/storage-rules/[id]` `{ provider?, max_bytes? }` | `assets.manage` | แก้ 1 หมวด · ตรวจด้วย `validateRulePatch` · ลง `audit_logs` action `storage_rule.update` (เก็บค่าเก่า→ใหม่) |
| `GET /api/assets/storage` | `assets.view` | เพิ่ม `others` = Supabase (แยก bucket) + จำนวนที่ผูก Drive (นับสด) |

## ของกลางหน้าจอ

- `<StorageRulesManager />` — หน้าเต็ม (ตาราง MiniTable + ป๊อปแก้ ERPModal)
- `<StorageProviderBadge provider href? small? />` — ป้ายบอกที่เก็บ ใช้ที่การ์ดคลังไฟล์ (ต้นฉบับอยู่ Drive) · หน้ารายละเอียดไฟล์ (แถว "ที่เก็บ") · การ์ดพื้นที่

## สถานะ "ตอนนี้ระบบส่งไปที่" (สำคัญ)

ช่องอัปจริงยังตั้งที่เก็บไว้ในโค้ด → `STORAGE_WIRING` ใน `lib/storage-policy.ts` บอกว่าแต่ละหมวด**ตอนนี้ส่งไปไหนจริง**
หน้าตั้งค่าเทียบกับกฎแล้วโชว์ตามจริง:

| สถานะ | ความหมาย |
|---|---|
| ตรงกับกฎ | ช่องอัปตั้งไว้ในโค้ด และตรงกับกฎ |
| ยังส่งไป X | กฎบอกที่หนึ่ง แต่ช่องอัปยังส่งไปอีกที่ (เช่น บิลซัพพลายเออร์: กฎ = Supabase · จริง = R2) |
| ทำตามกฎนี้อัตโนมัติ | ช่องอัปอ่านกฎจากตารางแล้ว (`STORAGE_WIRING[key] = "rule"`) — เปลี่ยนกฎมีผลทันที |
| ยังไม่มีช่องอัปที่ใช้หมวดนี้ | หมวดใหม่ที่ยังไม่มีโค้ดใช้ |

**เมื่อแก้ทางอัปของหมวดไหน → อัปเดต `STORAGE_WIRING` ให้ตรงเสมอ** (มีเทสต์ `lib/storage-policy.test.ts`)

## เฟส 2 — ตัวอัปกลางที่ทำตามกฎ

### ที่อยู่ไฟล์กลาง (file ref) — `lib/file-ref.ts`

ข้อความเดียวบอกที่เก็บ เก็บในคอลัมน์เดิมได้เลย (เช่น `goods_receipts_v2.bill_doc_r2_key`) **ไม่ต้องแก้ตาราง ไม่ต้องแปลงข้อมูลเก่า**

| รูปแบบ | ที่เก็บ |
|---|---|
| `goods-receipts/2026/a.jpg` (ไม่มีคำนำหน้า) | R2 — ค่าเดิมทั้งหมด |
| `sb:erp-files/supplier_bills/2026-11/<เวลา>-<สุ่ม>.jpg` | Supabase bucket ส่วนตัว `erp-files` (migration `202611100700`) |

- `isRefForCategory(ref, หมวด)` — ตอนบันทึกเอกสาร ยอมรับ R2 key หรือไฟล์ Supabase **ของหมวดตัวเองเท่านั้น** (กันยัดไฟล์หมวดอื่นมา)
- ฝั่งเซิร์ฟเวอร์ `lib/file-ref-server.ts`: `readFileRef` / `fileRefToDataUrl` (ให้ AI อ่าน) / `signSupabaseRefs`

### อัปไฟล์ — `uploadFileByRule({ category, file, r2Folder })` (`lib/file-upload.ts`)

1. `POST /api/files/upload-target` — ตรวจสิทธิ์อัปของหมวด + ชนิด/ขนาดตามกฎ (`fileRuleProblem`)
2. กฎ = Supabase → เบราว์เซอร์อัปตรงด้วยลิงก์อัปชั่วคราว (ข้ามลิมิต ~4.5 MB ของ Vercel) → ref `sb:…`
   กฎ = R2 → ทางเดิม `/api/admin/upload` (≤ 4 MB · ลงคลังไฟล์กลางอัตโนมัติ) → R2 key
   กฎ = Drive → ปฏิเสธ (ช่องอัปทั่วไปยังไม่รู้ว่าจะลงโฟลเดอร์ไหน)
- ของกลาง `FileInput` รับ prop `category` → ทำตามกฎ (ไม่ส่ง = ทางเดิม R2)
- ระหว่างอัป: `onProgress(pct)` / `onStart({ abort })` (เฉพาะทาง Supabase) → โชว์ด้วย `UploadProgress` (`docs/upload-progress.md`) · กดยกเลิก = `FileUploadError.aborted`

### เปิดดู — `useFileRefUrls(refs)` (`components/file-ref`)

- ระบบ login เก็บ token ใน localStorage → `<img src>` ส่งสิทธิ์เองไม่ได้ จึงต้องขอลิงก์ก่อน: `POST /api/files/sign { refs }`
- R2 → `/api/r2-image` ทันที · Supabase → ลิงก์ชั่วคราว 10 นาที เฉพาะคนที่มีสิทธิ์ดูของหมวด · ไม่มีสิทธิ์ = null

### สิทธิ์ของหมวด — `STORAGE_CATEGORY_PERMISSIONS` (`lib/storage-policy.ts`)

| หมวด | อัปได้ | ดูได้ |
|---|---|---|
| `supplier_bills` | `products.edit` (เท่ากับสิทธิ์บันทึกรับของ) | `products.view` (เท่ากับสิทธิ์ดูใบรับสินค้า) |

หมวดที่ไม่อยู่ในตารางนี้ = ตัวอัปกลางไม่รับ

### ช่องอัปที่ทำตามกฎแล้ว

| หมวด | ช่องอัป | ที่อ่านไฟล์ |
|---|---|---|
| `supplier_bills` | `FileInput category="supplier_bills"` ใน `receive-line-modal` (2) · `receive-cart` (2) · `gr-detail-modal` (2) · `delivery-bill-panel` (1) | `gr-detail-modal` · `delivery-bill-panel` (`useFileRefUrls`) · AI อ่านใบส่งของ `parseDeliveryBillImage(ref, admin)` · บันทึกตรวจ `isRefForCategory` ที่ `/api/purchasing/receive` · `goods-receipt/[id]` PATCH · `vouchers/[id]/bills` POST |

**เพิ่มหมวดใหม่:** ใส่สิทธิ์ใน `STORAGE_CATEGORY_PERMISSIONS` → ส่ง `category` ที่ช่องอัป → เปลี่ยนจุดแสดงไฟล์เป็น `useFileRefUrls` → ตรวจ `isRefForCategory` ตอนบันทึก → ตั้ง `STORAGE_WIRING[หมวด] = "rule"`

## ห้ามใช้ / ข้อจำกัด

- เปลี่ยนกฎ **ไม่ย้ายไฟล์เดิม** — ย้ายต้องทำเป็นงานแยก (ก๊อป → ตรวจเปิดได้ → ค่อยลบของเดิม) และขออนุญาตเจ้าของก่อน
- `max_bytes` ใช้ตรวจเฉพาะหมวดที่ทำตามกฎแล้ว · กฎ = R2 รับได้ไม่เกิน 4 MB ไม่ว่าตั้งไว้เท่าไร
- ไฟล์ที่อยู่ Supabase **ไม่ลงคลังไฟล์กลาง** (ตั้งใจ — เอกสารส่วนตัวไม่ควรโผล่ในคลัง)
- กฎงานพิมพ์ยังตรวจที่ `lib/print-file-policy.ts` เหมือนเดิม (หมวด `print_files` ในตารางล็อก Drive ไว้ให้ตรงกัน)
- Drive วัดขนาดรวมจาก API ไม่ได้ง่าย → การ์ดโชว์ "จำนวนที่ระบบผูกไว้" แทนขนาด

## ต้นฉบับขึ้น Google Drive แบบทีละชิ้น (2026-11-02) — งานจริงที่ใช้ลงในป๊อปโพสต์

เจ้าของเลือก: อัปครั้งเดียว → **รูปย่อ ≤1600px อยู่ R2** (โชว์เร็ว + ใช้โพสต์) · **ต้นฉบับเต็มไป Drive** · วิดีโอไป Drive ที่เดียว (ไม่จำกัด 25MB)

- **ตัวส่งไฟล์ใหญ่ทีละชิ้น (ของกลาง ใช้กับโมดูลอื่นได้):**
  - ฝั่งจอ `lib/drive-chunk-upload.ts` → `uploadFileToDrive(file, uploadUrl, onProgress)` คืน file_id · ชิ้นละ 3.75MB (`DRIVE_CHUNK_BYTES` ใน `lib/drive-upload-relay.ts` = 15×256KB ตามกติกา Google) · พลาดลองใหม่ 3 ครั้ง ต่อจากที่ Google บอกว่ารับถึง
  - ตัวกลาง `POST /api/drive/upload-chunk` (สิทธิ์ `files.upload`) ส่งต่อเข้า resumable session — รับเฉพาะลิงก์ `www.googleapis.com/upload/drive/v3/files?…upload_id=` (`isDriveUploadUrl`) กันใช้เป็นตัวยิงไปที่อื่น
  - โมดูลสร้าง session เอง (รู้โฟลเดอร์ + ตรวจสิทธิ์ของตัวเอง) ด้วย `driveCreateResumableSession` แล้วส่ง `upload_url` ให้จอ
- **ป๊อปโพสต์:** `GET/POST /api/creative-content/[id]/drive` (ดูโฟลเดอร์ / เริ่มอัป) + `POST …/drive/finish` (รูป: เติม `erp_creative_attachments.drive_file_id` · วิดีโอ: สร้างไฟล์แนบ `url=drive:<id>` + `drive_file_id`) · audit `attachment:drive_original`
  - โฟลเดอร์ (`lib/content-drive.ts`): มีต้นฉบับแล้ว → โฟลเดอร์เดิม · ผูกงานที่มีโฟลเดอร์ Drive → `<โฟลเดอร์งาน>/<CN ชื่อโพสต์>` · ไม่งั้น `<โฟลเดอร์แบรนด์>/Content/<CN ชื่อโพสต์>` (โฟลเดอร์แบรนด์ = ตั้งค่าแอปจัดการงาน ก่อน · ไม่มีใช้ของคลัง Artwork) · หาโฟลเดอร์โพสต์จากเลข CN
  - อัปเป็นงานเบื้องหลัง (`runBackgroundTask` + `unit:"MB"` ของกลางใหม่) ปิดป๊อปได้ · แบรนด์ยังไม่ตั้งโฟลเดอร์ = เก็บแค่รูปย่อ + แถบเตือน
  - ลบไฟล์ในโพสต์ = ถามก่อน ค่าเริ่ม **เก็บต้นฉบับไว้** · ติ๊ก = `DELETE …/attachments?attachment_id=…&drive=1` → ต้นฉบับไปถังขยะ Drive (กู้คืนได้)
  - ดาวน์โหลดต้นฉบับ = `/api/drive-video/<id>?dl=<ชื่อไฟล์>` (เพิ่ม Content-Disposition) · เปิดใน Drive = `drive.google.com/file/d/<id>/view`
- ⚠️ `/api/drive-video/<id>` เปิดได้โดยไม่ล็อกอิน (Meta ต้องดึงไฟล์) — ปลอดภัยเท่าที่ต้องรู้ fileId เหมือน `/api/r2-image`
- ⚠️ รูปที่อัปก่อนวันนี้มีแค่รูปย่อ (ระบบเดิมไม่เก็บต้นฉบับ) · รูป Ref ในบรีฟไม่ส่งต้นฉบับ (เป็นรูปตัวอย่าง)

## แผนต่อ

- **เฟส 2 (ต่อ):** ย้ายช่องอัปหมวดอื่นมาใช้ตัวกลางทีละหมวด · ตัวอัปกลางส่ง Drive ได้แล้ว (ทีละชิ้น — ดูหัวข้อด้านบน) เหลือต่อเข้ากับ `uploadFileByRule`
- **เฟส 3:** ย้ายไฟล์เก่าที่อยู่ผิดที่ (บิลซัพพลายเออร์/ใบรับของใน R2 → Supabase) แบบกู้คืนได้
