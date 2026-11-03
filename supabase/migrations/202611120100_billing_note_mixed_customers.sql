-- ใบวางบิลรวมใบกำกับของ "คนละลูกค้า / คนละสาขา" ได้ (เจ้าของสั่ง 2026-11-03)
--   เดิม: create/update ปฏิเสธทันทีถ้า SO เป็นคนละลูกค้ากับหัวบิล
--   ใหม่: ยอมให้รวม แต่ต้องมีเหตุผล (≥ 5 ตัวอักษร) · คนละบริษัท (เลขผู้เสียภาษีไม่ตรง/ไม่มี) ต้องติ๊กยืนยันด้วย
--         ระบบใส่ชื่อสาขา/ลูกค้าของแต่ละบิลลงช่อง "หมายเหตุ" ของบรรทัด (ใบพิมพ์มีคอลัมน์นี้อยู่แล้ว)
--         และบันทึกระดับการรวม + เหตุผลลง audit log
--   additive ทั้งหมด: เพิ่ม 2 คอลัมน์ (ว่าง = ลูกค้าเดียวเหมือนเดิม) · ไม่แตะ workflow/สถานะ

ALTER TABLE public.erp_playground_billing_notes
  ADD COLUMN IF NOT EXISTS mix_level  text,   -- NULL = ลูกค้าเดียว · 'branch' = คนละสาขาบริษัทเดียวกัน · 'company' = คนละบริษัท
  ADD COLUMN IF NOT EXISTS mix_reason text;   -- เหตุผลที่รวม (เก็บในระบบ ไม่พิมพ์ให้ลูกค้า)

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'erp_playground_billing_notes_mix_level_chk') THEN
    ALTER TABLE public.erp_playground_billing_notes
      ADD CONSTRAINT erp_playground_billing_notes_mix_level_chk CHECK (mix_level IS NULL OR mix_level IN ('branch','company'));
  END IF;
END $$;

-- ป้ายลูกค้า/สาขาของบรรทัด: บริษัทเดียวกัน → "สาขาคลังสินค้าเซ็นทรัลทำ (สาขา 00005)" / "สำนักงานใหญ่" · คนละบริษัท → ชื่อลูกค้า
CREATE OR REPLACE FUNCTION public.erp_playground_billing_party_label(p_name text, p_tax_branch text, p_same_company boolean)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE v_b text := btrim(coalesce(p_tax_branch, '')); v_code text; v_desc text;
BEGIN
  IF NOT p_same_company THEN RETURN NULLIF(btrim(p_name), ''); END IF;
  IF v_b = '' OR v_b ~ '^0+$' OR v_b ~* 'สำนักงานใหญ่|head\s*office' THEN v_code := 'สำนักงานใหญ่';
  ELSIF v_b ~ '^\d{1,5}$' THEN v_code := 'สาขา ' || lpad(v_b, 5, '0');
  END IF;
  v_desc := substring(coalesce(p_name, '') from '(สาขา[^()]*[^()\s])\s*\(สาขาที่');
  IF v_desc IS NOT NULL AND v_code IS NOT NULL THEN RETURN v_desc || ' (' || v_code || ')'; END IF;
  RETURN coalesce(v_code, v_desc, NULLIF(btrim(p_name), ''));
END; $function$;

-- ตรวจ "ลูกค้าปน" ของใบวางบิล (เรียกจาก create/update หลังใส่บรรทัดแล้ว) → ตั้ง mix_level/mix_reason + หมายเหตุบรรทัด
--   ความสัมพันธ์กับลูกค้าหลัก: 0 = ลูกค้าเดียวกัน · 1 = คนละสาขา (เลขผู้เสียภาษี 13 หลักตรงกัน) · 2 = คนละบริษัท / ตรวจไม่ได้
CREATE OR REPLACE FUNCTION public.erp_playground_billing_note_apply_mix(p_id uuid, p_reason text, p_ack boolean)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_main uuid; v_main_tax text; v_prev_level text; v_prev_reason text; v_reason text; v_mix text;
  v_level int := 0; v_rows jsonb := '[]'::jsonb; v_others jsonb; v_changes jsonb := '[]'::jsonb; r record;
