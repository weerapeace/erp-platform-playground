-- 👁 ใครเห็นเมนูไหน (เจ้าของขอ 2026-10-19 "อยากให้ตั้งได้ว่าใครจะเห็น APP อะไรบ้าง")
-- audience = { roles?: text[], users?: uuid[], hide_users?: uuid[] } · null/ว่าง = ทุกคน (ตามสิทธิ์ permission_key เดิม)
-- เป็นการ "ซ่อน/โชว์ในเมนู" เท่านั้น — กันเข้าจริงยังใช้สิทธิ์ตำแหน่ง (permission_key / app lock) เหมือนเดิม
alter table public.erp_menu_items add column if not exists audience jsonb;
