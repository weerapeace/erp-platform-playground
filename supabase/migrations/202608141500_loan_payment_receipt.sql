-- ============================================================
-- Loan & OD — ใบจ่าย: เลขที่ใบเสร็จรับเงิน + แนบรูปใบเสร็จ (อ่านจากรูปด้วย AI ได้)
-- ------------------------------------------------------------
-- เจ้าของขอ: "เพิ่มช่อง เลขที่ใบเสร็จรับเงิน และช่องแนบรูป · อยากให้แนบรูปแล้วอ่านจากรูปเลย"
-- (ตัวอ่านรูปใช้ของเดิมที่ทำไว้แล้วสำหรับสลิปโอนเงิน — Workers AI vision)
-- ============================================================

alter table public.loan_payments
  add column if not exists receipt_no        text not null default '',
  add column if not exists receipt_image_key text not null default '';

comment on column public.loan_payments.receipt_no is 'เลขที่ใบเสร็จรับเงินที่ธนาคารออกให้';
comment on column public.loan_payments.receipt_image_key is 'รูปใบเสร็จ (R2 key) — ใช้ปุ่ม "อ่านจากรูป" ให้ AI กรอกยอดให้อัตโนมัติได้';

-- ต้องทิ้งตัวเดิม (9 พารามิเตอร์) ก่อน ไม่งั้นกลายเป็น overload แล้วเรียกแบบ named param จะกำกวม
drop function if exists public.loan_payment_record(uuid, date, numeric, text, text, numeric, numeric, numeric, numeric);

create or replace function public.loan_payment_record(
  p_contract_id uuid, p_payment_date date, p_amount numeric,
  p_paid_from text default '', p_reference text default '',
  p_principal numeric default 0, p_interest numeric default 0,
  p_penalty numeric default 0, p_fee numeric default 0,
  p_receipt_no text default '', p_receipt_image text default ''
) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_split numeric(18,2);
begin
  if p_contract_id is null then raise exception 'กรุณาเลือกสัญญา'; end if;
  if coalesce(p_amount,0) <= 0 then raise exception 'ยอดจ่ายต้องมากกว่า 0'; end if;

  v_split := greatest(coalesce(p_principal,0),0) + greatest(coalesce(p_interest,0),0)
           + greatest(coalesce(p_penalty,0),0)   + greatest(coalesce(p_fee,0),0);
  if v_split > 0 and abs(v_split - p_amount) > 0.01 then
    raise exception 'ยอดที่แยก (%) ไม่เท่ากับยอดจ่ายรวม (%)', v_split, p_amount;
  end if;

  insert into public.loan_payments(
    loan_contract_id, payment_date, total_paid, paid_from, reference_no, status,
    principal_amount, interest_amount, penalty_amount, fee_amount,
    receipt_no, receipt_image_key)
  values (p_contract_id, coalesce(p_payment_date, current_date), p_amount,
          coalesce(p_paid_from,''), coalesce(p_reference,''), 'verified',
          greatest(coalesce(p_principal,0),0), greatest(coalesce(p_interest,0),0),
          greatest(coalesce(p_penalty,0),0),   greatest(coalesce(p_fee,0),0),
          coalesce(p_receipt_no,''), coalesce(p_receipt_image,''))
  returning id into v_id;
  return v_id;
end $$;

-- ทะเบียนฟิลด์ (ชนิด image → ฟอร์มกลางได้ช่องอัปโหลดรูปอัตโนมัติ)
insert into public.erp_module_fields
  (module_id, field_key, column_name, field_label, ui_field_type, data_type, group_key,
   is_visible, is_required, is_editable, is_searchable, is_filterable, is_sortable,
   show_in_form, form_column_span, display_order, options, relation_config, help_text)
select m.id, v.fk, v.fk, v.lbl, v.ui, 'text', v.gk,
       v.vis, false, true, v.srch, false, false, true, v.span, v.ord, '{}'::jsonb, '{}'::jsonb, v.help
from public.erp_modules m
cross join (values
  ('receipt_no',        'เลขที่ใบเสร็จรับเงิน', 'text',  'core',    true,  true,  1, 55, 'เลขที่ใบเสร็จที่ธนาคารออกให้'),
  ('receipt_image_key', 'รูปใบเสร็จ',           'image', 'content', false, false, 2, 90, 'แนบรูปใบเสร็จ/สลิป — ตอนบันทึกใหม่ใช้ปุ่ม "อ่านจากรูป" ให้ระบบกรอกยอดให้ได้')
) as v(fk, lbl, ui, gk, vis, srch, span, ord, help)
where m.module_key = 'loan-payments'
  and not exists (select 1 from public.erp_module_fields f where f.module_id = m.id and f.column_name = v.fk);
