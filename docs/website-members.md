# 👤 ระบบสมาชิกเว็บร้าน (ลูกค้า login)

## ใช้ทำอะไร
ลูกค้าเข้าสู่ระบบที่หน้าเว็บร้าน (ปุ่ม 👤 มุมขวาบน) ด้วย Google (ขั้น M1) — LINE / Facebook / อีเมล ตามมาในขั้นถัดไป
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

## 🔧 เปิดใช้ (เจ้าของร้านทำเอง — ค่าเป็นความลับ ห้ามส่งในแชท)
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

## เครื่อง dev
`.env.local` ของเว็บร้าน: `MEMBER_DEV_LOGIN=1` + `MEMBER_ERP_BASE=http://localhost:3032` → ปุ่ม "ทดสอบ (เครื่อง dev)" (ใช้ได้เฉพาะ NODE_ENV=development บน localhost) · ⚠️ dev ต่อฐานข้อมูลจริง — ลบบัญชีทดสอบ (`zz-dev@example.test`) หลังทดสอบ · ห้ามสร้างออเดอร์ทดสอบจริง

## ขั้นถัดไป
M2 LINE + Facebook + เชื่อมบัญชีเพิ่มจากหน้าบัญชี + หน้านโยบายความเป็นส่วนตัว + ลบบัญชี · M3 อีเมล+รหัสผ่าน (ต้องมีบริการส่งอีเมล) · M4 แต้ม/ระดับสมาชิก · M5 คูปองเฉพาะสมาชิก + รายการโปรด
