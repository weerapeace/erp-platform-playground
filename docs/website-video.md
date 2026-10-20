# 🎬 Section วิดีโอ (เว็บร้าน)

## ใช้ทำอะไร
ใส่คลิปในหน้าเว็บร้าน — ลิงก์ YouTube / Vimeo หรือ **อัปโหลดไฟล์เอง** (MP4 / WebM / MOV) · 4 แบบแสดง

| แบบ (`layout`) | หน้าตา |
|---|---|
| `standard` | หัวข้อ + คลิป + คำอธิบาย/ปุ่ม (บล็อกเก่าทุกตัว = แบบนี้ หน้าตาเดิม) |
| `background` | คลิปเล่นเอง เงียบ วนซ้ำ เต็มกรอบ + ข้อความ/ปุ่มทับ (ตำแหน่ง 6 จุด · สีขาว/เข้ม · ความมืดทับ · สูงตามสัดส่วน/60/80/100% จอ) |
| `split` | คลิปคู่ข้อความ ซ้าย/ขวา (มือถือเรียงบน-ล่าง) |
| `popup` | รูปปก + ▶ กดแล้วเล่นในป๊อปกลาง (Overlay ของเว็บร้าน) พร้อมเสียง |

ตั้งได้อีก: เล่นเองเมื่อเลื่อนมาถึง (เงียบเสมอ) · ปิดเสียง · วนซ้ำ · ปุ่มควบคุม · เริ่ม/จบที่วินาที (Vimeo = แค่จุดเริ่ม) · รูปปก (ไม่ใส่: YouTube ใช้รูปปกคลิป) · สัดส่วน 16:9/21:9/4:3/1:1/4:5/9:16 + มือถือแยก · คลิปมือถือแยก (อัปโหลด) · ความกว้าง พอดีอ่าน/กว้างเท่าเนื้อหา/เต็มจอ (เต็มจอ = ขอบตรงเสมอ) · ทรงกรอบ/เส้นกรอบ (ของกลาง imageLookFields → เว็บร้าน `frameBox`)

## ไฟล์
- ERP schema: `SECTION_SCHEMAS.video` (`lib/website-schema.ts`) · ช่องชนิดใหม่ `videoFile` (r2 key — ทำความสะอาดเหมือนรูปใน `normalizeBlocks`)
- ERP ช่องอัปโหลด: `components/website-video-field.tsx` (ลากวางได้ — ของกลาง useFileDrop · ดูคลิปในช่อง · แถบ %)
- ERP API: `POST /api/website/video-upload` (files.upload + audit) — ขอลิงก์อัปโหลดตรงเข้า R2 (`r2PresignPut`)
- ERP เสิร์ฟไฟล์: `/api/r2-image?key=…mp4` อ่าน **ทีละช่วง** ตรงจาก R2 (`r2GetRange` · ก้อนละ ≤ 4 MB) — iPhone เล่นได้ · ไฟล์ใหญ่กรอได้ · ไม่ชนเพดานขนาดตอบกลับของ Vercel
- เว็บร้าน: `src/components/home/VideoSection.tsx` (client) · `BasicBlocks.VideoBlockView` เรียกตัวนี้ · CSS `.vid-box` (สัดส่วนคอม/มือถือ)

## อัปโหลดไฟล์: เล็ก vs ใหญ่
- **≤ 4 MB** → ส่งผ่าน ERP (`/api/admin/upload` โฟลเดอร์ `storefront-videos`) — ใช้ได้ทันที
- **> 4 MB ถึง 200 MB** → เบราว์เซอร์ส่งตรงเข้า R2 ด้วยลิงก์ที่ ERP เซ็นให้ (Vercel รับ request ได้แค่ ~4.5 MB)
  - ⚠️ ต้องเปิด CORS ของ bucket ก่อน 1 ครั้ง — ยังไม่เปิด = ช่องอัปโหลดขึ้นข้อความบอกวิธี (คลิปเดิมไม่หาย)
