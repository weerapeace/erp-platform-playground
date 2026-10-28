# 👤 ระบบสมาชิกเว็บร้าน (ลูกค้า login)

## ⭐ อัปเดต 2026-10-28 — ไม่ต้องตั้ง env ใน Vercel แล้ว + 🧪 สมาชิกทดลอง + ปุ่มสมัคร/ป๊อป
- **ตั้งค่าในหน้า ERP**: แท็บ 👥 สมาชิก › **🔑 ตั้งค่าการเข้าสู่ระบบ** วางรหัส Google / LINE / Facebook ต่อร้าน (คู่มือเจ้าของ: docs/website-members-login-setup.md) · ช่องว่าง/ปิด = ปุ่มนั้นไม่ขึ้น
- **🎫 บัตรสมาชิก**: ERP ออกบัตร (JWT EdDSA · `lib/storefront-member-token` · กุญแจสืบจาก `STOREFRONT_MEMBER_SECRET` หรือ `SUPABASE_SERVICE_ROLE_KEY`) → เว็บร้านเก็บในคุกกี้ `sf_member` และตรวจเองด้วยกุญแจสาธารณะ (`/api/public/storefront/member-config` · แคช 60 วิ) · ERP ตรวจซ้ำทุกคำขอ (`guardMember` + สถานะบัญชีใน DB)
- **ERP แลก OAuth code เอง** (`/api/storefront-member/oauth` · `lib/storefront-oauth`): รหัสลับอยู่ในตาราง `store_login_providers` (RLS ไม่มี policy · หน้าจอเห็น ••••4 ตัวท้าย · audit) · redirectUri ต้องเป็น callback บนโดเมนใน shop_domains · ตรวจ aud/iss ของ id_token
- **ด่าน**: `guardShop` (แค่ร้าน — oauth / trial-login) · `guardStorefront` (ต้องมีกุญแจภายใน — login ที่เชื่อโปรไฟล์จากเว็บร้าน, password) · `guardMember` (บัตร หรือ กุญแจ+รหัสสมาชิก) · ⚠️ `link` POST (เชื่อโปรไฟล์ที่ส่งมา) ต้องมีกุญแจเสมอ — ไม่งั้นลูกค้ายิงตรงมาผูก Google ของคนอื่นได้ · ร้านที่ตั้งรหัสใน ERP เชื่อมผ่าน oauth `link:true`
- **แบบเดิมยังใช้ได้**: ตั้ง `STOREFRONT_INTERNAL_KEY` + `GOOGLE_CLIENT_ID/SECRET` ฯลฯ ในเว็บร้าน = เว็บร้านแลก code เองแล้วส่งให้ `/login` (env มาก่อนค่าใน ERP) · `MEMBER_SESSION_SECRET` ไม่ใช้แล้ว · อีเมล+รหัสผ่านยังต้องใช้ env (กุญแจภายใน + `MEMBER_EMAIL_LOGIN=1` + Resend ที่ ERP)
- **✅ PDPA**: ป๊อป/หน้าเข้าสู่ระบบมี 2 แท็บ — **สมัคร** ต้องติ๊กยอมรับนโยบายก่อนปุ่มกดได้ (`store_customers.terms_accepted_at` · รับข่าวสาร = ไม่บังคับ) · **เข้าสู่ระบบ** ไม่สร้างบัญชีใหม่ (ยังไม่เคยสมัคร = 409 need_signup → เด้งกลับแท็บสมัคร) · ฟอร์มสมัครด้วยอีเมลมีช่องติ๊กเหมือนกัน · ขอเฉพาะ openid/profile/email (FB: email,public_profile)
- **ปุ่มบนหัวเว็บ (แบบ A ที่เจ้าของเลือก)**: ไอคอน 👤 = ป๊อปแท็บเข้าสู่ระบบ + ปุ่มเด่น "สมัครสมาชิก" = ป๊อปแท็บสมัคร (จอเล็กเหลือไอคอน) · ป๊อปกลางจอ (มือถือ = แผ่นเลื่อนจากล่าง) `components/account/MemberAuthHost` + เนื้อหา `MemberAuthPanel` (ใช้ร่วมกับหน้า /account/login)
  - ลิงก์ `/account/login?tab=&next=` ทุกที่บนเว็บกลายเป็นป๊อปเอง (ดักคลิกที่ window capture ก่อน NavProgress) · โค้ดที่ไม่ใช่ลิงก์เรียก `openMemberAuth()` (`lib/member/auth-open`) เช่น ❤️
