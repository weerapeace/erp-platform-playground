-- RLS remediation เฟส 4a: 2 ตารางที่ ERP เข้าผ่าน service_role เท่านั้น — ลบ policy public USING(true)
-- RLS ยังเปิด → เหลือ service_role (bypassrls) เข้าได้ · anon/authenticated ตรง ๆ ถูกปิด
drop policy if exists "read product_costings" on public.product_costings;
drop policy if exists "read parent_sku_issues" on public.parent_sku_issues;
