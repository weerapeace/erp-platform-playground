# ตั้งค่า "เชื่อม Gmail" (สำหรับปุ่ม 📥 ดึงบิลจากเมล)

ทำครั้งเดียว ประมาณ 15 นาที · ไม่มีค่าใช้จ่าย · ต้องทำเองเพราะต้องล็อกอินบัญชี Google และ Vercel ของคุณ

## ภาพรวม
1. สร้าง "แอป" ใน Google Cloud ให้ ERP ขอสิทธิ์อ่านเมลได้ → ได้รหัส 2 ตัว (Client ID + Client secret)
2. เอารหัส 2 ตัวไปใส่ใน Vercel (ที่เก็บค่าลับของเว็บ)
3. ใน ERP กด "เชื่อม Gmail" ทีละกล่อง (กล่องละ ~1 นาที)

---

## ขั้นที่ 1 — Google Cloud

1. เข้า https://console.cloud.google.com/ ด้วยบัญชี Google ของคุณ
2. มุมซ้ายบน กดชื่อโปรเจกต์ → **New Project** → ตั้งชื่อ `ERP Gmail` → Create (แล้วเลือกโปรเจกต์นี้)
3. เปิด Gmail API: ค้นหาด้านบนว่า **Gmail API** → กด **Enable**
4. ค้นหา **Google Auth Platform** (หรือ "OAuth consent screen") → **Get started**
   - App name: `ERP Louis Montini` (ตั้งอะไรก็ได้)
   - User support email: เลือกอีเมลของคุณ
   - Audience: เลือก **External**
   - Contact information: อีเมลของคุณ → ติ๊กยอมรับ → **Create**
5. เมนูซ้าย **Audience** → กด **Publish app** → Confirm
   - สถานะต้องเป็น **In production** (ถ้าค้างเป็น Testing การเชื่อมจะหลุดทุก 7 วัน)
   - ถ้ามีปุ่มให้ส่งตรวจสอบ (verification) **ไม่ต้องส่ง** — ใช้กันเองไม่เกิน 100 คนไม่ต้องตรวจ
6. เมนูซ้าย **Data Access** → **Add or remove scopes** → ค้น `gmail.readonly` → ติ๊ก → **Update** → **Save**
7. เมนูซ้าย **Clients** → **Create client**
   - Application type: **Web application** · Name: `ERP`
   - **Authorized redirect URIs** → Add URI → วางบรรทัดนี้ (ต้องตรงทุกตัวอักษร):
     ```
     https://erp-platform-playground.vercel.app/api/gmail/callback
     ```
   - กด **Create** → จะเห็น **Client ID** และ **Client secret** → กด Download JSON เก็บไว้ (secret ดูได้ครั้งเดียว)

## ขั้นที่ 2 — ใส่รหัสใน Vercel

1. เข้า https://vercel.com → โปรเจกต์ **erp-platform-playground** → **Settings** → **Environment Variables**
2. เพิ่ม 2 ตัว (Environment เลือก **Production**):
   - `GMAIL_OAUTH_CLIENT_ID` = Client ID จากขั้นที่ 1
   - `GMAIL_OAUTH_CLIENT_SECRET` = Client secret จากขั้นที่ 1
3. ค่าใหม่ใช้ได้หลัง deploy ใหม่: ไปที่ **Deployments** → รายการบนสุด → ⋯ → **Redeploy** (หรือบอก Claude ให้ deploy ให้)

## ขั้นที่ 3 — เชื่อมแต่ละกล่องเมลใน ERP

1. App Subscription → ปุ่ม **🖥️ โปรไฟล์ Chrome** → แต่ละโปรไฟล์กด **เชื่อม Gmail**
2. หน้า Google: เลือกบัญชีให้ตรงกับกล่องนั้น
3. จะเจอ **"Google hasn't verified this app"** (ปกติสำหรับแอปที่ใช้กันเอง) → กด **Advanced** → **Go to ERP Louis Montini (unsafe)**
4. หน้าขอสิทธิ์: ติ๊ก **อ่านอีเมล (Read your email…)** → **Continue**
5. กลับมาที่ ERP เห็นป้ายเขียว **"เชื่อม Gmail แล้ว"** = เสร็จ

แนะนำ: เชื่อม 1 กล่องก่อน (เช่น weerapeace@gmail.com) ลองกด **📥 ดึงจากเมล** ที่แถว Cloudflare ถ้าใช้ได้ค่อยเชื่อมกล่องที่เหลือ

### กล่องเมลบริษัท (@louismontini.co.th)
ถ้าขึ้น "Access blocked / แอปนี้ถูกบล็อกโดยผู้ดูแล" → ผู้ดูแล Google Workspace ต้องอนุญาตก่อน:
admin.google.com → Security → Access and data control → **API controls** → **Manage third-party app access** → Add app → OAuth App Name Or Client ID → วาง Client ID → เลือก **Trusted**

---

## ข้อควรรู้
- ERP ได้สิทธิ์ **อ่านอย่างเดียว** (ส่ง/ลบเมลไม่ได้) และค้นเฉพาะเมลบิลของรายการที่กด · ทุกการค้นและแนบบันทึกประวัติ
- รหัสเชื่อมต่อเก็บแบบเข้ารหัส ไม่ส่งไปที่หน้าเว็บ · ใช้ได้เฉพาะคนที่มีสิทธิ์แก้ไข App Subscription
- เลิกเชื่อมเมื่อไหร่ก็ได้: ปุ่ม "เลิกเชื่อม" ในทะเบียนโปรไฟล์ (หรือที่ https://myaccount.google.com/permissions)
- การเชื่อมจะหลุดถ้า: เปลี่ยนรหัสผ่านบัญชีนั้น / กดยกเลิกสิทธิ์ใน Google / ไม่ได้ใช้นานเกิน 6 เดือน → ป้ายจะขึ้น "เชื่อมใหม่"
- ดึงได้เฉพาะร้านที่ **แนบไฟล์ PDF/รูปมาในเมล** — ร้านที่ส่งแค่ลิงก์ (เช่น Adobe) ต้องเข้าเว็บร้านโหลดเอง

## สำหรับนักพัฒนา
- ระบบกลาง: `lib/gmail-api.ts` (OAuth, เข้ารหัส token AES-256-GCM, ค้นเมล, ดึงไฟล์แนบ) · ตาราง `gmail_connections` (service_role เท่านั้น)
- API: `/api/gmail/connect` · `/api/gmail/callback` (ตรวจ state ที่เซ็น HMAC แทน session) · `/api/gmail/connections`
- ใช้กับ App Subscription: `/api/subscriptions/mail-bills` (ค้น) · `/file` (ดูไฟล์) · `/attach` (แนบหลังยืนยัน) · UI `app/subscriptions/mail-bills-modal.tsx`
- env ไม่บังคับ: `GMAIL_TOKEN_KEY` (กุญแจเข้ารหัสแยก — ถ้าเปลี่ยนภายหลัง ทุกกล่องต้องเชื่อมใหม่) · `GMAIL_OAUTH_REDIRECT_URI` (ถ้าโดเมนเปลี่ยน)
- โมดูลอื่นที่อยากดึงไฟล์จากเมลใช้ `getGmailToken` + `gmailSearch` + `gmailGetAttachment` ซ้ำได้ (ตอนนี้สิทธิ์ผูกกับ subscriptions.* — ถ้าใช้กว้างขึ้นควรแยกสิทธิ์ gmail.*)
