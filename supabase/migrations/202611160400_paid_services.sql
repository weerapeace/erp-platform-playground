-- ศูนย์ AI และ API ที่เสียเงิน (เฟส 1) — /admin/paid-services
-- ทะเบียนจุดที่ใช้อยู่ในโค้ด lib/paid-services.ts · ตารางนี้เก็บแค่ "ค่าที่แอดมินเปลี่ยน" + บันทึกการใช้
-- ไม่แตะข้อมูลเดิม · ไม่มีแถว = ใช้ค่าเริ่มต้นจากทะเบียน (เปิด · โมเดลเดิมของระบบ)

create table if not exists public.paid_service_settings (
  key             text primary key,
  enabled         boolean not null default true,
  model           text,                       -- null = ใช้โมเดลเดิมของระบบ
  updated_at      timestamptz not null default now(),
  updated_by      uuid,
  updated_by_name text
);

create table if not exists public.paid_service_usage (
  id           bigint generated always as identity primary key,
  key          text not null,
  at           timestamptz not null default now(),
  user_id      uuid,
  model        text,
  tokens_in    integer,
  tokens_out   integer,
  est_cost_thb numeric(12,4),
  ok           boolean not null default true,
  error        text
);
create index if not exists paid_service_usage_key_at_idx on public.paid_service_usage (key, at desc);
create index if not exists paid_service_usage_at_idx on public.paid_service_usage (at desc);

-- อ่าน/เขียนผ่าน API ฝั่งเซิร์ฟเวอร์ (service role) เท่านั้น — เปิด RLS ไม่มี policy = คนนอกอ่านตรงไม่ได้
alter table public.paid_service_settings enable row level security;
alter table public.paid_service_usage enable row level security;

insert into public.erp_permissions (key, label, category, description, is_dangerous, sort_order)
values ('admin.paid_services', 'จัดการ AI / API ที่เสียเงิน', 'admin', 'เปิด-ปิด เปลี่ยนโมเดล และดูยอดใช้ AI / บริการเสียเงิน (/admin/paid-services)', true, 990)
on conflict (key) do nothing;

insert into public.erp_menu_items (section, section_order, sort_order, icon, label, href, show_in_sidebar, show_in_launcher, permission_key, is_active, app_keys)
select '⚙️ Settings', 90, 215, '🤖', 'AI / API ที่เสียเงิน', '/admin/paid-services', true, false, 'admin.paid_services', true, array['settings']
where not exists (select 1 from public.erp_menu_items where href = '/admin/paid-services');
