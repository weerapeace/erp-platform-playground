-- เพิ่ม "รหัสนำหน้า SKU" ต่อแท็ก/ประเภท (เช่น ซาเฟียโน่ = 'LEA-SAF-')
-- Wizard เพิ่ม SKU ใช้ prefix นี้หาเลขล่าสุด → เสนอเลขถัดไป
-- รันแล้วบน Supabase ผ่าน MCP apply_migration (product_families_code_prefix) 2026-06-11
alter table product_families add column if not exists code_prefix text;

-- เดา prefix จาก SKU เดิมที่ผูกแท็กนั้น (prefix = ส่วนหน้าตัวเลขท้ายสุด เช่น LEA-SAF-027 -> 'LEA-SAF-')
-- เซ็ตให้เฉพาะแท็กที่มี prefix เด่นชัด (>=3 ตัว และครอบ >=60% ของ SKU ในแท็ก) · admin มาตรวจ/แก้ได้
with sku_prefix as (
  select m.tgt_id as tag_id,
         regexp_replace(s.code, '\d+$', '') as prefix,
         count(*) as n
  from skus_v2_product_family_m2m m
  join skus_v2 s on s.id = m.src_id
  where s.code ~ '\d+$' and length(regexp_replace(s.code, '\d+$', '')) >= 2
  group by m.tgt_id, regexp_replace(s.code, '\d+$', '')
),
ranked as (
  select tag_id, prefix, n,
         row_number() over (partition by tag_id order by n desc) as rn,
         sum(n) over (partition by tag_id) as total
  from sku_prefix
)
update product_families pf
set code_prefix = r.prefix
from ranked r
where pf.id = r.tag_id
  and r.rn = 1
  and r.n >= 3
  and r.n::numeric / nullif(r.total,0) >= 0.6
  and pf.code_prefix is null;
