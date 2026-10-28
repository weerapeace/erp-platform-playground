# 🔑 คู่มือเปิดปุ่ม "สมัครสมาชิก" ด้วย Google / LINE / Facebook (สำหรับเจ้าของร้าน)

> ทำครั้งเดียวต่อร้าน · ไม่ต้องเข้า Vercel · ไม่ต้องแก้โค้ด
> คุณต้องทำเองด้วยบัญชีของบริษัท (ระบบ/ผู้ช่วยสร้างบัญชีหรือกรอกรหัสผ่านแทนไม่ได้)
> คู่มือเดียวกันนี้อยู่ในหน้า ERP › เว็บไซต์ › (ร้าน) › แท็บ 👥 สมาชิก › ปุ่ม **🔑 ตั้งค่าการเข้าสู่ระบบ** › "📘 วิธีสร้าง" (มีที่อยู่ให้กดคัดลอกของร้านนั้นเลย)

## ภาพรวม
1. ไปสร้าง "แอป" ที่ Google / LINE / Facebook (เจ้าไหนก่อนก็ได้ ทำแค่เจ้าเดียวก็เปิดปุ่มได้)
2. ใส่ **ที่อยู่ Callback** ของร้านลงในแอป (คัดลอกจากหน้า ERP)
3. คัดลอก **รหัส 2 ตัว** (ID + รหัสลับ) กลับมาวางในหน้า ERP › 🔑 → บันทึก
4. เปิดเว็บร้าน → ปุ่มดำ "สมัครสมาชิก" มุมขวาบนขึ้นเอง (ช่องทางที่ยังไม่ตั้ง = ไม่มีปุ่ม)

ที่อยู่ Callback (แทน `<โดเมน>` ด้วยโดเมนร้าน เช่น `louismontini.co.th`, `pixiedustie-store.vercel.app`):
```
https://<โดเมน>/api/auth/google/callback
https://<โดเมน>/api/auth/line/callback
https://<โดเมน>/api/auth/facebook/callback
```
ลิงก์นโยบายความเป็นส่วนตัว: `https://<โดเมน>/privacy`

---

## 🟥 Google
1. เปิด **console.cloud.google.com** ด้วย Google ของบริษัท → มุมซ้ายบน "เลือกโปรเจกต์" → **New project** (ชื่อเช่น "เว็บร้าน")
2. เมนู **APIs & Services → OAuth consent screen** (บางบัญชีเรียก "Google Auth Platform") → Get started → ชื่อร้าน + อีเมลติดต่อ → **External** → บันทึก
3. หัวข้อ **Branding**: โลโก้ + ลิงก์นโยบายความเป็นส่วนตัว
4. เมนู **Clients** (หรือ Credentials) → **Create client** → ชนิด **Web application** → **Authorized redirect URIs** → Add → วางที่อยู่ Callback ของ Google (ร้านละบรรทัด)
5. Create → คัดลอก **Client ID** และ **Client secret** → วางใน ERP › 🔑 ช่อง Google → บันทึก
6. หัวข้อ **Audience** → **Publish app** (ถ้ายังเป็น Testing จะใช้ได้แค่อีเมลที่เพิ่มเป็นผู้ทดสอบ)

## 🟩 LINE
1. เปิด **developers.line.biz** → Log in ด้วย LINE ของบริษัท → **Create a new provider** (ชื่อบริษัท)
2. **Create a new channel** → **LINE Login** → App types ติ๊ก **Web app** → ชื่อร้าน / ไอคอน / อีเมล → Create
3. แท็บ **LINE Login** → Callback URL → Edit → วางที่อยู่ Callback ของ LINE (บรรทัดละ 1 ร้าน)
4. (ไม่บังคับ) Basic settings → **OpenID Connect → Email address permission → Apply** แนบลิงก์นโยบาย (ไม่ขอ = ได้แค่ชื่อและรูป ใช้งานได้ปกติ)
5. แท็บ Basic settings → คัดลอก **Channel ID** และ **Channel secret** → วางใน ERP › 🔑 ช่อง LINE → บันทึก
6. มุมบนของ channel เปลี่ยน **Developing → Published**

## 🟦 Facebook
1. เปิด **developers.facebook.com** → My Apps → **Create App** → เลือก "Authenticate and request data from users with **Facebook Login**" → ชื่อแอป (ชื่อร้าน) + อีเมล
2. Use cases → Facebook Login → **Customize → Settings** → **Valid OAuth Redirect URIs** → วางที่อยู่ Callback ของ Facebook
3. สิทธิ์ที่ใช้: **email** + **public_profile** (สิทธิ์มาตรฐาน ไม่ต้องรอตรวจ)
4. App settings → **Basic**: App domains = โดเมนร้าน · **Privacy Policy URL** = ลิงก์นโยบาย · **User data deletion** = ลิงก์นโยบายต่อท้าย `#delete-account` · หมวดหมู่ · ไอคอน → Save
5. หน้า Basic: คัดลอก **App ID** + กด Show ที่ **App secret** แล้วคัดลอก → วางใน ERP › 🔑 ช่อง Facebook → บันทึก
6. มุมบนเปลี่ยน App Mode เป็น **Live** (ยังเป็น Development = ใช้ได้แค่คนที่เพิ่มเป็นผู้ทดสอบ)

---

## ตรวจว่าใช้ได้
- ERP แท็บ 👥 สมาชิก: แถบ "การเข้าสู่ระบบของร้านนี้" ขึ้น ✓ ที่ช่องทางที่ตั้งแล้ว
- เปิดเว็บร้าน (หน้าต่างไม่ระบุตัวตน) → กด "สมัครสมาชิก" → ติ๊กยอมรับ → กดปุ่ม Google/LINE/Facebook → กลับมาที่หน้าบัญชี
- สมาชิกคนนั้นขึ้นในแท็บ 👥 สมาชิก

## ปัญหาที่เจอบ่อย
| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| `redirect_uri_mismatch` (Google) / "Invalid redirect_uri" | ที่อยู่ Callback ในแอปไม่ตรงทุกตัวอักษร — คัดลอกจากหน้า ERP ใหม่ (https, ไม่มี / ท้าย) |
| กดแล้วขึ้น "ติดต่อผู้ให้บริการไม่สำเร็จ" | รหัสลับผิด/คัดลอกไม่ครบ — วางใหม่ใน ERP (ช่องรหัสลับเว้นว่าง = ใช้ของเดิม) |
| ใช้ได้แค่บัญชีเรา คนอื่นใช้ไม่ได้ | แอปยังเป็น Testing/Development — กด Publish / Live / Published |
| ปุ่มไม่ขึ้นบนเว็บ | ยังไม่ได้บันทึก หรือช่อง "โชว์ปุ่มบนเว็บ" ไม่ได้ติ๊ก · รอ 1 นาทีแล้วรีเฟรช |
| มีโดเมนใหม่ | เพิ่มที่อยู่ Callback ของโดเมนใหม่ในแอปทุกเจ้า + เพิ่มโดเมนในแท็บข้อมูลร้าน |

## ความปลอดภัย
- รหัสลับเก็บใน ERP เท่านั้น (ตารางที่อ่านได้แค่ระบบฝั่งเซิร์ฟเวอร์) · หน้าจอเห็นแค่ 4 ตัวท้าย · ทุกการแก้มีประวัติ (audit)
- อย่าส่งรหัสลับทางแชท/อีเมล — วางในหน้า ERP โดยตรง
- ถ้าคิดว่ารหัสลับหลุด: สร้างรหัสลับใหม่ที่หน้าผู้ให้บริการ (Reset secret) แล้ววางใหม่ใน ERP
