-- 📲 เด้งแจ้งเตือนเข้ามือถือ (Web Push) — ต่อจากกระดิ่งกลาง erp_notifications
--
-- ทำไมต้องมีตารางใหม่: ต้องจำ "ที่อยู่รับแจ้งเตือน" ของแต่ละเครื่อง (endpoint + กุญแจของเครื่อง) ถึงจะส่งเข้าเครื่องนั้นได้
--   1 คนมีได้หลายเครื่อง (มือถือ + คอม) · เครื่องที่ถอนแอปไปแล้วระบบลบออกเองเมื่อบริการ push ตอบว่าไม่มีแล้ว
-- erp_notifications.pushed_at: จองแถวตอนส่ง → ส่งแต่ละเรื่องครั้งเดียวแน่นอน (แม้ถูกเรียกซ้ำ)
-- trigger: มีแจ้งเตือนใหม่ของคนที่เปิดรับ → pg_net ยิง /api/push/dispatch (โทเคนใน Vault ชื่อ push_dispatch) · ไม่มีใครเปิดรับ = ไม่ทำอะไรเลย
-- กุญแจ VAPID ระบบสร้างเองตอนใช้ครั้งแรก เก็บใน china_app_settings (skey=web_push · อ่านผ่านเซิร์ฟเวอร์เท่านั้น)

create table if not exists public.erp_push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  endpoint        text not null unique,
  p256dh          text not null,
  auth            text not null,
  user_agent      text,
  device_label    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_success_at timestamptz,
  last_error      text,
  last_error_at   timestamptz,
  fail_count      int not null default 0
);
create index if not exists erp_push_subscriptions_user_idx on public.erp_push_subscriptions (user_id);

comment on table public.erp_push_subscriptions is 'เครื่องที่เปิดรับแจ้งเตือนเด้ง (Web Push) ต่อผู้ใช้ — อ่าน/เขียนผ่าน /api/push/* (service role) เท่านั้น';

-- ข้อมูลกุญแจของเครื่อง → ห้ามอ่านตรงจากหน้าเว็บ: เปิด RLS ไม่มี policy + ถอนสิทธิ์ตาราง
alter table public.erp_push_subscriptions enable row level security;
revoke all on table public.erp_push_subscriptions from public, anon, authenticated;
grant all on table public.erp_push_subscriptions to service_role;

alter table public.erp_notifications add column if not exists pushed_at timestamptz;

-- โทเคนให้ trigger เรียก /api/push/dispatch (route ตรวจผ่าน erp_cron_token_ok)
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'push_dispatch') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'push_dispatch', 'โทเคนให้ trigger แจ้งเตือนเรียก /api/push/dispatch');
  end if;
end $$;

create or replace function public.erp_push_after_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids   uuid[];
  v_token text;
begin
  select array_agg(n.id) into v_ids
  from new_rows n
  where exists (select 1 from public.erp_push_subscriptions s where s.user_id = n.user_id);
  if v_ids is null then return null; end if;

  select s.decrypted_secret into v_token from vault.decrypted_secrets s where s.name = 'push_dispatch' limit 1;
  if v_token is null then return null; end if;

  perform net.http_post(
    url := 'https://erp-platform-playground.vercel.app/api/push/dispatch',
    body := jsonb_build_object('ids', to_jsonb(v_ids)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-token', v_token),
    timeout_milliseconds := 15000
  );
  return null;
exception when others then
  -- ส่ง push ไม่ได้ต้องไม่ทำให้การสร้างแจ้งเตือน (และงานต้นทาง) ล้ม
  raise warning 'erp_push_after_notify: %', sqlerrm;
  return null;
end;
$$;

-- audit 2026-10-21: ฟังก์ชัน DEFINER ใหม่ต้องปิด anon/authenticated (trigger ทำงานได้ไม่ต้องมีสิทธิ์ execute)
revoke all on function public.erp_push_after_notify() from public, anon, authenticated;

drop trigger if exists erp_notifications_push on public.erp_notifications;
create trigger erp_notifications_push
  after insert on public.erp_notifications
  referencing new table as new_rows
  for each statement execute function public.erp_push_after_notify();
