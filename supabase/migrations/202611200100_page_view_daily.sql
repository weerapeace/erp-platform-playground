-- บันทึกการเข้าใช้หน้า (ขั้น 3 ของหน้าประวัติการใช้งาน · เจ้าของอนุมัติ 2026-11-07)
-- เก็บเป็น "ยอดรวมรายวัน": 1 แถว = วัน × คน × หน้า · เก็บ 90 วัน (pg_cron ลบของเก่าทุกคืน)
-- ไม่เก็บว่าดูข้อมูลอะไรในหน้า (path ตัด ?query ทิ้ง + รหัสรายการเป็น :id — ทำที่ lib/page-views)
-- เขียน/อ่านผ่าน API ฝั่งเซิร์ฟเวอร์เท่านั้น (service_role) — หน้าเว็บ/anon/authenticated เข้าตารางและฟังก์ชันตรงไม่ได้

create table if not exists public.page_view_daily (
  day       date        not null,
  user_id   uuid        not null,
  path      text        not null,
  views     integer     not null default 0,
  first_at  timestamptz not null default now(),
  last_at   timestamptz not null default now(),
  primary key (day, user_id, path)
);
create index if not exists page_view_daily_user_day on public.page_view_daily (user_id, day desc);
create index if not exists page_view_daily_path_day on public.page_view_daily (path, day desc);

alter table public.page_view_daily enable row level security;   -- ไม่มี policy = เฉพาะ service_role
revoke all on table public.page_view_daily from anon, authenticated;
grant all on table public.page_view_daily to service_role;

-- บวกยอดเปิดหน้าของผู้ใช้ 1 คน (ก้อนจากหน้าจอ) — รวมก้อนซ้ำในคำขอเดียวกันก่อน กันชน on conflict
create or replace function public.page_view_bump(p_user uuid, p_rows jsonb)
returns integer
language sql
set search_path = public
as $$
  with x as (
    select r.day, left(r.path, 200) as path,
           sum(greatest(1, least(coalesce(r.views, 1), 500)))::int as views,
           min(r.first_at) as first_at, max(r.last_at) as last_at
    from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
         as r(day date, path text, views int, first_at timestamptz, last_at timestamptz)
    where p_user is not null and r.day is not null and r.path like '/%'
      and r.day between (now() at time zone 'Asia/Bangkok')::date - 2 and (now() at time zone 'Asia/Bangkok')::date
    group by r.day, left(r.path, 200)
  ), ins as (
    insert into public.page_view_daily as t (day, user_id, path, views, first_at, last_at)
    select x.day, p_user, x.path, x.views, coalesce(x.first_at, now()), coalesce(x.last_at, now()) from x
    on conflict (day, user_id, path) do update
      set views    = least(t.views + excluded.views, 100000),
          first_at = least(t.first_at, excluded.first_at),
          last_at  = greatest(t.last_at, excluded.last_at)
    returning 1
  )
  select count(*)::int from ins;
$$;

-- สรุปตามหน้า (เลือกดูเฉพาะคนได้)
create or replace function public.page_view_by_page(p_from date, p_to date, p_user uuid default null)
returns table (path text, views bigint, users bigint, last_at timestamptz)
language sql stable
set search_path = public
as $$
  select d.path, sum(d.views)::bigint, count(distinct d.user_id)::bigint, max(d.last_at)
  from public.page_view_daily d
  where d.day between p_from and p_to and (p_user is null or d.user_id = p_user)
  group by d.path
  order by 2 desc
  limit 500;
$$;

-- สรุปตามคน (เลือกดูเฉพาะหน้าได้)
create or replace function public.page_view_by_user(p_from date, p_to date, p_path text default null)
returns table (user_id uuid, views bigint, pages bigint, days bigint, last_at timestamptz)
language sql stable
set search_path = public
as $$
  select d.user_id, sum(d.views)::bigint, count(distinct d.path)::bigint, count(distinct d.day)::bigint, max(d.last_at)
  from public.page_view_daily d
  where d.day between p_from and p_to and (p_path is null or d.path = p_path)
  group by d.user_id
  order by 2 desc
  limit 500;
$$;

revoke execute on function public.page_view_bump(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.page_view_by_page(date, date, uuid) from public, anon, authenticated;
revoke execute on function public.page_view_by_user(date, date, text) from public, anon, authenticated;
grant execute on function public.page_view_bump(uuid, jsonb) to service_role;
grant execute on function public.page_view_by_page(date, date, uuid) to service_role;
grant execute on function public.page_view_by_user(date, date, text) to service_role;

-- ลบของเก่ากว่า 90 วัน ทุกคืน 03:15 เวลาไทย (20:15 UTC)
select cron.schedule(
  'page-view-purge-daily',
  '15 20 * * *',
  $$delete from public.page_view_daily where day < (now() at time zone 'Asia/Bangkok')::date - 90$$
);
