# BrandSelect — ช่องเลือกแบรนด์กลาง

ไฟล์: `components/brand-select/index.tsx` · เพิ่ม 2026-10-21 (audit แอปจัดการงาน Y2)

## ใช้ทำอะไร
ช่อง dropdown เลือกแบรนด์ — แทน `<select>` / `<ERPSelect>` + `brands.map(...)` ที่แต่ละหน้าเขียนเอง (เดิม 16 จุด)

```tsx
import { BrandSelect } from "@/components/brand-select";

<BrandSelect brands={brands} value={form.brand_id} onChange={(id) => setForm({ ...form, brand_id: id })}
  emptyLabel={t("— ไม่ระบุ —", "— None —")} />

// ช่องเล็กแบบเดิมของหน้า (ใช้ className เป็นหน้าตาทั้งหมด)
<BrandSelect plain brands={brands} value={brandId} onChange={setBrandId} className="h-8 text-xs border rounded-lg px-2" />
```

| ค่า | ความหมาย |
|---|---|
| `brands` | รายการแบรนด์ที่หน้าโหลดไว้แล้ว (เช่น `listBrands()` ของแอปจัดการงาน ซึ่งตัดแบรนด์ "งานลูกค้า" ออกแล้ว) |
| `emptyLabel` / `emptyValue` | ตัวเลือกว่าง เช่น "ไม่ระบุ" / "ทุกแบรนด์" (ค่าเริ่ม `""`) · ไม่ใส่ = ไม่มีตัวเลือกว่าง |
| `plain` | ไม่ใช้หน้าตา ERPSelect — ใช้ `className` ที่ส่งมาทั้งหมด |

## กติกา
- ค่าที่เลือกไว้แต่ยังไม่อยู่ในรายการ (แบรนด์ยังโหลดไม่เสร็จ) จะโชว์ "(กำลังโหลด…)" — ไม่โชว์ตัวเลือกแรกผิด ๆ
- ตัวเลือกแบรนด์แบบปุ่ม/ชิป (เช่น ฟอร์มสร้างงาน) ยังเป็นของหน้า — ใช้ BrandSelect เฉพาะแบบ dropdown
