-- ไลน์บริษัท รอบ 3 — HR เปิดให้พนักงานดูสลิปงวดไหนในไลน์ได้ (เจ้าของอนุมัติแผน 2026-11-21)
--   สลิปทั้งหมดยังเป็น draft (364 ใบ) → ไม่ผูกกับสถานะงวด ให้ HR กดเปิดเองทีละงวด (ศูนย์ /payroll/line-members)
--   null = ยังไม่เปิด (พนักงานไม่เห็น) · ปิดกลับ = ตั้งเป็น null (ลงประวัติทุกครั้ง)
-- เพิ่มช่องอย่างเดียว ไม่แก้ข้อมูลเดิม
alter table public.payroll_periods
  add column if not exists line_visible_at timestamptz,
  add column if not exists line_visible_by text;
comment on column public.payroll_periods.line_visible_at is 'ไลน์บริษัท: HR เปิดให้พนักงานดูสลิปงวดนี้ในไลน์เมื่อไร (null = ยังไม่เปิด)';
