-- ⭐ ลบรูปหลักในแกลเลอรีทิ้ง แต่ยังมีรูปอื่นเหลือ → ยกรูปถัดไปขึ้นเป็นรูปหลักให้เอง
-- รูปปกสินค้า (skus_v2 / parent_skus_v2) ตามไปเองผ่าน trigger trg_sync_cover_from_primary เดิม
-- ปัญหาที่แก้ (2026-10-21): PIX33-05, CTL008S-01(-1,-2) รูปปกเสีย เพราะลบรูปหลักแล้วไม่มีรูปมาแทน
--   รูปปกเลยค้างชี้ไฟล์เก่าที่ถูกย้ายลงถังขยะ (ก่อนมี lib/r2-refs กันย้ายไฟล์ที่ยังใช้อยู่ 2026-07-30)
-- เป็น trigger บนตาราง (ไม่ใช่ใน API) เพราะลบรูปได้หลายทาง: /api/attachments/[id], missing-images,
--   parent delete-related, subtask-sync, design-sheets → ทุกทางได้กฎเดียวกัน
-- ลำดับเลือก: รูปก่อนไฟล์อื่น → sort_order → created_at
-- ลบทั้งแกลเลอรีในคำสั่งเดียว = AFTER ROW trigger ทำงานหลังลบครบ → ไม่มีรูปเหลือ → ไม่ทำอะไร
-- รันกับ DB แล้ว 2026-10-21 (version 20261021142053) · เทสต์ในธุรกรรมที่ย้อนทิ้งผ่าน 4/4 ก่อนรันจริง

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
  end if;
  return null;
end;
$$;

revoke execute on function public.erp_promote_next_primary_attachment() from public, anon, authenticated;

drop trigger if exists trg_promote_next_primary on public.erp_playground_attachments;
create trigger trg_promote_next_primary
after delete on public.erp_playground_attachments
for each row when (old.is_primary)
execute function public.erp_promote_next_primary_attachment();

-- ย้อนกลับ:
--   drop trigger if exists trg_promote_next_primary on public.erp_playground_attachments;
--   drop function if exists public.erp_promote_next_primary_attachment();
