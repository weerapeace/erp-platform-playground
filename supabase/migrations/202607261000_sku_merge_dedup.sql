-- ============================================================
-- จัดการ SKU ซ้ำ (รวม/ยุบ) — RPC ฝั่ง DB (transaction เดียว all-or-nothing)
--   erp_merge_skus_preview(primary, dup) → นับความเชื่อมโยงของตัวซ้ำ (อ่านอย่างเดียว)
--   erp_merge_skus_v2(primary, dup)      → โอนทุกอย่างมาตัวหลัก + ยุบตัวซ้ำเข้าถังขยะ (is_active=false)
--
-- หลักความปลอดภัย: re-point ด้วย uuid = แตะเฉพาะแถวที่ id ตรงตัวซ้ำเป๊ะ (uuid unique ทั้งระบบ)
--   → ถ้าคอลัมน์ชี้คนละ id-space ก็ไม่มีแถวตรง = ไม่กระทบ
--   ส่วนโค้ด text (BOM/MO) verify แล้วว่าใช้โค้ด skus_v2 · เขียนทับเฉพาะเมื่อโค้ดไม่ว่าง
--   เรียกได้เฉพาะ service_role (ผ่าน API) — ปิด anon/authenticated กันช่องโหว่ DEFINER
-- ============================================================

