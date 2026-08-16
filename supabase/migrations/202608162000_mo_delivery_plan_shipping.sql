-- ผูก "งวดส่ง" กับใบส่งสินค้า + ติ๊กว่าส่งแล้ว
--
--   delivery_note_id / dn_number = ใบส่งสินค้าที่ออกจากงวดนี้ (กดออกจากป๊อปใบสั่งงานได้เลย)
--   shipped / shipped_at         = ส่งของแล้ว → ปฏิทินขึ้นเขียว ไม่นับเป็นยอดค้างส่ง และไม่เตือนเลยกำหนด
alter table public.mo_delivery_plan
  add column if not exists delivery_note_id uuid,
  add column if not exists dn_number text,
  add column if not exists shipped boolean not null default false,
  add column if not exists shipped_at date;

create index if not exists idx_mo_delivery_plan_unshipped
  on public.mo_delivery_plan (due_date) where is_active and not shipped;

comment on column public.mo_delivery_plan.delivery_note_id is 'ใบส่งสินค้าที่ออกจากงวดนี้ (erp_playground_delivery_notes.id)';
comment on column public.mo_delivery_plan.shipped is 'ส่งของงวดนี้แล้ว — ปฏิทินจะขึ้นเขียวและไม่นับเป็นยอดค้างส่ง';
