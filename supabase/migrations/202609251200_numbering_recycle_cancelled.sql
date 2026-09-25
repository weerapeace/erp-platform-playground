-- =====================================================================================
-- เลขที่เอกสาร: "นำเลขของใบที่ยกเลิกกลับมาใช้" (เจ้าของสั่ง 2026-09-25)
--   "เวลาลบ/ยกเลิกบิลหรือ SO อยากให้เลขรันต่อโดยไม่ข้ามเลขที่ยกเลิก — ยกเลิก 009 แล้วสร้างใหม่ต้องได้ 009 ไม่ใช่ 010"
--
-- วิธีคิด (ของกลาง — ทุกชุดเลขใช้ได้):
--   ชุดเลขที่เปิด recycle_cancelled = เลขถัดไป คือ "เลขว่างที่เล็กที่สุดในงวดนี้" โดยสแกนจากตารางเอกสารจริง
--   และไม่นับใบที่ status = 'cancelled'  → เลขของใบที่ยกเลิกจึงว่างให้ใบถัดไปทันที
--   ไม่ต้องมีตาราง "เลขที่คืน" แยก · ไม่ต้องเกาะ hook ตอนยกเลิก · ตัวนับที่เคยตามหลังของจริงก็หายไปเอง (self-healing)
--   (ใบส่งสินค้าเคยทำแบบนี้อยู่แล้วแต่เขียนเองในฟังก์ชันของตัวเอง → ย้ายมาใช้ของกลางตัวนี้)
--
-- กันเลขซ้ำ (ของแถมที่จำเป็น):
--   ใบขาย: เลขที่กรอกเอง/แก้เอง ต้องไม่ซ้ำกับใบที่ยังไม่ยกเลิก (erp_so_number_in_use) · เลขอัตโนมัติวนขอใหม่ถ้าชน (erp_so_fresh_number)
--   ใบวางบิล/ใบส่งสินค้า: "ย้อนสถานะ" ใบที่ยกเลิกกลับมา ถ้าเลขถูกใบอื่นใช้ไปแล้ว → ออกเลขใหม่ให้ (บอกในผลลัพธ์)
-- =====================================================================================

-- ---------- 1) ตั้งค่าต่อชุดเลข ----------
alter table public.erp_numbering_rules
  add column if not exists recycle_cancelled boolean not null default false,
  add column if not exists recycle_table  text,
  add column if not exists recycle_column text;
comment on column public.erp_numbering_rules.recycle_cancelled is 'true = เลขถัดไป = เลขว่างที่เล็กสุดในงวดนี้ โดยไม่นับใบที่ status=cancelled (เลขของใบที่ยกเลิกถูกใช้ซ้ำ)';
comment on column public.erp_numbering_rules.recycle_table  is 'ตารางเอกสารที่ถือเลขชุดนี้ (ต้องมีคอลัมน์ status) — ใช้สแกนหาเลขว่าง';
comment on column public.erp_numbering_rules.recycle_column is 'คอลัมน์เลขที่เอกสารในตารางนั้น';

-- ---------- 2) ของกลาง: ประกอบ pattern → template ของ "ตอนนี้" ----------
-- คืน template ที่แทน token วันที่แล้ว แต่เว้นช่องเลขรันเป็น {#}  เช่น ISG{BYYYY}-{MM}-{000} → ISG2569-09-{#}, pad=3
create or replace function public.erp_numbering_template(p_pattern text, p_branch text default null, p_now timestamptz default now())
returns table(template text, pad int)
language plpgsql stable
as $$
declare v text; v_tok text;
begin
  v := p_pattern;
  v := replace(v, '{YYYYMM}', to_char(p_now, 'YYYYMM'));
  v := replace(v, '{YYYY}',   to_char(p_now, 'YYYY'));
  v := replace(v, '{BYYYY}',  (extract(year from p_now)::int + 543)::text);   -- ปี พ.ศ.
  v := replace(v, '{YY}',     to_char(p_now, 'YY'));
  v := replace(v, '{MM}',     to_char(p_now, 'MM'));
  v := replace(v, '{DD}',     to_char(p_now, 'DD'));
  v := replace(v, '{BRANCH}', coalesce(p_branch, ''));
  v_tok := substring(v from '\{0+\}');
  if v_tok is null then
    template := v; pad := 0;
  else
    template := replace(v, v_tok, '{#}'); pad := length(v_tok) - 2;
  end if;
  return next;
end $$;

-- ---------- 3) ของกลาง: เลขที่ "ใบไม่ยกเลิก" ใช้อยู่ในงวดนี้ (เฉพาะชุดที่เปิด recycle) ----------
create or replace function public.erp_numbering_used(p_rule public.erp_numbering_rules, p_branch text default null)
returns table(prefix text, suffix text, pad int, used bigint[])
language plpgsql stable security definer set search_path = public
as $$
declare v_tpl text;
begin
  select t.template, t.pad into v_tpl, pad from public.erp_numbering_template(p_rule.pattern, p_branch, now()) t;
  if not p_rule.recycle_cancelled or p_rule.recycle_table is null or p_rule.recycle_column is null or pad = 0 then
    return;   -- ไม่ได้เปิดโหมดคืนเลข → ไม่มีแถว
  end if;
  prefix := split_part(v_tpl, '{#}', 1);
  suffix := split_part(v_tpl, '{#}', 2);
  execute format(
    $q$select coalesce(array_agg(mid::bigint), '{}'::bigint[])
       from (select substr(%2$I, %3$s + 1, length(%2$I) - %3$s - %4$s) as mid
             from public.%1$I
             where status <> 'cancelled' and %2$I like %5$L) s
       where mid ~ '^[0-9]+$'$q$,
    p_rule.recycle_table, p_rule.recycle_column, length(prefix), length(suffix), prefix || '%' || suffix)
  into used;
  return next;
end $$;

