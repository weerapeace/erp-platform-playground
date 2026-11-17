-- =====================================================================
-- 🔒 view employee_options ให้เคารพสิทธิ์ของคนที่ดู (security_invoker) — audit 2026-11-17
-- เดิมเป็น SECURITY DEFINER (Supabase เตือนระดับ ERROR) = ข้ามด่าน RLS ของตาราง employees
-- ไม่มีโค้ดใช้ view นี้ (ค้นแล้ว 2026-11-17) · anon ถูกถอนไปแล้วใน S6
-- ย้อนกลับ: alter view public.employee_options set (security_invoker = false);
-- =====================================================================
alter view public.employee_options set (security_invoker = true);
revoke insert, update, delete, truncate, references, trigger on public.employee_options from authenticated;
