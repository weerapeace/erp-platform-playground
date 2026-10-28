# 🔣 ไอคอนกลางของเว็บร้าน (Site Icons)

ไอคอนเส้นชุดเดียว ใช้ได้ทุกที่ที่ "ตั้งไอคอน" ในหน้าจัดการเว็บ — เลือกจากชุด / ใช้อีโมจิเดิม / อัปโหลดรูป-SVG เอง

## ใช้ทำอะไร

- ให้ร้านเลือกไอคอนที่ **สีตามธีมร้าน** (ไอคอนเส้นวาดด้วย `currentColor`) และคมทุกขนาด แทนอีโมจิที่สีตายตัว
- ตอนนี้ใช้ที่: 🛡 แถบความมั่นใจในตะกร้า (`theme.cart.trustItems`)
- ควรใช้ต่อ: Footer · ศูนย์ช่วยเหลือ · ป้ายต่าง ๆ · ไอคอนในตะกร้า (`cart.icons`) · แถบความมั่นใจหน้าสินค้าแบบหรู (ProductLuxe)

## ชิ้นส่วน

| ที่ | ไฟล์ | หน้าที่ |
| --- | --- | --- |
| ERP + เว็บร้าน | `lib/website-icons.ts` ↔ storefront `src/lib/site-icons.ts` (มิเรอร์ทั้งไฟล์) | `SITE_ICONS` (50 ตัว · รูปทรงอ้างอิง Tabler Icons · MIT) · `parseSiteIcon` · `cleanSiteIcon` · `searchSiteIcons` |
| ERP | `components/site-icon-picker.tsx` | `SiteIconPicker` (ป๊อป 3 แท็บ: ไอคอนเส้น ค้นหาได้ · อีโมจิ · อัปโหลด) + `SiteIcon` (วาดในหน้าตั้งค่า) |
| เว็บร้าน | `src/components/ui/SiteIcon.tsx` | วาดตามค่า — SVG inline เฉพาะตัวที่ใช้ (ไม่โหลดไฟล์ไอคอนเพิ่ม) |

## ค่าที่เก็บ (ข้อความเดียว)

| ค่า | ความหมาย |
| --- | --- |
| `i:lock` | ไอคอนเส้นในชุด (คีย์ใน `SITE_ICONS`) |
| `img:storefront/xxx.svg` | รูป/SVG ที่อัปโหลด (r2 key) — ไม่เปลี่ยนสีตามธีม |
| `🔒` | อีโมจิ/ตัวอักษร (ค่าเดิม — โชว์เหมือนเดิม) |
| `""` | ไม่มีไอคอน |

คีย์ที่ไม่รู้จัก / รูปแบบเสีย = ไม่วาด (ไม่โชว์ตัวอักษร `i:xxx` ให้ลูกค้าเห็น)

## วิธีใช้ (ERP)

```tsx
import { SiteIconPicker, SiteIcon } from "@/components/site-icon-picker";
<SiteIconPicker value={item.icon} onChange={(icon) => patch({ icon })} />
<SiteIcon value={item.icon} size={16} />
```

ตัวทำความสะอาดค่าก่อนเก็บ: `cleanSiteIcon(v, maxText)` — ไฟล์ที่ห้าม import (เช่น `lib/website-cart.ts`) ใช้กฎเดียวกันแบบเขียนในไฟล์ (`trustIconOf`)

## ห้ามใช้เมื่อ

- ไอคอนของ **ตั้งค่าโมดูล ERP** (เมนู/โมดูล) → ใช้ `components/icon-picker` (อีโมจิ) ตามเดิม
- เมนูใหญ่ (Mega menu) ยังใช้ชุดย่อย `MEGA_ICONS` ของตัวเอง (20 ตัวแรกของชุดนี้คือชุดเดียวกัน) — ย้ายมาใช้ชุดกลางภายหลัง

## เพิ่มไอคอน

1. เพิ่มแถวใน `SITE_ICONS` (key ตัวเล็ก-ขีด · label ไทย · tags คำค้นไทย/อังกฤษ · `d` ของ path 24×24 stroke)
2. คัดลอกทั้งไฟล์ไป storefront `src/lib/site-icons.ts` (คงหัวไฟล์ storefront)
3. deploy เว็บร้านก่อน ERP (เว็บร้านต้องรู้จักคีย์ใหม่ก่อน)

## สิทธิ์ / audit

ไม่มีสิทธิ์/ประวัติแยก — ค่าไอคอนบันทึกไปกับธีมร้าน (บันทึกร่าง/เผยแพร่ธีม = ตามระบบธีมเดิม)