-- ---------- 4) ของกลาง: เลขถัดไป (ยังไม่กิน) ----------
--   recycle เปิด → เลขว่างที่เล็กสุด (1..max+1) · high = เลขสูงสุดที่ใช้แล้ว (เก็บลง current_value ให้หน้าตั้งค่าอ่านรู้เรื่อง)
--   recycle ปิด → นับต่อจาก current_value เหมือนเดิม (มี reset รายปี/เดือน/วัน)
create or replace function public.erp_numbering_next_candidate(p_rule public.erp_numbering_rules, p_branch text default null)
returns table(number text, seq bigint, period text, high bigint, recycled boolean)
language plpgsql stable security definer set search_path = public
as $$
declare v_now timestamptz := now(); v_tpl text; v_pad int; v_next bigint; v_u record; v_max bigint; v_pick bigint;
begin
  period := case p_rule.reset_policy
    when 'yearly'  then to_char(v_now, 'YYYY')
    when 'monthly' then to_char(v_now, 'YYYY-MM')
    when 'daily'   then to_char(v_now, 'YYYY-MM-DD')
    else null end;
  if p_rule.reset_policy <> 'never' and period is distinct from p_rule.last_reset_period then
    v_next := 1;
  else
    v_next := p_rule.current_value + 1;
  end if;
  select t.template, t.pad into v_tpl, v_pad from public.erp_numbering_template(p_rule.pattern, p_branch, v_now) t;

  select * into v_u from public.erp_numbering_used(p_rule, p_branch);
  if found then
    v_max := coalesce((select max(x) from unnest(v_u.used) x), 0);
    select min(g) into v_pick from generate_series(1::bigint, v_max + 1) g where g <> all(v_u.used);
    number := v_u.prefix || lpad(v_pick::text, v_u.pad, '0') || v_u.suffix;
    seq := v_pick; high := greatest(v_max, v_pick); recycled := (v_pick <= v_max);
    return next; return;
  end if;

  number := case when v_pad > 0 then replace(v_tpl, '{#}', lpad(v_next::text, v_pad, '0')) else v_tpl end;
  seq := v_next; high := v_next; recycled := false;
  return next;
end $$;

-- ---------- 5) เลขถัดไป (กินเลข) — signature เดิม ทุก caller ใช้ต่อได้ ----------
create or replace function public.erp_next_number(p_key text, p_branch text default null)
returns text
language plpgsql security definer set search_path = public
as $$
declare v_rule public.erp_numbering_rules; v_c record;
begin
  select * into v_rule from public.erp_numbering_rules where key = p_key for update;   -- ล็อกแถว = กันสองคนได้เลขเดียวกัน
  if not found then raise exception 'ยังไม่ได้ตั้งค่า numbering rule สำหรับ %', p_key; end if;
  if not v_rule.active then raise exception 'numbering rule "%" ถูกปิดอยู่', p_key; end if;
  select * into v_c from public.erp_numbering_next_candidate(v_rule, p_branch);
  update public.erp_numbering_rules
     set current_value = v_c.high, last_reset_period = v_c.period, updated_at = now()
   where key = p_key;
  return v_c.number;
end $$;

-- ---------- 6) ดูเลขถัดไป (ไม่กิน) — ใช้ตัวคำนวณเดียวกัน (แถมรองรับ {BYYYY} ที่ของเดิมขาด) ----------
create or replace function public.erp_numbering_preview(p_key text, p_branch text default null)
returns text
language plpgsql stable security definer set search_path = public
as $$
declare v_rule public.erp_numbering_rules; v_no text;
begin
  if not erp_can('numbering.view') then raise exception 'ไม่มีสิทธิ์ดู numbering (numbering.view)'; end if;
  select * into v_rule from public.erp_numbering_rules where key = p_key;
  if not found then return null; end if;
  select c.number into v_no from public.erp_numbering_next_candidate(v_rule, p_branch) c;
  return v_no;
end $$;

-- ---------- 7) เลขว่างในงวดนี้ (ไว้โชว์ที่หน้าตั้งค่า) ----------
create or replace function public.erp_numbering_gaps(p_key text, p_branch text default null)
returns text[]
language plpgsql stable security definer set search_path = public
as $$
declare v_rule public.erp_numbering_rules; v_u record; v_max bigint;
begin
  if not erp_can('numbering.view') then raise exception 'ไม่มีสิทธิ์ดู numbering (numbering.view)'; end if;
  select * into v_rule from public.erp_numbering_rules where key = p_key;
  if not found then return '{}'::text[]; end if;
  select * into v_u from public.erp_numbering_used(v_rule, p_branch);
  if not found then return '{}'::text[]; end if;
  v_max := coalesce((select max(x) from unnest(v_u.used) x), 0);
  return coalesce(
    (select array_agg(v_u.prefix || lpad(g::text, v_u.pad, '0') || v_u.suffix order by g)
       from generate_series(1::bigint, v_max) g where g <> all(v_u.used)),
    '{}'::text[]);
end $$;

-- ---------- 8) บันทึกกฎจากหน้าตั้งค่า — เพิ่มสวิตช์ recycle_cancelled ----------
drop function if exists public.erp_numbering_rules_upsert(text, text, text, text, boolean, text);
create or replace function public.erp_numbering_rules_upsert(
  p_key text, p_label text, p_pattern text, p_reset_policy text,
  p_active boolean default true, p_notes text default null, p_recycle_cancelled boolean default null)
returns public.erp_numbering_rules
language plpgsql security definer set search_path = public
as $$
declare
  v_before public.erp_numbering_rules;
  v_after  public.erp_numbering_rules;
  v_changes jsonb;
  v_fields  jsonb := jsonb_build_array(
    jsonb_build_object('key','label',             'label','ชื่อแสดงผล'),
    jsonb_build_object('key','pattern',           'label','รูปแบบเลข'),
    jsonb_build_object('key','reset_policy',      'label','การรีเซ็ต'),
    jsonb_build_object('key','active',            'label','สถานะใช้งาน'),
    jsonb_build_object('key','notes',             'label','หมายเหตุ'),
    jsonb_build_object('key','recycle_cancelled', 'label','นำเลขที่ยกเลิกกลับมาใช้')
  );
  v_action text;
