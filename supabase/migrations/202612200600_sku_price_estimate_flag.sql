-- ป้าย "ราคาคร่าว ๆ" ของราคาซื้อ SKU (เจ้าของสั่ง 2026-11-20)
-- ป๊อปเพิ่ม SKU จาก Taobao คำนวณราคาซื้อ = หยวน × เรต → ติดป้าย "ราคาคร่าว ๆ" (true)
-- พอมีคนแก้ราคาซื้อทีหลัง (ไม่ได้ตั้งป้ายเองในครั้งเดียวกัน) → ป้ายหายเอง = ถือเป็นราคาจริง
alter table public.skus_v2 add column if not exists standard_price_is_estimate boolean not null default false;

create or replace function public.skus_v2_clear_price_estimate() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.standard_price is distinct from old.standard_price
     and new.standard_price_is_estimate is not distinct from old.standard_price_is_estimate then
    new.standard_price_is_estimate := false;
  end if;
  return new;
end $$;

drop trigger if exists trg_skus_v2_clear_price_estimate on public.skus_v2;
create trigger trg_skus_v2_clear_price_estimate before update of standard_price on public.skus_v2
  for each row execute function public.skus_v2_clear_price_estimate();

-- ทะเบียน field: โชว์ในจอสินค้า (ติ๊กออก = ยืนยันว่าเป็นราคาจริง) · สิทธิ์เดียวกับราคาซื้อ
insert into public.erp_module_fields (module_id, field_key, column_name, field_label, field_label_en, ui_field_type, data_type, source, group_key,
  is_visible, is_required, is_editable, is_filterable, is_sortable, display_order, is_active, show_in_form, is_sensitive, sensitive_permission, is_bulk_editable, help_text)
select m.id, 'standard_price_is_estimate', 'standard_price_is_estimate', 'ราคาซื้อเป็นราคาคร่าว ๆ', 'Purchase price is an estimate', 'boolean', 'bool', 'physical', 'sec_1',
  false, false, true, true, true, 151, true, true, true, 'products.cost.view', true,
  'ติดให้เองเมื่อราคาซื้อคำนวณจากหยวน × เรต · แก้ราคาซื้อเมื่อไหร่ ป้ายหายเอง'
from public.erp_modules m
where m.module_key = 'skus-v2'
  and not exists (select 1 from public.erp_module_fields f where f.module_id = m.id and f.column_name = 'standard_price_is_estimate');
