-- ลิงก์อ้างอิงของบรีฟคอนเทนต์ (เช่น คลิป TikTok / พิน Pinterest ที่อยากให้ทำตาม)
-- คู่กับ ref_image_keys (รูปอ้างอิง) — ป๊อปโพสต์ฝั่งซ้าย "รายการงานที่ต้องการ" ใส่ Ref ได้ทั้งรูปและลิงก์
-- รูปแบบ: [{"url":"https://...","label":"..."}]
alter table public.erp_creative_content
  add column if not exists ref_links jsonb not null default '[]'::jsonb;

comment on column public.erp_creative_content.ref_links is 'ลิงก์อ้างอิงของบรีฟ [{url,label?}] (คู่กับ ref_image_keys)';
