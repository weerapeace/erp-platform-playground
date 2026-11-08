-- นับไฟล์ที่ยังใช้งานต่อแท็ก / ต่ออัลบั้ม ในคำถามเดียว (คลังไฟล์กลาง: แถบซ้าย + ตัวกรองแท็ก)
--
-- เดิม: /api/assets/tags + /api/assets/collections ยิง count ทีละกลุ่ม (แท็ก 35 + อัลบั้ม 11 = 46 คำขอพร้อมกันต่อการเปิดหน้า)
--   แต่ละคำขอ join ตาราง assets (34 MB) → ช่วงฐานข้อมูลหนัก (เช่น 1-3 นาทีหลัง deploy) ทุกคำขอช้า 2-10 วิ หน้าค้าง "กำลังโหลด..."
-- ใหม่: นับจากตารางจับคู่ (เล็ก) ทั้งก้อน แล้วหักไฟล์ที่ไม่ใช้งาน (ถังขยะ ~50 ไฟล์) ผ่าน partial index → ไม่ต้องอ่านตาราง assets ทั้งตาราง
-- อ่านอย่างเดียว · security invoker · เรียกได้เฉพาะ service_role (API ผ่าน guardApi + supabaseAdmin)

-- ไฟล์ที่ไม่ใช้งาน (ถังขยะ) มีน้อยมาก → index เล็ก ๆ ไว้หา id
create index if not exists idx_assets_not_active on public.assets (id) where status <> 'active';

create or replace function public.erp_asset_group_counts(p_kind text)
returns table (group_id uuid, n bigint)
language sql
stable
set search_path = public
as $$
  with gone as (select a.id from public.assets a where a.status <> 'active')
  select m.tag_id, (count(*) - count(g.id))::bigint
    from public.asset_tag_map m left join gone g on g.id = m.asset_id
   where p_kind = 'tag'
   group by m.tag_id
  union all
  select m.collection_id, (count(*) - count(g.id))::bigint
    from public.asset_collection_map m left join gone g on g.id = m.asset_id
   where p_kind = 'collection'
   group by m.collection_id
$$;

revoke execute on function public.erp_asset_group_counts(text) from public, anon, authenticated;
grant execute on function public.erp_asset_group_counts(text) to service_role;
