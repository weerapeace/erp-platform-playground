# ตัวเชื่อม TikTok Shop (ร้านของเราเอง)

> สถานะ 2026-11-11: **ขั้น 1 = เชื่อมต่อ/ถือกุญแจเท่านั้น** ยังไม่ดึงหรือแก้อะไรบนร้าน · ร้านที่ต่อ = Louis Montini (แอป "Louis Montini ERP")

## ใช้ทำอะไร
- ให้ ERP คุยกับร้าน TikTok Shop ผ่าน Open API ทางการ (แอปแบบ Seller Developer / Custom App: 1 แอป = 1 ร้าน)
- แบบเดียวกับตัวเชื่อม Lazada (`docs/lazada-connector.md`) — เก็บกุญแจใน `platform_credentials` (แบรนด์ × `tiktok`) เข้ารหัสด้วย `PLATFORM_SECRET_KEY`

## ส่วนประกอบ
| ไฟล์ | หน้าที่ |
|---|---|
| `lib/tiktok-shop.ts` | เซ็นคำขอ (HMAC-SHA256) · ขอ/ต่ออายุกุญแจ · `ttsApi()` เรียก API · `ttsGetAuthorizedShops()` · ข้อความ error ภาษาคน |
| `app/api/tiktok-shop/shared.ts` | อ่าน/เก็บการเชื่อมต่อ · `ttsTokenOrReason()` (ต่ออายุเองเมื่อเหลือ < 1 ชม.) · ใช้ state/baseUrl/getPlatformId ตัวเดียวกับ Lazada |
| `/api/tiktok-shop/oauth/start` | คืนลิงก์อนุญาต (guard `products.platforms.manage_accounts`) |
| `/api/tiktok-shop/callback` | TikTok เรียกกลับ → แลกกุญแจ → ดึงรายชื่อร้าน (shop cipher) → เก็บ + audit |
| `/api/tiktok-shop/status` | สถานะ (ไม่คืนกุญแจ/cipher) · `&check=1` = ลองกับ TikTok จริง |
| `/api/tiktok-shop/disconnect` | ลบกุญแจ + audit |
| หน้า `/admin/platform-accounts` › TikTok | ปุ่มเชื่อมต่อ / ตรวจการเชื่อมต่อ / ตัดการเชื่อมต่อ |

## ค่าตั้ง (Vercel env — เจ้าของใส่เองแล้ว 2026-11-11)
`TIKTOK_SHOP_APP_KEY` · `TIKTOK_SHOP_APP_SECRET` · `TIKTOK_SHOP_SERVICE_ID` (= ตัวเลข "ID:" ใต้ชื่อแอปใน Partner Center)
Redirect URL ในแอป: `https://erp-platform-playground.vercel.app/api/tiktok-shop/callback`

## กติกาจากเอกสารทางการ (partner.tiktokshop.com)
- sign = HMAC-SHA256(app_secret, `secret + path + เรียง query {key}{value} (ไม่รวม sign, access_token) + body + secret`) → hex
- API 202309+: กุญแจอยู่ใน header `x-tts-access-token` (ไม่นำไปเซ็น) · `timestamp` วินาที 10 หลัก (ช่วง −5 นาที … +30 วิ)
- โฮสต์ API `https://open-api.tiktokglobalshop.com` · ขอกุญแจ `https://auth.tiktok-shops.com/api/v2/token/get` (`grant_type=authorized_code`)
- access_token ~7 วัน · refresh_token อายุเท่าที่ร้านเลือกตอนอนุญาต · ค่า `*_expire_in` = เวลาหมดอายุ (unix วินาที) — `ttsExpiryMs` รับได้ทุกแบบกันเอกสารไม่ตรง
- คำสั่งระดับร้าน (สินค้า/ออเดอร์) ต้องส่ง `shop_cipher` จาก `/authorization/202309/shops`
- แอปที่ยังเป็น **ฉบับร่าง** ร้านจริงกดอนุญาตไม่ได้ → ต้องผ่าน "การตรวจสอบการลงทะเบียนพาร์ทเนอร์" แล้วกด **เผยแพร่** ก่อน (ทดสอบก่อนได้ด้วย Development Shop ใน Partner Center)
- ร้านยกเลิกสิทธิ์เองได้ที่ Seller Center › App Store › My apps
- **สิทธิ์ต้องเปิดที่ "ตัวแอป" ด้วย** (เจอจริง 2026-11-12): กุญแจของร้านได้ `granted_scopes` ครบ 132 ตัว แต่แอปยังไม่ได้เปิดสิทธิ์ → ทุกคำสั่งตอบ `105005 Access denied ... access scope` → เปิดที่ Partner Center › App & Service › แอป › จัดการ API → กด "เผยแพร่การเปลี่ยนแปลง" → ตัดการเชื่อมต่อแล้วเชื่อมใหม่ (ได้กุญแจใหม่)
  - ใช้ตอนนี้: Shop Authorized Information (`seller.authorization.info`) · ขั้นอ่านถัดไป: Product Basic · Order Information · Logistics Basic (+Finance Information ถ้าจะกระทบยอด)
  - `ttsApi(…, { scope })` ใส่ชื่อสิทธิ์ไว้ → `ttsErrorText` บอกเจ้าของว่าต้องเปิดตัวไหน · รหัส 36009004 ใช้ซ้ำหลายสาเหตุ แยกด้วยข้อความ

## ห้ามใช้เมื่อไหร่ / ข้อควรระวัง
- ห้ามส่งสต๊อกขึ้น TikTok ขณะที่ BigSeller ยังซิงค์สต๊อกร้านเดียวกัน
- ทุกคำสั่งที่เขียนลงร้าน (ขั้น 2+) ต้องขออนุญาตเจ้าของทีละเฟส + ทดสอบ 1 สินค้าก่อน + เขียน audit

## ขั้นต่อไป (ยังไม่ทำ)
1. ดึงสินค้าทั้งร้าน → `lib/platform-catalog-sync` (หน้าสินค้าบนแพลตฟอร์ม) — ต้องเห็นคำตอบจริงก่อนเขียนตัวแปลง
2. ดึงหมวดหมู่ TikTok (`/product/202309/categories`) เติมการจับคู่หมวด
3. ดึงออเดอร์เข้า `platform_orders` (ศูนย์ออเดอร์)
4. แก้สินค้า/ราคา/สต๊อก — ทีละเฟสตามที่เจ้าของอนุมัติ