begin
  if not erp_can('admin.numbering') then
    raise exception 'ไม่มีสิทธิ์แก้ไข numbering rules (admin.numbering)';
  end if;
  if p_pattern !~ '\{0+\}' then
    raise exception 'pattern ต้องมี token running เช่น {00000} (รูปแบบที่ใช่: PR-{YYYY}-{00000})';
  end if;
  if p_reset_policy not in ('never','yearly','monthly') then
    raise exception 'reset_policy ต้องเป็น never/yearly/monthly';
  end if;

  select * into v_before from public.erp_numbering_rules where key = p_key;
  if coalesce(p_recycle_cancelled, false) and v_before.recycle_table is null then
    raise exception 'ชุดเลข % ยังไม่ได้ผูกกับตารางเอกสาร จึงเปิด "นำเลขที่ยกเลิกกลับมาใช้" ไม่ได้', p_key;
  end if;

  insert into public.erp_numbering_rules (key, label, pattern, reset_policy, active, notes, recycle_cancelled)
  values (p_key, p_label, p_pattern, p_reset_policy, p_active, p_notes, coalesce(p_recycle_cancelled, false))
  on conflict (key) do update set
    label             = excluded.label,
    pattern           = excluded.pattern,
    reset_policy      = excluded.reset_policy,
    active            = excluded.active,
    notes             = excluded.notes,
    recycle_cancelled = coalesce(p_recycle_cancelled, public.erp_numbering_rules.recycle_cancelled),
    updated_at        = now()
  returning * into v_after;

  if v_before.key is null then
    v_action := 'create';
    insert into public.audit_logs (action, entity_type, entity_id, metadata)
    values (v_action, 'erp_numbering_rule', null, jsonb_build_object('key', p_key, 'label', p_label, 'pattern', p_pattern));
  else
    v_action := 'update';
    v_changes := erp_audit_field_diff(to_jsonb(v_before), to_jsonb(v_after), v_fields);
    if jsonb_array_length(v_changes) > 0 then
      insert into public.audit_logs (action, entity_type, entity_id, metadata)
      values (v_action, 'erp_numbering_rule', null, jsonb_build_object('key', p_key, 'changes', v_changes));
    end if;
  end if;
  return v_after;
end $$;

-- ---------- 9) ผูกชุดเลขกับตารางเอกสาร + เปิดใช้ตามที่เจ้าของสั่ง ----------
update public.erp_numbering_rules set recycle_table = 'erp_playground_sales_orders',  recycle_column = 'so_number',   recycle_cancelled = true
 where key in ('so_tax', 'so_tax_ISG', 'so_tax_LOUIS', 'so_cash');
update public.erp_numbering_rules set recycle_table = 'erp_playground_billing_notes', recycle_column = 'bill_number', recycle_cancelled = true
 where key = 'bn';
update public.erp_numbering_rules set recycle_table = 'erp_playground_delivery_notes', recycle_column = 'dn_number',  recycle_cancelled = true
 where key = 'dn';
update public.erp_numbering_rules set recycle_table = 'so_orders', recycle_column = 'order_no', recycle_cancelled = true
 where key in ('so_order_ISG', 'so_order_LOUIS');
-- ตัวนับใบกำกับ ISG ตามหลังของจริง (8 แต่มีถึง 013 แล้ว) → ตั้งให้ตรง (ต่อไป self-heal เองทุกครั้งที่ออกเลข)
update public.erp_numbering_rules set current_value = 13, updated_at = now()
 where key = 'so_tax_ISG' and last_reset_period = '2026-09' and current_value < 13;

-- ---------- 10) ใบขาย: ตัวช่วยเลือกชุดเลข / ตรวจเลขซ้ำ / ออกเลขที่ไม่ชน ----------
create or replace function public.erp_so_numbering_key(p_company_id uuid, p_vat_rate numeric)
returns text
language plpgsql stable security definer set search_path = public
as $$
declare v_code text;
begin
  if coalesce(p_vat_rate, 7) <= 0 then return 'so_cash'; end if;   -- บิลไม่มี VAT ไม่ใช่ใบกำกับ → ชุด BILL-
  select company_code into v_code from public.companies where id = p_company_id;
  if v_code is not null and exists (select 1 from public.erp_numbering_rules where key = 'so_tax_' || v_code and active) then
    return 'so_tax_' || v_code;
  end if;
  return 'so_tax';
end $$;

-- คืนคำอธิบายใบที่ถือเลขนี้อยู่ (ไม่นับใบยกเลิก) · null = ว่าง
create or replace function public.erp_so_number_in_use(p_number text, p_exclude_id uuid default null)
returns text
language sql stable security definer set search_path = public
as $$
  select so_number || ' (' || case status when 'draft' then 'ร่าง' when 'confirmed' then 'ยืนยันแล้ว' else status end
         || coalesce(' · ' || customer_name, '') || ')'
    from public.erp_playground_sales_orders
   where (so_number = p_number or tax_invoice_no = p_number)
     and status <> 'cancelled'
     and (p_exclude_id is null or id <> p_exclude_id)
   order by created_at
   limit 1
$$;

create or replace function public.erp_so_fresh_number(p_key text)
returns text
language plpgsql security definer set search_path = public
as $$
declare v_no text; v_i int := 0;
begin
  loop
    v_no := public.erp_next_number(p_key);
    exit when public.erp_so_number_in_use(v_no) is null;
    v_i := v_i + 1;
    if v_i >= 50 then
      raise exception 'ออกเลขอัตโนมัติไม่ได้ — เลข % ซ้ำกับใบที่มีอยู่ (ตรวจตั้งค่าเลขที่เอกสาร %)', v_no, p_key;
    end if;
  end loop;
  return v_no;
end $$;

