# 🎨 ไอคอนแอป (ของกลาง)

## ใช้ทำอะไร
เปลี่ยนไอคอนของแอปที่ติดตั้งลงมือถือได้จากหน้าเว็บ ไม่ต้องแก้โค้ด — ไอคอนชุดเดียวใช้ทุกจุด:
QR ติดตั้ง · ไอคอนบนหน้าจอโฮม (Android/iPhone) · favicon · ไอคอนในแจ้งเตือนที่เด้ง

## ใช้อย่างไร (ในหน้าแอป)
```tsx
import { AppIconEditButton, useAppBranding } from "@/components/app-icon-editor";
import { appIconUrl } from "@/lib/app-branding";

const brand = useAppBranding("notify");
<img src={appIconUrl("notify", 192, brand.version)} />      // ที่อยู่รูปเดียวกันทุกจุด
<AppIconEditButton appKey="notify" branding={brand} />       // ✏️ โผล่เฉพาะคนมีสิทธิ์ admin.users
```

## เก็บที่ไหน
| แอป | เก็บไอคอนที่ | แก้ได้ที่ |
|---|---|---|
| แอปในทะเบียนเมนู (`/app/<key>`) | `erp_app_groups.icon_url` (เดิม) | /admin/menu ✎ หรือ AppIconEditButton |
| แอปเดี่ยวมีหน้าของตัวเอง (`STANDALONE_APPS` เช่น notify) | `china_app_settings` skey `app_branding` → `{ <key>: { icon_url, updated_at } }` | AppIconEditButton |

รูปอัปโหลดผ่าน `/api/admin/upload` folder `app-icons` → R2 · เสิร์ฟที่ `/api/app-icon/<key>?s=<ขนาด>` (ครอปกลางเป็นจัตุรัส · `m=1` maskable เผื่อขอบ · `d=1` ไอคอนตั้งต้น)

## เพิ่มแอปเดี่ยวใหม่
1. เพิ่มใน `STANDALONE_APPS` (lib/app-branding.ts) — ชื่อ, start_url, scope, สีธีม, ไอคอนตั้งต้นใน public/
2. หน้าแอป (page.tsx — ไม่ใช่ layout) ตั้ง `metadata.manifest = "/api/app-manifest/<key>"`
3. ใส่ `icon.tsx` + `apple-icon.tsx` ในโฟลเดอร์หน้า เรียก `appIconResponse(supabaseAdmin(), "<key>", ขนาด)` (ดู app/notify)

## สิทธิ์ / audit
- ดูรูป: สาธารณะ (มือถือต้องดึงตอนติดตั้ง) · เปลี่ยน: `admin.users` (เหมือนแก้แอปที่ /admin/menu)
- ทุกครั้งที่เปลี่ยน ลง audit `app_branding.update` (old_value/new_value)

## ข้อจำกัด
- Android ที่ติดตั้งไว้แล้ว: Chrome อัปเดตไอคอนบนหน้าจอเองภายใน 1–3 วัน
- iPhone: ไอคอนบนหน้าจอถูกจำตอนกด "เพิ่มไปยังหน้าจอโฮม" — ต้องลบแล้วเพิ่มใหม่
- แคชรูป 5 นาที (ที่อยู่รูปมีเลขรุ่น `v=` → หน้าเว็บเห็นรูปใหม่ทันที)
- แอปเป้าหมาย (/goals) ยังใช้ไอคอนรวมของระบบ — เสียบเข้าระบบนี้ได้ตามขั้น "เพิ่มแอปเดี่ยวใหม่"