-- ---------- PREVIEW (อ่านอย่างเดียว) ----------
create or replace function public.erp_merge_skus_preview(p_primary uuid, p_dup uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with c as (select code from skus_v2 where id = p_dup)
  select jsonb_build_object(
    'images',           (select count(*) from asset_usages where module = 'product_sku' and record_id = p_dup::text),
    'tags',             (select count(*) from skus_v2_product_family_m2m where src_id = p_dup),
    'supplier_items',   (select count(*) from supplier_items where item_sku_id = p_dup),
    'supplier_history', (select count(*) from supplier_price_history where item_sku_id = p_dup),
    'favorites',        (select count(*) from sku_favorites where sku_id = p_dup),
    'stock_movements',  (select count(*) from sku_stock_movements where sku_id = p_dup),
    'stock_qty',        (select coalesce(qty_on_hand, 0) from sku_stock_balances where sku_id = p_dup),
    'attribute_values', (select count(*) from product_sku_attribute_values where product_sku_id = p_dup),
    'creative',         (select count(*) from erp_creative_board_items where sku_id = p_dup)
                      + (select count(*) from erp_creative_content     where sku_id = p_dup)
                      + (select count(*) from erp_creative_tasks       where sku_id = p_dup)
                      + (select count(*) from erp_creative_project_skus where sku_id = p_dup)
                      + (select count(*) from erp_creative_task_skus    where sku_id = p_dup),
    'purchase',         (select count(*) from purchase_requests_v2 where used_for_sku_id = p_dup or item_sku_id = p_dup)
                      + (select count(*) from purchase_order_lines_v2 where item_sku_id = p_dup)
                      + (select count(*) from goods_receipt_lines_v2  where item_sku_id = p_dup),
    'sales',            (select count(*) from offer_sheet_items   where sku_id = p_dup)
                      + (select count(*) from store_order_items    where sku_id = p_dup)
                      + (select count(*) from platform_order_items where matched_sku_id = p_dup)
                      + (select count(*) from carton_labels        where sku_id = p_dup),
    'bom_lines',        (select count(*) from bom_lines   where component_sku = (select code from c) and (select code from c) <> ''),
    'bom_headers',      (select count(*) from bom_headers where product_sku   = (select code from c) and (select code from c) <> ''),
    'mo',               (select count(*) from manufacturing_orders where product_sku = (select code from c) and (select code from c) <> '')
                      + (select count(*) from mo_materials    where component_sku = (select code from c) and (select code from c) <> '')
                      + (select count(*) from mo_work_orders  where product_sku   = (select code from c) and (select code from c) <> '')
  );
$$;

-- ---------- MERGE (แก้ข้อมูล · transaction เดียว) ----------
create or replace function public.erp_merge_skus_v2(p_primary uuid, p_dup uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_pcode text; v_dcode text; v jsonb := '{}'::jsonb; n int;
begin
  if p_primary is null or p_dup is null or p_primary = p_dup then
    raise exception 'ต้องเลือก SKU หลักและ SKU ซ้ำที่ต่างกัน';
  end if;
  select code into v_pcode from skus_v2 where id = p_primary;
  if not found then raise exception 'ไม่พบ SKU หลัก'; end if;
  select code into v_dcode from skus_v2 where id = p_dup;
  if not found then raise exception 'ไม่พบ SKU ซ้ำ'; end if;

  -- รูปภาพ (asset_usages · module=product_sku · record_id เป็น text)
  update asset_usages set record_id = p_primary::text where module = 'product_sku' and record_id = p_dup::text;
  get diagnostics n = row_count; v := v || jsonb_build_object('images', n);

  -- แท็ก/หมวด m2m — กันชน (src_id,tgt_id)
  delete from skus_v2_product_family_m2m d
    where d.src_id = p_dup and exists (select 1 from skus_v2_product_family_m2m p where p.src_id = p_primary and p.tgt_id = d.tgt_id);
  update skus_v2_product_family_m2m set src_id = p_primary where src_id = p_dup;
  get diagnostics n = row_count; v := v || jsonb_build_object('tags', n);

  -- ราคาต่อร้าน — 1 ร้าน/SKU + 1 default/SKU
  update supplier_items set is_default = false
    where item_sku_id = p_dup and is_default and exists (select 1 from supplier_items p where p.item_sku_id = p_primary and p.is_default);
  delete from supplier_items d
    where d.item_sku_id = p_dup and d.supplier_partner_id is not null
      and exists (select 1 from supplier_items p where p.item_sku_id = p_primary and p.supplier_partner_id = d.supplier_partner_id);
  update supplier_items set item_sku_id = p_primary where item_sku_id = p_dup;
  get diagnostics n = row_count; v := v || jsonb_build_object('supplier_items', n);
  update supplier_price_history set item_sku_id = p_primary where item_sku_id = p_dup;

  -- รายการโปรด (PK sku_id)
  delete from sku_favorites where sku_id = p_dup and exists (select 1 from sku_favorites where sku_id = p_primary);
  update sku_favorites set sku_id = p_primary where sku_id = p_dup;

  -- สต๊อก — บวกยอดเข้า primary แล้วลบแถวตัวซ้ำ
  insert into sku_stock_balances (sku_id, qty_on_hand, updated_at)
    select p_primary, qty_on_hand, now() from sku_stock_balances where sku_id = p_dup
    on conflict (sku_id) do update set qty_on_hand = sku_stock_balances.qty_on_hand + excluded.qty_on_hand, updated_at = now();
  delete from sku_stock_balances where sku_id = p_dup;
  update sku_stock_movements set sku_id = p_primary, sku_code = v_pcode where sku_id = p_dup;
  get diagnostics n = row_count; v := v || jsonb_build_object('stock_movements', n);

  -- คุณสมบัติ — unique(product_sku_id, definition_id)
  delete from product_sku_attribute_values d
    where d.product_sku_id = p_dup and exists (select 1 from product_sku_attribute_values p where p.product_sku_id = p_primary and p.definition_id = d.definition_id);
  update product_sku_attribute_values set product_sku_id = p_primary where product_sku_id = p_dup;

  -- งานครีเอทีฟ — m2m ที่ PK มี sku_id ต้องกันชนก่อน
  delete from erp_creative_project_skus d where d.sku_id = p_dup and exists (select 1 from erp_creative_project_skus p where p.project_id = d.project_id and p.sku_id = p_primary);
  update erp_creative_project_skus set sku_id = p_primary where sku_id = p_dup;
  delete from erp_creative_task_skus d where d.sku_id = p_dup and exists (select 1 from erp_creative_task_skus p where p.task_id = d.task_id and p.sku_id = p_primary);
  update erp_creative_task_skus set sku_id = p_primary where sku_id = p_dup;
  update erp_creative_board_items set sku_id = p_primary where sku_id = p_dup;
  update erp_creative_content     set sku_id = p_primary where sku_id = p_dup;
  update erp_creative_tasks        set sku_id = p_primary where sku_id = p_dup;

  -- จัดซื้อ / รับของ
  update purchase_requests_v2   set used_for_sku_id = p_primary where used_for_sku_id = p_dup;
  update purchase_requests_v2   set item_sku_id = p_primary where item_sku_id = p_dup;
  update purchase_order_lines_v2 set item_sku_id = p_primary where item_sku_id = p_dup;
  update goods_receipt_lines_v2  set item_sku_id = p_primary where item_sku_id = p_dup;

  -- ขาย / ป้ายกล่อง / มาร์เก็ตเพลส (อัปเดต id + โค้ด denormalized)
  update carton_labels        set sku_id = p_primary where sku_id = p_dup;
  update offer_sheet_items    set sku_id = p_primary, sku_code = v_pcode where sku_id = p_dup;
  update store_order_items    set sku_id = p_primary, sku_code = v_pcode where sku_id = p_dup;
  update platform_order_items set matched_sku_id = p_primary, sku_code = v_pcode where matched_sku_id = p_dup;

  -- ===== code-based: BOM / MO (เขียนโค้ดของตัวซ้ำ → โค้ดตัวหลัก) =====
  if coalesce(v_dcode, '') <> '' and coalesce(v_pcode, '') <> '' and v_dcode <> v_pcode then
    update bom_lines   set component_sku = v_pcode where component_sku = v_dcode;
    get diagnostics n = row_count; v := v || jsonb_build_object('bom_lines', n);
    update bom_headers set product_sku = v_pcode where product_sku = v_dcode;
    get diagnostics n = row_count; v := v || jsonb_build_object('bom_headers', n);
    update manufacturing_orders set product_sku = v_pcode where product_sku = v_dcode;
    update mo_materials   set component_sku = v_pcode where component_sku = v_dcode;
    update mo_work_orders set product_sku = v_pcode where product_sku = v_dcode;
  end if;

  -- ยุบตัวซ้ำเข้าถังขยะ (soft delete · กู้คืนได้)
  update skus_v2 set is_active = false where id = p_dup;

  return jsonb_build_object('ok', true, 'primary_code', v_pcode, 'dup_code', v_dcode, 'counts', v);
end;
$$;

-- ปิดการเรียกตรงจาก client (เรียกได้เฉพาะ service_role ผ่าน API)
revoke execute on function public.erp_merge_skus_preview(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.erp_merge_skus_v2(uuid, uuid)      from public, anon, authenticated;
