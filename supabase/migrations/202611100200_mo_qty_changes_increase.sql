-- 📈 เปลี่ยนจำนวนใบสั่งผลิต: รองรับ "ทำได้มากกว่าสั่ง" ด้วย (เดิมเก็บแค่ลดจำนวน)
-- add = เพิ่มในใบนี้ (จำนวนสั่งเพิ่ม) · extra = แยกส่วนเกินเป็นใบใหม่ (ใบนี้คงเดิม · to_qty = จำนวนรวมที่ทำ)
-- แก้แค่เงื่อนไขของช่อง mode — ไม่แตะข้อมูลเดิม

alter table public.mo_qty_changes drop constraint if exists mo_qty_changes_mode_check;
alter table public.mo_qty_changes add constraint mo_qty_changes_mode_check check (mode in ('split', 'drop', 'add', 'extra'));
