-- OT ที่ "วางแผนไว้" ต่อแผนจ่ายงาน ต่อคน (ใช้บนบอร์ดเท่านั้น — ไม่ยุ่งกับระบบเงินเดือนจริง)
--   ค่า OT ของคนนั้น = ฿/ชั่วโมง × ชั่วโมง/วัน × จำนวนวัน   (คิดเป็นคอลัมน์ generated ให้เลย)
--   เอาไปรวมเป็น "ค่าแรงโต๊ะ" บนหัวโต๊ะในหน้าแผน
create table if not exists public.mo_plan_ot (
  id             uuid primary key default gen_random_uuid(),
  plan_id        uuid not null references public.mo_dispatch_plans(id) on delete cascade,
  employee_id    uuid not null,
  department_id  uuid,                      -- โต๊ะที่คนนั้นสังกัดตอนตั้งค่า (ไว้รวมยอดต่อโต๊ะ)
  rate_per_hour  numeric not null default 0,
  hours_per_day  numeric not null default 0,
  days           numeric not null default 0,
  amount         numeric generated always as (rate_per_hour * hours_per_day * days) stored,
  note           text,
  created_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (plan_id, employee_id)
);

comment on table  public.mo_plan_ot        is 'OT วางแผน (ต่อแผนจ่ายงาน ต่อคน) — ตัวเลขบนบอร์ด ไม่ส่งเข้าเงินเดือนจริง';
comment on column public.mo_plan_ot.amount is 'คำนวณอัตโนมัติ = ฿/ชม. × ชม./วัน × วัน';

create index if not exists idx_mo_plan_ot_plan on public.mo_plan_ot (plan_id);

alter table public.mo_plan_ot enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'mo_plan_ot' and policyname = 'auth_all') then
    create policy auth_all on public.mo_plan_ot for all to authenticated using (true) with check (true);
  end if;
end $$;
