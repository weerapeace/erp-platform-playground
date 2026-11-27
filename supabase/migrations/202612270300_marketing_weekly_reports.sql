-- 📊 สรุปการตลาดรายสัปดาห์ (แผนการตลาด รอบ 8 · เจ้าของเลือก 2026-11-27 แบบ A แท็บ "สรุปสัปดาห์" + ข้อ 1-4)
--
-- 1 แถว = 1 สัปดาห์ (จันทร์–อาทิตย์ เวลาไทย) × 1 แบรนด์ (brand_id null = ทุกแบรนด์รวม)
--   data           = ตัวเลขที่ระบบเก็บไว้ตอนสร้าง (ยอดขาย/โฆษณา/รีวิว/โพสต์/แจ้งเตือน) — ไม่เปลี่ยนย้อนหลัง พิมพ์ซ้ำได้เหมือนเดิม
--   ai_summary     = บทสรุป (AI เขียน · คนแก้ได้)
--   ai_actions     = สิ่งที่ควรทำ [{ text, done }] (AI เขียน · คนแก้/ติ๊กเสร็จได้)
--   review_summary = สรุปรีวิว { praise[], complaints[] } (AI เขียน · คนแก้ได้)
--   history        = เวอร์ชันก่อนแก้ทุกครั้ง (ย้อนกลับได้) [{ at, by, summary, actions, review }]
-- ลบ = แบบเก็บไว้ (is_active false + deleted_at · กู้คืนได้) · RLS เปิด ไม่มี policy (เข้าผ่าน API เท่านั้น)
-- โค้ด: lib/marketing-weekly-*.ts · /api/marketing/weekly · /api/cron/marketing-weekly · คู่มือ docs/marketing-overview.md

create table if not exists public.marketing_weekly_reports (
  id              uuid primary key default gen_random_uuid(),
  week_start      date not null,                 -- วันจันทร์ของสัปดาห์
  brand_id        uuid references public.brands(id) on delete set null,
  data            jsonb not null default '{}'::jsonb,
  ai_summary      text,
  ai_actions      jsonb not null default '[]'::jsonb,
  review_summary  jsonb not null default '{}'::jsonb,
  ai_model        text,
  ai_error        text,                          -- AI เขียนไม่สำเร็จ (ปิดบริการ/งบหมด) — ตัวเลขยังเก็บครบ
  edited          boolean not null default false,
  history         jsonb not null default '[]'::jsonb,
  source          text not null default 'manual' check (source in ('manual', 'cron')),
  created_by      uuid,
  updated_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  is_active       boolean not null default true,
  deleted_at      timestamptz
);
-- สัปดาห์ + แบรนด์ ซ้ำไม่ได้ (เฉพาะใบที่ยังไม่ลบ) — สร้างใหม่ทับ = ลบใบเก่าแบบเก็บไว้ก่อน
create unique index if not exists marketing_weekly_reports_week_brand_uq
  on public.marketing_weekly_reports (week_start, coalesce(brand_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where is_active;
create index if not exists marketing_weekly_reports_week_idx on public.marketing_weekly_reports (week_start desc);
alter table public.marketing_weekly_reports enable row level security;
comment on table public.marketing_weekly_reports is 'สรุปการตลาดรายสัปดาห์ + บทสรุป/สิ่งที่ควรทำ/สรุปรีวิว จาก AI (แก้ได้ · มีประวัติ) · lib/marketing-weekly-server.ts';
