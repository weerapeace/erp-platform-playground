# ลิงก์สั้น (ของกลาง)

ย่อลิงก์ยาว (TikTok/Shopee/Lazada/LINE) เป็น `https://louismontini.co.th/go/<code>` แบบเดียวกับ bitly แต่ใช้โดเมนของเรา และข้อมูลคลิกอยู่ใน ERP

## ทำงานยังไง
1. ERP เก็บ `code → ลิงก์ปลายทาง` ในตาราง `short_links` (migration `202612200900_short_links.sql`)
2. คนกด `louismontini.co.th/go/abc12` → เว็บร้าน (repo `weerapeace/storefront`, ไฟล์ `src/app/go/[code]/route.ts`) ถาม ERP `GET /api/public/short-links/abc12`
3. ERP นับคลิก (RPC `short_link_hit` → `short_link_click_daily` รายวัน × ที่มา) แล้วตอบลิงก์ปลายทาง → เว็บร้าน redirect 302
4. ไม่เจอ / ปิด / ลบ → ไปหน้าแรกร้าน

ที่มา (นับแยก): ดูจากเบราว์เซอร์ในแอป (Facebook/Instagram/LINE/TikTok) · `?q=1` = สแกน QR · อื่น ๆ — ไม่เก็บ IP หรือข้อมูลส่วนตัว

## ใช้ในโค้ด
| ที่ | ใช้ |
|---|---|
| กติกา (pure) | `lib/short-links` — `SHORT_LINK_BASE`, `isShortenableShopUrl`, `extractUrls`, `replaceWithShortLinks`, `shortLinkSourceOf` |
| หน้าเว็บ | `lib/short-links-client` — `ensureShortLinks(urls, ctx)`, `useShortLinkMap(urls, ctx)`, `useAutoShortLinks()` (สวิตช์ส่วนตัว) |
| server | `lib/short-links-db` — `ensureShortLinks(admin, urls, opts)`, `insertShortLink` |
| หน้าจัดการ | `components/short-links` (`ShortLinksManager`) ที่ `/tasks/short-links` |

แคปชั่นโพสต์ (Contents): `caption-assemble` แทนลิงก์ร้านในข้อความสุดท้ายด้วยลิงก์สั้นอัตโนมัติ (`SharedVars.short_links`) · ไม่แก้ลิงก์ที่บันทึกไว้ในโพสต์/สินค้า · ปิดสวิตช์ "ย่อลิงก์ร้านอัตโนมัติ" = ลิงก์ยาวเหมือนเดิม

## API
- `GET /api/short-links?trash=1` รายการ + คลิกแยกที่มา (สิทธิ์ `short_links.create`)
- `POST /api/short-links { url, code?, label?, source_module? }` สร้าง (ไม่ตั้งชื่อ = ใช้ลิงก์เดิมของปลายทางนี้ซ้ำ)
- `POST /api/short-links/ensure { urls[] }` ย่อหลายลิงก์ (เฉพาะลิงก์ร้าน) — ไม่มีสิทธิ์ = คืน `{}` เงียบ ๆ
- `PATCH /api/short-links/[id] { target_url?, label?, code?, is_active?, restore? }` · `DELETE` = ถังขยะ — เจ้าของลิงก์ หรือ `short_links.manage`
- `GET /api/public/short-links/[code]` สาธารณะ (เว็บร้านเรียก) ไม่มีข้อมูลภายใน ห้าม cache

## สิทธิ์ / ความปลอดภัย / ประวัติ
- `short_links.create` (staff+manager) · `short_links.manage` (manager) · admin มีทุกสิทธิ์
- ปลายทางรับเฉพาะ `http/https` (เช็กทั้งโค้ดและ DB) · ตาราง RLS เปิด ไม่มี policy + revoke anon/authenticated · RPC ให้ service_role เท่านั้น
- ทุกการสร้าง/แก้/ปิด/ลบ/กู้คืน ลง `audit_logs` (entity `short_link`, `changes: auditDiff`)
- ลบ = ถังขยะ (กู้คืนได้) · รหัสไม่ปล่อยให้คนอื่นใช้ซ้ำ (กันลิงก์เก่าที่แจกไปพาไปผิดที่)

## ข้อจำกัด
- เปลี่ยนชื่อท้ายลิงก์ = ลิงก์/QR ที่แจกไปแล้วใช้ไม่ได้ (หน้าแก้เตือนแล้ว)
- นับคลิกแยกที่มาเดาจากเบราว์เซอร์ — คนเปิดในเบราว์เซอร์ปกติ (Chrome/Safari) นับเป็น "อื่น ๆ"
- ใช้โดเมนอื่น: ตั้ง env `NEXT_PUBLIC_SHORT_LINK_BASE` (เว็บร้านโดเมนนั้นต้องมี route `/go/[code]`)
