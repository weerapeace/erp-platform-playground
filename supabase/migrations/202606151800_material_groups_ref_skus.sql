-- Design Sheets — Group cost (เฟส 2): สินค้าตัวแทน (SKU จัดซื้อ) ต่อกลุ่มวัสดุ
-- ใช้ดึง "ราคาซื้อจริงล่าสุด" (goods_receipt_lines_v2 → purchase_order_lines_v2.price_est, ตามวันที่รับ)
-- (applied via MCP apply_migration: material_groups_ref_skus) — additive
ALTER TABLE public.material_groups
  ADD COLUMN IF NOT EXISTS ref_sku_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
