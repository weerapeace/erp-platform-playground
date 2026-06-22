# ขึ้น Vercel — คู่มือตั้งค่า (สาขา feat/host-portable)

สาขานี้ทำให้แอปรันได้ทั้งบน **Cloudflare เดิม** และ **Vercel/เซิร์ฟเวอร์ทั่วไป** โดยไม่ต้องแก้โค้ดอีก
หลักการ: ถ้าอยู่บน Cloudflare → ใช้ binding เหมือนเดิม · ถ้าอยู่นอก Cloudflare (Vercel) → ใช้ S3 API + REST API แทน
(เปิดทำงานก็ต่อเมื่อตั้ง env ครบ — ไม่ตั้งก็ไม่กระทบของเดิม)

## env ที่ต้องตั้งบน Vercel

### 1) ค่าเดิมทั้งหมด (คัดลอกจากไฟล์ `.env` ที่ repo root)
ใส่ทุกตัวที่ใช้อยู่ปัจจุบัน เช่น `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, ฯลฯ
(Supabase ไม่เปลี่ยน — ใช้โปรเจกต์เดิม)

### 2) ค่าใหม่สำหรับเข้าถึงรูป R2 ผ่าน S3 API
สร้าง **R2 API Token** ใน Cloudflare dashboard → R2 → *Manage R2 API Tokens* → Create (สิทธิ์ Object Read & Write)

| ชื่อ env | ค่า |
|---|---|
| `R2_ACCOUNT_ID` | Account ID ของ Cloudflare (เลขชุดยาวบนหน้า R2) |
| `R2_ACCESS_KEY_ID` | Access Key ID ที่ได้จากตอนสร้าง token |
| `R2_SECRET_ACCESS_KEY` | Secret Access Key ที่ได้ตอนสร้าง token (โชว์ครั้งเดียว) |
| `R2_BUCKET` | `odoo-product-images` (รูปสินค้า/แนบไฟล์) |
| `R2_SHARE_BUCKET` | `china-pay-share` (รูปแชร์ LINE) |

### 3) ค่าใหม่สำหรับ OCR สลิป + แปลภาษา (Workers AI ผ่าน REST)
สร้าง **API Token** ใน Cloudflare dashboard → My Profile → API Tokens → Create
สิทธิ์: *Account → Workers AI → Read* (หรือ Run)

| ชื่อ env | ค่า |
|---|---|
| `CF_ACCOUNT_ID` | Account ID ของ Cloudflare (ตัวเดียวกับ R2_ACCOUNT_ID) |
| `CF_AI_API_TOKEN` | API Token ที่สร้าง (สิทธิ์ Workers AI) |

## ตั้งค่าโซน (region) ให้ใกล้ฐานข้อมูล
Supabase อยู่โตเกียว (`ap-northeast-1`) → ตั้ง Vercel Function Region เป็น **Tokyo (hnd1)** หรือ Singapore (sin1)
(Project Settings → Functions → Region)

## ข้อควรรู้
- **รูปไม่ต้องย้าย** — ยังอยู่ใน R2 ที่เดิม แค่เปลี่ยนวิธีเข้าถึง
- `/api/r2-image` เป็น proxy รูปแบบไม่ต้อง login (เดิมมี Cloudflare Access กันหน้าบ้าน) — บน Vercel จะเปิด public; ถ้าต้องการกันให้คุยเรื่องใส่ auth ทีหลังได้
- งานเบื้องหลัง (`lib/jobs.ts`) บน Vercel จะรันให้จบก่อนตอบ (ไม่มี `waitUntil` ของ CF) — ทำงานถูกต้อง แค่บางปุ่มตอบช้าขึ้นเล็กน้อย; ปรับใช้ `waitUntil` ของ Vercel ได้ทีหลังถ้าจำเป็น
- ของเดิมบน Cloudflare ใช้งานได้ตลอด ไม่กระทบ (สาขานี้ไม่ได้ merge เข้า main)

## ทดสอบหลัง deploy
1. เปิดหน้าเว็บ — ควรเร็ว < 0.5 วิ
2. เปิดหน้าที่มีรูปสินค้า — รูปต้องขึ้น (พิสูจน์ R2 S3 ทำงาน)
3. ลองอัปโหลดไฟล์แนบ 1 ไฟล์ — ต้องสำเร็จ
4. ลอง OCR สลิป 1 ใบ — ต้องอ่านยอดได้ (พิสูจน์ AI REST ทำงาน)
