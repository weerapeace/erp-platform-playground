-- ============================================================
-- O10 (audit แอปจัดการงาน 2026-10-21): ปิดสิทธิ์ "อ่าน/แก้ตรงจาก DB" ของตารางใบออกแบบ (มีต้นทุน/ราคาซัพพลายเออร์/แบ่งกำไร)
-- ปัญหา: policy authenticated USING(true) → ใครล็อกอินก็ยิง REST อ่านต้นทุนได้ + design_sheet_supplier_lines แก้ได้ตรง (ไม่ผ่าน API ไม่มีประวัติ)
-- ทำไมปิดได้: ทุกจุดในระบบอ่าน/เขียนผ่าน API ฝั่ง server (supabaseAdmin) · ไม่มี realtime postgres_changes · ไม่มีหน้าเว็บอ่านตรง
-- ผล: authenticated/anon อ่าน/เขียนตารางเหล่านี้ตรง ๆ ไม่ได้ (RLS เปิด ไม่มี policy) · API ใช้ service role ทำงานตามเดิม
-- ✅ รันบน DB แล้ว 2026-10-21 (เจ้าของอนุมัติ) · ตรวจ: authenticated อ่านได้ 0 แถว
-- ย้อนกลับ: สร้าง policy เดิมคืน (ดูชื่อด้านล่าง) เช่น
--   create policy design_sheets_select on public.design_sheets for select to authenticated using (true);
--   create policy authenticated_all on public.design_sheet_supplier_lines for all to authenticated using (true) with check (true);
-- ============================================================
drop policy if exists design_sheets_select on public.design_sheets;
drop policy if exists design_sheet_comments_select on public.design_sheet_comments;
drop policy if exists design_sheet_cost_lines_select on public.design_sheet_cost_lines;
drop policy if exists design_sheet_cost_snapshots_select on public.design_sheet_cost_snapshots;
drop policy if exists design_sheet_quotes_select on public.design_sheet_quotes;
drop policy if exists authenticated_all on public.design_sheet_supplier_lines;
