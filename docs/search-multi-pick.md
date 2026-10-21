# SearchMultiPick — ค้นหา + ติ๊กเลือกหลายตัว (ฝังในหน้า)

ไฟล์: `components/search-multi-pick/index.tsx` · เพิ่ม 2026-10-21 (audit แอปจัดการงาน Y2)

## ใช้ทำอะไร
รายการค้นหา + checkbox + ปุ่ม "โหลดเพิ่ม" + ชิปตัวที่เลือก แบบฝังในป๊อป/หน้า (ถ้าต้องการป๊อปแยกสำหรับ SKU ใช้ `SkuMultiPickerModal`)

```tsx
<SearchMultiPick<SkuPickerValue> selected={sel} onChange={setSel} tone="violet"
  getId={(s) => s.id} chipLabel={(s) => s.code}
  fetchPage={(q, offset) => pickPage(`/api/pickers/skus?search=${q}&offset=${offset}`, mapSkuRow)}
  renderRow={(s) => <><span className="font-mono">{s.code}</span> {s.name}</>} />
```

- `fetchPage(q, offset)` คืน `{ rows, total }` · โยน error = ขึ้นข้อความผิดพลาด (ไม่ขึ้น "ไม่พบ" หลอก)
- พิมพ์ค้นหาแล้วรอ 250ms ก่อนยิง · ตัวที่เลือกจำไว้แม้เปลี่ยนคำค้น
- `tone`: violet / teal / indigo / orange

## ใช้อยู่ที่
หน้าแคมเปญ (`app/tasks/campaigns/[id]`) — เลือก SKU · Parent SKU · ใบงานออกแบบ หลายตัวมาวางบนกระดาน
(ตัวเลือก "SKU การตลาด" ยังเป็นของหน้า เพราะโหลดทั้งหมดครั้งเดียวแล้วกรองแบรนด์/ป้าย/มุมมองการ์ด)
