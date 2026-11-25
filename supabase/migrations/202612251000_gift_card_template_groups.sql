-- แม่แบบการ์ด: กลุ่ม + แก้แม่แบบในตัวได้ (เจ้าของเลือก widget 2026-11-25 รอบ 2 ข้อ 1-2)
--   group_name       = ชื่อกลุ่ม เช่น "การ์ดวันเกิด" (ว่าง = "ไม่มีกลุ่ม") · ลำดับในกลุ่มใช้ sort_order เดิม
--   replaces_builtin = แม่แบบนี้คือฉบับแก้ของแม่แบบในตัว (เช่น builtin:bday) → ซ่อนตัวในตัว · ลบ (ถังขยะ) = คืนค่าเดิม
alter table public.gift_card_templates add column if not exists group_name text;
alter table public.gift_card_templates add column if not exists replaces_builtin text;
create index if not exists gift_card_templates_replaces_idx on public.gift_card_templates (replaces_builtin) where deleted_at is null and replaces_builtin is not null;