-- ---------- 11) ใบขาย: สร้าง — ใช้ตัวช่วยข้างบน + กันเลขซ้ำ ----------
CREATE OR REPLACE FUNCTION public.erp_playground_so_create(p_header jsonb, p_lines jsonb, p_actor text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid; v_line jsonb; v_idx int := 0; v_cust record; v_wh record; v_sonum text; v_taxno text;
        v_company_id uuid; v_company record; v_key text; v_vat numeric; v_manual text; v_conflict text;
BEGIN
  SELECT NULL::text AS name, NULL::text AS code INTO v_cust;   -- กันเคสไม่ได้เลือกลูกค้าจากทะเบียน (พิมพ์ชื่อเอง) → v_cust ต้องถูก assign เสมอ
  IF NOT erp_can('so.create') THEN RAISE EXCEPTION 'ไม่มีสิทธิ์ (so.create)'; END IF;
  IF p_header ? 'customer_id' AND NULLIF(p_header->>'customer_id','') IS NOT NULL THEN
    SELECT name, code INTO v_cust FROM public.erp_playground_customers WHERE id = (p_header->>'customer_id')::uuid LIMIT 1;
  END IF;
  IF p_header ? 'from_warehouse_id' AND NULLIF(p_header->>'from_warehouse_id','') IS NOT NULL THEN
    SELECT code, name INTO v_wh FROM public.erp_playground_warehouses WHERE id = (p_header->>'from_warehouse_id')::uuid LIMIT 1;
  END IF;

  -- บริษัทที่ออกใบ: ส่งมา > บริษัทตั้งต้น
  v_company_id := NULLIF(p_header->>'company_id','')::uuid;
  IF v_company_id IS NULL THEN
    SELECT id INTO v_company_id FROM public.companies WHERE is_default LIMIT 1;
  END IF;
  SELECT company_code INTO v_company FROM public.companies WHERE id = v_company_id LIMIT 1;

  -- ชุดเลข: มี VAT → so_tax_<CODE> (ไม่มีกฎของบริษัท → so_tax) · ไม่มี VAT → so_cash (BILL-)  [ของกลาง erp_so_numbering_key]
  v_vat := COALESCE(NULLIF(p_header->>'vat_rate','')::numeric, 7);
  v_key := public.erp_so_numbering_key(v_company_id, v_vat);
  v_manual := NULLIF(p_header->>'tax_invoice_no','');
  -- เลขที่กรอกเอง ต้องไม่ซ้ำกับใบที่ยังไม่ยกเลิก (ใบที่ยกเลิกแล้วใช้เลขซ้ำได้ — เจ้าของสั่ง)
  IF v_manual IS NOT NULL THEN
    v_conflict := public.erp_so_number_in_use(v_manual);
    IF v_conflict IS NOT NULL THEN
      RAISE EXCEPTION 'เลขที่ % ถูกใช้อยู่แล้วโดยใบ % — ถ้าจะใช้เลขนี้ ให้ยกเลิกใบนั้นก่อน', v_manual, v_conflict;
    END IF;
  END IF;
  IF v_vat > 0 THEN
    v_taxno := COALESCE(v_manual, public.erp_so_fresh_number(v_key));
    v_sonum := v_taxno;
  ELSE
    v_taxno := NULL;   -- ไม่มี VAT = ไม่มีเลขใบกำกับภาษี
    v_sonum := COALESCE(v_manual, public.erp_so_fresh_number(v_key));
  END IF;

  INSERT INTO public.erp_playground_sales_orders
    (status, so_number, tax_invoice_no, company_id, customer_id, customer_name, customer_code, sale_person_name,
     from_warehouse_id, from_warehouse_code, from_warehouse_name, currency, exchange_rate,
     header_discount_type, header_discount_value, shipping_fee, vat_rate, vat_included, wht_rate,
     order_date, expected_ship_date, note, payment_terms, customer_po_no)
  VALUES (
    'draft', v_sonum, v_taxno, v_company_id,
    NULLIF(p_header->>'customer_id','')::uuid,
    COALESCE(NULLIF(p_header->>'customer_name',''), v_cust.name),
    COALESCE(NULLIF(p_header->>'customer_code',''), v_cust.code),
    NULLIF(p_header->>'sale_person_name',''),
    NULLIF(p_header->>'from_warehouse_id','')::uuid, v_wh.code, v_wh.name,
    COALESCE(NULLIF(p_header->>'currency',''), 'THB'),
    COALESCE((p_header->>'exchange_rate')::numeric, 1),
    COALESCE(NULLIF(p_header->>'header_discount_type',''), 'percent'),
    COALESCE((p_header->>'header_discount_value')::numeric, 0),
    COALESCE((p_header->>'shipping_fee')::numeric, 0),
    v_vat,
    COALESCE((p_header->>'vat_included')::boolean, false),
    COALESCE((p_header->>'wht_rate')::numeric, 0),
    COALESCE((p_header->>'order_date')::date, current_date),
    NULLIF(p_header->>'expected_ship_date','')::date,
    NULLIF(p_header->>'note',''), NULLIF(p_header->>'payment_terms',''), NULLIF(p_header->>'customer_po_no','')
  ) RETURNING id INTO v_id;

  IF p_lines IS NOT NULL AND jsonb_array_length(p_lines) > 0 THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
      INSERT INTO public.erp_playground_so_lines
        (so_id, product_id, sku, product_name, qty, unit, unit_price, discount_type, discount_value, tax_code, note, sort_order)
      VALUES (v_id, NULLIF(v_line->>'product_id','')::uuid, v_line->>'sku',
        COALESCE(NULLIF(v_line->>'product_name',''), v_line->>'sku', 'รายการ'),
        COALESCE((v_line->>'qty')::numeric, 1), COALESCE(NULLIF(v_line->>'unit',''), 'ชิ้น'),
        COALESCE((v_line->>'unit_price')::numeric, 0), COALESCE(NULLIF(v_line->>'discount_type',''), 'percent'),
        COALESCE((v_line->>'discount_value')::numeric, 0), NULLIF(v_line->>'tax_code',''), v_line->>'note', v_idx);
      v_idx := v_idx + 1;
    END LOOP;
  END IF;

  PERFORM erp_so_compute_totals(v_id);
  INSERT INTO public.audit_logs (action, entity_type, entity_id, metadata)
  VALUES ('create','erp_playground_so', v_id,
    jsonb_build_object('actor', p_actor, 'so_number', v_sonum, 'tax_invoice_no', v_taxno,
      'company_code', v_company.company_code, 'numbering_key', v_key, 'manual_number', v_manual IS NOT NULL,
      'customer', COALESCE(NULLIF(p_header->>'customer_name',''), v_cust.name),
      'warehouse', v_wh.code, 'line_count', jsonb_array_length(COALESCE(p_lines, '[]'::jsonb))));
  RETURN v_id;
END;
$function$;

-- ---------- 12) ใบขาย: แก้ไข — เลขที่: กรอกเอง > เดิม · เปลี่ยนโหมด VAT ↔ ไม่มี VAT = ออกเลขชุดใหม่ · กันเลขซ้ำ ----------
-- (บั๊กเดิม: แก้บิลไม่มี VAT แล้วโดนออกเลขใบกำกับ 'so_tax' ให้ทับเลข BILL- เพราะ COALESCE ไปถึง erp_next_number)
CREATE OR REPLACE FUNCTION public.erp_playground_so_update(p_id uuid, p_header jsonb, p_lines jsonb, p_actor text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_status text; v_idx int := 0; v_line jsonb; v_cust record; v_wh record; v_taxno text; v_sonum text;
        v_was_reserved boolean; v_old_wh uuid; v_rel record; v_resync boolean := false;
        v_old_vat numeric; v_old_taxno text; v_old_sonum text; v_old_company uuid;
        v_vat numeric; v_company uuid; v_manual text; v_conflict text;
BEGIN
  SELECT NULL::text AS name, NULL::text AS code INTO v_cust;   -- กันเคสไม่ได้เลือกลูกค้าจากทะเบียน (พิมพ์ชื่อเอง) → v_cust ต้องถูก assign เสมอ
  IF NOT erp_can('so.edit') THEN RAISE EXCEPTION 'ไม่มีสิทธิ์ (so.edit)'; END IF;
  SELECT status, stock_reserved, from_warehouse_id, vat_rate, tax_invoice_no, so_number, company_id
    INTO v_status, v_was_reserved, v_old_wh, v_old_vat, v_old_taxno, v_old_sonum, v_old_company
    FROM public.erp_playground_sales_orders WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบ SO'; END IF;
  IF v_status NOT IN ('draft','confirmed') THEN RAISE EXCEPTION 'แก้ได้เฉพาะ ร่าง/ยืนยันแล้ว (ปัจจุบัน: %)', v_status; END IF;

  -- ถ้าเป็น SO ที่ยืนยันแล้วและจองสต๊อกไว้ + กำลังแก้รายการ → ปล่อยการจองเดิมก่อน (จากคลังเดิม)
  v_resync := (v_status = 'confirmed' AND v_was_reserved AND p_lines IS NOT NULL);
  IF v_resync THEN
    IF v_old_wh IS NOT NULL THEN
      FOR v_rel IN SELECT product_id, sum(qty) AS qty FROM public.erp_playground_so_lines
                   WHERE so_id = p_id AND product_id IS NOT NULL GROUP BY product_id LOOP
        UPDATE public.erp_playground_stock_balances
          SET qty_reserved = GREATEST(0, qty_reserved - v_rel.qty), updated_at = now()
          WHERE product_id = v_rel.product_id AND warehouse_id = v_old_wh;
      END LOOP;
    END IF;
    UPDATE public.erp_playground_sales_orders SET stock_reserved = false WHERE id = p_id;
  END IF;

  IF p_header IS NOT NULL THEN
    IF p_header ? 'customer_id' AND NULLIF(p_header->>'customer_id','') IS NOT NULL THEN
      SELECT name, code INTO v_cust FROM public.erp_playground_customers WHERE id = (p_header->>'customer_id')::uuid LIMIT 1;
    END IF;
    IF p_header ? 'from_warehouse_id' AND NULLIF(p_header->>'from_warehouse_id','') IS NOT NULL THEN
      SELECT code, name INTO v_wh FROM public.erp_playground_warehouses WHERE id = (p_header->>'from_warehouse_id')::uuid LIMIT 1;
    END IF;

    v_vat     := COALESCE((p_header->>'vat_rate')::numeric, v_old_vat, 7);
    v_company := COALESCE(NULLIF(p_header->>'company_id','')::uuid, v_old_company);
    v_manual  := NULLIF(p_header->>'tax_invoice_no','');
    IF v_vat > 0 THEN
      IF v_manual IS NOT NULL THEN
        v_taxno := v_manual;
      ELSIF COALESCE(v_old_vat, 7) <= 0 THEN
        v_taxno := public.erp_so_fresh_number(public.erp_so_numbering_key(v_company, v_vat));   -- เพิ่งเปลี่ยน ไม่มี VAT → มี VAT
      ELSE
        v_taxno := COALESCE(v_old_taxno, v_old_sonum, public.erp_so_fresh_number(public.erp_so_numbering_key(v_company, v_vat)));
      END IF;
      v_sonum := v_taxno;
    ELSE
      v_taxno := NULL;   -- ไม่มี VAT = ไม่มีเลขใบกำกับภาษี
      IF v_manual IS NOT NULL THEN
        v_sonum := v_manual;
      ELSIF COALESCE(v_old_vat, 7) > 0 THEN
        v_sonum := public.erp_so_fresh_number('so_cash');   -- เพิ่งเปลี่ยน มี VAT → ไม่มี VAT (เลขใบกำกับเดิมว่างให้ใบอื่น)
      ELSE
        v_sonum := COALESCE(v_old_sonum, public.erp_so_fresh_number('so_cash'));
      END IF;
    END IF;
    -- เลขเปลี่ยน → ต้องไม่ซ้ำกับใบอื่นที่ยังไม่ยกเลิก
    IF v_sonum IS DISTINCT FROM v_old_sonum THEN
      v_conflict := public.erp_so_number_in_use(v_sonum, p_id);
      IF v_conflict IS NOT NULL THEN
        RAISE EXCEPTION 'เลขที่ % ถูกใช้อยู่แล้วโดยใบ % — ถ้าจะใช้เลขนี้ ให้ยกเลิกใบนั้นก่อน', v_sonum, v_conflict;
      END IF;
    END IF;

    UPDATE public.erp_playground_sales_orders SET
      company_id       = v_company,
      customer_id      = COALESCE(NULLIF(p_header->>'customer_id','')::uuid, customer_id),
      customer_name    = COALESCE(NULLIF(p_header->>'customer_name',''), v_cust.name, customer_name),
      customer_code    = COALESCE(NULLIF(p_header->>'customer_code',''), v_cust.code, customer_code),
      sale_person_name = COALESCE(NULLIF(p_header->>'sale_person_name',''), sale_person_name),
      from_warehouse_id   = COALESCE(NULLIF(p_header->>'from_warehouse_id','')::uuid, from_warehouse_id),
      from_warehouse_code = COALESCE(v_wh.code, from_warehouse_code),
      from_warehouse_name = COALESCE(v_wh.name, from_warehouse_name),
      currency         = COALESCE(NULLIF(p_header->>'currency',''), currency),
      exchange_rate    = COALESCE((p_header->>'exchange_rate')::numeric, exchange_rate),
      header_discount_type  = COALESCE(NULLIF(p_header->>'header_discount_type',''), header_discount_type),
      header_discount_value = COALESCE((p_header->>'header_discount_value')::numeric, header_discount_value),
      shipping_fee     = COALESCE((p_header->>'shipping_fee')::numeric, shipping_fee),
      vat_rate         = v_vat,
      vat_included     = COALESCE((p_header->>'vat_included')::boolean, vat_included),
      wht_rate         = COALESCE((p_header->>'wht_rate')::numeric, wht_rate),
      order_date       = COALESCE((p_header->>'order_date')::date, order_date),
      expected_ship_date = COALESCE(NULLIF(p_header->>'expected_ship_date','')::date, expected_ship_date),
      note             = COALESCE(p_header->>'note', note),
      payment_terms    = COALESCE(p_header->>'payment_terms', payment_terms),
      customer_po_no   = COALESCE(p_header->>'customer_po_no', customer_po_no),
      tax_invoice_no   = v_taxno,
      so_number        = v_sonum,
      updated_at       = now()
    WHERE id = p_id;
  END IF;

  IF p_lines IS NOT NULL THEN
    DELETE FROM public.erp_playground_so_lines WHERE so_id = p_id;
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
      INSERT INTO public.erp_playground_so_lines
        (so_id, product_id, sku, product_name, qty, unit, unit_price, discount_type, discount_value, tax_code, note, sort_order)
      VALUES (p_id, NULLIF(v_line->>'product_id','')::uuid, v_line->>'sku',
        COALESCE(NULLIF(v_line->>'product_name',''), v_line->>'sku', 'รายการ'),
        COALESCE((v_line->>'qty')::numeric, 1), COALESCE(NULLIF(v_line->>'unit',''), 'ชิ้น'),
        COALESCE((v_line->>'unit_price')::numeric, 0), COALESCE(NULLIF(v_line->>'discount_type',''), 'percent'),
        COALESCE((v_line->>'discount_value')::numeric, 0), NULLIF(v_line->>'tax_code',''), v_line->>'note', v_idx);
      v_idx := v_idx + 1;
    END LOOP;
  END IF;

  PERFORM erp_so_compute_totals(p_id);

  -- จองสต๊อกใหม่ตามรายการที่แก้ (คลังปัจจุบัน) — erp_so_reserve_stock จะ +qty_reserved และตั้ง stock_reserved=true
  IF v_resync THEN
    PERFORM public.erp_so_reserve_stock(p_id);
  END IF;

  INSERT INTO public.audit_logs (action, entity_type, entity_id, metadata)
  VALUES ('update','erp_playground_so', p_id, jsonb_build_object('actor', p_actor, 'status', v_status, 'resync_reserve', v_resync,
    'so_number', COALESCE(v_sonum, v_old_sonum), 'renumbered_from', CASE WHEN v_sonum IS DISTINCT FROM v_old_sonum THEN v_old_sonum END));
  RETURN p_id;
END;
$function$;

-- ---------- 13) ใบขาย: เปลี่ยนสถานะ — ตอนยกเลิก บอกด้วยว่าเลขจะถูกนำกลับมาใช้ไหม (ไว้โชว์บนจอ) ----------
CREATE OR REPLACE FUNCTION public.erp_playground_so_transition(p_id uuid, p_action text, p_actor text DEFAULT NULL::text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cur text; v_new text; v_sonum text; v_so_number text;
  v_so record;
  v_tr public.erp_workflow_transitions;
  v_use_engine boolean;
  v_event text; v_ctx jsonb;
  v_reserved_count int := 0; v_shipped_count int := 0;
  v_rule public.erp_numbering_rules; v_tpl text; v_reusable boolean := false;
BEGIN
  v_use_engine := erp_workflow_is_active('so');
  IF NOT v_use_engine THEN RAISE EXCEPTION 'SO workflow ปิดอยู่ — เปิดที่ /admin/workflows'; END IF;

  SELECT * INTO v_so FROM public.erp_playground_sales_orders WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบ SO'; END IF;
  v_cur := v_so.status; v_so_number := v_so.so_number;

  v_tr := erp_workflow_resolve_transition('so', p_action, v_cur);
  IF v_tr.id IS NULL THEN RAISE EXCEPTION 'workflow ไม่อนุญาต % จาก %', p_action, v_cur; END IF;
  v_new := v_tr.to_state;

  IF v_tr.required_permission IS NOT NULL AND NOT erp_can(v_tr.required_permission) THEN
    RAISE EXCEPTION 'ไม่มีสิทธิ์ทำ % (%)', p_action, v_tr.required_permission;
  END IF;
  IF v_tr.require_reason AND (p_reason IS NULL OR trim(p_reason) = '') THEN
    RAISE EXCEPTION 'ต้องระบุเหตุผล';
  END IF;

  -- side effects (run ตามลำดับ)
  IF 'assign_number' = ANY(v_tr.side_effects) AND v_so_number IS NULL THEN
    v_sonum := public.erp_next_number('so');
  END IF;

  IF 'reserve_stock' = ANY(v_tr.side_effects) THEN
    BEGIN
      v_reserved_count := erp_so_reserve_stock(p_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'reserve stock ล้มเหลว: %', SQLERRM;
    END;
  END IF;
  IF 'ship_stock_out' = ANY(v_tr.side_effects) THEN
    BEGIN
      v_shipped_count := erp_so_ship_stock_out(p_id, p_actor);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'ship stock ล้มเหลว: %', SQLERRM;
    END;
  END IF;
  IF 'release_reservation' = ANY(v_tr.side_effects) THEN
    PERFORM erp_so_release_reservation(p_id);
  END IF;

  UPDATE public.erp_playground_sales_orders SET
    status        = v_new,
    so_number     = COALESCE(v_sonum, so_number),
    confirmed_at  = CASE WHEN p_action = 'confirm' THEN now() ELSE confirmed_at END,
    shipped_at    = CASE WHEN p_action = 'ship'    THEN now() ELSE shipped_at END,
    completed_at  = CASE WHEN p_action = 'complete' THEN now() ELSE completed_at END,
    reject_reason = CASE WHEN p_action = 'cancel'   THEN p_reason ELSE reject_reason END,
    updated_at    = now()
  WHERE id = p_id;

  -- ยกเลิก: เลขของใบนี้จะถูกใบถัดไปใช้ต่อไหม (ชุดเลขเปิด recycle + เลขอยู่ในงวดปัจจุบัน)
  IF p_action = 'cancel' AND v_so_number IS NOT NULL THEN
    SELECT * INTO v_rule FROM public.erp_numbering_rules
     WHERE key = public.erp_so_numbering_key(v_so.company_id, v_so.vat_rate);
    IF FOUND AND v_rule.recycle_cancelled THEN
      SELECT t.template INTO v_tpl FROM public.erp_numbering_template(v_rule.pattern, NULL, now()) t;
      v_reusable := v_so_number LIKE (split_part(v_tpl, '{#}', 1) || '%');
    END IF;
  END IF;

  -- notifications
  IF 'notify_approvers' = ANY(v_tr.side_effects)
     OR 'notify_requester' = ANY(v_tr.side_effects) THEN
    v_event := 'so.' || p_action;
    v_ctx := jsonb_build_object(
      'so_number',     COALESCE(v_sonum, v_so_number, '(ไม่มีเลข)'),
      'customer_name', COALESCE(v_so.customer_name, ''),
      'grand_total',   to_char(COALESCE(v_so.grand_total, 0), 'FM999,999,999.00'),
      'actor',         COALESCE(p_actor, 'ระบบ'),
      'reason',        COALESCE(p_reason, '')
    );
    PERFORM erp_notify_for_event(v_event, 'erp_playground_so', p_id, auth.uid(), v_ctx);
  END IF;

  INSERT INTO public.audit_logs (action, entity_type, entity_id, metadata)
  VALUES (p_action, 'erp_playground_so', p_id,
    jsonb_build_object('from', v_cur, 'to', v_new, 'actor', p_actor, 'reason', p_reason,
                       'so_number', COALESCE(v_sonum, v_so_number),
                       'number_reusable', v_reusable,
                       'reserved_lines', v_reserved_count,
                       'shipped_lines',  v_shipped_count));
  RETURN jsonb_build_object('status', v_new, 'so_number', COALESCE(v_sonum, v_so_number),
                            'number_reusable', v_reusable,
                            'reserved', v_reserved_count, 'shipped', v_shipped_count);
END;
$function$;

-- ---------- 14) ใบวางบิล: ย้อนสถานะจากยกเลิก — ถ้าเลขถูกใบอื่นใช้ไปแล้ว ออกเลขใหม่ ----------
CREATE OR REPLACE FUNCTION public.erp_playground_billing_note_transition(p_id uuid, p_action text, p_actor text DEFAULT NULL::text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_cur text; v_new text; v_b record; v_newno text := NULL;
BEGIN
  IF NOT erp_can('so.create') THEN RAISE EXCEPTION 'ไม่มีสิทธิ์'; END IF;
  SELECT * INTO v_b FROM public.erp_playground_billing_notes WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบใบวางบิล'; END IF;
  v_cur := v_b.status;
  v_new := CASE
    WHEN p_action = 'issue'  AND v_cur = 'draft'  THEN 'issued'
    WHEN p_action = 'pay'    AND v_cur = 'issued' THEN 'paid'
    WHEN p_action = 'cancel' AND v_cur IN ('draft','issued') THEN 'cancelled'
    -- ย้อนสถานะถอยกลับทีละขั้น: รับชำระ→วางบิล, วางบิล→ร่าง, ยกเลิก→ร่าง
    WHEN p_action = 'revert' AND v_cur = 'paid'      THEN 'issued'
    WHEN p_action = 'revert' AND v_cur = 'issued'    THEN 'draft'
    WHEN p_action = 'revert' AND v_cur = 'cancelled' THEN 'draft'
    ELSE NULL END;
  IF v_new IS NULL THEN RAISE EXCEPTION 'workflow ไม่อนุญาต % จาก %', p_action, v_cur; END IF;

  -- ใบที่ยกเลิกแล้ว เลขของมันถูกใบใหม่ใช้ไปแล้ว → กู้กลับมาต้องได้เลขใหม่ (กันเลขซ้ำ)
  IF p_action = 'revert' AND v_cur = 'cancelled' AND EXISTS (
       SELECT 1 FROM public.erp_playground_billing_notes
        WHERE bill_number = v_b.bill_number AND id <> p_id AND status <> 'cancelled') THEN
    v_newno := public.erp_next_number('bn');
  END IF;

  UPDATE public.erp_playground_billing_notes SET
    status = v_new,
    bill_number = COALESCE(v_newno, bill_number),
    issued_at = CASE WHEN p_action='issue' THEN now()
                     WHEN p_action='revert' AND v_new='draft' THEN NULL
                     ELSE issued_at END,
    paid_at   = CASE WHEN p_action='pay' THEN now()
                     WHEN p_action='revert' THEN NULL
                     ELSE paid_at END,
    reject_reason = CASE WHEN p_action='cancel' THEN p_reason
                         WHEN p_action='revert' AND v_new='draft' THEN NULL
                         ELSE reject_reason END,
    updated_at = now()
  WHERE id = p_id;

  INSERT INTO public.audit_logs (action, entity_type, entity_id, metadata)
  VALUES (p_action,'erp_playground_billing_note', p_id,
    jsonb_build_object('from', v_cur, 'to', v_new, 'actor', p_actor, 'reason', p_reason,
                       'bill_number', COALESCE(v_newno, v_b.bill_number), 'renumbered_from', CASE WHEN v_newno IS NOT NULL THEN v_b.bill_number END));
  RETURN jsonb_build_object('status', v_new, 'bill_number', COALESCE(v_newno, v_b.bill_number),
                            'renumbered_from', CASE WHEN v_newno IS NOT NULL THEN v_b.bill_number END);
END; $function$;

-- ---------- 15) ใบส่งสินค้า: สร้าง — ใช้เลขกลาง (เดิมสแกนหาเลขว่างเองในฟังก์ชัน ตอนนี้ของกลางทำให้แล้ว) ----------
CREATE OR REPLACE FUNCTION public.erp_playground_delivery_note_create(p_header jsonb, p_lines jsonb, p_actor text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid; v_no text; v_line jsonb; v_idx int := 0; v_qty numeric := 0;
BEGIN
  IF NOT erp_can('so.create') THEN RAISE EXCEPTION 'ไม่มีสิทธิ์'; END IF;

  -- เลข DN จากชุดเลขกลาง 'dn' (เปิด recycle → เลขว่างที่เล็กสุดของเดือน ไม่นับใบยกเลิก)
  v_no := public.erp_next_number('dn');

  INSERT INTO public.erp_playground_delivery_notes
    (dn_number, status, customer_id, customer_name, customer_code, delivery_date, note, so_ids, so_numbers)
  VALUES (v_no, 'draft',
    NULLIF(p_header->>'customer_id','')::uuid, NULLIF(p_header->>'customer_name',''), NULLIF(p_header->>'customer_code',''),
    COALESCE((p_header->>'delivery_date')::date, current_date), NULLIF(p_header->>'note',''),
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_header->'so_ids','[]'::jsonb))::uuid),
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_header->'so_numbers','[]'::jsonb))))
  RETURNING id INTO v_id;

  IF p_lines IS NOT NULL THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
      IF COALESCE(NULLIF(v_line->>'product_name',''), v_line->>'sku') IS NULL THEN CONTINUE; END IF;
      INSERT INTO public.erp_playground_delivery_note_lines
        (delivery_note_id, product_id, sku, product_name, qty, unit, note, sort_order)
      VALUES (v_id, NULLIF(v_line->>'product_id','')::uuid, v_line->>'sku',
        COALESCE(NULLIF(v_line->>'product_name',''), v_line->>'sku'),
        COALESCE((v_line->>'qty')::numeric, 0), COALESCE(NULLIF(v_line->>'unit',''),'ชิ้น'),
        NULLIF(v_line->>'note',''), v_idx);
      v_qty := v_qty + COALESCE((v_line->>'qty')::numeric, 0); v_idx := v_idx + 1;
    END LOOP;
  END IF;

  UPDATE public.erp_playground_delivery_notes SET total_qty = v_qty, line_count = v_idx, updated_at = now() WHERE id = v_id;
  INSERT INTO public.audit_logs (action, entity_type, entity_id, metadata)
  VALUES ('create','erp_playground_delivery_note', v_id, jsonb_build_object('actor', p_actor, 'dn_number', v_no, 'line_count', v_idx));
  RETURN v_id;
