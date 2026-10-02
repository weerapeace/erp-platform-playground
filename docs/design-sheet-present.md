# ใบนำเสนอ A4 (Design Sheet Presentation) + แผงลอย FloatingPanel

ตกลงกับเจ้าของ 2026-10-02: **แบบ A = เลือกรูป + แม่แบบสำเร็จ** (ไม่ลากวางอิสระ) · ห้ามโชว์ต้นทุน/ราคาตีราคา · หน้า 2 เลือกได้ต่อใบ · หัวกระดาษ = โลโก้แบรนด์ของใบงาน

## ใช้ยังไง (ผู้ใช้)

- ปุ่ม **📄 ใบนำเสนอ A4** อยู่ในป๊อปอัปใบงาน (แถวปุ่มล่าง) และหน้ามือถือ (ปุ่ม 📄 บนแถบบน)
- เปิดเป็น **แผงลอย** ด้านขวา ลากย้าย/ย่อ/ขยาย/เต็มจอได้ ไม่บังบอร์ด (มือถือ = เต็มจอ)
- ในแผง: เลือกหน้า (1-2) → รูปแบบจัดวาง 4 แบบ (รูปใหญ่ 1 / รูป 4 / รูป 3 + ข้อความ / รูป + สเปก-ราคา) → ใส่รูปจาก **ใบงาน** หรือ **กระดานแคมเปญ** → หัวข้อ/จุดขาย/ข้อความ → ติ๊กโชว์ราคาเสนอ → พรีวิว → 💾 บันทึก / 🖨 พิมพ์-PDF
- พิมพ์ที่ `/print/design-sheet-present/[id]` (ใช้ระบบพิมพ์กลาง) · แก้หน้าตาใบได้ที่ /admin/report-templates entity **"ใบนำเสนอ A4 (ใบงานออกแบบ)"**

## ของกลาง / ไฟล์

| ส่วน | ไฟล์ | หมายเหตุ |
|---|---|---|
| แผงลอย (ของกลาง ใช้หน้าอื่นได้) | `components/floating-panel` | `<FloatingPanel open onClose title icon width footer storageKey>` · z-70 · Esc ปิด · ไม่มี backdrop |
| ตรรกะใบนำเสนอ (pure) | `lib/design-sheet-present.ts` | types · LAYOUTS · `sanitizePresentation` · `buildPresentData` · `DEFAULT_DS_PRESENT_TEMPLATE` · unit test `lib/__tests__/design-sheet-present.test.ts` |
| โหลดข้อมูล (client) | `lib/design-sheet-present-client.ts` | `loadPresentBundle(id)` ยิง 2 ชุด ไม่ดึง cost-lines เลย |
| แผงจัดใบ | `components/design-sheet-present` | `<DesignSheetPresentPanel sheetId open onClose>` |
| หน้าพิมพ์ | `app/print/design-sheet-present/[id]` | เทมเพลต DB (entity `ds_present`) → fallback DEFAULT |
| API เก็บใบ | `app/api/design-sheets/[id]/presentation` | GET/PUT · products.view/edit · audit `presentation_update` · คอลัมน์ `design_sheets.presentation jsonb` (migration `design_sheets_presentation`) |
| API รูปบนกระดาน | `app/api/creative-campaigns/[id]/canvas-images` | อ่าน scene ของ `erp_canvas_sketches` (creative_campaign) → รูปที่อยู่บน R2 (ข้าม base64 ที่ยังไม่เซฟ) · tasks.view |
| จุดเรียก | design-sheet-detail (prop `onOpenPresentation`) · design-dashboard (mount แผงระดับบอร์ด) · design-sheet-mobile | |

## กฎ

- **ข้อมูลต้นทุนไม่ถูกส่งเข้าเทมเพลตเลย** — ต่อให้แก้เทมเพลตก็ดึงไม่ได้ (ตัวแปรมีแค่ code/name/brand/วันที่/ราคาเสนอ/หน้า)
- รับเฉพาะรูปในคลังเรา (`/api/r2-image?key=`) — url ข้างนอกถูกตัดทิ้งตอนบันทึก
- สูงสุด 2 หน้า · 4 รูปต่อหน้า
- ราคาเสนอ = รอบ "ผ่าน" ล่าสุด ไม่มีก็รอบล่าสุด (offered_price) — ไม่ใช่ price ต้นทุน

## ข้อจำกัด / ต่อไป

- ยังไม่มีปุ่มส่ง LINE จากแผง (พิมพ์เป็น PDF แล้วส่งเอง)
- รูปที่ "วาด" บนกระดาน (ไม่ใช่ไฟล์รูป) หยิบไม่ได้
- แบบ B (ลากวางอิสระด้วย pdfme) ยังไม่ทำ — ถ้าต้องการ ส่วนเลือกรูป/แผงลอยใช้ร่วมได้
