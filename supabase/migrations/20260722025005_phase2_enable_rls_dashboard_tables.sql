-- RLS remediation เฟส 2: แดชบอร์ด — GET อ่านด้วย authenticated (supabaseFromRequest), write ใช้ service_role
-- ให้ authenticated อ่านได้ (คงพฤติกรรมเดิม) · ปิด anon · write ยังผ่าน service_role (bypassrls)
create policy dashboard_layouts_read_authenticated
  on public.erp_dashboard_layouts for select to authenticated using (true);
alter table public.erp_dashboard_layouts enable row level security;

create policy dashboard_panels_read_authenticated
  on public.erp_dashboard_panels for select to authenticated using (true);
alter table public.erp_dashboard_panels enable row level security;