END; $function$;

-- ---------- 16) ใบส่งสินค้า: ย้อนสถานะจากยกเลิก — เลขถูกใช้แล้ว → ออกเลขใหม่ ----------
CREATE OR REPLACE FUNCTION public.erp_playground_delivery_note_transition(p_id uuid, p_action text, p_actor text DEFAULT NULL::text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_cur text; v_new text; v_d record; v_newno text := NULL;
BEGIN
  IF NOT erp_can('so.create') THEN RAISE EXCEPTION 'ไม่มีสิทธิ์'; END IF;
  SELECT * INTO v_d FROM public.erp_playground_delivery_notes WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบใบส่งสินค้า'; END IF;
  v_cur := v_d.status;
  v_new := CASE
    WHEN p_action='deliver' AND v_cur='draft' THEN 'delivered'
    WHEN p_action='cancel'  AND v_cur IN ('draft','delivered') THEN 'cancelled'
    WHEN p_action='revert'  AND v_cur='delivered' THEN 'draft'
    WHEN p_action='revert'  AND v_cur='cancelled' THEN 'draft'
    ELSE NULL END;
  IF v_new IS NULL THEN RAISE EXCEPTION 'workflow ไม่อนุญาต % จาก %', p_action, v_cur; END IF;

  IF p_action = 'revert' AND v_cur = 'cancelled' AND EXISTS (
       SELECT 1 FROM public.erp_playground_delivery_notes
        WHERE dn_number = v_d.dn_number AND id <> p_id AND status <> 'cancelled') THEN
    v_newno := public.erp_next_number('dn');
  END IF;

  UPDATE public.erp_playground_delivery_notes SET
    status = v_new,
    dn_number = COALESCE(v_newno, dn_number),
    delivered_at = CASE WHEN p_action='deliver' THEN now() WHEN p_action='revert' THEN NULL ELSE delivered_at END,
    reject_reason = CASE WHEN p_action='cancel' THEN p_reason WHEN p_action='revert' AND v_new='draft' THEN NULL ELSE reject_reason END,
    updated_at = now()
  WHERE id = p_id;
  INSERT INTO public.audit_logs (action, entity_type, entity_id, metadata)
  VALUES (p_action,'erp_playground_delivery_note', p_id, jsonb_build_object('from', v_cur, 'to', v_new, 'actor', p_actor,
    'dn_number', COALESCE(v_newno, v_d.dn_number), 'renumbered_from', CASE WHEN v_newno IS NOT NULL THEN v_d.dn_number END));
  RETURN jsonb_build_object('status', v_new, 'dn_number', COALESCE(v_newno, v_d.dn_number),
                            'renumbered_from', CASE WHEN v_newno IS NOT NULL THEN v_d.dn_number END);
END; $function$;