- **🧪 สมาชิกทดลอง**: แท็บ 👥 › ปุ่ม **🧪 สมาชิกทดลอง** → สร้าง (ชื่อ + แต้มเริ่มต้น) / **เปิดเว็บในฐานะคนนี้** / ลบ / ลบทั้งหมด (`/api/website/members/test` · products.edit · audit ทุกคำสั่ง · สูงสุด 20 คน/ร้าน)
  - `store_customers.is_test` · ตั๋ว `store_customer_tokens` kind `trial_login` (ใช้ครั้งเดียว 10 นาที เก็บแค่แฮช) → `https://<โดเมน>/api/auth/trial?t=…&pk=…` → ERP `/api/storefront-member/trial-login` · ร้านปิดเว็บ = แนบ preview+pk ให้
  - ห้าม: สั่งซื้อ (`order`) · ผูกออเดอร์เก่า (`orders` POST) · เชื่อมช่องทาง · ตั้งรหัสผ่าน (`denyTestMember`) · โค้ดชวนเพื่อน = ตัวอย่าง "FTEST00" (ไม่สร้างจริง)
  - ไม่นับ: ปุ่มกลุ่ม/จำนวนในแท็บ 👥 (ดูได้จากปุ่มกรอง "🧪 ทดลอง") · CSV ตัดฝั่งเซิร์ฟเวอร์ · ไม่มีออเดอร์จึงไม่ปนยอดขาย · ลบได้เสมอ (FK cascade ทุกตาราง ยกเว้น store_orders ซึ่งไม่มี)
  - ลูกค้าจริงใช้ทางนี้ไม่ได้: ตั๋วออกจาก ERP (พนักงาน) เท่านั้น + ใช้ได้เฉพาะ is_test · บัญชีจริงเปลี่ยนเป็นทดลองไม่ได้
- migration `202611040100_store_members_trial_login` · เทสต์ `lib/__tests__/storefront-member-login.test.ts`

## ใช้ทำอะไร
ลูกค้าเข้าสู่ระบบที่หน้าเว็บร้าน (ปุ่ม 👤 / "สมัครสมาชิก" มุมขวาบน) ด้วย Google / LINE / Facebook / อีเมล
- ครั้งแรกที่เข้า = สมัครให้อัตโนมัติ · **แยกบัญชีต่อร้าน** (ลูกค้า Pixiedustie ≠ Louis Montini)
- สั่งซื้อแบบไม่สมัครยังได้เหมือนเดิม
- หน้า "บัญชีของฉัน" (`/account`): ออเดอร์ของฉัน · ที่อยู่ที่บันทึก (หลายที่ · ที่อยู่หลัก) · โปรไฟล์ (ชื่อ/เบอร์/รับข่าวสาร) · เพิ่มออเดอร์เก่าเข้าบัญชีด้วยเลขที่ + เบอร์
- หน้าชำระเงิน: สมาชิกได้ที่อยู่หลักเติมให้เอง · เลือกที่อยู่อื่นได้ · ติ๊กบันทึกที่อยู่ใหม่ · ออเดอร์ผูกกับบัญชี
- ERP แท็บ **👥 สมาชิก**: รายชื่อ · เข้าด้วยอะไร · จำนวนออเดอร์/ยอดซื้อ · ระงับ/เปิดบัญชี (ลง audit)

## ⚠️ ทำไมแยกจาก login พนักงาน
ตาราง ERP ~186 ตารางมี RLS ที่อนุญาต "ใครก็ได้ที่ล็อกอิน Supabase" → ถ้าลูกค้าล็อกอินระบบเดียวกับพนักงาน ลูกค้าจะอ่าน/แก้ตาราง ERP ได้
→ ลูกค้าล็อกอินที่เว็บร้าน (OAuth เอง · ไลบรารี arctic) · คุกกี้ของเว็บร้านเอง (`sf_member` เซ็นด้วย jose · httpOnly · 30 วัน)
→ เว็บร้านฝั่งเซิร์ฟเวอร์คุยกับ ERP `/api/storefront-member/*` ด้วยกุญแจภายใน (`STOREFRONT_INTERNAL_KEY`) เท่านั้น — ห้ามใช้ Supabase Auth กับลูกค้า

