-- 🔔 ป๊อปเตือนงานตอนเข้า ERP (ช่องทางที่ 3 ของรายงาน ต่อจากอีเมล/Discord) — เจ้าของขอ 2026-10-23
-- 1) email_reports.popup = ตั้งค่าต่อรายงาน { enabled, roles, users, from, to, frequency, only_alert, require_ack, assignees } (normalizeReportPopup)
-- 2) erp_popup_acks      = ใครรับทราบ/กดไว้ทีหลัง วันไหน (ไว้ไม่เด้งซ้ำ + หน้าตั้งค่าโชว์ว่าใครรับทราบแล้ว)
-- เพิ่มอย่างเดียว ไม่แตะข้อมูลเดิม · DDL ชุดเดียว (PostgREST รีโหลดครั้งเดียว)

alter table public.email_reports add column if not exists popup jsonb not null default '{}'::jsonb;
comment on column public.email_reports.popup is 'ป๊อปตอนเข้า ERP: { enabled, roles[], users[{id,name}], from, to, frequency daily|every, only_alert, require_ack, assignees } (normalizeReportPopup)';

create table if not exists public.erp_popup_acks (
  report_id uuid not null references public.email_reports(id) on delete cascade,
  user_id   uuid not null references public.user_profiles(id) on delete cascade,
  ack_date  date not null,                                   -- วันที่ตามเวลาไทย
  action    text not null default 'ack' check (action in ('ack', 'later')),
  acked_at  timestamptz not null default now(),
  primary key (report_id, user_id, ack_date)
);
alter table public.erp_popup_acks enable row level security;   -- ไม่มี policy = ผ่าน API (service role) เท่านั้น
revoke all on public.erp_popup_acks from anon, authenticated;
comment on table public.erp_popup_acks is 'ป๊อปเตือนงานตอนเข้า ERP — ใครรับทราบ (ack) / กดไว้ทีหลัง (later) วันไหน';
