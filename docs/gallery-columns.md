# มุมมองการ์ดกลาง (GalleryColumns · CardGrid · CardViewBar)

ไฟล์: `components/gallery-columns/` · ตรรกะล้วน `lib/gallery-cols.ts` (เทสต์ `lib/__tests__/gallery-cols.test.ts`)
ลองเล่น: หน้า `/admin/plugins` → กดของกลาง "มุมมองการ์ดกลาง" → ส่วน "ลองเล่น"

## ใช้ทำอะไร
ทุกหน้าที่โชว์การ์ด/รูปเป็นกริด ใช้ชุดนี้ชุดเดียว แก้ที่เดียว ทุกหน้าเปลี่ยนตาม

ผู้ใช้ได้:
- **Ctrl (⌘) + หมุนลูกกลิ้งบนการ์ด** = ย่อ/ขยาย (หมุนลง = เล็กลง) · นอกกริดซูมหน้าเว็บตามปกติ
- ปุ่ม **− N ต่อแถว +** (เลือกตรงตัวเลขได้) · จำขนาดรายคนต่อหน้า (`/api/user-prefs` key `gallery_cols_<scope>`)
- จอแคบลดจำนวนต่อแถวเอง (การ์ดไม่เล็กกว่า 70px) · 12 ใบต่อแถวขึ้นไปซ่อนชื่อ (ชี้ค้างดูได้)
- ตอนโหลด = โครงสีเทาขนาดเท่าการ์ดจริง · ว่าง = EmptyState · โหลดพลาด = ErrorState + ลองใหม่

## วิธีใช้
```tsx
import { useGalleryColumns, CardGrid, CardViewBar, GALLERY_LABEL } from "@/components/gallery-columns";

const gallery = useGalleryColumns("my-page", 6);           // scope ไม่ซ้ำกับหน้าอื่น
<CardViewBar gallery={gallery} count="120 รายการ" view={view} onView={setView}>
  {/* ปุ่มของหน้าเอง: เลือกทั้งหมด · ตัวกรอง · เรียง */}
</CardViewBar>
<CardGrid gallery={gallery} loading={loading} error={error} onRetry={load}
  isEmpty={rows.length === 0} empty={<EmptyState title="ไม่พบรายการ" />}>
  {rows.map((r) => (
    <div key={r.id} title={r.name}>
      <img src={withImageWidth(r.image, gallery.thumbW(320))} className="aspect-[5/4] w-full object-contain" />
      <p className={GALLERY_LABEL}>{r.name}</p>      {/* การ์ดเล็กมากซ่อนเอง */}
    </div>
  ))}
</CardGrid>
```

- รูปในการ์ดใช้ `aspect-[…]` ไม่ใช่ความสูงตายตัว (`h-32`) — ไม่งั้นซูมออกแล้วการ์ดผอมสูง
- ขอรูปตามขนาดการ์ด: `gallery.thumbW(base)`
- `CardGrid` รับ props ของ div ต่อ (เช่น onPointerDown สำหรับลากคลุมเลือก)
- **ของกลางที่มีหลายกริดในตัว** (แบ่งกลุ่ม · ป๊อปเลือกรูป) → `<CardZoom scope="…">{(z) => …z.template…}</CardZoom>` (เรียก hook เฉพาะตอนแสดง)
- **ป๊อปอัปที่ฝังในหน้าแต่ยังปิด** → `useGalleryColumns(scope, 6, gap, { enabled: open })` ไม่ยิงคำขอจนกว่าจะเปิด
- **MiniTable โหมดการ์ด** → `cardZoom={{ scope, initial, minPx }}` แทน `cardGrid` (opt-in · หน้าที่ยังใส่ cardGrid หน้าตาเดิม)
- **DataTable โหมดการ์ด** → เปิดให้เองทุกตาราง (scope `datatable-<tableId>`) · ค่าเริ่ม = "คอลัมน์ต่อแถว" ที่ตั้งไว้ · การ์ดไม่เล็กกว่า 220px (มือถือ 1 ใบเหมือนเดิม) · ตั้ง "1 คอลัมน์" = รายการยาวแบบเดิม
- ยังใช้ `GalleryColumnsControl` (ปุ่มเรียงตัวเลข / select / stepper) + `gridStyle` แบบเดิมได้ — หน้าเก่า 10 จุดหน้าตาไม่เปลี่ยน

## ห้ามใช้เมื่อ
- ตารางแถว → DataTable / MiniTable
- กระดานลากวางอิสระ → CanvasSketch
- การ์ดสูงไม่เท่ากันแบบ masonry

## สิทธิ์ / audit
ไม่มี — เป็นการแสดงผลล้วน (ค่าขนาดการ์ดเป็นค่าส่วนตัว ไม่ลง audit log)

## หน้าที่ย้ายมาแล้ว (CardGrid/CardViewBar)
- `components/sku-tag-browser` (SKU → เลือกดูตามแท็ก) — 2026-11-20
- กลุ่ม A (2026-11-20): DataTable โหมดการ์ด (ทุกตาราง) · AssetPicker (ป๊อปเลือกรูปจากคลัง) · GroupedImageViewer · MiniTable (`cardZoom` opt-in)
- กลุ่ม B (2026-11-20): คลังรูป Assets · อัลบั้มแบรนด์ (หน้ารายละเอียด Parent) · แท็บ SAMPLE ในตัวเลือกรูป · รูปเว็บไซต์ · ป๊อปเลือกรายการเว็บ (`website-pick-modal`) · รูป Description ของ Parent
- ยังไม่ย้าย: บอร์ดผลิต/จ่ายงาน (กลุ่ม D — มีตัวตั้งขนาดของทีมเอง) · หน้าดูสินค้า/ดีไซน์ (กลุ่ม C)

## ยังทำกริดเอง (รอย้ายทีละกลุ่ม · เจ้าของติ๊กก่อนทุกรอบ)
หา: `grep -rl "auto-fill, minmax" app components | xargs grep -L gallery-columns`
