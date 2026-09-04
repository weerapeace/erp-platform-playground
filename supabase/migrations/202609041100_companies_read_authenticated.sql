-- ตาราง companies: ให้ทุกคนที่ล็อกอินอ่านได้ (ใช้เป็นตัวเลือก "บริษัท" ในเงินกู้/OD/หัวบิล/ใบขาย)
-- ปัญหา (2026-09-04): เดิมมีแต่ policy ของ payroll role (has_payroll_role) ซึ่งยังไม่มีใครถูกตั้งใน user_roles
-- → /api/admin/picker (ใช้ JWT ผู้ใช้) ได้ 0 แถว → ช่องเลือกบริษัทว่างทุกคน → กด "สร้างใหม่" แล้วชน company_code ซ้ำ
-- การแก้ไข/เพิ่ม/ลบ ยังคงเฉพาะ payroll role หรือผ่าน API ที่ตรวจสิทธิ์ (service role) เหมือนเดิม
drop policy if exists companies_read_authenticated on public.companies;
create policy companies_read_authenticated on public.companies
  for select to authenticated using (true);
