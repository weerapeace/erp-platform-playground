-- ⭐ กฎแกลเลอรี ↔ รูปปก รอบ 2 (2026-10-22)
-- (1) ลบรูปสุดท้ายในแกลเลอรี (ที่เป็นรูปปกอยู่) → ล้างรูปปกตาม
--     เดิม: ก๊อป SKU แล้วลบรูปที่ติดมา → การ์ดยังโชว์รูปของสินค้าต้นแบบ (BEL00072, ZIP-M-NO.5#G202#N)
-- (2) เปลี่ยนรูปปกตรง ๆ (ช่องรูปปก / งานส่งรูป / ใบออกแบบ) → ⭐ ย้ายไปที่รูปในแกลเลอรีที่ตรงกับปก
--     ปกมาจากนอกแกลเลอรี หรือถูกล้าง → ไม่มี ⭐ (ไม่ยัดรูปปกเข้าแกลเลอรี — งานเปลี่ยนปกตั้งใจแยกไว้
--     เพราะแกลเลอรีไปโผล่หน้าเว็บร้าน · lib/subtask-sync "ไม่ยัดเข้าแกลเลอรี")
--     ⭐ = "รูปในแกลเลอรีที่เป็นปกอยู่" เสมอ → ลบรูปในแกลเลอรีจะไม่ไปทับปกที่ตั้งจากข้างนอก
-- แกลเลอรีว่าง + ตั้งปก → ใส่ปกเป็นรูปแรกเหมือนเดิม (กฎ 2026-07-19)
-- กันวนซ้ำ: trg_sync_cover_from_primary อัปเดตปกเฉพาะเมื่อค่าเปลี่ยน (IS DISTINCT FROM)
-- รันกับ DB แล้ว 2026-10-22 (version 20261022023326) · เทสต์ในธุรกรรมที่ย้อนทิ้งผ่าน 10/10 ก่อนรันจริง
-- ต่อจาก 202610291200_gallery_promote_next_primary_on_delete.sql

create or replace function public.erp_promote_next_primary_attachment()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_next uuid;
begin
  if exists (select 1 from erp_playground_attachments
              where entity_type = old.entity_type and entity_id = old.entity_id and is_primary) then
    return null;
  end if;
  select id into v_next from erp_playground_attachments
   where entity_type = old.entity_type and entity_id = old.entity_id
   order by (coalesce(content_type, 'image/') not like 'image/%'), sort_order nulls last, created_at, id
   limit 1;
  if v_next is not null then
    update erp_playground_attachments set is_primary = true where id = v_next;
  -- ไม่เหลือรูปแล้ว → ล้างปก (เฉพาะเมื่อปกคือรูปที่เพิ่งลบ)
  elsif old.entity_type = 'skus_v2' then
    update skus_v2 set cover_image_r2_key = null
     where id = old.entity_id and cover_image_r2_key = old.file_path;
  elsif old.entity_type = 'parent_skus_v2' then
    update parent_skus_v2 set cover_image_r2_key = null
     where id = old.entity_id and cover_image_r2_key = old.file_path;
  end if;
  return null;
end;
$$;

create or replace function public.erp_sync_gallery_from_cover()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_match uuid;
begin
  if tg_op = 'UPDATE' and new.cover_image_r2_key is not distinct from old.cover_image_r2_key then
    return new;
  end if;
  if coalesce(new.cover_image_r2_key, '') <> '' and not exists (
       select 1 from erp_playground_attachments a
        where a.entity_type = tg_argv[0] and a.entity_id = new.id) then
    insert into erp_playground_attachments
      (entity_type, entity_id, file_name, file_path, public_url, content_type, is_primary, sort_order, uploaded_by)
    values
      (tg_argv[0], new.id, 'รูปปก', new.cover_image_r2_key,
       '/api/r2-image?key=' || replace(new.cover_image_r2_key, '/', '%2F'),
       'image/jpeg', true, 0, 'auto-cover-gallery');
    return new;
  end if;
  select id into v_match from erp_playground_attachments
   where entity_type = tg_argv[0] and entity_id = new.id and file_path = new.cover_image_r2_key
   order by is_primary desc, sort_order nulls last, created_at, id
   limit 1;
  update erp_playground_attachments set is_primary = (id is not distinct from v_match)
   where entity_type = tg_argv[0] and entity_id = new.id
     and is_primary is distinct from (id is not distinct from v_match);
  return new;
end;
$$;

revoke execute on function public.erp_promote_next_primary_attachment() from public, anon, authenticated;
revoke execute on function public.erp_sync_gallery_from_cover() from public, anon, authenticated;