## ข้อมูล (migration 202610160100)
| ตาราง | |
|---|---|
| `store_customers` | สมาชิกต่อร้าน (อีเมลไม่ซ้ำในร้าน · status active/blocked/deleted) |
| `store_customer_identities` | วิธีเข้าสู่ระบบที่ผูก (google/line/facebook/password + รหัสจากผู้ให้บริการ) |
| `store_customer_addresses` | ที่อยู่จัดส่ง (สูงสุด 10 · ที่อยู่หลักได้ที่เดียว) |
| `store_orders.customer_id` | คอลัมน์ใหม่ (ว่าง = สั่งแบบไม่สมัคร) |

RLS เปิด ไม่มี policy (service role ผ่าน API เท่านั้น)

## กฎผูกบัญชี (lib/website-members.ts `resolveLogin` · มี test)
1. เคยเข้าด้วยวิธีนี้ → บัญชีเดิม
2. อีเมลที่ผู้ให้บริการ**ยืนยันแล้ว**ตรงกับสมาชิกเดิม → ผูกเข้าบัญชีเดิม — ถือว่ายืนยันแล้วเฉพาะ **Google** (`email_verified`)
3. ไม่เจอ → สร้างใหม่
- LINE / Facebook ส่งอีเมลมาก็ไม่ใช้ผูกอัตโนมัติ (กันสวมบัญชีด้วยอีเมลคนอื่น) — ผูกได้จากหน้าบัญชีตอนล็อกอินอยู่ (ขั้น M2)
- ออเดอร์เก่าที่อีเมลตรงกับอีเมลที่ยืนยันแล้ว "ตรงตัว" โชว์ในบัญชีด้วย (แค่อ่าน ไม่เขียนทับ · ⚠️ ห้ามเทียบด้วย ilike — "_" เป็นตัวแทน)

## ไฟล์
- ERP: `lib/website-members.ts` (กฎ) · `lib/website-members-db.ts` · `lib/storefront-internal.ts` (ด่านกุญแจ) · `app/api/storefront-member/{login,me,addresses,orders,order}` · `app/api/website/members` · `components/website-members-panel.tsx`
- เว็บร้าน: `src/lib/member/{config,session,erp,oauth,login-flow,types}.ts` · `src/app/api/auth/[provider]/{start,callback}` · `src/app/api/auth/logout` · `src/app/api/member/[...path]` (ทางผ่าน — อนุญาตเฉพาะเส้นที่ระบุ) · `src/app/account` · `src/components/account/*`

## 🔧 เปิดใช้แบบเดิม — env ใน Vercel (ไม่จำเป็นแล้ว · ดูหัวข้อ ⭐ อัปเดต 2026-10-28 · ค่าเป็นความลับ ห้ามส่งในแชท)
1. **สร้างกุญแจสุ่ม 2 ตัว** (ใช้ตัวสร้างรหัสผ่านของ password manager ยาว 64 ตัว):
   - `STOREFRONT_INTERNAL_KEY` — ตัวเดียวกันใส่ทั้ง ERP และทุกเว็บร้าน
   - `MEMBER_SESSION_SECRET` — ใส่เฉพาะเว็บร้าน (ร้านละค่าก็ได้)
2. **Google Cloud Console** → APIs & Services → OAuth consent screen (External · ชื่อแบรนด์ · โลโก้ · อีเมลติดต่อ) → Credentials → Create OAuth client ID (Web application)
   - Authorized redirect URIs: `https://<โดเมนร้าน>/api/auth/google/callback` เช่น `https://pixiedustie-store.vercel.app/api/auth/google/callback` · `https://louismontini.co.th/api/auth/google/callback`
   - ได้ `Client ID` + `Client secret`
3. **Vercel** → โปรเจกต์ ERP → Settings → Environment Variables → `STOREFRONT_INTERNAL_KEY`
   **Vercel** → โปรเจกต์เว็บร้านแต่ละร้าน → `STOREFRONT_INTERNAL_KEY` · `MEMBER_SESSION_SECRET` · `GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` → Redeploy
4. เปิดเว็บร้าน → ปุ่ม 👤 ขึ้นมุมขวาบน → ลองเข้าสู่ระบบ

ขาดตัวไหน = ปุ่มนั้นไม่ขึ้น · ไม่ครบเลย = ไม่มีไอคอน 👤 (หน้าเว็บเหมือนเดิม)

