-- ใบวางบิล: วางบิลจากใบสั่งขาย "ร่าง" ได้ (เจ้าของเลือก 2026-11-03 "วางบิลจากร่างได้")
--   เดิม create/update รับเฉพาะ confirmed ขึ้นไป แต่ตัวเลือกใบกำกับโชว์ใบร่างอยู่แล้ว (c6429465 "ธุรกิจนี้ออกบิลจาก SO ร่างได้") → กดแล้วติด error
--   ตอนนี้: วางบิลได้ทุกสถานะ ยกเว้น "ยกเลิก" · ใบร่างทุกใบมีเลขใบกำกับแล้ว (68 ใบ ณ วันนี้)
--   ข้อควรรู้: ยอดในใบวางบิลคัดลอกตอนสร้าง — ถ้าแก้ยอดใบสั่งขายทีหลัง ต้องแก้ใบวางบิล (กดแก้ไข → บันทึก) ให้ดึงยอดใหม่
--   ลบใบร่างที่อยู่ในใบวางบิลไม่ได้อยู่แล้ว (lib/sales-doc-delete ตรวจการอ้างถึง)

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
    IF v_so.status = 'cancelled' THEN   -- วางบิลได้ทุกสถานะยกเว้นยกเลิก (รวมใบร่าง)
      RAISE EXCEPTION 'SO % ถูกยกเลิกแล้ว วางบิลไม่ได้', COALESCE(v_so.so_number, v_soid::text);
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
      IF v_so.status = 'cancelled' THEN   -- วางบิลได้ทุกสถานะยกเว้นยกเลิก (รวมใบร่าง)
        RAISE EXCEPTION 'SO % ถูกยกเลิกแล้ว วางบิลไม่ได้', COALESCE(v_so.so_number, v_soid::text);
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