- **ของกลาง** `lib/media-upload.ts` (`uploadMediaFile` — เลือกทางเล็ก/ใหญ่ · แถบ % · ยกเลิก · error `blocked` = ยังไม่เปิด CORS) + เพดาน `lib/media-upload-limits.ts` (pure · ใช้ทั้งหน้าจอและ API)
  - ใช้โดย `WebsiteVideoField` (Section วิดีโอ) และ `MediaUploadField` (รูปเปิดหน้าสินค้า Hero · รูปปกชุดมาใหม่ · ช่องรูป/วิดีโอทั่วไป)
  - เพดาน: วิดีโอ MP4/WebM/MOV ≤ 200 MB · รูป JPG/PNG/WebP ≤ 20 MB · GIF/PDF ยังเป็น ≤ 4 MB (ทางเดิม)
  - ไฟล์ที่มาทางใหญ่ **ไม่ลงคลังกลาง (assets) อัตโนมัติ** (ERP ไม่เห็นเนื้อไฟล์) — ไฟล์ ≤ 4 MB ลงเหมือนเดิม

### ⚙️ เปิดอัปโหลดไฟล์ใหญ่ (เจ้าของ/แอดมินทำใน Cloudflare · ~5 นาที · ทำครั้งเดียว)
1. เข้า Cloudflare dashboard → **R2 Object Storage** → bucket **odoo-product-images**
2. แท็บ **Settings** → หัวข้อ **CORS Policy** → **Add CORS policy** (หรือ Edit)
3. วางข้อความนี้ทั้งก้อน แล้วกด Save:
```json
[
  {
    "AllowedOrigins": ["https://erp-platform-playground.vercel.app"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```
4. ลองอัปคลิปที่ใหญ่กว่า 4 MB ในช่อง "ไฟล์คลิป" — เห็นแถบ % วิ่งจนจบ = ใช้ได้แล้ว
- ความหมาย: อนุญาตเฉพาะหน้า ERP ตัวจริงให้ "ส่งไฟล์เข้า" (PUT) เท่านั้น — ไม่ได้เปิดให้ใครอ่าน/ลบไฟล์ · ลิงก์อัปโหลดแต่ละครั้งหมดอายุใน 15 นาที และได้เฉพาะคนที่มีสิทธิ์ files.upload

## 📚 คลังวิดีโอ (2026-10-20)
- อัปวิดีโอ/รูปที่ไหนก็ **ลงคลังกลาง (/master/assets) เอง**: ทางเล็ก = /api/admin/upload (กันซ้ำด้วย checksum · คืน asset_id) · ทางใหญ่ = เบราว์เซอร์ส่งตรงเข้า R2 แล้ว lib/media-upload เรียก **POST /api/assets/register** (ตรวจไฟล์มีจริง + ขนาดจาก R2 · key ต้องอยู่ใน BIG_UPLOAD_FOLDERS · แท็กตามที่มา LIBRARY_FOLDER_LABEL)
- กันอัปซ้ำทางใหญ่: /api/website/video-upload เจอไฟล์ชื่อ+ขนาดเท่ากันในคลัง → คืน { key เดิม, existing } ไม่ส่งซ้ำ (onNotice บอกผู้ใช้)
- uploadMediaAsset(file, { folder, library: { tags, collectionId } }) → { key, asset, duplicate } ใช้ในป๊อปเลือกจากคลัง + หน้าคลัง
- ป๊อป AssetPicker: kinds={["image","video"]} = ปุ่มสลับ 🖼 รูป | 🎬 วิดีโอ · typeFilter="video" = คลังวิดีโออย่างเดียว · ภาพย่อวิดีโอของกลาง components/video-thumb (เฟรมแรก · ชี้แล้วเล่น · ความยาว)
- ช่องที่มีปุ่ม 📁 เลือกจากคลัง: WebsiteVideoField (Section วิดีโอ · คลิปอย่างเดียว) · MediaUploadField allowVideo (รูปเปิดหน้าสินค้า Hero · ปกชุดมาใหม่ · รูป/วิดีโอ)
- หน้าคลัง: กริดเห็นภาพย่อวิดีโอ · รายละเอียดเล่นได้ · อัปวิดีโอถึง 200 MB (ตัวอัปโหลดกลาง)
- audit ทางใหญ่: entity_id เป็น uuid → key อยู่ใน metadata.r2_key (เดิมหาย)

## ข้อจำกัด
- .MOV บางไฟล์ (HEVC) เล่นบน Chrome/Android ไม่ได้ — แนะนำ MP4 (H.264)
- ไฟล์ใหญ่กว่า 200 MB / คลิปยาว → ใช้ลิงก์ YouTube หรือ Vimeo
- แบบพื้นหลังด้วยลิงก์ YouTube: YouTube อาจโชว์โลโก้/ปุ่มเล็ก ๆ ช่วงแรก — อยากเนียนสุดให้อัปโหลดไฟล์เอง
