-- คอนเทนต์: ผูก Parent SKU ได้ด้วย (นอกจาก SKU เดี่ยว) — ใช้ดึง "สีที่มี" จาก SKU ลูกทั้งหมด
alter table erp_creative_content add column if not exists parent_sku_id uuid references parent_skus_v2(id);