## 🟢 LINE Login (M2)
1. https://developers.line.biz → สร้าง Provider (ชื่อบริษัท) → Create channel → **LINE Login** → App type: Web app
2. แท็บ LINE Login → Callback URL: `https://<โดเมนร้าน>/api/auth/line/callback` (ใส่ได้หลายบรรทัด ร้านละบรรทัด)
3. (ไม่บังคับ) OpenID Connect → **Email address permission → Apply** (แนบลิงก์ `https://<โดเมนร้าน>/privacy` + ภาพหน้าจอขอความยินยอม) — ไม่ขอ = ได้แค่ชื่อ+รูป ไม่มีอีเมล (ใช้งานได้ปกติ)
4. (ไม่บังคับ) Basic settings → Linked LINE Official Account = OA ของร้าน → ตั้ง env `LINE_BOT_PROMPT=normal` = ชวนกดเพิ่มเพื่อน OA ตอนเข้าสู่ระบบ (ใช้ส่งแจ้งเตือนออเดอร์ทาง LINE ภายหลัง)
5. เปลี่ยนสถานะ channel จาก Developing → **Published**
6. Vercel เว็บร้าน: `LINE_CHANNEL_ID` · `LINE_CHANNEL_SECRET` → Redeploy

## 🔵 Facebook Login (M2)
1. https://developers.facebook.com → Create App → ใช้กรณี "Authenticate and request data from users with Facebook Login" (Consumer)
2. Facebook Login → Settings → **Valid OAuth Redirect URIs**: `https://<โดเมนร้าน>/api/auth/facebook/callback` (ร้านละบรรทัด)
3. App settings → Basic: App domains (โดเมนร้าน) · **Privacy Policy URL** `https://<โดเมนร้าน>/privacy` · **User data deletion → Data deletion instructions URL** `https://<โดเมนร้าน>/privacy#delete-account` · หมวดหมู่ · ไอคอนแอป
4. สิทธิ์ที่ใช้: `email`, `public_profile` (สิทธิ์มาตรฐาน ไม่ต้องรอตรวจ)
5. เปลี่ยน App Mode เป็น **Live** (ยังเป็น Development = ใช้ได้เฉพาะคนที่เพิ่มเป็นผู้ทดสอบในแอป)
6. Vercel เว็บร้าน: `FACEBOOK_APP_ID` · `FACEBOOK_APP_SECRET` → Redeploy
- โค้ดเรียก Facebook แบบไม่ระบุเวอร์ชัน (ตามเวอร์ชันที่ตั้งในแอป Meta — ไม่หมดอายุ) + `appsecret_proof` · ไลบรารี arctic ฝัง v16.0 ที่ปลดแล้ว จึงไม่ใช้กับ Facebook

## 🔗 เชื่อมหลายช่องทาง / 🗑 ลบบัญชี / 🔒 นโยบาย (M2)
- หน้าบัญชี → โปรไฟล์ → "ช่องทางเข้าสู่ระบบ": เชื่อม Google/LINE/Facebook เพิ่มเข้าบัญชีเดียวกัน (ตอนล็อกอินอยู่ = ยืนยันตัวแล้ว จึงผูกได้โดยไม่พึ่งอีเมล) · ยกเลิกได้แต่ต้องเหลือ ≥ 1 ช่องทาง
  - เว็บร้าน `/api/auth/<p>/start?link=1` → คุกกี้ `sf_oauth_link` → callback เรียก ERP `POST /api/storefront-member/link` · ช่องทางที่เป็นของสมาชิกอื่น = 409 (ไม่ย้ายให้เอง)
- ลบบัญชี (พิมพ์ "ลบบัญชี"): ERP `POST /api/storefront-member/delete` → ล้างชื่อ/อีเมล/เบอร์/รูป + ลบช่องทางและที่อยู่ + status deleted + audit · ออเดอร์เดิมเก็บไว้ (หลักฐานการขาย) · ออกจากระบบทันที · เข้าด้วยช่องทางเดิมอีก = บัญชีใหม่
- `/privacy` นโยบายความเป็นส่วนตัว (PDPA) ทุกร้าน ใส่ชื่อร้าน+ช่องทางติดต่อจากแท็บข้อมูลร้านให้เอง · ลิงก์ท้ายเว็บเสมอ · ⚠️ เป็นแม่แบบ — ควรให้ผู้รู้กฎหมายตรวจ

