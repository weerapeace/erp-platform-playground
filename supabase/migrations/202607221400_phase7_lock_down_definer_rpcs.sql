-- เฟส 7 (ความปลอดภัย): ปิดช่อง SECURITY DEFINER RPC ที่ anon/public เรียกตรงได้
-- ปัญหา: RPC เหล่านี้เป็น DEFINER (ข้าม RLS) + เคย grant ถึง PUBLIC/anon
--        → ใครก็ได้ (แม้ไม่ล็อกอิน) เรียกผ่าน anon key แล้วเห็นข้อมูลเงิน/สรุปได้
-- แก้: จำกัดสิทธิ์ EXECUTE ให้แคบลง (API เป็นด่านตรวจ admin แล้วเรียกผ่าน service role)

-- (ก) RPC การเงินเฉพาะแอดมิน → เหลือเฉพาะ service_role (API เช็ก erp_can('admin.users') ก่อน)
revoke execute on function public.erp_admin_dept_overview()       from public, anon, authenticated;
revoke execute on function public.erp_monthly_report(date)        from public, anon, authenticated;

-- (ข) RPC ที่ผู้ใช้ทุกคน (ที่ล็อกอิน) เห็นได้ → ตัด anon/public เหลือ authenticated
revoke execute on function public.erp_calendar_events(date, date) from public, anon;

-- (ค) อุดรูเดิม (pre-existing): ตัด anon/public — API ยังใช้ authenticated เรียกได้เหมือนเดิม
revoke execute on function public.erp_executive_summary()         from public, anon;
revoke execute on function public.erp_dashboard_metrics()         from public, anon;
