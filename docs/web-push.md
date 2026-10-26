# 📲 แอปแจ้งเตือนบนมือถือ + เด้งแจ้งเตือน (Web Push)

## ใช้ทำอะไร
- แอปเล็ก `/notify` = กระดิ่งแจ้งเตือนของ ERP ในแบบมือถือ ติดตั้งลงหน้าจอโฮมได้
- แจ้งเตือนทุกเรื่องที่เข้ากระดิ่ง (งาน, PR/PO, SO, QC, ล็อกอินเครื่องใหม่ …) **เด้งเข้ามือถือ/คอมเอง** แม้ไม่ได้เปิดแอป
- แต่ละคนเลือกได้ว่าประเภทไหนเด้ง / ไม่เด้ง (ปิดแล้วยังเห็นในกระดิ่งตามเดิม)

## ทางเดินของข้อมูล
```
โมดูลใดก็ได้ → erp_notify / insert erp_notifications   (ของเดิม ไม่ต้องแก้)
  → trigger erp_notifications_push (เฉพาะเจ้าของแจ้งเตือนที่มีเครื่องเปิดรับ)
  → pg_net POST /api/push/dispatch  (header x-cron-token = Vault "push_dispatch")
  → lib/push-server dispatchPush: จองแถว (pushed_at) → เช็กประเภทที่เปิด → ส่งทุกเครื่องของคนนั้น
  → lib/web-push sendWebPush (เข้ารหัส RFC 8291 + ลายเซ็น VAPID RFC 8292)
  → บริการ push ของ Google / Apple / Mozilla / Microsoft → เครื่อง → public/notify-sw.js เด้ง
```
- เพิ่มแจ้งเตือนชนิดใหม่ในโมดูลไหน **ไม่ต้องทำอะไรเพิ่ม** — เด้งเองผ่าน trigger (ตกประเภท "อื่น ๆ" ถ้ายังไม่จัด)
- จัดประเภทใหม่ = แก้ `PUSH_CATEGORIES` ใน `lib/push-categories.ts` ที่เดียว (หน้าตั้งค่า + ตัวส่ง ใช้ร่วมกัน)

## ไฟล์
| ไฟล์ | หน้าที่ |
|---|---|
| `lib/web-push.ts` | เข้ารหัส + VAPID + ส่ง (node:crypto ล้วน ไม่มีไลบรารีเพิ่ม) · `isAllowedPushEndpoint` กันส่งไป URL แปลก |
| `lib/push-server.ts` | กุญแจ VAPID (สร้างเองครั้งแรก) · `dispatchPush` · รวมเป็นข้อความสรุปถ้าเกิน 3 เรื่องพร้อมกัน |
| `lib/push-categories.ts` | ประเภทแจ้งเตือน + ค่าตั้งต่อคน (`user_ui_prefs` key `push_prefs` = `{ off: [...] }`) |
| `components/web-push` | `useWebPush()` เปิด/ปิดรับบนเครื่องนี้ · ต่ออายุทุกครั้งที่เปิดแอป |
| `app/notify/*` | แอปมือถือ (รายการ / เปิดดูเรื่องในกรอบ `?embed=1` / ตั้งค่า) |
| `public/notify-sw.js` | service worker (scope `/notify` · ไม่มี fetch handler = ไม่ยุ่งกับหน้าอื่น) |
| `public/notify.webmanifest` | ข้อมูลติดตั้งแอป (scope `/` ให้หน้า login/หน้าเรื่องอยู่ในแอปเดียวกัน) · ⚠️ ผูกที่ `app/notify/page.tsx` (ตั้งใน layout ระดับแรกจะโดน manifest กลางทับ) |
| `app/api/push/subscriptions` | GET/POST/DELETE เครื่องของตัวเอง (audit `push_subscription`) |
| `app/api/push/dispatch` | ให้ trigger เรียก (โทเคน Vault) |
| `app/api/push/test` | ปุ่ม "ส่งแจ้งเตือนทดสอบ" (ถึงตัวเองเท่านั้น · event `push.test` ปิดไม่ได้) |
| `supabase/migrations/202611010300_web_push.sql` | ตาราง `erp_push_subscriptions` + `erp_notifications.pushed_at` + trigger |