## 🔑 อีเมล + รหัสผ่าน (M3)
- สมัคร (/account/register) → ERP ส่งลิงก์ยืนยัน → เปิดลิงก์ (/account/verify) = ยืนยัน + เข้าสู่ระบบ · **ยังไม่ยืนยัน = เข้าด้วยรหัสไม่ได้**
- ลืมรหัส (/account/forgot) → ลิงก์ 30 นาที ใช้ครั้งเดียว → ตั้งรหัสใหม่ (/account/reset) = ถือว่ายืนยันอีเมลแล้ว + ปลดล็อก · ใช้ตั้งรหัสให้บัญชีที่สมัครด้วย Google/LINE/FB ได้ด้วย
- หน้าบัญชี → โปรไฟล์: ตั้ง/เปลี่ยนรหัส (มีรหัสเดิม = ต้องใส่) · ยกเลิกช่องทาง "อีเมล" = ลบรหัสผ่านด้วย
- กติกา: ≥ 8 ตัว มีตัวอักษร+ตัวเลข · ผิด 5 ครั้ง ล็อก 15 นาที · ส่งอีเมลได้ ≤ 3 ครั้ง/ชม./คน · ข้อความผิดพลาดไม่บอกว่าอีเมลนี้มีบัญชีไหม
- ⚠️ กันสวมบัญชี: บัญชีที่ยังไม่ยืนยันอีเมล ห้ามผูกกับ Google อัตโนมัติ · เจ้าของอีเมลตัวจริงเข้าด้วย Google = ได้อีเมลนั้น บัญชีค้างถูกปลดอีเมล+ช่องทางรหัส · สมัครซ้ำตอนยังไม่ยืนยัน = ลิงก์เก่าใช้ไม่ได้
- ไฟล์: ERP `lib/member-password.ts` (scrypt + โทเคน sha256) · `lib/email.ts` (ของกลางส่งอีเมล · Resend) · `lib/member-emails.ts` (แม่แบบ) · `app/api/storefront-member/password` (action register/resend/verify/login/forgot/reset/change) · migration 202610170100 (store_customer_tokens + failed_login_count/locked_until)
  เว็บร้าน `/api/auth/password` · `src/components/account/EmailAuthForms.tsx` · `AuthCard.tsx` · หน้า /account/{register,forgot,reset,verify}

### 🔧 เปิดใช้ (เจ้าของร้าน)
1. สมัคร https://resend.com (ฟรี 3,000 ฉบับ/เดือน) → **Domains → Add domain** (โดเมนของบริษัท เช่น `louismontini.co.th` — โดเมน `*.vercel.app` ยืนยันไม่ได้) → ใส่ DNS (SPF/DKIM) ที่ผู้ให้บริการโดเมน → รอ Verified
2. Resend → API Keys → Create (สิทธิ์ Sending)
3. Vercel **ERP**: `RESEND_API_KEY` · `EMAIL_FROM` = `no-reply@<โดเมนที่ยืนยันแล้ว>` (ทุกร้านใช้ที่อยู่นี้ · ชื่อผู้ส่ง = ชื่อร้านให้เอง)
4. Vercel **เว็บร้าน**: `MEMBER_EMAIL_LOGIN=1` → Redeploy (ฟอร์มอีเมลขึ้นหน้าเข้าสู่ระบบ)
- ลิงก์ในอีเมลชี้โดเมนร้านที่อยู่ใน shop_domains เท่านั้น (เพิ่มโดเมนใหม่ต้องลงทะเบียนก่อน)

