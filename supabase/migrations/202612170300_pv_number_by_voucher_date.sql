-- ============================================================================
-- เลขใบสำคัญรับ PV{YYYY}-{MM}-{DD}-{000} ตาม "วันที่ใบสำคัญ" — วิ่งใหม่ทุกวัน (2026-11-14)
-- เจ้าของสั่ง: "อยากแก้เลขใบสำคัญรับ ใช้ format นี้ PV2026-10-30-001" + ตอบฟอร์ม:
--   · อิงวันที่ใบสำคัญ · ออกเลขตอนสร้างใบร่าง (แก้วันที่ร่าง = เลขเปลี่ยนตาม · ยืนยันแล้วล็อก)
--   · ยกเลิกใบร่าง = คืนเลข · ยกเลิกใบที่ยืนยันแล้ว = ไม่คืน · ใบร่างเดิมได้เลขตอนยืนยัน
-- ทำเป็นของกลางในระบบออกเลข (ไม่ต่อสตริงในหน้า):
--   1) erp_numbering_rules.recycle_keep_column — ใบที่ยกเลิกแต่คอลัมน์นี้มีค่า ยังนับว่า "ใช้เลขแล้ว"
--   2) *_at = ตัวคำนวณเดิมที่รับ "วันที่ของเอกสาร" ได้ (ตัวเดิมเรียก _at ด้วย now() → ชุดเลขอื่น 19 จุดทำงานเหมือนเดิม)
--   3) erp_next_number_at(key, date) — ออกเลขตามวันที่เอกสาร (ล็อกกฎ กันเลขชน)
--   4) erp_pv_assign_number(voucher_id) — ใส่เลขให้ใบสำคัญตามวันที่ใบ (เรียกซ้ำได้: เลขตรงวันอยู่แล้ว = คงเดิม)
--   5) หน้าตั้งค่าเลขเอกสารบันทึก "รายวัน" (daily) ได้
-- ⚠️ เวลา: ฐานข้อมูลเป็น UTC → วันที่เอกสารแปลงเป็น "เที่ยงวัน UTC" ก่อนเข้า to_char (กันวันที่ร่นไป 1 วัน)
-- ============================================================================

alter table public.erp_numbering_rules add column if not exists recycle_keep_column text;
comment on column public.erp_numbering_rules.recycle_keep_column is
  'ตอนหาเลขว่าง: ใบที่ยกเลิกแล้วแต่คอลัมน์นี้มีค่า ยังนับว่าใช้เลขแล้ว (ไม่คืนเลข) · null = ใบยกเลิกคืนเลขทุกใบ (แบบเดิม)';

-- ---------- 1) เลขที่ใช้แล้วในงวดของ "วันที่ที่ส่งมา" ----------
create or replace function public.erp_numbering_used_at(p_rule public.erp_numbering_rules, p_branch text, p_at timestamptz, p_exclude_id uuid default null)
returns table(prefix text, suffix text, pad integer, used bigint[])
language plpgsql stable security definer set search_path = public
as $$
declare v_tpl text; v_keep text := ''; v_excl text := '';
begin
  select t.template, t.pad into v_tpl, pad from public.erp_numbering_template(p_rule.pattern, p_branch, p_at) t;
  if not p_rule.recycle_cancelled or p_rule.recycle_table is null or p_rule.recycle_column is null or pad = 0 then
    return;
  end if;
  prefix := split_part(v_tpl, '{#}', 1);
  suffix := split_part(v_tpl, '{#}', 2);
  if p_rule.recycle_keep_column is not null then v_keep := format(' or %I is not null', p_rule.recycle_keep_column); end if;
  if p_exclude_id is not null then v_excl := format(' and id <> %L::uuid', p_exclude_id); end if;
  execute format(
    $q$select coalesce(array_agg(mid::bigint), '{}'::bigint[])
       from (select substr(%2$I, %3$s + 1, length(%2$I) - %3$s - %4$s) as mid
             from public.%1$I
             where (status <> 'cancelled'%6$s) and %2$I like %5$L%7$s) s
       where mid ~ '^[0-9]+$'$q$,
    p_rule.recycle_table, p_rule.recycle_column, length(prefix), length(suffix), prefix || '%' || suffix, v_keep, v_excl)
  into used;
  return next;
end $$;

-- ตัวเดิม = เรียกตัวใหม่ด้วย "ตอนนี้" (ผลเหมือนเดิมทุกชุดเลข — ชุดเดิมไม่มี recycle_keep_column)
create or replace function public.erp_numbering_used(p_rule public.erp_numbering_rules, p_branch text default null)
returns table(prefix text, suffix text, pad integer, used bigint[])
language sql stable security definer set search_path = public
as $$ select * from public.erp_numbering_used_at(p_rule, p_branch, now(), null) $$;

-- ---------- 2) เลขถัดไปของ "วันที่ที่ส่งมา" (ไม่กินเลข) ----------
create or replace function public.erp_numbering_next_candidate_at(p_rule public.erp_numbering_rules, p_branch text, p_at timestamptz, p_exclude_id uuid default null)
returns table(number text, seq bigint, period text, high bigint, recycled boolean)
language plpgsql stable security definer set search_path = public
as $$
declare v_tpl text; v_pad int; v_next bigint; v_u record; v_max bigint; v_pick bigint;
begin
  period := case p_rule.reset_policy
    when 'yearly'  then to_char(p_at, 'YYYY')
    when 'monthly' then to_char(p_at, 'YYYY-MM')
    when 'daily'   then to_char(p_at, 'YYYY-MM-DD')
    else null end;
  if p_rule.reset_policy <> 'never' and period is distinct from p_rule.last_reset_period then
    v_next := 1;
  else
    v_next := p_rule.current_value + 1;
  end if;
  select t.template, t.pad into v_tpl, v_pad from public.erp_numbering_template(p_rule.pattern, p_branch, p_at) t;

  select * into v_u from public.erp_numbering_used_at(p_rule, p_branch, p_at, p_exclude_id);
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

