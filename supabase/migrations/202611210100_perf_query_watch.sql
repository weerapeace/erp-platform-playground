-- ⚡ ผู้ตรวจความเร็วรายวัน (เฟส 2 ของ perf-check · เจ้าของอนุมัติ 2026-11-07)
-- ดูว่าคำสั่งฐานข้อมูลตัวไหน "ช้าขึ้น" เทียบกับรอบตรวจก่อนหน้า (ปกติ = เมื่อคืน)
-- pg_stat_statements เป็นยอดสะสมตั้งแต่ reset ล่าสุด (ตอนเขียน = 2026-07-03) → เก็บภาพยอดรวมไว้ 1 ชุด แล้วคิดส่วนต่างรอบถัดไป
-- เก็บแค่ตัวเลข (รหัสคำสั่ง / จำนวนครั้ง / เวลารวม) — ไม่เก็บข้อความคำสั่ง ไม่มีข้อมูลธุรกิจ
-- นับเฉพาะคำสั่งของแอป (service_role / authenticated / anon) — ไม่นับงานภายในของ Supabase (authenticator ถาม schema, auth ฯลฯ)
-- เรียกได้เฉพาะ service_role: ตัวตรวจรายวัน /api/cron/perf-watch และสคริปต์ `npm run perf-check -- --db` (p_commit=false ดูอย่างเดียว)

create table if not exists public.perf_query_snapshot (
  userid   oid              not null,
  queryid  bigint           not null,
  calls    bigint           not null,
  total_ms double precision not null,
  taken_at timestamptz      not null default now(),
  primary key (userid, queryid)
);

alter table public.perf_query_snapshot enable row level security;   -- ไม่มี policy = เฉพาะ service_role
revoke all on table public.perf_query_snapshot from anon, authenticated;
grant all on table public.perf_query_snapshot to service_role;

-- ส่วนต่างตั้งแต่ภาพล่าสุด: คืน { prev_at, rows:[{queryid, role, calls, mean_ms, prev_mean_ms, is_new, total_ms, query}], committed }
--   prev_at = null → ยังไม่เคยเก็บภาพ (รอบแรก) — ผู้เรียกไม่ควรเตือน แค่เก็บภาพ
--   p_commit = true → หลังคิดเสร็จ แทนภาพเดิมด้วยยอดปัจจุบัน (ตัวตรวจรายวันเท่านั้น)
create or replace function public.erp_perf_query_delta(
  p_min_calls   integer default 20,
  p_min_mean_ms numeric default 500,
  p_limit       integer default 30,
  p_commit      boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev_at timestamptz;
  v_rows    jsonb;
begin
  select max(taken_at) into v_prev_at from public.perf_query_snapshot;

  with cur as (
    select s.userid, s.queryid, min(r.rolname)::text as role,
           sum(s.calls)::bigint as calls, sum(s.total_exec_time) as total_ms, min(s.query) as query
    from extensions.pg_stat_statements s
    join pg_catalog.pg_roles r on r.oid = s.userid
    where r.rolname in ('service_role', 'authenticated', 'anon') and s.queryid is not null and s.toplevel
    group by s.userid, s.queryid
  ), d as (
    select c.*, p.calls as p_calls, p.total_ms as p_total,
           case when p.calls is null or c.calls < p.calls then c.calls    else c.calls - p.calls       end as d_calls,
           case when p.calls is null or c.calls < p.calls then c.total_ms else c.total_ms - p.total_ms end as d_total
    from cur c
    left join public.perf_query_snapshot p on p.userid = c.userid and p.queryid = c.queryid
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.total_ms desc), '[]'::jsonb) into v_rows
  from (
    select d.queryid::text as queryid, d.role, d.d_calls as calls,
           round((d.d_total / nullif(d.d_calls, 0))::numeric, 1) as mean_ms,
           round((d.p_total / nullif(d.p_calls, 0))::numeric, 1) as prev_mean_ms,
           (d.p_calls is null) as is_new,
           round(d.d_total::numeric) as total_ms,
           left(regexp_replace(d.query, '\s+', ' ', 'g'), 300) as query
    from d
    where d.d_calls >= greatest(p_min_calls, 1)
      and d.d_total / nullif(d.d_calls, 0) >= p_min_mean_ms
    order by d.d_total desc
    limit least(greatest(p_limit, 1), 200)
  ) x;

  if p_commit then
    delete from public.perf_query_snapshot where true;
    insert into public.perf_query_snapshot (userid, queryid, calls, total_ms, taken_at)
    select s.userid, s.queryid, sum(s.calls)::bigint, sum(s.total_exec_time), now()
    from extensions.pg_stat_statements s
    join pg_catalog.pg_roles r on r.oid = s.userid
    where r.rolname in ('service_role', 'authenticated', 'anon') and s.queryid is not null and s.toplevel
    group by s.userid, s.queryid;
  end if;

  return jsonb_build_object('prev_at', v_prev_at, 'rows', v_rows, 'committed', p_commit);
end;
$$;

revoke all on function public.erp_perf_query_delta(integer, numeric, integer, boolean) from public, anon, authenticated;
grant execute on function public.erp_perf_query_delta(integer, numeric, integer, boolean) to service_role;
