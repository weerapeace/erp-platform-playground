-- เชื่อมบัญชีผู้ใช้ระบบ ↔ พนักงาน (1 บัญชี → 1 พนักงาน) — additive
-- (applied via MCP apply_migration: user_profiles_employee_link)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;