## ⭐ แต้มสะสม + ระดับสมาชิก (M4)
- **ได้แต้ม**: ออเดอร์ของสมาชิกเปลี่ยนเป็น "สำเร็จ" (ERP แท็บ 🧾 ออเดอร์) → `floor(ยอดสินค้าหลังส่วนลด+แต้ม ÷ บาทต่อแต้ม) × ตัวคูณระดับ` (ไม่นับค่าส่ง · ตัวคูณ = ระดับ "ก่อน" ออเดอร์นี้)
- **เรียกคืน/คืนแต้ม**: สำเร็จแล้วถอยสถานะ / ยกเลิก = เรียกแต้มที่ได้คืน · ยกเลิก = คืนแต้มที่ใช้ตอนสั่ง · เรียกซ้ำไม่บวกซ้ำ (เทียบยอดในสมุดแต้มของออเดอร์นั้น)
- **ใช้แต้ม**: หน้าชำระเงิน (สมาชิก) กล่อง "⭐ ใช้แต้ม" → ERP ตรวจ + ตัดแต้มแบบล็อกแถว (สั่ง 2 ออเดอร์พร้อมกันใช้แต้มก้อนเดียวกันซ้ำไม่ได้ — ไม่พอ = ยกเลิกออเดอร์นั้นทั้งใบ บอกให้ลองใหม่) · ลดหลังคูปอง · เพดาน % ของยอดสินค้า · ขั้นต่ำต่อครั้ง
- **ระดับ**: ยอดซื้อ 12 เดือน (ออเดอร์สำเร็จ ไม่รวมค่าส่ง) ≥ ยอดขั้นต่ำ → ระดับสูงสุดที่ถึง · ไม่ตั้งระดับ = ไม่มีระดับ (ทุกคน ×1)
- **ผูกออเดอร์เก่า** (หน้าบัญชี) ที่สำเร็จภายใน 12 เดือน = ได้แต้มย้อนหลัง
- ตั้งค่า: ERP แท็บ 🏪 ข้อมูลร้าน กลุ่ม ⭐ (`points_*` · ตรวจค่าตอนบันทึก) · ระดับ: แท็บ 👥 สมาชิก ปุ่ม "⭐ ระดับสมาชิก" · ปรับแต้มเอง: กดตัวเลขแต้มในตาราง (ต้องมีเหตุผล · หักจนติดลบไม่ได้ · audit `store_customer_points`)
- ปิดแต้มทีหลัง: แต้มเดิมไม่หาย (หน้าบัญชียังเห็น) · ได้/ใช้เพิ่มไม่ได้ · ยกเลิกออเดอร์ยังคืนแต้มที่ใช้
- ข้อมูล (migration 202610180100 + 0200): `store_point_ledger` (สมุดแต้ม บวก/ลบ ห้ามแก้ย้อนหลัง) · `store_member_tiers` · `store_orders.points_used/points_discount/points_earned` · ฟังก์ชัน DB `store_points_redeem/_apply/_adjust` (ล็อกแถว) + `store_member_stats` (สรุปต่อสมาชิกคิดใน DB — ไม่ดึงแถวมารวมในแอป เพราะติดเพดาน 1,000 แถว) · เรียกได้เฉพาะ service role
- ไฟล์: ERP `lib/member-points.ts` (กฎ · มี test) · `lib/member-points-db.ts` (`syncOrderPoints` · มี test ฐานข้อมูลจำลอง) · `app/api/storefront-member/points` · `app/api/website/members/{points,tiers}` · `components/website-member-points.tsx`
  เว็บร้าน `src/lib/member/points.ts` (ตัวเลขล่วงหน้า — สูตรเดียวกัน ERP เป็นคนคิดจริง) · `src/components/checkout/PointsBox.tsx` · แท็บ ⭐ ใน `AccountClient.tsx`
- ยังไม่มี: แต้มหมดอายุ (`expire` สำรองไว้) · แจ้งเตือนเลื่อนระดับ

## 🎟️❤️ คูปองเฉพาะสมาชิก + รายการโปรด (M5)
- คูปองเฉพาะสมาชิก/ระดับ: ดู docs/website-coupons.md หัวข้อ M5 · หน้าบัญชีแท็บ 🎟️ คูปอง (มีคูปองสมาชิกถึงจะโชว์) · ปุ่มลัดในช่องโค้ดตอนชำระเงิน
- ❤️ รายการโปรด: ปุ่มหัวใจบนการ์ดสินค้า (มุมล่างขวารูป · โผล่ตอนชี้ · มือถือโชว์ตลอด) + หน้าสินค้า (ทั้งแบบ classic และ showcase · มือถืออยู่ในแถบลอยล่าง) · ยังไม่เข้าสู่ระบบ กด = ไปหน้าเข้าสู่ระบบแล้วกลับมาหน้าเดิม · ร้านปิดระบบสมาชิก = ไม่มีหัวใจ
  - ข้อมูล `store_wishlists` (1 คน 1 รุ่น · ลบสมาชิก/สินค้า = ลบตาม · สูงสุด 200 ชิ้น/คน · กดได้เฉพาะสินค้าที่เปิดขายในร้าน) · ERP `/api/storefront-member/wishlist` (GET/POST/DELETE)
  - เว็บร้าน: `src/lib/member/wishlist.tsx` (WishlistProvider ครอบทั้งเว็บใน layout · กดแล้วเห็นผลทันที บันทึกไม่ได้ = คืนค่า) · `src/components/shop/WishlistHeart.tsx` · แท็บ ❤️ ในหน้าบัญชี (กดหัวใจออก = หายจากรายการ)
