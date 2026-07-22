-- RLS remediation เฟส 4b: subscriptions/subscription_invoices — แอปแยกเลิกใช้ ERP เข้าผ่าน service_role
-- ลบ policy anon ALL USING(true) → เหลือ service_role เท่านั้น · anon อ่าน/แก้/ลบไม่ได้อีก
drop policy if exists "public_all" on public.subscriptions;
drop policy if exists "public_all" on public.subscription_invoices;
