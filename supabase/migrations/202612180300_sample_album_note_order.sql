-- SAMPLE Images (เจ้าของอนุมัติ 2026-11-16 "เพิ่มได้"): โน้ตอัลบั้ม · ชื่อที่โชว์ของอัลบั้มของวัน · ลำดับรูปที่จัดเอง
-- เพิ่มช่องว่างอย่างเดียว ไม่แตะข้อมูลเดิม · ย้อนกลับ = drop column 3 ช่องนี้
--   asset_collections.note          โน้ตของอัลบั้ม (โชว์ในหน้าอัลบั้ม + ไอคอนบนการ์ด)
--   asset_collections.display_name  ชื่อที่โชว์ของอัลบั้มของวัน (ชื่อจริง "SAMPLE <แบรนด์> <วันที่>" ยังเก็บไว้ ใช้หาอัลบั้มของวันนี้ตอนลงรูป)
--   asset_collection_map.sort_order ลำดับรูปในอัลบั้มแบบ "จัดเอง" (null = ยังไม่จัด → ตามลำดับที่ลง)
--   ลำดับอัลบั้มย่อยใช้ asset_collections.sort_order ที่มีอยู่แล้ว
alter table public.asset_collections add column if not exists note text;
alter table public.asset_collections add column if not exists display_name text;
alter table public.asset_collection_map add column if not exists sort_order integer;
