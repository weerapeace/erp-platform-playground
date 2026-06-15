-- ⑤a เทมเพลตคอนเทนต์ — คอนเทนต์ที่ตั้งเป็นแม่แบบ (is_template) แยกจากคอนเทนต์ปกติ
alter table erp_creative_content add column if not exists is_template boolean not null default false;
create index if not exists idx_creative_content_template on erp_creative_content(is_template);
