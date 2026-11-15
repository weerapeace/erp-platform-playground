-- ============================================================================
-- เวอร์ชันเอกสารกลาง (document_revisions) + แก้ใบสำคัญรับที่ยืนยันแล้ว (2026-11-15)
--   เจ้าของ: "อยากให้ใบที่ยืนยันแล้ว แก้ไขได้ด้วย แต่ต้องเก็บประวัติ" — เลือกแบบ ก. เปิดแก้ในใบเดิม (เลขเดิม · บังคับเหตุผล · เก็บทุกเวอร์ชัน)
--   ของกลาง: เก็บ "ทั้งใบ" (หัว + รายการ + บิลที่แนบ) ต่อเวอร์ชัน — ใบสั่งซื้อ/ใบสั่งขายใช้ตารางเดียวกันได้ภายหลัง (entity_type)
--   ต่างจาก entity_field_history (lib/record-versions) ที่เก็บทีละช่องของสินค้า
--   อ่าน/เขียนผ่าน API ฝั่งเซิร์ฟเวอร์เท่านั้น (RLS เปิด ไม่มี policy)
-- ============================================================================
create table if not exists public.document_revisions (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,                 -- เช่น purchase_vouchers_v2
  entity_id uuid not null,
  rev_no integer not null,                   -- 1 = ยืนยันครั้งแรก · 2, 3, … = แก้หลังยืนยัน
  action text not null,                      -- confirm | edit
  reason text,                               -- เหตุผลที่แก้ (บังคับตอนแก้)
  snapshot jsonb not null,                   -- เอกสารทั้งใบของเวอร์ชันนี้
  diff jsonb,                                -- เทียบกับเวอร์ชันก่อน [{label, before, after}]
  actor_id uuid,
  actor_name text,
  created_at timestamptz not null default now(),
  unique (entity_type, entity_id, rev_no)
);
create index if not exists document_revisions_entity_idx on public.document_revisions (entity_type, entity_id, rev_no desc);
alter table public.document_revisions enable row level security;
comment on table public.document_revisions is 'เวอร์ชันเอกสารกลาง (ทั้งใบ) — ใบสำคัญรับที่แก้หลังยืนยัน · ใช้ผ่าน lib/document-revisions';

alter table public.purchase_vouchers_v2 add column if not exists revision integer not null default 1;
alter table public.purchase_vouchers_v2 add column if not exists editing_at timestamptz;
alter table public.purchase_vouchers_v2 add column if not exists editing_by text;
alter table public.purchase_vouchers_v2 add column if not exists edit_reason text;
comment on column public.purchase_vouchers_v2.revision is 'เวอร์ชันปัจจุบันของใบ (1 = ยังไม่เคยแก้หลังยืนยัน)';
comment on column public.purchase_vouchers_v2.editing_at is 'กำลังแก้หลังยืนยัน (มีค่า = เปิดแก้อยู่ · สถานะยังเป็น confirmed)';

insert into public.erp_permissions (key, label, category, description, is_dangerous, sort_order)
values ('pv.edit_confirmed', 'แก้ใบสำคัญรับที่ยืนยันแล้ว', 'po',
        'เปิดแก้ใบสำคัญรับหลังยืนยัน (เลขเดิม · ต้องใส่เหตุผล · เก็บทุกเวอร์ชัน) — ราคาใหม่เขียนกลับใบสั่งซื้อ/ราคาร้านให้', true, 95)
on conflict (key) do nothing;
insert into public.erp_role_permissions (role_key, permission_key)
select r, 'pv.edit_confirmed' from (values ('admin'), ('manager')) v(r)
where exists (select 1 from public.erp_roles where key = v.r)
on conflict do nothing;
