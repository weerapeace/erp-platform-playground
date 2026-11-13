-- แอปของแบรนด์เอง ต่อ (แบรนด์ × แพลตฟอร์ม) — 2026-11-13
-- เหตุ: Lazada แอปแบบ "Seller In-house" ใช้กับร้านอื่นไม่ได้ถ้าไม่อยู่ใน whitelist → Louis Montini สมัครแอปของตัวเอง
--       เดิมระบบรู้จักแอปเดียว (env LAZADA_APP_KEY/SECRET) → ต้องเก็บกุญแจแอปแยกต่อแบรนด์
-- แยกคอลัมน์ (ไม่ใส่ใน meta) เพราะ meta ถูกเขียนทับทั้งก้อนทุกครั้งที่เชื่อม/ต่ออายุ/ตัดการเชื่อมต่อ และ meta ถูกส่งไปหน้าเว็บบางจุด
-- ตาราง platform_credentials เปิด RLS ไม่มี policy (service role อ่านได้อย่างเดียว) → คอลัมน์ใหม่ได้การป้องกันเดียวกับ token
-- เพิ่มคอลัมน์อย่างเดียว ไม่แตะข้อมูลเดิม · ว่าง = ใช้แอปกลาง (env) เหมือนเดิมทุกอย่าง

alter table public.platform_credentials add column if not exists app_key text;
alter table public.platform_credentials add column if not exists app_secret text;

comment on column public.platform_credentials.app_key is 'App Key ของแอปที่แบรนด์สมัครเอง (เช่น Lazada) · null = ใช้แอปกลางจาก env';
comment on column public.platform_credentials.app_secret is 'App Secret ของแอปแบรนด์ — เข้ารหัสด้วย secret-box (enc:v1:) ห้ามเก็บแบบอ่านออก · ไม่ส่งกลับทาง API';
