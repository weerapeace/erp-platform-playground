-- 📐 ขนาดของ "ต่อตัวเลือกขนาด" ของรายการใส่อะไรได้ (product_fit_items)
--   เหตุผล: 1 รายการมีหลายขนาดให้เลือก (สมาร์ทโฟน ถึง 6.1 / 6.7 / 6.9 นิ้ว · แล็ปท็อป 13–16 นิ้ว) ยาวไม่เท่ากัน
--           เดิมเก็บได้ขนาดเดียว (width/height/depth_cm) → ตอนเลือกขนาดใหญ่ ระบบเตือน "ไม่พอ" ไม่ได้
--   รูปแบบ: { "ถึง 6.1 นิ้ว": { "w": 7.2, "h": 14.8, "d": 0.8 }, ... } (ซม.) · ไม่มี/ไม่มีขนาดนั้น = ใช้ width/height/depth_cm เดิม
--   ใช้ที่: ป๊อปแทรกรายละเอียด แท็บ 🎒 ใส่อะไรได้ (components/detail-insert · lib/product-fits sizeDimsFor)
alter table public.product_fit_items add column if not exists size_dims jsonb;

comment on column public.product_fit_items.size_dims is
  'ขนาดของ (ซม.) ต่อตัวเลือกขนาด {"<ขนาด>": {"w":..,"h":..,"d":..}} — ไม่มี = ใช้ width/height/depth_cm';
