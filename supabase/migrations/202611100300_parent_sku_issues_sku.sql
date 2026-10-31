-- ปัญหาของสินค้า: จด "เฉพาะสีนี้" ได้ (เจ้าของขอ 2026-10-31)
-- sku = null → ปัญหาของทั้งรุ่น (ทุกสี — แบบเดิม) · sku = รหัสลูก → เกิดเฉพาะสี/ตัวเลือกนั้น
-- แถวเดิมทั้งหมดยังเป็นของทั้งรุ่น (null) ไม่มีอะไรเปลี่ยน
alter table parent_sku_issues add column if not exists sku text;
create index if not exists idx_parent_sku_issues_parent_sku on parent_sku_issues(parent_sku_id, sku) where is_active;
