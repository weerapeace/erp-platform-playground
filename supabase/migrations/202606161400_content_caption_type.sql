-- ⑤b ประเภท caption ต่อแพลตฟอร์ม (short / landing / product_links / page_links)
alter table erp_creative_content_captions add column if not exists caption_type text not null default 'short';
