-- 🧱 หน้าของแต่ละชุดมาใหม่ (/new/<ชุด>) จัดเองด้วยตัวจัดหน้า 3 แผง (เหมือนแท็บ "หน้าเว็บ")
-- layout       = Section ที่เผยแพร่แล้ว (null = ยังไม่จัด → เว็บใช้หน้าตาเดิม: แบนเนอร์ชุด + สินค้า / นับถอยหลัง)
-- draft_layout = ร่างที่บันทึกอัตโนมัติ (null = ไม่มีร่างค้าง) — พรีวิว (?preview=1) เห็นร่าง
-- เพิ่มคอลัมน์อย่างเดียว ไม่แตะข้อมูลเดิม · จัดการผ่าน /api/website/new-drops/page (สิทธิ์ products.edit · audit)

alter table public.store_new_drops add column if not exists layout jsonb;
alter table public.store_new_drops add column if not exists draft_layout jsonb;

comment on column public.store_new_drops.layout is '🧱 Section ของหน้า /new/<ชุด> ที่เผยแพร่แล้ว (null = หน้าตาเดิม)';
comment on column public.store_new_drops.draft_layout is '🧱 ร่าง Section ของหน้า /new/<ชุด> (null = ไม่มีร่าง)';
