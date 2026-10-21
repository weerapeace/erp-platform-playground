-- =====================================================================
-- 🔒 กันยิงรัว API สาธารณะของเว็บร้าน (audit 2026-10-21 · ขั้นที่ 5)
-- ตัวนับแบบหน้าต่างเวลาคงที่ — ใช้ผ่าน lib/rate-limit.ts (service_role เท่านั้น)
-- bucket = "<ชื่อกฎ>:<แฮช IP/เบอร์>" (ไม่เก็บ IP ดิบ) · แถวเก่ากว่า 2 วันลบทิ้งเองเป็นระยะ
-- ย้อนกลับ: drop function public.api_rate_limit_hit(text, integer, integer); drop table public.api_rate_limits;
-- =====================================================================

create table if not exists public.api_rate_limits (
  bucket       text        not null,
  window_start timestamptz not null,
  hits         integer     not null default 0,
  primary key (bucket, window_start)
);

alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from public, anon, authenticated;
create index if not exists api_rate_limits_window_idx on public.api_rate_limits (window_start);

create or replace function public.api_rate_limit_hit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
  v_hits  integer;
begin
  if p_bucket is null or length(p_bucket) > 200 or p_limit < 1 or p_window_seconds < 1 then
    return true;
  end if;
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.api_rate_limits as r (bucket, window_start, hits)
  values (p_bucket, v_start, 1)
  on conflict (bucket, window_start) do update set hits = r.hits + 1
  returning r.hits into v_hits;
  -- ล้างแถวเก่าเป็นครั้งคราว (≈1% ของการเรียก) กันตารางบวม
  if random() < 0.01 then
    delete from public.api_rate_limits where window_start < now() - interval '2 days';
  end if;
  return v_hits <= p_limit;
end
$$;

revoke execute on function public.api_rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.api_rate_limit_hit(text, integer, integer) to service_role;
