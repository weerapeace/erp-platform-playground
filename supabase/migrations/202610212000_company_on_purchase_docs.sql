-- ============================================================
-- กระแสเงินสดแยกบริษัท — เฟส 2: ช่อง "บริษัท" ให้ ใบซื้อ · บิลจีน · ใบวางบิล · โน้ตบนกระดานเงินสด
-- ------------------------------------------------------------
-- เจ้าของสั่ง (2026-10-21): "อนุญาตเพิ่มช่องบริษัทให้ใบซื้อ/ใบวางบิล/บิลจีน/โน้ต ·
--   ใบซื้อและบิลจีนเก่าตั้งเป็น ISG ไปก่อน แล้วค่อยมาแก้เป็นหลุยส์ทีหลัง"
--
-- ใช้ทะเบียนบริษัทกลาง (companies · ตั้งค่าที่ /admin/companies) เหมือนใบขาย/เงินกู้/OD/บัตร
--
--   ใบซื้อ / บิลจีน  : ของเก่า + ใบใหม่ที่ไม่ได้ระบุ → บริษัทตั้งต้น (ISG) · แก้เป็นหลุยส์ได้ทีหลัง
--                     (ทางสร้างใบมีหลายทาง — จากใบขอซื้อ / สร้างเอง / ซิงก์ Odoo / แอปเงินจีน → เติมที่ DB ทีเดียวครบทุกทาง)
--   ใบวางบิล         : ตามใบขายที่อยู่ข้างใน (ใบกำกับภาษีต้องเป็นบริษัทเดียวกัน) — คำนวณใหม่เองเมื่อแก้รายการ/ใบขายเปลี่ยนบริษัท
--   โน้ตบนกระดาน     : ว่าง = โชว์ทุกมุมมอง (ไม่เติมค่าให้)
-- ============================================================

alter table public.purchase_orders_v2           add column if not exists company_id uuid references public.companies(id);
alter table public.china_bills                  add column if not exists company_id uuid references public.companies(id);
alter table public.erp_playground_billing_notes add column if not exists company_id uuid references public.companies(id);
alter table public.cashflow_board_notes         add column if not exists company_id uuid references public.companies(id);

create index if not exists idx_po_v2_company          on public.purchase_orders_v2(company_id);
create index if not exists idx_china_bills_company    on public.china_bills(company_id);
create index if not exists idx_billing_notes_company  on public.erp_playground_billing_notes(company_id);

comment on column public.purchase_orders_v2.company_id           is 'ใบซื้อนี้เป็นของบริษัทไหนในกลุ่ม (companies) — ไม่ระบุตอนสร้าง = บริษัทตั้งต้น';
comment on column public.china_bills.company_id                  is 'บิลโอนเงินจีนนี้เป็นของบริษัทไหนในกลุ่ม (companies) — ไม่ระบุตอนสร้าง = บริษัทตั้งต้น';
comment on column public.erp_playground_billing_notes.company_id is 'บริษัทของใบวางบิล — ตามใบขายที่อยู่ข้างใน (คำนวณเองด้วย trigger)';
comment on column public.cashflow_board_notes.company_id         is 'โน้ตของบริษัทไหน — ว่าง = โชว์ทุกมุมมองบนกระดานเงินสด';

-- ------------------------------------------------------------
-- ใบใหม่ที่ไม่ระบุบริษัท → บริษัทตั้งต้น
-- security definer: ต้องอ่านทะเบียนบริษัทได้แม้คนสร้างใบไม่มีสิทธิ์อ่านตาราง companies ตรง ๆ
-- ------------------------------------------------------------
create or replace function public.erp_fill_default_company()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.company_id is null then
    select c.id into new.company_id
      from public.companies c
     where c.is_default and coalesce(c.status, 'active') <> 'inactive'
     order by c.sort_order limit 1;
  end if;
  return new;
end $$;
revoke execute on function public.erp_fill_default_company() from public, anon, authenticated;

drop trigger if exists trg_po_v2_default_company on public.purchase_orders_v2;
create trigger trg_po_v2_default_company before insert on public.purchase_orders_v2
  for each row execute function public.erp_fill_default_company();

drop trigger if exists trg_china_bills_default_company on public.china_bills;
create trigger trg_china_bills_default_company before insert on public.china_bills
  for each row execute function public.erp_fill_default_company();

drop trigger if exists trg_billing_notes_default_company on public.erp_playground_billing_notes;
create trigger trg_billing_notes_default_company before insert on public.erp_playground_billing_notes
  for each row execute function public.erp_fill_default_company();

