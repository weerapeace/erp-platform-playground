-- 👁️ ลายนิ้วมือ "หน้าตารูป" ในคลังกลาง — จับรูปเดียวกันที่เป็นคนละไฟล์ (เซฟใหม่ / ย่อคนละขนาด / รูปปก SKU จาก Odoo)
-- ใช้กับของกลาง components/duplicate-upload (ป๊อปถาม "ใช้รูปเดิม / อัปโหลดใหม่") · วิธีคิดอยู่ใน lib/image-hash.ts
-- เพิ่มคอลัมน์เท่านั้น (ว่างได้ · ไม่แตะข้อมูลเดิม) · ค่าเติมด้วยสคริปต์ครั้งเดียว + ตอนอัปโหลด + cron รายวัน

alter table public.assets add column if not exists phash text;        -- รูปทรง: dHash แนวนอน+แนวตั้ง 128 บิต (hex 32 ตัว)
alter table public.assets add column if not exists phash_color text;  -- สี: ภาพจิ๋ว 16×16 ช่อง RGB (hex 1536 ตัว)

do $$ begin
  alter table public.assets add constraint assets_phash_format check (phash is null or phash ~ '^[0-9a-f]{32}$');
exception when duplicate_object then null; end $$;
-- ⚠️ regex ของ Postgres นับซ้ำได้ไม่เกิน 255 ({1536} ใช้ไม่ได้) → เช็กความยาวแยก
do $$ begin
  alter table public.assets add constraint assets_phash_color_format check (phash_color is null or (length(phash_color) = 1536 and phash_color ~ '^[0-9a-f]+$'));
exception when duplicate_object then null; end $$;

comment on column public.assets.phash is 'ลายนิ้วมือหน้าตารูป (dHash 128 บิต hex) — คัดรูปที่รูปทรงใกล้กัน (lib/image-hash.ts)';
comment on column public.assets.phash_color is 'ภาพจิ๋ว 16x16 ช่อง RGB (hex) — เทียบสีต่อ กันรูปทรงเดียวกันแต่คนละสี';

-- สีต่างกันคร่าว ๆ จากภาพจิ๋ว 16 ช่องที่กระจายทั่วรูป (แถว/คอลัมน์ 2,6,9,13 · ผลรวมความต่าง RGB) — ใช้ "เรียงลำดับ" ผู้สมัครเท่านั้น
-- API เทียบสีเต็ม (lib/image-hash lookColorGap) อีกที · plpgsql (แบบ sql ล้วนช้า ~1ms/ครั้ง)
create or replace function public.look_color_probe(a text, b text)
returns int
language plpgsql immutable
set search_path = public
as $$
declare
  ba bytea; bb bytea; s int := 0; o int;
begin
  if a is null or b is null or length(a) <> 1536 or length(b) <> 1536 then return 99999; end if;
  ba := decode(a, 'hex'); bb := decode(b, 'hex');
  foreach o in array array[102,114,123,135,294,306,315,327,438,450,459,471,630,642,651,663] loop
    s := s + abs(get_byte(ba, o) - get_byte(bb, o)) + abs(get_byte(ba, o + 1) - get_byte(bb, o + 1)) + abs(get_byte(ba, o + 2) - get_byte(bb, o + 2));
  end loop;
  return s;
end
$$;

-- คัดรูปที่รูปทรงห่างไม่เกิน p_max_bits บิต แล้วเรียงตามสีที่ใกล้สุด (50 รูปต่อไฟล์ · พร้อมภาพจิ๋วสีให้ API เทียบต่อ)
-- idx = ลำดับ (เริ่ม 1) ใน p_hashes · p_colors เรียงตรงกัน · คลังหลักหมื่นรูป → ไล่เทียบทั้งตารางได้เร็ว (ไม่ต้องมี index)
-- ต้องเรียงตามสี: รูปสินค้าที่ถ่ายแบบเดียวกันคนละสี (ด้ายหลอด/ซิป) รูปทรงตรงกันเป๊ะได้เป็นร้อยรูป — ตัวที่สีตรงต้องติดอันดับ
-- เรียกจากเซิร์ฟเวอร์ (service role) เท่านั้น · วัดแล้ว: 1 ไฟล์ (กลุ่มด้ายหลอดที่หนักสุด) ~60ms · 20 ไฟล์ ~1.3 วิ
-- แปลงลายนิ้วมือเป็นบิตครั้งเดียวต่อแถว (materialized) · ดึงภาพจิ๋วสีเฉพาะตัวที่รูปทรงผ่าน
create or replace function public.find_look_alike_assets(p_hashes text[], p_colors text[], p_max_bits int default 10)
returns table (idx int, asset_id uuid, bits int, phash_color text)
language sql stable
set search_path = public
as $$
  with q as materialized (
    select ('x' || h)::bit(128) as hb, idx::int as idx, p_colors[idx] as col
    from unnest(p_hashes) with ordinality as u(h, idx)
    where h ~ '^[0-9a-f]{32}$' and length(coalesce(p_colors[idx], '')) = 1536
  ), a as materialized (
    select id, ('x' || phash)::bit(128) as pb from public.assets where phash is not null and status = 'active'
  ), d as (
    select q.idx, q.col, a.id as asset_id, bit_count(a.pb # q.hb)::int as bits
    from q cross join a
  ), r as (
    select d.idx, d.asset_id, d.bits, x.phash_color,
           row_number() over (partition by d.idx order by public.look_color_probe(d.col, x.phash_color), d.bits) as rn
    from d join public.assets x on x.id = d.asset_id
    where d.bits <= least(greatest(p_max_bits, 0), 32) and x.phash_color is not null
  )
  select r.idx, r.asset_id, r.bits, r.phash_color from r where r.rn <= 50 order by r.idx, r.rn
$$;

revoke execute on function public.look_color_probe(text, text) from public, anon, authenticated;
grant execute on function public.look_color_probe(text, text) to service_role;
revoke execute on function public.find_look_alike_assets(text[], text[], int) from public, anon, authenticated;
grant execute on function public.find_look_alike_assets(text[], text[], int) to service_role;