BEGIN
  SELECT b.customer_id, b.mix_level, b.mix_reason INTO v_main, v_prev_level, v_prev_reason
    FROM public.erp_playground_billing_notes b WHERE b.id = p_id;
  IF v_main IS NULL THEN
    SELECT s.customer_id INTO v_main
      FROM public.erp_playground_billing_note_lines l JOIN public.erp_playground_sales_orders s ON s.id = l.so_id
     WHERE l.billing_note_id = p_id AND s.customer_id IS NOT NULL ORDER BY l.sort_order LIMIT 1;
  END IF;
  SELECT NULLIF(regexp_replace(coalesce(p.tax_id, ''), '\D', '', 'g'), '') INTO v_main_tax FROM public.partners_v2 p WHERE p.id = v_main;

  FOR r IN
    SELECT l.id, l.so_number, s.customer_id,
           coalesce(p.name_th, p.display_name, s.customer_name) AS cname, p.tax_branch,
           CASE WHEN s.customer_id IS NULL OR s.customer_id = v_main THEN 0
                WHEN length(v_main_tax) = 13 AND regexp_replace(coalesce(p.tax_id, ''), '\D', '', 'g') = v_main_tax THEN 1
                ELSE 2 END AS rel
      FROM public.erp_playground_billing_note_lines l
      LEFT JOIN public.erp_playground_sales_orders s ON s.id = l.so_id
      LEFT JOIN public.partners_v2 p ON p.id = s.customer_id
     WHERE l.billing_note_id = p_id
     ORDER BY l.sort_order
  LOOP
    v_level := greatest(v_level, r.rel);
    v_rows := v_rows || jsonb_build_object('id', r.id, 'rel', r.rel, 'so', r.so_number,
      'customer_id', r.customer_id, 'cname', r.cname,
      'label', public.erp_playground_billing_party_label(r.cname, r.tax_branch, r.rel < 2));
  END LOOP;

  IF v_level > 0 THEN
    v_reason := NULLIF(btrim(coalesce(p_reason, v_prev_reason, '')), '');
    IF v_reason IS NULL OR char_length(v_reason) < 5 THEN
      RAISE EXCEPTION 'ใบวางบิลนี้มีใบกำกับของ%รวมอยู่ — ต้องใส่เหตุผลที่รวมบิล (อย่างน้อย 5 ตัวอักษร)',
        CASE WHEN v_level = 1 THEN 'สาขาอื่น' ELSE 'ลูกค้าอื่น' END;
    END IF;
    IF v_level = 2 AND coalesce(v_prev_level, '') <> 'company' AND NOT coalesce(p_ack, false) THEN
      RAISE EXCEPTION 'ใบวางบิลนี้รวมลูกค้าคนละบริษัท — ต้องติ๊กยืนยันว่าลูกค้าตกลงให้รวมบิลก่อน';
    END IF;
  END IF;
  v_mix := CASE v_level WHEN 1 THEN 'branch' WHEN 2 THEN 'company' END;

  -- หมายเหตุบรรทัด: บิลปนลูกค้า → ใส่ป้ายสาขา/ลูกค้าทุกบรรทัด (รวมของลูกค้าหลัก) ให้ฝ่ายบัญชีลูกค้าจับคู่ได้ · ลูกค้าเดียว → ว่าง
  UPDATE public.erp_playground_billing_note_lines l
     SET note = CASE WHEN v_level > 0 THEN j->>'label' ELSE NULL END
    FROM jsonb_array_elements(v_rows) j
   WHERE l.id = (j->>'id')::uuid;

  UPDATE public.erp_playground_billing_notes
     SET mix_level = v_mix, mix_reason = CASE WHEN v_level > 0 THEN v_reason END
   WHERE id = p_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object('customer_id', g.customer_id, 'customer_name', g.cname, 'so_numbers', g.sos)), '[]'::jsonb)
    INTO v_others
    FROM (SELECT j->>'customer_id' AS customer_id, max(j->>'cname') AS cname, jsonb_agg(j->>'so' ORDER BY j->>'so') AS sos
            FROM jsonb_array_elements(v_rows) j WHERE (j->>'rel')::int > 0 GROUP BY j->>'customer_id') g;

  -- metadata.changes = รูปแบบที่ประวัติกลาง (ActivityFeed) แสดงเป็น "ช่อง: เดิม → ใหม่" — เห็นเหตุผลในแท็บประวัติเลย
  IF coalesce(v_prev_level, '') <> coalesce(v_mix, '') OR coalesce(v_prev_reason, '') <> coalesce(CASE WHEN v_level > 0 THEN v_reason END, '') THEN
    v_changes := jsonb_build_array(
      jsonb_build_object('field', 'mix_level', 'label', 'การรวมลูกค้า',
        'old', CASE v_prev_level WHEN 'branch' THEN 'รวมหลายสาขา (บริษัทเดียวกัน)' WHEN 'company' THEN 'รวมคนละบริษัท' ELSE 'ลูกค้าเดียว' END,
        'new', CASE v_mix WHEN 'branch' THEN 'รวมหลายสาขา (บริษัทเดียวกัน)' WHEN 'company' THEN 'รวมคนละบริษัท' ELSE 'ลูกค้าเดียว' END),
      jsonb_build_object('field', 'mix_reason', 'label', 'เหตุผลที่รวมบิล', 'old', v_prev_reason, 'new', CASE WHEN v_level > 0 THEN v_reason END));
    IF v_level > 0 THEN
      v_changes := v_changes || jsonb_build_object('field', 'mix_lines', 'label', 'ใบของลูกค้าอื่น', 'old', NULL,
        'new', (SELECT string_agg((j->>'so') || ' (' || coalesce(j->>'label', '') || ')', ', ' ORDER BY j->>'so')
                  FROM jsonb_array_elements(v_rows) j WHERE (j->>'rel')::int > 0));
    END IF;
  END IF;

  RETURN jsonb_build_object('mix_level', v_mix, 'mix_reason', CASE WHEN v_level > 0 THEN v_reason END, 'mix_customers', v_others,
    'changes', v_changes);
