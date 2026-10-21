-- 📈 สถิติเว็บร้านของเราเอง (ชุด 8 · 2026-10-22) — ไม่ต้องพึ่ง Google Analytics · ไม่ต้องขอคุกกี้
-- นับรายวันเป็นตัวเลขรวมอย่างเดียว (เช่น "วันนี้มาจาก Google 12 รอบ") · ไม่เก็บว่าใครเข้า ไม่เก็บ IP/อุปกรณ์รายคน
-- metric/dim ที่ยอมรับ ตรวจที่ lib/website-web-stats.ts (cleanStatEvents) ก่อนเรียกฟังก์ชันนี้

create table if not exists public.store_web_stats (
  shop_id uuid not null references public.shops(id) on delete cascade,
  day date not null,
  metric text not null check (char_length(metric) between 1 and 30),
  dim text not null default '' check (char_length(dim) <= 80),
  n integer not null default 0,
  primary key (shop_id, day, metric, dim)
);

create index if not exists store_web_stats_recent_idx on public.store_web_stats (shop_id, day desc);

alter table public.store_web_stats enable row level security;

comment on table public.store_web_stats is 'สถิติเว็บร้านรายวัน (ตัวเลขรวม ไม่ระบุตัวคน) — session/pv/ขั้นซื้อ/สินค้าที่ดู/การทดสอบ A/B · อ่านที่ ERP › เว็บไซต์ › 📈 สถิติ';

-- บวกนับหลายตัวในครั้งเดียวแบบอะตอม (รวมตัวซ้ำในชุดก่อน กัน on conflict ชนแถวเดิม 2 ครั้ง)
-- p_events = [{"m": "session", "d": "google"}, ...] · เรียกจาก API ERP ด้วย service role เท่านั้น
create or replace function public.store_web_stat_bump(p_shop uuid, p_events jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.store_web_stats (shop_id, day, metric, dim, n)
  select p_shop, (now() at time zone 'Asia/Bangkok')::date, m, d, count(*)::int
  from (
    select left(e->>'m', 30) as m, left(coalesce(e->>'d', ''), 80) as d
    from jsonb_array_elements(case when jsonb_typeof(p_events) = 'array' then p_events else '[]'::jsonb end) e
    where coalesce(e->>'m', '') <> ''
  ) x
  group by m, d
  on conflict (shop_id, day, metric, dim) do update set n = store_web_stats.n + excluded.n;
$$;

revoke all on function public.store_web_stat_bump(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.store_web_stat_bump(uuid, jsonb) to service_role;

-- ออเดอร์จำ "มาจากไหน" (google/facebook/line/direct/…) + กลุ่ม A/B ที่ลูกค้าเห็น → ยอดขายแยกตามแหล่ง/กลุ่มทดสอบ
alter table public.store_orders add column if not exists source text check (source is null or char_length(source) <= 40);
alter table public.store_orders add column if not exists ab jsonb;

comment on column public.store_orders.source is 'แหล่งที่มาของรอบเข้าเว็บที่สั่ง (utm_source / เว็บที่ส่งมา / direct) — lib/website-web-stats cleanSource';
comment on column public.store_orders.ab is 'กลุ่มทดสอบ A/B ที่ลูกค้าเห็นในรอบนั้น {"<exp>": "A"|"B"}';
