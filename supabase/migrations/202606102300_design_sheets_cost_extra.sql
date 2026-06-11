-- ค่าใช้จ่ายเพิ่มต่อใบงาน (ค่าแรง/โสหุ้ย/อื่นๆ) แบบยืดหยุ่น — รายการเพิ่ม/ลบ/ตั้งชื่อเองได้
-- รันแล้วบน Supabase ผ่าน MCP apply_migration (design_sheets_cost_extra) 2026-06-11
-- เก็บเป็น jsonb array: [{ "label": "ค่าแรงผลิต", "amount": 118.83 }, ...]
alter table design_sheets add column if not exists cost_extra jsonb not null default '[]'::jsonb;
