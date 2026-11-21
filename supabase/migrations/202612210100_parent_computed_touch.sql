-- ช่องคำนวณของ Parent SKU (Platform Description / สรุปขนาด / ชื่อบนแพลตฟอร์ม) — ระบบเขียนค่าล่าสุดลงคอลัมน์ (lib/parent-computed-sync-server)
-- ทำไม: หน้า Parent SKU เรียงตาม "แก้ล่าสุด" (updated_at) → ถ้าระบบเติมค่าช่องคำนวณแล้ว updated_at เปลี่ยน ลำดับจะสลับทั้งหน้า (เติมย้อนหลัง ~1,500 รุ่น)
-- กติกาใหม่ของทริกเกอร์ (เฉพาะตาราง parent_skus_v2):
--   แก้ "แค่ช่องคำนวณ" (ช่องอื่นไม่เปลี่ยน) และผู้เรียกไม่ได้ตั้ง updated_at เอง → คง updated_at เดิม
--   นอกนั้น → updated_at = now() เหมือนเดิมทุกอย่าง (รวมบันทึกที่ไม่มีอะไรเปลี่ยน)
create or replace function public.parent_skus_v2_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  computed_cols text[] := array['platform_description', 'platform_description_en', 'size_summary', 'name_platform', 'name_platform_en', 'updated_at'];
begin
  if new.updated_at is not distinct from old.updated_at
     and (to_jsonb(new) - computed_cols) = (to_jsonb(old) - computed_cols)
     and (to_jsonb(new) - 'updated_at') <> (to_jsonb(old) - 'updated_at') then
    new.updated_at := old.updated_at;
  else
    new.updated_at := now();
  end if;
  return new;
end;
$$;

revoke all on function public.parent_skus_v2_touch_updated_at() from public, anon, authenticated;

drop trigger if exists parent_skus_v2_set_updated_at on public.parent_skus_v2;
create trigger parent_skus_v2_set_updated_at
  before update on public.parent_skus_v2
  for each row execute function public.parent_skus_v2_touch_updated_at();
