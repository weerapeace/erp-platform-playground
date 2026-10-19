-- 🌿 แท็บ "Lifestyle / อื่นๆ" ในป๊อปแทรกรายละเอียด — สไตล์ (Y2K, มินิมอล …) + ข้อความของแต่ละสไตล์
--   เหตุผล: เจ้าของอยากเลือกสไตล์แล้วติ๊กข้อความไลฟ์สไตล์ (เช่น "อินสไปร์จากยุค 2000s สไตล์สาวแซ่บ")
--   เก็บในตารางรายการกลางเดิม product_highlight_items (แก้/ลบ/เรียง/ประวัติ ใช้ของกลางเดิม):
--     kind = 'style'     → สไตล์ (name / name_en)
--     kind = 'lifestyle' → ข้อความ 1 บรรทัด · parent_id = สไตล์ที่อยู่
--   ไม่กระทบของเดิม: phrase / slot ไม่มี parent_id · ช่อง "รายละเอียดเพิ่ม (ติ๊ก)" ซ่อน style/lifestyle
alter table public.product_highlight_items drop constraint if exists product_highlight_items_kind_check;
alter table public.product_highlight_items add constraint product_highlight_items_kind_check
  check (kind = any (array['phrase'::text, 'slot'::text, 'style'::text, 'lifestyle'::text]));

alter table public.product_highlight_items add column if not exists parent_id uuid references public.product_highlight_items(id) on delete set null;
create index if not exists product_highlight_items_parent_id_idx on public.product_highlight_items(parent_id);

comment on column public.product_highlight_items.parent_id is 'kind lifestyle: สไตล์ที่ข้อความนี้อยู่ (kind style)';