-- ------------------------------------------------------------
-- ใบวางบิล → บริษัทเดียวกับใบขายข้างใน
--   ใบขายบริษัทเดียว = บริษัทนั้น · ปนหลายบริษัท = ว่าง (ไม่ควรเกิด — API กันไว้แล้ว) · ไม่มีใบขาย = คงค่าเดิม
-- ------------------------------------------------------------
create or replace function public.erp_billing_note_sync_company(p_bn uuid)
returns void language sql security definer set search_path = public as $$
  update public.erp_playground_billing_notes bn
     set company_id = case when d.n = 1 then d.co end
    from (select (array_agg(distinct s.company_id))[1] as co, count(distinct s.company_id) as n
            from public.erp_playground_billing_note_lines l
            join public.erp_playground_sales_orders s on s.id = l.so_id
           where l.billing_note_id = p_bn and s.company_id is not null) d
   where bn.id = p_bn and d.n >= 1
     and bn.company_id is distinct from (case when d.n = 1 then d.co end);
$$;
revoke execute on function public.erp_billing_note_sync_company(uuid) from public, anon, authenticated;

create or replace function public.erp_billing_note_lines_company_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('INSERT', 'UPDATE') and new.billing_note_id is not null then
    perform public.erp_billing_note_sync_company(new.billing_note_id);
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.billing_note_id is not null
     and (tg_op = 'DELETE' or old.billing_note_id is distinct from new.billing_note_id) then
    perform public.erp_billing_note_sync_company(old.billing_note_id);
  end if;
  return null;
end $$;
revoke execute on function public.erp_billing_note_lines_company_trg() from public, anon, authenticated;

drop trigger if exists trg_billing_note_lines_company on public.erp_playground_billing_note_lines;
create trigger trg_billing_note_lines_company
  after insert or update of so_id, billing_note_id or delete on public.erp_playground_billing_note_lines
  for each row execute function public.erp_billing_note_lines_company_trg();

-- ใบขายเปลี่ยนบริษัท → ใบวางบิลที่มีใบนี้อยู่ตามไปด้วย
create or replace function public.erp_so_company_sync_billing_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.company_id is distinct from old.company_id then
    perform public.erp_billing_note_sync_company(x.billing_note_id)
       from (select distinct l.billing_note_id
               from public.erp_playground_billing_note_lines l
              where l.so_id = new.id and l.billing_note_id is not null) x;
  end if;
  return null;
end $$;
revoke execute on function public.erp_so_company_sync_billing_trg() from public, anon, authenticated;

drop trigger if exists trg_so_company_sync_billing on public.erp_playground_sales_orders;
create trigger trg_so_company_sync_billing
  after update of company_id on public.erp_playground_sales_orders
  for each row execute function public.erp_so_company_sync_billing_trg();

-- ------------------------------------------------------------
-- ของเก่า (เจ้าของสั่ง: ใบซื้อ/บิลจีนเก่า = ISG ไปก่อน)
-- ------------------------------------------------------------
update public.purchase_orders_v2 set company_id = (
  select c.id from public.companies c where c.is_default and coalesce(c.status, 'active') <> 'inactive' order by c.sort_order limit 1
) where company_id is null;

update public.china_bills set company_id = (
  select c.id from public.companies c where c.is_default and coalesce(c.status, 'active') <> 'inactive' order by c.sort_order limit 1
) where company_id is null;

select public.erp_billing_note_sync_company(bn.id) from public.erp_playground_billing_notes bn;
update public.erp_playground_billing_notes set company_id = (
  select c.id from public.companies c where c.is_default and coalesce(c.status, 'active') <> 'inactive' order by c.sort_order limit 1
) where company_id is null;

-- ============================================================
-- ทะเบียนฟิลด์ — ช่องเลือกบริษัท (ตัวเลือกค้นหาได้ของกลาง) ให้ตารางกลาง/ฟอร์มกลางของใบซื้อ + บิลจีน
-- ============================================================
insert into public.erp_module_fields
  (module_id, field_key, column_name, field_label, field_label_en, ui_field_type, data_type, group_key,
   is_visible, is_required, is_editable, is_searchable, is_filterable, is_sortable, is_bulk_editable,
   show_in_form, form_column_span, display_order, options, relation_config, help_text)
select m.id, 'company_id', 'company_id', 'บริษัท', 'Company', 'relation', 'uuid', 'core',
       true, false, true, false, true, true, true, true, 1, 15, '{}'::jsonb,
       jsonb_build_object(
         'allow_create', false,
         'target_table', 'companies',
         'target_module_key', 'payroll-companies',
         'target_label_field', 'name',
         'target_search_fields', jsonb_build_array('name', 'company_code', 'name_th'),
         'secondary_label_field', 'company_code'),
       'เป็นของบริษัทไหนในกลุ่ม — ไม่เลือก = บริษัทตั้งต้น · ใช้แยกกระแสเงินสดรายบริษัท'
from public.erp_modules m
where m.module_key in ('purchase-orders-v2', 'china-bills')
  and not exists (select 1 from public.erp_module_fields f where f.module_id = m.id and f.column_name = 'company_id');
