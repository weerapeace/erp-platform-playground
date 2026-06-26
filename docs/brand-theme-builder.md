# Brand Theme Builder (ระบบกลางธีมต่อแบรนด์)

ให้แต่ละ **แบรนด์** ตั้งค่าหน้าตาของตัวเองได้ — สี/พื้นหลัง/การ์ด/ปุ่ม/ไอคอน — โดย **ไม่ hardcode theme ในโค้ด** อีกต่อไป
(เลิกใช้ `if brand.name === "Good Goods"` แล้ว)

## ใช้ทำอะไร / ใช้เมื่อไหร่
- อยากให้หน้า (เริ่มที่ **Design Dashboard**) เปลี่ยนหน้าตาตามแบรนด์ที่เลือก
- เลือกแบรนด์ซ้าย → กดปุ่ม **🎨 ปรับธีม** → ตั้งค่า → **บันทึกร่าง** → **เผยแพร่** จึงมีผลจริง
- เลือก "ทั้งหมด" หรือแบรนด์ที่ยังไม่มีธีม → ใช้ **ERP default theme** อัตโนมัติ

## ตั้งค่าอะไรได้บ้าง (BrandTheme)
สี: primary / secondary / accent · ตัวอักษร: heading / body / muted · พื้นหลัง: สี + รูป (R2) + overlay + ความเข้ม ·
การ์ด: พื้น/ขอบ/มุมโค้ง/เงา · ปุ่ม: พื้น+ตัวอักษร (หลัก/รอง) · ไอคอน: stat/card (อัปรูป) · เส้น workflow · custom_css_variables (JSON)
มี **พรีเซ็ต** ให้เริ่ม: Clean SaaS / Luxury Navy / Soft Pink / Minimal Gray / Bold Brand / Photo Background / Dark Premium (เป็นค่าเริ่มต้น ไม่ผูกแบรนด์)

## โครงสร้าง (ของกลาง)
| ส่วน | ไฟล์ |
|---|---|
| Engine + type + presets + validation | `lib/brand-theme.ts` (`BrandTheme`, `DEFAULT_THEME`, `THEME_PRESETS`, `themeToCssVars`, `themeWarnings`, `hexToRgba`, `brandBgUrl`) |
| CSS กลาง (อ่าน `--brand-*`) | `components/brand-theme/styles.tsx` (`BrandThemeStyles`, scope `.brand-themed`) |
| Builder UI | `components/brand-theme-builder/` |
| API | `app/api/brand-themes/[brandId]/route.ts` |
| ตาราง | `brand_themes` (brand_id · draft_config · published_config · audit cols) |

## module อื่นจะใช้ theme ยังไง
```tsx
import { themeToCssVars, resolveTheme } from "@/lib/brand-theme";
import { BrandThemeStyles } from "@/components/brand-theme/styles";

// โหลด published theme: GET /api/brand-themes/{brandId} → resolveTheme(j.published)
<div className="brand-themed" style={themeToCssVars(theme)}>
  <BrandThemeStyles />
  {/* element ที่อยากให้ตามธีม ติด data-gg-stat-card / data-gg-task-card / data-gg-action[="primary"] ฯลฯ
      หรืออ่านตัวแปรเอง: style={{ color: "var(--brand-heading)" }} */}
</div>
```
ตัวแปรที่ได้: `--brand-primary/secondary/accent`, `--brand-bg`, `--brand-heading/text/muted`,
`--brand-card-bg/border/radius/shadow`, `--brand-btn-bg/text`, `--brand-btn2-bg/text`, `--brand-wf-line` (+ custom)

## รูปภาพ (image size policy)
- พื้นหลัง: `/api/r2-image?key=...&w=1600` (desktop) · `w=900` (tablet) · `w=640` (mobile) — **ห้ามโหลด original** (ใช้ `brandBgUrl()`)
- ไอคอน card/stat: `w=96`–`160` (`brandIconUrl()`) · lazy เมื่อเป็นรูปใน card
- อัปโหลดผ่านของกลาง `ImageInput` (เก็บเป็น R2 key) — แนะนำ webp/png/jpg, จำกัดขนาดตามนโยบาย ImageInput

## Permission
- แก้ธีม (บันทึกร่าง) → `brand.theme.edit`
- เผยแพร่ / รีเซ็ต → `brand.theme.publish`
- `admin` ผ่านทั้งหมด · role อื่นต้องได้รับสิทธิ์ใน `erp_role_permissions`

## Audit log (audit_logs, entity_type = `brand_theme`)
- `theme_draft` (บันทึกร่าง) · `theme_publish` (เผยแพร่) · `theme_reset` (รีเซ็ต) — บันทึก actor + brand_id + เวลา + theme_name

## Validation
- ตรวจรูปแบบสี (hex/rgba) · เตือนเมื่อ contrast ต่ำ (ปุ่มหลัก / ตัวอักษรในการ์ดอ่านยาก)
- ไม่มีรูปพื้นหลัง → ใช้สีพื้นหลังแทน · ไอคอนหาย → ไม่โชว์ (fallback ปลอดภัย)

## Responsive
Builder: desktop = 2 คอลัมน์ (ตั้งค่า/พรีวิว) · iPad/iPhone = เรียงบน-ล่าง (`flex-col lg:flex-row`) · แท็บเลื่อนได้

## ข้อห้าม (ยึดตอนต่อยอด)
ห้าม hardcode ธีมตามชื่อแบรนด์ · ห้ามสร้าง CSS เฉพาะแบรนด์ในหน้า · ห้ามโหลดรูป original · ใช้ของกลาง (ERPModal/ImageInput) เสมอ
