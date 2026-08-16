-- แผนแบ่งส่งของใบสั่งผลิต — "ใบนี้ 1,000 ชิ้น ส่ง 300 วันที่ 20 · อีก 700 วันที่ 28"
--
-- เดิมใบสั่งผลิต 1 ใบมีวันนัดส่งได้วันเดียว (manufacturing_orders.due_date)
-- ของจริงลูกค้าทยอยรับหลายรอบ → ตารางนี้เก็บ "งวดส่ง" ได้หลายแถวต่อ 1 ใบ
--
-- ปฏิทินนัดส่งลูกค้าจะโชว์ทีละงวด (ลากเลื่อนวันได้) · จำนวนที่ยังไม่ได้แบ่งงวด
-- ยังเกาะวัน due_date ของใบเหมือนเดิม
create table if not exists public.mo_delivery_plan (
  id          uuid primary key default gen_random_uuid(),
  mo_id       uuid not null references public.manufacturing_orders(id) on delete cascade,
  mo_no       text not null,
  due_date    date not null,
  qty         numeric not null default 0,
  note        text,
  is_active   boolean not null default true,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_mo_delivery_plan_mo on public.mo_delivery_plan (mo_id) where is_active;
create index if not exists idx_mo_delivery_plan_date on public.mo_delivery_plan (due_date) where is_active;

alter table public.mo_delivery_plan enable row level security;
do $$ begin
  if not exists (select 1 from pg_policy where polname = 'mo_delivery_plan_all') then
    create policy mo_delivery_plan_all on public.mo_delivery_plan for all to authenticated using (true) with check (true);
  end if;
end $$;

comment on table public.mo_delivery_plan is 'งวดส่งของใบสั่งผลิต (แบ่งส่งหลายวัน) — 1 แถว = ส่งกี่ชิ้น วันไหน';