END; $function$;

-- ตัวช่วยภายใน — เรียกได้จาก create/update (SECURITY DEFINER) เท่านั้น
REVOKE ALL ON FUNCTION public.erp_playground_billing_note_apply_mix(uuid, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.erp_playground_billing_party_label(text, text, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.erp_playground_billing_note_create(p_header jsonb, p_so_ids uuid[], p_actor text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid; v_billno text; v_soid uuid; v_so record; v_cust uuid; v_idx int := 0;
  v_sub numeric := 0; v_vat numeric := 0; v_wht numeric := 0; v_grand numeric := 0;
  v_due date; v_mix jsonb;
BEGIN
  IF NOT erp_can('so.create') THEN RAISE EXCEPTION 'ไม่มีสิทธิ์'; END IF;
  IF p_so_ids IS NULL OR array_length(p_so_ids,1) IS NULL THEN RAISE EXCEPTION 'ต้องเลือกใบกำกับภาษีอย่างน้อย 1 ใบ'; END IF;

  v_cust := NULLIF(p_header->>'customer_id','')::uuid;
  v_due  := NULLIF(p_header->>'due_date','')::date;
  v_billno := public.erp_next_number('bn');

  INSERT INTO public.erp_playground_billing_notes
    (bill_number, status, customer_id, customer_name, customer_code, bill_date, due_date, note)
  VALUES (v_billno, 'draft', v_cust,
    NULLIF(p_header->>'customer_name',''), NULLIF(p_header->>'customer_code',''),
    COALESCE((p_header->>'bill_date')::date, current_date), v_due, NULLIF(p_header->>'note',''))
  RETURNING id INTO v_id;

  FOREACH v_soid IN ARRAY p_so_ids LOOP
    SELECT * INTO v_so FROM public.erp_playground_sales_orders WHERE id = v_soid;
    IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบ SO %', v_soid; END IF;
    IF v_so.status NOT IN ('confirmed','in_production','ready','shipped','completed') THEN
      RAISE EXCEPTION 'SO % ต้องยืนยันแล้ว (ปัจจุบัน: %)', COALESCE(v_so.so_number, v_soid::text), v_so.status;
    END IF;
    -- คนละลูกค้ากับหัวบิล → ไม่ปฏิเสธแล้ว (ตรวจ/ขอเหตุผลที่ apply_mix ด้านล่าง)
    IF EXISTS (SELECT 1 FROM public.erp_playground_billing_note_lines l
               JOIN public.erp_playground_billing_notes b ON b.id = l.billing_note_id
               WHERE l.so_id = v_soid AND b.status <> 'cancelled') THEN
      RAISE EXCEPTION 'SO % ถูกวางบิลไปแล้ว', COALESCE(v_so.so_number, v_soid::text);
    END IF;

    INSERT INTO public.erp_playground_billing_note_lines
      (billing_note_id, so_id, so_number, bill_date, due_date, amount, vat_amount, wht_amount, total_amount, sort_order)
    VALUES (v_id, v_soid, v_so.so_number, v_so.order_date, v_due,
      COALESCE(v_so.taxable,0), COALESCE(v_so.total_vat,0), COALESCE(v_so.total_wht,0), COALESCE(v_so.grand_total,0), v_idx);

    v_sub := v_sub + COALESCE(v_so.taxable,0);
    v_vat := v_vat + COALESCE(v_so.total_vat,0);
    v_wht := v_wht + COALESCE(v_so.total_wht,0);
    v_grand := v_grand + COALESCE(v_so.grand_total,0);
    v_idx := v_idx + 1;
  END LOOP;

  UPDATE public.erp_playground_billing_notes SET
    subtotal = v_sub, total_vat = v_vat, total_wht = v_wht, grand_total = v_grand,
    amount_due = v_grand - v_wht, updated_at = now()
  WHERE id = v_id;

  v_mix := public.erp_playground_billing_note_apply_mix(v_id, p_header->>'mix_reason', COALESCE((p_header->>'mix_ack')::boolean, false));

  INSERT INTO public.audit_logs (action, entity_type, entity_id, metadata)
  VALUES ('create','erp_playground_billing_note', v_id,
    jsonb_build_object('actor', p_actor, 'bill_number', v_billno, 'so_count', array_length(p_so_ids,1))
      || CASE WHEN v_mix->>'mix_level' IS NOT NULL THEN v_mix ELSE '{}'::jsonb END);
  RETURN v_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.erp_playground_billing_note_update(p_id uuid, p_header jsonb, p_so_ids uuid[], p_actor text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text; v_soid uuid; v_so record; v_cust uuid; v_idx int := 0;
  v_sub numeric := 0; v_vat numeric := 0; v_wht numeric := 0; v_grand numeric := 0; v_due date;
  v_prev_mix text; v_mix jsonb;
BEGIN
  IF NOT erp_can('so.edit') THEN RAISE EXCEPTION 'ไม่มีสิทธิ์ (so.edit)'; END IF;
  SELECT status, mix_level INTO v_status, v_prev_mix FROM public.erp_playground_billing_notes WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบใบวางบิล'; END IF;
  IF v_status <> 'draft' THEN RAISE EXCEPTION 'แก้ได้เฉพาะร่าง (ปัจจุบัน: %)', v_status; END IF;

  v_cust := NULLIF(p_header->>'customer_id','')::uuid;
  v_due  := NULLIF(p_header->>'due_date','')::date;

  -- แก้ header
  IF p_header IS NOT NULL THEN
    UPDATE public.erp_playground_billing_notes SET
      customer_id   = COALESCE(v_cust, customer_id),
      customer_name = COALESCE(NULLIF(p_header->>'customer_name',''), customer_name),
      customer_code = COALESCE(NULLIF(p_header->>'customer_code',''), customer_code),
      bill_date     = COALESCE((p_header->>'bill_date')::date, bill_date),
      due_date      = COALESCE(v_due, due_date),
      note          = COALESCE(p_header->>'note', note),
      updated_at    = now()
    WHERE id = p_id;
  END IF;

  -- เลือก SO ใหม่ (ถ้าส่งมา) → ลบบรรทัดเดิม แล้วใส่ตามที่เลือก + คิดยอดใหม่
  IF p_so_ids IS NOT NULL THEN
    DELETE FROM public.erp_playground_billing_note_lines WHERE billing_note_id = p_id;
    IF array_length(p_so_ids,1) IS NULL THEN RAISE EXCEPTION 'ต้องเลือกใบกำกับภาษีอย่างน้อย 1 ใบ'; END IF;
    FOREACH v_soid IN ARRAY p_so_ids LOOP
      SELECT * INTO v_so FROM public.erp_playground_sales_orders WHERE id = v_soid;
      IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบ SO %', v_soid; END IF;
      IF v_so.status NOT IN ('confirmed','in_production','ready','shipped','completed') THEN
        RAISE EXCEPTION 'SO % ต้องยืนยันแล้ว (ปัจจุบัน: %)', COALESCE(v_so.so_number, v_soid::text), v_so.status;
      END IF;
      -- คนละลูกค้ากับหัวบิล → ไม่ปฏิเสธแล้ว (ตรวจ/ขอเหตุผลที่ apply_mix ด้านล่าง)
      -- ถูกวางบิลในใบอื่น (ที่ไม่ยกเลิก) แล้ว — ยกเว้นใบนี้ (บรรทัดของใบนี้ลบไปแล้ว)
      IF EXISTS (SELECT 1 FROM public.erp_playground_billing_note_lines l
                 JOIN public.erp_playground_billing_notes b ON b.id = l.billing_note_id
                 WHERE l.so_id = v_soid AND b.status <> 'cancelled' AND b.id <> p_id) THEN
        RAISE EXCEPTION 'SO % ถูกวางบิลไปแล้ว', COALESCE(v_so.so_number, v_soid::text);
      END IF;
      INSERT INTO public.erp_playground_billing_note_lines
        (billing_note_id, so_id, so_number, bill_date, due_date, amount, vat_amount, wht_amount, total_amount, sort_order)
      VALUES (p_id, v_soid, v_so.so_number, v_so.order_date, v_due,
        COALESCE(v_so.taxable,0), COALESCE(v_so.total_vat,0), COALESCE(v_so.total_wht,0), COALESCE(v_so.grand_total,0), v_idx);
      v_sub := v_sub + COALESCE(v_so.taxable,0); v_vat := v_vat + COALESCE(v_so.total_vat,0);
      v_wht := v_wht + COALESCE(v_so.total_wht,0); v_grand := v_grand + COALESCE(v_so.grand_total,0);
      v_idx := v_idx + 1;
    END LOOP;
    UPDATE public.erp_playground_billing_notes SET
      subtotal = v_sub, total_vat = v_vat, total_wht = v_wht, grand_total = v_grand,
      amount_due = v_grand - v_wht, updated_at = now()
    WHERE id = p_id;
  END IF;

  -- ตรวจลูกค้าปนทุกครั้ง (เปลี่ยนลูกค้าหลักอย่างเดียวก็ทำให้ระดับเปลี่ยนได้)
  v_mix := public.erp_playground_billing_note_apply_mix(p_id, p_header->>'mix_reason', COALESCE((p_header->>'mix_ack')::boolean, false));

  INSERT INTO public.audit_logs (action, entity_type, entity_id, metadata)
  VALUES ('update','erp_playground_billing_note', p_id,
    jsonb_build_object('actor', p_actor)
      || CASE WHEN v_mix->>'mix_level' IS NOT NULL OR v_prev_mix IS NOT NULL
              THEN v_mix || jsonb_build_object('mix_level_before', v_prev_mix) ELSE '{}'::jsonb END);
  RETURN p_id;
END; $function$;