- ยังไม่มี: รายงาน "สินค้าที่ถูกกดใจมากสุด" ใน ERP · แจ้งเตือนเมื่อสินค้าในรายการโปรดลดราคา

## 🎁🎯⬇️ สิทธิ์ระดับ · กลุ่มลูกค้า · สำเนาข้อมูล (ชุด 6 · 2026-10-22)
- **🎁 สิทธิ์ตามระดับ**: ปุ่ม "⭐ ระดับสมาชิก" → คอลัมน์ **ลด %** (0–50) + **ส่งฟรี** ต่อระดับ (migration `202610291800_store_member_tier_perks` · ค่าเริ่ม = ไม่มีสิทธิ์)
  - ใช้กับสมาชิกที่ล็อกอินสั่ง **ขณะร้านเปิดระบบแต้ม** · ลด % จากยอดหลังโปรโมชัน ก่อนคูปอง (คูปอง % คิดต่อจากยอดนี้) · ส่งฟรี = ค่าส่ง 0 (ค่าเก็บปลายทางยังคิด)
  - ERP คิดจริงที่ `createStorefrontOrder` (`memberTierNow` + `tierPerkDiscount`) → บันทึกเป็นบรรทัดใน `promos` (id `member:<ระดับ>` · ชื่อ "สิทธิ์สมาชิก X −N%") · เว็บร้านโชว์สูตรเดียวกัน (`tierPerkBaht` ใน `src/lib/member/types.ts`) ที่หน้าชำระเงิน + แท็บแต้มในหน้าบัญชี
  - เทสต์: `lib/__tests__/member-tier-perks.test.ts` (สั่งซื้อจริงทั้งเส้นด้วย fake-db)
- **🎯 กลุ่มลูกค้า** (แท็บ 👥): ปุ่มกรอง ทั้งหมด · 📬 รับข่าวสาร · 🔁 ซื้อซ้ำ (≥2) · 🆕 ยังไม่เคยซื้อ · 💤 ห่างหาย 90 วัน · ⭐ ตามระดับ (`lib/website-member-segments.ts`)
  - **⬇️ ส่งออก CSV** ของกลุ่มที่เลือก → `POST /api/website/members/export` (products.edit) · **ส่งออกเฉพาะคนที่ยินยอมรับข่าวสาร** (ตัดฝั่งเซิร์ฟเวอร์) · บันทึก audit (กลุ่ม/จำนวน/ที่ข้ามเพราะไม่ยินยอม) · ไฟล์มี BOM เปิดใน Excel ภาษาไทยถูก · กันสูตร Excel
  - "ห่างหาย" ใช้วันสั่งล่าสุดที่ไม่ยกเลิก (`lastOrderDates` ใน lib/website-members-db)
- **⬇️ สำเนาข้อมูลของฉัน (PDPA)**: หน้าบัญชี › โปรไฟล์ → "ดาวน์โหลดข้อมูลของฉัน" → ไฟล์ JSON (บัญชี · ที่อยู่ · ออเดอร์+รายการ · ประวัติแต้ม · รีวิว · สินค้าที่ถูกใจ) · ERP `/api/storefront-member/export` · บันทึก audit (ผู้ทำ = สมาชิกเอง) · ไม่มีรหัสภายในของ Google/LINE/Facebook หรือรหัสผ่าน
- **👤 ประวัติลูกค้าหน้าเดียว**: กดแถวสมาชิก → ดู docs/website-customer-profile.md
- **🎁 ชวนเพื่อน**: ERP › 🏪 ข้อมูลร้าน › กลุ่ม 🎁 (เปิด · เพื่อนได้ลดกี่บาท · ยอดขั้นต่ำ · คนชวนได้กี่แต้ม) — ค่าเริ่ม = ปิด
  - สมาชิกเห็นโค้ดของตัวเอง (F + 6 ตัว) ที่หน้าบัญชี › โปรไฟล์ → คัดลอกโค้ด/ลิงก์ · แชร์ LINE · เห็นจำนวนเพื่อนที่ใช้ + แต้มที่ได้
  - ลิงก์ `/?ref=โค้ด` → เว็บจำโค้ดไว้ (`RefCapture`) → ช่องโค้ดตอนชำระเงินเติมให้เอง
  - โค้ด = แถวใน `store_coupons` ที่มี `referrer_id` → ใช้ระบบคูปองเดิม (ลูกค้าใหม่เท่านั้น · 1 เบอร์ครั้งเดียว) · มูลค่า/ขั้นต่ำอ่านจากที่ตั้งร้านตอนตรวจ (`referralCoupon`) · ใช้โค้ดตัวเองไม่ได้ (บัญชี/เบอร์เดียวกัน) · แท็บคูปองไม่โชว์โค้ดพวกนี้
  - ออเดอร์ของเพื่อนเปลี่ยนเป็น "สำเร็จ" → คนชวนได้แต้ม ครั้งเดียวต่อออเดอร์ (`rewardReferral` จองสิทธิ์ด้วย `store_coupon_redemptions.referral_points` ก่อนบวกแต้ม) · ต้องเปิดระบบแต้ม · ยกเลิกทีหลังไม่ดึงแต้มคืนอัตโนมัติ (ปรับแต้มเองได้)
  - migration `202610291900_store_referrals` · `lib/website-referral.ts` · `lib/website-referral-db.ts` · `/api/storefront-member/referral` · เทสต์ `website-referral.test.ts`