create or replace function public.erp_numbering_next_candidate(p_rule public.erp_numbering_rules, p_branch text default null)
returns table(number text, seq bigint, period text, high bigint, recycled boolean)
language sql stable security definer set search_path = public
as $$ select * from public.erp_numbering_next_candidate_at(p_rule, p_branch, now(), null) $$;

-- ---------- 3) ออกเลขตาม "วันที่ของเอกสาร" ----------
create or replace function public.erp_next_number_at(p_key text, p_date date, p_branch text default null, p_exclude_id uuid default null)
returns text
language plpgsql security definer set search_path = public
as $$
declare v_rule public.erp_numbering_rules; v_c record; v_at timestamptz; v_scan boolean;
begin
  select * into v_rule from public.erp_numbering_rules where key = p_key for update;   -- ล็อกกฎ = ออกเลขทีละคน กันชน
  if not found then raise exception 'ยังไม่ได้ตั้งค่า numbering rule สำหรับ %', p_key; end if;
  if not v_rule.active then raise exception 'numbering rule "%" ถูกปิดอยู่', p_key; end if;
  -- เที่ยงวัน UTC ของวันที่เอกสาร → to_char ได้วันเดียวกันเสมอ (ไม่มีวันเอกสาร = วันนี้ตามเวลาไทย)
  v_at := (coalesce(p_date, (now() at time zone 'Asia/Bangkok')::date) + time '12:00') at time zone 'UTC';
  select * into v_c from public.erp_numbering_next_candidate_at(v_rule, p_branch, v_at, p_exclude_id);
  v_scan := v_rule.recycle_cancelled and v_rule.recycle_table is not null and v_rule.recycle_column is not null;
  if v_scan then
    update public.erp_numbering_rules set updated_at = now() where key = p_key;   -- หาเลขจากเอกสารจริง ไม่ใช้ตัวนับ
  else
    update public.erp_numbering_rules set current_value = v_c.high, last_reset_period = v_c.period, updated_at = now() where key = p_key;
  end if;
  return v_c.number;
end $$;

-- ---------- 4) ใส่เลขให้ใบสำคัญรับตามวันที่ใบ ----------
create or replace function public.erp_pv_assign_number(p_voucher_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare v record; v_rule public.erp_numbering_rules; v_tpl text; v_pre text; v_suf text; v_mid text; v_no text;
begin
  select id, status, voucher_date, pv_no into v from public.purchase_vouchers_v2 where id = p_voucher_id for update;
  if not found then raise exception 'ไม่พบใบสำคัญรับ'; end if;
  if v.status = 'cancelled' then raise exception 'ใบนี้ยกเลิกแล้ว ออกเลขไม่ได้'; end if;
  if v.status = 'confirmed' and v.pv_no is not null then return v.pv_no; end if;   -- ยืนยันแล้ว = เลขล็อก
  select * into v_rule from public.erp_numbering_rules where key = 'pv';
  if not found then raise exception 'ยังไม่ได้ตั้งค่าชุดเลข pv'; end if;
  -- เลขเดิมตรงกับวันที่ใบอยู่แล้ว = คงเดิม (เรียกซ้ำได้ทุกครั้งที่บันทึก)
  select t.template into v_tpl from public.erp_numbering_template(v_rule.pattern, null,
    (coalesce(v.voucher_date, (now() at time zone 'Asia/Bangkok')::date) + time '12:00') at time zone 'UTC') t;
  v_pre := split_part(v_tpl, '{#}', 1); v_suf := split_part(v_tpl, '{#}', 2);
  if v.pv_no is not null and v.pv_no like v_pre || '%' || v_suf then
    v_mid := substr(v.pv_no, length(v_pre) + 1, length(v.pv_no) - length(v_pre) - length(v_suf));
    if v_mid ~ '^[0-9]+$' then return v.pv_no; end if;
  end if;
  v_no := public.erp_next_number_at('pv', v.voucher_date, null, v.id);
  update public.purchase_vouchers_v2 set pv_no = v_no, updated_at = now() where id = v.id;
  return v_no;
end $$;

-- ฟังก์ชันใหม่: เรียกจาก API ฝั่งเซิร์ฟเวอร์ (service role) เท่านั้น
revoke all on function public.erp_numbering_used_at(public.erp_numbering_rules, text, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.erp_numbering_next_candidate_at(public.erp_numbering_rules, text, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.erp_next_number_at(text, date, text, uuid) from public, anon, authenticated;
revoke all on function public.erp_pv_assign_number(uuid) from public, anon, authenticated;
grant execute on function public.erp_numbering_used_at(public.erp_numbering_rules, text, timestamptz, uuid) to service_role;
grant execute on function public.erp_numbering_next_candidate_at(public.erp_numbering_rules, text, timestamptz, uuid) to service_role;
grant execute on function public.erp_next_number_at(text, date, text, uuid) to service_role;
grant execute on function public.erp_pv_assign_number(uuid) to service_role;

-- ---------- 5) หน้าตั้งค่าบันทึก "รายวัน" ได้ ----------
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
  if p_reset_policy not in ('never','yearly','monthly','daily') then
    raise exception 'reset_policy ต้องเป็น never/yearly/monthly/daily';
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

-- ตั้งชุดเลข pv ให้ใช้กติกาใหม่ = ไฟล์ 202612170310 (รันหลังโค้ดใหม่ขึ้นเว็บแล้ว — กันใบที่ยืนยันช่วงรอ deploy ได้เลขวันที่ผิด)
