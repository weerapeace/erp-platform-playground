# ไอคอนประเภทไฟล์ (FileTypeIcon)

> ไอคอนกลางที่บอกว่า "ไฟล์ชนิดไหน" ด้วยภาพ: รูปกระดาษพับมุม + แถบสีที่มีนามสกุล (JPG · CR2 · PSD · AI · PDF ...) + รูปเล็กตามกลุ่ม
> โค้ด: `components/file-type-icon` · ทะเบียนนามสกุล/สี/ตัววาด: `lib/file-types.ts` · เทสต์: `lib/__tests__/file-types.test.ts`

## ใช้ทำอะไร

- แสดงชนิดไฟล์ให้คนไม่ใช่สายเทคนิคเห็นแล้วรู้ทันที (สีกลุ่มเดียวกัน = ไฟล์ประเภทเดียวกัน)
- เลือกประเภทไฟล์หลายชนิดผ่านป๊อปกลาง `FileTypePickerModal` (ค้นหาได้ · เลือกทั้งกลุ่มได้ · พิมพ์นามสกุลที่ไม่มีในรายการเองได้)

## ใช้เมื่อไหร่ / ห้ามใช้เมื่อไหร่

- ใช้: กล่อง "ไฟล์" ในกระดาน flowchart (แผนผังการเก็บไฟล์) · ต่อไป: ไฟล์แนบ (`components/record-files`) · รายการไฟล์ Drive (`components/drive-folder-files`) · คลังไฟล์ — ตอนนี้ที่เหล่านั้นยังใช้อีโมจิของใครของมัน (ย้ายทีละจุด ต้องให้เจ้าของดูหน้าตาก่อน)
- ห้ามใช้: ไอคอนเมนู/ปุ่มทั่วไป → `<Icon>` กลาง · อยากโชว์รูปจริงของไฟล์ → ใช้ thumbnail

## วิธีใช้

```tsx
import { FileTypeIcon, FileTypePickerModal } from "@/components/file-type-icon";

<FileTypeIcon ext="psd" size={32} />            // ใส่นามสกุล
<FileTypeIcon ext="IMG_0001.CR2" />              // ใส่ชื่อไฟล์ทั้งชื่อก็ได้ (อ่านนามสกุลเอง)

<FileTypePickerModal open={open} onClose={close}
  initial={{ exts: ["cr2", "jpg"], label: "รูปจากกล้อง" }}
  confirmText="ใช้ประเภทนี้"
  onDone={(exts, label) => save(exts, label)} />
```

ตอนต้องการ SVG เป็นข้อความ (เช่น ทำรูป/ส่งออก) → `fileTypeSvg(ext, size)` จาก `lib/file-types` (ตัวเดียวกับบนจอ)

## กลุ่มและนามสกุล (65 ชนิด)

| กลุ่ม | นามสกุล |
|---|---|
| รูปภาพ | JPG PNG WEBP GIF HEIC TIF BMP |
| ไฟล์ดิบจากกล้อง (RAW) | CR2 CR3 NEF ARW RAF DNG ORF RW2 |
| งานออกแบบ | PSD PSB AI EPS SVG INDD CDR FIG XD SKETCH |
| เอกสาร | PDF DOCX DOC TXT RTF |
| ตาราง | XLSX XLS CSV |
| สไลด์ | PPTX PPT KEY |
| วิดีโอ / ตัดต่อ | MP4 MOV AVI MKV WEBM PRPROJ AEP |
| เสียง | MP3 WAV M4A |
| ไฟล์บีบอัด | ZIP RAR 7Z |
| แพตเทิร์น / เครื่องจักร | DXF DWG PLT SEW (จักรคอม SUPREME) DST PES (ลายปัก) |
| ฟอนต์ | TTF OTF |
| 3 มิติ | OBJ FBX STL GLB BLEND |
| ข้อมูล / เว็บ | JSON HTML XML |

- ชื่อเรียกอื่นแปลงให้เอง: JPEG→JPG · TIFF→TIF · HTM→HTML
- นามสกุลที่ไม่รู้จัก = ไอคอนสีเทา (กลุ่ม "อื่น ๆ") แต่ยังโชว์นามสกุลตามที่พิมพ์
- เพิ่มนามสกุลใหม่: เพิ่มบรรทัดใน `FILE_TYPES` (`lib/file-types.ts`) — สีตามกลุ่มอัตโนมัติ · ใส่ `color/fill` ถ้าอยากได้สีเฉพาะตัว (เช่น PSD ฟ้า · AI ส้ม · PDF แดง)

## ความปลอดภัย / ข้อจำกัด

- นามสกุลถูกกรองเหลือ a-z 0-9 ไม่เกิน 8 ตัว ก่อนวาด (ป้ายบนไอคอนแสดงไม่เกิน 6 ตัว) → ฝังลง SVG ได้ปลอดภัย (มีเทสต์)
- ไอคอนไม่ใช่โลโก้ของโปรแกรม — เป็นสี + ตัวอักษร เพื่อให้จำง่าย
- ไม่มี permission / audit log (เป็นแค่ภาพ) — ที่เก็บค่าที่เลือก (เช่น กระดาน flowchart) จัดการสิทธิ์/บันทึกประวัติเอง