## เครื่อง dev
`.env.local` ของเว็บร้าน: `MEMBER_DEV_LOGIN=1` + `MEMBER_ERP_BASE=http://localhost:3032` + `MEMBER_EMAIL_LOGIN=1` · ERP: `EMAIL_DEV_ECHO=1` (ไม่ส่งอีเมลจริง — ลิงก์โผล่ในหน้าจอเป็น "(dev) ลิงก์ในอีเมล") → ปุ่ม "ทดสอบ (เครื่อง dev)" (ใช้ได้เฉพาะ NODE_ENV=development บน localhost) · ⚠️ dev ต่อฐานข้อมูลจริง — ลบบัญชีทดสอบ (`zz-dev@example.test`) หลังทดสอบ · ห้ามสร้างออเดอร์ทดสอบจริง

## ขั้นถัดไป
✅ M1–M5 ครบ · ต่อได้: แต้มหมดอายุ · แจ้งเตือนเลื่อนระดับ · รายงานสินค้ายอดฮิตในรายการโปรด · คูปองวันเกิด

## 🎂 คูปองวันเกิด (2026-10-28)
- **ตั้งค่า:** ERP › ข้อมูลร้าน › 🎂 คูปองวันเกิดสมาชิก — เปิด/ปิด · ลด % (มีเพดานบาทได้) หรือ ลดเป็นบาท · ยอดขั้นต่ำ
- **ลูกค้า:** ใส่วันเกิด (วัน + เดือน ไม่เก็บปี) ในหน้าบัญชี › โปรไฟล์ได้ **ครั้งเดียว** · ร้านแก้/ล้างให้ได้ที่ ERP › สมาชิก (กด 🎂 ใต้ชื่อ · บันทึกประวัติ)
- **ออกคูปอง:** สมาชิกเปิดหน้าบัญชีในเดือนเกิด → ได้โค้ด `BD` + 6 ตัว ใช้ได้ทั้งเดือนเกิด (เวลาไทย) 1 ครั้ง · 1 คน 1 ใบต่อปี (ดัชนี `store_coupons_birthday_uidx`) · สมาชิกทดลองไม่ได้
- **ความปลอดภัย:** `store_coupons.owner_id` = เจ้าของคนเดียว — คนอื่นใส่โค้ดได้ผลเหมือน "ไม่พบโค้ด" · ลูกค้าที่ยังไม่เข้าสู่ระบบ = บอกให้เข้าสู่ระบบก่อน (lib/website-coupons-db checkCoupon) · ไม่โชว์ในแท็บคูปอง ERP
- **มูลค่า** อ่านจากที่ตั้งร้านตอนตรวจเสมอ (เปลี่ยนส่วนลด/ปิด = ทุกใบตาม) — กฎ `lib/website-birthday.ts` · ฐานข้อมูล `lib/website-birthday-db.ts` · migration `202611060200_member_birthday_coupon`
- เว็บร้าน: แบนเนอร์ 🎂 บนหน้าบัญชีเมื่อมีคูปองวันเกิดที่ยังไม่ใช้ (ชิ้นส่วน `acc.bday`) · ป้ายในแท็บคูปอง · เปิดพลุฉลอง = ยิงพลุปีละครั้งต่อเครื่อง