## ความปลอดภัย / สิทธิ์
- ใช้ได้ทุกคนที่ล็อกอิน (เห็นแค่แจ้งเตือนของตัวเอง) — ไม่มีสิทธิ์ใหม่
- `erp_push_subscriptions` เปิด RLS ไม่มี policy + ถอนสิทธิ์ anon/authenticated → เข้าได้ทางเซิร์ฟเวอร์เท่านั้น
- กุญแจ VAPID ส่วนตัวอยู่ใน `china_app_settings.skey='web_push'` (ปิดค่าใน `lib/settings-secrets`) — **ห้ามลบ/เปลี่ยน** ไม่งั้นทุกเครื่องต้องเปิดแอปให้สมัครใหม่ (แอปทำให้เองเมื่อเปิด)
- ฟังก์ชัน trigger เป็น SECURITY DEFINER → revoke anon/authenticated แล้ว (กฎ audit 2026-10-21)
- ปลายทางรับได้เฉพาะ fcm.googleapis.com / *.push.apple.com / *.push.services.mozilla.com / *.notify.windows.com

## ทางเข้า
- หน้ารวมแอป `/apps` ส่วน "หน้าหลัก" → ไอคอน 🔔 "แจ้งเตือน (มือถือ)" (แถวใน `erp_menu_items` · ทุกคนเห็น)
- ท้ายป๊อปกระดิ่ง → "📱 แอปแจ้งเตือนบนมือถือ"
- เปิด `/notify` บนคอม = แอปอยู่ในกรอบขนาดมือถือ + **QR สแกนด้วยกล้องมือถือ** ไปติดตั้ง (QrCode ของกลาง · ไอคอนแอปกลาง QR) · เปิดในโหมดแอปแล้วไม่โชว์ QR

## ติดตั้งบนมือถือ
- **Android:** เปิด `/notify` ด้วย Chrome → ⚙️ → "ติดตั้งแอป" → เปิดจากไอคอน → "เปิดรับแจ้งเตือนบนเครื่องนี้" → อนุญาต
- **iPhone/iPad (iOS 16.4+):** เปิด `/notify` ด้วย Safari → แชร์ → "เพิ่มไปยังหน้าจอโฮม" → เปิดจากไอคอน → ล็อกอิน (ใช้รหัสผ่าน/PIN — ลิงก์อีเมลจะไปเปิดใน Safari แทนแอป) → ⚙️ → "เปิดรับแจ้งเตือน" → อนุญาต
- iPhone แยกข้อมูลแอปออกจาก Safari → ต้องล็อกอินในแอปครั้งแรก 1 ครั้ง

## ข้อจำกัดที่รู้
- ส่งไม่ถึงทันทีถ้าเครื่องปิด/ไม่มีเน็ต — บริการ push เก็บไว้ 24 ชม. แล้วส่งตอนเครื่องกลับมา
- แถวที่เก่ากว่า 30 นาทีตอนถูกเรียกส่ง จะข้าม (กันยิงของเก่า)
- trigger ยิงไปที่ `https://erp-platform-playground.vercel.app` (เปลี่ยนโดเมนต้องแก้ฟังก์ชัน `erp_push_after_notify`)
- หน้าเรื่องที่เปิดในแอปใช้โหมด `?embed=1` (ซ่อนเมนู ERP) — ป๊อปเตือนงาน (WorkPopupHost) ไม่ขึ้นในกรอบ กด ↗ เปิดเต็มจอแทน
- ยังไม่มีหน้าแอดมินดูว่าใครเปิดรับกี่เครื่อง (ดูได้จากตาราง `erp_push_subscriptions`)
