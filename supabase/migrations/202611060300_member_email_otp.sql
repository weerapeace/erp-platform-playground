-- ✉️ สมาชิกเข้าสู่ระบบด้วย "อีเมล + รหัส 6 หลัก" (2026-10-29 · เจ้าของเลือกแบบ A + B)
-- ใช้ตารางโทเคนเดิม store_customer_tokens (เก็บแค่ sha256 · ใช้ได้ครั้งเดียว · หมดอายุ 10 นาที) — เพิ่มชนิด 'otp' อย่างเดียว ไม่แตะข้อมูลเดิม
-- hash = sha256("otp:<customer_id>:<รหัส>") (ผูกกับคน — รหัส 6 หลักซ้ำกันข้ามคนได้ ไม่ชน unique) · เดาผิด 5 ครั้ง = ล็อก 15 นาที (คอลัมน์เดิม failed_login_count/locked_until)
alter table public.store_customer_tokens drop constraint if exists store_customer_tokens_kind_check;
alter table public.store_customer_tokens add constraint store_customer_tokens_kind_check check (kind in ('verify', 'reset', 'trial_login', 'otp'));
