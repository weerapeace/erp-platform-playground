-- ใบงานออกแบบ ↔ ใบเสนอราคา (ระบบขาย) — 2026-11-07 (เจ้าของอนุมัติ)
-- ทำไม: เดิมรู้ว่าใบเสนอราคามาจากใบงานไหนได้แค่จากประวัติการกด (audit_logs action=to_quotation)
--       และ "ตะกร้า" จำใบร่างไว้ในเบราว์เซอร์เครื่องเดียว → เปลี่ยนเครื่อง/คนอื่นเปิด = เปิดใบซ้ำ (เจอ 4 ใบงาน ร่างค้าง 2-3 ใบ)
-- 1 ใบเสนอราคารวมหลายใบงานได้ (เช่น QT-202607-0005 มี 4 ใบงาน) → ผูกแบบหลายต่อหลาย
-- replaces_quotation_id = ใบนี้เปิดมาแทนใบไหน (กด "ไม่ผ่าน · เปิดใบใหม่แทน")
-- ไม่แตะตาราง/ฟังก์ชันใบเสนอราคาเดิม · เขียน/อ่านผ่าน API ฝั่งเซิร์ฟเวอร์ (service role) เท่านั้น → เปิด RLS ไม่ตั้ง policy

create table if not exists public.design_sheet_quotations (
  id uuid primary key default gen_random_uuid(),
  design_sheet_id uuid not null references public.design_sheets(id) on delete cascade,
  quotation_id uuid not null references public.erp_playground_quotations(id) on delete cascade,
  replaces_quotation_id uuid null references public.erp_playground_quotations(id) on delete set null,
  source text not null default 'send',          -- send = ส่งจากใบงาน · revise = เปิดใหม่แทนใบเก่า · backfill = เติมจากประวัติ
  created_by uuid null,
  created_by_name text null,
  created_at timestamptz not null default now(),
  unique (design_sheet_id, quotation_id)
);

create index if not exists design_sheet_quotations_quotation_idx on public.design_sheet_quotations (quotation_id);

alter table public.design_sheet_quotations enable row level security;
revoke all on public.design_sheet_quotations from anon, authenticated;

-- เติมคู่เก่าจากประวัติการกด "ส่งไปใบเสนอราคา" (เฉพาะใบงาน/ใบที่ยังมีอยู่) · วันที่ = ครั้งแรกที่ผูก
insert into public.design_sheet_quotations (design_sheet_id, quotation_id, source, created_by, created_by_name, created_at)
select a.entity_id, (a.metadata->>'quotation_id')::uuid, 'backfill',
       (array_agg(a.actor_user_id order by a.created_at))[1],
       (array_agg(a.metadata->>'actor' order by a.created_at))[1],
       min(a.created_at)
from public.audit_logs a
where a.action = 'to_quotation' and a.entity_type = 'design_sheet'
  and a.metadata->>'quotation_id' ~ '^[0-9a-f-]{36}$'
  and exists (select 1 from public.design_sheets d where d.id = a.entity_id)
  and exists (select 1 from public.erp_playground_quotations q where q.id = (a.metadata->>'quotation_id')::uuid)
group by a.entity_id, (a.metadata->>'quotation_id')::uuid
on conflict (design_sheet_id, quotation_id) do nothing;
