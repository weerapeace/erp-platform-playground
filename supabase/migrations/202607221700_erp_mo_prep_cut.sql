-- ความคืบหน้า เตรียม/ตัด ต่อใบสั่งผลิต (aggregate ที่ DB — คืน jsonb { mo_no: {pd,pt,cd,ct} })
-- ใช้ในแดชบอร์ดผลิตคำนวณสถานะ 9 ขั้นบนการ์ด (เรียกครั้งเดียวต่อโหลด)
CREATE OR REPLACE FUNCTION public.erp_mo_prep_cut(p_mo_nos text[])
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_object_agg(mo_no, jsonb_build_object('pd',prep_done,'pt',prep_total,'cd',cut_done,'ct',cut_total)), '{}'::jsonb)
  from (
    select mo_no,
      count(*)::int prep_total,
      count(*) filter (where is_ready)::int prep_done,
      count(*) filter (where cut_block_code is not null)::int cut_total,
      count(*) filter (where cut_block_code is not null and cut_done)::int cut_done
    from mo_materials
    where coalesce(is_active,true) and mo_no = any(p_mo_nos)
    group by mo_no
  ) t;
$function$;

revoke execute on function public.erp_mo_prep_cut(text[]) from public, anon;
grant execute on function public.erp_mo_prep_cut(text[]) to service_role;
