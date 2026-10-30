-- 🗑 สิทธิ์ใหม่ "ลบรูปสินค้า" (products.images.delete) — ลบรูปในแกลเลอรี Parent SKU / SKU
-- เจ้าของขอ 2026-10-30: พนักงานลบรูปสินค้าได้ แต่ "ไม่" ให้ลบไฟล์แนบในเอกสารอื่น (PO ฯลฯ ยังใช้ attachments.delete)
-- กฎฝั่งหน้าเว็บตรงกันที่ lib/attachment-delete-perm · รูปแกลเลอรีที่ลบเก็บเป็นเวอร์ชัน ย้อนคืนได้ที่ 🕘

insert into public.erp_permissions (key, label, category, description, is_dangerous, sort_order)
values ('products.images.delete', 'ลบรูปสินค้า', 'products',
        'ลบรูปในแกลเลอรี Parent SKU / SKU (ย้อนคืนได้ที่ 🕘) · ไฟล์แนบในเอกสารอื่นยังต้องใช้สิทธิ์ "ลบไฟล์"', false, 35)
on conflict (key) do nothing;

-- ด่านลบไฟล์แนบ: ไฟล์ทั่วไป = attachments.delete · รูปแกลเลอรีสินค้า = attachments.delete หรือ products.images.delete
create or replace function public.erp_playground_attachments_delete(p_id uuid, p_actor text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_row public.erp_playground_attachments;
begin
  select * into v_row from public.erp_playground_attachments where id = p_id;
  if not found then
    if not erp_can('attachments.delete') then raise exception 'ไม่มีสิทธิ์ลบไฟล์ (attachments.delete)'; end if;
    raise exception 'ไม่พบไฟล์';
  end if;
  if not (erp_can('attachments.delete')
          or (v_row.entity_type in ('parent_skus_v2', 'skus_v2') and erp_can('products.images.delete'))) then
    if v_row.entity_type in ('parent_skus_v2', 'skus_v2') then raise exception 'ไม่มีสิทธิ์ลบรูปสินค้า (products.images.delete)'; end if;
    raise exception 'ไม่มีสิทธิ์ลบไฟล์ (attachments.delete)';
  end if;
  delete from public.erp_playground_attachments where id = p_id;
  insert into public.audit_logs (action, entity_type, entity_id, metadata)
  values ('detach', v_row.entity_type, v_row.entity_id,
    jsonb_build_object('file_name', v_row.file_name, 'actor', p_actor));
  return jsonb_build_object('file_path', v_row.file_path);
end;
$function$;

-- ติ๊กให้ตำแหน่ง พนักงาน + ผู้จัดการ (ตามที่เจ้าของเลือก) + ประวัติแบบเดียวกับ erp_role_permission_toggle
insert into public.erp_role_permissions (role_key, permission_key)
select r.key, 'products.images.delete' from public.erp_roles r
where r.key in ('staff', 'manager')
  and not exists (select 1 from public.erp_role_permissions x where x.role_key = r.key and x.permission_key = 'products.images.delete');

insert into public.audit_logs (action, entity_type, entity_id, metadata)
select 'grant', 'erp_role_permission', null,
  jsonb_build_object('role', r.key, 'role_label', r.label, 'permission', 'products.images.delete',
                     'perm_label', 'ลบรูปสินค้า', 'actor', 'Claude (ตามคำสั่งเจ้าของ)')
from public.erp_roles r where r.key in ('staff', 'manager');
