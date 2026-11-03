-- ใบวางบิล: เลือกใบกำกับหลายลูกค้าทีเดียว → ออกหลายใบแยกตามลูกค้า (เจ้าของสั่ง 2026-11-03 "ทำเป็นแบบเลือกหลายบิลได้ทีเดียว แต่เวลาออกบิล ให้แยกตามบริษัท")
--   1) ถอดแบบ "รวมคนละลูกค้าในใบเดียว" (202611120100) — 1 ใบวางบิล = 1 ลูกค้า เหมือนเดิม
--      create/update กลับเป็นเวอร์ชันก่อน 202611120100 (ปฏิเสธ SO คนละลูกค้ากับหัวบิล)
--   2) erp_playground_billing_note_create_batch(p_groups, p_actor) — สร้างหลายใบใน transaction เดียว
--      ใบไหนไม่ผ่าน (ถูกวางบิลแล้ว / ยังเป็นร่าง / คนละลูกค้า) = ไม่สร้างเลยทั้งชุด · เลขที่รันต่อกันตามลำดับกลุ่ม
--      การจัดกลุ่ม (ลูกค้า × บริษัทผู้ขาย) ทำที่ API /api/billing-notes/batch · ทุกใบมี audit 'create' ของตัวเอง (จาก create)
--   คอลัมน์ mix_level/mix_reason + ฟังก์ชัน apply_mix/party_label ลบใน 202611120300 (หลังแยกใบ 20261102 ที่รวมไว้)

CREATE OR REPLACE FUNCTION public.erp_playground_billing_note_create(p_header jsonb, p_so_ids uuid[], p_actor text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid; v_billno text; v_soid uuid; v_so record; v_cust uuid; v_idx int := 0;
  v_sub numeric := 0; v_vat numeric := 0; v_wht numeric := 0; v_grand numeric := 0;
  v_due date;
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
    IF v_cust IS NOT NULL AND v_so.customer_id IS NOT NULL AND v_so.customer_id <> v_cust THEN
      RAISE EXCEPTION 'SO % เป็นคนละลูกค้ากับใบวางบิล', COALESCE(v_so.so_number, v_soid::text);
    END IF;
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

  INSERT INTO public.audit_logs (action, entity_type, entity_id, metadata)
  VALUES ('create','erp_playground_billing_note', v_id,
    jsonb_build_object('actor', p_actor, 'bill_number', v_billno, 'so_count', array_length(p_so_ids,1)));
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
BEGIN
  IF NOT erp_can('so.edit') THEN RAISE EXCEPTION 'ไม่มีสิทธิ์ (so.edit)'; END IF;
  SELECT status INTO v_status FROM public.erp_playground_billing_notes WHERE id = p_id;
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
      IF v_cust IS NOT NULL AND v_so.customer_id IS NOT NULL AND v_so.customer_id <> v_cust THEN
        RAISE EXCEPTION 'SO % เป็นคนละลูกค้ากับใบวางบิล', COALESCE(v_so.so_number, v_soid::text);
      END IF;
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

  INSERT INTO public.audit_logs (action, entity_type, entity_id, metadata)
  VALUES ('update','erp_playground_billing_note', p_id, jsonb_build_object('actor', p_actor));
  RETURN p_id;
END; $function$;

-- สร้างหลายใบทีเดียว: p_groups = [{ header: {...}, so_ids: [uuid,...] }, ...] (1 กลุ่ม = 1 ใบ = 1 ลูกค้า)
CREATE OR REPLACE FUNCTION public.erp_playground_billing_note_create_batch(p_groups jsonb, p_actor text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  g jsonb; v_ids uuid[]; v_id uuid; v_out jsonb := '[]'::jsonb;
BEGIN
  IF NOT erp_can('so.create') THEN RAISE EXCEPTION 'ไม่มีสิทธิ์'; END IF;
  IF p_groups IS NULL OR jsonb_typeof(p_groups) <> 'array' OR jsonb_array_length(p_groups) = 0 THEN
    RAISE EXCEPTION 'ต้องเลือกใบกำกับภาษีอย่างน้อย 1 ใบ';
  END IF;
  IF jsonb_array_length(p_groups) > 100 THEN RAISE EXCEPTION 'สร้างได้ครั้งละไม่เกิน 100 ใบ'; END IF;

  FOR g IN SELECT value FROM jsonb_array_elements(p_groups) LOOP
    SELECT array_agg(x::uuid) INTO v_ids FROM jsonb_array_elements_text(g->'so_ids') x;
    IF NULLIF(g->'header'->>'customer_id', '') IS NULL THEN RAISE EXCEPTION 'ทุกใบวางบิลต้องมีลูกค้า'; END IF;
    v_id := public.erp_playground_billing_note_create(g->'header', v_ids, p_actor);
    v_out := v_out || (SELECT jsonb_build_object('id', b.id, 'bill_number', b.bill_number, 'customer_name', b.customer_name,
                         'grand_total', b.grand_total, 'so_count', array_length(v_ids, 1))
                         FROM public.erp_playground_billing_notes b WHERE b.id = v_id);
  END LOOP;
  RETURN v_out;
END; $function$;

REVOKE ALL ON FUNCTION public.erp_playground_billing_note_create_batch(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_playground_billing_note_create_batch(jsonb, text) TO authenticated, service_role;
