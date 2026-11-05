-- รายละเอียดงาน รอบ 2 — ตารางสี (ส่วนประกอบ × สีของรุ่น) ของใบงานออกแบบ (เจ้าของขอ 2026-11-05)
-- 1 ใบงาน = 1 แถว · data = { rows: [{key,name}], colorways: [{key,name,cells:{rowKey: ช่องสี}}] }
-- ช่องสีเลือกได้จาก แผงผ้า / SKU / ทะเบียนสี / ดูดสีจากรูป (โครงสร้าง: lib/design-sheet-spec-colors.ts)

create table public.design_sheet_spec_colors (
  sheet_id    uuid primary key references public.design_sheets(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  updated_by  uuid,
  updated_at  timestamptz not null default now()
);

-- เหมือนตารางอื่นของใบงาน: เปิด RLS ไม่มี policy (deny-all) — อ่าน/เขียนผ่าน API เท่านั้น
alter table public.design_sheet_spec_colors enable row level security;
revoke all on public.design_sheet_spec_colors from anon;
