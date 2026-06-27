-- งานย่อย: เก็บ "ปลายทางรูป" ที่ผู้ส่งงานติ๊กเลือกในป๊อปอัปส่งงาน
-- (Parent SKU/SKU ที่จะดันรูปเข้าแกลเลอรีตอน approve)
-- รูปแบบ: { "parent_ids": ["..."], "sku_ids": ["..."] } · null/ว่าง = ไม่ดันเข้าสินค้า (แนบรูปปกติ)
ALTER TABLE erp_creative_subtasks
  ADD COLUMN IF NOT EXISTS image_sync_targets jsonb;

COMMENT ON COLUMN erp_creative_subtasks.image_sync_targets IS
  'ปลายทางรูปที่เลือกตอนส่งงาน {parent_ids:[],sku_ids:[]} — approve แล้วดันรูปเข้าแกลเลอรีของตัวที่เลือก (ว่าง=ไม่ดัน)';
