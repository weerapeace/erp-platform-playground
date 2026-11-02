-- 📤 คิวโพสต์โซเชียลอัตโนมัติ (ของกลาง) — 1 แถว = คอนเทนต์ × แพลตฟอร์ม ที่รอระบบโพสต์ตามเวลา
-- ทำไมต้องมี: เดิมต้องเปิดคอนเทนต์แล้วกดโพสต์ทีละแพลตฟอร์ม · ตั้งเวลาได้แค่ Facebook (IG/Story ตั้งเวลาไม่ได้)
-- ตัวเดิน: pg_cron ทุก 5 นาที → /api/cron/social-publish (ยิงเฉพาะตอนมีงานถึงเวลา) → lib/social-publish (ตัวเดียวกับปุ่ม "โพสต์เลย")
-- ไม่แตะข้อมูลเดิม: ผลยังเขียนกลับ erp_creative_content.post_status / posted_links เหมือนเดิม

create table if not exists public.social_publish_jobs (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.erp_creative_content(id) on delete cascade,
  platform text not null,                         -- facebook | instagram (YouTube/Pinterest/TikTok ทีหลัง)
  format text,                                    -- single/carousel/video/reels/story · null = เดาจากสื่อ
  caption_text text not null default '',          -- แคปชั่น ณ ตอนตั้งคิว (ตรงกับที่ผู้ใช้เห็นในป๊อปยืนยัน)
  media jsonb not null default '[]'::jsonb,       -- [{key,type}] key = r2 key หรือ drive:<fileId>
  run_at timestamptz not null,                    -- เวลาที่จะโพสต์
  status text not null default 'queued'
    check (status in ('queued', 'running', 'processing', 'posted', 'failed', 'cancelled')),
  attempts integer not null default 0,
  remote_id text,                                 -- IG Reels: creation_id ที่รอประมวลผล
  result_url text,
  last_error text,
  locked_at timestamptz,
  posted_at timestamptz,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 1 คอนเทนต์ × 1 แพลตฟอร์ม มีคิวที่ยังไม่จบได้ทีละอัน (ตั้งใหม่ = ยกเลิกอันเก่าก่อน)
create unique index if not exists uq_social_publish_jobs_active
  on public.social_publish_jobs (content_id, platform) where status in ('queued', 'running', 'processing');
create index if not exists idx_social_publish_jobs_due
  on public.social_publish_jobs (run_at) where status in ('queued', 'processing');
create index if not exists idx_social_publish_jobs_content on public.social_publish_jobs (content_id);

alter table public.social_publish_jobs enable row level security;   -- เข้าผ่าน API (service role) เท่านั้น

-- จองงานที่ถึงเวลา (กันตัวเดิน 2 รอบหยิบงานเดียวกันซ้ำ → โพสต์ซ้ำ)
--   queued ถึงเวลา → running (+1 attempts) · processing (รอ IG ประมวลผล) ที่ไม่ได้เช็กมา ≥2 นาที → จองไว้เช็กต่อ
create or replace function public.social_publish_claim(p_limit integer default 5)
returns setof public.social_publish_jobs
language sql
security definer
set search_path = ''
as $$
  update public.social_publish_jobs j
     set status = case when j.status = 'queued' then 'running' else j.status end,
         attempts = j.attempts + case when j.status = 'queued' then 1 else 0 end,
         locked_at = now(),
         updated_at = now()
   where j.id in (
     select s.id from public.social_publish_jobs s
      where (s.status = 'queued' and s.run_at <= now())
         or (s.status = 'processing' and (s.locked_at is null or s.locked_at < now() - interval '2 minutes'))
      order by s.run_at
      limit greatest(1, least(coalesce(p_limit, 5), 20))
      for update skip locked)
  returning j.*;
$$;
revoke all on function public.social_publish_claim(integer) from public, anon, authenticated;
grant execute on function public.social_publish_claim(integer) to service_role;

-- โทเคนให้ pg_cron เรียก /api/cron/social-publish (ตรวจผ่าน erp_cron_token_ok ตัวกลางเดิม)
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'social_publish_cron') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'social_publish_cron', 'โทเคนให้ pg_cron เรียก /api/cron/social-publish');
  end if;
end $$;

-- งาน pg_cron (ทุก 5 นาที · เรียกเว็บเฉพาะตอนมีคิวถึงเวลา) ตั้งหลัง deploy route แล้ว:
-- select cron.schedule('social-publish-every-5min', '*/5 * * * *', $job$
--   select net.http_post(
--     url := 'https://erp-platform-playground.vercel.app/api/cron/social-publish',
--     headers := jsonb_build_object('Content-Type', 'application/json',
--       'x-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'social_publish_cron')),
--     body := '{}'::jsonb, timeout_milliseconds := 120000)
--   where exists (select 1 from public.social_publish_jobs
--                  where (status = 'queued' and run_at <= now()) or status = 'processing')
-- $job$);
