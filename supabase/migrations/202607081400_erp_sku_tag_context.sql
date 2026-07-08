-- เฟส 3: context ของประเภท (แท็ก) สำหรับ Wizard เพิ่ม SKU
-- คืน หน้ากว้างที่ใช้บ่อย + ผู้ขายที่ใช้บ่อย (จาก SKU ที่ผูกแท็กนั้น) — aggregate ใน DB กัน .in() id เป็นพัน
CREATE OR REPLACE FUNCTION erp_sku_tag_context(p_tag uuid)
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'fabric_widths', (
      SELECT coalesce(jsonb_agg(w ORDER BY cnt DESC), '[]'::jsonb) FROM (
        SELECT s.fabric_width_cm AS w, count(*) AS cnt
        FROM skus_v2_product_family_m2m m
        JOIN skus_v2 s ON s.id = m.src_id
        WHERE m.tgt_id = p_tag AND s.fabric_width_cm IS NOT NULL
        GROUP BY s.fabric_width_cm ORDER BY cnt DESC LIMIT 8
      ) q
    ),
    'sellers', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('id', sid, 'name', sname, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb) FROM (
        SELECT s.seller_partner_id AS sid, p.name_th AS sname, count(*) AS cnt
        FROM skus_v2_product_family_m2m m
        JOIN skus_v2 s ON s.id = m.src_id
        LEFT JOIN partners_v2 p ON p.id = s.seller_partner_id
        WHERE m.tgt_id = p_tag AND s.seller_partner_id IS NOT NULL
        GROUP BY s.seller_partner_id, p.name_th ORDER BY cnt DESC LIMIT 8
      ) q
    )
  );
$$;
