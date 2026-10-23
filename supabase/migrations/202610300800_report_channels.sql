-- 🔌 สวิตช์ช่องทางของรายงานอัตโนมัติ — เจ้าของขอ 2026-10-23 "เลือกเปิด-ปิดได้ว่าจะให้ใช้ Gmail, Discord, ERP"
-- 1) erp_report_channels = สวิตช์ทั้งระบบ (แถวเดียว id=1) ปิดช่องไหน = ทุกรายงานหยุดใช้ช่องนั้นทันที (lib/email-report/channels)
-- 2) email_reports.email_enabled = สวิตช์อีเมลรายรายงาน (Discord/ป๊อป มีสวิตช์ในตัวอยู่แล้ว: discord.enabled / popup.enabled)
-- เพิ่มอย่างเดียว ไม่แตะข้อมูลเดิม · ค่าเริ่มต้น = เปิดทุกช่อง (หน้าตาเดิม)

create table if not exists public.erp_report_channels (
  id         smallint primary key default 1 check (id = 1),
  email      boolean not null default true,
  discord    boolean not null default true,
  popup      boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into public.erp_report_channels (id) values (1) on conflict (id) do nothing;
alter table public.erp_report_channels enable row level security;   -- ไม่มี policy = ผ่าน API (service role) เท่านั้น
revoke all on public.erp_report_channels from anon, authenticated;
comment on table public.erp_report_channels is 'สวิตช์ช่องทางรายงานอัตโนมัติทั้งระบบ (อีเมล / Discord / ป๊อปตอนเข้า ERP) — แถวเดียว';

alter table public.email_reports add column if not exists email_enabled boolean not null default true;
comment on column public.email_reports.email_enabled is 'รายงานนี้ส่งอีเมลไหม (สวิตช์รายรายงาน) — ทั้งระบบดู erp_report_channels.email';
